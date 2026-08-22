"""FastAPI 앱 팩토리 — TRD §4 아키텍처 골격.

- 미들웨어: traceId 상관관계, 보안 응답 헤더 (SCHEMA §1)
- 오류 계약: 모든 오류는 {"error": ApiError} (SCHEMA §5)
- lifespan: LLM warm-up(§5.2), TTL sweep(§8.4), 고아 job 복구(§7.8)
- 단일 앱: /api/v1 REST + /health·/ready + 프론트 정적 서빙(§12.1)
"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app import constants
from app.agents import build_runtime
from app.config import Settings
from app.errors import ApiException
from app.models.domain import ApiError
from app.models.enums import JobStatus
from app.observability import log_event, new_trace_id, setup_logging, trace_id_var
from app.services.rate_limit import SlidingWindowRateLimiter
from app.store.blob import BlobArchiver
from app.store.memory import InMemorySessionStore

logger = logging.getLogger("app.main")

SECURITY_HEADERS = {
    # SCHEMA §1 보안 응답 헤더 — inline script 금지 계열
    "Content-Security-Policy": (
        "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'"
    ),
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
}


def _recover_orphan_jobs(store: InMemorySessionStore) -> None:
    """앱 시작 시 RUNNING/QUEUED 고아 job → FAILED 전환 (TRD §7.8)."""
    count = 0
    for state in store.all_states():
        for rec in state.jobs.values():
            if rec.job.status in (JobStatus.QUEUED, JobStatus.RUNNING):
                rec.job.status = JobStatus.FAILED
                rec.job.error = ApiError(
                    code="PIPELINE_STAGE_FAILED",
                    message="서버 재시작으로 중단되었습니다. 재시도해 주세요.",
                    retryable=True,
                    trace_id=trace_id_var.get() or new_trace_id(),
                )
                count += 1
    if count:
        log_event(logger, "orphan_jobs_recovered", count=count)


def create_app(settings: Settings | None = None, runtime=None) -> FastAPI:
    settings = settings or Settings()
    setup_logging(settings.appinsights_connection_string)
    store = InMemorySessionStore(max_active_sessions=settings.max_active_sessions)
    blob = BlobArchiver(settings.blob_connection_string, settings.blob_container)
    runtime = runtime if runtime is not None else build_runtime(settings)
    if hasattr(runtime, "attach_usage_sink"):
        runtime.attach_usage_sink(store.record_usage)  # 세션 누적 토큰 계측 (§11.1)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        _recover_orphan_jobs(store)
        try:
            await runtime.warm_up()  # Copilot SDK 기동 + ping (TRD §5.2)
        except Exception:  # noqa: BLE001 — warm-up 실패는 /ready llm:fail로 보고, 폴백으로 동작
            logger.error("LLM warm-up 실패 — 폴백 경로로 동작", exc_info=True)

        async def sweep_loop() -> None:
            while True:
                await asyncio.sleep(settings.ttl_sweep_interval_sec)
                try:
                    store.sweep_expired()
                except Exception:  # noqa: BLE001
                    logger.error("TTL sweep 실패", exc_info=True)

        sweep_task = asyncio.create_task(sweep_loop())
        log_event(logger, "app_started", llm=runtime.llm_status())
        try:
            yield
        finally:
            sweep_task.cancel()
            try:
                await runtime.shutdown()
            except Exception:  # noqa: BLE001
                logger.warning("런타임 종료 중 오류", exc_info=True)

    app = FastAPI(
        title="mat-copilot backend",
        version="0.1.0",
        lifespan=lifespan,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,  # 무인증 공개 API — 스키마 노출 최소화
    )
    app.state.settings = settings
    app.state.store = store
    app.state.blob = blob
    app.state.runtime = runtime
    app.state.rate_limiter = SlidingWindowRateLimiter(settings.rate_limit_session_create_per_minute)

    # --- 미들웨어 (traceId → 보안 헤더 순) ---

    @app.middleware("http")
    async def observability_middleware(request: Request, call_next):
        trace_id_var.set(new_trace_id())
        response = await call_next(request)
        for k, v in SECURITY_HEADERS.items():
            response.headers.setdefault(k, v)
        return response

    # --- 오류 계약 (SCHEMA §5) ---

    def _error_response(status_code: int, error: ApiError, headers: dict[str, str] | None = None):
        return JSONResponse(
            status_code=status_code,
            content={"error": error.model_dump(by_alias=True, exclude_none=True)},
            headers={**SECURITY_HEADERS, **(headers or {})},
        )

    @app.exception_handler(ApiException)
    async def handle_api_exception(request: Request, exc: ApiException):
        log_event(
            logger,
            "api_error",
            level=logging.WARNING if exc.http_status < 500 else logging.ERROR,
            code=exc.code,
            status=exc.http_status,
            path=request.url.path,
        )
        return _error_response(
            exc.http_status,
            ApiError(
                code=exc.code,
                message=exc.message,
                retryable=exc.retryable,
                details=exc.details,
                trace_id=trace_id_var.get(),
            ),
            headers=exc.headers,
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(request: Request, exc: RequestValidationError):
        details = {"errors": [{"loc": list(map(str, e["loc"])), "msg": e["msg"]} for e in exc.errors()[:10]]}
        return _error_response(
            400,
            ApiError(
                code="INVALID_INPUT",
                message="요청 형식이 올바르지 않습니다.",
                retryable=False,
                details=details,
                trace_id=trace_id_var.get(),
            ),
        )

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_exception(request: Request, exc: StarletteHTTPException):
        code = "NOT_FOUND" if exc.status_code == 404 else ("INTERNAL" if exc.status_code >= 500 else "HTTP_ERROR")
        return _error_response(
            exc.status_code,
            ApiError(
                code=code,
                message=str(exc.detail),
                retryable=exc.status_code >= 500,
                trace_id=trace_id_var.get(),
            ),
        )

    @app.exception_handler(Exception)
    async def handle_unexpected(request: Request, exc: Exception):
        # silent catch 금지 (TRD §11.2) — 구조화 로그 후 규격화 오류로 변환
        logger.error("unhandled_error path=%s", request.url.path, exc_info=exc)
        return _error_response(
            500,
            ApiError(
                code="INTERNAL",
                message="서버 내부 오류가 발생했습니다.",
                retryable=True,
                trace_id=trace_id_var.get(),
            ),
        )

    # --- 라우터 ---

    from app.api.routes import artifacts, interview, jobs, ops, plan, report, sessions

    app.include_router(ops.router)  # /health, /ready — 무토큰 (SCHEMA §2)
    for r in (sessions, plan, interview, artifacts, jobs, report):
        app.include_router(r.router, prefix=constants.API_PREFIX)

    # --- 프론트 정적 서빙 (TRD §12.1 단일 앱) ---

    static_dir = settings.resolved_static_dir()
    index_html = (static_dir / "index.html") if static_dir else None
    if static_dir and index_html is not None and index_html.is_file():
        static_root = static_dir.resolve()
        # index.html은 항상 재검증(배포 직후 구버전 셸 방지), Vite 해시 자산은 불변 캐시
        no_cache = {"Cache-Control": "no-cache"}
        immutable = {"Cache-Control": "public, max-age=31536000, immutable"}

        @app.get("/{full_path:path}", include_in_schema=False)
        async def spa(full_path: str):
            # 미등록 API 경로는 SPA로 새지 않고 오류 계약(JSON 404)을 지킨다 (SCHEMA §5)
            if full_path == "api" or full_path.startswith("api/"):
                raise StarletteHTTPException(status_code=404, detail="Not Found")
            candidate = (static_root / full_path).resolve()
            if candidate.is_relative_to(static_root) and candidate.is_file():
                headers = immutable if full_path.startswith("assets/") else no_cache
                return FileResponse(candidate, headers=headers)
            if full_path.startswith("assets/"):
                # 재배포로 사라진 해시 자산 — HTML 폴백은 nosniff와 충돌하므로 404
                raise StarletteHTTPException(status_code=404, detail="Not Found")
            return FileResponse(index_html, headers=no_cache)  # SPA 라우팅 폴백

        log_event(logger, "static_mounted", dir=str(static_dir))
    elif settings.static_dir:
        logger.warning(
            "STATIC_DIR=%s 이 없거나 index.html이 없어 정적 서빙을 건너뜁니다", settings.static_dir
        )

    return app


_app_singleton = None


def __getattr__(name: str):
    # uvicorn app.main:app — 지연 생성·캐싱 (매 접근마다 새 앱/저장소가 만들어지면 세션이 유실됨)
    if name == "app":
        global _app_singleton
        if _app_singleton is None:
            _app_singleton = create_app()
        return _app_singleton
    raise AttributeError(name)
