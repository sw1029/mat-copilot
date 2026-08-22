import { create } from 'zustand';
import {
  clearStoredToken,
  disableMockBackend,
  getStoredSessionId,
  getStoredToken,
  storeSessionId,
  storeToken,
} from '../shared/api/apiClient';
import type { ApiErrorViewModel } from '../shared/api/errors';
import type { AppStatus, Session, SessionSettings, SessionStatus } from '../shared/api/types';

// TRD/front.md §5.1~5.5 — 서버 우선 세션 상태. localStorage에는 sessionToken만 영속.

export const DEFAULT_SETTINGS: SessionSettings = {
  confuseThreshold: 0.5,
  timeLimitSec: null,
};

const SERVER_TO_APP_STATUS: Record<SessionStatus, AppStatus> = {
  CREATED: 'INITIAL',
  INTERVIEWING: 'INTERVIEWING',
  INTERVIEW_DONE: 'SUBMITTING',
  ANALYZING: 'ANALYZING',
  REPORT_READY: 'COMPLETED',
  FAILED: 'FAILED',
  EXPIRED: 'EXPIRED',
};

export function mapServerStatus(status: SessionStatus): AppStatus {
  return SERVER_TO_APP_STATUS[status];
}

/** 상태별 복구 라우팅 (TRD §4.5) */
export function routeForAppStatus(appStatus: AppStatus, activeJobId?: string): string {
  switch (appStatus) {
    case 'INITIAL':
      return '/';
    case 'INTERVIEWING':
      return '/interview';
    case 'SUBMITTING':
      return '/artifacts';
    case 'ANALYZING':
      return activeJobId ? `/analysis/${activeJobId}` : '/artifacts';
    case 'COMPLETED':
      return '/report';
    case 'EXPIRED':
      return '/expired';
    case 'FAILED':
      return '/';
  }
}

export type ClearReason = 'expired' | 'deleted' | 'new-session';

interface SessionStoreState {
  sessionId?: string;
  sessionToken?: string;
  appStatus: AppStatus;
  serverStatus?: SessionStatus;
  settings: SessionSettings;
  activeJobId?: string;
  planId?: string;
  expiresAt?: string;
  interviewStartedAt?: string;
  /** 샘플 체험 데모 경로 활성 여부 (TRD §7.1) */
  sampleMode: boolean;
  bootstrapped: boolean;
  lastError?: ApiErrorViewModel;

  setCreated(session: Session, token: string): void;
  setFromServer(session: Session): void;
  setSettings(settings: SessionSettings): void;
  setAppStatus(status: AppStatus): void;
  setActiveJobId(jobId?: string): void;
  setSampleMode(on: boolean): void;
  setBootstrapped(): void;
  setLastError(error?: ApiErrorViewModel): void;
  clearSession(reason: ClearReason): void;
}

export const useSessionStore = create<SessionStoreState>((set) => ({
  sessionId: getStoredSessionId() ?? undefined,
  sessionToken: getStoredToken() ?? undefined,
  appStatus: 'INITIAL',
  settings: { ...DEFAULT_SETTINGS },
  sampleMode: false,
  bootstrapped: false,

  setCreated(session, token) {
    storeToken(token);
    storeSessionId(session.sessionId);
    set({
      sessionId: session.sessionId,
      sessionToken: token,
      serverStatus: session.status,
      appStatus: mapServerStatus(session.status),
      settings: session.settings,
      activeJobId: session.activeJobId,
      planId: session.planId,
      expiresAt: session.expiresAt,
      interviewStartedAt: session.interviewStartedAt,
      lastError: undefined,
    });
  },

  // 서버 truth 우선 merge — 단일 경로 (TRD §16)
  setFromServer(session) {
    set({
      sessionId: session.sessionId,
      serverStatus: session.status,
      appStatus: mapServerStatus(session.status),
      settings: session.settings,
      activeJobId: session.activeJobId,
      planId: session.planId,
      expiresAt: session.expiresAt,
      interviewStartedAt: session.interviewStartedAt,
    });
  },

  setSettings(settings) {
    set({ settings });
  },

  setAppStatus(appStatus) {
    set({ appStatus });
  },

  setActiveJobId(activeJobId) {
    set({ activeJobId });
  },

  setSampleMode(sampleMode) {
    set({ sampleMode });
  },

  setBootstrapped() {
    set({ bootstrapped: true });
  },

  setLastError(lastError) {
    set({ lastError });
  },

  clearSession(reason) {
    clearStoredToken();
    disableMockBackend();
    set({
      sessionId: undefined,
      sessionToken: undefined,
      serverStatus: undefined,
      appStatus: reason === 'expired' ? 'EXPIRED' : 'INITIAL',
      settings: { ...DEFAULT_SETTINGS },
      activeJobId: undefined,
      planId: undefined,
      expiresAt: undefined,
      interviewStartedAt: undefined,
      sampleMode: false,
      lastError: undefined,
    });
  },
}));
