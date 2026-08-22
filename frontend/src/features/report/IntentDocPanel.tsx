import { useEffect, useMemo } from 'react';
import type { Finding, IntentDoc } from '../../shared/api/types';
import { SanitizedMarkdown } from '../../shared/security/SanitizedMarkdown';
import { AIGeneratedBadge } from '../../shared/ui/AIGeneratedBadge';
import { announce } from '../../shared/a11y/liveRegion';
import { useReportStore } from '../../stores/reportStore';
import { downloadMarkdown } from '../../shared/utils/download';
import { prefersReducedMotion } from './reportUtils';
import styles from './IntentDocPanel.module.css';

interface IntentDocPanelProps {
  intentDoc: IntentDoc;
  findings: Finding[];
}

interface SplitIntentDoc {
  header?: string;
  segments: string[];
  mapped: boolean;
}

function splitIntentDoc(intentDoc: IntentDoc): SplitIntentDoc {
  const lines = intentDoc.markdown.split('\n');
  const firstBlockIndex = lines.findIndex((line) => line.startsWith('## '));
  if (firstBlockIndex < 0) return { segments: [intentDoc.markdown], mapped: intentDoc.blocks.length === 1 };
  const header = lines.slice(0, firstBlockIndex).join('\n').trim();
  const blockLines = lines.slice(firstBlockIndex);
  const segments: string[] = [];
  let current: string[] = [];
  blockLines.forEach((line) => {
    if (line.startsWith('## ') && current.length > 0) {
      segments.push(current.join('\n'));
      current = [line];
    } else {
      current.push(line);
    }
  });
  if (current.length > 0) segments.push(current.join('\n'));
  return { header: header || undefined, segments, mapped: segments.length === intentDoc.blocks.length };
}

export function IntentDocPanel({ intentDoc, findings }: IntentDocPanelProps) {
  const footnoteByBlockId = useReportStore((state) => state.footnoteByBlockId);
  const selectedFindingId = useReportStore((state) => state.selectedFindingId);
  const hoveredFindingId = useReportStore((state) => state.hoveredFindingId);
  const selectFinding = useReportStore((state) => state.selectFinding);
  const selectedFinding = findings.find((finding) => finding.findingId === selectedFindingId);
  const hoveredFinding = findings.find((finding) => finding.findingId === hoveredFindingId);
  const split = useMemo(() => splitIntentDoc(intentDoc), [intentDoc]);

  useEffect(() => {
    const blockId = selectedFinding?.intentBlockIds[0];
    if (!blockId) return;
    document.getElementById(blockId)?.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'nearest',
    });
  }, [selectedFinding]);

  const handleFootnoteClick = (blockId: string) => {
    const finding = findings.find((item) => item.intentBlockIds.includes(blockId));
    if (!finding) return;
    selectFinding(finding.findingId);
    document.getElementById(`finding-${finding.findingId}`)?.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'nearest',
    });
    announce(`${finding.summary} 선택됨`);
  };

  return (
    <aside className={styles.panel} aria-labelledby="intent-doc-title">
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <h2 id="intent-doc-title" className={styles.title}>의도 기준선(IntentDoc)</h2>
          <AIGeneratedBadge surface="intentDoc" />
        </div>
        <button
          type="button"
          className={styles.iconButton}
          aria-label="IntentDoc 내려받기"
          onClick={() => {
            downloadMarkdown('intent-doc.md', intentDoc.markdown);
            announce('다운로드를 시작했어요.');
          }}
        >
          ⬇
        </button>
      </header>
      <div className={styles.content}>
        {!split.mapped && (
          <p className={styles.notice}>블록 매핑을 사용할 수 없어 문서 전체를 표시해요.</p>
        )}
        {split.mapped ? (
          <>
            {split.header && <SanitizedMarkdown markdown={split.header} className={styles.markdown} />}
            {split.segments.map((segment, index) => {
              const blockId = intentDoc.blocks[index].blockId;
              const selected = selectedFinding?.intentBlockIds.includes(blockId) ?? false;
              const hovered = hoveredFinding?.intentBlockIds.includes(blockId) ?? false;
              return (
                <section
                  key={blockId}
                  id={blockId}
                  data-block-id={blockId}
                  className={`${styles.block} ${hovered ? styles.hoverHighlight : ''} ${selected ? styles.selectedHighlight : ''}`}
                >
                  <button type="button" className={styles.footnote} onClick={() => handleFootnoteClick(blockId)}>
                    [{footnoteByBlockId[blockId]}]
                  </button>
                  <SanitizedMarkdown markdown={segment} className={styles.markdown} />
                </section>
              );
            })}
          </>
        ) : (
          <section className={styles.block}>
            <SanitizedMarkdown markdown={intentDoc.markdown} className={styles.markdown} />
          </section>
        )}
      </div>
    </aside>
  );
}
