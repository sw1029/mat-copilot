import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ApiErrorViewModel } from '../api/errors';
import { ErrorCallout } from './ErrorCallout';

const baseError: ApiErrorViewModel = {
  code: 'INTERNAL',
  message: '알 수 없는 오류가 발생했어요.',
  retryable: true,
  autoRetryable: false,
  traceId: 'trace-abc-123',
};

describe('ErrorCallout (TRD §12)', () => {
  it('role=alert로 렌더되고 메시지·traceId를 표시한다', () => {
    render(<ErrorCallout error={baseError} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('알 수 없는 오류가 발생했어요.');
    expect(alert).toHaveTextContent('trace-abc-123');
  });

  it('assertive=false면 role=status', () => {
    render(<ErrorCallout error={baseError} assertive={false} autoFocus={false} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('retryAfterSec이 있으면 남은 시간 안내를 표시한다', () => {
    render(<ErrorCallout error={{ ...baseError, code: 'RATE_LIMITED', retryAfterSec: 42 }} />);
    expect(screen.getByText(/42초 후 다시 시도할 수 있어요/)).toBeInTheDocument();
  });

  it('액션 버튼이 렌더되고 클릭 시 핸들러가 호출된다', async () => {
    const onRetry = vi.fn();
    render(<ErrorCallout error={baseError} actions={[{ label: '다시 시도', onClick: onRetry }]} />);
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('렌더 시 제목에 programmatic focus를 준다', () => {
    render(<ErrorCallout error={baseError} title="업로드 실패" />);
    expect(screen.getByText('업로드 실패')).toHaveFocus();
  });
});
