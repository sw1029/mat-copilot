"""운영 API — API-15 /health(liveness) · API-16 /ready(readiness). 무토큰."""

from __future__ import annotations

from fastapi import APIRouter, Request, Response

from app.models.api import HealthResponse, ReadyResponse

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok")


@router.get("/ready")
async def ready(request: Request, response: Response) -> ReadyResponse:
    llm = request.app.state.runtime.llm_status()  # "ok" | "fail" | "disabled"
    store_ok = "ok"
    ready_ok = store_ok == "ok" and llm != "fail"
    response.status_code = 200 if ready_ok else 503
    return ReadyResponse(
        status="ready" if ready_ok else "not_ready",
        checks={"store": store_ok, "llm": llm},
    )
