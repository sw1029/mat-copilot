// SCHEMA v0.3 데이터 계약 — 단일 진실 공급원 (SCHEMA/schema.md)

export type SessionStatus =
  | 'CREATED'
  | 'INTERVIEWING'
  | 'INTERVIEW_DONE'
  | 'ANALYZING'
  | 'REPORT_READY'
  | 'FAILED'
  | 'EXPIRED';

export type InterviewStatus = 'ACTIVE' | 'COMPLETED';

export type CompletedReason = 'THRESHOLD' | 'USER_EARLY' | 'WATCHDOG' | 'TIME_LIMIT';

export type QuestionKind = 'REQUIRED' | 'OPTIONAL';

export type QuestionStatus = 'PENDING' | 'ACTIVE' | 'ANSWERED' | 'SKIPPED';

export type JobStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';

export type JobStage = 'INGEST' | 'NORMALIZE' | 'EVALUATE' | 'DRIFT' | 'AGGREGATE' | 'REPORT';

export type JobKind = 'PLAN_EXTRACTION' | 'ANALYSIS';

export type ArtifactType = 'FILE' | 'LINK' | 'GITHUB';

export type ArtifactIngestStatus =
  | 'PENDING'
  | 'PARSED'
  | 'SKIPPED_UNSUPPORTED'
  | 'SKIPPED_TOO_LARGE'
  | 'BLOCKED_UNSAFE';

export type MetricStatus = 'GOOD' | 'WARN' | 'BAD' | 'NA';

export type ThemeType =
  | 'REQUIREMENT_OMISSION'
  | 'INTENT_DISTORTION'
  | 'HALLUCINATION'
  | 'SCOPE_CREEP'
  | 'DYNAMIC';

export type Severity = 'LOW' | 'MEDIUM' | 'HIGH';

export type Confidence = 'LOW' | 'MEDIUM' | 'HIGH';

export type IntentPhase = 'INITIAL' | 'REVISED';

export interface SessionSettings {
  confuseThreshold: number; // 0~1, step 0.05
  timeLimitSec?: number | null; // 60~3600 또는 null
}

export interface Session {
  sessionId: string;
  status: SessionStatus;
  settings: SessionSettings;
  planId?: string;
  activeJobId?: string;
  interviewStartedAt?: string;
  createdAt: string;
  expiresAt: string;
}

export interface SessionCreated extends Session {
  sessionToken: string;
}

export interface QuestionNode {
  questionId: string;
  parentId: string | null;
  depth: number;
  prompt: string;
  helperText?: string;
  kind: QuestionKind;
  status: QuestionStatus;
  inputType: 'text';
  /** AI 생성 고지 — true(기본) 시 질문 카드 표기 의무. 규칙 기반 폴백 질문만 false */
  aiGenerated: boolean;
  confused?: number;
  intentPhase: IntentPhase;
  createdAt: string;
}

export interface AnswerRequest {
  questionId: string;
  value: string;
  requestFlag: boolean;
}

export interface AnswerResult {
  answeredQuestionId: string;
  nextQuestions: QuestionNode[];
  remainingQuestions?: number | null;
  interviewStatus: InterviewStatus;
  completedReason?: CompletedReason | null;
}

export interface InterviewCompleteResult {
  interviewStatus: InterviewStatus;
  completedReason: CompletedReason;
  earlyCompleted: boolean;
}

export interface PlanUploadResult {
  planId: string;
  jobId: string;
  jobKind: 'PLAN_EXTRACTION';
}

export interface Artifact {
  artifactId: string;
  type: ArtifactType;
  name: string;
  url?: string;
  ingestStatus: ArtifactIngestStatus;
  ingestNote?: string;
  submittedAt: string;
}

export interface ApiError {
  code:
    | 'INVALID_INPUT'
    | 'SESSION_NOT_FOUND'
    | 'SESSION_EXPIRED'
    | 'UNSUPPORTED_FORMAT'
    | 'PAYLOAD_TOO_LARGE'
    | 'INTERVIEW_NOT_ACTIVE'
    | 'REQUIRED_QUESTIONS_PENDING'
    | 'ANALYSIS_PRECONDITION_FAILED'
    | 'JOB_NOT_FOUND'
    | 'JOB_NOT_RETRYABLE'
    | 'JOB_NOT_CANCELLABLE'
    | 'PIPELINE_STAGE_FAILED'
    | 'LLM_UPSTREAM_ERROR'
    | 'RATE_LIMITED'
    | 'INTERNAL';
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
  traceId: string;
}

export interface AnalysisJob {
  jobId: string;
  kind: JobKind;
  status: JobStatus;
  stage?: JobStage;
  completedStages: JobStage[];
  progress?: number | null;
  error?: ApiError | null;
}

export interface EvidenceLocation {
  kind: 'file' | 'web' | 'github';
  path?: string;
  startLine?: number;
  endLine?: number;
  url?: string;
  note?: string;
}

export interface EvidenceRef {
  artifactId: string;
  location: EvidenceLocation;
  quote: string;
}

export interface IntentDocBlock {
  blockId: string; // "ib-<seq>"
  intentIds: string[];
}

export interface IntentDoc {
  markdown: string;
  blocks: IntentDocBlock[];
}

export interface Metric {
  metricId: string;
  label: string;
  value: number | null;
  unit: string;
  thresholds?: { warn: number; bad: number };
  status: MetricStatus;
  description: string;
  computable: boolean;
  reason?: string;
}

export interface Finding {
  findingId: string;
  theme: ThemeType;
  dynamicThemeName?: string;
  relatedIntentIds: string[];
  intentBlockIds: string[];
  summary: string;
  detail: string;
  evidence: EvidenceRef[];
  severity: Severity;
  confidence: Confidence;
  suggestion?: string;
}

export interface NormalizationSchema {
  schemaId: string;
  lockedAt: string;
  tags: { tagId: string; name: string; description: string }[];
  fields: {
    fieldId: string;
    name: string;
    type: 'string' | 'number' | 'boolean' | 'enum';
    enumValues?: string[];
  }[];
}

export interface Report {
  reportId: string;
  sessionId: string;
  aiGeneratedNotice: true;
  earlyCompleted?: boolean;
  intentDoc: IntentDoc;
  metrics: Metric[];
  quantStats: {
    totalIntents: number;
    coveredIntents: number;
    driftCount: number;
    countsByTheme: { theme: ThemeType; dynamicThemeName?: string; count: number }[];
    countsBySeverity: { severity: Severity; count: number }[];
  };
  qualitative: string;
  suggestions: string[];
  findings: Finding[];
  normalizationSchema: NormalizationSchema;
  createdAt: string;
}

export interface ChartSpec {
  chartId: string;
  title: string;
  xAxisName: string;
  yAxisName: string;
  csv: string;
  description?: string;
}

export interface HealthResponse {
  status: string;
  checks?: Record<string, string>;
}

// 프론트 상태 모델 (TRD/front.md §5)
export type AppStatus =
  | 'INITIAL'
  | 'INTERVIEWING'
  | 'SUBMITTING'
  | 'ANALYZING'
  | 'COMPLETED'
  | 'FAILED'
  | 'EXPIRED';
