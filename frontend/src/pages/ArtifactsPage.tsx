import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { announce } from '../shared/a11y/liveRegion';
import { getArtifacts, startAnalysis, submitArtifactFile, submitArtifactLink } from '../shared/api/endpoints';
import { asErrorViewModel, isAbortError, isSessionGoneError, type ApiErrorViewModel } from '../shared/api/errors';
import type { ArtifactIngestStatus, ArtifactType } from '../shared/api/types';
import { Button } from '../shared/ui/Button';
import { ErrorCallout } from '../shared/ui/ErrorCallout';
import { Skeleton } from '../shared/ui/Skeleton';
import {
  ARTIFACT_MAX_COUNT,
  getFileExtension,
  validateArtifactFile,
  validateGithubUrl,
  validateHttpsUrl,
} from '../shared/utils/validation';
import { submitSampleArtifact } from '../features/sample/sampleFlow';
import { routeForAppStatus, useSessionStore } from '../stores/sessionStore';
import { useReportStore } from '../stores/reportStore';
import { useUiStore } from '../stores/uiStore';
import styles from './ArtifactsPage.module.css';

type Tab = 'FILE' | 'LINK' | 'GITHUB';
type UploadStatus = 'queued' | 'uploading' | 'success' | 'failed' | 'invalid';

interface UploadItem {
  id: string;
  file?: File;
  name: string;
  status: UploadStatus;
  message?: string;
}

const TYPE_LABEL: Record<ArtifactType, string> = {
  FILE: '파일',
  LINK: '링크',
  GITHUB: 'GitHub',
};

const TYPE_ICON: Record<ArtifactType, string> = {
  FILE: '📄',
  LINK: '🔗',
  GITHUB: '⌘',
};

const INGEST_COPY: Record<ArtifactIngestStatus, { icon: string; label: string; tone: 'info' | 'good' | 'warn' | 'bad' }> = {
  PENDING: { icon: '⏳', label: '수집 대기', tone: 'info' },
  PARSED: { icon: '✓', label: '분석 준비 완료', tone: 'good' },
  SKIPPED_UNSUPPORTED: { icon: '!', label: '지원하지 않는 형식이라 제외돼요', tone: 'warn' },
  SKIPPED_TOO_LARGE: { icon: '!', label: '용량 초과로 제외돼요', tone: 'warn' },
  BLOCKED_UNSAFE: { icon: '⛔', label: '안전하지 않아 차단됐어요', tone: 'bad' },
};

function makeId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isExcluded(status: ArtifactIngestStatus): boolean {
  return status.startsWith('SKIPPED_') || status === 'BLOCKED_UNSAFE';
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function zipSelected(items: UploadItem[]): boolean {
  return items.some((item) => getFileExtension(item.name) === '.zip');
}

export function ArtifactsPage() {
  const navigate = useNavigate();
  const sessionId = useSessionStore((s) => s.sessionId);
  const serverStatus = useSessionStore((s) => s.serverStatus);
  const appStatus = useSessionStore((s) => s.appStatus);
  const activeJobId = useSessionStore((s) => s.activeJobId);
  const sampleMode = useSessionStore((s) => s.sampleMode);
  const setActiveJobId = useSessionStore((s) => s.setActiveJobId);
  const setAppStatus = useSessionStore((s) => s.setAppStatus);
  const clearSession = useSessionStore((s) => s.clearSession);
  const artifacts = useReportStore((s) => s.artifacts);
  const setArtifacts = useReportStore((s) => s.setArtifacts);
  const addArtifact = useReportStore((s) => s.addArtifact);
  const setHasUnsavedInput = useUiStore((s) => s.setHasUnsavedInput);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<ApiErrorViewModel>();
  const [startError, setStartError] = useState<ApiErrorViewModel>();
  const [tab, setTab] = useState<Tab>('FILE');
  const [dragOver, setDragOver] = useState(false);
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [linkValue, setLinkValue] = useState('');
  const [githubValue, setGithubValue] = useState('');
  const [linkError, setLinkError] = useState<string>();
  const [githubError, setGithubError] = useState<string>();
  const [submittingLink, setSubmittingLink] = useState<Tab>();
  const [starting, setStarting] = useState(false);
  const [sampleStatus, setSampleStatus] = useState<string>();
  const sampleStartedRef = useRef(false);

  const fetchArtifacts = useCallback(async (signal?: AbortSignal) => {
    if (!sessionId) {
      navigate('/', { replace: true });
      return;
    }
    setLoading(true);
    setLoadError(undefined);
    try {
      const list = await getArtifacts(sessionId, signal);
      setArtifacts(list);
    } catch (error) {
      if (isAbortError(error)) return;
      const vm = asErrorViewModel(error);
      if (isSessionGoneError(vm)) {
        clearSession('expired');
        navigate('/expired', { replace: true });
        return;
      }
      setLoadError(vm);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [clearSession, navigate, sessionId, setArtifacts]);

  useEffect(() => {
    if (serverStatus === 'ANALYZING' && activeJobId) {
      navigate(`/analysis/${activeJobId}`, { replace: true });
      return;
    }
    if (serverStatus === 'REPORT_READY') {
      navigate('/report', { replace: true });
      return;
    }
    if (serverStatus === 'CREATED' || serverStatus === 'INTERVIEWING') {
      navigate(routeForAppStatus(appStatus, activeJobId), { replace: true });
    }
  }, [activeJobId, appStatus, navigate, serverStatus]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchArtifacts(controller.signal);
    return () => controller.abort();
  }, [fetchArtifacts]);

  const dirty = linkValue.trim().length > 0 || githubValue.trim().length > 0 || uploadItems.some((i) => i.status === 'queued' || i.status === 'uploading' || i.status === 'failed');
  useEffect(() => {
    setHasUnsavedInput(dirty);
    return () => setHasUnsavedInput(false);
  }, [dirty, setHasUnsavedInput]);

  const submitValidFiles = useCallback(async (items: UploadItem[]) => {
    if (!sessionId) return;
    for (const item of items) {
      if (!item.file) continue;
      setUploadItems((prev) => prev.map((p) => (p.id === item.id ? { ...p, status: 'uploading', message: undefined } : p)));
      try {
        const artifact = await submitArtifactFile(sessionId, item.file);
        addArtifact(artifact);
        setUploadItems((prev) => prev.map((p) => (p.id === item.id ? { ...p, status: 'success', message: '완료' } : p)));
      } catch (error) {
        if (isAbortError(error)) return;
        const vm = asErrorViewModel(error);
        if (isSessionGoneError(vm)) {
          clearSession('expired');
          navigate('/expired', { replace: true });
          return;
        }
        setUploadItems((prev) => prev.map((p) => (p.id === item.id ? { ...p, status: 'failed', message: vm.message } : p)));
      }
    }
  }, [addArtifact, clearSession, navigate, sessionId]);

  const onFiles = (files: FileList | File[]) => {
    const selected = Array.from(files);
    let count = artifacts.length + uploadItems.filter((i) => i.status === 'queued' || i.status === 'uploading' || i.status === 'success').length;
    const next: UploadItem[] = selected.map((file) => {
      const result = validateArtifactFile(file, count);
      if (result.valid) count += 1;
      return {
        id: makeId(),
        file: result.valid ? file : undefined,
        name: file.name,
        status: result.valid ? 'queued' : 'invalid',
        message: result.message,
      };
    });
    setUploadItems((prev) => [...prev, ...next]);
    const valid = next.filter((item) => item.status === 'queued');
    if (valid.length > 0) void submitValidFiles(valid);
  };

  const retryFile = (item: UploadItem) => {
    if (!item.file) return;
    void submitValidFiles([{ ...item, status: 'queued' }]);
  };

  const submitUrl = async (type: 'LINK' | 'GITHUB') => {
    if (!sessionId) return;
    const value = (type === 'LINK' ? linkValue : githubValue).trim();
    const validator = type === 'LINK' ? validateHttpsUrl : validateGithubUrl;
    const result = validator(value);
    if (!result.valid) {
      if (type === 'LINK') setLinkError(result.message);
      else setGithubError(result.message);
      return;
    }
    if (artifacts.length >= ARTIFACT_MAX_COUNT) {
      const message = '결과물은 파일당 20MB, 최대 20건까지 제출할 수 있어요.';
      if (type === 'LINK') setLinkError(message);
      else setGithubError(message);
      return;
    }
    setSubmittingLink(type);
    if (type === 'LINK') setLinkError(undefined);
    else setGithubError(undefined);
    try {
      const artifact = await submitArtifactLink(sessionId, type, value);
      addArtifact(artifact);
      if (type === 'LINK') setLinkValue('');
      else setGithubValue('');
    } catch (error) {
      if (isAbortError(error)) return;
      const vm = asErrorViewModel(error);
      if (isSessionGoneError(vm)) {
        clearSession('expired');
        navigate('/expired', { replace: true });
        return;
      }
      if (type === 'LINK') setLinkError(vm.message);
      else setGithubError(vm.message);
    } finally {
      setSubmittingLink(undefined);
    }
  };

  const beginAnalysis = useCallback(async () => {
    if (!sessionId || starting) return;
    setStarting(true);
    setStartError(undefined);
    try {
      const job = await startAnalysis(sessionId);
      setActiveJobId(job.jobId);
      setAppStatus('ANALYZING');
      setHasUnsavedInput(false);
      navigate(`/analysis/${job.jobId}`);
    } catch (error) {
      if (isAbortError(error)) return;
      const vm = asErrorViewModel(error);
      if (isSessionGoneError(vm)) {
        clearSession('expired');
        navigate('/expired', { replace: true });
        return;
      }
      setStartError(vm);
    } finally {
      setStarting(false);
    }
  }, [clearSession, navigate, sessionId, setActiveJobId, setAppStatus, setHasUnsavedInput, starting]);

  useEffect(() => {
    if (!sampleMode || sampleStartedRef.current || loading || loadError || artifacts.length > 0 || !sessionId) return;
    sampleStartedRef.current = true;
    setSampleStatus('샘플 결과물 제출 → 분석 시작');
    announce('샘플 결과물을 제출하고 있어요.');
    void (async () => {
      try {
        const artifact = await submitSampleArtifact(sessionId);
        addArtifact(artifact);
        await new Promise((resolve) => setTimeout(resolve, 600));
        const job = await startAnalysis(sessionId);
        setActiveJobId(job.jobId);
        setAppStatus('ANALYZING');
        navigate(`/analysis/${job.jobId}`);
      } catch (error) {
        if (isAbortError(error)) return;
        const vm = asErrorViewModel(error);
        if (isSessionGoneError(vm)) {
          clearSession('expired');
          navigate('/expired', { replace: true });
          return;
        }
        setStartError(vm);
        setSampleStatus('샘플 자동 진행 중 문제가 발생했어요.');
      }
    })();
  }, [addArtifact, artifacts.length, clearSession, loadError, loading, navigate, sampleMode, sessionId, setActiveJobId, setAppStatus]);

  const hasExcluded = useMemo(() => artifacts.some((artifact) => isExcluded(artifact.ingestStatus)), [artifacts]);
  const canStart = artifacts.length > 0 && !starting;

  return (
    <section className={styles.page} aria-labelledby="artifacts-title">
      <div className={styles.headerBlock}>
        <p className={styles.eyebrow}>결과물 제출</p>
        <h1 id="artifacts-title" className={styles.title}>분석할 결과물을 제출해 주세요</h1>
        <p className={styles.description}>파일, 링크, GitHub 주소를 최대 {ARTIFACT_MAX_COUNT}건까지 제출할 수 있어요.</p>
        {sampleStatus && <p className={styles.sampleStatus} role="status">{sampleStatus}</p>}
      </div>

      <div className={styles.grid}>
        <section className={styles.card} aria-labelledby="submit-title">
          <h2 id="submit-title" className={styles.cardTitle}>제출 방식</h2>
          <div className={styles.tabs} role="tablist" aria-label="결과물 제출 방식">
            {(['FILE', 'LINK', 'GITHUB'] as const).map((item) => (
              <button key={item} type="button" role="tab" aria-selected={tab === item} className={tab === item ? styles.tabActive : styles.tab} onClick={() => setTab(item)}>
                {TYPE_LABEL[item]}
              </button>
            ))}
          </div>

          {tab === 'FILE' && (
            <div className={styles.panel}>
              <div
                className={`${styles.dropzone} ${dragOver ? styles.dropzoneActive : ''}`}
                onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(event) => { event.preventDefault(); setDragOver(false); onFiles(event.dataTransfer.files); }}
              >
                <span className={styles.dropIcon} aria-hidden="true">⬆</span>
                <label htmlFor="artifact-files" className={styles.fileLabel}>파일을 끌어오거나 선택해 주세요</label>
                <input id="artifact-files" className={styles.fileInput} type="file" multiple onChange={(event) => { if (event.currentTarget.files) onFiles(event.currentTarget.files); event.currentTarget.value = ''; }} />
                <p className={styles.helpText}>파일당 20MB 이하, 전체 최대 {ARTIFACT_MAX_COUNT}건</p>
              </div>
              {(zipSelected(uploadItems) || uploadItems.length === 0) && (
                <p className={styles.infoNote}>zip은 해제 후 100MB·1,000개 파일을 초과하면 분석에서 제외될 수 있어요.</p>
              )}
              {uploadItems.length > 0 && (
                <ul className={styles.uploadList} aria-label="파일 전송 상태">
                  {uploadItems.map((item) => (
                    <li key={item.id} className={styles.uploadItem}>
                      <span className={styles.uploadName} title={item.name}>{item.name}</span>
                      <span className={styles.uploadState}>{item.status === 'uploading' && <span className={styles.spinner} aria-hidden="true" />} {item.status === 'queued' ? '대기' : item.status === 'uploading' ? '전송 중' : item.status === 'success' ? '완료' : item.status === 'invalid' ? item.message : '실패'}</span>
                      {item.status === 'failed' && <Button variant="secondary" onClick={() => retryFile(item)}>다시 시도</Button>}
                      {item.status === 'failed' && item.message && <p className={styles.itemError}>{item.message}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {tab === 'LINK' && (
            <UrlForm label="링크 URL" value={linkValue} error={linkError} loading={submittingLink === 'LINK'} placeholder="https://example.com" onChange={(v) => { setLinkValue(v); setLinkError(undefined); }} onSubmit={() => void submitUrl('LINK')} />
          )}
          {tab === 'GITHUB' && (
            <UrlForm label="GitHub URL" value={githubValue} error={githubError} loading={submittingLink === 'GITHUB'} placeholder="https://github.com/owner/repo" onChange={(v) => { setGithubValue(v); setGithubError(undefined); }} onSubmit={() => void submitUrl('GITHUB')} />
          )}
        </section>

        <section className={styles.card} aria-labelledby="list-title">
          <div className={styles.listHeader}>
            <h2 id="list-title" className={styles.cardTitle}>제출 목록</h2>
            <span className={styles.count}>{artifacts.length}/{ARTIFACT_MAX_COUNT}건</span>
          </div>
          {loading ? (
            <div className={styles.skeletonStack}>
              <Skeleton height="28px" label="결과물 목록을 불러오는 중" />
              <Skeleton height="64px" />
              <Skeleton height="64px" />
            </div>
          ) : loadError ? (
            <ErrorCallout error={loadError} title="결과물을 불러오지 못했어요" actions={[{ label: '다시 불러오기', onClick: () => void fetchArtifacts() }]} />
          ) : artifacts.length === 0 ? (
            <p className={styles.empty}>아직 제출한 결과물이 없어요. 파일, 링크, GitHub 주소를 제출해 보세요.</p>
          ) : (
            <ul className={styles.artifactList}>
              {artifacts.map((artifact) => {
                const copy = INGEST_COPY[artifact.ingestStatus];
                return (
                  <li key={artifact.artifactId} className={styles.artifactItem}>
                    <div className={styles.artifactMain}>
                      <span className={styles.typeBadge}><span aria-hidden="true">{TYPE_ICON[artifact.type]}</span>{TYPE_LABEL[artifact.type]}</span>
                      <span className={styles.artifactName} title={artifact.name}>{artifact.name}</span>
                    </div>
                    <div className={styles.artifactMeta}>
                      <span className={`${styles.statusBadge} ${styles[copy.tone]}`}><span aria-hidden="true">{copy.icon}</span>{copy.label}</span>
                      {isExcluded(artifact.ingestStatus) && <span className={styles.excludeTag}>분석 제외</span>}
                      <time dateTime={artifact.submittedAt}>{formatTime(artifact.submittedAt)}</time>
                    </div>
                    {artifact.ingestNote && <p className={styles.ingestNote}>{artifact.ingestNote}</p>}
                  </li>
                );
              })}
            </ul>
          )}
          <p className={styles.deleteNote}>제출 항목 개별 삭제는 지원하지 않아요. 전체 삭제는 상단 '내 데이터 지우기'를 사용하세요.</p>
          {hasExcluded && <p className={styles.infoNote}>제외 표시된 항목은 분석에 포함되지 않아요.</p>}
          {startError && <ErrorCallout error={startError} title={startError.code === 'ANALYSIS_PRECONDITION_FAILED' ? '분석을 시작하려면 의도와 결과물이 필요해요.' : '분석을 시작하지 못했어요'} />}
          <div className={styles.startArea}>
            {!canStart && <p className={styles.helpText}>결과물을 1건 이상 제출하면 분석을 시작할 수 있어요</p>}
            <Button onClick={() => void beginAnalysis()} disabled={!canStart} loading={starting}>분석 시작</Button>
          </div>
        </section>
      </div>
    </section>
  );
}

interface UrlFormProps {
  label: string;
  value: string;
  error?: string;
  loading: boolean;
  placeholder: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

function UrlForm({ label, value, error, loading, placeholder, onChange, onSubmit }: UrlFormProps) {
  return (
    <form className={styles.urlForm} onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
      <label className={styles.inputLabel} htmlFor={`${label}-input`}>{label}</label>
      <div className={styles.urlRow}>
        <input id={`${label}-input`} className={styles.urlInput} type="url" inputMode="url" value={value} placeholder={placeholder} onChange={(event) => onChange(event.currentTarget.value)} aria-invalid={error ? true : undefined} aria-describedby={error ? `${label}-error` : undefined} />
        <Button type="submit" loading={loading}>추가</Button>
      </div>
      {error && <p id={`${label}-error`} className={styles.inlineError}>{error}</p>}
    </form>
  );
}
