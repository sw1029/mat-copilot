import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ApiErrorViewModel } from '../shared/api/errors';
import { asErrorViewModel, isAbortError, isSessionGoneError } from '../shared/api/errors';
import { getArtifacts, getReport, getReportCharts } from '../shared/api/endpoints';
import type { Artifact, ChartSpec, Report } from '../shared/api/types';
import { SanitizedMarkdown } from '../shared/security/SanitizedMarkdown';
import { announce } from '../shared/a11y/liveRegion';
import { downloadMarkdown } from '../shared/utils/download';
import { Button } from '../shared/ui/Button';
import { ErrorCallout } from '../shared/ui/ErrorCallout';
import { Skeleton } from '../shared/ui/Skeleton';
import { AIGeneratedBadge } from '../shared/ui/AIGeneratedBadge';
import { routeForAppStatus, useSessionStore } from '../stores/sessionStore';
import { useReportStore } from '../stores/reportStore';
import { ChartRenderer } from '../features/report/ChartRenderer';
import { EvidencePanel } from '../features/report/EvidencePanel';
import { FindingCard } from '../features/report/FindingCard';
import { FindingDetail } from '../features/report/FindingDetail';
import { IntentDocPanel } from '../features/report/IntentDocPanel';
import { MetricCard } from '../features/report/MetricCard';
import { composeReportMarkdown } from '../features/report/reportUtils';
import styles from './ReportPage.module.css';

type PanelState = 'idle' | 'loading' | 'ready' | 'error';

function LoadingStack() {
  return (
    <div className={styles.loadingPanel} aria-busy="true">
      <Skeleton height="28px" width="45%" label="보고서를 불러오는 중" />
      <Skeleton height="120px" />
      <Skeleton height="120px" />
    </div>
  );
}

function InlineNotice({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className={styles.inlineNotice} role="status">
      <span>{message}</span>
      <Button variant="secondary" onClick={onRetry}>재시도</Button>
    </div>
  );
}

async function settleReportData(sessionId: string, signal: AbortSignal) {
  return Promise.allSettled([
    getReport(sessionId, signal),
    getReportCharts(sessionId, signal),
    getArtifacts(sessionId, signal),
  ] as const);
}

export function ReportPage() {
  const navigate = useNavigate();
  const sessionId = useSessionStore((state) => state.sessionId);
  const serverStatus = useSessionStore((state) => state.serverStatus);
  const appStatus = useSessionStore((state) => state.appStatus);
  const activeJobId = useSessionStore((state) => state.activeJobId);
  const clearSession = useSessionStore((state) => state.clearSession);
  const report = useReportStore((state) => state.report);
  const intentDoc = useReportStore((state) => state.intentDoc);
  const artifacts = useReportStore((state) => state.artifacts);
  const charts = useReportStore((state) => state.charts);
  const selectedFindingId = useReportStore((state) => state.selectedFindingId);
  const setReport = useReportStore((state) => state.setReport);
  const setCharts = useReportStore((state) => state.setCharts);
  const setArtifacts = useReportStore((state) => state.setArtifacts);
  const [reportState, setReportState] = useState<PanelState>('idle');
  const [chartsState, setChartsState] = useState<PanelState>('idle');
  const [artifactsState, setArtifactsState] = useState<PanelState>('idle');
  const [reportError, setReportError] = useState<ApiErrorViewModel>();

  useEffect(() => {
    if (serverStatus && serverStatus !== 'REPORT_READY') {
      navigate(routeForAppStatus(appStatus, activeJobId), { replace: true });
    }
  }, [activeJobId, appStatus, navigate, serverStatus]);

  const handleGone = useCallback((error: ApiErrorViewModel) => {
    if (isSessionGoneError(error)) {
      clearSession('expired');
      navigate('/expired', { replace: true });
      return true;
    }
    return false;
  }, [clearSession, navigate]);

  const loadAll = useCallback((signal: AbortSignal) => {
    if (!sessionId) {
      navigate('/', { replace: true });
      return;
    }
    setReportState('loading');
    setChartsState('loading');
    setArtifactsState('loading');
    setReportError(undefined);
    void settleReportData(sessionId, signal).then(([reportResult, chartsResult, artifactsResult]) => {
      if (reportResult.status === 'fulfilled') {
        setReport(reportResult.value as Report);
        setReportState('ready');
      } else if (!isAbortError(reportResult.reason)) {
        const error = asErrorViewModel(reportResult.reason);
        if (!handleGone(error)) {
          setReportError(error);
          setReportState('error');
        }
      }

      if (chartsResult.status === 'fulfilled') {
        setCharts(chartsResult.value as ChartSpec[]);
        setChartsState('ready');
      } else if (!isAbortError(chartsResult.reason)) {
        setChartsState('error');
      }

      if (artifactsResult.status === 'fulfilled') {
        setArtifacts(artifactsResult.value as Artifact[]);
        setArtifactsState('ready');
      } else if (!isAbortError(artifactsResult.reason)) {
        setArtifactsState('error');
      }
    });
  }, [handleGone, navigate, sessionId, setArtifacts, setCharts, setReport]);

  useEffect(() => {
    const controller = new AbortController();
    loadAll(controller.signal);
    return () => controller.abort();
  }, [loadAll]);

  const retryCharts = () => {
    if (!sessionId) return;
    const controller = new AbortController();
    setChartsState('loading');
    void getReportCharts(sessionId, controller.signal)
      .then((nextCharts) => { setCharts(nextCharts); setChartsState('ready'); })
      .catch((error: unknown) => { if (!isAbortError(error)) setChartsState('error'); });
  };

  const retryArtifacts = () => {
    if (!sessionId) return;
    const controller = new AbortController();
    setArtifactsState('loading');
    void getArtifacts(sessionId, controller.signal)
      .then((nextArtifacts) => { setArtifacts(nextArtifacts); setArtifactsState('ready'); })
      .catch((error: unknown) => { if (!isAbortError(error)) setArtifactsState('error'); });
  };

  const selectedFinding = useMemo(
    () => report?.findings.find((finding) => finding.findingId === selectedFindingId),
    [report, selectedFindingId],
  );

  const retryReport = () => {
    const controller = new AbortController();
    loadAll(controller.signal);
  };

  if (reportState === 'error' && reportError) {
    return (
      <main className={styles.page}>
        <div className={styles.fullError}>
          <ErrorCallout
            error={reportError}
            actions={[
              { label: '다시 불러오기', onClick: retryReport },
              {
                label: '새 세션 시작',
                onClick: () => {
                  clearSession('new-session');
                  navigate('/');
                },
              },
            ]}
          />
        </div>
      </main>
    );
  }

  if (!report || !intentDoc) {
    return (
      <main className={styles.page}>
        <div className={styles.shell}>
          <div className={styles.left}><LoadingStack /><LoadingStack /></div>
          <div className={styles.right}><LoadingStack /></div>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.left}>
          <IntentDocPanel intentDoc={intentDoc} findings={report.findings} />
          {artifactsState === 'loading' ? <LoadingStack /> : (
            <div className={styles.leftBottom}>
              {artifactsState === 'error' && <InlineNotice message="결과물 근거를 불러오지 못했어요" onRetry={retryArtifacts} />}
              <EvidencePanel artifacts={artifacts} selectedFinding={selectedFinding} />
            </div>
          )}
        </div>
        <section className={styles.right} aria-labelledby="report-title">
          {report.earlyCompleted && <div className={styles.banner}>인터뷰가 조기 종료되어 일부 의도가 덜 구체화되었을 수 있어요.</div>}
          <header className={styles.stickyHeader}>
            <div className={styles.titleGroup}>
              <h1 id="report-title" className={styles.title}>분석 결과</h1>
              <AIGeneratedBadge surface="report" />
            </div>
            <div className={styles.actions}>
              <Button variant="secondary" onClick={() => { downloadMarkdown('intent-doc.md', intentDoc.markdown); announce('다운로드를 시작했어요.'); }}>IntentDoc 내려받기</Button>
              <Button variant="primary" onClick={() => { downloadMarkdown('drift-report.md', composeReportMarkdown(report)); announce('다운로드를 시작했어요.'); }}>보고서 내려받기</Button>
            </div>
          </header>

          <section aria-label="요약 지표" className={styles.metrics}>
            {report.metrics.map((metric) => <MetricCard key={metric.metricId} metric={metric} />)}
          </section>

          <section aria-label="차트" className={styles.charts}>
            {chartsState === 'loading' && <LoadingStack />}
            {chartsState === 'error' && <InlineNotice message="차트를 불러오지 못했어요" onRetry={retryCharts} />}
            {chartsState !== 'loading' && charts.map((chart) => <ChartRenderer key={chart.chartId} spec={chart} findings={report.findings} />)}
          </section>

          <section className={`${styles.card} ${styles.qualitative}`}>
            <h2 className={styles.sectionTitle}>종합 분석</h2>
            <SanitizedMarkdown markdown={report.qualitative} className={styles.markdown} />
          </section>

          <section className={`${styles.card} ${styles.suggestionCard}`}>
            <div className={styles.suggestionHead}>
              <h2 className={styles.sectionTitle}>개선 제안</h2>
              <AIGeneratedBadge surface="suggestion" />
            </div>
            <p className={styles.note}>자동 수정이 아닌, 검토할 다음 행동이에요.</p>
            <ul className={styles.suggestions}>{report.suggestions.map((suggestion) => <li key={suggestion}>{suggestion}</li>)}</ul>
          </section>

          <section aria-labelledby="findings-title" className={`${styles.card} ${styles.findingsSection}`}>
            <h2 id="findings-title" className={styles.sectionTitle}>finding 목록</h2>
            {report.findings.length === 0 ? (
              <p className={styles.empty}>발견된 drift가 없어요. 의도와 결과물이 잘 정합해요.</p>
            ) : (
              <div className={styles.findings}>
                <div className={styles.findingList}>{report.findings.map((finding) => <FindingCard key={finding.findingId} finding={finding} />)}</div>
                <FindingDetail finding={selectedFinding} report={report} artifacts={artifacts} />
              </div>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}
