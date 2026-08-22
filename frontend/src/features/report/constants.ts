import type { Confidence, Finding, Severity, ThemeType } from '../../shared/api/types';

export const THEME_LABELS: Record<Exclude<ThemeType, 'DYNAMIC'>, string> = {
  REQUIREMENT_OMISSION: '요구 누락',
  INTENT_DISTORTION: '의도 왜곡',
  HALLUCINATION: '할루시네이션',
  SCOPE_CREEP: '범위 초과',
};

export const SEVERITY_LABELS: Record<Severity, string> = {
  HIGH: '높음',
  MEDIUM: '중간',
  LOW: '낮음',
};

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  HIGH: '신뢰도 높음',
  MEDIUM: '신뢰도 중간',
  LOW: '신뢰도 낮음',
};

export function getThemeLabel(finding: Pick<Finding, 'theme' | 'dynamicThemeName'>): string {
  return finding.theme === 'DYNAMIC'
    ? (finding.dynamicThemeName ?? '동적 테마')
    : THEME_LABELS[finding.theme];
}

export function themeFromLabel(label: string): ThemeType | undefined {
  const normalized = label.trim();
  const entry = Object.entries(THEME_LABELS).find(([, value]) => value === normalized);
  return entry?.[0] as ThemeType | undefined;
}
