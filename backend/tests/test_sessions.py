"""TC-11 세션 격리·멀티테넌시 / TC-16 방어 / TC-17 보존·삭제 (FR-11, §10)."""

from __future__ import annotations

from datetime import timedelta

import httpx
import pytest

from app.config import Settings
from app.main import create_app
from app.models.domain import utcnow
from tests.conftest import create_session, make_settings
from tests.mocks import MockRuntime


async def test_create_session_returns_token_and_defaults(client):
    res = await client.post("/api/v1/sessions", json={})
    assert res.status_code == 201
    data = res.json()
    assert data["sessionToken"]
    assert data["status"] == "CREATED"
    assert data["settings"]["confuseThreshold"] == 0.5
    assert data["expiresAt"] > data["createdAt"]
    # 보안 응답 헤더 (SCHEMA §1)
    assert res.headers["X-Content-Type-Options"] == "nosniff"
    assert res.headers["X-Frame-Options"] == "DENY"
    assert "default-src 'self'" in res.headers["Content-Security-Policy"]


async def test_create_session_with_settings_validation(client):
    res = await client.post(
        "/api/v1/sessions", json={"settings": {"confuseThreshold": 0.3, "timeLimitSec": 600}}
    )
    assert res.status_code == 201
    assert res.json()["settings"]["confuseThreshold"] == 0.3

    for bad in ({"confuseThreshold": 1.5}, {"confuseThreshold": 0.33}, {"timeLimitSec": 10}):
        res = await client.post("/api/v1/sessions", json={"settings": bad})
        assert res.status_code == 400, bad
        assert res.json()["error"]["code"] == "INVALID_INPUT"
        assert res.json()["error"]["traceId"]


async def test_get_session_requires_matching_token(client):
    sid, headers = await create_session(client)
    res = await client.get(f"/api/v1/sessions/{sid}", headers=headers)
    assert res.status_code == 200
    assert res.json()["sessionId"] == sid

    # 토큰 불일치 → SESSION_NOT_FOUND (존재 비노출, §10.1)
    res = await client.get(f"/api/v1/sessions/{sid}", headers={"X-Session-Token": "wrong"})
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "SESSION_NOT_FOUND"

    # 토큰 부재
    res = await client.get(f"/api/v1/sessions/{sid}")
    assert res.status_code == 404


async def test_cross_session_isolation(client):
    """TC-11 — 타 세션 token으로 접근 시 SESSION_NOT_FOUND."""
    sid_a, headers_a = await create_session(client)
    _sid_b, headers_b = await create_session(client)
    res = await client.get(f"/api/v1/sessions/{sid_a}", headers=headers_b)
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "SESSION_NOT_FOUND"


async def test_patch_settings(client):
    sid, headers = await create_session(client)
    res = await client.patch(
        f"/api/v1/sessions/{sid}/settings", headers=headers, json={"confuseThreshold": 0.7}
    )
    assert res.status_code == 200
    assert res.json()["settings"]["confuseThreshold"] == 0.7
    assert res.json()["settings"]["timeLimitSec"] is None

    res = await client.patch(f"/api/v1/sessions/{sid}/settings", headers=headers, json={"timeLimitSec": 120})
    assert res.status_code == 200
    assert res.json()["settings"]["confuseThreshold"] == 0.7
    assert res.json()["settings"]["timeLimitSec"] == 120

    res = await client.patch(f"/api/v1/sessions/{sid}/settings", headers=headers, json={"timeLimitSec": 5})
    assert res.status_code == 400


async def test_delete_session_then_not_found(client):
    """TC-17 — API-19 즉시 파기 후 SESSION_NOT_FOUND, 부재 시에도 204."""
    sid, headers = await create_session(client)
    res = await client.delete(f"/api/v1/sessions/{sid}", headers=headers)
    assert res.status_code == 204
    res = await client.get(f"/api/v1/sessions/{sid}", headers=headers)
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "SESSION_NOT_FOUND"
    # 부재 세션 삭제도 204 (멱등)
    res = await client.delete(f"/api/v1/sessions/{sid}", headers=headers)
    assert res.status_code == 204


async def test_expired_session_returns_410(client):
    """TC-17 — TTL 경과 시 410 SESSION_EXPIRED + 데이터 파기."""
    sid, headers = await create_session(client)
    store = client.app.state.store
    state = store._states[sid]
    state.expires_at = utcnow() - timedelta(seconds=1)
    res = await client.get(f"/api/v1/sessions/{sid}", headers=headers)
    assert res.status_code == 410
    assert res.json()["error"]["code"] == "SESSION_EXPIRED"
    assert sid not in store._states  # 파기됨
    # 파기 후 재접근도 410 (tombstone)
    res = await client.get(f"/api/v1/sessions/{sid}", headers=headers)
    assert res.status_code == 410


async def test_ttl_sweep_purges_expired(client):
    sid, _headers = await create_session(client)
    store = client.app.state.store
    store._states[sid].expires_at = utcnow() - timedelta(seconds=1)
    purged = store.sweep_expired()
    assert purged == 1
    assert store.count_active() == 0


@pytest.mark.parametrize("limit", [5])
async def test_rate_limit_session_create(limit):
    """TC-16 — API-01 분당 limit+1회째 429 + Retry-After."""
    app = create_app(
        settings=make_settings(rate_limit_session_create_per_minute=limit),
        runtime=MockRuntime(),
    )
    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
            for _ in range(limit):
                res = await c.post("/api/v1/sessions", json={})
                assert res.status_code == 201
            res = await c.post("/api/v1/sessions", json={})
            assert res.status_code == 429
            assert res.json()["error"]["code"] == "RATE_LIMITED"
            assert int(res.headers["Retry-After"]) >= 1


async def test_active_session_cap():
    """TC-16 — 활성 세션 상한 초과 시 429 (§8.4)."""
    app = create_app(settings=make_settings(max_active_sessions=2), runtime=MockRuntime())
    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
            for _ in range(2):
                assert (await c.post("/api/v1/sessions", json={})).status_code == 201
            res = await c.post("/api/v1/sessions", json={})
            assert res.status_code == 429


async def test_health_and_ready(client):
    res = await client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
    res = await client.get("/ready")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ready"
    assert body["checks"]["store"] == "ok"
    assert body["checks"]["llm"] == "ok"  # MockRuntime
