import asyncio
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import json

from fastapi.testclient import TestClient
import httpx
import pytest

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


def test_api_fails_closed_without_config(monkeypatch):
    for variable in ("SPTRANS_TOKEN","PATIO_AREA_FILE","PATIO_REPLAY_FILE"):
        monkeypatch.delenv(variable,raising=False)
    with TestClient(app) as client:
        assert client.get("/health").json()=={"status":"ok"}
        live=client.get("/api/vehicles/snapshot?mode=LIVE")
        assert live.headers["Cache-Control"]=="no-store"
        assert live.json()=={"version":1,"mode":"LIVE","state":"not_configured","vehicles":[]}
        assert client.get("/api/vehicles/snapshot?mode=REPLAY").json()["state"]=="no_records"
        assert client.get("/api/vehicles/snapshot?mode=DEMO").status_code==422


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
