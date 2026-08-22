import { ApiClientError, toErrorViewModel, isAbortError } from './errors';
import type { ApiError } from './types';

// TRD/front.md §6.1 — 모든 fetch는 이 클라이언트를 통과한다. raw fetch 직접 사용 금지.

export const TOKEN_STORAGE_KEY = 'matcopilot.sessionToken';
// API-02 경로 파라미터 복구용 보조 키. 토큰 payload 파싱 금지 원칙(TRD §5.5)을 지키기 위해
// 비밀값이 아닌 sessionId(UUID)만 별도 보관한다. 질문/답변/보고서 전문은 저장하지 않는다.
export const SESSION_ID_STORAGE_KEY = 'matcopilot.sessionId';
export const API_BASE = '/api/v1';

export type TimeoutCategory = 'query' | 'interview' | 'upload' | 'analysisStart';

const TIMEOUT_MS: Record<TimeoutCategory, number> = {
  query: 10_000,
  interview: 60_000,
  upload: 120_000,
  analysisStart: 30_000,
};

const RETRY_DELAYS_MS = [1_000, 2_000, 4_000];

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  formData?: FormData;
  signal?: AbortSignal;
  timeoutCategory?: TimeoutCategory;
  /** 멱등 요청만 자동 재시도한다 (GET, API-06 답변 제출). */
  idempotent?: boolean;
  /** API-11 폴링 ETag 캐시용 */
  etag?: string;
  skipAuth?: boolean;
}

export interface ApiResponse<T> {
  status: number;
  data: T;
  etag?: string;
  notModified: boolean;
}

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storeToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } catch {
    // storage 불가 환경에서는 메모리 세션만으로 동작한다.
  }
}

export function clearStoredToken(): void {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(SESSION_ID_STORAGE_KEY);
  } catch {
    // no-op: 제거 실패 시에도 흐름을 막지 않는다.
  }
}

export function getStoredSessionId(): string | null {
  try {
    return localStorage.getItem(SESSION_ID_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storeSessionId(sessionId: string): void {
  try {
    localStorage.setItem(SESSION_ID_STORAGE_KEY, sessionId);
  } catch {
    // storage 불가 환경에서는 메모리 세션만으로 동작한다.
  }
}

// mock 모드: 백엔드 부재 시 샘플 체험을 위한 브라우저 내 mock 백엔드 (TRD §7.2)
type MockHandler = (
  path: string,
  init: { method: string; body?: unknown; formData?: FormData; headers: Record<string, string> },
) => Promise<{ status: number; body?: unknown; headers?: Record<string, string> }>;

let mockHandler: MockHandler | null = null;

export function enableMockBackend(handler: MockHandler): void {
  mockHandler = handler;
}

export function disableMockBackend(): void {
  mockHandler = null;
}

export function isMockBackendEnabled(): boolean {
  return mockHandler !== null;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

function combineSignals(external: AbortSignal | undefined, timeoutMs: number): {
  signal: AbortSignal;
  cleanup: () => void;
  didTimeout: () => boolean;
} {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onExternalAbort = () => controller.abort();
  external?.addEventListener('abort', onExternalAbort, { once: true });
  if (external?.aborted) controller.abort();
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      external?.removeEventListener('abort', onExternalAbort);
    },
    didTimeout: () => timedOut,
  };
}

async function parseErrorBody(response: Response): Promise<Partial<ApiError> | undefined> {
  try {
    const json = (await response.json()) as { error?: Partial<ApiError> };
    return json?.error;
  } catch {
    return undefined;
  }
}

function parseRetryAfter(response: Response): number | undefined {
  const header = response.headers.get('Retry-After');
  if (!header) return undefined;
  const seconds = Number(header);
  return Number.isFinite(seconds) ? seconds : undefined;
}

async function executeOnce<T>(path: string, options: RequestOptions): Promise<ApiResponse<T>> {
  const method = options.method ?? 'GET';

  if (mockHandler) {
    const headers: Record<string, string> = {};
    const token = getStoredToken();
    if (token && !options.skipAuth) headers['X-Session-Token'] = token;
    if (options.etag) headers['If-None-Match'] = options.etag;
    const result = await mockHandler(path, {
      method,
      body: options.body,
      formData: options.formData,
      headers,
    });
    if (result.status === 304) {
      return { status: 304, data: undefined as T, etag: options.etag, notModified: true };
    }
    if (result.status >= 400) {
      const errorBody = (result.body as { error?: Partial<ApiError> } | undefined)?.error;
      const retryAfter = result.headers?.['Retry-After'];
      throw new ApiClientError(
        toErrorViewModel(errorBody, result.status, retryAfter ? Number(retryAfter) : undefined),
      );
    }
    return {
      status: result.status,
      data: result.body as T,
      etag: result.headers?.ETag,
      notModified: false,
    };
  }

  const timeoutMs = TIMEOUT_MS[options.timeoutCategory ?? 'query'];
  const { signal, cleanup, didTimeout } = combineSignals(options.signal, timeoutMs);

  const headers: Record<string, string> = {};
  const token = getStoredToken();
  if (token && !options.skipAuth) headers['X-Session-Token'] = token;
  if (options.etag) headers['If-None-Match'] = options.etag;

  let body: BodyInit | undefined;
  if (options.formData) {
    body = options.formData;
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { method, headers, body, signal });
  } catch (error) {
    cleanup();
    if (isAbortError(error) && didTimeout()) {
      throw new ApiClientError(
        toErrorViewModel({ code: 'TIMEOUT', message: '', retryable: true, traceId: '' }),
      );
    }
    if (isAbortError(error)) throw error;
    throw new ApiClientError(
      toErrorViewModel({ code: 'NETWORK_ERROR', message: '', retryable: true, traceId: '' }),
    );
  }
  cleanup();

  if (response.status === 304) {
    return { status: 304, data: undefined as T, etag: options.etag, notModified: true };
  }

  if (!response.ok) {
    const errorBody = await parseErrorBody(response);
    throw new ApiClientError(
      toErrorViewModel(errorBody, response.status, parseRetryAfter(response)),
    );
  }

  if (response.status === 204) {
    return { status: 204, data: undefined as T, notModified: false };
  }

  try {
    const data = (await response.json()) as T;
    return {
      status: response.status,
      data,
      etag: response.headers.get('ETag') ?? undefined,
      notModified: false,
    };
  } catch {
    throw new ApiClientError(
      toErrorViewModel({ code: 'PARSE_ERROR', message: '', retryable: true, traceId: '' }),
    );
  }
}

/**
 * 중앙 요청 함수. 멱등 요청은 네트워크/5xx 오류에 한해 1s→2s→4s 최대 3회 재시도.
 * 429는 Retry-After를 우선하며 1회만 자동 재시도한다.
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
  const maxRetries = options.idempotent ? RETRY_DELAYS_MS.length : 0;
  let attempt = 0;
  let rateLimitedRetried = false;

  for (;;) {
    try {
      return await executeOnce<T>(path, options);
    } catch (error) {
      if (isAbortError(error)) throw error;
      if (!(error instanceof ApiClientError)) throw error;

      const vm = error.viewModel;
      if (vm.code === 'RATE_LIMITED' && vm.retryAfterSec !== undefined && !rateLimitedRetried && options.idempotent) {
        rateLimitedRetried = true;
        await sleep(vm.retryAfterSec * 1000, options.signal);
        continue;
      }

      const isRetryableClass =
        vm.code === 'NETWORK_ERROR' ||
        vm.code === 'TIMEOUT' ||
        (vm.httpStatus !== undefined && vm.httpStatus >= 500);

      if (options.idempotent && isRetryableClass && attempt < maxRetries) {
        await sleep(RETRY_DELAYS_MS[attempt], options.signal);
        attempt += 1;
        continue;
      }
      throw error;
    }
  }
}
