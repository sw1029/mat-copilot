import type { CompletedReason, QuestionKind, QuestionStatus } from '../../shared/api/types';

export function statusLabel(status: QuestionStatus, submittingActive = false): string {
  if (submittingActive) return '전송 중';
  switch (status) {
    case 'ANSWERED':
      return '완료 ✓';
    case 'ACTIVE':
      return '활성 ●';
    case 'PENDING':
      return '대기';
    case 'SKIPPED':
      return '건너뜀';
  }
}

export function kindLabel(kind: QuestionKind): string {
  return kind === 'REQUIRED' ? '필수' : '선택';
}

export function confusedLabel(score?: number): string | undefined {
  if (score === undefined) return undefined;
  if (score >= 0.66) return '모호도: 높음';
  if (score >= 0.33) return '모호도: 보통';
  return '모호도: 낮음';
}

export function completionMessage(reason?: CompletedReason | null): string {
  switch (reason) {
    case 'THRESHOLD':
      return '의도가 충분히 구체화됐어요.';
    case 'USER_EARLY':
      return '사용자 요청으로 인터뷰를 마쳤어요.';
    case 'WATCHDOG':
      return '질문 한도에 도달했어요.';
    case 'TIME_LIMIT':
      return '시간 제한에 도달했어요.';
    default:
      return '인터뷰를 마쳤어요.';
  }
}
