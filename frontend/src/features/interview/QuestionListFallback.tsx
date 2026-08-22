import type { QuestionNode } from '../../shared/api/types';
import { AIGeneratedBadge } from '../../shared/ui/AIGeneratedBadge';
import { QuestionCard } from './QuestionCard';
import { confusedLabel, kindLabel, statusLabel } from './status';
import styles from './QuestionListFallback.module.css';

interface QuestionListFallbackProps {
  nodes: QuestionNode[];
  answersByQuestionId: Record<string, string>;
  submitting: boolean;
  draftByQuestionId: Record<string, string>;
  sampleMode: boolean;
  onDraftChange: (questionId: string, value: string) => void;
  onSubmit: (question: QuestionNode, value: string, requestFlag: boolean) => Promise<boolean>;
  onSampleNoAnswer: () => Promise<void>;
}

function byOrder(a: QuestionNode, b: QuestionNode): number {
  const byDate = Date.parse(a.createdAt) - Date.parse(b.createdAt);
  if (Number.isFinite(byDate) && byDate !== 0) return byDate;
  return a.questionId.localeCompare(b.questionId);
}

export function QuestionListFallback(props: QuestionListFallbackProps) {
  const roots = props.nodes.filter((node) => node.parentId === null).sort(byOrder);
  return (
    <div className={styles.wrapper}>
      <ol className={styles.list} aria-label="인터뷰 질문 흐름">
        {roots.map((node) => <QuestionItem key={node.questionId} node={node} {...props} />)}
      </ol>
    </div>
  );
}

function QuestionItem({ node, ...props }: { node: QuestionNode } & QuestionListFallbackProps) {
  const children = props.nodes.filter((child) => child.parentId === node.questionId).sort(byOrder);
  const ambiguity = confusedLabel(node.confused);
  return (
    <li className={`${styles.item} ${node.status === 'ACTIVE' ? styles.active : ''}`} aria-current={node.status === 'ACTIVE' ? 'step' : undefined}>
      <div className={styles.meta}>
        <span className={styles.status}>{statusLabel(node.status, node.status === 'ACTIVE' && props.submitting)}</span>
        <span className={`${styles.badge} ${node.kind === 'REQUIRED' ? styles.required : ''}`}>{kindLabel(node.kind)}</span>
        {node.aiGenerated && <AIGeneratedBadge surface="question" />}
        {node.intentPhase === 'REVISED' && <span className={styles.badge}>변경된 의도 확인</span>}
        {ambiguity && <span className={styles.badge} title={`모호도 점수: ${node.confused?.toFixed(2)}`}>{ambiguity}</span>}
      </div>
      {node.status === 'ACTIVE' ? (
        <QuestionCard
          question={node}
          submitting={props.submitting}
          draft={props.draftByQuestionId[node.questionId]}
          sampleMode={props.sampleMode}
          onDraftChange={props.onDraftChange}
          onSubmit={props.onSubmit}
          onSampleNoAnswer={props.onSampleNoAnswer}
        />
      ) : (
        <>
          <p className={styles.prompt}>{node.prompt}</p>
          {node.status === 'ANSWERED' && <p className={styles.answer}>답변: {props.answersByQuestionId[node.questionId] ?? '저장된 답변이 없습니다.'}</p>}
        </>
      )}
      {children.length > 0 && (
        <ol className={styles.children}>
          {children.map((child) => <QuestionItem key={child.questionId} node={child} {...props} />)}
        </ol>
      )}
    </li>
  );
}
