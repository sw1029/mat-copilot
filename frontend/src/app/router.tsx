import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './AppShell';
import { useBootstrap } from './useBootstrap';
import { HomePage } from '../pages/HomePage';
import { InterviewPage } from '../pages/InterviewPage';
import { ArtifactsPage } from '../pages/ArtifactsPage';
import { AnalysisPage } from '../pages/AnalysisPage';
import { ExpiredPage } from '../pages/ExpiredPage';
import { Skeleton } from '../shared/ui/Skeleton';

// TRD §10.2 — ReportPage(마크다운/차트 포함)는 lazy chunk로 분리
const ReportPage = lazy(() =>
  import('../pages/ReportPage').then((m) => ({ default: m.ReportPage })),
);

function BootGate({ children }: { children: React.ReactElement }) {
  const bootstrapped = useBootstrap();
  if (!bootstrapped) {
    return (
      <div style={{ padding: 'var(--space-8)' }}>
        <Skeleton height="24px" width="200px" label="세션 상태를 확인하는 중" />
      </div>
    );
  }
  return children;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route
          path="/"
          element={
            <BootGate>
              <HomePage />
            </BootGate>
          }
        />
        <Route
          path="/interview"
          element={
            <BootGate>
              <InterviewPage />
            </BootGate>
          }
        />
        <Route
          path="/artifacts"
          element={
            <BootGate>
              <ArtifactsPage />
            </BootGate>
          }
        />
        <Route
          path="/analysis/:jobId"
          element={
            <BootGate>
              <AnalysisPage />
            </BootGate>
          }
        />
        <Route
          path="/report"
          element={
            <BootGate>
              <Suspense
                fallback={
                  <div style={{ padding: 'var(--space-8)' }}>
                    <Skeleton height="24px" width="240px" label="보고서 화면을 불러오는 중" />
                  </div>
                }
              >
                <ReportPage />
              </Suspense>
            </BootGate>
          }
        />
        <Route path="/expired" element={<ExpiredPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
