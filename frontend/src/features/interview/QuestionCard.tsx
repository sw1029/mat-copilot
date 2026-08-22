import { useEffect, useMemo, useRef, useState } from 'react';
import type { QuestionNode } from '../../shared/api/types';
import { ANSWER_MAX_LENGTH, validateAnswer } from '../../shared/utils/validation';
import { Button } from '../../shared/ui/Button';
import { useUiStore } from '../../stores/uiStore';
import { getSampleAnswer } from '../sample/sampleFlow';
import { announce } from '../../shared/a11y/liveRegion';
import styles from './QuestionCard.module.css';

interface QuestionCardProps {
  question: QuestionNode;
  submitting: boolean;
  draft?: string;
  sampleMode: boolean;
  onDraftChange: (questionId: string, value: string) => void;
  onSubmit: (question: QuestionNode, value: string, requestFlag: boolean) => Promise<boolean>;
  onSampleNoAnswer: () => Promise<void>;
}

export function QuestionCard({
  question,
  submitting,
  draft,
  sampleMode,
  onDraftChange,
  onSubmit,
  onSampleNoAnswer,
}: QuestionCardProps) {
  const [value, setValue] = useState(draft ?? '');
  const [requestFlag, setRequestFlag] = useState(false);
  const [intervened, setIntervened] = useState(false);
  const autoRanRef = useRef<Set<string>>(new Set());
  const setHasUnsavedInput = useUiStore((s) => s.setHasUnsavedInput);
  const validation = useMemo(() => validateAnswer(value), [value]);

  useEffect(() => {
    setValue(draft ?? '');
    setRequestFlag(false);
    setIntervened(false);
  }, [question.questionId, draft]);

  useEffect(() => {
    setHasUnsavedInput(value.trim().length > 0);
  }, [setHasUnsavedInput, value]);

  // 콜백/객체 identity 변동(React Flow 리렌더)으로 타이머가 취소되지 않도록 최신 참조를 ref로 유지
  const latestRef = useRef({ onDraftChange, onSubmit, onSampleNoAnswer, question });
  latestRef.current = { onDraftChange, onSubmit, onSampleNoAnswer, question };

  useEffect(() => {
    if (!sampleMode || intervened || autoRanRef.current.has(question.questionId)) return;
    const qid = question.questionId;
    const sampleAnswer = getSampleAnswer(qid);
    const timer = window.setTimeout(() => {
      // 실제 발화 시점에만 실행 완료로 기록한다 (조기 등록 시 리렌더로 영구 취소됨)
      if (autoRanRef.current.has(qid)) return;
      autoRanRef.current.add(qid);
      const latest = latestRef.current;
      if (sampleAnswer) {
        setValue(sampleAnswer);
        latest.onDraftChange(qid, sampleAnswer);
        announce('샘플 답변을 자동 입력하고 제출합니다.');
        void latest.onSubmit(latest.question, sampleAnswer, false).then((ok) => {
          if (ok) setHasUnsavedInput(false);
        });
      } else {
        announce('샘플 답변이 없어 인터뷰를 자동으로 마칩니다.');
        void latest.onSampleNoAnswer();
      }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [intervened, question.questionId, sampleMode, setHasUnsavedInput]);

  const submit = async () => {
    if (!validation.valid || submitting) return;
    const ok = await onSubmit(question, value, requestFlag);
    if (ok) setHasUnsavedInput(false);
  };

  return (
    <section className={styles.card} aria-labelledby={`question-title-${question.questionId}`}>
      <h2 id={`question-title-${question.questionId}`} className={styles.prompt}>{question.prompt}</h2>
      {question.helperText && <p className={styles.helper}>{question.helperText}</p>}
      <label className={styles.label} htmlFor={`answer-${question.questionId}`}>답변</label>
      <textarea
        id={`answer-${question.questionId}`}
        data-question-textarea={question.questionId}
        className={`${styles.textarea} nodrag`}
        rows={5}
        value={value}
        disabled={submitting}
        maxLength={ANSWER_MAX_LENGTH + 1}
        onChange={(event) => {
          setIntervened(true);
          setValue(event.target.value);
          onDraftChange(question.questionId, event.target.value);
        }}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault();
            void submit();
          }
        }}
      />
      <div className={styles.metaRow}>
        <span className={styles.counter}>{value.length.toLocaleString('ko-KR')}/{ANSWER_MAX_LENGTH.toLocaleString('ko-KR')}</span>
        {!validation.valid && value.length > 0 && <span className={styles.error}>{validation.message}</span>}
      </div>
      <label className={`${styles.checkbox} nodrag`}>
        <input
          type="checkbox"
          checked={requestFlag}
          disabled={submitting}
          onChange={(event) => {
            setIntervened(true);
            setRequestFlag(event.target.checked);
          }}
        />
        더 구체적으로 물어봐 주세요
      </label>
      <div className={styles.actions}>
        <Button onClick={() => void submit()} disabled={!validation.valid || submitting} loading={submitting} className="nodrag">
          답변 제출
        </Button>
      </div>
    </section>
  );
}
