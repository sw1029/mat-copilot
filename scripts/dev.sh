#!/usr/bin/env bash
# 로컬 일괄 기동(개발 모드) — backend(uvicorn --reload)와 frontend(vite dev)를 한 번에 띄운다.
# vite가 /api 를 backend로 프록시한다 (frontend/vite.config.ts).
#
# 사용법:
#   scripts/dev.sh
#   BACKEND_PORT=8001 FRONTEND_PORT=5174 scripts/dev.sh
#   LLM_MODE=disabled scripts/dev.sh      # LLM 없이 기동 (기본: 환경값 유지 = copilot)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"

# --- backend 준비 (.venv 자동 구성) ---
if [ ! -x "$ROOT/backend/.venv/bin/python" ]; then
  echo "[dev] backend .venv 생성 및 의존성 설치"
  python3 -m venv "$ROOT/backend/.venv"
  "$ROOT/backend/.venv/bin/pip" install -q -r "$ROOT/backend/requirements.txt" -r "$ROOT/backend/requirements-dev.txt"
fi

# --- frontend 준비 ---
if [ ! -d "$ROOT/frontend/node_modules" ]; then
  echo "[dev] frontend 의존성 설치"
  (cd "$ROOT/frontend" && npm ci)
fi

cleanup() {
  trap - EXIT INT TERM
  kill 0 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "[dev] backend  → http://localhost:$BACKEND_PORT"
echo "[dev] frontend → http://localhost:$FRONTEND_PORT (여기로 접속)"

(cd "$ROOT/backend" && exec .venv/bin/uvicorn app.main:app --reload --port "$BACKEND_PORT") &
(cd "$ROOT/frontend" && VITE_API_PROXY_TARGET="http://localhost:$BACKEND_PORT" \
  exec npm run dev -- --port "$FRONTEND_PORT" --strictPort) &

wait
