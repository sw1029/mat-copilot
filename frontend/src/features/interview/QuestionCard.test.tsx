import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuestionNode } from '../../shared/api/types';
import { QuestionCard } from './QuestionCard';

function question(overrides: Partial<QuestionNode> = {}): QuestionNode {
  return {
    questionId: 'q-test',
    parentId: null,
    depth: 0,
    prompt: '핵심 가치는 무엇인가요?',
    helperText: '한 문장으로 표현해 보세요.',
    kind: 'REQUIRED',
    status: 'ACTIVE',
    inputType: 'text',
    aiGenerated: true,
    intentPhase: 'INITIAL',
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderCard(onSubmit = vi.fn().mockResolvedValue(true)) {
  const props = {
    question: question(),
    submitting: false,
    draft: undefined,
    sampleMode: false,
    onDraftChange: vi.fn(),
    onSubmit,
    onSampleNoAnswer: vi.fn().mockResolvedValue(undefined),
  };
  render(<QuestionCard {...props} />);
  return props;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('QuestionCard (TRD §7.3~7.4)', () => {
  it('prompt/helperText/글자수 카운터를 렌더한다', () => {
    renderCard();
    expect(screen.getByRole('heading', { name: '핵심 가치는 무엇인가요?' })).toBeInTheDocument();
    expect(screen.getByText('한 문장으로 표현해 보세요.')).toBeInTheDocument();
    expect(screen.getByText('0/2,000')).toBeInTheDocument();
  });

  it('빈 답변이면 제출 버튼이 비활성화된다', () => {
    renderCard();
    expect(screen.getByRole('button', { name: '답변 제출' })).toBeDisabled();
  });

  it('입력하면 카운터가 갱신되고 제출 버튼이 활성화된다', async () => {
    renderCard();
    await userEvent.type(screen.getByLabelText('답변'), '여행 일정 공유');
    expect(screen.getByText('8/2,000')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '답변 제출' })).toBeEnabled();
  });

  it('제출 클릭 시 onSubmit에 값과 requestFlag를 전달한다', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true);
    renderCard(onSubmit);
    await userEvent.type(screen.getByLabelText('답변'), '답변입니다');
    await userEvent.click(screen.getByRole('checkbox', { name: /더 구체적으로/ }));
    await userEvent.click(screen.getByRole('button', { name: '답변 제출' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const [q, value, flag] = onSubmit.mock.calls[0];
    expect(q.questionId).toBe('q-test');
    expect(value).toBe('답변입니다');
    expect(flag).toBe(true);
  });

  it('Ctrl+Enter로 제출한다 (Enter 단독은 줄바꿈)', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true);
    renderCard(onSubmit);
    const textarea = screen.getByLabelText('답변');
    await userEvent.type(textarea, '첫 줄{Enter}둘째 줄');
    expect(onSubmit).not.toHaveBeenCalled();
    await userEvent.type(textarea, '{Control>}{Enter}{/Control}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][1]).toContain('둘째 줄');
  });

  it('제출 실패(onSubmit=false) 시 입력이 보존된다', async () => {
    const onSubmit = vi.fn().mockResolvedValue(false);
    renderCard(onSubmit);
    const textarea = screen.getByLabelText('답변');
    await userEvent.type(textarea, '보존되어야 하는 답변');
    await userEvent.click(screen.getByRole('button', { name: '답변 제출' }));
    expect(textarea).toHaveValue('보존되어야 하는 답변');
  });
});
