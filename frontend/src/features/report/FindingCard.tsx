import type { Finding, Severity } from '../../shared/api/types';
import { announce } from '../../shared/a11y/liveRegion';
import { useReportStore } from '../../stores/reportStore';
import { CONFIDENCE_LABELS, getThemeLabel, SEVERITY_LABELS } from './constants';
import styles from './FindingCard.module.css';

const SEVERITY_CLASS: Record<Severity, string> = {
  HIGH: styles.bad,
  MEDIUM: styles.warn,
  LOW: styles.na,
};

const SEVERITY_ICON: Record<Severity, string> = {
  HIGH: '✕',
  MEDIUM: '!',
  LOW: '–',
};

export function FindingCard({ finding }: { finding: Finding }) {
  const footnoteByBlockId = useReportStore((state) => state.footnoteByBlockId);
  const selectedFindingId = useReportStore((state) => state.selectedFindingId);
  const selectFinding = useReportStore((state) => state.selectFinding);
  const hoverFinding = useReportStore((state) => state.hoverFinding);
  const selected = selectedFindingId === finding.findingId;

  const select = () => {
    selectFinding(selected ? undefined : finding.findingId);
    announce(`${finding.summary} 선택됨`);
  };

  return (
    <button
      id={`finding-${finding.findingId}`}
      type="button"
      className={`${styles.card} ${selected ? styles.selected : ''}`}
      aria-pressed={selected}
      onMouseEnter={() => hoverFinding(finding.findingId)}
      onMouseLeave={() => hoverFinding(undefined)}
      onFocus={() => hoverFinding(finding.findingId)}
      onBlur={() => hoverFinding(undefined)}
      onClick={select}
    >
      <span className={styles.top}>
        <span className={styles.theme}>{getThemeLabel(finding)}</span>
        <span className={`${styles.badge} ${SEVERITY_CLASS[finding.severity]}`}>
          {SEVERITY_LABELS[finding.severity]} {SEVERITY_ICON[finding.severity]}
        </span>
        <span className={`${styles.badge} ${styles.na}`}>{CONFIDENCE_LABELS[finding.confidence]}</span>
      </span>
      <span className={styles.summary}>{finding.summary}</span>
      <span className={styles.footer}>
        <span className={styles.footnotes}>
          {finding.intentBlockIds.map((blockId) => (
            <span key={blockId} className={styles.footnote}>[{footnoteByBlockId[blockId]}]</span>
          ))}
        </span>
        <span>{finding.evidence.length > 0 ? `근거 ${finding.evidence.length}건` : finding.theme === 'REQUIREMENT_OMISSION' ? '근거 없음(누락 판정)' : '근거 없음'}</span>
      </span>
    </button>
  );
}
