import styles from './AIGeneratedBadge.module.css';

// TRD/front.md §11.5 — 책임 있는 AI 고지. 모든 AI 표면에 일관 표기.

export type AISurface = 'question' | 'intentDoc' | 'report' | 'suggestion' | 'metricNa' | 'plan';

const SURFACE_COPY: Record<AISurface, { label: string; description: string }> = {
  question: {
    label: 'AI 생성 질문',
    description: 'AI가 생성한 질문입니다. 중요한 내용은 사용자가 검토해 주세요.',
  },
  intentDoc: {
    label: 'AI 정리 문서',
    description: '인터뷰 답변을 바탕으로 AI가 정리한 의도 기준선입니다.',
  },
  report: {
    label: 'AI 분석 결과',
    description: 'AI 분석 결과이며, 근거와 함께 검토용으로 제공됩니다.',
  },
  suggestion: {
    label: 'AI 개선 제안',
    description: 'AI가 제안한 다음 행동입니다. 자동 수정이 아니며 사용자가 검토해 주세요.',
  },
  metricNa: {
    label: '산정 불가',
    description: '데이터 부족으로 AI가 해당 지표를 산정하지 않았습니다.',
  },
  plan: {
    label: 'AI 추출 요약',
    description: '업로드한 기획안에서 AI가 추출한 의도 요약입니다.',
  },
};

interface AIGeneratedBadgeProps {
  surface: AISurface;
  className?: string;
}

export function AIGeneratedBadge({ surface, className }: AIGeneratedBadgeProps) {
  const copy = SURFACE_COPY[surface];
  return (
    <span
      className={`${styles.badge} ${className ?? ''}`}
      role="note"
      aria-label={`${copy.label}: ${copy.description}`}
      title={copy.description}
    >
      <span aria-hidden="true" className={styles.icon}>
        ✦
      </span>
      {copy.label}
    </span>
  );
}
