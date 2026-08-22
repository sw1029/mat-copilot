"""Azure Blob Storage 아카이브 (TRD §8.2) — 업로드 원본·보고서 스냅샷.

연결 문자열 미설정 시 no-op. 업로드 실패는 로그 후 무시(주 흐름 비차단) —
Blob은 이중 안전망이지 주 저장소가 아니다.
"""

from __future__ import annotations

import asyncio
import logging

from app.observability import log_event

logger = logging.getLogger("app.store.blob")


class BlobArchiver:
    def __init__(self, connection_string: str | None, container: str) -> None:
        self._conn = connection_string
        self._container = container
        self._client = None
        if connection_string:
            try:
                from azure.storage.blob import BlobServiceClient

                self._client = BlobServiceClient.from_connection_string(connection_string)
                try:
                    self._client.create_container(container)
                except Exception:  # noqa: BLE001 — 이미 존재 시 정상
                    pass
                log_event(logger, "blob_archiver_enabled", container=container)
            except Exception:  # noqa: BLE001
                logger.warning("Blob 초기화 실패 — 아카이브 비활성으로 동작", exc_info=True)
                self._client = None

    @property
    def enabled(self) -> bool:
        return self._client is not None

    async def upload(self, path: str, data: bytes, content_type: str = "application/octet-stream") -> None:
        if not self._client:
            return
        try:
            await asyncio.to_thread(self._upload_sync, path, data, content_type)
        except Exception:  # noqa: BLE001
            logger.warning("Blob 업로드 실패 path=%s — 주 흐름은 계속", path, exc_info=True)

    def _upload_sync(self, path: str, data: bytes, content_type: str) -> None:
        from azure.storage.blob import ContentSettings

        blob = self._client.get_blob_client(container=self._container, blob=path)
        blob.upload_blob(data, overwrite=True, content_settings=ContentSettings(content_type=content_type))

    async def delete_prefix(self, prefix: str) -> None:
        """세션 파기 시 Blob 원본도 함께 삭제 (§8.4)."""
        if not self._client:
            return
        try:
            await asyncio.to_thread(self._delete_prefix_sync, prefix)
        except Exception:  # noqa: BLE001
            logger.warning("Blob prefix 삭제 실패 prefix=%s", prefix, exc_info=True)

    def _delete_prefix_sync(self, prefix: str) -> None:
        container = self._client.get_container_client(self._container)
        for blob in container.list_blobs(name_starts_with=prefix):
            container.delete_blob(blob.name)
