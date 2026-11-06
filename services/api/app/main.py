"""Single-process FastAPI ingestion and offline replay boundary."""
import asyncio
from contextlib import asynccontextmanager, suppress
from dataclasses import dataclass, field
from datetime import datetime, timezone
import hashlib
import hmac
import logging
from pathlib import Path
import os
from typing import Literal
from urllib.parse import urlsplit

import httpx
from fastapi import FastAPI, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, Field, ValidationError, model_validator

from .sptrans import Observation, OlhoVivo

logger = logging.getLogger(__name__)
Coordinates = tuple[float, float]
MAX_LIVE_CLIENTS = 32
REPLAY_MAX_BYTES = 12 * 1024 * 1024


class Area(BaseModel):
    name: str = Field(min_length=1, max_length=90)
    source: str = Field(min_length=1, max_length=240)
    origin: Coordinates
    ring: list[Coordinates] = Field(min_length=4, max_length=1000)

    @model_validator(mode="after")
    def validate_site(self):
        if self.ring[0] != self.ring[-1]:
            raise ValueError("perímetro deve ser um anel fechado")
        lng, lat = self.origin
        if not (-47 < lng < -46 and -24 < lat < -23):
            raise ValueError("origem fora da região de São Paulo")
        if any(not (abs(x-lng) <= .025 and abs(y-lat) <= .025) for x, y in self.ring):
            raise ValueError("perímetro fora do entorno da origem")
        if len(set(self.ring[:-1])) < 3:
            raise ValueError("perímetro degenerado")
        return self

    def contains(self, lng: float, lat: float) -> bool:
        inside = False
        for (x, y), (nx, ny) in zip(self.ring, self.ring[1:]):
            if (y > lat) != (ny > lat) and lng < (nx-x)*(lat-y)/(ny-y)+x:
                inside = not inside
        return inside


class Replay(BaseModel):
    version: Literal[1]
    source: Literal["sptrans_olhovivo"]
    area: Area
    observations: list[Observation] = Field(max_length=20_000)

    @model_validator(mode="after")
    def validate_provenance(self):
        for obs in self.observations:
            if not self.area.contains(obs.longitude, obs.latitude):
                raise ValueError("observação fora do perímetro")
            if obs.observedAt > obs.receivedAt or obs.receivedAt > datetime.now(timezone.utc):
                raise ValueError("observação fora do intervalo histórico")
        return self


def read_replay(file: Path, key: str) -> Replay:
    if len(key.encode()) < 32:
        raise ValueError("configuração de replay inválida")
    with file.open("rb") as handle:
        raw = handle.read(REPLAY_MAX_BYTES + 1)
    if len(raw) > REPLAY_MAX_BYTES:
        raise ValueError("configuração de replay inválida")
    with file.with_suffix(file.suffix + ".sig").open("rb") as handle:
        signature = handle.read(128)
        if handle.read(1):
            raise ValueError("assinatura de replay inválida")
    expected = hmac.new(key.encode(), raw, hashlib.sha256).hexdigest().encode("ascii")
    if not hmac.compare_digest(signature.strip(), expected):
        raise ValueError("assinatura de replay inválida")
    return Replay.model_validate_json(raw)


@dataclass
class Ingestion:
    area: Area | None = None
    records: list[Observation] = field(default_factory=list)
    state: str = "not_configured"
    replay: Replay | None = None
    revision: int = 0
    changed: asyncio.Event = field(default_factory=asyncio.Event)
    live_clients: int = 0
    public_origin: str | None = None

    def publish(self):
        self.revision += 1
        self.changed.set()
        self.changed = asyncio.Event()


async def poll(ingestion: Ingestion, provider: OlhoVivo, area: Area, company: int | None):
    delay = 15
    while True:
        previous_state = ingestion.state
        try:
            fresh = await provider.positions(company)
            if not fresh:
                raise ValueError("sptrans_no_valid_observations")
            ingestion.records = [record for record in fresh if area.contains(record.longitude, record.latitude)]
            ingestion.state = "connected"
            delay = 15
            ingestion.publish()
        except (httpx.HTTPError, ValueError) as error:
            # Error text and traceback may include the secret authentication URL.
            logger.warning("Olho Vivo indisponível (%s)", type(error).__name__)
            ingestion.state = "unavailable"
            delay = min(delay*2, 120)
            if previous_state != ingestion.state:
                ingestion.publish()
        await asyncio.sleep(delay)


def public_origin_from_env() -> str | None:
    value = os.getenv("PATIO_PUBLIC_ORIGIN", "").strip()
    if not value:
        return None
    parsed = urlsplit(value)
    if (parsed.scheme not in {"http", "https"} or not parsed.hostname
            or parsed.username is not None or parsed.path not in {"", "/"}
            or parsed.query or parsed.fragment or parsed.port == 0):
        raise ValueError("PATIO_PUBLIC_ORIGIN deve conter somente a origem HTTP(S)")
    return f"{parsed.scheme}://{parsed.netloc}"


def provider_token_from_env() -> str:
    token = os.getenv("SPTRANS_TOKEN", "").strip()
    secret_file = os.getenv("SPTRANS_TOKEN_FILE", "").strip()
    if token or not secret_file:
        return token
    try:
        with Path(secret_file).open("rb") as handle:
            raw = handle.read(2049)
        if len(raw) > 2048:
            raise ValueError
        return raw.decode("utf-8").strip()
    except (OSError, ValueError):
        logger.warning("Arquivo de credencial do Olho Vivo rejeitado")
        return ""


@asynccontextmanager
async def lifespan(app: FastAPI):
    ingestion = Ingestion(public_origin=public_origin_from_env())
    app.state.ingestion = ingestion
    token = provider_token_from_env()
    area_file = os.getenv("PATIO_AREA_FILE")
    replay_file = os.getenv("PATIO_REPLAY_FILE")
    if area_file:
        with Path(area_file).open("rb") as handle:
            raw_area = handle.read(256 * 1024 + 1)
        if len(raw_area) > 256 * 1024:
            raise ValueError("PATIO_AREA_FILE excede o tamanho permitido")
        ingestion.area = Area.model_validate_json(raw_area)
    if replay_file:
        try:
            ingestion.replay = read_replay(Path(replay_file), os.getenv("PATIO_REPLAY_KEY", ""))
        except (OSError, UnicodeError, ValueError, ValidationError):
            logger.warning("Arquivo REPLAY rejeitado")
    provider = None
    task = None
    if token and ingestion.area:
        company_id = os.getenv("SPTRANS_COMPANY_ID")
        company = int(company_id) if company_id else None
        if company is not None and company < 0:
            raise ValueError("SPTRANS_COMPANY_ID inválido")
        provider = OlhoVivo(token)
        ingestion.state = "connecting"
        task = asyncio.create_task(poll(ingestion, provider, ingestion.area, company))
    try:
        yield
    finally:
        if task:
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task
        if provider:
            await provider.close()


app = FastAPI(title="Pátio Monitor", version="0.2.0", lifespan=lifespan)


@app.middleware("http")
async def secure_http_responses(request: Request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    return response


@app.get("/health")
def health():
    return {"status": "ok"}


def snapshot(ingestion: Ingestion, mode: Literal["LIVE", "REPLAY"], at: datetime | None):
    now = datetime.now(timezone.utc)
    if mode == "REPLAY":
        replay = ingestion.replay
        if not replay or not replay.observations:
            return {"version": 1, "mode": mode, "state": "no_records", "vehicles": []}
        stamps = sorted({obs.observedAt for obs in replay.observations})
        cursor = at if at and at.tzinfo else stamps[-1]
        # One original observation per vehicle, with no extrapolation past this instant.
        rows = {obs.vehicleId: obs for obs in sorted(replay.observations, key=lambda o: o.observedAt)
                if 0 <= (cursor-obs.observedAt).total_seconds() <= 90}
        return {"version": 1, "mode": mode, "state": "recorded", "source": replay.source,
                "area": replay.area.model_dump(), "range": [stamps[0], stamps[-1]],
                "at": cursor, "vehicles": list(rows.values())}
    if ingestion.state != "connected" and not ingestion.records:
        return {"version": 1, "mode": mode, "state": ingestion.state, "vehicles": []}
    state = ingestion.state
    if ingestion.records and all((now-obs.observedAt).total_seconds() > 90 for obs in ingestion.records):
        state = "stale"
    if not ingestion.records and state == "connected":
        state = "no_observations"
    return {"version": 1, "mode": mode, "state": state, "source": "sptrans_olhovivo",
            "area": ingestion.area.model_dump() if ingestion.area else None,
            "vehicles": ingestion.records, "serverTime": now}


@app.get("/api/vehicles/snapshot")
async def get_snapshot(mode: Literal["LIVE", "REPLAY"] = Query(),
                 at: datetime | None = None):
    return snapshot(app.state.ingestion, mode, at)


@app.websocket("/api/vehicles/live")
async def live_socket(websocket: WebSocket):
    ingestion: Ingestion = websocket.app.state.ingestion
    scheme = "https" if websocket.url.scheme == "wss" else "http"
    origin = ingestion.public_origin or f"{scheme}://{websocket.url.netloc}"
    if websocket.headers.get("origin") != origin:
        await websocket.close(code=1008)
        return
    if ingestion.live_clients >= MAX_LIVE_CLIENTS:
        await websocket.close(code=1013)
        return

    ingestion.live_clients += 1
    incoming = None
    change = None
    try:
        await websocket.accept()
        incoming = asyncio.create_task(websocket.receive())
        last = None
        while True:
            change = asyncio.create_task(ingestion.changed.wait())
            current = snapshot(ingestion, "LIVE", None)
            key = (ingestion.revision, current["state"])
            if key != last:
                await asyncio.wait_for(websocket.send_json(jsonable_encoder(current)), timeout=5)
                last = key

            # The timeout lets freshness change even when the provider is quiet.
            done, _ = await asyncio.wait({incoming, change}, timeout=5, return_when=asyncio.FIRST_COMPLETED)
            if incoming in done:
                if incoming.result()["type"] != "websocket.disconnect":
                    await websocket.close(code=1008)
                return
            change.cancel()
            with suppress(asyncio.CancelledError):
                await change
            change = None
    except (WebSocketDisconnect, TimeoutError):
        return
    finally:
        ingestion.live_clients -= 1
        tasks = [task for task in (incoming, change) if task is not None]
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
