import { createSession, submitArtifactFile } from '../../shared/api/endpoints';
import { enableMockBackend, isMockBackendEnabled } from '../../shared/api/apiClient';
import { createMockBackend } from '../../shared/api/mock/mockBackend';
import { asErrorViewModel } from '../../shared/api/errors';
import type { SessionCreated } from '../../shared/api/types';
import {
  SAMPLE_ANSWERS,
  SAMPLE_ARTIFACT_MARKDOWN,
  SAMPLE_ARTIFACT_NAME,
} from '../../tests/fixtures/sampleData';

// TRD/front.md §7.1/§7.2 — "샘플로 체험" 데모 경로.
// 실제 백엔드로 세션 생성을 시도하고, 도달 불가하면 번들 mock 백엔드로 전환해 계속 진행한다.

const NETWORK_FAILURE_CODES = new Set(['NETWORK_ERROR', 'TIMEOUT', 'INTERNAL', 'LLM_UPSTREAM_ERROR', 'PARSE_ERROR']);

export async function createSessionWithSampleFallback(): Promise<{
  session: SessionCreated;
  usedMock: boolean;
}> {
  if (isMockBackendEnabled()) {
    const session = await createSession();
    return { session, usedMock: true };
  }
  try {
    const session = await createSession();
    return { session, usedMock: false };
  } catch (error) {
    const vm = asErrorViewModel(error);
    if (!NETWORK_FAILURE_CODES.has(vm.code)) throw error;
    enableMockBackend(createMockBackend());
    const session = await createSession();
    return { session, usedMock: true };
  }
}

/** 샘플 모드에서 질문별 자동 답변을 조회한다. */
export function getSampleAnswer(questionId: string): string | undefined {
  return SAMPLE_ANSWERS[questionId];
}

/** 샘플 결과물(README) 파일을 생성해 제출한다. */
export async function submitSampleArtifact(sessionId: string) {
  const file = new File([SAMPLE_ARTIFACT_MARKDOWN], SAMPLE_ARTIFACT_NAME, {
    type: 'text/markdown',
  });
  return submitArtifactFile(sessionId, file);
}
