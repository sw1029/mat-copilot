"""오류 모델 — SCHEMA §5. 모든 오류는 {"error": ApiError} body로 반환.

silent catch 금지 (TRD §11.2): 예외는 구조화 로그 기록 후 ApiException으로
변환하거나 상위로 전파한다.
"""

from __future__ import annotations

from typing import Any


class ApiException(Exception):
    """SCHEMA §5 오류 코드 표에 대응하는 도메인 예외."""

    def __init__(
        self,
        code: str,
        http_status: int,
        message: str,
        *,
        retryable: bool = False,
        details: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.http_status = http_status
        self.message = message
        self.retryable = retryable
        self.details = details
        self.headers = headers or {}


def invalid_input(message: str, details: dict[str, Any] | None = None) -> ApiException:
    return ApiException("INVALID_INPUT", 400, message, details=details)


def session_not_found() -> ApiException:
    # 존재 여부 비노출 (TRD §10.1) — 토큰 불일치·부재 모두 동일 응답
    return ApiException("SESSION_NOT_FOUND", 404, "세션을 찾을 수 없습니다.")


def session_expired() -> ApiException:
    return ApiException("SESSION_EXPIRED", 410, "세션이 만료되어 데이터가 파기되었습니다.")


def unsupported_format(message: str = "지원하지 않는 파일 형식입니다. (.docx/.txt/.md만 허용)") -> ApiException:
    return ApiException("UNSUPPORTED_FORMAT", 415, message)


def payload_too_large(message: str) -> ApiException:
    return ApiException("PAYLOAD_TOO_LARGE", 413, message)


def interview_not_active(message: str = "인터뷰가 활성 상태가 아닙니다.") -> ApiException:
    return ApiException("INTERVIEW_NOT_ACTIVE", 409, message)


def required_questions_pending(pending_question_ids: list[str]) -> ApiException:
    return ApiException(
        "REQUIRED_QUESTIONS_PENDING",
        409,
        f"필수 질문 {len(pending_question_ids)}개가 남아 있습니다. confirm=true로 종료를 강행할 수 있습니다.",
        details={"pendingQuestionIds": pending_question_ids},
    )


def analysis_precondition_failed(message: str) -> ApiException:
    return ApiException("ANALYSIS_PRECONDITION_FAILED", 409, message)


def job_not_found() -> ApiException:
    return ApiException("JOB_NOT_FOUND", 404, "job을 찾을 수 없습니다.")


def job_not_retryable() -> ApiException:
    return ApiException("JOB_NOT_RETRYABLE", 409, "실패/취소 상태의 job만 재시도할 수 있습니다.")


def job_not_cancellable() -> ApiException:
    return ApiException("JOB_NOT_CANCELLABLE", 409, "이미 종결된 job은 취소할 수 없습니다.")


def llm_upstream_error(message: str = "LLM 호출에 실패했습니다. 잠시 후 다시 시도해 주세요.") -> ApiException:
    return ApiException("LLM_UPSTREAM_ERROR", 502, message, retryable=True)


def rate_limited(retry_after_sec: int) -> ApiException:
    return ApiException(
        "RATE_LIMITED",
        429,
        "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
        retryable=True,
        headers={"Retry-After": str(retry_after_sec)},
    )


def internal_error(message: str = "서버 내부 오류가 발생했습니다.") -> ApiException:
    return ApiException("INTERNAL", 500, message, retryable=True)


class LlmUnavailableError(Exception):
    """LLM 호출 실패(타임아웃·재시도 소진) — 호출부가 폴백/FAILED 처리를 결정한다."""
