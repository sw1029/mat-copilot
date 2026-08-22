#!/usr/bin/env bash
# 로컬 일괄 기동(단일 앱 모드) — frontend를 빌드해 backend가 정적 서빙(SPA fallback)까지
# 담당하는 배포 동형 구성으로 기동한다 (TRD/back.md §12.1).
#
# 사용법:
#   scripts/run-local.sh [PORT]           # 기본 8000
#   SKIP_BUILD=1 scripts/run-local.sh     # 기존 frontend/dist 재사용
#   LLM_MODE=disabled scripts/run-local.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${1:-8000}"

if [ "${SKIP_BUILD:-0}" != "1" ]; then
  echo "[run-local] frontend 빌드"
  if [ ! -d "$ROOT/frontend/node_modules" ]; then
    (cd "$ROOT/frontend" && npm ci)
  fi
  (cd "$ROOT/frontend" && npm run build)
fi

if [ ! -f "$ROOT/frontend/dist/index.html" ]; then
  echo "[run-local] frontend/dist/index.html 없음 — 빌드가 필요합니다" >&2
  exit 1
fi

if [ ! -x "$ROOT/backend/.venv/bin/uvicorn" ]; then
  echo "[run-local] backend .venv 생성 및 의존성 설치"
  python3 -m venv "$ROOT/backend/.venv"
  "$ROOT/backend/.venv/bin/pip" install -q -r "$ROOT/backend/requirements.txt"
fi

echo "[run-local] 단일 앱 → http://localhost:$PORT"
cd "$ROOT/backend"
exec env STATIC_DIR="$ROOT/frontend/dist" \
  .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port "$PORT"
