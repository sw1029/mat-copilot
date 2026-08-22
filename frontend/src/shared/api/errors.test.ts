import { describe, expect, it } from 'vitest';
import {
  ApiClientError,
  asErrorViewModel,
  isAbortError,
  isSessionGoneError,
  toErrorViewModel,
} from './errors';

describe('toErrorViewModel (TRD §6.6 오류 매핑)', () => {
  it('서버 code/message/traceId를 그대로 매핑한다', () => {
    const vm = toErrorViewModel(
      { code: 'INVALID_INPUT', message: '입력 오류', retryable: false, traceId: 't-1' },
      400,
    );
    expect(vm.code).toBe('INVALID_INPUT');
    expect(vm.message).toBe('입력 오류');
    expect(vm.retryable).toBe(false);
    expect(vm.traceId).toBe('t-1');
    expect(vm.httpStatus).toBe(400);
  });

  it('message 부재 시 코드별 한국어 fallback 문구 사용', () => {
    const vm = toErrorViewModel({ code: 'SESSION_EXPIRED', message: '', retryable: false, traceId: '' }, 410);
    expect(vm.message).toBe('세션이 만료되었어요. 새로 시작해 주세요.');
  });

  it('body 없는 오류는 HTTP status로 코드 추론 (404/410/429/502)', () => {
    expect(toErrorViewModel(undefined, 404).code).toBe('SESSION_NOT_FOUND');
    expect(toErrorViewModel(undefined, 410).code).toBe('SESSION_EXPIRED');
    expect(toErrorViewModel(undefined, 429).code).toBe('RATE_LIMITED');
    expect(toErrorViewModel(undefined, 502).code).toBe('LLM_UPSTREAM_ERROR');
    expect(toErrorViewModel(undefined, 500).code).toBe('INTERNAL');
  });

  it('알 수 없는 코드는 INTERNAL 정책으로 fallback', () => {
    const vm = toErrorViewModel({ code: 'SOMETHING_NEW' as never, message: '', retryable: undefined as never });
    expect(vm.message).toBe('알 수 없는 오류가 발생했어요. 잠시 후 다시 시도해 주세요.');
  });

  it('PIPELINE_STAGE_FAILED(job.error 전용)는 문서 문구 + 재시도 가능', () => {
    const vm = toErrorViewModel({ code: 'PIPELINE_STAGE_FAILED', message: '', retryable: true, traceId: 't-9' });
    expect(vm.message).toBe('분석이 중단됐어요. 완료된 단계는 보존되어 이어서 재시도할 수 있어요.');
    expect(vm.retryable).toBe(true);
    expect(vm.autoRetryable).toBe(false);
  });

  it('JOB_NOT_CANCELLABLE은 상태 새로고침 재시도 가능(TRD §6.6)', () => {
    const vm = toErrorViewModel({ code: 'JOB_NOT_CANCELLABLE', message: '', retryable: undefined as never });
    expect(vm.message).toBe('이미 끝난 작업은 취소할 수 없어요. 최신 상태를 불러올게요.');
    expect(vm.retryable).toBe(true);
  });

  it('RATE_LIMITED는 retryAfterSec을 전달한다', () => {
    const vm = toErrorViewModel(undefined, 429, 42);
    expect(vm.retryAfterSec).toBe(42);
    expect(vm.retryable).toBe(true);
  });

  it('LLM_UPSTREAM_ERROR/INTERNAL만 autoRetryable', () => {
    expect(toErrorViewModel(undefined, 502).autoRetryable).toBe(true);
    expect(toErrorViewModel(undefined, 500).autoRetryable).toBe(true);
    expect(toErrorViewModel(undefined, 429).autoRetryable).toBe(false);
    expect(toErrorViewModel(undefined, 404).autoRetryable).toBe(false);
  });
});

describe('isSessionGoneError', () => {
  it('SESSION_NOT_FOUND/SESSION_EXPIRED만 true', () => {
    expect(isSessionGoneError(toErrorViewModel(undefined, 404))).toBe(true);
    expect(isSessionGoneError(toErrorViewModel(undefined, 410))).toBe(true);
    expect(isSessionGoneError(toErrorViewModel(undefined, 500))).toBe(false);
  });
});

describe('asErrorViewModel', () => {
  it('ApiClientError는 내장 viewModel을 반환한다', () => {
    const vm = toErrorViewModel(undefined, 429, 3);
    expect(asErrorViewModel(new ApiClientError(vm))).toBe(vm);
  });
  it('AbortError는 취소 문구로 변환한다', () => {
    const vm = asErrorViewModel(new DOMException('Aborted', 'AbortError'));
    expect(vm.message).toBe('요청이 취소됐어요.');
  });
  it('알 수 없는 예외는 INTERNAL', () => {
    expect(asErrorViewModel(new Error('boom')).code).toBe('INTERNAL');
  });
});

describe('isAbortError', () => {
  it('AbortError DOMException만 true', () => {
    expect(isAbortError(new DOMException('Aborted', 'AbortError'))).toBe(true);
    expect(isAbortError(new Error('x'))).toBe(false);
  });
});
