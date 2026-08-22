#!/usr/bin/env bash
# 실통합 E2E 서버 — playwright.integration.config.ts 의 webServer 가 호출한다.
# 빌드된 frontend를 실제 backend(FastAPI)가 서빙하는 단일 앱을 기동한다 (mock 없음).
#
#   scripts/serve-integration.sh [PORT]   # 기본 8100
#   SKIP_BUILD=1  기존 frontend/dist 재사용
#
# 결정적 실행을 위해 LLM_MODE=disabled 기본값, rate limit 상향(E2E 다회 세션 생성 대비).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${1:-8100}"

if [ "${SKIP_BUILD:-0}" != "1" ]; then
  if [ ! -d "$ROOT/frontend/node_modules" ]; then
    (cd "$ROOT/frontend" && npm ci)
  fi
  (cd "$ROOT/frontend" && npm run build)
fi

if [ ! -x "$ROOT/backend/.venv/bin/uvicorn" ]; then
  python3 -m venv "$ROOT/backend/.venv"
  "$ROOT/backend/.venv/bin/pip" install -q -r "$ROOT/backend/requirements.txt"
fi

cd "$ROOT/backend"
exec env \
  STATIC_DIR="$ROOT/frontend/dist" \
  LLM_MODE="${LLM_MODE:-disabled}" \
  RATE_LIMIT_SESSION_CREATE_PER_MINUTE="${RATE_LIMIT_SESSION_CREATE_PER_MINUTE:-100}" \
  .venv/bin/uvicorn app.main:app --port "$PORT"
