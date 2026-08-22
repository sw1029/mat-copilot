# mat-copilot

기획 의도와 실제 결과물 사이의 어긋남(drift)을 AI 인터뷰·분석으로 점검하는 웹앱.

- 통신규약(SoT): [SCHEMA/schema.md](SCHEMA/schema.md) · 설계: [PRD/](PRD/) · [TRD/](TRD/)
- backend: FastAPI (`backend/`) · frontend: React + Vite (`frontend/`)

## 로컬 기동

```bash
# 개발 모드 — backend(:8000, --reload) + frontend(vite :5173, /api 프록시) 일괄 기동
scripts/dev.sh

# 단일 앱 모드 — frontend 빌드 후 backend가 정적 서빙(SPA fallback)하는 배포 동형 구성
scripts/run-local.sh            # http://localhost:8000
SKIP_BUILD=1 scripts/run-local.sh   # 기존 frontend/dist 재사용
LLM_MODE=disabled scripts/run-local.sh   # LLM 없이 기동
```

의존성(.venv, node_modules)은 스크립트가 없으면 자동 설치한다.

## 테스트

```bash
# backend 단위/계약 테스트
cd backend && .venv/bin/python -m pytest -q

# frontend 단위/컴포넌트
cd frontend && npm test

# E2E (mock fallback 여정 — vite dev 서버 대상)
cd frontend && npm run test:e2e

# 배포 전 실통합 E2E — mock 없이 실제 backend가 빌드된 SPA를 서빙하는 단일 앱 대상
cd frontend && npm run test:e2e:integration
```

실통합 E2E는 `scripts/serve-integration.sh`(:8100, `LLM_MODE=disabled`)를 Playwright가
기동·종료하며, CI 게이트는 [.github/workflows/integration.yml](.github/workflows/integration.yml)
— 배포 워크플로는 이 워크플로를 `workflow_call`/`needs`로 연결해 통과 시에만 배포한다.
