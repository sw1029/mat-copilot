import { describe, expect, it } from 'vitest';
import {
  ANSWER_MAX_LENGTH,
  clampConfuseThreshold,
  validateAnswer,
  validateArtifactFile,
  validateGithubUrl,
  validateHttpsUrl,
  validatePlanFile,
  validateTimeLimitSec,
} from './validation';

describe('validatePlanFile (SCHEMA §4.1)', () => {
  it('docx/txt/md 10MB 이하만 허용', () => {
    expect(validatePlanFile({ name: 'plan.docx', size: 1024 }).valid).toBe(true);
    expect(validatePlanFile({ name: 'PLAN.MD', size: 1024 }).valid).toBe(true);
    expect(validatePlanFile({ name: 'plan.txt', size: 10 * 1024 * 1024 }).valid).toBe(true);
  });
  it('허용 외 확장자/초과 용량 거부 + 문서 문구', () => {
    const badExt = validatePlanFile({ name: 'plan.pdf', size: 10 });
    expect(badExt.valid).toBe(false);
    expect(badExt.message).toBe('기획안은 docx/txt/md, 10MB 이하만 업로드할 수 있어요.');
    expect(validatePlanFile({ name: 'plan.md', size: 10 * 1024 * 1024 + 1 }).valid).toBe(false);
  });
});

describe('validateArtifactFile', () => {
  it('20MB 이하, 20건 미만이면 허용', () => {
    expect(validateArtifactFile({ name: 'a.zip', size: 20 * 1024 * 1024 }, 19).valid).toBe(true);
  });
  it('건수 한도/용량 초과 거부', () => {
    expect(validateArtifactFile({ name: 'a.md', size: 10 }, 20).valid).toBe(false);
    expect(validateArtifactFile({ name: 'a.md', size: 20 * 1024 * 1024 + 1 }, 0).valid).toBe(false);
  });
});

describe('validateAnswer', () => {
  it('공백만은 거부', () => {
    expect(validateAnswer('   ').valid).toBe(false);
    expect(validateAnswer('').valid).toBe(false);
  });
  it('2,000자 경계: 2000 허용, 2001 거부', () => {
    expect(validateAnswer('a'.repeat(ANSWER_MAX_LENGTH)).valid).toBe(true);
    const over = validateAnswer('a'.repeat(ANSWER_MAX_LENGTH + 1));
    expect(over.valid).toBe(false);
    expect(over.message).toBe('답변은 2,000자 이내로 입력해 주세요.');
  });
});

describe('URL 검증 (§11.3)', () => {
  it('https만 허용', () => {
    expect(validateHttpsUrl('https://example.com/x').valid).toBe(true);
    expect(validateHttpsUrl('http://example.com').valid).toBe(false);
    expect(validateHttpsUrl('notaurl').valid).toBe(false);
  });
  it('GitHub는 github.com 호스트만', () => {
    expect(validateGithubUrl('https://github.com/org/repo').valid).toBe(true);
    expect(validateGithubUrl('https://gitlab.com/org/repo').valid).toBe(false);
    expect(validateGithubUrl('http://github.com/org/repo').valid).toBe(false);
  });
});

describe('설정 범위', () => {
  it('confuseThreshold는 0~1 범위로 클램프 + 0.05 스텝 스냅', () => {
    expect(clampConfuseThreshold(-0.5)).toBe(0);
    expect(clampConfuseThreshold(1.7)).toBe(1);
    expect(clampConfuseThreshold(0.07)).toBeCloseTo(0.05, 10);
    expect(clampConfuseThreshold(0.33)).toBeCloseTo(0.35, 10);
  });
  it('timeLimitSec: null 허용, 60~3600 경계', () => {
    expect(validateTimeLimitSec(null).valid).toBe(true);
    expect(validateTimeLimitSec(60).valid).toBe(true);
    expect(validateTimeLimitSec(3600).valid).toBe(true);
    expect(validateTimeLimitSec(59).valid).toBe(false);
    expect(validateTimeLimitSec(3601).valid).toBe(false);
  });
});
