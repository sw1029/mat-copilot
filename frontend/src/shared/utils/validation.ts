// SCHEMA v0.3 §4.1 프론트·백 공유 검증 상수 (요청 전 사전 검증)

export const PLAN_ALLOWED_EXTENSIONS = ['.docx', '.txt', '.md'] as const;
export const PLAN_MAX_BYTES = 10 * 1024 * 1024; // 10MB

export const ARTIFACT_FILE_MAX_BYTES = 20 * 1024 * 1024; // 20MB
export const ARTIFACT_MAX_COUNT = 20; // 세션당 20건
export const ZIP_SAFE_TOTAL_BYTES = 100 * 1024 * 1024; // 해제 후 100MB
export const ZIP_SAFE_MAX_ENTRIES = 1000;

export const ANSWER_MAX_LENGTH = 2000;

export const CONFUSE_THRESHOLD_MIN = 0;
export const CONFUSE_THRESHOLD_MAX = 1;
export const CONFUSE_THRESHOLD_STEP = 0.05;

export const TIME_LIMIT_SEC_MIN = 60;
export const TIME_LIMIT_SEC_MAX = 3600;

export interface ValidationResult {
  valid: boolean;
  message?: string;
}

const ok: ValidationResult = { valid: true };

export function getFileExtension(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx).toLowerCase() : '';
}

export function validatePlanFile(file: { name: string; size: number }): ValidationResult {
  const ext = getFileExtension(file.name);
  if (!(PLAN_ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
    return { valid: false, message: '기획안은 docx/txt/md, 10MB 이하만 업로드할 수 있어요.' };
  }
  if (file.size > PLAN_MAX_BYTES) {
    return { valid: false, message: '기획안은 docx/txt/md, 10MB 이하만 업로드할 수 있어요.' };
  }
  return ok;
}

export function validateArtifactFile(
  file: { name: string; size: number },
  currentCount: number,
): ValidationResult {
  if (currentCount >= ARTIFACT_MAX_COUNT) {
    return { valid: false, message: '결과물은 파일당 20MB, 최대 20건까지 제출할 수 있어요.' };
  }
  if (file.size > ARTIFACT_FILE_MAX_BYTES) {
    return { valid: false, message: '결과물은 파일당 20MB, 최대 20건까지 제출할 수 있어요.' };
  }
  return ok;
}

export function validateAnswer(value: string): ValidationResult {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { valid: false, message: '답변을 입력해 주세요. 공백만으로는 제출할 수 없어요.' };
  }
  if (value.length > ANSWER_MAX_LENGTH) {
    return { valid: false, message: '답변은 2,000자 이내로 입력해 주세요.' };
  }
  return ok;
}

export function validateHttpsUrl(url: string): ValidationResult {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') {
      return { valid: false, message: 'https 링크만 분석할 수 있어요.' };
    }
    return ok;
  } catch {
    return { valid: false, message: 'https 링크만 분석할 수 있어요.' };
  }
}

export function validateGithubUrl(url: string): ValidationResult {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com') {
      return { valid: false, message: 'GitHub 결과물은 github.com 주소만 지원해요.' };
    }
    return ok;
  } catch {
    return { valid: false, message: 'GitHub 결과물은 github.com 주소만 지원해요.' };
  }
}

export function clampConfuseThreshold(value: number): number {
  const clamped = Math.min(CONFUSE_THRESHOLD_MAX, Math.max(CONFUSE_THRESHOLD_MIN, value));
  return Math.round(clamped / CONFUSE_THRESHOLD_STEP) * CONFUSE_THRESHOLD_STEP;
}

export function validateTimeLimitSec(value: number | null): ValidationResult {
  if (value === null) return ok;
  if (value < TIME_LIMIT_SEC_MIN || value > TIME_LIMIT_SEC_MAX) {
    return { valid: false, message: '시간 제한은 60초에서 3,600초 사이로 설정해 주세요.' };
  }
  return ok;
}
