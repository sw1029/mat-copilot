import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  disableMockBackend,
  enableMockBackend,
  storeSessionId,
  storeToken,
} from '../apiClient';
import {
  cancelJob,
  completeInterview,
  createSession,
  getArtifacts,
  getInterviewTree,
  getJob,
  getReport,
  getReportCharts,
  getSession,
  startAnalysis,
  startInterview,
  submitAnswer,
  submitArtifactLink,
} from '../endpoints';
import { ApiClientError } from '../errors';
import type { AnalysisJob } from '../types';
import { createMockBackend } from './mockBackend';

// 샘플 체험(TC-E2E-01)이 의존하는 mock 백엔드의 SCHEMA v0.3 계약 검증

async function pollUntilTerminal(sessionId: string, jobId: string): Promise<AnalysisJob> {
  let etag: string | undefined;
  for (let i = 0; i < 100; i += 1) {
    const res = await getJob(sessionId, jobId, etag);
    if (!res.notModified) {
      etag = res.etag ?? etag;
      if (['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(res.data.status)) return res.data;
    }
  }
  throw new Error('job did not reach terminal state');
}

beforeEach(() => {
  localStorage.clear();
  enableMockBackend(createMockBackend({ latencyMs: 0 }));
});

afterEach(() => {
  disableMockBackend();
});

async function createAndAuth() {
  const created = await createSession();
  storeToken(created.sessionToken);
  storeSessionId(created.sessionId);
  return created;
}

describe('mockBackend 전체 여정 (홈→인터뷰→제출→분석→보고서)', () => {
  it('세션 생성 → 3문답 → 결과물 → 분석 → REPORT_READY', async () => {
    const created = await createAndAuth();
    expect(created.status).toBe('CREATED');
    expect(created.sessionToken).toBeTruthy();

    const first = await startInterview(created.sessionId);
    expect(first.length).toBeGreaterThan(0);
    expect(first[0].status).toBe('ACTIVE');
    expect(first[0].aiGenerated).toBe(true);

    // 질문 체인: 답변할 때마다 다음 ACTIVE 질문 도착, 마지막에 COMPLETED
    let active = first.find((q) => q.status === 'ACTIVE');
    let completed = false;
    for (let i = 0; i < 10 && active && !completed; i += 1) {
      const result = await submitAnswer(created.sessionId, {
        questionId: active.questionId,
        value: `${active.questionId}에 대한 답변입니다.`,
        requestFlag: false,
      });
      expect(result.answeredQuestionId).toBe(active.questionId);
      if (result.interviewStatus === 'COMPLETED') {
        completed = true;
        expect(result.completedReason).toBeTruthy();
      } else {
        active = result.nextQuestions.find((q) => q.status === 'ACTIVE');
      }
    }
    expect(completed).toBe(true);

    // 트리 복구 조회: 모든 질문 ANSWERED
    const tree = await getInterviewTree(created.sessionId);
    expect(tree.every((q) => q.status === 'ANSWERED')).toBe(true);

    // 결과물 제출 (링크형)
    const artifact = await submitArtifactLink(created.sessionId, 'LINK', 'https://example.com/demo');
    expect(artifact.artifactId).toBeTruthy();
    expect((await getArtifacts(created.sessionId)).length).toBe(1);

    // 분석 시작 → 폴링 → SUCCEEDED
    const jobStart = await startAnalysis(created.sessionId);
    expect(jobStart.kind).toBe('ANALYSIS');
    const terminal = await pollUntilTerminal(created.sessionId, jobStart.jobId);
    expect(terminal.status).toBe('SUCCEEDED');
    expect(terminal.completedStages).toContain('REPORT');

    // 세션 상태 REPORT_READY, 보고서/차트 조회 가능
    const sessionAfter = await getSession(created.sessionId);
    expect(sessionAfter.status).toBe('REPORT_READY');

    const report = await getReport(created.sessionId);
    expect(report.aiGeneratedNotice).toBe(true);
    expect(report.intentDoc.blocks.length).toBeGreaterThan(0);
    expect(report.findings.length).toBeGreaterThan(0);
    report.findings.forEach((f) => {
      expect(['LOW', 'MEDIUM', 'HIGH']).toContain(f.severity);
    });

    const charts = await getReportCharts(created.sessionId);
    expect(charts.length).toBeGreaterThan(0);
    charts.forEach((c) => expect(c.csv).toContain(','));
  });

  it('REQUIRED 미답변 + confirm=false → 409 REQUIRED_QUESTIONS_PENDING, confirm=true → 강행', async () => {
    const created = await createAndAuth();
    await startInterview(created.sessionId);

    try {
      await completeInterview(created.sessionId, false);
      expect.unreachable('409가 발생해야 한다');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiClientError);
      const vm = (error as ApiClientError).viewModel;
      expect(vm.code).toBe('REQUIRED_QUESTIONS_PENDING');
      expect(Array.isArray(vm.details?.pendingQuestionIds)).toBe(true);
      expect((vm.details?.pendingQuestionIds as string[]).length).toBeGreaterThan(0);
    }

    const forced = await completeInterview(created.sessionId, true);
    expect(forced.interviewStatus).toBe('COMPLETED');
    expect(forced.earlyCompleted).toBe(true);
  });

  it('보고서 준비 전 getReport는 오류를 반환한다', async () => {
    const created = await createAndAuth();
    await expect(getReport(created.sessionId)).rejects.toBeInstanceOf(ApiClientError);
  });

  it('실행 중 job은 취소할 수 있다', async () => {
    const created = await createAndAuth();
    await startInterview(created.sessionId);
    await completeInterview(created.sessionId, true);
    await submitArtifactLink(created.sessionId, 'LINK', 'https://example.com/x');
    const job = await startAnalysis(created.sessionId);
    const cancelled = await cancelJob(created.sessionId, job.jobId);
    expect(cancelled.status).toBe('CANCELLED');
  });
});
