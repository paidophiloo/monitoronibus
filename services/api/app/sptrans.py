"""Read SPTrans observations through a single private HTTPS session."""
import asyncio
from datetime import datetime, timedelta, timezone
import json
import logging
import re

import httpx
from pydantic import AwareDatetime, BaseModel, Field, ValidationError

BASE_URL = "https://api.olhovivo.sptrans.com.br/v2.1/"
PREFIX = re.compile(r"^[0-9]{3,9}$")
MAX_POSITION_BYTES = 8 * 1024 * 1024
MAX_POSITION_LINES = 10_000
MAX_POSITION_ROWS = 100_000


class Observation(BaseModel):
    vehicleId: str = Field(pattern=PREFIX.pattern, min_length=3, max_length=9)
    lineId: int | None = None
    lineLabel: str | None = Field(default=None, max_length=32)
    latitude: float = Field(ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)
    observedAt: AwareDatetime
    receivedAt: AwareDatetime


def normalize(payload: object, received_at: datetime) -> list[Observation]:
    if not isinstance(payload, dict) or not isinstance(payload.get("l"), list):
        raise ValueError("invalid_position_envelope")

    if len(payload["l"]) > MAX_POSITION_LINES:
        raise ValueError("sptrans_too_many_lines")
    latest: dict[str, Observation] = {}
    row_count = 0
    for line in payload["l"]:
        if not isinstance(line, dict) or not isinstance(line.get("vs"), list):
            continue
        row_count += len(line["vs"])
        if row_count > MAX_POSITION_ROWS:
            raise ValueError("sptrans_too_many_positions")
        for vehicle in line["vs"]:
            if not isinstance(vehicle, dict):
                continue
            prefix = str(vehicle.get("p", ""))
            observed_at = vehicle.get("ta")
            if not PREFIX.fullmatch(prefix) or not isinstance(observed_at, str) or "T" not in observed_at:
                continue
            try:
                obs = Observation(
                    vehicleId=prefix, lineId=line.get("cl"), lineLabel=line.get("c"),
                    latitude=vehicle.get("py"), longitude=vehicle.get("px"),
                    observedAt=observed_at, receivedAt=received_at,
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
        self.http = httpx.AsyncClient(
            base_url=BASE_URL, transport=transport, timeout=8, follow_redirects=False,
            headers={"Accept": "application/json", "Accept-Encoding": "identity"},
        )

    async def _request_json(
        self, method: str, endpoint: str, params: dict[str, str | int] | None, limit: int,
    ) -> tuple[int, object]:
        try:
            async with asyncio.timeout(12):
                async with self.http.stream(method, endpoint, params=params) as response:
                    if response.status_code != 200:
                        return response.status_code, None
                    if response.headers.get("content-encoding", "identity").lower() != "identity":
                        raise ValueError("sptrans_unsupported_content_encoding")
                    declared = response.headers.get("content-length")
                    if declared is not None and (not declared.isdecimal() or int(declared) > limit):
                        raise ValueError("sptrans_response_too_large")
                    body = bytearray()
                    async for chunk in response.aiter_bytes(chunk_size=64 * 1024):
                        if len(body) + len(chunk) > limit:
                            raise ValueError("sptrans_response_too_large")
                        body.extend(chunk)
                    return response.status_code, json.loads(body)
        except (UnicodeDecodeError, json.JSONDecodeError, RecursionError):
            raise ValueError("sptrans_invalid_json") from None
        except TimeoutError:
            raise ValueError("sptrans_request_timeout") from None

    async def positions(self, company: int | None) -> list[Observation]:
        endpoint = "Posicao" if company is None else "Posicao/Garagem"
        if not self.authorized or not self.http.build_request("GET", endpoint).headers.get("cookie"):
            self.authorized = False
            self.http.cookies.clear()
            try:
                status, authenticated = await self._request_json(
                    "POST", "Login/Autenticar", {"token": self.token}, 1024,
                )
                if (
                    status != 200 or authenticated is not True
                    or not self.http.build_request("GET", endpoint).headers.get("cookie")
                ):
                    raise ValueError("sptrans_authentication_rejected")
            except (httpx.HTTPError, ValueError):
                self.http.cookies.clear()
                raise
            self.authorized = True
        params = None if company is None else {"codigoEmpresa": company}
        status, payload = await self._request_json("GET", endpoint, params, MAX_POSITION_BYTES)
        if status in {401, 403}:
            self.authorized = False
            self.http.cookies.clear()
        if status != 200:
            raise ValueError("sptrans_positions_unavailable")
        return normalize(payload, datetime.now(timezone.utc))

    async def close(self):
        await self.http.aclose()
