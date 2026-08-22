import type { Metric, MetricStatus } from '../../shared/api/types';
import { AIGeneratedBadge } from '../../shared/ui/AIGeneratedBadge';
import styles from './MetricCard.module.css';

const STATUS_COPY: Record<MetricStatus, string> = {
  GOOD: '양호 ✓',
  WARN: '주의 !',
  BAD: '위험 ✕',
  NA: '산정 불가 –',
};

const STATUS_CLASS: Record<MetricStatus, string> = {
  GOOD: styles.good,
  WARN: styles.warn,
  BAD: styles.bad,
  NA: styles.na,
};

export function MetricCard({ metric }: { metric: Metric }) {
  return (
    <article className={styles.card}>
      <div className={styles.header}>
        <span className={styles.label}>{metric.label}</span>
        <span className={styles.info} title={metric.description} aria-label={metric.description}>ⓘ</span>
      </div>
      <div className={styles.value}>
        {metric.computable ? (
          `${metric.value ?? '-'}${metric.unit}`
        ) : (
          <span className={styles.naValue}>
            산정 불가 <AIGeneratedBadge surface="metricNa" />
          </span>
        )}
      </div>
      <span className={`${styles.badge} ${STATUS_CLASS[metric.status]}`}>{STATUS_COPY[metric.status]}</span>
      {!metric.computable && metric.reason && <p className={styles.reason}>{metric.reason}</p>}
      {metric.thresholds && (
        <p className={styles.thresholds}>
          주의 {metric.thresholds.warn}{metric.unit} · 위험 {metric.thresholds.bad}{metric.unit}
        </p>
      )}
    </article>
  );
}
