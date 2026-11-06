import asyncio
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import json

from fastapi.testclient import TestClient
import httpx
import pytest
from starlette.websockets import WebSocketDisconnect

import app.main as api
from app.main import Area, Ingestion, app, read_replay, snapshot
from app.sptrans import OlhoVivo, normalize


def position(now, **overrides):
    """SYNTHETIC TEST FIXTURE. Never expose as runtime LIVE/REPLAY."""
    return {"p": 82361, "ta": now.isoformat(), "py": -23.55, "px": -46.63, **overrides}


def envelope(*vehicles):
    return {"l": [{"cl": 42, "c": "4103-10", "vs": list(vehicles)}]}


def area():
    return Area(name="Perímetro de teste", source="Fixture sintética",
                origin=(-46.63,-23.55),ring=[(-46.632,-23.552),(-46.628,-23.552),
                  (-46.628,-23.548),(-46.632,-23.548),(-46.632,-23.552)])


def test_source_timestamps_and_deduplication():
    now = datetime.now(timezone.utc)
    recent = now-timedelta(seconds=13)
    records = normalize(envelope(position(now-timedelta(minutes=2)),position(recent),
        position(now,p="invalid"), position(now,p=99),position(now,p=999,py=91),
        position(now+timedelta(minutes=10),p=99999)), now)
    assert len(records)==1
    assert records[0].observedAt==recent
    assert records[0].receivedAt==now
    assert records[0].vehicleId=="82361"


def test_session_cookie_and_no_token_on_positions():
    now = datetime.now(timezone.utc)
    seen = []

    def upstream(request):
        seen.append(request)
        if request.method=="POST":
            assert request.url.path=="/v2.1/Login/Autenticar"
            assert request.url.params["token"]=="synthetic-test-secret"
            return httpx.Response(200, json=True, headers={"Set-Cookie":"session=fake; Path=/; Secure"})
        assert request.headers["cookie"]=="session=fake"
        assert "token" not in request.url.params
        return httpx.Response(200,json=envelope(position(now)))

    async def request():
        provider=OlhoVivo("synthetic-test-secret",httpx.MockTransport(upstream))
        try:
            assert len(await provider.positions(99))==1
            assert len(await provider.positions(None))==1
        finally:
            await provider.close()
    asyncio.run(request())
    assert [r.url.path for r in seen]==[
        "/v2.1/Login/Autenticar","/v2.1/Posicao/Garagem","/v2.1/Posicao"]
    assert seen[1].url.params["codigoEmpresa"]=="99"


def test_session_is_renewed_on_unauthorized():
    now = datetime.now(timezone.utc)
    methods = []

    def upstream(request):
        methods.append(request.method)
        if request.method=="POST":
            return httpx.Response(200,json=True,headers={"Set-Cookie":"session=fake; Path=/; Secure"})
        if len(methods)==2:
            return httpx.Response(401)
        return httpx.Response(200,json=envelope(position(now)))

    async def request():
        provider=OlhoVivo("synthetic-test-secret",httpx.MockTransport(upstream))
        try:
            with pytest.raises(ValueError,match="sptrans_positions_unavailable"):
                await provider.positions(None)
            assert len(await provider.positions(None))==1
        finally:
            await provider.close()
    asyncio.run(request())
    assert methods==["POST","GET","POST","GET"]


@pytest.mark.parametrize("body,cookie", [
    (False, "session=fake; Path=/; Secure"),
    (True, "session=fake; Path=/v2.1/Login; Secure"),
])
def test_invalid_auth_cannot_trigger_position_request(body, cookie):
    requests = []

    def upstream(request):
        requests.append(request.method)
        return httpx.Response(200, json=body, headers={"Set-Cookie": cookie})

    async def request():
        provider = OlhoVivo("synthetic-test-secret", httpx.MockTransport(upstream))
        try:
            with pytest.raises(ValueError, match="sptrans_authentication_rejected"):
                await provider.positions(None)
            assert not provider.http.cookies
        finally:
            await provider.close()

    asyncio.run(request())
    assert requests == ["POST"]


def test_upstream_body_cap_applies_without_content_length(monkeypatch):
    class UnboundedBody(httpx.AsyncByteStream):
        async def __aiter__(self):
            for _ in range(16):
                yield b"x" * 1024

    monkeypatch.setattr("app.sptrans.MAX_POSITION_BYTES", 4096)

    def upstream(request):
        if request.method == "POST":
            return httpx.Response(200, json=True, headers={"Set-Cookie": "session=fake; Path=/; Secure"})
        assert request.headers["Accept-Encoding"] == "identity"
        return httpx.Response(200, stream=UnboundedBody())

    async def request():
        provider = OlhoVivo("synthetic-test-secret", httpx.MockTransport(upstream))
        try:
            with pytest.raises(ValueError, match="sptrans_response_too_large"):
                await provider.positions(None)
        finally:
            await provider.close()

    asyncio.run(request())


def test_provider_only_accepts_observation_timestamps_from_iso_strings():
    now = datetime.now(timezone.utc)
    records = normalize(envelope(
        position(now, p="00123"),
        position(now, p="99999", ta=int(now.timestamp())),
    ), now)
    assert [record.vehicleId for record in records] == ["00123"]


def test_api_fails_closed_without_config(monkeypatch):
    for variable in ("SPTRANS_TOKEN","PATIO_AREA_FILE","PATIO_REPLAY_FILE"):
        monkeypatch.delenv(variable,raising=False)
    with TestClient(app) as client:
        assert client.get("/health").json()=={"status":"ok"}
        live=client.get("/api/vehicles/snapshot?mode=LIVE")
        assert live.headers["Cache-Control"]=="no-store"
        assert live.headers["X-Content-Type-Options"] == "nosniff"
        assert live.headers["X-Frame-Options"] == "DENY"
        assert live.headers["Referrer-Policy"] == "no-referrer"
        assert live.json()=={"version":1,"mode":"LIVE","state":"not_configured","vehicles":[]}
        assert client.get("/api/vehicles/snapshot?mode=REPLAY").json()["state"]=="no_records"
        assert client.get("/api/vehicles/snapshot?mode=DEMO").status_code==422


def test_secret_file_is_bounded_and_overridden_by_environment(monkeypatch, tmp_path, caplog):
    secret = tmp_path / "private-secret-path"
    secret.write_text("fixture-secret\n", encoding="utf-8")
    monkeypatch.delenv("SPTRANS_TOKEN", raising=False)
    monkeypatch.setenv("SPTRANS_TOKEN_FILE", str(secret))
    assert api.provider_token_from_env() == "fixture-secret"
    secret.write_bytes(b"a" * 2049)
    assert api.provider_token_from_env() == ""
    secret.unlink()
    assert api.provider_token_from_env() == ""
    assert "private-secret-path" not in caplog.text
    assert "fixture-secret" not in caplog.text
    monkeypatch.setenv("SPTRANS_TOKEN", "environment-override")
    assert api.provider_token_from_env() == "environment-override"


def test_live_socket_is_empty_and_releases_slot_without_provider(monkeypatch):
    for variable in ("SPTRANS_TOKEN", "PATIO_AREA_FILE", "PATIO_REPLAY_FILE", "PATIO_PUBLIC_ORIGIN"):
        monkeypatch.delenv(variable, raising=False)
    monkeypatch.setattr(api, "MAX_LIVE_CLIENTS", 1)
    same = {"Origin": "http://testserver"}
    with TestClient(app) as client:
        for headers in ({}, {"Origin": "http://external.example"}):
            with pytest.raises(WebSocketDisconnect) as denied:
                with client.websocket_connect("/api/vehicles/live", headers=headers):
                    pytest.fail("unexpected access")
            assert denied.value.code == 1008

        with client.websocket_connect("/api/vehicles/live", headers=same) as socket:
            assert socket.receive_json() == {
                "version": 1, "mode": "LIVE", "state": "not_configured", "vehicles": [],
            }
            with pytest.raises(WebSocketDisconnect) as full:
                with client.websocket_connect("/api/vehicles/live", headers=same):
                    pytest.fail("connection limit bypassed")
            assert full.value.code == 1013
            socket.send_text("unexpected client payload")
            with pytest.raises(WebSocketDisconnect) as closed:
                socket.receive_json()
            assert closed.value.code == 1008

        with client.websocket_connect("/api/vehicles/live", headers=same) as socket:
            assert socket.receive_json()["state"] == "not_configured"
        assert app.state.ingestion.live_clients == 0


def test_live_socket_returns_only_authenticated_provider_evidence(monkeypatch, tmp_path):
    token = "synthetic-integration-secret"
    observed = datetime.now(timezone.utc) - timedelta(seconds=2)
    requests = []

    def upstream(request):
        requests.append(request)
        if request.method == "POST":
            assert request.url.params["token"] == token
            return httpx.Response(200, json=True, headers={"Set-Cookie": "session=fake; Path=/; Secure"})
        assert request.headers.get("cookie") == "session=fake"
        assert "token" not in request.url.params
        return httpx.Response(200, json=envelope(position(observed, p="00123"), position(observed, p="98765", py=-23.60)))

    area_file = tmp_path / "area.json"
    area_file.write_text(area().model_dump_json(), encoding="utf-8")
    monkeypatch.setenv("SPTRANS_TOKEN", token)
    monkeypatch.setenv("SPTRANS_COMPANY_ID", "7")
    monkeypatch.setenv("PATIO_AREA_FILE", str(area_file))
    monkeypatch.setenv("PATIO_PUBLIC_ORIGIN", "https://patio.example/")
    monkeypatch.delenv("PATIO_REPLAY_FILE", raising=False)
    monkeypatch.setattr(api, "OlhoVivo", lambda value: OlhoVivo(value, httpx.MockTransport(upstream)))

    with TestClient(app) as client:
        with pytest.raises(WebSocketDisconnect) as denied:
            with client.websocket_connect("/api/vehicles/live", headers={"Origin": "http://testserver"}):
                pytest.fail("deployment origin override ignored")
        assert denied.value.code == 1008
        with client.websocket_connect("/api/vehicles/live", headers={"Origin": "https://patio.example"}) as socket:
            result = socket.receive_json()
            if result["state"] == "connecting":
                result = socket.receive_json()
            assert result["state"] == "connected"
            assert result["mode"] == "LIVE"
            assert result["source"] == "sptrans_olhovivo"
            assert result["area"]["name"] == area().name
            assert [record["vehicleId"] for record in result["vehicles"]] == ["00123"]
            assert datetime.fromisoformat(result["vehicles"][0]["observedAt"]) == observed
            assert datetime.fromisoformat(result["vehicles"][0]["receivedAt"]) >= observed
            assert token not in json.dumps(result)
            async def provider_unavailable():
                app.state.ingestion.state = "unavailable"
                app.state.ingestion.publish()

            assert client.portal is not None
            client.portal.call(provider_unavailable)
            updated = socket.receive_json()
            assert updated["state"] == "unavailable"
            assert updated["vehicles"] == result["vehicles"]
    assert [request.url.path for request in requests] == ["/v2.1/Login/Autenticar", "/v2.1/Posicao/Garagem"]
    assert requests[1].url.params["codigoEmpresa"] == "7"


def test_stale_gps_is_preserved_and_marked():
    now = datetime.now(timezone.utc)
    records = normalize(envelope(position(now-timedelta(seconds=125))),now)
    result=snapshot(Ingestion(area=area(),records=records,state="connected"),"LIVE",None)
    assert result["state"]=="stale"
    assert result["vehicles"]==records
    assert area().contains(-46.63,-23.55)
    assert not area().contains(-46.64,-23.55)


def test_signed_replay_preserves_times_and_rejects_tampering(tmp_path):
    now = datetime.now(timezone.utc)
    first = now-timedelta(minutes=2)
    records = normalize(envelope(position(first),position(first+timedelta(seconds=8),p=77101)),now)
    key="test-only-key-with-at-least-32-bytes"
    content=json.dumps({"version":1,"source":"sptrans_olhovivo","area":area().model_dump(),
                         "observations":[obs.model_dump(mode="json") for obs in records]}).encode()
    file=tmp_path/"recording.json"
    file.write_bytes(content)
    file.with_suffix(".json.sig").write_text(hmac.new(key.encode(),content,hashlib.sha256).hexdigest())
    replay=read_replay(file,key)
    result=snapshot(Ingestion(replay=replay),"REPLAY",first)
    assert result["mode"]=="REPLAY"
    assert [obs.vehicleId for obs in result["vehicles"]]==["82361"]
    file.write_bytes(content+b" ")
    with pytest.raises(ValueError, match="assinatura"):
        read_replay(file,key)
