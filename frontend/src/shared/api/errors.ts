import type { ApiError } from './types';

// TRD/front.md §6.6 — 오류 코드별 UI 매핑. silent catch 금지 원칙의 표준 뷰모델.

export interface ApiErrorViewModel {
  code: ApiError['code'] | 'NETWORK_ERROR' | 'TIMEOUT' | 'PARSE_ERROR';
  message: string;
  retryable: boolean;
  autoRetryable: boolean;
  traceId?: string;
  httpStatus?: number;
  retryAfterSec?: number;
  details?: Record<string, unknown>;
}

interface ErrorUiPolicy {
  fallbackMessage: string;
  retryable: boolean;
  autoRetryable: boolean;
}

const ERROR_UI_MAP: Record<string, ErrorUiPolicy> = {
  INVALID_INPUT: {
    fallbackMessage: '입력값을 확인해 주세요.',
    retryable: false,
    autoRetryable: false,
  },
  SESSION_NOT_FOUND: {
    fallbackMessage: '진행 중인 세션을 찾을 수 없어요.',
    retryable: false,
    autoRetryable: false,
  },
  SESSION_EXPIRED: {
    fallbackMessage: '세션이 만료되었어요. 새로 시작해 주세요.',
    retryable: false,
    autoRetryable: false,
  },
  UNSUPPORTED_FORMAT: {
    fallbackMessage: '지원하지 않는 형식이에요. docx/txt/md 또는 지원 파일을 사용해 주세요.',
    retryable: false,
    autoRetryable: false,
  },
  PAYLOAD_TOO_LARGE: {
    fallbackMessage: '파일이 너무 커요. 허용 크기 이하로 줄여 주세요.',
    retryable: false,
    autoRetryable: false,
  },
  INTERVIEW_NOT_ACTIVE: {
    fallbackMessage: '현재 답변할 수 있는 인터뷰가 아니에요. 최신 상태를 불러올게요.',
    retryable: true,
    autoRetryable: false,
  },
  REQUIRED_QUESTIONS_PENDING: {
    fallbackMessage: '아직 답변하지 않은 필수 질문이 있어요.',
    retryable: false,
    autoRetryable: false,
  },
  ANALYSIS_PRECONDITION_FAILED: {
    fallbackMessage: '분석을 시작하려면 의도와 결과물이 필요해요.',
    retryable: false,
    autoRetryable: false,
  },
  JOB_NOT_FOUND: {
    fallbackMessage: '분석 작업을 찾을 수 없어요.',
    retryable: true,
    autoRetryable: false,
  },
  JOB_NOT_RETRYABLE: {
    fallbackMessage: '이 작업은 재시도할 수 없어요. 최신 상태를 확인해 주세요.',
    retryable: true,
    autoRetryable: false,
  },
  JOB_NOT_CANCELLABLE: {
    fallbackMessage: '이미 끝난 작업은 취소할 수 없어요. 최신 상태를 불러올게요.',
    retryable: true,
    autoRetryable: false,
  },
  // API-11 job.error 전용 — HTTP 코드가 아닌 파이프라인 단계 실패 (SCHEMA §5)
  PIPELINE_STAGE_FAILED: {
    fallbackMessage: '분석이 중단됐어요. 완료된 단계는 보존되어 이어서 재시도할 수 있어요.',
    retryable: true,
    autoRetryable: false,
  },
  LLM_UPSTREAM_ERROR: {
    fallbackMessage: 'AI 처리 중 일시 오류가 발생했어요.',
    retryable: true,
    autoRetryable: true,
  },
  RATE_LIMITED: {
    fallbackMessage: '요청이 많아요. 잠시 후 다시 시도해 주세요.',
    retryable: true,
    autoRetryable: false,
  },
  INTERNAL: {
    fallbackMessage: '알 수 없는 오류가 발생했어요. 잠시 후 다시 시도해 주세요.',
    retryable: true,
    autoRetryable: true,
  },
  NETWORK_ERROR: {
    fallbackMessage: '네트워크 연결을 확인해 주세요.',
    retryable: true,
    autoRetryable: true,
  },
  TIMEOUT: {
    fallbackMessage: '요청 시간이 초과됐어요. 다시 시도해 주세요.',
    retryable: true,
    autoRetryable: true,
  },
  PARSE_ERROR: {
    fallbackMessage: '서버 응답을 해석하지 못했어요.',
    retryable: true,
    autoRetryable: false,
  },
};

const DEFAULT_POLICY: ErrorUiPolicy = ERROR_UI_MAP.INTERNAL;

/** 서버 ApiError 또는 클라이언트 파생 코드(NETWORK/TIMEOUT/PARSE)를 담는 원시 입력 */
type RawErrorInput = Partial<Omit<ApiError, 'code'>> & { code?: ApiErrorViewModel['code'] };

export function toErrorViewModel(
  raw: RawErrorInput | undefined,
  httpStatus?: number,
  retryAfterSec?: number,
): ApiErrorViewModel {
  const code = raw?.code ?? inferCodeFromStatus(httpStatus);
  const policy = ERROR_UI_MAP[code] ?? DEFAULT_POLICY;
  return {
    code,
    message: raw?.message || policy.fallbackMessage,
    retryable: raw?.retryable ?? policy.retryable,
    autoRetryable: policy.autoRetryable,
    traceId: raw?.traceId,
    httpStatus,
    retryAfterSec,
    details: raw?.details,
  };
}

function inferCodeFromStatus(status?: number): ApiError['code'] {
  switch (status) {
    case 400:
      return 'INVALID_INPUT';
    case 404:
      return 'SESSION_NOT_FOUND';
    case 410:
      return 'SESSION_EXPIRED';
    case 413:
      return 'PAYLOAD_TOO_LARGE';
    case 415:
      return 'UNSUPPORTED_FORMAT';
    case 429:
      return 'RATE_LIMITED';
    case 502:
      return 'LLM_UPSTREAM_ERROR';
    default:
      return 'INTERNAL';
  }
}

export function isSessionGoneError(error: ApiErrorViewModel): boolean {
  return error.code === 'SESSION_NOT_FOUND' || error.code === 'SESSION_EXPIRED';
}

export class ApiClientError extends Error {
  readonly viewModel: ApiErrorViewModel;

  constructor(viewModel: ApiErrorViewModel) {
    super(viewModel.message);
    this.name = 'ApiClientError';
    this.viewModel = viewModel;
  }
}

export function asErrorViewModel(error: unknown): ApiErrorViewModel {
  if (error instanceof ApiClientError) return error.viewModel;
  if (error instanceof DOMException && error.name === 'AbortError') {
    return {
      code: 'NETWORK_ERROR',
      message: '요청이 취소됐어요.',
      retryable: true,
      autoRetryable: false,
    };
  }
  return {
    code: 'INTERNAL',
    message: ERROR_UI_MAP.INTERNAL.fallbackMessage,
    retryable: true,
    autoRetryable: false,
  };
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
