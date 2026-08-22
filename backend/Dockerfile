# syntax=docker/dockerfile:1

FROM node:22-alpine AS frontend-build
WORKDIR /src/frontend
COPY frontend/package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000 \
    STATIC_DIR=/app/static \
    SAMPLES_DIR=/app/samples \
    HOME=/home/appuser \
    XDG_CACHE_HOME=/home/appuser/.cache \
    COPILOT_CLI_EXTRACT_DIR=/home/appuser/.cache/github-copilot-sdk/cli/current

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN groupadd --system appuser \
    && useradd --system --gid appuser --create-home --home-dir /home/appuser appuser

COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

ARG COPILOT_SKIP_CLI_PREDOWNLOAD=0
RUN mkdir -p "$COPILOT_CLI_EXTRACT_DIR" \
    && chown -R appuser:appuser /home/appuser
USER appuser
RUN mkdir -p "$COPILOT_CLI_EXTRACT_DIR" \
    && if [ "$COPILOT_SKIP_CLI_PREDOWNLOAD" != "1" ]; then python -m copilot download-runtime; fi

COPY --chown=appuser:appuser backend/app ./app
COPY --chown=appuser:appuser backend/samples ./samples
COPY --chown=appuser:appuser --from=frontend-build /src/frontend/dist ./static
EXPOSE 8000

CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
