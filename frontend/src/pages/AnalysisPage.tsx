import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { announce } from '../shared/a11y/liveRegion';
import { cancelJob, getSession, retryJob } from '../shared/api/endpoints';
import { asErrorViewModel, isAbortError, isSessionGoneError, toErrorViewModel, type ApiErrorViewModel } from '../shared/api/errors';
import { createJobPoller, type JobPoller } from '../shared/api/polling';
import type { AnalysisJob, JobStage } from '../shared/api/types';
import { Button } from '../shared/ui/Button';
import { ConfirmModal } from '../shared/ui/ConfirmModal';
import { ErrorCallout } from '../shared/ui/ErrorCallout';
import { Skeleton } from '../shared/ui/Skeleton';
import { routeForAppStatus, useSessionStore } from '../stores/sessionStore';
import styles from './AnalysisPage.module.css';

interface StageGroup {
  label: string;
  stages: JobStage[];
}

type GroupState = 'done' | 'current' | 'waiting';

const ANALYSIS_GROUPS: StageGroup[] = [
  { label: '의도·결과물 정리', stages: ['INGEST', 'NORMALIZE', 'EVALUATE'] },
  { label: '차이 분석', stages: ['DRIFT'] },
  { label: '보고서 생성', stages: ['AGGREGATE', 'REPORT'] },
];

const PLAN_GROUPS: StageGroup[] = [
  { label: '기획안 의도 추출', stages: ['INGEST', 'NORMALIZE', 'EVALUATE'] },
];

function currentGroupIndex(job: AnalysisJob | undefined, groups: StageGroup[]): number {
  if (!job?.stage) return -1;
  return groups.findIndex((group) => group.stages.includes(job.stage as JobStage));
}

function getGroupState(job: AnalysisJob | undefined, group: StageGroup, index: number, groups: StageGroup[]): GroupState {
  if (!job) return 'waiting';
  const activeIndex = currentGroupIndex(job, groups);
  const allDone = group.stages.every((stage) => job.completedStages.includes(stage));
  if (job.status === 'SUCCEEDED' || allDone || activeIndex > index) return 'done';
  if ((job.status === 'RUNNING' || job.status === 'QUEUED') && activeIndex === index) return 'current';
  return 'waiting';
}

function labelForState(state: GroupState): string {
  if (state === 'done') return '완료';
  if (state === 'current') return '진행 중';
  return '대기';
}

function reassuranceFor(label: string): string {
  if (label === '차이 분석') return '차이를 분석하고 있어요.';
  if (label === '보고서 생성') return '보고서를 만들고 있어요.';
  if (label === '기획안 의도 추출') return '결과물을 정리하고 있어요.';
  return '결과물을 정리하고 있어요.';
}

function formatProgress(progress: number): string {
  const normalized = progress > 0 && progress <= 1 ? progress * 100 : progress;
  return `${Math.max(0, Math.min(100, Math.round(normalized)))}%`;
}

export function AnalysisPage() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const sessionId = useSessionStore((s) => s.sessionId);
  const setFromServer = useSessionStore((s) => s.setFromServer);
  const setActiveJobId = useSessionStore((s) => s.setActiveJobId);
  const clearSession = useSessionStore((s) => s.clearSession);

  const [job, setJob] = useState<AnalysisJob>();
  const [pollError, setPollError] = useState<ApiErrorViewModel>();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [pollerKey, setPollerKey] = useState(0);
  const pollerRef = useRef<JobPoller>();
  const announcedGroupRef = useRef<string>();

  const groups = useMemo(() => (job?.kind === 'PLAN_EXTRACTION' ? PLAN_GROUPS : ANALYSIS_GROUPS), [job?.kind]);
  const activeGroupIndex = currentGroupIndex(job, groups);
  const activeGroup = activeGroupIndex >= 0 ? groups[activeGroupIndex] : groups[0];
  const currentMessage = reassuranceFor(activeGroup.label);

  const routeFromSession = useCallback((session: Awaited<ReturnType<typeof getSession>>) => {
    setFromServer(session);
    navigate(routeForAppStatus(useSessionStore.getState().appStatus, session.activeJobId), { replace: true });
  }, [navigate, setFromServer]);

  useEffect(() => {
    if (!jobId) {
      navigate('/artifacts', { replace: true });
      return;
    }
    if (!sessionId) {
      navigate('/', { replace: true });
      return;
    }

    const poller = createJobPoller(sessionId, jobId, {
      onUpdate(nextJob) {
        setPollError(undefined);
        setJob(nextJob);
        const nextGroups = nextJob.kind === 'PLAN_EXTRACTION' ? PLAN_GROUPS : ANALYSIS_GROUPS;
        const index = currentGroupIndex(nextJob, nextGroups);
        const label = index >= 0 ? nextGroups[index].label : undefined;
        if (label && label !== announcedGroupRef.current && (nextJob.status === 'RUNNING' || nextJob.status === 'QUEUED')) {
          announcedGroupRef.current = label;
          announce(`${label} 단계가 시작됐어요.`, 'polite');
        }
      },
      onTerminal(nextJob) {
        if (nextJob.status === 'SUCCEEDED') {
          announce('보고서 생성이 완료됐어요.');
          void (async () => {
            try {
              const session = await getSession(sessionId);
              setFromServer(session);
              navigate(nextJob.kind === 'ANALYSIS' ? '/report' : '/artifacts', { replace: true });
            } catch (error) {
              if (isAbortError(error)) return;
              const vm = asErrorViewModel(error);
              if (isSessionGoneError(vm)) {
                clearSession('expired');
                navigate('/expired', { replace: true });
              } else {
                setPollError(vm);
              }
            }
          })();
        } else if (nextJob.status === 'CANCELLED') {
          setActiveJobId(undefined);
          announce('분석을 취소했어요.');
          navigate('/artifacts', { replace: true });
        }
      },
      onError(vm) {
        if (isSessionGoneError(vm)) {
          clearSession('expired');
          navigate('/expired', { replace: true });
          return;
        }
        setPollError(vm);
      },
    });
    pollerRef.current = poller;
    poller.start();
    return () => {
      poller.stop();
      if (pollerRef.current === poller) pollerRef.current = undefined;
    };
  }, [clearSession, jobId, navigate, pollerKey, sessionId, setActiveJobId, setFromServer]);

  useEffect(() => {
    if (job?.status !== 'RUNNING') return;
    const id = window.setInterval(() => announce(currentMessage, 'polite'), 30_000);
    return () => window.clearInterval(id);
  }, [currentMessage, job?.status]);

  const refreshSessionAndRoute = useCallback(async () => {
    if (!sessionId) return;
    try {
      const session = await getSession(sessionId);
      routeFromSession(session);
    } catch (error) {
      if (isAbortError(error)) return;
      const vm = asErrorViewModel(error);
      if (isSessionGoneError(vm)) {
        clearSession('expired');
        navigate('/expired', { replace: true });
      } else {
        setPollError(vm);
      }
    }
  }, [clearSession, navigate, routeFromSession, sessionId]);

  const onCancel = async () => {
    if (!sessionId || !jobId) return;
    setCancelling(true);
    pollerRef.current?.stop();
    try {
      await cancelJob(sessionId, jobId);
      setActiveJobId(undefined);
      announce('분석을 취소했어요.');
      navigate('/artifacts', { replace: true });
    } catch (error) {
      if (isAbortError(error)) return;
      const vm = asErrorViewModel(error);
      if (isSessionGoneError(vm)) {
        clearSession('expired');
        navigate('/expired', { replace: true });
      } else if (vm.code === 'JOB_NOT_CANCELLABLE') {
        await refreshSessionAndRoute();
      } else {
        setPollError(vm);
        setPollerKey((key) => key + 1);
      }
    } finally {
      setCancelling(false);
      setCancelOpen(false);
    }
  };

  const onRetryJob = async () => {
    if (!sessionId || !jobId) return;
    setRetrying(true);
    setPollError(undefined);
    try {
      const nextJob = await retryJob(sessionId, jobId);
      setJob(nextJob);
      setActiveJobId(nextJob.jobId);
      if (nextJob.jobId !== jobId) {
        navigate(`/analysis/${nextJob.jobId}`, { replace: true });
      } else {
        setPollerKey((key) => key + 1);
      }
    } catch (error) {
      if (isAbortError(error)) return;
      const vm = asErrorViewModel(error);
      if (isSessionGoneError(vm)) {
        clearSession('expired');
        navigate('/expired', { replace: true });
      } else if (vm.code === 'JOB_NOT_RETRYABLE') {
        await refreshSessionAndRoute();
      } else {
        setPollError(vm);
      }
    } finally {
      setRetrying(false);
    }
  };

  const failureError = job?.status === 'FAILED' && job.error ? toErrorViewModel(job.error) : undefined;
  const failedGroup = job?.status === 'FAILED' && activeGroup ? activeGroup.label : undefined;

  return (
    <section className={styles.page} aria-labelledby="analysis-title">
      <div className={styles.card}>
        <p className={styles.eyebrow}>분석 대기</p>
        <h1 id="analysis-title" className={styles.title}>{job?.kind === 'PLAN_EXTRACTION' ? '기획안 의도를 추출하고 있어요' : '결과물을 분석하고 있어요'}</h1>
        <p className={styles.description}>AI가 의도 기준선과 결과물을 비교하고 있어요. 이 화면을 벗어나도 분석은 계속돼요.</p>

        {!job && !pollError ? (
          <div className={styles.skeletonStack}>
            <Skeleton height="28px" label="분석 상태를 불러오는 중" />
            <Skeleton height="120px" />
          </div>
        ) : (
          <>
            {job && <Stepper job={job} groups={groups} />}
            {job && (
              <div className={styles.progressArea} role="status">
                {typeof job.progress === 'number' ? (
                  <strong className={styles.progress}>{formatProgress(job.progress)}</strong>
                ) : (
                  <span className={styles.indeterminate} aria-hidden="true" />
                )}
                <p>{currentMessage}</p>
              </div>
            )}
          </>
        )}

        {pollError && (
          <ErrorCallout
            error={pollError}
            title="분석 상태를 확인하지 못했어요"
            actions={[
              { label: '다시 시도', onClick: () => { setPollError(undefined); setPollerKey((key) => key + 1); } },
              { label: '새 세션 시작', onClick: () => { clearSession('new-session'); navigate('/'); } },
            ]}
          />
        )}

        {failureError && (
          <div className={styles.failureBox}>
            <p className={styles.failedStage}>{failedGroup ? `${failedGroup} 단계에서 실패했어요.` : '분석에 실패했어요.'}</p>
            <p className={styles.preserveNote}>완료된 단계는 보존돼요.</p>
            <ErrorCallout
              error={failureError}
              title="분석에 실패했어요"
              actions={[
                { label: '실패 단계부터 재시도', onClick: () => void onRetryJob(), disabled: retrying },
                { label: '결과물 제출로 돌아가기', onClick: () => navigate('/artifacts') },
                { label: '새 세션 시작', onClick: () => { clearSession('new-session'); navigate('/'); } },
              ]}
            />
          </div>
        )}

        <div className={styles.actions}>
          <Button variant="danger" onClick={() => setCancelOpen(true)} disabled={!job || job.status === 'FAILED' || job.status === 'SUCCEEDED' || job.status === 'CANCELLED'} loading={cancelling}>분석 취소</Button>
        </div>
      </div>

      <ConfirmModal
        open={cancelOpen}
        title="분석을 취소할까요?"
        confirmLabel={cancelling ? '취소 중…' : '분석 취소'}
        cancelLabel="계속 분석"
        danger
        confirmDisabled={cancelling}
        onConfirm={() => void onCancel()}
        onCancel={() => setCancelOpen(false)}
      >
        <p>지금까지 완료된 단계는 보존되며, 다시 시작할 수 있어요.</p>
      </ConfirmModal>
    </section>
  );
}

function Stepper({ job, groups }: { job: AnalysisJob; groups: StageGroup[] }) {
  return (
    <ol className={styles.stepper} aria-label="분석 단계">
      {groups.map((group, index) => {
        const state = getGroupState(job, group, index, groups);
        return (
          <li key={group.label} className={`${styles.step} ${styles[state]}`} aria-current={state === 'current' ? 'step' : undefined}>
            <span className={styles.circle}>{state === 'done' ? '✓' : index + 1}</span>
            <span className={styles.stepText}>
              <strong>{group.label}</strong>
              <span>{labelForState(state)}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
