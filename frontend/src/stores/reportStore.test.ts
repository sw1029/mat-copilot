import { describe, expect, it } from 'vitest';
import type { IntentDoc, Report } from '../shared/api/types';
import { deriveFootnotes, useReportStore } from './reportStore';

function intentDoc(blockIds: string[]): IntentDoc {
  return {
    markdown: '# 문서',
    blocks: blockIds.map((blockId) => ({ blockId, intentIds: [] })),
  };
}

describe('deriveFootnotes (TRD §7.8)', () => {
  it('blockId seq 숫자 오름차순으로 1부터 번호를 매긴다', () => {
    const map = deriveFootnotes(intentDoc(['ib-3', 'ib-1', 'ib-2']));
    expect(map).toEqual({ 'ib-1': 1, 'ib-2': 2, 'ib-3': 3 });
  });

  it('ib-10은 ib-2보다 뒤 (문자열 정렬이 아닌 숫자 정렬)', () => {
    const map = deriveFootnotes(intentDoc(['ib-10', 'ib-2']));
    expect(map['ib-2']).toBe(1);
    expect(map['ib-10']).toBe(2);
  });

  it('패턴 불일치 blockId는 마지막 순번으로 밀린다', () => {
    const map = deriveFootnotes(intentDoc(['weird', 'ib-1']));
    expect(map['ib-1']).toBe(1);
    expect(map['weird']).toBe(2);
  });

  it('intentDoc 없으면 빈 맵', () => {
    expect(deriveFootnotes(undefined)).toEqual({});
  });
});

describe('useReportStore', () => {
  it('setReport 시 intentDoc과 각주 맵을 자동 파생한다', () => {
    const report = {
      reportId: 'r-1',
      sessionId: 's-1',
      aiGeneratedNotice: true,
      intentDoc: intentDoc(['ib-2', 'ib-1']),
      metrics: [],
      quantStats: { totalIntents: 0, coveredIntents: 0, driftCount: 0, countsByTheme: [], countsBySeverity: [] },
      qualitative: '',
      suggestions: [],
      findings: [],
      normalizationSchema: { version: 'v1', intents: [] },
      createdAt: '2026-01-01T00:00:00Z',
    } as unknown as Report;

    useReportStore.getState().setReport(report);
    const state = useReportStore.getState();
    expect(state.report).toBe(report);
    expect(state.intentDoc).toBe(report.intentDoc);
    expect(state.footnoteByBlockId).toEqual({ 'ib-1': 1, 'ib-2': 2 });
  });

  it('선택/호버는 독립적으로 토글되고 reset으로 초기화된다', () => {
    const store = useReportStore.getState();
    store.selectFinding('f-1');
    store.hoverFinding('f-2');
    expect(useReportStore.getState().selectedFindingId).toBe('f-1');
    expect(useReportStore.getState().hoveredFindingId).toBe('f-2');

    store.selectFinding(undefined);
    expect(useReportStore.getState().selectedFindingId).toBeUndefined();

    store.reset();
    const after = useReportStore.getState();
    expect(after.report).toBeUndefined();
    expect(after.footnoteByBlockId).toEqual({});
    expect(after.artifacts).toEqual([]);
  });
});
