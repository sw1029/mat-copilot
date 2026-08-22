import type { EvidenceLocation, EvidenceRef, Finding, Report } from '../../shared/api/types';
import { getThemeLabel, SEVERITY_LABELS } from './constants';

export function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

export function evidenceLocationText(location: EvidenceLocation): string {
  if (location.kind === 'file' && location.path) {
    const lines = location.startLine
      ? `:${location.startLine}${location.endLine ? `-${location.endLine}` : ''}`
      : '';
    return `${location.path}${lines}`;
  }
  if ((location.kind === 'web' || location.kind === 'github') && location.url) return location.url;
  return location.note ?? '위치 정보 없음';
}

function evidenceMarkdown(evidence: EvidenceRef): string {
  return `> ${evidence.quote} (${evidenceLocationText(evidence.location)})`;
}

export function composeReportMarkdown(report: Report): string {
  const early = report.earlyCompleted
    ? '> 인터뷰가 조기 종료되어 일부 의도가 덜 구체화되었을 수 있어요.\n\n'
    : '';
  const suggestions = report.suggestions.length > 0
    ? report.suggestions.map((suggestion) => `- ${suggestion}`).join('\n')
    : '- 제안 없음';
  const findings = report.findings.length > 0
    ? report.findings
        .map((finding: Finding) => {
          const evidence = finding.evidence.length > 0
            ? finding.evidence.map(evidenceMarkdown).join('\n')
            : '- 근거 없음';
          const suggestion = finding.suggestion ? `\n제안: ${finding.suggestion}` : '';
          return `### [${SEVERITY_LABELS[finding.severity]}] ${getThemeLabel(finding)} — ${finding.summary}\n${finding.detail}\n\n근거:\n${evidence}${suggestion}`;
        })
        .join('\n\n')
    : '발견된 drift가 없어요.';

  return `# 분석 보고서\n\n${early}${report.qualitative}\n\n## 개선 제안\n${suggestions}\n\n## Findings\n${findings}\n`;
}
