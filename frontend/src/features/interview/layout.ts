import type { QuestionNode } from '../../shared/api/types';

export interface PositionedQuestionNode {
  node: QuestionNode;
  position: { x: number; y: number };
}

const X_GAP = 380;
const Y_GAP = 190;

function compareQuestion(a: QuestionNode, b: QuestionNode): number {
  const byDate = Date.parse(a.createdAt) - Date.parse(b.createdAt);
  if (Number.isFinite(byDate) && byDate !== 0) return byDate;
  return a.questionId.localeCompare(b.questionId);
}

export function flattenQuestionTree(nodes: QuestionNode[]): QuestionNode[] {
  const byParent = new Map<string | null, QuestionNode[]>();
  for (const node of nodes) {
    const siblings = byParent.get(node.parentId) ?? [];
    siblings.push(node);
    byParent.set(node.parentId, siblings);
  }
  for (const siblings of byParent.values()) siblings.sort(compareQuestion);

  const result: QuestionNode[] = [];
  const visit = (node: QuestionNode) => {
    result.push(node);
    for (const child of byParent.get(node.questionId) ?? []) visit(child);
  };
  for (const root of byParent.get(null) ?? [...nodes].sort(compareQuestion).filter((n) => !n.parentId)) {
    visit(root);
  }
  return result;
}

export function layoutQuestionTree(nodes: QuestionNode[]): PositionedQuestionNode[] {
  const byParent = new Map<string | null, QuestionNode[]>();
  for (const node of nodes) {
    const siblings = byParent.get(node.parentId) ?? [];
    siblings.push(node);
    byParent.set(node.parentId, siblings);
  }
  for (const siblings of byParent.values()) siblings.sort(compareQuestion);

  const positions = new Map<string, { x: number; y: number }>();
  let cursor = 0;

  const place = (node: QuestionNode): number => {
    const children = byParent.get(node.questionId) ?? [];
    const x = node.depth * X_GAP;
    if (children.length === 0) {
      const y = cursor * Y_GAP;
      cursor += 1;
      positions.set(node.questionId, { x, y });
      return y;
    }
    const childYs = children.map(place);
    const y = (childYs[0] + childYs[childYs.length - 1]) / 2;
    positions.set(node.questionId, { x, y });
    return y;
  };

  for (const root of byParent.get(null) ?? [...nodes].sort(compareQuestion).filter((n) => !n.parentId)) {
    place(root);
  }

  return nodes.map((node) => ({ node, position: positions.get(node.questionId) ?? { x: node.depth * X_GAP, y: 0 } }));
}

export function getChildren(nodes: QuestionNode[], parentId: string): QuestionNode[] {
  return nodes.filter((node) => node.parentId === parentId).sort(compareQuestion);
}
