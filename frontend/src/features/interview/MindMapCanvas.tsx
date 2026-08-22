import { useEffect, useMemo, useState, memo, type CSSProperties } from 'react';
import { Background, BackgroundVariant, Controls, ReactFlow, useReactFlow, type Edge, type Node, type NodeTypes } from '@xyflow/react';
import type { QuestionNode } from '../../shared/api/types';
import { Skeleton } from '../../shared/ui/Skeleton';
import { announce } from '../../shared/a11y/liveRegion';
import { flattenQuestionTree, getChildren, layoutQuestionTree } from './layout';
import { PendingSkeletonNode, QuestionFlowNode, type InterviewFlowNode, type QuestionNodeData } from './QuestionFlowNode';
import styles from './MindMapCanvas.module.css';

interface MindMapCanvasProps {
  nodes: QuestionNode[];
  activeQuestionId?: string;
  pendingSkeletonParentId?: string;
  skeletonOverdue: boolean;
  answersByQuestionId: Record<string, string>;
  submitting: boolean;
  draftByQuestionId: Record<string, string>;
  sampleMode: boolean;
  onDraftChange: (questionId: string, value: string) => void;
  onSubmit: (question: QuestionNode, value: string, requestFlag: boolean) => Promise<boolean>;
  onSampleNoAnswer: () => Promise<void>;
}

interface SkeletonData extends Record<string, unknown> { overdue: boolean; }
type SkeletonFlowNode = Node<SkeletonData, 'pendingSkeleton'>;

const SkeletonNode = memo(({ data }: { data: SkeletonData }) => <PendingSkeletonNode overdue={data.overdue} />);

const nodeTypes: NodeTypes = {
  question: QuestionFlowNode,
  pendingSkeleton: SkeletonNode,
};

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function focusActiveTextarea(questionId: string): void {
  window.setTimeout(() => {
    document.querySelector<HTMLTextAreaElement>(`[data-question-textarea="${CSS.escape(questionId)}"]`)?.focus();
  }, 80);
}

export function MindMapCanvas({
  nodes,
  activeQuestionId,
  pendingSkeletonParentId,
  skeletonOverdue,
  answersByQuestionId,
  submitting,
  draftByQuestionId,
  sampleMode,
  onDraftChange,
  onSubmit,
  onSampleNoAnswer,
}: MindMapCanvasProps) {
  const reactFlow = useReactFlow();
  const [focusedNodeId, setFocusedNodeId] = useState<string | undefined>(activeQuestionId ?? nodes[0]?.questionId);
  const visualNodes = useMemo(() => flattenQuestionTree(nodes), [nodes]);

  const flowNodes = useMemo(() => {
    const positioned: Array<InterviewFlowNode | SkeletonFlowNode> = layoutQuestionTree(nodes).map<InterviewFlowNode>(({ node, position }) => ({
      id: node.questionId,
      type: 'question',
      position,
      data: {
        question: node,
        answer: answersByQuestionId[node.questionId],
        submitting,
        draft: draftByQuestionId[node.questionId],
        sampleMode,
        onDraftChange,
        onSubmit,
        onSampleNoAnswer,
      } satisfies QuestionNodeData,
    }));
    if (pendingSkeletonParentId) {
      const parent = positioned.find((item) => item.id === pendingSkeletonParentId);
      const parentNode = nodes.find((node) => node.questionId === pendingSkeletonParentId);
      positioned.push({
        id: `pending-${pendingSkeletonParentId}`,
        type: 'pendingSkeleton',
        position: { x: (parent?.position.x ?? 0) + 380, y: parent?.position.y ?? 0 },
        data: { overdue: skeletonOverdue },
      } as SkeletonFlowNode);
      if (parentNode) {
        // edge is created below with the same synthetic id
      }
    }
    return positioned;
  }, [answersByQuestionId, draftByQuestionId, nodes, onDraftChange, onSampleNoAnswer, onSubmit, pendingSkeletonParentId, sampleMode, skeletonOverdue, submitting]);

  const edges = useMemo<Edge[]>(() => {
    const result: Edge[] = nodes
      .filter((node) => node.parentId)
      .map((node) => ({
        id: `${node.parentId}-${node.questionId}`,
        source: node.parentId as string,
        target: node.questionId,
        type: 'smoothstep',
        style: { stroke: 'var(--color-primary-300)', strokeWidth: 2 },
      }));
    if (pendingSkeletonParentId) {
      result.push({
        id: `${pendingSkeletonParentId}-pending`,
        source: pendingSkeletonParentId,
        target: `pending-${pendingSkeletonParentId}`,
        type: 'smoothstep',
        style: { stroke: 'var(--color-primary-300)', strokeWidth: 2, strokeDasharray: '6 4' } satisfies CSSProperties,
      });
    }
    return result;
  }, [nodes, pendingSkeletonParentId]);

  const fitToNode = (id: string, focusTextarea = false) => {
    reactFlow.fitView({ nodes: [{ id }], duration: prefersReducedMotion() ? 0 : 400, maxZoom: 1 });
    setFocusedNodeId(id);
    if (focusTextarea) focusActiveTextarea(id);
  };

  useEffect(() => {
    if (!activeQuestionId) return;
    fitToNode(activeQuestionId, true);
    const active = nodes.find((node) => node.questionId === activeQuestionId);
    if (active?.kind === 'REQUIRED') announce('새 필수 질문이 도착했어요.');
  }, [activeQuestionId]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLButtonElement || event.target instanceof HTMLInputElement) return;
    const current = focusedNodeId ?? activeQuestionId ?? visualNodes[0]?.questionId;
    if (!current) return;
    const index = visualNodes.findIndex((node) => node.questionId === current);
    const currentNode = visualNodes[index];
    let nextId: string | undefined;
    if (event.key === 'ArrowDown') nextId = visualNodes[Math.min(index + 1, visualNodes.length - 1)]?.questionId;
    if (event.key === 'ArrowUp') nextId = visualNodes[Math.max(index - 1, 0)]?.questionId;
    if (event.key === 'ArrowLeft') nextId = currentNode?.parentId ?? current;
    if (event.key === 'ArrowRight' && currentNode) nextId = getChildren(nodes, currentNode.questionId)[0]?.questionId ?? current;
    if (event.key === 'Home') nextId = visualNodes[0]?.questionId;
    if (event.key === 'End') nextId = activeQuestionId ?? visualNodes[visualNodes.length - 1]?.questionId;
    if (event.key === 'Enter' && current === activeQuestionId) {
      event.preventDefault();
      focusActiveTextarea(current);
      return;
    }
    if (nextId) {
      event.preventDefault();
      fitToNode(nextId);
    }
  };

  if (flowNodes.length === 0) {
    return <div className={styles.wrapper}><Skeleton width="260px" height="24px" label="질문 흐름을 준비하는 중" /></div>;
  }

  return (
    <div className={styles.wrapper} tabIndex={0} onKeyDown={onKeyDown} aria-label="질문 마인드맵 캔버스">
      <p className="sr-only">마인드맵 조작이 어려우면 툴바의 리스트 뷰를 사용하세요.</p>
      <ReactFlow
        className={styles.flow}
        nodes={flowNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        panOnDrag
        zoomOnScroll
        fitView
        minZoom={0.35}
        maxZoom={1.2}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1.2} color="var(--color-primary-200)" />
        <Controls showInteractive={false} />
      </ReactFlow>
      <span className={styles.focusHint} aria-hidden="true">방향키로 노드 이동 · Enter로 답변 입력</span>
    </div>
  );
}
