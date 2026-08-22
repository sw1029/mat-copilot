# mat-copilot backend deployment

Single Container App deployment: FastAPI serves `/api/v1/*`, `/health`, `/ready`, and the Vite static bundle from `STATIC_DIR`.

## Local run

```bash
cd backend
python -m venv .venv
. .venv/bin/activate
pip install -r requirements-dev.txt
LLM_MODE=disabled STATIC_DIR=../frontend/dist python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

`LLM_MODE=disabled` enables deterministic fallback/demo paths, so the sample flow can complete without Copilot.

## Docker

Build context must be the repository root so the image can include frontend and backend:

```bash
docker build -f backend/Dockerfile -t mat-copilot .
docker run --rm -p 8000:8000 -e LLM_MODE=disabled mat-copilot
```

The image builds `frontend/dist` with Node 22, installs Python 3.12 backend deps, pre-downloads the Copilot CLI binary, then runs as a non-root user.

## Azure Developer CLI

```bash
azd auth login
azd env new dev --location koreacentral --subscription <subscription-id>
azd env set GH_COPILOT_TOKEN <github-copilot-token>
azd env set LLM_MODE copilot   # or disabled for demo fallback
azd up
```

Provisioned resources: Azure Container Apps (min/max replica 1), ACR, Log Analytics, Application Insights, Storage Account + private Blob container.

## GitHub Actions deployment

Configure OIDC federated credentials for the repository, then set:

Secrets: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `GH_COPILOT_TOKEN`.
Vars: `AZURE_ENV_NAME`, `AZURE_LOCATION`, optional `LLM_MODE`, optional `COPILOT_MODEL`.

`Backend CI` runs tests. `Deploy to Azure` runs after CI succeeds on `main` or manually.

## Environment variables

| Name | Required | Default | Purpose |
| --- | --- | --- | --- |
| `PORT` | no | `8000` | Uvicorn listen port / Container Apps target port. |
| `LLM_MODE` | no | `copilot` | `copilot` or `disabled`. |
| `COPILOT_MODEL` | no | unset | Copilot model id override. |
| `STATIC_DIR` | no | unset | Directory for SPA static files; Docker sets `/app/static`. |
| `AZURE_STORAGE_CONNECTION_STRING` | no | unset | Enables Blob archive when set. |
| `BLOB_CONTAINER` | no | `mat-copilot` | Blob container name. |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | no | unset | Enables Azure Monitor exporter when set. |
| `MAX_ACTIVE_SESSIONS` | no | `500` | In-memory active-session cap. |
| `RATE_LIMIT_SESSION_CREATE_PER_MINUTE` | no | `5` | Per-IP session creation rate limit. |
| `TTL_SWEEP_INTERVAL_SEC` | no | `300` | Expired-session cleanup interval. |
| `SAMPLES_DIR` | no | `backend/samples` | Demo sample directory. |
| `GH_COPILOT_TOKEN` | copilot mode | unset | Deployment secret for app/runtime integration. |
| `GITHUB_TOKEN` | copilot mode | unset | Same secret, GitHub-compatible alias. |
| `COPILOT_SDK_AUTH_TOKEN` | internal | set by SDK when token option is used | Copilot CLI auth-token env name. |

## Copilot CLI notes

`github-copilot-sdk` resolves the runtime as explicit path, `COPILOT_CLI_PATH`, or auto-download. The cached binary path is `~/.cache/github-copilot-sdk/cli/<version>/copilot`; this image sets `COPILOT_CLI_EXTRACT_DIR=/home/appuser/.cache/github-copilot-sdk/cli/current`. Published Linux wheels download a standalone `copilot` binary; Node is only needed if `COPILOT_CLI_PATH` points at a `.js` entrypoint.

Troubleshooting: `/ready` returns 503 if LLM warm-up fails in `copilot` mode. Check token, outbound access to GitHub releases, and cache directory permissions; switch `LLM_MODE=disabled` for demo fallback.
