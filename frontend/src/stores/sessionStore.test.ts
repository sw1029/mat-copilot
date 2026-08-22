import { beforeEach, describe, expect, it } from 'vitest';
import { SESSION_ID_STORAGE_KEY, TOKEN_STORAGE_KEY } from '../shared/api/apiClient';
import type { Session, SessionStatus } from '../shared/api/types';
import {
  DEFAULT_SETTINGS,
  mapServerStatus,
  routeForAppStatus,
  useSessionStore,
} from './sessionStore';

function session(status: SessionStatus, extra: Partial<Session> = {}): Session {
  return {
    sessionId: 's-1',
    status,
    settings: { confuseThreshold: 0.4, timeLimitSec: 600 },
    createdAt: '2026-01-01T00:00:00Z',
    expiresAt: '2026-01-02T00:00:00Z',
    ...extra,
  };
}

beforeEach(() => {
  localStorage.clear();
  useSessionStore.setState({
    sessionId: undefined,
    sessionToken: undefined,
    appStatus: 'INITIAL',
    serverStatus: undefined,
    settings: { ...DEFAULT_SETTINGS },
    activeJobId: undefined,
    planId: undefined,
    expiresAt: undefined,
    interviewStartedAt: undefined,
    sampleMode: false,
    bootstrapped: false,
    lastError: undefined,
  });
});

describe('mapServerStatus (TRD §5.1)', () => {
  it('서버 상태 7종 → 프론트 AppStatus 매핑', () => {
    expect(mapServerStatus('CREATED')).toBe('INITIAL');
    expect(mapServerStatus('INTERVIEWING')).toBe('INTERVIEWING');
    expect(mapServerStatus('INTERVIEW_DONE')).toBe('SUBMITTING');
    expect(mapServerStatus('ANALYZING')).toBe('ANALYZING');
    expect(mapServerStatus('REPORT_READY')).toBe('COMPLETED');
    expect(mapServerStatus('FAILED')).toBe('FAILED');
    expect(mapServerStatus('EXPIRED')).toBe('EXPIRED');
  });
});

describe('routeForAppStatus (TRD §4.5 복구 라우팅)', () => {
  it('상태별 경로', () => {
    expect(routeForAppStatus('INITIAL')).toBe('/');
    expect(routeForAppStatus('INTERVIEWING')).toBe('/interview');
    expect(routeForAppStatus('SUBMITTING')).toBe('/artifacts');
    expect(routeForAppStatus('COMPLETED')).toBe('/report');
    expect(routeForAppStatus('EXPIRED')).toBe('/expired');
    expect(routeForAppStatus('FAILED')).toBe('/');
  });
  it('ANALYZING은 jobId가 있으면 /analysis/:jobId, 없으면 /artifacts', () => {
    expect(routeForAppStatus('ANALYZING', 'job-9')).toBe('/analysis/job-9');
    expect(routeForAppStatus('ANALYZING')).toBe('/artifacts');
  });
});

describe('useSessionStore', () => {
  it('setCreated는 토큰과 sessionId를 localStorage에 영속한다', () => {
    useSessionStore.getState().setCreated(session('CREATED'), 'tok-123');
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBe('tok-123');
    expect(localStorage.getItem(SESSION_ID_STORAGE_KEY)).toBe('s-1');
    const st = useSessionStore.getState();
    expect(st.appStatus).toBe('INITIAL');
    expect(st.settings.confuseThreshold).toBe(0.4);
  });

  it('setFromServer는 서버 truth로 상태를 덮어쓴다', () => {
    useSessionStore.getState().setCreated(session('CREATED'), 'tok');
    useSessionStore.getState().setFromServer(session('ANALYZING', { activeJobId: 'job-7' }));
    const st = useSessionStore.getState();
    expect(st.serverStatus).toBe('ANALYZING');
    expect(st.appStatus).toBe('ANALYZING');
    expect(st.activeJobId).toBe('job-7');
  });

  it("clearSession('expired')는 EXPIRED 상태 + 저장소 정리", () => {
    useSessionStore.getState().setCreated(session('INTERVIEWING'), 'tok');
    useSessionStore.getState().clearSession('expired');
    const st = useSessionStore.getState();
    expect(st.appStatus).toBe('EXPIRED');
    expect(st.sessionToken).toBeUndefined();
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(SESSION_ID_STORAGE_KEY)).toBeNull();
  });

  it("clearSession('new-session')은 INITIAL로 되돌리고 sampleMode를 끈다", () => {
    useSessionStore.getState().setCreated(session('REPORT_READY'), 'tok');
    useSessionStore.getState().setSampleMode(true);
    useSessionStore.getState().clearSession('new-session');
    const st = useSessionStore.getState();
    expect(st.appStatus).toBe('INITIAL');
    expect(st.sampleMode).toBe(false);
    expect(st.settings).toEqual(DEFAULT_SETTINGS);
  });
});
