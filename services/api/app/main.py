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

import httpx
from fastapi import FastAPI, Query, Response
from pydantic import BaseModel, Field, ValidationError, model_validator

from .sptrans import Observation, OlhoVivo

logger = logging.getLogger(__name__)
Coordinates = tuple[float, float]


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
    if len(key.encode()) < 32 or file.stat().st_size > 12 * 1024 * 1024:
        raise ValueError("configuração de replay inválida")
    raw = file.read_bytes()
    expected = hmac.new(key.encode(), raw, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(file.with_suffix(file.suffix + ".sig").read_text().strip(), expected):
        raise ValueError("assinatura de replay inválida")
    return Replay.model_validate_json(raw)


@dataclass
class Ingestion:
    area: Area | None = None
    records: list[Observation] = field(default_factory=list)
    state: str = "not_configured"
    replay: Replay | None = None


async def poll(ingestion: Ingestion, provider: OlhoVivo, area: Area, company: int | None):
    delay = 15
    while True:
        try:
            fresh = await provider.positions(company)
            if not fresh:
                raise ValueError("sptrans_no_valid_observations")
            ingestion.records = [record for record in fresh if area.contains(record.longitude, record.latitude)]
            ingestion.state = "connected"
            delay = 15
        except (httpx.HTTPError, ValueError) as error:
            # Error text and traceback may include the secret authentication URL.
            logger.warning("Olho Vivo indisponível (%s)", type(error).__name__)
            ingestion.state = "unavailable"
            delay = min(delay*2, 120)
        await asyncio.sleep(delay)


@asynccontextmanager
async def lifespan(app: FastAPI):
    ingestion = Ingestion()
    app.state.ingestion = ingestion
    token = os.getenv("SPTRANS_TOKEN", "").strip()
    area_file = os.getenv("PATIO_AREA_FILE")
    replay_file = os.getenv("PATIO_REPLAY_FILE")
    if area_file:
        ingestion.area = Area.model_validate_json(Path(area_file).read_bytes())
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
async def get_snapshot(response: Response, mode: Literal["LIVE", "REPLAY"] = Query(),
                 at: datetime | None = None):
    response.headers["Cache-Control"] = "no-store"
    return snapshot(app.state.ingestion, mode, at)
