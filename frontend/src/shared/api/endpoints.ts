import { request } from './apiClient';
import type {
  AnalysisJob,
  AnswerRequest,
  AnswerResult,
  Artifact,
  ChartSpec,
  HealthResponse,
  InterviewCompleteResult,
  PlanUploadResult,
  QuestionNode,
  Report,
  Session,
  SessionCreated,
  SessionSettings,
} from './types';

// SCHEMA v0.3 §2 엔드포인트 목록 API-01~19 — 함수명은 verbNoun (TRD §16)

/** API-01 POST /sessions — 비멱등, 자동 재시도 안 함 */
export async function createSession(settings?: Partial<SessionSettings>, signal?: AbortSignal) {
  const res = await request<SessionCreated>('/sessions', {
    method: 'POST',
    body: settings ? { settings } : undefined,
    signal,
    skipAuth: true,
    timeoutCategory: 'query',
  });
  return res.data;
}

/** API-02 GET /sessions/{id} — 복구용, 멱등 */
export async function getSession(sessionId: string, signal?: AbortSignal) {
  const res = await request<Session>(`/sessions/${sessionId}`, {
    idempotent: true,
    signal,
  });
  return res.data;
}

/** API-03 PATCH /sessions/{id}/settings — 전체 교체, 멱등 */
export async function updateSettings(
  sessionId: string,
  settings: SessionSettings,
  signal?: AbortSignal,
) {
  const res = await request<SessionSettings>(`/sessions/${sessionId}/settings`, {
    method: 'PATCH',
    body: settings,
    signal,
  });
  return res.data;
}

/** API-04 POST /sessions/{id}/plan — multipart 기획안 업로드 */
export async function uploadPlan(sessionId: string, file: File, signal?: AbortSignal) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await request<PlanUploadResult>(`/sessions/${sessionId}/plan`, {
    method: 'POST',
    formData,
    signal,
    timeoutCategory: 'upload',
  });
  return res.data;
}

/** API-05 POST /sessions/{id}/interview/start — 멱등(이미 시작 시 현재 질문 반환) */
export async function startInterview(sessionId: string, signal?: AbortSignal) {
  const res = await request<QuestionNode[]>(`/sessions/${sessionId}/interview/start`, {
    method: 'POST',
    idempotent: true,
    signal,
    timeoutCategory: 'interview',
  });
  return res.data;
}

/** API-06 POST /sessions/{id}/interview/answers — 멱등(동일 questionId 재제출 시 기존 결과) */
export async function submitAnswer(
  sessionId: string,
  answer: AnswerRequest,
  signal?: AbortSignal,
) {
  const res = await request<AnswerResult>(`/sessions/${sessionId}/interview/answers`, {
    method: 'POST',
    body: answer,
    idempotent: true,
    signal,
    timeoutCategory: 'interview',
  });
  return res.data;
}

/** API-07 GET /sessions/{id}/interview/tree — 마인드맵/복구 */
export async function getInterviewTree(sessionId: string, signal?: AbortSignal) {
  const res = await request<QuestionNode[]>(`/sessions/${sessionId}/interview/tree`, {
    idempotent: true,
    signal,
  });
  return res.data;
}

/** API-08 POST /sessions/{id}/artifacts — 파일형 */
export async function submitArtifactFile(sessionId: string, file: File, signal?: AbortSignal) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await request<Artifact>(`/sessions/${sessionId}/artifacts`, {
    method: 'POST',
    formData,
    signal,
    timeoutCategory: 'upload',
  });
  return res.data;
}

/** API-08 POST /sessions/{id}/artifacts — 링크/GitHub형 */
export async function submitArtifactLink(
  sessionId: string,
  type: 'LINK' | 'GITHUB',
  url: string,
  signal?: AbortSignal,
) {
  const res = await request<Artifact>(`/sessions/${sessionId}/artifacts`, {
    method: 'POST',
    body: { type, url },
    signal,
  });
  return res.data;
}

/** API-09 GET /sessions/{id}/artifacts */
export async function getArtifacts(sessionId: string, signal?: AbortSignal) {
  const res = await request<Artifact[]>(`/sessions/${sessionId}/artifacts`, {
    idempotent: true,
    signal,
  });
  return res.data;
}

/** API-10 POST /sessions/{id}/analysis — 202, 실행 중 job 있으면 그 job 반환 */
export async function startAnalysis(sessionId: string, signal?: AbortSignal) {
  const res = await request<AnalysisJob>(`/sessions/${sessionId}/analysis`, {
    method: 'POST',
    signal,
    timeoutCategory: 'analysisStart',
  });
  return res.data;
}

/** API-11 GET /sessions/{id}/jobs/{jobId} — ETag/If-None-Match, 304 지원 */
export async function getJob(sessionId: string, jobId: string, etag?: string, signal?: AbortSignal) {
  return request<AnalysisJob>(`/sessions/${sessionId}/jobs/${jobId}`, {
    idempotent: true,
    etag,
    signal,
  });
}

/** API-12 POST /sessions/{id}/jobs/{jobId}/retry — 실패 단계부터 재시도 */
export async function retryJob(sessionId: string, jobId: string, signal?: AbortSignal) {
  const res = await request<AnalysisJob>(`/sessions/${sessionId}/jobs/${jobId}/retry`, {
    method: 'POST',
    signal,
  });
  return res.data;
}

/** API-13 GET /sessions/{id}/report */
export async function getReport(sessionId: string, signal?: AbortSignal) {
  const res = await request<Report>(`/sessions/${sessionId}/report`, {
    idempotent: true,
    signal,
  });
  return res.data;
}

/** API-14 GET /sessions/{id}/report/charts */
export async function getReportCharts(sessionId: string, signal?: AbortSignal) {
  const res = await request<ChartSpec[]>(`/sessions/${sessionId}/report/charts`, {
    idempotent: true,
    signal,
  });
  return res.data;
}

/** API-15 GET /health */
export async function getHealth(signal?: AbortSignal) {
  const res = await request<HealthResponse>('/health', { idempotent: true, signal, skipAuth: true });
  return res.data;
}

/** API-16 GET /ready */
export async function getReady(signal?: AbortSignal) {
  const res = await request<HealthResponse>('/ready', { idempotent: true, signal, skipAuth: true });
  return res.data;
}

/** API-17 POST /sessions/{id}/interview/complete — 조기 종료. confirm=false + REQUIRED 미답변 시 409 */
export async function completeInterview(
  sessionId: string,
  confirm: boolean,
  signal?: AbortSignal,
) {
  const res = await request<InterviewCompleteResult>(`/sessions/${sessionId}/interview/complete`, {
    method: 'POST',
    body: { confirm },
    signal,
  });
  return res.data;
}

/** API-18 POST /sessions/{id}/jobs/{jobId}/cancel */
export async function cancelJob(sessionId: string, jobId: string, signal?: AbortSignal) {
  const res = await request<AnalysisJob>(`/sessions/${sessionId}/jobs/${jobId}/cancel`, {
    method: 'POST',
    signal,
  });
  return res.data;
}

/** API-19 DELETE /sessions/{id} — 내 데이터 지우기, 부재 시에도 204 */
export async function deleteSession(sessionId: string, signal?: AbortSignal) {
  await request<void>(`/sessions/${sessionId}`, { method: 'DELETE', signal });
}
