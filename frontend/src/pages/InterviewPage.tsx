import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ReactFlowProvider, useReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { announce } from '../shared/a11y/liveRegion';
import { asErrorViewModel, isAbortError, isSessionGoneError, type ApiErrorViewModel } from '../shared/api/errors';
import { completeInterview, getInterviewTree, getSession, startInterview, submitAnswer } from '../shared/api/endpoints';
import type { QuestionNode } from '../shared/api/types';
import { Button } from '../shared/ui/Button';
import { ErrorCallout } from '../shared/ui/ErrorCallout';
import { Skeleton } from '../shared/ui/Skeleton';
import { useInterviewStore } from '../stores/interviewStore';
import { routeForAppStatus, useSessionStore } from '../stores/sessionStore';
import { useUiStore } from '../stores/uiStore';
import { EarlyCompleteModal } from '../features/interview/EarlyCompleteModal';
import { MindMapCanvas, focusActiveTextarea } from '../features/interview/MindMapCanvas';
import { QuestionListFallback } from '../features/interview/QuestionListFallback';
import { completionMessage } from '../features/interview/status';
import styles from './InterviewPage.module.css';

function isMobileDefault(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
}

function formatTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60).toString().padStart(2, '0');
  const rest = Math.floor(safe % 60).toString().padStart(2, '0');
  return `${minutes}:${rest}`;
}

function pendingIdsFromDetails(details?: Record<string, unknown>): string[] {
  const value = details?.pendingQuestionIds;
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export function InterviewPage() {
  return (
    <ReactFlowProvider>
      <InterviewPageInner />
    </ReactFlowProvider>
  );
}

function InterviewPageInner() {
  const navigate = useNavigate();
  const reactFlow = useReactFlow();
  const sessionId = useSessionStore((s) => s.sessionId);
  const serverStatus = useSessionStore((s) => s.serverStatus);
  const appStatus = useSessionStore((s) => s.appStatus);
  const activeJobId = useSessionStore((s) => s.activeJobId);
  const settings = useSessionStore((s) => s.settings);
  const interviewStartedAt = useSessionStore((s) => s.interviewStartedAt);
  const sampleMode = useSessionStore((s) => s.sampleMode);
  const setAppStatus = useSessionStore((s) => s.setAppStatus);
  const setFromServer = useSessionStore((s) => s.setFromServer);
  const clearSession = useSessionStore((s) => s.clearSession);

  const nodes = useInterviewStore((s) => s.nodes);
  const activeQuestionId = useInterviewStore((s) => s.activeQuestionId);
  const pendingSkeletonParentId = useInterviewStore((s) => s.pendingSkeletonParentId);
  const remainingQuestions = useInterviewStore((s) => s.remainingQuestions);
  const answersByQuestionId = useInterviewStore((s) => s.answersByQuestionId);
  const submitting = useInterviewStore((s) => s.submitting);
  const setTree = useInterviewStore((s) => s.setTree);
  const mergeNodes = useInterviewStore((s) => s.mergeNodes);
  const markAnswered = useInterviewStore((s) => s.markAnswered);
  const recordAnswer = useInterviewStore((s) => s.recordAnswer);
  const setPendingSkeleton = useInterviewStore((s) => s.setPendingSkeleton);
  const setRemainingQuestions = useInterviewStore((s) => s.setRemainingQuestions);
  const setCompletedReason = useInterviewStore((s) => s.setCompletedReason);
  const nextSubmitSeq = useInterviewStore((s) => s.nextSubmitSeq);
  const setSubmitting = useInterviewStore((s) => s.setSubmitting);
  const setHasUnsavedInput = useUiStore((s) => s.setHasUnsavedInput);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiErrorViewModel | undefined>();
  const [draftByQuestionId, setDraftByQuestionId] = useState<Record<string, string>>({});
  const [listView, setListView] = useState(isMobileDefault);
  const [skeletonOverdue, setSkeletonOverdue] = useState(false);
  const [pendingRequiredIds, setPendingRequiredIds] = useState<string[]>([]);
  const [earlyModalOpen, setEarlyModalOpen] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const activeNode = useMemo(() => nodes.find((node) => node.questionId === activeQuestionId), [activeQuestionId, nodes]);

  const handleFatalError = useCallback((caught: unknown) => {
    if (isAbortError(caught)) return;
    const vm = asErrorViewModel(caught);
    if (isSessionGoneError(vm)) {
      clearSession('expired');
      navigate('/expired', { replace: true });
      return;
    }
    setError(vm);
  }, [clearSession, navigate]);

  const loadTree = useCallback(async (signal?: AbortSignal) => {
    if (!sessionId) return;
    setLoading(true);
    setError(undefined);
    try {
      let tree = await getInterviewTree(sessionId, signal);
      if (tree.length === 0) tree = await startInterview(sessionId, signal);
      setTree(tree);
      setAppStatus('INTERVIEWING');
    } catch (caught) {
      handleFatalError(caught);
    } finally {
      setLoading(false);
    }
  }, [handleFatalError, sessionId, setAppStatus, setTree]);

  useEffect(() => {
    if (!sessionId) {
      navigate('/', { replace: true });
      return;
    }
    if (serverStatus !== undefined && serverStatus !== 'INTERVIEWING') {
      navigate(routeForAppStatus(appStatus, activeJobId), { replace: true });
      return;
    }
    if (nodes.length > 0) return;
    const controller = new AbortController();
    void loadTree(controller.signal);
    return () => controller.abort();
  }, [activeJobId, appStatus, loadTree, navigate, nodes.length, serverStatus, sessionId]);

  useEffect(() => () => setHasUnsavedInput(false), [setHasUnsavedInput]);

  useEffect(() => {
    if (!pendingSkeletonParentId) {
      setSkeletonOverdue(false);
      return;
    }
    setSkeletonOverdue(false);
    const timer = window.setTimeout(() => setSkeletonOverdue(true), 30_000);
    return () => window.clearTimeout(timer);
  }, [pendingSkeletonParentId]);

  useEffect(() => {
    if (!settings.timeLimitSec || !interviewStartedAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [interviewStartedAt, settings.timeLimitSec]);

  const onDraftChange = useCallback((questionId: string, value: string) => {
    setDraftByQuestionId((current) => ({ ...current, [questionId]: value }));
  }, []);

  const finishToArtifacts = useCallback(async (message?: string) => {
    setHasUnsavedInput(false);
    if (message) announce(message);
    setAppStatus('SUBMITTING');
    // 서버 truth 동기화 후 이동 (제출 화면 가드가 INTERVIEW_DONE을 요구)
    if (sessionId) {
      try {
        const session = await getSession(sessionId);
        setFromServer(session);
      } catch {
        // 동기화 실패 시에도 이동은 진행 — 제출 화면에서 재조회로 복구된다.
      }
    }
    navigate('/artifacts');
  }, [navigate, sessionId, setAppStatus, setFromServer, setHasUnsavedInput]);

  const forceComplete = useCallback(async () => {
    if (!sessionId) return;
    setCompleting(true);
    setError(undefined);
    try {
      const result = await completeInterview(sessionId, true);
      setCompletedReason(result.completedReason);
      finishToArtifacts(completionMessage(result.completedReason));
    } catch (caught) {
      handleFatalError(caught);
    } finally {
      setCompleting(false);
      setEarlyModalOpen(false);
    }
  }, [finishToArtifacts, handleFatalError, sessionId, setCompletedReason]);

  const requestEarlyComplete = useCallback(async (confirm = false) => {
    if (!sessionId) return;
    setCompleting(true);
    setError(undefined);
    try {
      const result = await completeInterview(sessionId, confirm);
      setCompletedReason(result.completedReason);
      finishToArtifacts(completionMessage(result.completedReason));
    } catch (caught) {
      if (isAbortError(caught)) return;
      const vm = asErrorViewModel(caught);
      if (vm.code === 'REQUIRED_QUESTIONS_PENDING') {
        setPendingRequiredIds(pendingIdsFromDetails(vm.details));
        setEarlyModalOpen(true);
      } else if (isSessionGoneError(vm)) {
        clearSession('expired');
        navigate('/expired', { replace: true });
      } else {
        setError(vm);
        announce(vm.message, 'assertive');
      }
    } finally {
      setCompleting(false);
    }
  }, [clearSession, finishToArtifacts, navigate, sessionId, setCompletedReason]);

  const handleSubmit = useCallback(async (question: QuestionNode, value: string, requestFlag: boolean): Promise<boolean> => {
    if (!sessionId) return false;
    const originalNodes = useInterviewStore.getState().nodes;
    const originalQuestion = originalNodes.find((node) => node.questionId === question.questionId) ?? question;
    const seq = nextSubmitSeq();
    setSubmitting(true);
    setError(undefined);
    markAnswered(question.questionId);
    recordAnswer(question.questionId, value);
    setPendingSkeleton(question.questionId);
    try {
      const result = await submitAnswer(sessionId, { questionId: question.questionId, value, requestFlag });
      if (seq !== useInterviewStore.getState().submitSeq) return false;
      mergeNodes(result.nextQuestions);
      setRemainingQuestions(result.remainingQuestions);
      setDraftByQuestionId((current) => {
        const next = { ...current };
        delete next[question.questionId];
        return next;
      });
      if (result.nextQuestions.length > 0) announce('새 질문이 도착했어요.');
      if (result.interviewStatus === 'COMPLETED') {
        setCompletedReason(result.completedReason);
        finishToArtifacts(completionMessage(result.completedReason));
      }
      return true;
    } catch (caught) {
      if (!isAbortError(caught)) {
        setTree(originalNodes.map((node) => node.questionId === question.questionId ? { ...originalQuestion, status: 'ACTIVE' } : node));
        setPendingSkeleton(undefined);
        const vm = asErrorViewModel(caught);
        setError(vm);
        announce('답변 제출에 실패했어요. 입력은 보존됐습니다.', 'assertive');
      }
      return false;
    } finally {
      setSubmitting(false);
    }
  }, [finishToArtifacts, markAnswered, mergeNodes, nextSubmitSeq, recordAnswer, sessionId, setCompletedReason, setPendingSkeleton, setRemainingQuestions, setSubmitting, setTree]);

  const onRetrySubmit = () => {
    if (!activeNode) return;
    void handleSubmit(activeNode, draftByQuestionId[activeNode.questionId] ?? '', false);
  };

  const errorAction =
    activeNode && (draftByQuestionId[activeNode.questionId] ?? '').trim().length > 0
      ? { label: '다시 제출', onClick: onRetrySubmit, disabled: submitting }
      : { label: '다시 불러오기', onClick: () => void loadTree(), disabled: loading };

  const goActive = () => {
    if (!activeQuestionId) return;
    reactFlow.fitView({ nodes: [{ id: activeQuestionId }], duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 400, maxZoom: 1 });
    focusActiveTextarea(activeQuestionId);
  };

  const remainingSeconds = useMemo(() => {
    if (!settings.timeLimitSec || !interviewStartedAt) return undefined;
    const started = Date.parse(interviewStartedAt);
    if (!Number.isFinite(started)) return undefined;
    return Math.max(0, settings.timeLimitSec - Math.floor((now - started) / 1000));
  }, [interviewStartedAt, now, settings.timeLimitSec]);

  if (loading && nodes.length === 0) {
    return <section className={styles.page} aria-busy="true"><div className={styles.center}><Skeleton width="280px" height="28px" label="인터뷰 질문을 불러오는 중" /></div></section>;
  }

  return (
    <section className={styles.page}>
      <div className={styles.toolbar}>
        <div className={styles.titleGroup}>
          <h1 className={styles.title}>딥 인터뷰 마인드맵</h1>
          <p className={styles.subtitle}>한 번에 하나씩 답하며 의도를 구체화해요.</p>
        </div>
        <Button variant="secondary" onClick={goActive} disabled={!activeQuestionId}>현재 질문으로 이동</Button>
        <Button variant="ghost" onClick={() => setListView((value) => !value)}>{listView ? '마인드맵 뷰' : '리스트 뷰'}</Button>
        {remainingQuestions !== undefined && remainingQuestions !== null && <span className={styles.hint}>예상 남은 질문 {remainingQuestions}개</span>}
        {remainingSeconds !== undefined && <span className={styles.timer}>남은 시간 {formatTime(remainingSeconds)}</span>}
        <Button variant="secondary" onClick={() => void requestEarlyComplete(false)} disabled={completing}>{completing ? '처리 중…' : '그만 답하고 넘어가기'}</Button>
      </div>
      {error && (
        <div className={styles.errorWrap}>
          <ErrorCallout
            error={error}
            actions={[errorAction]}
          />
        </div>
      )}
      <div className={styles.content}>
        {listView ? (
          <QuestionListFallback
            nodes={nodes}
            answersByQuestionId={answersByQuestionId}
            submitting={submitting}
            draftByQuestionId={draftByQuestionId}
            sampleMode={sampleMode}
            onDraftChange={onDraftChange}
            onSubmit={handleSubmit}
            onSampleNoAnswer={forceComplete}
          />
        ) : (
          <MindMapCanvas
            nodes={nodes}
            activeQuestionId={activeQuestionId}
            pendingSkeletonParentId={pendingSkeletonParentId}
            skeletonOverdue={skeletonOverdue}
            answersByQuestionId={answersByQuestionId}
            submitting={submitting}
            draftByQuestionId={draftByQuestionId}
            sampleMode={sampleMode}
            onDraftChange={onDraftChange}
            onSubmit={handleSubmit}
            onSampleNoAnswer={forceComplete}
          />
        )}
      </div>
      <EarlyCompleteModal
        open={earlyModalOpen}
        pendingQuestionIds={pendingRequiredIds}
        nodes={nodes}
        confirming={completing}
        onConfirm={() => void forceComplete()}
        onCancel={() => setEarlyModalOpen(false)}
      />
    </section>
  );
}
