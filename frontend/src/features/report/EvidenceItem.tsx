import type { Artifact, EvidenceRef } from '../../shared/api/types';
import { SafeLink } from '../../shared/security/SafeLink';
import styles from './EvidenceItem.module.css';

interface EvidenceItemProps {
  evidence: EvidenceRef;
  artifacts: Artifact[];
  condensed?: boolean;
}

export function EvidenceItem({ evidence, artifacts, condensed = false }: EvidenceItemProps) {
  const artifact = artifacts.find((item) => item.artifactId === evidence.artifactId);
  const { location } = evidence;
  const lineSuffix = location.startLine
    ? `:${location.startLine}${location.endLine ? `-${location.endLine}` : ''}`
    : '';
  const hasFilePath = location.kind === 'file' && Boolean(location.path);
  const hasUrl = (location.kind === 'web' || location.kind === 'github') && Boolean(location.url);

  return (
    <li className={styles.item}>
      <div className={styles.meta}>
        <span className={styles.name}>{artifact?.name ?? evidence.artifactId}</span>
        {hasFilePath && <code className={styles.code}>{`${location.path}${lineSuffix}`}</code>}
        {hasUrl && (
          <SafeLink href={location.url} fallback={<span className={styles.badge}>위치 이동 불가</span>}>
            URL 열기
          </SafeLink>
        )}
        {!hasFilePath && !hasUrl && <span className={styles.badge}>위치 이동 불가</span>}
      </div>
      {location.note && <span className={styles.note}>{location.note}</span>}
      <blockquote className={styles.quote}>{condensed ? evidence.quote.slice(0, 220) : evidence.quote}</blockquote>
    </li>
  );
}
