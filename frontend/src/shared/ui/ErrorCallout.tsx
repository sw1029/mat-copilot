import { useEffect, useRef } from 'react';
import type { ApiErrorViewModel } from '../api/errors';
import styles from './ErrorCallout.module.css';

// TRD/front.md §12 — 오류 표면화 표준 컴포넌트. assertive 렌더 후 heading에 programmatic focus.

export interface ErrorAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

interface ErrorCalloutProps {
  error: ApiErrorViewModel;
  title?: string;
  actions?: ErrorAction[];
  assertive?: boolean;
  autoFocus?: boolean;
}

export function ErrorCallout({
  error,
  title = '문제가 발생했어요',
  actions = [],
  assertive = true,
  autoFocus = true,
}: ErrorCalloutProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (autoFocus) headingRef.current?.focus();
  }, [autoFocus, error]);

  return (
    <div className={styles.callout} role={assertive ? 'alert' : 'status'}>
      <h3 className={styles.title} tabIndex={-1} ref={headingRef}>
        <span aria-hidden="true" className={styles.icon}>
          ⚠
        </span>
        {title}
      </h3>
      <p className={styles.message}>{error.message}</p>
      {error.retryAfterSec !== undefined && (
        <p className={styles.meta}>{error.retryAfterSec}초 후 다시 시도할 수 있어요.</p>
      )}
      {error.traceId && (
        <p className={styles.meta}>
          오류 추적 ID: <code className={styles.trace}>{error.traceId}</code>
          <button
            type="button"
            className={styles.copyButton}
            onClick={() => {
              void navigator.clipboard?.writeText(error.traceId ?? '').catch(() => {
                // clipboard 미지원 환경 — traceId는 화면에 그대로 표시되어 있음
              });
            }}
          >
            복사
          </button>
        </p>
      )}
      {actions.length > 0 && (
        <div className={styles.actions}>
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className={styles.actionButton}
              onClick={action.onClick}
              disabled={action.disabled}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
