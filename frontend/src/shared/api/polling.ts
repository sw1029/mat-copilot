import { getJob } from './endpoints';
import { asErrorViewModel, isAbortError, type ApiErrorViewModel } from './errors';
import type { AnalysisJob } from './types';

// TRD/front.md §7.6 폴링 엔진 — 2초 간격, ETag/304, hidden 탭 정지, 실패 백오프 1s→2s→4s 최대 3회

export interface JobPollerCallbacks {
  onUpdate: (job: AnalysisJob) => void;
  onTerminal: (job: AnalysisJob) => void;
  onError: (error: ApiErrorViewModel) => void;
}

export interface JobPoller {
  start(): void;
  stop(): void;
  /** visible 복귀·수동 새로고침 시 즉시 1회 재조회 */
  refreshNow(): void;
}

const POLL_INTERVAL_MS = 2_000;
const BACKOFF_MS = [1_000, 2_000, 4_000];

const TERMINAL_STATUSES: AnalysisJob['status'][] = ['SUCCEEDED', 'FAILED', 'CANCELLED'];

export function isTerminalJobStatus(status: AnalysisJob['status']): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function createJobPoller(
  sessionId: string,
  jobId: string,
  callbacks: JobPollerCallbacks,
  intervalMs: number = POLL_INTERVAL_MS,
): JobPoller {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let etag: string | undefined;
  let failureCount = 0;
  let controller: AbortController | undefined;
  let inFlight = false;

  const isHidden = () =>
    typeof document !== 'undefined' && document.visibilityState === 'hidden';

  async function tick(): Promise<void> {
    if (stopped || inFlight) return;
    if (isHidden()) {
      schedule(intervalMs);
      return;
    }
    inFlight = true;
    controller = new AbortController();
    try {
      const res = await getJob(sessionId, jobId, etag, controller.signal);
      failureCount = 0;
      if (stopped) return;
      if (res.notModified) {
        schedule(intervalMs);
        return;
      }
      etag = res.etag ?? etag;
      const job = res.data;
      callbacks.onUpdate(job);
      if (isTerminalJobStatus(job.status)) {
        stop();
        callbacks.onTerminal(job);
        return;
      }
      schedule(intervalMs);
    } catch (error) {
      if (stopped || isAbortError(error)) return;
      failureCount += 1;
      if (failureCount > BACKOFF_MS.length) {
        stop();
        callbacks.onError(asErrorViewModel(error));
        return;
      }
      schedule(BACKOFF_MS[failureCount - 1]);
    } finally {
      inFlight = false;
    }
  }

  function schedule(delayMs: number): void {
    if (stopped) return;
    timer = setTimeout(() => void tick(), delayMs);
  }

  function onVisibilityChange(): void {
    if (!stopped && document.visibilityState === 'visible') {
      refreshNow();
    }
  }

  function start(): void {
    stopped = false;
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange);
    }
    void tick();
  }

  function stop(): void {
    stopped = true;
    if (timer) clearTimeout(timer);
    controller?.abort();
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    }
  }

  function refreshNow(): void {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    void tick();
  }

  return { start, stop, refreshNow };
}
