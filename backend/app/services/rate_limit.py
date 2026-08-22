"""API-01 rate limit — IP당 분당 5회, 초과 시 429 + Retry-After (TRD §10.7, OQ-13)."""

from __future__ import annotations

import math
import time
from collections import defaultdict, deque

from app.errors import rate_limited


class SlidingWindowRateLimiter:
    def __init__(self, limit_per_minute: int) -> None:
        self.limit = limit_per_minute
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str) -> None:
        now = time.monotonic()
        window = self._hits[key]
        while window and now - window[0] >= 60.0:
            window.popleft()
        if len(window) >= self.limit:
            retry_after = max(1, math.ceil(60.0 - (now - window[0])))
            raise rate_limited(retry_after)
        window.append(now)
        # 메모리 방어: 오래된 키 정리
        if len(self._hits) > 10_000:
            stale = [k for k, v in self._hits.items() if not v or now - v[-1] >= 120.0]
            for k in stale:
                del self._hits[k]
