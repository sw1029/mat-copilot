import { Component, type ErrorInfo, type ReactNode } from 'react';
import styles from './ErrorBoundary.module.css';

// TRD/front.md §7.1 — 전역 ErrorBoundary: 새로고침/새 세션/traceId 복사 제공.

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class AppErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 관측성: 토큰/본문 미포함, 렌더 오류만 기록 (TRD §13.1)
    console.error('[matcopilot] render boundary', error.name, info.componentStack ?? '');
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className={styles.container} role="alert">
        <div className={styles.card}>
          <h1 className={styles.title}>화면을 표시하지 못했어요</h1>
          <p className={styles.message}>
            일시적인 오류일 수 있어요. 새로고침하거나 새 세션으로 다시 시작해 주세요.
          </p>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.primary}
              onClick={() => window.location.reload()}
            >
              새로고침
            </button>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => {
                try {
                  localStorage.removeItem('matcopilot.sessionToken');
                  localStorage.removeItem('matcopilot.sessionId');
                } catch {
                  // storage 접근 불가 시에도 새 세션 이동은 진행
                }
                window.location.href = '/';
              }}
            >
              새 세션 시작
            </button>
          </div>
        </div>
      </div>
    );
  }
}
