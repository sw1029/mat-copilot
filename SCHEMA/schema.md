# SCHEMA — mat-copilot 프론트/백 통신규약

| 항목 | 내용 |
| --- | --- |
| 문서 버전 | v0.1 (Draft) |
| 작성자 | @sw1029 |
| 최종 수정일 | 2026-08-22 |
| 관련 문서 | [PRD/back.md](../PRD/back.md), [PRD/front.md](../PRD/front.md), [TRD/back.md](../TRD/back.md) |

> 본 문서는 프론트엔드/백엔드 간 통신규약(엔드포인트·데이터 모델·오류 모델)의 **단일 진실 공급원(SoT)** 이다.
> 필수 부분 위주로 작성하며, PRD에서 확정되지 않은 사항은 임의 확정하지 않고 `보류`로 표기한다
> (보류 항목의 관리 대장은 [TRD/back.md §13](../TRD/back.md) 참조).

---

## 1. 공통 규약

| 항목 | 결정 | 상태 |
| --- | --- | --- |
| API 형식 | REST + JSON (파일 업로드만 `multipart/form-data`) | 확정 |
| Base Path | `/api/v1` | 확정 |
| 인증 | 로그인/인가 없음. 세션 발급 API를 제외한 모든 요청에 `X-Session-Token` 헤더 필수 (AGENTS.md "로그인 없이 동작", PRD FR-11) | 확정 |
| 인터뷰 턴 전달 | 동기 HTTP 요청/응답 (MVP). SSE 스트리밍은 M2 검토 | 확정(MVP) / SSE 보류 |
| 분석·추출 작업 전달 | 비동기 job 생성(202) + 상태 폴링 (PRD §6.1 이원 구조). 폴링 권장 간격 2초 | 확정 |
| WebSocket | 미사용 | 확정 |
| 날짜/시간 | ISO 8601 UTC (`2026-08-22T04:00:00Z`) | 확정 |
| ID 형식 | UUID v4 문자열 | 확정 |
| 문자 인코딩 | UTF-8 | 확정 |
| API 버전 관리 | URL prefix(`/v1`). 해커톤 범위에서는 v1 단일 | 확정 |
| 타임아웃(권장) | 일반 조회 10s, 인터뷰 턴 60s, 업로드 120s | 확정(권장치) |
| 재시도 | 5xx·네트워크 오류에 한해 멱등 요청(GET, 답변 제출)만 재시도. 백오프 상세는 프론트 TRD | 부분 확정 |
| 세션 만료(TTL)·데이터 보존 기간 | **보류** (PRD §12 개인정보 처리 원칙 미정과 연계). 만료 시 `SESSION_EXPIRED` 오류로 통지하는 계약만 확정 | 보류 |
| Rate limit | **보류** (도입 시 `429 RATE_LIMITED` + `Retry-After` 계약 준수) | 보류 |

---

## 2. 엔드포인트 목록

> 매핑: 각 엔드포인트는 PRD/back.md의 기능 요구사항(FR)에 대응한다.

| ID | Method | Path | 목적 | PRD | 멱등성 |
| --- | --- | --- | --- | --- | --- |
| API-01 | POST | `/sessions` | 세션 생성 + session token 발급 | FR-11 | 아니오 (호출마다 새 세션) |
| API-02 | GET | `/sessions/{sessionId}` | 세션 상태 조회 (새로고침 복구용) | FR-11 | 예 |
| API-03 | PATCH | `/sessions/{sessionId}/settings` | 유저 설정 (질문 강도, 시간 제한) | FR-3 | 예 (전체 교체) |
| API-04 | POST | `/sessions/{sessionId}/plan` | 기획안 업로드 (docx/txt/md) → 추출 job 생성 | FR-1 | 아니오 (재업로드 시 교체, 마지막 승리) |
| API-05 | POST | `/sessions/{sessionId}/interview/start` | 인터뷰 시작, 최초 질문 반환 | FR-2 | 예 (이미 시작 시 현재 활성 질문 반환) |
| API-06 | POST | `/sessions/{sessionId}/interview/answers` | 답변 제출 → 다음 질문(0..n개) 반환 | FR-2~4 | 예 (동일 `questionId` 재제출 시 기존 결과 반환) |
| API-07 | GET | `/sessions/{sessionId}/interview/tree` | 질문 트리 전체 조회 (마인드맵/복구) | FR-2, FR-3 | 예 |
| API-08 | POST | `/sessions/{sessionId}/artifacts` | 결과물 제출 (파일 또는 링크/github) | FR-7 | 아니오 (다건 누적) |
| API-09 | GET | `/sessions/{sessionId}/artifacts` | 제출된 결과물 목록 | FR-7 | 예 |
| API-10 | POST | `/sessions/{sessionId}/analysis` | 분석 job 생성 | FR-6~8 | 예 (동일 세션 내 실행 중 job 있으면 그 job 반환) |
| API-11 | GET | `/sessions/{sessionId}/jobs/{jobId}` | job 상태 조회 (추출/분석 공용) | FR-1, FR-7~8 | 예 |
| API-12 | POST | `/sessions/{sessionId}/jobs/{jobId}/retry` | 실패 job의 실패 단계부터 재시도 | FR-8, 프론트 FR-17 | 예 (완료 단계 재실행 금지) |
| API-13 | GET | `/sessions/{sessionId}/report` | 보고서 조회 (정량/정성/개선제안/schema 명세 동봉) | FR-5, FR-10 | 예 |
| API-14 | GET | `/sessions/{sessionId}/report/charts` | 도표 구성 정보 (x/y축 이름, csv 구성 데이터) | FR-9 | 예 |

보류 엔드포인트(계약 미확정, 도입 여부 포함 추후 확정):

| 후보 | 목적 | 보류 사유 |
| --- | --- | --- |
| POST `/sessions/{sessionId}/interview/complete` | 유저 주도 인터뷰 조기 종료 | PRD의 종료조건은 agent/threshold 주도(FR-3)이며 유저 조기 종료는 미기술 |
| GET `/sessions/{sessionId}/interview/stream` (SSE) | 인터뷰 턴 스트리밍 | PRD가 "동기 또는 SSE"로 병기 — MVP는 동기, SSE는 M2 검토 |
| PATCH `/interview/answers/{questionId}` | 이전 답변 수정·분기 재생성 | 프론트 PRD 미결 사항(§15)과 연동, 백 PRD 미기술 |

### 2.1 요청/응답 상세 (필수 계약)

#### API-01 `POST /sessions`

```jsonc
// Request: (body 없음 또는 초기 settings)
{ "settings": { "confuseThreshold": 0.5, "timeLimitSec": 600 } } // optional

// Response 201
{
  "sessionId": "uuid",
  "sessionToken": "opaque-string",   // 이후 X-Session-Token 헤더로 전달
  "status": "CREATED",
  "settings": { "confuseThreshold": 0.5, "timeLimitSec": 600 },
  "createdAt": "ISO8601",
  "expiresAt": null                  // TTL 정책 보류 — null 허용
}
```

#### API-04 `POST /sessions/{sessionId}/plan`

- `multipart/form-data`, field `file`. 허용 확장자: `.docx` `.txt` `.md` (MVP 3종 고정, FR-1. pdf 등은 M2 보류)
- 최대 크기: **보류** (초과 시 `413 PAYLOAD_TOO_LARGE` 계약만 확정)

```jsonc
// Response 202
{ "planId": "uuid", "jobId": "uuid", "jobKind": "PLAN_EXTRACTION" }
```

#### API-06 `POST /sessions/{sessionId}/interview/answers`

```jsonc
// Request
{
  "questionId": "uuid",
  "value": "string",          // MVP 입력 유형: 자유 텍스트 (기타 유형 보류)
  "requestFlag": false        // true 시 해당 노드 추가 구체화 요청 (FR-3)
}

// Response 200
{
  "answeredQuestionId": "uuid",
  "nextQuestions": [ /* QuestionNode[] — 0..n개 */ ],
  "interviewStatus": "ACTIVE"  // ACTIVE | COMPLETED  (COMPLETED = 질의 종료 신호)
}
```

#### API-08 `POST /sessions/{sessionId}/artifacts`

- 파일: `multipart/form-data` field `file` (zip/docx/문서/코드 등 텍스트로 읽히는 파일 전반)
- 링크: `application/json`

```jsonc
// Request (링크형)
{ "type": "LINK", "url": "https://..." }        // LINK = 웹 페이지
{ "type": "GITHUB", "url": "https://github.com/owner/repo" }  // read only 분석

// Response 201
{ "artifactId": "uuid", "type": "FILE|LINK|GITHUB", "name": "string", "submittedAt": "ISO8601" }
```

#### API-11 `GET /sessions/{sessionId}/jobs/{jobId}`

```jsonc
// Response 200
{
  "jobId": "uuid",
  "kind": "PLAN_EXTRACTION" ,       // PLAN_EXTRACTION | ANALYSIS
  "status": "RUNNING",              // QUEUED | RUNNING | SUCCEEDED | FAILED
  "stage": "DRIFT",                 // 아래 JobStage enum 참조
  "completedStages": ["INGEST", "NORMALIZE"],
  "progress": null,                 // 0~100 또는 null(미제공 시 프론트는 단계형 로더 사용)
  "error": null                     // 실패 시 ApiError
}
```

---

## 3. 상태/열거형 정의

| Enum | 값 | 설명 |
| --- | --- | --- |
| `SessionStatus` | `CREATED` → `INTERVIEWING` → `INTERVIEW_DONE` → `ANALYZING` → `REPORT_READY`, 임의 시점 `FAILED`, `EXPIRED` | 세션 수명주기 |
| `InterviewStatus` | `ACTIVE`, `COMPLETED` | `COMPLETED`가 프론트의 질의 종료 신호 |
| `QuestionKind` | `REQUIRED`, `OPTIONAL` | 필수 질문(agent 판단, 종료조건 예외) / 임의 질문(threshold 대상) — FR-3 |
| `QuestionStatus` | `PENDING`, `ACTIVE`, `ANSWERED`, `SKIPPED` | 노드 상태 |
| `JobStatus` | `QUEUED`, `RUNNING`, `SUCCEEDED`, `FAILED` | 비동기 job |
| `JobStage` (ANALYSIS) | `INGEST` → `NORMALIZE` → `EVALUATE` → `DRIFT` → `AGGREGATE` → `REPORT` | 분석 파이프라인 단계 (TRD/back.md §7) |
| `ArtifactType` | `FILE`, `LINK`, `GITHUB` | 결과물 유형 — FR-7 |
| `ThemeType` | `REQUIREMENT_OMISSION`, `INTENT_DISTORTION`, `HALLUCINATION`, `SCOPE_CREEP`, `DYNAMIC` | drift 코어 4종 + 동적 보조 — FR-8 |
| `Severity` | `LOW`, `MEDIUM`, `HIGH` | finding 심각도 (정성 참고용) |
| `Confidence` | `LOW`, `MEDIUM`, `HIGH` | 근거 인용 없으면 `LOW` 강제 — FR-8 |
| `IntentPhase` | `INITIAL`, `REVISED` | 초기 의도 / 중간 변경 의도 — FR-4 |

---

## 4. 핵심 데이터 모델

> 필수 필드 위주. `?`는 optional/nullable.

```ts
interface Session {
  sessionId: string;
  status: SessionStatus;
  settings: SessionSettings;
  planId?: string;              // 기획안 업로드 시
  activeJobId?: string;
  createdAt: string;
  expiresAt?: string | null;    // TTL 정책 보류
}

interface SessionSettings {
  confuseThreshold: number;     // 0~1. 질문 강도. 낮을수록 질문 많음 (FR-3)
  timeLimitSec?: number | null; // 유저 설정 시간 제한. null = 미설정
}

interface QuestionNode {
  questionId: string;
  parentId: string | null;      // null = 루트 질문. 트리(branch) 구조 (FR-2)
  depth: number;
  prompt: string;
  helperText?: string;
  kind: QuestionKind;           // REQUIRED | OPTIONAL
  status: QuestionStatus;
  confused?: number;            // 0~1 연속값. 검증 agent 산출 (FR-3, 산식은 TRD §6.4)
  intentPhase: IntentPhase;     // 중간 의도 변경 감지 질문이면 REVISED (FR-4)
  createdAt: string;
}

interface Answer {
  questionId: string;
  value: string;
  requestFlag: boolean;
  submittedAt: string;
}

interface IntentItem {          // 정규화 이전의 추출된 의도
  intentId: string;
  phase: IntentPhase;
  statement: string;            // 의도 서술
  implicit: boolean;            // 의식적(false)/무의식적(true) 방향성 (FR-4)
  sourceQuestionIds: string[];  // 도출 근거 질문
}

interface NormalizationSchema { // 세션 내 임의 생성 후 잠금 (FR-5)
  schemaId: string;
  lockedAt: string;             // 잠금 시각 — 이후 불변
  tags: { tagId: string; name: string; description: string }[];
  fields: { fieldId: string; name: string; type: "string"|"number"|"boolean"|"enum"; enumValues?: string[] }[];
}

interface NormalizedIntent {
  intentId: string;
  tagIds: string[];
  values: Record<string, string | number | boolean>; // schema.fields 기준
}

interface Artifact {
  artifactId: string;
  type: ArtifactType;
  name: string;
  url?: string;                 // LINK | GITHUB
  submittedAt: string;
}

interface AnalysisJob {
  jobId: string;
  kind: "PLAN_EXTRACTION" | "ANALYSIS";
  status: JobStatus;
  stage?: JobStage;
  completedStages: JobStage[];
  progress?: number | null;
  error?: ApiError | null;
}

interface EvidenceRef {         // 판정 근거 인용 (FR-8 의무)
  artifactId: string;
  location: string;             // 파일 경로+행 범위, URL fragment, 문서 섹션 등
  quote: string;                // 인용문 (발췌)
}

interface Finding {             // drift 분석 단건 판정
  findingId: string;
  theme: ThemeType;
  dynamicThemeName?: string;    // theme=DYNAMIC일 때
  relatedIntentIds: string[];   // 어긋난 의도 지점
  summary: string;
  detail: string;
  evidence: EvidenceRef[];      // 비어 있으면 confidence는 LOW 강제
  severity: Severity;
  confidence: Confidence;
  suggestion?: string;          // 개선제안 (FR-10)
}

interface Report {
  reportId: string;
  sessionId: string;
  aiGeneratedNotice: true;      // AI 생성 결과 고지 (프론트 표기용)
  quantStats: {                 // 정량 지표는 개수 기반으로 한정 (FR-10)
    totalIntents: number;
    coveredIntents: number;     // 커버된 요구 수
    driftCount: number;         // 어긋난 지점 수
    countsByTheme: { theme: ThemeType; dynamicThemeName?: string; count: number }[];
    countsBySeverity: { severity: Severity; count: number }[];
  };
  qualitative: string;          // 정성 분석 (markdown)
  suggestions: string[];        // 개선제안 목록
  findings: Finding[];
  normalizationSchema: NormalizationSchema; // 사용 schema 명세 동봉 (FR-5)
  createdAt: string;
}

interface ChartSpec {           // 백엔드는 도표 구성 데이터만 제공, 렌더링은 프론트 (NG3, FR-9)
  chartId: string;
  title: string;
  xAxisName: string;
  yAxisName: string;
  csv: string;                  // 헤더 포함 CSV 문자열 (csv로 구성 가능한 정보)
  description?: string;         // chart type 선택은 프론트 자율
}
```

---

## 5. 오류 모델

```ts
interface ApiError {
  code: string;        // 아래 코드 표
  message: string;     // 사용자 표시 가능 메시지 (한국어)
  retryable: boolean;
  details?: Record<string, unknown>;
  traceId: string;     // 관측성 상관관계 ID
}
// HTTP body: { "error": ApiError }
```

| code | HTTP | 발생 조건 | retryable |
| --- | --- | --- | --- |
| `INVALID_INPUT` | 400 | 필드 누락/형식 오류 | 아니오 |
| `SESSION_NOT_FOUND` | 404 | 잘못된 sessionId/token | 아니오 |
| `SESSION_EXPIRED` | 410 | 세션 만료 (TTL 정책 보류, 계약만 선확정) | 아니오 |
| `UNSUPPORTED_FORMAT` | 415 | 허용 외 파일 포맷 (FR-1: docx/txt/md 외) | 아니오 |
| `PAYLOAD_TOO_LARGE` | 413 | 크기 한도 초과 (한도 수치 보류) | 아니오 |
| `INTERVIEW_NOT_ACTIVE` | 409 | 종료/미시작 인터뷰에 답변 제출 | 아니오 |
| `ANALYSIS_PRECONDITION_FAILED` | 409 | 의도 미확보 또는 결과물 0건 상태로 분석 요청 | 아니오 |
| `JOB_NOT_FOUND` | 404 | 잘못된 jobId | 아니오 |
| `JOB_NOT_RETRYABLE` | 409 | 실패 상태가 아닌 job에 retry 요청 | 아니오 |
| `LLM_UPSTREAM_ERROR` | 502 | Copilot SDK/모델 호출 실패 | 예 |
| `RATE_LIMITED` | 429 | (도입 시) 요청 한도 초과 — 정책 보류 | 예 |
| `INTERNAL` | 500 | 미분류 서버 오류 | 예 |

---

## 6. 미결(보류) 항목 요약

| 항목 | 현재 계약 상태 | 확정 위치 |
| --- | --- | --- |
| 세션 TTL/보존 기간 | `expiresAt` nullable + `SESSION_EXPIRED` 계약만 선확정 | TRD/back.md §13 OQ-07 |
| 파일 크기 한도 | `413` 계약만 선확정, 수치 보류 | TRD/back.md §13 OQ-08 |
| SSE 스트리밍 | 보류 엔드포인트로 예약 | TRD/back.md §13 OQ-09 |
| 질문 입력 유형 확장(선택형 등) | MVP 자유 텍스트 고정 | TRD/back.md §13 OQ-10 |
| 이전 답변 수정/재질의 | 보류 엔드포인트로 예약 | TRD/back.md §13 OQ-11 |
| 유저 주도 인터뷰 조기 종료 | 보류 엔드포인트로 예약 | TRD/back.md §13 OQ-12 |
| Rate limit 정책 | `429` 계약만 선확정 | TRD/back.md §13 OQ-13 |

'''
UX 관점에서 미결 항목에 대한 추가 고려 로직을 추후 넣을것.
'''