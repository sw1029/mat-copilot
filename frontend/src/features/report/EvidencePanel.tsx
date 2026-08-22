import type { Artifact, Finding } from '../../shared/api/types';
import { EvidenceItem } from './EvidenceItem';
import styles from './EvidencePanel.module.css';

const INGEST_STATUS: Record<Artifact['ingestStatus'], string> = {
  PENDING: '처리 대기',
  PARSED: '분석 반영됨',
  SKIPPED_UNSUPPORTED: '지원하지 않아 제외됨',
  SKIPPED_TOO_LARGE: '용량 초과로 제외됨',
  BLOCKED_UNSAFE: '안전 정책으로 차단됨',
};

export function EvidencePanel({ artifacts, selectedFinding }: { artifacts: Artifact[]; selectedFinding?: Finding }) {
  return (
    <aside className={styles.panel} aria-labelledby="evidence-title">
      <header className={styles.header}><h2 id="evidence-title" className={styles.title}>결과물 근거</h2></header>
      <div className={styles.content}>
        {!selectedFinding ? (
          <>
            <p className={styles.hint}>finding을 선택하면 관련 근거가 여기 표시돼요.</p>
            <ul className={styles.list}>
              {artifacts.map((artifact) => (
                <li key={artifact.artifactId} className={styles.artifact}>
                  <span className={styles.artifactName}>{artifact.name}</span>
                  <span className={styles.meta}>{artifact.type} · {INGEST_STATUS[artifact.ingestStatus]}</span>
                  {artifact.ingestNote && <span className={styles.meta}>{artifact.ingestNote}</span>}
                </li>
              ))}
            </ul>
          </>
        ) : selectedFinding.evidence.length > 0 ? (
          <ul className={styles.list}>
            {selectedFinding.evidence.map((evidence, index) => (
              <EvidenceItem key={`${evidence.artifactId}-${index}`} evidence={evidence} artifacts={artifacts} />
            ))}
          </ul>
        ) : selectedFinding.theme === 'REQUIREMENT_OMISSION' ? (
          <p className={styles.info}>결과물에서 대응 근거를 찾지 못했어요. 누락 판정에서는 근거가 없는 것이 정상이에요.</p>
        ) : (
          <p className={styles.info}>표시할 근거가 없어요. 신뢰도는 LOW로 해석해 주세요.</p>
        )}
      </div>
    </aside>
  );
}
