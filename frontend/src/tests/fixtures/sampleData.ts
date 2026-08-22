import type {
  ChartSpec,
  Finding,
  IntentDoc,
  Metric,
  NormalizationSchema,
  QuestionNode,
  Report,
} from '../../shared/api/types';

// TRD/front.md §14.3 sample-basic — 샘플 체험(E2E)과 mock 백엔드가 공유하는 번들 데이터.
// 질문 2개(REQUIRED) + 후속 1개(OPTIONAL), 결과물 1개, finding 3개.

export const SAMPLE_PLAN_MARKDOWN = `# 여행 메이트 — 여행 일정 공유 서비스 기획안

## 핵심 목표
친구들과 여행 일정을 함께 만들고 실시간으로 공유하는 웹 서비스를 만든다.

## 필수 요구사항
- 일정은 초대 링크 하나로 공유할 수 있어야 한다.
- 오프라인에서도 마지막 일정을 볼 수 있어야 한다.
- 회원가입 없이 바로 사용할 수 있어야 한다.

## 제외 범위
- 결제/구독 기능은 이번 버전에 포함하지 않는다.
`;

export const SAMPLE_ARTIFACT_NAME = 'travel-mate-readme.md';

export const SAMPLE_ARTIFACT_MARKDOWN = `# Travel Mate

여행 일정을 만들고 공유하는 웹 앱입니다.

## 기능
- 일정 만들기: 날짜별로 방문지를 추가합니다.
- 공유: 팀원에게 이메일 초대를 보내 일정을 공유합니다.
- 프리미엄 구독: 월 4,900원으로 무제한 일정을 만들 수 있습니다.

## 시작하기
회원가입 없이 게스트 모드로 바로 사용할 수 있습니다.
`;

/** 샘플 인터뷰 질문 트리 (mock 백엔드 초기 상태) */
export const SAMPLE_QUESTION_ROOT: QuestionNode = {
  questionId: 'q-root',
  parentId: null,
  depth: 0,
  prompt: '만들려는 서비스가 사용자에게 주는 핵심 가치는 무엇인가요?',
  helperText: '한 문장으로 표현해 보세요. 예: "친구들과 여행 일정을 함께 만든다"',
  kind: 'REQUIRED',
  status: 'ACTIVE',
  inputType: 'text',
  aiGenerated: true,
  intentPhase: 'INITIAL',
  createdAt: '2026-08-22T04:00:00Z',
};

export const SAMPLE_QUESTION_SECOND: QuestionNode = {
  questionId: 'q-share',
  parentId: 'q-root',
  depth: 1,
  prompt: '일정 공유는 어떤 방식이어야 하나요? 꼭 지켜져야 할 조건이 있나요?',
  helperText: '공유 대상, 방법, 제약을 자유롭게 적어 주세요.',
  kind: 'REQUIRED',
  status: 'PENDING',
  inputType: 'text',
  aiGenerated: true,
  confused: 0.62,
  intentPhase: 'INITIAL',
  createdAt: '2026-08-22T04:01:00Z',
};

export const SAMPLE_QUESTION_THIRD: QuestionNode = {
  questionId: 'q-offline',
  parentId: 'q-share',
  depth: 2,
  prompt: '네트워크가 끊긴 상황에서는 어떤 동작을 기대하나요?',
  helperText: '선택 질문이에요. 떠오르는 내용이 없다면 넘어가도 좋아요.',
  kind: 'OPTIONAL',
  status: 'PENDING',
  inputType: 'text',
  aiGenerated: true,
  confused: 0.35,
  intentPhase: 'INITIAL',
  createdAt: '2026-08-22T04:02:00Z',
};

/** 샘플 모드에서 각 질문에 자동 입력할 답변 */
export const SAMPLE_ANSWERS: Record<string, string> = {
  'q-root':
    '친구들과 여행 일정을 함께 만들고, 만든 일정을 손쉽게 공유하는 것이 핵심이에요. 회원가입 없이 바로 쓸 수 있어야 해요.',
  'q-share':
    '초대 링크 하나만 보내면 누구나 일정을 볼 수 있어야 해요. 이메일 가입 같은 절차는 원하지 않아요. 오프라인에서도 마지막 일정은 보였으면 해요.',
  'q-offline': '오프라인에서는 마지막으로 본 일정이 읽기 전용으로 보이면 충분해요.',
};

export const SAMPLE_INTENT_DOC: IntentDoc = {
  markdown: `# 의도 기준선 — 여행 메이트

## 1. 핵심 가치
친구들과 여행 일정을 함께 만들고 공유하는 서비스다. 협업과 공유가 제품의 중심이다.

## 2. 공유 방식
일정 공유는 초대 링크 하나로 이루어져야 하며, 수신자는 가입 절차 없이 일정을 볼 수 있어야 한다.

## 3. 오프라인 동작
네트워크가 끊겨도 마지막으로 본 일정을 읽기 전용으로 볼 수 있어야 한다.

## 4. 진입 장벽
회원가입 없이 게스트로 바로 사용할 수 있어야 한다.

## 5. 제외 범위
결제·구독 기능은 이번 버전 범위에 포함하지 않는다.`,
  blocks: [
    { blockId: 'ib-1', intentIds: ['in-core'] },
    { blockId: 'ib-2', intentIds: ['in-share'] },
    { blockId: 'ib-3', intentIds: ['in-offline'] },
    { blockId: 'ib-4', intentIds: ['in-guest'] },
    { blockId: 'ib-5', intentIds: ['in-no-billing'] },
  ],
};

export const SAMPLE_FINDINGS: Finding[] = [
  {
    findingId: 'f-omission-offline',
    theme: 'REQUIREMENT_OMISSION',
    relatedIntentIds: ['in-offline'],
    intentBlockIds: ['ib-3'],
    summary: '오프라인 일정 열람 요구가 결과물에서 확인되지 않아요.',
    detail:
      '의도 기준선 3번 블록은 "네트워크가 끊겨도 마지막 일정을 읽기 전용으로 볼 수 있어야 한다"를 요구하지만, 제출된 README 어디에서도 오프라인 동작에 대한 설명이나 구현 언급을 찾지 못했어요. 누락 판정이므로 결과물 근거가 없는 것이 정상이에요.',
    evidence: [],
    severity: 'HIGH',
    confidence: 'LOW',
    suggestion:
      'README와 구현에 오프라인 캐시 전략(예: 마지막 일정 로컬 저장 후 읽기 전용 표시)을 추가하는 것을 검토해 보세요.',
  },
  {
    findingId: 'f-distortion-share',
    theme: 'INTENT_DISTORTION',
    relatedIntentIds: ['in-share'],
    intentBlockIds: ['ib-2'],
    summary: '초대 링크 공유 의도가 이메일 초대 방식으로 변형됐어요.',
    detail:
      '의도 기준선 2번 블록은 "초대 링크 하나로, 가입 절차 없이" 공유되기를 요구했지만, 결과물은 이메일 초대를 보내는 방식으로 구현을 설명하고 있어요. 공유 진입 장벽이 의도보다 높아졌어요.',
    evidence: [
      {
        artifactId: 'a-sample-readme',
        location: {
          kind: 'file',
          path: 'travel-mate-readme.md',
          startLine: 7,
          endLine: 7,
        },
        quote: '공유: 팀원에게 이메일 초대를 보내 일정을 공유합니다.',
      },
    ],
    severity: 'MEDIUM',
    confidence: 'HIGH',
    suggestion:
      '이메일 초대 대신 열람 권한이 있는 초대 링크 생성 기능으로 변경하거나, 링크 공유를 기본 경로로 추가하세요.',
  },
  {
    findingId: 'f-creep-billing',
    theme: 'SCOPE_CREEP',
    relatedIntentIds: ['in-no-billing'],
    intentBlockIds: ['ib-5'],
    summary: '제외 범위로 명시한 유료 구독 기능이 추가됐어요.',
    detail:
      '의도 기준선 5번 블록은 결제·구독 기능을 이번 버전에서 제외한다고 명시했지만, 결과물에는 월 구독 상품이 포함돼 있어요. 의도하지 않은 범위 확장이에요.',
    evidence: [
      {
        artifactId: 'a-sample-readme',
        location: {
          kind: 'file',
          path: 'travel-mate-readme.md',
          startLine: 8,
          endLine: 8,
        },
        quote: '프리미엄 구독: 월 4,900원으로 무제한 일정을 만들 수 있습니다.',
      },
    ],
    severity: 'MEDIUM',
    confidence: 'HIGH',
    suggestion: '이번 릴리스에서 구독 관련 기능과 문구를 제거하거나, 의도 기준선을 갱신하세요.',
  },
];

export const SAMPLE_METRICS: Metric[] = [
  {
    metricId: 'm-coverage',
    label: '의도 커버리지',
    value: 60,
    unit: '%',
    thresholds: { warn: 80, bad: 50 },
    status: 'WARN',
    description: '결과물에서 대응 근거가 확인된 의도의 비율이에요. (커버된 의도 ÷ 전체 의도)',
    computable: true,
  },
  {
    metricId: 'm-drift-count',
    label: 'drift 지점 수',
    value: 3,
    unit: '개',
    status: 'WARN',
    description: '의도 기준선과 어긋난 것으로 판정된 지점의 수예요.',
    computable: true,
  },
  {
    metricId: 'm-artifacts',
    label: '분석된 결과물',
    value: 1,
    unit: '건',
    status: 'GOOD',
    description: '제출된 결과물 중 파싱에 성공해 분석에 포함된 건수예요.',
    computable: true,
  },
  {
    metricId: 'm-token-usage',
    label: '토큰 사용량 참고',
    value: null,
    unit: 'tokens',
    status: 'NA',
    description: '이번 분석에서 사용한 LLM 토큰 수예요.',
    computable: false,
    reason: '데모 세션에서는 토큰 사용량 집계가 비활성화되어 있어요.',
  },
];

export const SAMPLE_NORMALIZATION_SCHEMA: NormalizationSchema = {
  schemaId: 'ns-sample-1',
  lockedAt: '2026-08-22T04:05:00Z',
  tags: [
    { tagId: 't-core', name: '핵심 가치', description: '제품이 제공하는 중심 가치' },
    { tagId: 't-constraint', name: '제약', description: '반드시 지켜야 할 조건' },
    { tagId: 't-scope', name: '범위', description: '포함/제외 범위 선언' },
  ],
  fields: [
    { fieldId: 'fd-priority', name: 'priority', type: 'enum', enumValues: ['must', 'should'] },
    { fieldId: 'fd-explicit', name: 'explicit', type: 'boolean' },
  ],
};

export const SAMPLE_QUALITATIVE_MARKDOWN = `## 종합 분석

제출된 결과물은 **핵심 가치(일정 생성·공유)** 와 **게스트 사용** 의도를 잘 반영하고 있어요. 다만 세 가지 지점에서 의도와 어긋났어요.

1. **오프라인 열람 누락** — 필수 요구였던 오프라인 동작이 결과물에서 확인되지 않아요.
2. **공유 방식 왜곡** — 초대 링크 공유가 이메일 초대로 바뀌며 진입 장벽이 높아졌어요.
3. **범위 초과** — 제외 범위로 명시한 유료 구독이 추가됐어요.

우선순위는 오프라인 열람(필수 요구 누락) → 공유 방식 정정 → 구독 기능 제거 순서를 권장해요.`;

export const SAMPLE_SUGGESTIONS: string[] = [
  '오프라인 캐시 전략을 정의하고 README에 동작 방식을 명시하세요.',
  '초대 링크 기반 공유를 기본 경로로 되돌리고, 이메일 초대는 보조 수단으로 격하하세요.',
  '이번 릴리스 범위에서 구독 기능을 분리하거나 의도 기준선을 공식적으로 갱신하세요.',
];

export function buildSampleReport(sessionId: string, earlyCompleted: boolean): Report {
  return {
    reportId: 'r-sample-1',
    sessionId,
    aiGeneratedNotice: true,
    earlyCompleted,
    intentDoc: SAMPLE_INTENT_DOC,
    metrics: SAMPLE_METRICS,
    quantStats: {
      totalIntents: 5,
      coveredIntents: 3,
      driftCount: 3,
      countsByTheme: [
        { theme: 'REQUIREMENT_OMISSION', count: 1 },
        { theme: 'INTENT_DISTORTION', count: 1 },
        { theme: 'SCOPE_CREEP', count: 1 },
      ],
      countsBySeverity: [
        { severity: 'HIGH', count: 1 },
        { severity: 'MEDIUM', count: 2 },
        { severity: 'LOW', count: 0 },
      ],
    },
    qualitative: SAMPLE_QUALITATIVE_MARKDOWN,
    suggestions: SAMPLE_SUGGESTIONS,
    findings: SAMPLE_FINDINGS,
    normalizationSchema: SAMPLE_NORMALIZATION_SCHEMA,
    createdAt: '2026-08-22T04:10:00Z',
  };
}

export const SAMPLE_CHARTS: ChartSpec[] = [
  {
    chartId: 'c-theme',
    title: '테마별 drift 건수',
    xAxisName: '테마',
    yAxisName: '건수',
    csv: '테마,건수\n요구 누락,1\n의도 왜곡,1\n범위 초과,1',
    description: 'drift 판정을 테마별로 집계한 값이에요.',
  },
  {
    chartId: 'c-severity',
    title: '심각도 분포',
    xAxisName: '심각도',
    yAxisName: '건수',
    csv: '심각도,건수\n높음,1\n중간,2\n낮음,0',
    description: 'finding 심각도 등급별 건수예요.',
  },
];
