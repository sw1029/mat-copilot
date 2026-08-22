import { create } from 'zustand';
import type { CompletedReason, QuestionNode } from '../shared/api/types';

// TRD/front.md §5.3~5.4 — 인터뷰 트리 상태. submitSeq로 오래된 응답 무시.

interface InterviewStoreState {
  nodes: QuestionNode[];
  activeQuestionId?: string;
  /** 답변 제출 직후 흐름 끝에 표시하는 스켈레톤의 부모 노드 */
  pendingSkeletonParentId?: string;
  remainingQuestions?: number | null;
  completedReason?: CompletedReason | null;
  /** 이번 세션에서 제출한 답변 원문 (memory only — localStorage 저장 금지) */
  answersByQuestionId: Record<string, string>;
  submitSeq: number;
  submitting: boolean;

  setTree(nodes: QuestionNode[]): void;
  mergeNodes(incoming: QuestionNode[]): void;
  markAnswered(questionId: string): void;
  recordAnswer(questionId: string, value: string): void;
  setActiveQuestion(questionId?: string): void;
  setPendingSkeleton(parentId?: string): void;
  setRemainingQuestions(count?: number | null): void;
  setCompletedReason(reason?: CompletedReason | null): void;
  nextSubmitSeq(): number;
  setSubmitting(submitting: boolean): void;
  reset(): void;
}

function pickActive(nodes: QuestionNode[]): string | undefined {
  const active = nodes.find((n) => n.status === 'ACTIVE');
  return active?.questionId;
}

export const useInterviewStore = create<InterviewStoreState>((set, get) => ({
  nodes: [],
  answersByQuestionId: {},
  submitSeq: 0,
  submitting: false,

  // 서버 트리 전체를 truth로 교체 (복구/재동기화)
  setTree(nodes) {
    set({ nodes, activeQuestionId: pickActive(nodes), pendingSkeletonParentId: undefined });
  },

  // 신규/갱신 노드를 questionId 기준 merge. 서버 QuestionStatus가 우선.
  mergeNodes(incoming) {
    const byId = new Map(get().nodes.map((n) => [n.questionId, n]));
    for (const node of incoming) {
      byId.set(node.questionId, node);
    }
    const merged = Array.from(byId.values());
    const nextActive = pickActive(incoming) ?? pickActive(merged);
    set({
      nodes: merged,
      activeQuestionId: nextActive,
      pendingSkeletonParentId: undefined,
    });
  },

  markAnswered(questionId) {
    set({
      nodes: get().nodes.map((n) =>
        n.questionId === questionId ? { ...n, status: 'ANSWERED' } : n,
      ),
    });
  },

  recordAnswer(questionId, value) {
    set({ answersByQuestionId: { ...get().answersByQuestionId, [questionId]: value } });
  },

  setActiveQuestion(activeQuestionId) {
    set({ activeQuestionId });
  },

  setPendingSkeleton(pendingSkeletonParentId) {
    set({ pendingSkeletonParentId });
  },

  setRemainingQuestions(remainingQuestions) {
    set({ remainingQuestions });
  },

  setCompletedReason(completedReason) {
    set({ completedReason });
  },

  nextSubmitSeq() {
    const seq = get().submitSeq + 1;
    set({ submitSeq: seq });
    return seq;
  },

  setSubmitting(submitting) {
    set({ submitting });
  },

  reset() {
    set({
      nodes: [],
      activeQuestionId: undefined,
      pendingSkeletonParentId: undefined,
      remainingQuestions: undefined,
      completedReason: undefined,
      answersByQuestionId: {},
      submitSeq: 0,
      submitting: false,
    });
  },
}));
