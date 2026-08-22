import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createSession, getSession, startInterview, updateSettings, uploadPlan } from '../shared/api/endpoints';
import {
  asErrorViewModel,
  isAbortError,
  isSessionGoneError,
  type ApiErrorViewModel,
} from '../shared/api/errors';
import { createJobPoller, type JobPoller } from '../shared/api/polling';
import type { AnalysisJob, SessionSettings } from '../shared/api/types';
import { announce } from '../shared/a11y/liveRegion';
import { AIGeneratedBadge } from '../shared/ui/AIGeneratedBadge';
import { Button } from '../shared/ui/Button';
import { ErrorCallout } from '../shared/ui/ErrorCallout';
import { Skeleton } from '../shared/ui/Skeleton';
import {
  CONFUSE_THRESHOLD_STEP,
  TIME_LIMIT_SEC_MAX,
  TIME_LIMIT_SEC_MIN,
  clampConfuseThreshold,
  validatePlanFile,
  validateTimeLimitSec,
} from '../shared/utils/validation';
import { createSessionWithSampleFallback } from '../features/sample/sampleFlow';
import { routeForAppStatus, useSessionStore } from '../stores/sessionStore';
import { useUiStore } from '../stores/uiStore';
import styles from './HomePage.module.css';

type UploadPhase = 'idle' | 'uploading' | 'extracting' | 'failed';

function buildJobError(job: AnalysisJob): ApiErrorViewModel {
  return {
    code: job.error?.code ?? 'INTERNAL',
    message: job.error?.message ?? '기획안 추출 중 문제가 발생했어요. 다시 업로드해 주세요.',
    retryable: job.error?.retryable ?? true,
    autoRetryable: false,
    traceId: job.error?.traceId,
    details: job.error?.details,
  };
}

function formatProgress(progress: number | null | undefined): string {
  if (typeof progress !== 'number') return '';
  const normalized = progress > 1 ? progress : progress * 100;
  return ` ${Math.round(normalized)}%`;
}

export function HomePage() {
  const navigate = useNavigate();
  const fileInputId = useId();
  const sessionId = useSessionStore((s) => s.sessionId);
  const sessionToken = useSessionStore((s) => s.sessionToken);
  const serverStatus = useSessionStore((s) => s.serverStatus);
  const appStatus = useSessionStore((s) => s.appStatus);
  const activeJobId = useSessionStore((s) => s.activeJobId);
  const settings = useSessionStore((s) => s.settings);
  const setCreated = useSessionStore((s) => s.setCreated);
  const setFromServer = useSessionStore((s) => s.setFromServer);
  const setSettings = useSessionStore((s) => s.setSettings);
  const setSampleMode = useSessionStore((s) => s.setSampleMode);
  const setActiveJobId = useSessionStore((s) => s.setActiveJobId);
  const clearSession = useSessionStore((s) => s.clearSession);
  const setHasUnsavedInput = useUiStore((s) => s.setHasUnsavedInput);

  const [localSettings, setLocalSettings] = useState<SessionSettings>(settings);
  const [createError, setCreateError] = useState<ApiErrorViewModel>();
  const [settingsError, setSettingsError] = useState<ApiErrorViewModel>();
  const [uploadError, setUploadError] = useState<ApiErrorViewModel>();
  const [interviewError, setInterviewError] = useState<ApiErrorViewModel>();
  const [fileValidationMessage, setFileValidationMessage] = useState<string>();
  const [selectedFile, setSelectedFile] = useState<File>();
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>('idle');
  const [planJob, setPlanJob] = useState<AnalysisJob>();
  const [startingInterview, setStartingInterview] = useState(false);
  const [startingSample, setStartingSample] = useState(false);
  const [creatingSession, setCreatingSession] = useState(false);
  const [retryRemaining, setRetryRemaining] = useState(0);

  const createStartedRef = useRef(false);
  const createAbortRef = useRef<AbortController>();
  const uploadAbortRef = useRef<AbortController>();
  const interviewAbortRef = useRef<AbortController>();
  const pollerRef = useRef<JobPoller>();

  const handleApiError = useCallback(
    (error: unknown, setter: (vm: ApiErrorViewModel) => void) => {
      if (isAbortError(error)) return;
      const vm = asErrorViewModel(error);
      if (isSessionGoneError(vm)) {
        clearSession('expired');
        navigate('/expired');
        return;
      }
      setter(vm);
    },
    [clearSession, navigate],
  );

  const createInitialSession = useCallback(async () => {
    createAbortRef.current?.abort();
    const controller = new AbortController();
    createAbortRef.current = controller;
    setCreatingSession(true);
    setCreateError(undefined);
    setRetryRemaining(0);
    try {
      const created = await createSession(localSettings, controller.signal);
      setCreated(created, created.sessionToken);
    } catch (error) {
      if (isAbortError(error)) return;
      const vm = asErrorViewModel(error);
      setCreateError(vm);
      if (vm.code === 'RATE_LIMITED' && vm.retryAfterSec !== undefined) {
        setRetryRemaining(Math.max(0, vm.retryAfterSec));
        announce('요청이 많아요. 잠시 후 다시 시도할 수 있어요.', 'polite');
      }
    } finally {
      setCreatingSession(false);
    }
  }, [localSettings, setCreated]);

  useEffect(() => {
    if (!sessionToken && !createStartedRef.current) {
      createStartedRef.current = true;
      void createInitialSession();
    }
  }, [createInitialSession, sessionToken]);

  useEffect(() => {
    if (retryRemaining <= 0) return;
    const timer = window.setInterval(() => {
      setRetryRemaining((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [retryRemaining]);

  useEffect(() => {
    setLocalSettings(settings);
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    const validation = validateTimeLimitSec(localSettings.timeLimitSec ?? null);
    if (!validation.valid) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const saveSettings = async () => {
        setSettingsError(undefined);
        try {
          const saved = await updateSettings(sessionId, localSettings, controller.signal);
          setSettings(saved);
        } catch (error) {
          handleApiError(error, setSettingsError);
        }
      };
      void saveSettings();
    }, 500);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [handleApiError, localSettings, sessionId, setSettings]);

  useEffect(
    () => () => {
      createAbortRef.current?.abort();
      uploadAbortRef.current?.abort();
      interviewAbortRef.current?.abort();
      pollerRef.current?.stop();
      setHasUnsavedInput(false);
    },
    [setHasUnsavedInput],
  );

  const startPlanPolling = useCallback(
    (currentSessionId: string, jobId: string) => {
      pollerRef.current?.stop();
      const poller = createJobPoller(currentSessionId, jobId, {
        onUpdate(job) {
          setPlanJob(job);
        },
        onTerminal(job) {
          setPlanJob(job);
          if (job.status === 'SUCCEEDED') {
            const refreshSession = async () => {
              try {
                const session = await getSession(currentSessionId);
                setFromServer(session);
                setHasUnsavedInput(false);
                announce('기획안 추출이 끝났어요.', 'polite');
                navigate('/artifacts');
              } catch (error) {
                handleApiError(error, setUploadError);
              }
            };
            void refreshSession();
            return;
          }
          if (job.status === 'FAILED') {
            setUploadPhase('failed');
            setUploadError(buildJobError(job));
          }
        },
        onError(error) {
          if (isSessionGoneError(error)) {
            clearSession('expired');
            navigate('/expired');
            return;
          }
          setUploadPhase('failed');
          setUploadError(error);
        },
      });
      pollerRef.current = poller;
      poller.start();
    },
    [clearSession, handleApiError, navigate, setFromServer, setHasUnsavedInput],
  );

  const uploadPlanFile = useCallback(
    async (file: File) => {
      if (!sessionId) {
        setUploadError({
          code: 'NETWORK_ERROR',
          message: '세션 준비가 끝나면 다시 시도해 주세요.',
          retryable: true,
          autoRetryable: false,
        });
        return;
      }
      uploadAbortRef.current?.abort();
      pollerRef.current?.stop();
      const controller = new AbortController();
      uploadAbortRef.current = controller;
      setUploadError(undefined);
      setPlanJob(undefined);
      setUploadPhase('uploading');
      announce('업로드 중', 'polite');
      try {
        const result = await uploadPlan(sessionId, file, controller.signal);
        setActiveJobId(result.jobId);
        setUploadPhase('extracting');
        announce('기획안에서 의도를 추출하는 중…', 'polite');
        startPlanPolling(sessionId, result.jobId);
      } catch (error) {
        setUploadPhase('failed');
        handleApiError(error, setUploadError);
      }
    },
    [handleApiError, sessionId, setActiveJobId, startPlanPolling],
  );

  const handleFile = useCallback(
    (file: File) => {
      const validation = validatePlanFile(file);
      setUploadError(undefined);
      setFileValidationMessage(validation.message);
      if (!validation.valid) {
        setSelectedFile(undefined);
        setHasUnsavedInput(false);
        return;
      }
      setSelectedFile(file);
      setHasUnsavedInput(true);
      void uploadPlanFile(file);
    },
    [setHasUnsavedInput, uploadPlanFile],
  );

  const handleStartInterview = useCallback(async () => {
    if (!sessionId) {
      setInterviewError({
        code: 'NETWORK_ERROR',
        message: '세션 준비가 끝나면 다시 시도해 주세요.',
        retryable: true,
        autoRetryable: false,
      });
      return;
    }
    interviewAbortRef.current?.abort();
    const controller = new AbortController();
    interviewAbortRef.current = controller;
    setStartingInterview(true);
    setInterviewError(undefined);
    try {
      await startInterview(sessionId, controller.signal);
      const session = await getSession(sessionId, controller.signal);
      setFromServer(session);
      navigate('/interview');
    } catch (error) {
      handleApiError(error, setInterviewError);
    } finally {
      setStartingInterview(false);
    }
  }, [handleApiError, navigate, sessionId, setFromServer]);

  const handleStartSample = useCallback(async () => {
    setStartingSample(true);
    setInterviewError(undefined);
    try {
      let targetSessionId = sessionId;
      if (!targetSessionId || createError) {
        const { session } = await createSessionWithSampleFallback();
        setCreated(session, session.sessionToken);
        targetSessionId = session.sessionId;
      }
      try {
        await startInterview(targetSessionId);
      } catch (error) {
        if (isAbortError(error)) return;
        const { session } = await createSessionWithSampleFallback();
        setCreated(session, session.sessionToken);
        targetSessionId = session.sessionId;
        await startInterview(targetSessionId);
      }
      setSampleMode(true);
      const session = await getSession(targetSessionId);
      setFromServer(session);
      announce('샘플 체험을 시작해요.', 'polite');
      navigate('/interview');
    } catch (error) {
      handleApiError(error, setInterviewError);
    } finally {
      setStartingSample(false);
    }
  }, [createError, handleApiError, navigate, sessionId, setCreated, setFromServer, setSampleMode]);

  const resumeAvailable = Boolean(sessionToken && serverStatus && serverStatus !== 'CREATED');
  const ctaDisabled = !sessionId || creatingSession || uploadPhase === 'uploading' || uploadPhase === 'extracting';
  const settingsValidation = validateTimeLimitSec(localSettings.timeLimitSec ?? null);

  return (
    <section className={styles.page} aria-labelledby="home-title">
      <div className={styles.hero}>
        <p className={styles.eyebrow}>AI 기반 기획-결과물 정합성 점검</p>
        <h1 id="home-title" className={styles.title}>
          mat-copilot
        </h1>
        <p className={styles.valueProp}>
          의도했던 것과 만들어진 것 사이의 어긋남을 근거와 함께 확인하세요
        </p>
        <p className={styles.aiNotice}>질문·분석·보고서는 AI가 생성하며 검토용으로 제공돼요</p>
      </div>

      <div className={styles.content}>
        {resumeAvailable && (
          <aside className={styles.resumeBanner} aria-label="이어하기">
            <div>
              <h2 className={styles.resumeTitle}>진행 중인 세션이 있어요</h2>
              <p className={styles.resumeText}>이전 진행 상태로 돌아가거나 새 세션을 시작할 수 있어요.</p>
            </div>
            <div className={styles.resumeActions}>
              <Button onClick={() => navigate(routeForAppStatus(appStatus, activeJobId))}>이어하기</Button>
              <Button
                variant="secondary"
                onClick={() => {
                  clearSession('new-session');
                  createStartedRef.current = false;
                  void createInitialSession();
                }}
              >
                새로 시작
              </Button>
            </div>
          </aside>
        )}

        {creatingSession && !sessionId && (
          <div className={styles.loadingSession} role="status" aria-live="polite">
            <Skeleton width="160px" height="20px" label="세션을 준비하는 중" />
            <span>시작 준비 중…</span>
          </div>
        )}

        {createError && !sessionId && (
          <div className={styles.errorStack}>
            <ErrorCallout
              error={createError}
              title="세션을 만들지 못했어요"
              actions={[
                {
                  label: retryRemaining > 0 ? `재시도 (${retryRemaining})` : '재시도',
                  onClick: () => {
                    createStartedRef.current = true;
                    void createInitialSession();
                  },
                  disabled: retryRemaining > 0,
                },
              ]}
            />
            {retryRemaining > 0 && (
              <p className={styles.countdown} aria-live="polite">
                {retryRemaining}초 후 다시 시도할 수 있어요
              </p>
            )}
            <p className={styles.sampleHint}>샘플 체험은 계속 이용할 수 있어요.</p>
          </div>
        )}

        <div className={styles.ctaGrid}>
          <section className={styles.card} aria-labelledby="upload-title">
            <h2 id="upload-title" className={styles.cardTitle}>
              기획안 업로드
            </h2>
            <p className={styles.cardText}>docx, txt, md 기획안을 올리면 핵심 의도를 먼저 추출해요.</p>
            <label
              className={styles.dropzone}
              htmlFor={fileInputId}
              onDragOver={(event) => {
                event.preventDefault();
              }}
              onDrop={(event) => {
                event.preventDefault();
                const file = event.dataTransfer.files.item(0);
                if (file) handleFile(file);
              }}
            >
              <span className={styles.dropzoneTitle}>파일을 선택하거나 여기로 끌어오세요</span>
              <span className={styles.dropzoneMeta}>.docx · .txt · .md / 10MB 이하</span>
              <input
                id={fileInputId}
                className={styles.fileInput}
                type="file"
                accept=".docx,.txt,.md"
                disabled={ctaDisabled}
                onChange={(event) => {
                  const file = event.currentTarget.files?.item(0);
                  if (file) handleFile(file);
                  event.currentTarget.value = '';
                }}
              />
            </label>
            {fileValidationMessage && <p className={styles.inlineError}>{fileValidationMessage}</p>}
            {selectedFile && <p className={styles.selectedFile}>선택한 파일: {selectedFile.name}</p>}
            {(uploadPhase === 'uploading' || uploadPhase === 'extracting') && (
              <p className={styles.progress} role="status" aria-live="polite">
                {uploadPhase === 'uploading' ? '업로드 중' : '기획안에서 의도를 추출하는 중…'}
                {formatProgress(planJob?.progress)}
              </p>
            )}
            {uploadPhase === 'extracting' && (
              <p className={styles.resultNote}>
                <AIGeneratedBadge surface="plan" /> 추출 결과는 검토 후 수정할 수 있어요.
              </p>
            )}
            {uploadError && (
              <ErrorCallout
                error={uploadError}
                title="기획안 처리에 실패했어요"
                actions={
                  selectedFile
                    ? [
                        {
                          label: '재시도',
                          onClick: () => void uploadPlanFile(selectedFile),
                        },
                      ]
                    : undefined
                }
              />
            )}
            {selectedFile && uploadPhase !== 'uploading' && uploadPhase !== 'extracting' && (
              <Button
                variant="ghost"
                onClick={() => {
                  setSelectedFile(undefined);
                  setFileValidationMessage(undefined);
                  setUploadError(undefined);
                  setHasUnsavedInput(false);
                }}
              >
                선택 취소
              </Button>
            )}
          </section>

          <section className={styles.card} aria-labelledby="question-title">
            <h2 id="question-title" className={styles.cardTitle}>
              질문으로 시작
            </h2>
            <p className={styles.cardText}>기획안이 없어도 질문에 답하며 의도 기준선을 만들 수 있어요.</p>
            <Button loading={startingInterview} disabled={ctaDisabled} onClick={() => void handleStartInterview()}>
              질문으로 시작
            </Button>
          </section>

          <section className={styles.card} aria-labelledby="sample-title">
            <h2 id="sample-title" className={styles.cardTitle}>
              샘플로 체험
            </h2>
            <p className={styles.cardText}>백엔드가 준비되지 않아도 예시 데이터로 전체 흐름을 확인해요.</p>
            <Button loading={startingSample} onClick={() => void handleStartSample()}>
              샘플로 체험
            </Button>
          </section>
        </div>

        {interviewError && <ErrorCallout error={interviewError} title="인터뷰를 시작하지 못했어요" />}

        <details className={styles.settings}>
          <summary className={styles.settingsSummary}>고급 설정</summary>
          <div className={styles.settingsBody}>
            <label className={styles.field}>
              <span>질문 강도(모호 판정 기준)</span>
              <strong>{localSettings.confuseThreshold.toFixed(2)}</strong>
              <input
                type="range"
                min="0"
                max="1"
                step={CONFUSE_THRESHOLD_STEP}
                value={localSettings.confuseThreshold}
                onChange={(event) => {
                  const confuseThreshold = clampConfuseThreshold(Number(event.currentTarget.value));
                  setLocalSettings((current) => ({ ...current, confuseThreshold }));
                }}
              />
            </label>
            <label className={styles.field}>
              <span>시간 제한</span>
              <select
                value={localSettings.timeLimitSec ?? ''}
                onChange={(event) => {
                  const timeLimitSec =
                    event.currentTarget.value === '' ? null : Number(event.currentTarget.value);
                  setLocalSettings((current) => ({ ...current, timeLimitSec }));
                }}
              >
                <option value="">미설정</option>
                <option value={TIME_LIMIT_SEC_MIN}>60초</option>
                <option value="300">5분</option>
                <option value="600">10분</option>
                <option value="1800">30분</option>
                <option value={TIME_LIMIT_SEC_MAX}>60분</option>
              </select>
            </label>
            {!settingsValidation.valid && <p className={styles.inlineError}>{settingsValidation.message}</p>}
            {settingsError && <ErrorCallout error={settingsError} title="설정을 저장하지 못했어요" />}
          </div>
        </details>
      </div>
    </section>
  );
}
