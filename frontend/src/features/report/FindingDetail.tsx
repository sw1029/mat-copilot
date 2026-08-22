import type { Artifact, Finding, Report, Severity } from '../../shared/api/types';
import { AIGeneratedBadge } from '../../shared/ui/AIGeneratedBadge';
import { useReportStore } from '../../stores/reportStore';
import { CONFIDENCE_LABELS, getThemeLabel, SEVERITY_LABELS } from './constants';
import { EvidenceItem } from './EvidenceItem';
import { prefersReducedMotion } from './reportUtils';
import styles from './FindingDetail.module.css';

const SEVERITY_CLASS: Record<Severity, string> = {
  HIGH: styles.bad,
  MEDIUM: styles.warn,
  LOW: styles.na,
};

export function FindingDetail({ finding, report, artifacts }: { finding?: Finding; report: Report; artifacts: Artifact[] }) {
  const footnoteByBlockId = useReportStore((state) => state.footnoteByBlockId);
  if (!finding) {
    return (
      <section className={styles.panel} aria-label="finding 상세">
        <p className={styles.empty}>finding 카드를 선택하면 상세 내용이 표시돼요.</p>
        <p className={styles.summaryLine}>
          전체 의도 {report.quantStats.totalIntents}개 중 {report.quantStats.coveredIntents}개 커버, drift {report.quantStats.driftCount}건
        </p>
      </section>
    );
  }
  return (
    <section className={styles.panel} aria-label="finding 상세">
      <div className={styles.header}>
        <span className={styles.theme}>{getThemeLabel(finding)}</span>
        <span className={`${styles.badge} ${SEVERITY_CLASS[finding.severity]}`}>{SEVERITY_LABELS[finding.severity]}</span>
        <span className={`${styles.badge} ${styles.na}`}>{CONFIDENCE_LABELS[finding.confidence]}</span>
      </div>
      <h3 className={styles.title}>{finding.summary}</h3>
      <p className={styles.detail}>{finding.detail}</p>
      {finding.evidence.length > 0 && (
        <ul className={styles.list}>
          {finding.evidence.map((evidence, index) => (
            <EvidenceItem key={`${evidence.artifactId}-${index}`} evidence={evidence} artifacts={artifacts} condensed />
          ))}
        </ul>
      )}
      {finding.suggestion && (
        <div className={styles.suggestion}>
          <AIGeneratedBadge surface="suggestion" />
          <span>{finding.suggestion}</span>
        </div>
      )}
      <div className={styles.footnotes} aria-label="관련 IntentDoc 블록">
        {finding.intentBlockIds.map((blockId) => (
          <button
            key={blockId}
            type="button"
            className={styles.footnote}
            onClick={() => document.getElementById(blockId)?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' })}
          >
            [{footnoteByBlockId[blockId]}]
          </button>
        ))}
      </div>
    </section>
  );
}
