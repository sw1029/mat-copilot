import { create } from 'zustand';
import type { Artifact, ChartSpec, IntentDoc, Report } from '../shared/api/types';

// TRD/front.md §5.3 — 결과 화면 상태. footnote 번호는 blockId 오름차순으로 프론트 파생 (§7.8).

interface ReportStoreState {
  intentDoc?: IntentDoc;
  artifacts: Artifact[];
  report?: Report;
  charts: ChartSpec[];
  footnoteByBlockId: Record<string, number>;
  selectedFindingId?: string;
  hoveredFindingId?: string;

  setArtifacts(artifacts: Artifact[]): void;
  addArtifact(artifact: Artifact): void;
  setReport(report: Report): void;
  setCharts(charts: ChartSpec[]): void;
  selectFinding(findingId?: string): void;
  hoverFinding(findingId?: string): void;
  reset(): void;
}

/** blockId("ib-<seq>")를 seq 숫자 오름차순 정렬해 1부터 각주 번호를 파생한다. */
export function deriveFootnotes(intentDoc: IntentDoc | undefined): Record<string, number> {
  if (!intentDoc) return {};
  const seq = (blockId: string) => {
    const match = /^ib-(\d+)$/.exec(blockId);
    return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
  };
  const sorted = [...intentDoc.blocks].sort((a, b) => seq(a.blockId) - seq(b.blockId));
  const map: Record<string, number> = {};
  sorted.forEach((block, index) => {
    map[block.blockId] = index + 1;
  });
  return map;
}

export const useReportStore = create<ReportStoreState>((set, get) => ({
  artifacts: [],
  charts: [],
  footnoteByBlockId: {},

  setArtifacts(artifacts) {
    set({ artifacts });
  },

  addArtifact(artifact) {
    set({ artifacts: [...get().artifacts, artifact] });
  },

  setReport(report) {
    set({
      report,
      intentDoc: report.intentDoc,
      footnoteByBlockId: deriveFootnotes(report.intentDoc),
    });
  },

  setCharts(charts) {
    set({ charts });
  },

  selectFinding(selectedFindingId) {
    set({ selectedFindingId });
  },

  hoverFinding(hoveredFindingId) {
    set({ hoveredFindingId });
  },

  reset() {
    set({
      intentDoc: undefined,
      artifacts: [],
      report: undefined,
      charts: [],
      footnoteByBlockId: {},
      selectedFindingId: undefined,
      hoveredFindingId: undefined,
    });
  },
}));
