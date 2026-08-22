"""환경 설정 — 시크릿은 환경변수로만 주입 (TRD §10.5, Container Apps secrets)."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from app import constants


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    return int(raw) if raw else default


@dataclass
class Settings:
    # LLM (TRD §5.2 — 모델 ID는 환경변수 주입)
    copilot_model: str | None = field(default_factory=lambda: os.environ.get("COPILOT_MODEL") or None)
    llm_mode: str = field(default_factory=lambda: os.environ.get("LLM_MODE", "copilot"))  # copilot|disabled

    # Azure (선택 — 미설정 시 해당 기능 비활성)
    blob_connection_string: str | None = field(
        default_factory=lambda: os.environ.get("AZURE_STORAGE_CONNECTION_STRING") or None
    )
    blob_container: str = field(default_factory=lambda: os.environ.get("BLOB_CONTAINER", "mat-copilot"))
    appinsights_connection_string: str | None = field(
        default_factory=lambda: os.environ.get("APPLICATIONINSIGHTS_CONNECTION_STRING") or None
    )

    # 프론트 정적 서빙 (TRD §12.1 단일 앱) — 미존재 시 미장착
    static_dir: str | None = field(default_factory=lambda: os.environ.get("STATIC_DIR") or None)

    # 방어 상한 (TRD §8.4/§10.7 — 테스트에서 재정의 가능)
    max_active_sessions: int = field(
        default_factory=lambda: _env_int("MAX_ACTIVE_SESSIONS", constants.MAX_ACTIVE_SESSIONS)
    )
    rate_limit_session_create_per_minute: int = field(
        default_factory=lambda: _env_int(
            "RATE_LIMIT_SESSION_CREATE_PER_MINUTE", constants.RATE_LIMIT_SESSION_CREATE_PER_MINUTE
        )
    )
    ttl_sweep_interval_sec: int = field(
        default_factory=lambda: _env_int("TTL_SWEEP_INTERVAL_SEC", constants.TTL_SWEEP_INTERVAL_SEC)
    )

    # 데모 샘플 경로 (FR-12) — 샘플 지문·사전 계산 보고서 디렉터리
    samples_dir: str = field(
        default_factory=lambda: os.environ.get(
            "SAMPLES_DIR", str(Path(__file__).resolve().parent.parent / "samples")
        )
    )

    def resolved_static_dir(self) -> Path | None:
        if not self.static_dir:
            return None
        p = Path(self.static_dir)
        return p if p.is_dir() else None
