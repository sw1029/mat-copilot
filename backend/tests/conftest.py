"""공용 픽스처 — httpx AsyncClient(ASGI 직결) + mock 런타임 (TRD §14).

sub-module 테스트는 개별 파일에 픽스처를 추가하고 conftest는 공용만 유지한다.
"""

from __future__ import annotations

import asyncio
from typing import AsyncIterator

import httpx
import pytest

from app.config import Settings
from app.main import create_app
from tests.mocks import MockRuntime


def make_settings(**overrides) -> Settings:
    base = dict(
        llm_mode="disabled",
        rate_limit_session_create_per_minute=1_000,  # rate limit 테스트만 별도 앱 사용
        max_active_sessions=500,
        ttl_sweep_interval_sec=3_600,
        static_dir=None,
        blob_connection_string=None,
        appinsights_connection_string=None,
        copilot_model=None,
    )
    base.update(overrides)
    return Settings(**base)


@pytest.fixture
def mock_runtime() -> MockRuntime:
    return MockRuntime()


@pytest.fixture
async def client(mock_runtime) -> AsyncIterator[httpx.AsyncClient]:
    app = create_app(settings=make_settings(), runtime=mock_runtime)
    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
            c.app = app  # 테스트에서 store 등 내부 접근용
            yield c


async def create_session(client: httpx.AsyncClient, settings: dict | None = None) -> tuple[str, dict]:
    body = {"settings": settings} if settings else {}
    res = await client.post("/api/v1/sessions", json=body)
    assert res.status_code == 201, res.text
    data = res.json()
    return data["sessionId"], {"X-Session-Token": data["sessionToken"]}


async def wait_job(client, session_id: str, headers: dict, job_id: str, timeout: float = 10.0) -> dict:
    """job 종결 상태까지 폴링."""
    deadline = asyncio.get_event_loop().time() + timeout
    while True:
        res = await client.get(f"/api/v1/sessions/{session_id}/jobs/{job_id}", headers=headers)
        assert res.status_code == 200, res.text
        data = res.json()
        if data["status"] in ("SUCCEEDED", "FAILED", "CANCELLED"):
            return data
        if asyncio.get_event_loop().time() > deadline:
            raise AssertionError(f"job 미종결: {data}")
        await asyncio.sleep(0.05)
