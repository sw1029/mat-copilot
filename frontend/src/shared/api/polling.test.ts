import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { getJob } from './endpoints';
import { createJobPoller, isTerminalJobStatus } from './polling';
import type { AnalysisJob } from './types';

vi.mock('./endpoints', () => ({ getJob: vi.fn() }));

const mockGetJob = getJob as unknown as Mock;

function job(status: AnalysisJob['status'], stage?: AnalysisJob['stage']): AnalysisJob {
  return {
    jobId: 'job-1',
    kind: 'ANALYSIS',
    status,
    stage,
    completedStages: [],
    progress: null,
    error: null,
  };
}

function ok(data: AnalysisJob, etag = 'v1') {
  return { status: 200, data, etag, notModified: false };
}

describe('createJobPoller (TRD §7.6)', () => {
  let callbacks: { onUpdate: Mock; onTerminal: Mock; onError: Mock };

  beforeEach(() => {
    vi.useFakeTimers();
    mockGetJob.mockReset();
    callbacks = { onUpdate: vi.fn(), onTerminal: vi.fn(), onError: vi.fn() };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('시작 즉시 1회 조회 후 2초 간격으로 폴링한다', async () => {
    mockGetJob.mockResolvedValue(ok(job('RUNNING', 'INGEST')));
    const poller = createJobPoller('s-1', 'job-1', callbacks);
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(mockGetJob).toHaveBeenCalledTimes(1);
    expect(callbacks.onUpdate).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2_000);
    expect(mockGetJob).toHaveBeenCalledTimes(2);
    poller.stop();
  });

  it('If-None-Match로 이전 ETag를 전달하고 304면 onUpdate를 생략한다', async () => {
    mockGetJob
      .mockResolvedValueOnce(ok(job('RUNNING', 'INGEST'), 'v1'))
      .mockResolvedValueOnce({ status: 304, data: undefined, etag: 'v1', notModified: true })
      .mockResolvedValue(ok(job('RUNNING', 'DRIFT'), 'v2'));
    const poller = createJobPoller('s-1', 'job-1', callbacks);
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(2_000); // 304
    expect(callbacks.onUpdate).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2_000); // 새 버전
    expect(callbacks.onUpdate).toHaveBeenCalledTimes(2);
    expect(mockGetJob.mock.calls[1][2]).toBe('v1');
    expect(mockGetJob.mock.calls[2][2]).toBe('v1');
    poller.stop();
  });

  it('터미널 상태(SUCCEEDED)에서 폴링을 멈추고 onTerminal을 호출한다', async () => {
    mockGetJob
      .mockResolvedValueOnce(ok(job('RUNNING', 'REPORT')))
      .mockResolvedValueOnce(ok(job('SUCCEEDED')));
    const poller = createJobPoller('s-1', 'job-1', callbacks);
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(callbacks.onTerminal).toHaveBeenCalledTimes(1);
    expect(callbacks.onTerminal.mock.calls[0][0].status).toBe('SUCCEEDED');

    await vi.advanceTimersByTimeAsync(10_000);
    expect(mockGetJob).toHaveBeenCalledTimes(2); // 이후 조회 없음
  });

  it('연속 실패 시 1s→2s→4s 백오프 후 onError 1회', async () => {
    mockGetJob.mockRejectedValue(new Error('network down'));
    const poller = createJobPoller('s-1', 'job-1', callbacks);
    poller.start();
    await vi.advanceTimersByTimeAsync(0); // 실패 1
    expect(callbacks.onError).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000); // 실패 2
    await vi.advanceTimersByTimeAsync(2_000); // 실패 3
    expect(callbacks.onError).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(4_000); // 실패 4 → 중단
    expect(callbacks.onError).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mockGetJob).toHaveBeenCalledTimes(4);
  });

  it('성공하면 실패 카운트가 리셋된다', async () => {
    mockGetJob
      .mockRejectedValueOnce(new Error('flaky'))
      .mockResolvedValue(ok(job('RUNNING', 'INGEST')));
    const poller = createJobPoller('s-1', 'job-1', callbacks);
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1_000); // 백오프 후 성공
    expect(callbacks.onUpdate).toHaveBeenCalledTimes(1);
    expect(callbacks.onError).not.toHaveBeenCalled();
    poller.stop();
  });

  it('stop 이후에는 어떤 콜백도 호출되지 않는다', async () => {
    mockGetJob.mockResolvedValue(ok(job('RUNNING', 'INGEST')));
    const poller = createJobPoller('s-1', 'job-1', callbacks);
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    poller.stop();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(mockGetJob).toHaveBeenCalledTimes(1);
  });

  it('hidden 탭에서는 조회를 건너뛰고, visible 복귀 시 즉시 재조회한다', async () => {
    mockGetJob.mockResolvedValue(ok(job('RUNNING', 'INGEST')));
    let visibility: DocumentVisibilityState = 'hidden';
    const spy = vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);

    const poller = createJobPoller('s-1', 'job-1', callbacks);
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(mockGetJob).not.toHaveBeenCalled(); // hidden 동안 미조회

    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(mockGetJob).toHaveBeenCalledTimes(1);

    poller.stop();
    spy.mockRestore();
  });
});

describe('isTerminalJobStatus', () => {
  it('SUCCEEDED/FAILED/CANCELLED만 터미널', () => {
    expect(isTerminalJobStatus('SUCCEEDED')).toBe(true);
    expect(isTerminalJobStatus('FAILED')).toBe(true);
    expect(isTerminalJobStatus('CANCELLED')).toBe(true);
    expect(isTerminalJobStatus('RUNNING')).toBe(false);
    expect(isTerminalJobStatus('QUEUED')).toBe(false);
  });
});
