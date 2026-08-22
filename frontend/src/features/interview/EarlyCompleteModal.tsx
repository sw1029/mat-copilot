import { ConfirmModal } from '../../shared/ui/ConfirmModal';
import type { QuestionNode } from '../../shared/api/types';

interface EarlyCompleteModalProps {
  open: boolean;
  pendingQuestionIds: string[];
  nodes: QuestionNode[];
  confirming: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function EarlyCompleteModal({ open, pendingQuestionIds, nodes, confirming, onConfirm, onCancel }: EarlyCompleteModalProps) {
  const promptsById = new Map(nodes.map((node) => [node.questionId, node.prompt]));
  return (
    <ConfirmModal
      open={open}
      title="필수 질문이 남아 있어요"
      confirmLabel={confirming ? '이동 중…' : '그래도 넘어가기'}
      cancelLabel="계속 답변하기"
      danger
      confirmDisabled={confirming}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <p>아직 답변하지 않은 필수 질문이 있어요. 그래도 넘어가면 분석 신뢰도가 낮아질 수 있어요.</p>
      <ul>
        {pendingQuestionIds.map((id) => <li key={id}>{promptsById.get(id) ?? id}</li>)}
      </ul>
    </ConfirmModal>
  );
}
