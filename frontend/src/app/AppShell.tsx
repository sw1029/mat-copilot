import { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { announce } from '../shared/a11y/liveRegion';
import { asErrorViewModel } from '../shared/api/errors';
import { cancelJob, deleteSession } from '../shared/api/endpoints';
import { useSessionStore } from '../stores/sessionStore';
import { useInterviewStore } from '../stores/interviewStore';
import { useReportStore } from '../stores/reportStore';
import { useUiStore } from '../stores/uiStore';
import { ConfirmModal } from '../shared/ui/ConfirmModal';
import { LiveRegionOutlet } from '../shared/ui/LiveRegionOutlet';
import styles from './AppShell.module.css';

// PRD §5.1 전역 셸 — 좌측 상단 고정 홈 버튼, 내 데이터 지우기, 이탈 확인(FR-25)

export function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const appStatus = useSessionStore((s) => s.appStatus);
  const sessionId = useSessionStore((s) => s.sessionId);
  const activeJobId = useSessionStore((s) => s.activeJobId);
  const sampleMode = useSessionStore((s) => s.sampleMode);
  const clearSession = useSessionStore((s) => s.clearSession);
  const hasUnsavedInput = useUiStore((s) => s.hasUnsavedInput);
  const setHasUnsavedInput = useUiStore((s) => s.setHasUnsavedInput);
  const resetInterview = useInterviewStore((s) => s.reset);
  const resetReport = useReportStore((s) => s.reset);

  const [homeConfirmOpen, setHomeConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const needsLeaveConfirm =
    hasUnsavedInput || appStatus === 'INTERVIEWING' || appStatus === 'ANALYZING';

  const goHome = () => {
    setHasUnsavedInput(false);
    setHomeConfirmOpen(false);
    navigate('/');
  };

  const onHomeClick = () => {
    if (location.pathname === '/') return;
    if (needsLeaveConfirm) {
      setHomeConfirmOpen(true);
    } else {
      goHome();
    }
  };

  const onCancelAnalysisAndGoHome = async () => {
    if (sessionId && activeJobId) {
      try {
        await cancelJob(sessionId, activeJobId);
        announce('분석을 취소했어요.');
      } catch (error) {
        announce(asErrorViewModel(error).message, 'assertive');
      }
    }
    goHome();
  };

  const onDeleteData = async () => {
    if (!sessionId) {
      clearSession('deleted');
      resetInterview();
      resetReport();
      setDeleteConfirmOpen(false);
      navigate('/');
      return;
    }
    setDeleting(true);
    try {
      await deleteSession(sessionId);
      clearSession('deleted');
      resetInterview();
      resetReport();
      setHasUnsavedInput(false);
      announce('세션 데이터를 모두 삭제했어요.');
      setDeleteConfirmOpen(false);
      navigate('/');
    } catch (error) {
      announce(asErrorViewModel(error).message, 'assertive');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className={styles.shell}>
      <header className={styles.header} role="banner">
        <button
          type="button"
          className={styles.homeButton}
          onClick={onHomeClick}
          aria-label="홈으로 이동"
        >
          <span className={styles.logoMark} aria-hidden="true">
            ◈
          </span>
          <span className={styles.logoText}>mat-copilot</span>
        </button>
        <div className={styles.headerRight}>
          {sampleMode && (
            <span className={styles.sampleBadge} role="status">
              샘플 체험 중
            </span>
          )}
          <span className={styles.aiNotice}>AI 분석 서비스 — 결과는 검토용으로 제공됩니다</span>
          <button
            type="button"
            className={styles.deleteButton}
            onClick={() => setDeleteConfirmOpen(true)}
          >
            내 데이터 지우기
          </button>
        </div>
      </header>
      <main className={styles.main} role="main">
        <Outlet />
      </main>
      <LiveRegionOutlet />

      <ConfirmModal
        open={homeConfirmOpen}
        title="홈으로 이동할까요?"
        confirmLabel={appStatus === 'ANALYZING' ? '분석 유지하고 이동' : '이동'}
        cancelLabel="계속 진행"
        onConfirm={goHome}
        onCancel={() => setHomeConfirmOpen(false)}
      >
        {appStatus === 'ANALYZING' ? (
          <>
            <p>분석이 진행 중이에요. 이동해도 분석은 계속되며, 홈에서 이어할 수 있어요.</p>
            <button
              type="button"
              className={styles.inlineDanger}
              onClick={() => void onCancelAnalysisAndGoHome()}
            >
              분석 취소하고 이동
            </button>
          </>
        ) : (
          <p>작성 중인 입력이 있어요. 지금 이동하면 화면의 입력값이 사라질 수 있어요.</p>
        )}
      </ConfirmModal>

      <ConfirmModal
        open={deleteConfirmOpen}
        title="내 데이터를 지울까요?"
        confirmLabel={deleting ? '삭제 중…' : '모두 삭제'}
        cancelLabel="취소"
        danger
        confirmDisabled={deleting}
        onConfirm={() => void onDeleteData()}
        onCancel={() => setDeleteConfirmOpen(false)}
      >
        <p>세션, 업로드 파일, 보고서가 즉시 파기되고 되돌릴 수 없어요.</p>
      </ConfirmModal>
    </div>
  );
}
