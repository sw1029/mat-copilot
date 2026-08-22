"""정적 서빙·SPA fallback 계약 테스트 (TRD §12.1, SCHEMA §1 보안 헤더·§5 오류 계약)."""

from __future__ import annotations

from typing import AsyncIterator

import httpx
import pytest

from app.main import create_app
from tests.conftest import make_settings
from tests.mocks import MockRuntime


@pytest.fixture
async def static_client(tmp_path) -> AsyncIterator[httpx.AsyncClient]:
    static = tmp_path / "dist"
    (static / "assets").mkdir(parents=True)
    (static / "index.html").write_text(
        "<!doctype html><html><body><div id=\"root\"></div></body></html>", encoding="utf-8"
    )
    (static / "assets" / "app-abc123.js").write_text("console.log(1)", encoding="utf-8")
    (static / "favicon.svg").write_text("<svg xmlns='http://www.w3.org/2000/svg'/>", encoding="utf-8")
    app = create_app(settings=make_settings(static_dir=str(static)), runtime=MockRuntime())
    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
            yield c


async def test_root_serves_index_no_cache(static_client):
    res = await static_client.get("/")
    assert res.status_code == 200
    assert "text/html" in res.headers["content-type"]
    assert res.headers["cache-control"] == "no-cache"
    assert "x-content-type-options" in res.headers  # 보안 헤더는 정적 응답에도 적용


async def test_deep_link_falls_back_to_index(static_client):
    for path in ("/interview", "/report", "/analysis/some-job-id"):
        res = await static_client.get(path)
        assert res.status_code == 200, path
        assert "text/html" in res.headers["content-type"], path
        assert res.headers["cache-control"] == "no-cache", path


async def test_hashed_asset_served_immutable(static_client):
    res = await static_client.get("/assets/app-abc123.js")
    assert res.status_code == 200
    assert res.headers["cache-control"] == "public, max-age=31536000, immutable"
    assert "javascript" in res.headers["content-type"]


async def test_missing_asset_returns_404_not_html(static_client):
    # 재배포로 사라진 해시 자산이 index.html(200)로 폴백되면 nosniff와 충돌 — 404 계약
    res = await static_client.get("/assets/gone-xyz987.js")
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "NOT_FOUND"


async def test_unknown_api_path_returns_json_404(static_client):
    # 미등록 API 경로가 SPA fallback으로 새면 프론트는 PARSE_ERROR를 겪는다 — JSON 오류 계약 유지
    res = await static_client.get("/api/v1/definitely-not-a-route")
    assert res.status_code == 404
    assert "application/json" in res.headers["content-type"]
    body = res.json()["error"]
    assert body["code"] == "NOT_FOUND"
    assert "traceId" in body


async def test_api_routes_take_priority_over_catch_all(static_client):
    res = await static_client.post("/api/v1/sessions", json={})
    assert res.status_code == 201
    data = res.json()
    assert data["sessionId"] and data["sessionToken"]

    health = await static_client.get("/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"


async def test_path_traversal_never_escapes_static_root(static_client):
    res = await static_client.get("/..%2f..%2f..%2fetc%2fpasswd")
    assert res.status_code in (200, 404)
    if res.status_code == 200:  # 탈출 차단 → SPA fallback
        assert "text/html" in res.headers["content-type"]
        assert "root:" not in res.text


async def test_missing_index_html_skips_mount(tmp_path):
    static = tmp_path / "dist"
    static.mkdir()  # index.html 없음
    app = create_app(settings=make_settings(static_dir=str(static)), runtime=MockRuntime())
    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
            res = await c.get("/")
            assert res.status_code == 404
            assert res.json()["error"]["code"] == "NOT_FOUND"
