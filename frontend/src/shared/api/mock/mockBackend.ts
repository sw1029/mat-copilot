import type {
  AnalysisJob,
  Artifact,
  JobStage,
  QuestionNode,
  Session,
  SessionSettings,
} from '../types';
import {
  buildSampleReport,
  SAMPLE_CHARTS,
  SAMPLE_QUESTION_ROOT,
  SAMPLE_QUESTION_SECOND,
  SAMPLE_QUESTION_THIRD,
} from '../../../tests/fixtures/sampleData';

// TRD/front.md §7.2 — 백엔드 부재 시 샘플 체험을 지속하기 위한 브라우저 내 mock 백엔드.
// SCHEMA v0.3 계약(API-01~19, 오류 모델, ETag/304)을 그대로 흉내 낸다.

interface MockRequestInit {
  method: string;
  body?: unknown;
  formData?: FormData;
  headers: Record<string, string>;
}

interface MockResponse {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
}

const ANALYSIS_STAGES: JobStage[] = ['INGEST', 'NORMALIZE', 'EVALUATE', 'DRIFT', 'AGGREGATE', 'REPORT'];
const PLAN_STAGES: JobStage[] = ['INGEST', 'NORMALIZE', 'EVALUATE'];

interface MockJobState {
  job: AnalysisJob;
  stages: JobStage[];
  /** getJob 호출마다 단계가 진행된다 (데모 속도 제어) */
  ticksPerStage: number;
  tickCount: number;
  version: number;
  cancelled: boolean;
}

interface MockState {
  session?: Session;
  token?: string;
  questions: QuestionNode[];
  answers: Map<string, string>;
  artifacts: Artifact[];
  jobs: Map<string, MockJobState>;
  earlyCompleted: boolean;
  interviewCompleted: boolean;
  planUploaded: boolean;
}

function nowIso(): string {
  return new Date().toISOString();
}

function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 3600_000).toISOString();
}

function uuidLike(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function ok(body: unknown, status = 200, headers?: Record<string, string>): MockResponse {
  return { status, body, headers };
}

function apiError(
  status: number,
  code: string,
  message: string,
  retryable = false,
  details?: Record<string, unknown>,
): MockResponse {
  return {
    status,
    body: { error: { code, message, retryable, details, traceId: uuidLike('trace') } },
  };
}

export function createMockBackend(options?: { latencyMs?: number }) {
  const latencyMs = options?.latencyMs ?? 350;

  const state: MockState = {
    questions: [],
    answers: new Map(),
    artifacts: [],
    jobs: new Map(),
    earlyCompleted: false,
    interviewCompleted: false,
    planUploaded: false,
  };

  const delay = () => new Promise((resolve) => setTimeout(resolve, latencyMs));

  function requireSession(headers: Record<string, string>): MockResponse | null {
    if (!state.session) {
      return apiError(404, 'SESSION_NOT_FOUND', '진행 중인 세션을 찾을 수 없어요.');
    }
    if (headers['X-Session-Token'] !== state.token) {
      return apiError(404, 'SESSION_NOT_FOUND', '진행 중인 세션을 찾을 수 없어요.');
    }
    return null;
  }

  function createJob(kind: AnalysisJob['kind'], stages: JobStage[], ticksPerStage: number): MockJobState {
    const jobState: MockJobState = {
      job: {
        jobId: uuidLike('job'),
        kind,
        status: 'QUEUED',
        stage: undefined,
        completedStages: [],
        progress: null,
        error: null,
      },
      stages,
      ticksPerStage,
      tickCount: 0,
      version: 0,
      cancelled: false,
    };
    state.jobs.set(jobState.job.jobId, jobState);
    return jobState;
  }

  function advanceJob(jobState: MockJobState): void {
    const { job } = jobState;
    if (job.status === 'SUCCEEDED' || job.status === 'FAILED' || job.status === 'CANCELLED') return;
    jobState.tickCount += 1;
    jobState.version += 1;
    if (job.status === 'QUEUED') {
      job.status = 'RUNNING';
      job.stage = jobState.stages[0];
      return;
    }
    if (jobState.tickCount % jobState.ticksPerStage !== 0) return;
    const currentIndex = jobState.stages.indexOf(job.stage ?? jobState.stages[0]);
    job.completedStages = jobState.stages.slice(0, currentIndex + 1);
    const nextStage = jobState.stages[currentIndex + 1];
    if (nextStage) {
      job.stage = nextStage;
    } else {
      job.status = 'SUCCEEDED';
      job.stage = undefined;
      if (job.kind === 'ANALYSIS' && state.session) {
        state.session = { ...state.session, status: 'REPORT_READY', activeJobId: undefined, expiresAt: hoursFromNow(72) };
      }
      if (job.kind === 'PLAN_EXTRACTION' && state.session) {
        state.session = { ...state.session, status: 'INTERVIEW_DONE', activeJobId: undefined };
      }
    }
  }

  function activeQuestion(): QuestionNode | undefined {
    return state.questions.find((q) => q.status === 'ACTIVE');
  }

  function unansweredRequired(): QuestionNode[] {
    return state.questions.filter((q) => q.kind === 'REQUIRED' && q.status !== 'ANSWERED');
  }

  return async function handle(path: string, init: MockRequestInit): Promise<MockResponse> {
    await delay();
    const { method, headers } = init;
    const url = new URL(path, 'https://mock.local');
    const segments = url.pathname.split('/').filter(Boolean);

    // API-15 / API-16
    if (method === 'GET' && url.pathname === '/health') return ok({ status: 'ok' });
    if (method === 'GET' && url.pathname === '/ready') {
      return ok({ status: 'ready', checks: { store: 'ok', llm: 'ok' } });
    }

    // API-01 POST /sessions
    if (method === 'POST' && url.pathname === '/sessions') {
      const requestedSettings = (init.body as { settings?: Partial<SessionSettings> } | undefined)
        ?.settings;
      const settings: SessionSettings = {
        confuseThreshold: requestedSettings?.confuseThreshold ?? 0.5,
        timeLimitSec: requestedSettings?.timeLimitSec ?? null,
      };
      state.token = uuidLike('tok');
      state.session = {
        sessionId: uuidLike('s'),
        status: 'CREATED',
        settings,
        createdAt: nowIso(),
        expiresAt: hoursFromNow(24),
      };
      state.questions = [];
      state.answers.clear();
      state.artifacts = [];
      state.jobs.clear();
      state.earlyCompleted = false;
      state.interviewCompleted = false;
      state.planUploaded = false;
      return ok({ ...state.session, sessionToken: state.token }, 201);
    }

    const guard = requireSession(headers);
    if (guard) return guard;
    const session = state.session!;

    if (segments[0] !== 'sessions' || segments[1] !== session.sessionId) {
      return apiError(404, 'SESSION_NOT_FOUND', '진행 중인 세션을 찾을 수 없어요.');
    }

    // API-02 GET /sessions/{id}
    if (method === 'GET' && segments.length === 2) {
      return ok(session);
    }

    // API-19 DELETE /sessions/{id}
    if (method === 'DELETE' && segments.length === 2) {
      state.session = undefined;
      state.token = undefined;
      return { status: 204 };
    }

    // API-03 PATCH /sessions/{id}/settings
    if (method === 'PATCH' && segments[2] === 'settings') {
      const body = init.body as SessionSettings;
      if (
        typeof body?.confuseThreshold !== 'number' ||
        body.confuseThreshold < 0 ||
        body.confuseThreshold > 1
      ) {
        return apiError(400, 'INVALID_INPUT', '질문 강도 값이 올바르지 않아요.');
      }
      state.session = { ...session, settings: body };
      return ok(body);
    }

    // API-04 POST /sessions/{id}/plan
    if (method === 'POST' && segments[2] === 'plan') {
      state.planUploaded = true;
      state.interviewCompleted = true;
      const jobState = createJob('PLAN_EXTRACTION', PLAN_STAGES, 1);
      state.session = { ...session, status: 'ANALYZING', activeJobId: jobState.job.jobId, planId: uuidLike('plan') };
      return ok({ planId: state.session.planId, jobId: jobState.job.jobId, jobKind: 'PLAN_EXTRACTION' }, 202);
    }

    // API-05 POST /sessions/{id}/interview/start
    if (method === 'POST' && segments[2] === 'interview' && segments[3] === 'start') {
      if (state.questions.length === 0) {
        state.questions = [{ ...SAMPLE_QUESTION_ROOT, createdAt: nowIso() }];
        state.session = { ...session, status: 'INTERVIEWING', interviewStartedAt: nowIso() };
      }
      const active = activeQuestion();
      return ok(active ? [active] : []);
    }

    // API-06 POST /sessions/{id}/interview/answers
    if (method === 'POST' && segments[2] === 'interview' && segments[3] === 'answers') {
      if (state.interviewCompleted) {
        return apiError(409, 'INTERVIEW_NOT_ACTIVE', '현재 답변할 수 있는 인터뷰가 아니에요.');
      }
      const body = init.body as { questionId: string; value: string; requestFlag?: boolean };
      const question = state.questions.find((q) => q.questionId === body.questionId);
      if (!question) {
        return apiError(400, 'INVALID_INPUT', '알 수 없는 질문이에요.');
      }
      const trimmed = (body.value ?? '').trim();
      if (trimmed.length === 0 || body.value.length > 2000) {
        return apiError(400, 'INVALID_INPUT', '답변은 1~2,000자로 입력해 주세요.');
      }
      // 멱등: 이미 답변된 질문이면 기존 트리 상태 반환
      if (state.answers.has(body.questionId)) {
        return ok({
          answeredQuestionId: body.questionId,
          nextQuestions: state.questions.filter((q) => q.status === 'ACTIVE'),
          remainingQuestions: remainingBudget(),
          interviewStatus: state.interviewCompleted ? 'COMPLETED' : 'ACTIVE',
          completedReason: null,
        });
      }
      state.answers.set(body.questionId, body.value);
      question.status = 'ANSWERED';

      let next: QuestionNode | undefined;
      if (question.questionId === 'q-root') {
        next = { ...SAMPLE_QUESTION_SECOND, status: 'ACTIVE', createdAt: nowIso() };
      } else if (question.questionId === 'q-share') {
        next = { ...SAMPLE_QUESTION_THIRD, status: 'ACTIVE', createdAt: nowIso() };
      }
      if (next) {
        state.questions = [...state.questions, next];
        return ok({
          answeredQuestionId: body.questionId,
          nextQuestions: [next],
          remainingQuestions: remainingBudget(),
          interviewStatus: 'ACTIVE',
          completedReason: null,
        });
      }
      // 질문 소진 → threshold 종료
      state.interviewCompleted = true;
      state.session = { ...session, status: 'INTERVIEW_DONE' };
      return ok({
        answeredQuestionId: body.questionId,
        nextQuestions: [],
        remainingQuestions: 0,
        interviewStatus: 'COMPLETED',
        completedReason: 'THRESHOLD',
      });
    }

    // API-07 GET /sessions/{id}/interview/tree
    if (method === 'GET' && segments[2] === 'interview' && segments[3] === 'tree') {
      return ok(state.questions);
    }

    // API-17 POST /sessions/{id}/interview/complete
    if (method === 'POST' && segments[2] === 'interview' && segments[3] === 'complete') {
      if (state.interviewCompleted) {
        return ok({
          interviewStatus: 'COMPLETED',
          completedReason: state.earlyCompleted ? 'USER_EARLY' : 'THRESHOLD',
          earlyCompleted: state.earlyCompleted,
        });
      }
      const confirm = Boolean((init.body as { confirm?: boolean } | undefined)?.confirm);
      const pending = unansweredRequired();
      if (pending.length > 0 && !confirm) {
        return apiError(
          409,
          'REQUIRED_QUESTIONS_PENDING',
          '아직 답변하지 않은 필수 질문이 있어요.',
          false,
          { pendingQuestionIds: pending.map((q) => q.questionId) },
        );
      }
      state.interviewCompleted = true;
      state.earlyCompleted = true;
      state.questions = state.questions.map((q) =>
        q.status === 'ACTIVE' || q.status === 'PENDING' ? { ...q, status: 'SKIPPED' } : q,
      );
      state.session = { ...session, status: 'INTERVIEW_DONE' };
      return ok({ interviewStatus: 'COMPLETED', completedReason: 'USER_EARLY', earlyCompleted: true });
    }

    // API-08 POST / API-09 GET /sessions/{id}/artifacts
    if (segments[2] === 'artifacts') {
      if (method === 'GET') return ok(state.artifacts);
      if (method === 'POST') {
        if (state.artifacts.length >= 20) {
          return apiError(400, 'INVALID_INPUT', '결과물은 최대 20건까지 제출할 수 있어요.');
        }
        let artifact: Artifact;
        if (init.formData) {
          const file = init.formData.get('file') as File | null;
          if (!file) return apiError(400, 'INVALID_INPUT', '파일이 비어 있어요.');
          if (file.size > 20 * 1024 * 1024) {
            return apiError(413, 'PAYLOAD_TOO_LARGE', '파일이 너무 커요. 20MB 이하로 줄여 주세요.');
          }
          artifact = {
            artifactId: file.name.includes('travel-mate') ? 'a-sample-readme' : uuidLike('a'),
            type: 'FILE',
            name: file.name,
            ingestStatus: 'PARSED',
            submittedAt: nowIso(),
          };
        } else {
          const body = init.body as { type: 'LINK' | 'GITHUB'; url: string };
          try {
            const parsed = new URL(body.url);
            if (parsed.protocol !== 'https:') throw new Error('protocol');
            if (body.type === 'GITHUB' && parsed.hostname !== 'github.com') throw new Error('host');
          } catch {
            return apiError(400, 'INVALID_INPUT', 'https 링크만 분석할 수 있어요.');
          }
          artifact = {
            artifactId: uuidLike('a'),
            type: body.type,
            name: body.url,
            url: body.url,
            ingestStatus: 'PENDING',
            ingestNote: '링크 수집은 분석 시작 후 진행돼요.',
            submittedAt: nowIso(),
          };
        }
        state.artifacts = [...state.artifacts, artifact];
        return ok(artifact, 201);
      }
    }

    // API-10 POST /sessions/{id}/analysis
    if (method === 'POST' && segments[2] === 'analysis') {
      if (!state.interviewCompleted && !state.planUploaded) {
        return apiError(409, 'ANALYSIS_PRECONDITION_FAILED', '분석을 시작하려면 의도와 결과물이 필요해요.');
      }
      if (state.artifacts.length === 0) {
        return apiError(409, 'ANALYSIS_PRECONDITION_FAILED', '분석을 시작하려면 결과물이 1건 이상 필요해요.');
      }
      const running = Array.from(state.jobs.values()).find(
        (j) => j.job.kind === 'ANALYSIS' && (j.job.status === 'QUEUED' || j.job.status === 'RUNNING'),
      );
      if (running) return ok(running.job, 202);
      const jobState = createJob('ANALYSIS', ANALYSIS_STAGES, 1);
      state.session = { ...session, status: 'ANALYZING', activeJobId: jobState.job.jobId };
      return ok(jobState.job, 202);
    }

    // API-11/12/18 /sessions/{id}/jobs/{jobId}(/retry|/cancel)
    if (segments[2] === 'jobs' && segments[3]) {
      const jobState = state.jobs.get(segments[3]);
      if (!jobState) return apiError(404, 'JOB_NOT_FOUND', '분석 작업을 찾을 수 없어요.');
      const action = segments[4];

      if (method === 'GET' && !action) {
        advanceJob(jobState);
        const etag = `"job-${jobState.job.jobId}-${jobState.version}"`;
        if (headers['If-None-Match'] === etag) {
          return { status: 304 };
        }
        return ok(jobState.job, 200, { ETag: etag });
      }

      if (method === 'POST' && action === 'cancel') {
        if (jobState.job.status === 'SUCCEEDED' || jobState.job.status === 'FAILED') {
          return apiError(409, 'JOB_NOT_CANCELLABLE', '이미 종료된 작업이라 취소할 수 없어요.');
        }
        jobState.job.status = 'CANCELLED';
        jobState.cancelled = true;
        jobState.version += 1;
        state.session = {
          ...session,
          status: state.interviewCompleted || state.planUploaded ? 'INTERVIEW_DONE' : 'CREATED',
          activeJobId: undefined,
        };
        return ok(jobState.job);
      }

      if (method === 'POST' && action === 'retry') {
        if (jobState.job.status !== 'FAILED' && jobState.job.status !== 'CANCELLED') {
          return apiError(409, 'JOB_NOT_RETRYABLE', '이 작업은 재시도할 수 없어요.');
        }
        jobState.job.status = 'RUNNING';
        jobState.job.stage =
          jobState.stages[jobState.job.completedStages.length] ?? jobState.stages[0];
        jobState.job.error = null;
        jobState.version += 1;
        state.session = { ...session, status: 'ANALYZING', activeJobId: jobState.job.jobId };
        return ok(jobState.job);
      }
    }

    // API-13 GET /sessions/{id}/report
    if (method === 'GET' && segments[2] === 'report' && !segments[3]) {
      if (session.status !== 'REPORT_READY') {
        return apiError(404, 'JOB_NOT_FOUND', '아직 보고서가 준비되지 않았어요.');
      }
      return ok(buildSampleReport(session.sessionId, state.earlyCompleted));
    }

    // API-14 GET /sessions/{id}/report/charts
    if (method === 'GET' && segments[2] === 'report' && segments[3] === 'charts') {
      if (session.status !== 'REPORT_READY') {
        return apiError(404, 'JOB_NOT_FOUND', '아직 보고서가 준비되지 않았어요.');
      }
      return ok(SAMPLE_CHARTS);
    }

    return apiError(404, 'SESSION_NOT_FOUND', '지원하지 않는 경로예요.');

    function remainingBudget(): number {
      return Math.max(0, 3 - state.answers.size);
    }
  };
}
