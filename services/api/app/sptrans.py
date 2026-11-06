"""Read SPTrans observations through a single private HTTPS session."""
from datetime import datetime, timedelta, timezone
import logging
import re

import httpx
from pydantic import AwareDatetime, BaseModel, Field, ValidationError

BASE_URL = "https://api.olhovivo.sptrans.com.br/v2.1/"
PREFIX = re.compile(r"^[0-9]{3,9}$")


class Observation(BaseModel):
    vehicleId: str
    lineId: int | None = None
    lineLabel: str | None = Field(default=None, max_length=32)
    latitude: float = Field(ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)
    observedAt: AwareDatetime
    receivedAt: AwareDatetime


def normalize(payload: object, received_at: datetime) -> list[Observation]:
    if not isinstance(payload, dict) or not isinstance(payload.get("l"), list):
        raise ValueError("invalid_position_envelope")

    latest: dict[str, Observation] = {}
    for line in payload["l"]:
        if not isinstance(line, dict) or not isinstance(line.get("vs"), list):
            continue
        for vehicle in line["vs"]:
            if not isinstance(vehicle, dict):
                continue
            prefix = str(vehicle.get("p", ""))
            if not PREFIX.fullmatch(prefix):
                continue
            try:
                obs = Observation(
                    vehicleId=prefix, lineId=line.get("cl"), lineLabel=line.get("c"),
                    latitude=vehicle.get("py"), longitude=vehicle.get("px"),
                    observedAt=vehicle.get("ta"), receivedAt=received_at,
                )
            except ValidationError:
                continue
            if obs.observedAt > received_at + timedelta(seconds=15):
                continue
            if prefix not in latest or latest[prefix].observedAt < obs.observedAt:
                latest[prefix] = obs
    return list(latest.values())


class OlhoVivo:
    def __init__(self, token: str, transport: httpx.AsyncBaseTransport | None = None):
        self.token = token
        self.authorized = False
        # httpx's INFO request logs include query strings. SPTrans requires its token there.
        logging.getLogger("httpx").setLevel(logging.WARNING)
        logging.getLogger("httpcore").setLevel(logging.WARNING)
        self.http = httpx.AsyncClient(base_url=BASE_URL, transport=transport,
                                      timeout=8, follow_redirects=False)

    async def positions(self, company: int | None) -> list[Observation]:
        if not self.authorized:
            result = await self.http.post("Login/Autenticar", params={"token": self.token})
            if result.status_code != 200 or result.json() is not True or not self.http.cookies:
                self.http.cookies.clear()
                raise ValueError("sptrans_authentication_rejected")
            self.authorized = True
        endpoint = "Posicao" if company is None else "Posicao/Garagem"
        params = None if company is None else {"codigoEmpresa": company}
        result = await self.http.get(endpoint, params=params)
        if result.status_code in {401, 403}:
            self.authorized = False
            self.http.cookies.clear()
        if result.status_code != 200:
            raise ValueError("sptrans_positions_unavailable")
        return normalize(result.json(), datetime.now(timezone.utc))

    async def close(self):
        await self.http.aclose()
