# SCHEMA — mat-copilot 프론트/백 통신규약

| 항목 | 내용 |
| --- | --- |
| 문서 버전 | v0.3 (Draft) — GAP_ANALYSIS 반영: 헬스/조기 종료/취소/세션 삭제 엔드포인트 추가, TTL·rate limit·입력 검증·보안 헤더 확정, IntentDoc·metrics·ingestStatus 계약 채택 |
| 작성자 | @sw1029 |
| 최종 수정일 | 2026-08-22 |
| 관련 문서 | [PRD/back.md](../PRD/back.md), [PRD/front.md](../PRD/front.md), [TRD/back.md](../TRD/back.md), [TRD/front.md](../TRD/front.md), [GAP_ANALYSIS.md](../GAP_ANALYSIS.md) |

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
| 타임아웃(권장) | 일반 조회 10s, 인터뷰 턴 60s, 업로드 120s. 서버 측 인터뷰 턴 예산은 45s(TRD §6.1) — 클라이언트 60s 대비 여유 확보 | 확정 |
| 재시도 | 5xx·네트워크 오류에 한해 멱등 요청(GET, 답변 제출)만 재시도. 백오프 상세는 [TRD/front.md](../TRD/front.md) | 확정 |
| 폴링 캐시 | API-11 응답에 `ETag` 제공, `If-None-Match` 일치 시 `304`(body 없음) — 2초 폴링 전송량 최소화 | 확정 |
| 세션 만료(TTL)·데이터 보존 | **마지막 활동 기준 24h**, `REPORT_READY` 도달 시 **72h**로 연장. 만료 시 세션·업로드 파일·보고서 파기, 접근 시 `SESSION_EXPIRED`(410). `expiresAt`은 항상 실값. 유저 주도 즉시 파기 = API-19 | 확정 (v0.3, OQ-07 종결) |
| Rate limit | API-01(세션 생성)만 **IP당 분당 5회**. 초과 시 `429 RATE_LIMITED` + `Retry-After`(초). 그 외는 세션당 동시 job 1개·인터뷰 턴 직렬화가 구조적 상한 | 확정 (v0.3, OQ-13 종결) |
| 보안 응답 헤더 | 전 응답(정적 HTML 포함): `Content-Security-Policy: default-src 'self'`(inline script 금지), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` | 확정 (v0.3) |
| AI 생성 고지 | AI 산출 표면 전부에 고지 필드 제공 — 질문(`QuestionNode.aiGenerated`), 보고서·IntentDoc(`Report.aiGeneratedNotice`). 프론트는 해당 표면에 표기 의무 | 확정 (v0.3) |

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
| API-15 | GET | `/health` | liveness 프로브 (토큰 불필요, 호스팅 프로브 연결) | NFR 관측성 | 예 |
| API-16 | GET | `/ready` | readiness 프로브 — 저장소·LLM(Copilot SDK) 연결 점검 (토큰 불필요) | NFR 관측성 | 예 |
| API-17 | POST | `/sessions/{sessionId}/interview/complete` | 유저 주도 인터뷰 조기 종료 (REQUIRED 미답변 시 확인 절차) | FR-3, US-4 | 예 (이미 종료 시 현재 상태 반환) |
| API-18 | POST | `/sessions/{sessionId}/jobs/{jobId}/cancel` | 실행 중 job 취소 (장시간 작업 유저 통제권) | 프론트 UX, NFR | 예 (이미 취소 상태면 그대로 반환) |
| API-19 | DELETE | `/sessions/{sessionId}` | 세션·업로드 파일·보고서 즉시 파기 ("내 데이터 지우기") | FR-11, 보존 정책 | 예 (부재 시에도 204) |

보류 엔드포인트(계약 미확정, 도입 여부 포함 추후 확정):

| 후보 | 목적 | 보류 사유 |
| --- | --- | --- |
| GET `/sessions/{sessionId}/interview/stream` (SSE) | 인터뷰 턴 스트리밍 | MVP는 동기 유지. 인터뷰 턴 p50>5s 또는 p95>15s 실측 시 도입 (OQ-09) |
| PATCH `/interview/answers/{questionId}` | 이전 답변 수정·분기 재생성 | M2 검토 (OQ-11). 도입 시 subtree `INVALIDATED` 마킹 계약과 함께 확정 |

> v0.2까지 보류였던 `POST /interview/complete`는 v0.3에서 **API-17로 승격**(조기 종료 채택, OQ-12 종결).

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
  "expiresAt": "ISO8601"             // 항상 실값 — 마지막 활동 기준 24h (REPORT_READY 도달 시 72h로 갱신)
}
// 오류: IP당 분당 5회 초과 시 429 RATE_LIMITED + Retry-After 헤더(초)
```

#### API-04 `POST /sessions/{sessionId}/plan`

- `multipart/form-data`, field `file`. 허용 확장자: `.docx` `.txt` `.md` (MVP 3종 고정, FR-1. pdf 등은 M2 보류)
- 최대 크기: **10MB** (초과 시 `413 PAYLOAD_TOO_LARGE`). 프론트는 동일 상수(§4.1)로 업로드 전 사전 검증

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
  "remainingQuestions": 7,      // watchdog 잔여 질문 예산 힌트 (UX: 대기 불안 완화)
  "interviewStatus": "ACTIVE",  // ACTIVE | COMPLETED  (COMPLETED = 질의 종료 신호)
  "completedReason": null       // COMPLETED 시 CompletedReason (§3) — 종료 사유별 안내 문구용
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

- 응답에 `ETag` 헤더 포함. 요청 `If-None-Match` 일치 시 `304`.

```jsonc
// Response 200
{
  "jobId": "uuid",
  "kind": "PLAN_EXTRACTION" ,       // PLAN_EXTRACTION | ANALYSIS
  "status": "RUNNING",              // QUEUED | RUNNING | SUCCEEDED | FAILED | CANCELLED
  "stage": "DRIFT",                 // 아래 JobStage enum 참조
  "completedStages": ["INGEST", "NORMALIZE"],
  "progress": null,                 // 0~100 또는 null(미제공 시 프론트는 단계형 로더 사용)
  "error": null                     // 실패 시 ApiError
}
```

#### API-17 `POST /sessions/{sessionId}/interview/complete`

```jsonc
// Request
{ "confirm": false }   // 기본 false

// Response 409 (confirm=false && REQUIRED 미답변 존재) — code: REQUIRED_QUESTIONS_PENDING
{ "error": { "code": "REQUIRED_QUESTIONS_PENDING", "message": "...", "retryable": false,
             "details": { "pendingQuestionIds": ["uuid", "..."] }, "traceId": "..." } }

// Response 200 (confirm=true 또는 REQUIRED 전부 답변됨)
{ "interviewStatus": "COMPLETED", "completedReason": "USER_EARLY", "earlyCompleted": true }
// earlyCompleted=true는 보고서에 "조기 종료로 분석 신뢰도가 낮을 수 있음" 고지로 이어진다 (Report.earlyCompleted)
```

#### API-18 `POST /sessions/{sessionId}/jobs/{jobId}/cancel`

```jsonc
// Response 200 — status가 QUEUED/RUNNING이면 CANCELLED로 전이 (완료 단계 체크포인트는 보존, retry로 재개 가능)
{ "jobId": "uuid", "status": "CANCELLED", "completedStages": ["INGEST"] }
// SUCCEEDED/FAILED 종결 상태면 409 JOB_NOT_CANCELLABLE
```

#### API-15/16 `GET /health` · `GET /ready`

```jsonc
// /health 200: { "status": "ok" }                       — 프로세스 생존만 확인
// /ready  200: { "status": "ready", "checks": { "store": "ok", "llm": "ok" } }
// /ready  503: { "status": "not_ready", "checks": { "store": "ok", "llm": "fail" } }
```

---

## 3. 상태/열거형 정의

| Enum | 값 | 설명 |
| --- | --- | --- |
| `SessionStatus` | `CREATED` → `INTERVIEWING` → `INTERVIEW_DONE` → `ANALYZING` → `REPORT_READY`, 임의 시점 `FAILED`, `EXPIRED` | 세션 수명주기 |
| `InterviewStatus` | `ACTIVE`, `COMPLETED` | `COMPLETED`가 프론트의 질의 종료 신호 |
| `CompletedReason` | `THRESHOLD`, `USER_EARLY`, `WATCHDOG`, `TIME_LIMIT` | 인터뷰 종료 사유 — 종료 안내 문구 분기용 (threshold 충족 / 유저 조기 종료 / 감시 한도 / 시간 제한) |
| `QuestionKind` | `REQUIRED`, `OPTIONAL` | 필수 질문(agent 판단, 종료조건 예외) / 임의 질문(threshold 대상) — FR-3 |
| `QuestionStatus` | `PENDING`, `ACTIVE`, `ANSWERED`, `SKIPPED` | 노드 상태 |
| `JobStatus` | `QUEUED`, `RUNNING`, `SUCCEEDED`, `FAILED`, `CANCELLED` | 비동기 job. `CANCELLED`는 API-18 취소 결과 (체크포인트 보존, retry 가능) |
| `JobStage` (ANALYSIS) | `INGEST` → `NORMALIZE` → `EVALUATE` → `DRIFT` → `AGGREGATE` → `REPORT` | 분석 파이프라인 단계 (TRD/back.md §7) |
| `ArtifactType` | `FILE`, `LINK`, `GITHUB` | 결과물 유형 — FR-7 |
| `ArtifactIngestStatus` | `PENDING`, `PARSED`, `SKIPPED_UNSUPPORTED`, `SKIPPED_TOO_LARGE`, `BLOCKED_UNSAFE` | 수집·파싱 결과 — 분석 제외 사유의 투명화 (OQ-15 연계) |
| `MetricStatus` | `GOOD`, `WARN`, `BAD`, `NA` | 지표 상태 — 임계값 판정은 백엔드 메타 기준 (`NA` = 산정 불가) |
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
  interviewStartedAt?: string;  // 시간 제한(timeLimitSec) 카운트다운 표시용
  createdAt: string;
  expiresAt: string;            // 항상 실값 — TTL 24h, REPORT_READY 시 72h
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
  inputType: "text";            // MVP 고정. 선택형 등 확장 시 값 추가 (OQ-10)
  aiGenerated: boolean;         // AI 생성 고지 — true(기본, AI 생성) 시 프론트 질문 카드 표기 의무. 규칙 기반 폴백 질문(TRD/back §11.2)만 false
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
  ingestStatus: ArtifactIngestStatus; // 수집 결과 — SKIPPED/BLOCKED 시 분석 제외 사유 표시
  ingestNote?: string;          // 제외 사유 사용자 표시 문구
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
  location: {                   // 구조화 위치 — 각주 클릭 시 이동/링크의 전제 (v0.3)
    kind: "file" | "web" | "github";
    path?: string;              // file/github: 파일 경로
    startLine?: number;         // file/github: 시작 행
    endLine?: number;
    url?: string;               // web/github: 링크
    note?: string;              // 해석 불가 시 사람이 읽을 위치 설명 (프론트: "위치 이동 불가" 뱃지)
  };
  quote: string;                // 인용문 (발췌) — 결정적 substring 검증 대상
}

interface IntentDoc {           // 의도 기준선 문서 — 결과 화면 좌측 패널·각주 앵커 (v0.3, OQ-22)
  markdown: string;             // 전체 문서 (블록 구분 렌더링은 blocks 기준)
  blocks: {
    blockId: string;            // "ib-<seq>" — 재렌더링에도 불변
    intentIds: string[];        // 해당 블록이 서술하는 의도
  }[];
}

interface Metric {              // 지표 메타 — 임계값·상태 기준은 백엔드 제공 (v0.3, OQ-21)
  metricId: string;
  label: string;
  value: number | null;         // computable=false면 null
  unit: string;                 // "개", "%", "tokens" 등
  thresholds?: { warn: number; bad: number };
  status: MetricStatus;         // GOOD | WARN | BAD | NA
  description: string;          // 산정 방식 설명 (툴팁 소스)
  computable: boolean;          // false = 산정 불가 (0으로 오인 금지)
  reason?: string;              // 산정 불가 사유
}

interface Finding {             // drift 분석 단건 판정
  findingId: string;
  theme: ThemeType;
  dynamicThemeName?: string;    // theme=DYNAMIC일 때
  relatedIntentIds: string[];   // 어긋난 의도 지점
  intentBlockIds: string[];     // IntentDoc 블록 참조 — 카드↔문서 교차 강조 (v0.3)
  summary: string;
  detail: string;
  evidence: EvidenceRef[];      // 비어 있으면 confidence는 LOW 강제. 단 REQUIREMENT_OMISSION의 "부재" 판정은 근거 없음이 정상
  severity: Severity;
  confidence: Confidence;
  suggestion?: string;          // 개선제안 (FR-10)
}

interface Report {
  reportId: string;
  sessionId: string;
  aiGeneratedNotice: true;      // AI 생성 결과 고지 (프론트 표기용)
  earlyCompleted?: boolean;     // 인터뷰 조기 종료 세션 — "분석 신뢰도 저하 가능" 고지 (v0.3)
  intentDoc: IntentDoc;         // 의도 기준선 문서 — 좌측 패널·각주 앵커 (v0.3)
  metrics: Metric[];            // 지표 메타 — 개수·비율 기반 + 토큰 사용량 참고 지표 포함 (v0.3)
  quantStats: {                 // 정량 지표는 개수 기반으로 한정 (FR-10)
    totalIntents: number;
    coveredIntents: number;     // 커버 판정 규칙은 TRD §7.6 (결정적 규칙)
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

### 4.1 입력 검증 제약 (프론트·백 공유 상수 — 양측 동일 규칙 적용)

> 백엔드는 위반 시 `400 INVALID_INPUT`(형식·범위) / `413` / `415` 로 거부하고, 프론트는 동일 상수로 **요청 전** 검증한다.

| 대상 | 제약 | 위반 시 |
| --- | --- | --- |
| `Answer.value` | 1~2,000자 (trim 후 비어있지 않음) | `INVALID_INPUT` |
| `SessionSettings.confuseThreshold` | 0~1, step 0.05 | `INVALID_INPUT` |
| `SessionSettings.timeLimitSec` | 60~3,600 또는 null | `INVALID_INPUT` |
| 기획안 파일 | `.docx` `.txt` `.md`, ≤ 10MB | `UNSUPPORTED_FORMAT` / `PAYLOAD_TOO_LARGE` |
| 결과물 파일 | 개당 ≤ 20MB, 세션당 ≤ 20건. zip 해제 총 ≤ 100MB·≤ 1,000 entries | `PAYLOAD_TOO_LARGE` / `INVALID_INPUT` |
| `LINK` url | `https://`만 허용, 사설 IP·localhost 차단(SSRF 가드는 서버 재검증) | `INVALID_INPUT` |
| `GITHUB` url | host가 `github.com`인 `https://`만 허용 | `INVALID_INPUT` |
| `requestFlag`·`confirm` | boolean | `INVALID_INPUT` |

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
| `SESSION_EXPIRED` | 410 | 세션 만료 (TTL 24h / REPORT_READY 72h) — 데이터 파기됨 | 아니오 |
| `UNSUPPORTED_FORMAT` | 415 | 허용 외 파일 포맷 (FR-1: docx/txt/md 외) | 아니오 |
| `PAYLOAD_TOO_LARGE` | 413 | 크기 한도 초과 (§4.1 상수) | 아니오 |
| `INTERVIEW_NOT_ACTIVE` | 409 | 종료/미시작 인터뷰에 답변 제출 | 아니오 |
| `REQUIRED_QUESTIONS_PENDING` | 409 | 조기 종료(API-17) 시 REQUIRED 미답변 존재 && `confirm=false` — `details.pendingQuestionIds` 동봉 | 아니오 (confirm 후 재요청) |
| `ANALYSIS_PRECONDITION_FAILED` | 409 | 의도 미확보 또는 결과물 0건 상태로 분석 요청 | 아니오 |
| `JOB_NOT_FOUND` | 404 | 잘못된 jobId | 아니오 |
| `JOB_NOT_RETRYABLE` | 409 | 실패/취소 상태가 아닌 job에 retry 요청 | 아니오 |
| `JOB_NOT_CANCELLABLE` | 409 | 종결(SUCCEEDED/FAILED) job에 cancel 요청 | 아니오 |
| `PIPELINE_STAGE_FAILED` | — (HTTP 아님) | 분석 단계 실패 — API-11 응답의 `job.error`에 담겨 전달(서버 재시작으로 중단된 고아 job 포함). 완료 단계 체크포인트는 보존 | 예 (API-12 retry) |
| `LLM_UPSTREAM_ERROR` | 502 | Copilot SDK/모델 호출 실패 (서버 데모 폴백 소진 시) | 예 |
| `RATE_LIMITED` | 429 | API-01 IP당 분당 5회 초과 — `Retry-After` 헤더 동봉 | 예 |
| `INTERNAL` | 500 | 미분류 서버 오류 | 예 |

---

## 6. 미결(보류) 항목 요약

v0.3에서 다수 항목이 확정되었다. **남은 보류**:

| 항목 | 현재 계약 상태 | 확정 위치 |
| --- | --- | --- |
| SSE 스트리밍 | 보류 엔드포인트로 예약 — 인터뷰 턴 p50>5s 또는 p95>15s 실측 시 도입 | TRD/back.md §13 OQ-09 |
| 질문 입력 유형 확장(선택형 등) | `inputType:"text"` 고정 필드 선도입 완료, 값 확장만 보류 | TRD/back.md §13 OQ-10 |
| 이전 답변 수정/재질의 | 보류 엔드포인트로 예약 (M2) — 도입 시 subtree `INVALIDATED` 계약 동반 | TRD/back.md §13 OQ-11 |

**v0.3 확정 이력** (v0.2까지 보류였던 항목):

| 항목 | 확정 내용 | 근거 |
| --- | --- | --- |
| 세션 TTL/보존 | 24h(마지막 활동) / REPORT_READY 72h, `expiresAt` 실값, API-19 즉시 파기 | OQ-07 종결, GAP §4.6 |
| 파일 크기 한도 | §4.1 상수 (기획안 10MB, 결과물 20MB/20건, zip 100MB/1,000) | OQ-08 종결 |
| 유저 주도 조기 종료 | API-17 + `REQUIRED_QUESTIONS_PENDING` + `completedReason` | OQ-12 종결, GAP C5-c |
| Rate limit | API-01 IP당 분당 5회 | OQ-13 종결, GAP C6-c |
| job 취소 | API-18 + `CANCELLED` 상태 (체크포인트 보존) | GAP C5-c |
| 헬스 프로브 | API-15 `/health` · API-16 `/ready` | GAP C3-d/C4-d |
| 입력 검증 | §4.1 공유 상수 | GAP C6-c |
| IntentDoc·blockId·EvidenceRef 구조화 | §4 모델 반영 | OQ-17/OQ-22 종결 |
| 지표 메타 | `Report.metrics[]` (`Metric` 모델) | OQ-21 종결 |
| 수집 상태 | `Artifact.ingestStatus` | OQ-15 연계 |
| 보안 헤더·AI 고지 일관성 | §1 공통 규약 | GAP C6-b/C6-c |

---

## 7. 미결 항목의 UX 관점 고려 (v0.3 반영 현황)

> v0.2 §7의 제안 중 대부분이 v0.3 계약으로 채택되었다. 각 항목의 결정 근거는
> [TRD/back.md §13.2](../TRD/back.md), 프론트 통합 분석은 [TRD/back.md 부록 B](../TRD/back.md) 참조.

| 항목 | UX 고려 로직 | 상태 |
| --- | --- | --- |
| 세션 TTL/보존 (OQ-07) | `expiresAt` 실값으로 만료 구분 표시. 만료·유실 시 토큰 폐기 + "새 세션 시작" CTA 단일 패턴 | **채택 (v0.3)** |
| 파일 크기 한도 (OQ-08) | §4.1 상수를 프론트 공유 → 업로드 전 검증으로 `413` 왕복 제거, 오류 문구에 한도 명시 | **채택 (v0.3)** |
| SSE (OQ-09) | 동기 유지. 제출 직후 스켈레톤 노드, 30s 경과 시 "질문 생성 중" 안심 문구. p50>5s 실측 시 재검토 | 보류 유지 (UX 완충은 프론트 TRD 확정) |
| 질문 입력 유형 (OQ-10) | `inputType:"text"` 선도입 — 향후 스위치 확장만으로 대응 | **채택 (v0.3, 값 확장은 보류)** |
| 답변 수정 (OQ-11) | 도입 시 "이후 branch 무효화·재생성" 경고 모달 필수, 무효 노드는 시각 구분 | 보류 유지 (M2) |
| 조기 종료 (OQ-12) | API-17 — REQUIRED 미답변 경고 후 확정, `Report.earlyCompleted` 고지 | **채택 (v0.3)** |
| Rate limit (OQ-13) | `Retry-After` 기반 카운트다운 표시. 세션당 job 1개 제약은 UI 중복 실행 방지와 정합 | **채택 (v0.3)** |
| 분석 취소 | API-18 + fetch abort — 장시간 작업 유저 통제권 (ref 감점 항목 선제 해소) | **채택 (v0.3)** |

### 7.1 스키마 확장 이력·잔여 후보

| 필드/계약 | 목적 (UX) | 상태 |
| --- | --- | --- |
| `QuestionNode.inputType` / `aiGenerated` | 렌더링 스위치 / AI 고지 | **채택 (v0.3)** |
| API-06 응답 `remainingQuestions` | 잔여 질문 예산 힌트로 대기 불안 완화 | **채택 (v0.3)** |
| `IntentDoc` + `blockId` | 결과 화면 좌측 문서 패널·각주 앵커 | **채택 (v0.3)** — OQ-22, 부록 B.1/B.3 |
| `EvidenceRef.location` 구조화 | 교차 강조·문서 내 위치 이동 | **채택 (v0.3)** — 부록 B.3 |
| `Report.metrics[]` + 토큰 사용량 | 지표 메타 백엔드 제공, `산정 불가`(`computable=false`) 표현 | **채택 (v0.3)** — OQ-21, 부록 B.4 |
| `Artifact.ingestStatus` | 분석 제외 사유 투명화 | **채택 (v0.3)** |
| `Session.interviewStartedAt` | 시간 제한 카운트다운 | **채택 (v0.3)** |
| POST `/interview/complete` | 유저 주도 조기 종료 | **채택 (v0.3, API-17)** |
| SSE 스트림 엔드포인트 | 턴 스트리밍 (실측 후) | 잔여 후보 (OQ-09) |
| PATCH 답변 수정 + `INVALIDATED` | 답변 수정·분기 재생성 | 잔여 후보 (OQ-11, M2) |