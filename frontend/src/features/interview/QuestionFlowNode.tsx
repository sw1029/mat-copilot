import { memo, useState } from 'react';
import type { Node, NodeProps } from '@xyflow/react';
import type { QuestionNode } from '../../shared/api/types';
import { AIGeneratedBadge } from '../../shared/ui/AIGeneratedBadge';
import { Skeleton } from '../../shared/ui/Skeleton';
import { QuestionCard } from './QuestionCard';
import { confusedLabel, kindLabel, statusLabel } from './status';
import styles from './QuestionFlowNode.module.css';

export interface QuestionNodeData extends Record<string, unknown> {
  question: QuestionNode;
  answer?: string;
  submitting: boolean;
  draft?: string;
  sampleMode: boolean;
  onDraftChange: (questionId: string, value: string) => void;
  onSubmit: (question: QuestionNode, value: string, requestFlag: boolean) => Promise<boolean>;
  onSampleNoAnswer: () => Promise<void>;
}

export type InterviewFlowNode = Node<QuestionNodeData, 'question'>;

function QuestionFlowNodeComponent({ data }: NodeProps<InterviewFlowNode>) {
  const { question, answer, submitting, draft, sampleMode, onDraftChange, onSubmit, onSampleNoAnswer } = data;
  const [expanded, setExpanded] = useState(false);
  const isSubmittingActive = question.status === 'ACTIVE' && submitting;
  const classes = [styles.node];
  if (question.kind === 'REQUIRED') classes.push(styles.required);
  if (question.intentPhase === 'REVISED') classes.push(styles.revised);
  if (question.status === 'ACTIVE') classes.push(styles.active);
  if (question.status === 'ANSWERED') classes.push(styles.answered);
  if (question.status === 'SKIPPED') classes.push(styles.skipped);
  const ambiguity = confusedLabel(question.confused);
  const summary = answer ? `${answer.slice(0, 80)}${answer.length > 80 ? '…' : ''}` : '제출한 답변 요약이 없습니다.';

  return (
    <article
      className={classes.join(' ')}
      tabIndex={question.status === 'ANSWERED' ? 0 : -1}
      aria-label={`${statusLabel(question.status, isSubmittingActive)} 질문: ${question.prompt}`}
      onClick={() => question.status === 'ANSWERED' && setExpanded((value) => !value)}
      onKeyDown={(event) => {
        if (question.status === 'ANSWERED' && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          setExpanded((value) => !value);
        }
      }}
    >
      <div className={styles.header}>
        <span className={styles.status}>{statusLabel(question.status, isSubmittingActive)}</span>
        <span className={`${styles.badge} ${question.kind === 'REQUIRED' ? styles.kindRequired : ''}`}>{kindLabel(question.kind)}</span>
        {question.aiGenerated && <AIGeneratedBadge surface="question" />}
        {question.intentPhase === 'REVISED' && <span className={`${styles.badge} ${styles.revisedBadge}`}>변경된 의도 확인</span>}
        {ambiguity && <span className={styles.badge} title={`모호도 점수: ${question.confused?.toFixed(2)}`}>{ambiguity}</span>}
      </div>
      {question.status === 'ACTIVE' ? (
        <QuestionCard
          question={question}
          submitting={submitting}
          draft={draft}
          sampleMode={sampleMode}
          onDraftChange={onDraftChange}
          onSubmit={onSubmit}
          onSampleNoAnswer={onSampleNoAnswer}
        />
      ) : (
        <>
          <p className={styles.prompt}>{question.prompt}</p>
          {question.status === 'ANSWERED' && (
            <div>
              <p className={styles.summary}>답변: {summary}</p>
              {expanded && <p className={styles.detail}>{answer ?? '저장된 답변이 없습니다.'}</p>}
            </div>
          )}
        </>
      )}
    </article>
  );
}

export const QuestionFlowNode = memo(QuestionFlowNodeComponent);

export function PendingSkeletonNode({ overdue }: { overdue: boolean }) {
  return (
    <div className={styles.skeletonNode} role="status" aria-label="다음 질문을 불러오는 중">
      <Skeleton width="70%" height="18px" />
      <Skeleton width="95%" height="14px" />
      <Skeleton width="85%" height="14px" />
      {overdue && <p className={styles.waitText}>질문을 정리하는 중입니다. 잠시만 기다려 주세요.</p>}
    </div>
  );
}
