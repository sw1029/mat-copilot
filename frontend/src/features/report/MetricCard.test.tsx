import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Metric } from '../../shared/api/types';
import { MetricCard } from './MetricCard';

function metric(overrides: Partial<Metric>): Metric {
  return {
    metricId: 'm-1',
    label: '의도 커버리지',
    value: 80,
    unit: '%',
    status: 'GOOD',
    description: '전체 의도 중 결과물이 커버한 비율',
    computable: true,
    ...overrides,
  };
}

describe('MetricCard (TRD §7.7)', () => {
  it('computable이면 값+단위와 상태 배지(텍스트 병행)를 표시한다', () => {
    render(<MetricCard metric={metric({})} />);
    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.getByText('양호 ✓')).toBeInTheDocument();
  });

  it('computable=false면 "산정 불가" + AI 배지 + reason을 표시하고 임의 수치를 만들지 않는다', () => {
    render(
      <MetricCard
        metric={metric({
          computable: false,
          value: null,
          status: 'NA',
          reason: '토큰 사용량 데이터가 제공되지 않았어요.',
        })}
      />,
    );
    expect(screen.getAllByText(/산정 불가/).length).toBeGreaterThan(0);
    expect(screen.getByText('토큰 사용량 데이터가 제공되지 않았어요.')).toBeInTheDocument();
    expect(screen.queryByText(/null%|NaN/)).not.toBeInTheDocument();
  });

  it('thresholds가 있으면 문서 기준 caption을 표시한다 (하드코딩 금지)', () => {
    render(<MetricCard metric={metric({ thresholds: { warn: 70, bad: 50 } })} />);
    expect(screen.getByText(/주의 70% · 위험 50%/)).toBeInTheDocument();
  });

  it('BAD 상태도 색상 단독이 아닌 텍스트로 구분된다', () => {
    render(<MetricCard metric={metric({ status: 'BAD', value: 30 })} />);
    expect(screen.getByText('위험 ✕')).toBeInTheDocument();
  });
});
