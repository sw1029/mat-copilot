import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SanitizedMarkdown } from './SanitizedMarkdown';

describe('SanitizedMarkdown (TRD §11.2 XSS 방어)', () => {
  it('script 태그를 제거한다', () => {
    const { container } = render(
      <SanitizedMarkdown markdown={'본문입니다\n\n<script>window.hacked=1</script>'} />,
    );
    expect(container.querySelector('script')).toBeNull();
    expect(screen.getByText('본문입니다')).toBeInTheDocument();
  });

  it('iframe/객체 삽입 태그를 제거한다', () => {
    const { container } = render(
      <SanitizedMarkdown markdown={'<iframe src="https://evil.example"></iframe>\n\n안전 텍스트'} />,
    );
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.querySelector('object')).toBeNull();
  });

  it('이벤트 핸들러 속성을 제거한다', () => {
    const { container } = render(
      <SanitizedMarkdown markdown={'<img src="x" onerror="window.hacked=1" alt="x" />'} />,
    );
    const img = container.querySelector('img');
    if (img) expect(img.getAttribute('onerror')).toBeNull();
  });

  it('javascript: 링크를 무력화한다', () => {
    const { container } = render(
      <SanitizedMarkdown markdown={'[클릭](javascript:alert(1))'} />,
    );
    const link = container.querySelector('a[href^="javascript"]');
    expect(link).toBeNull();
  });

  it('https 링크는 새 탭 + noopener noreferrer로 렌더한다', () => {
    render(<SanitizedMarkdown markdown={'[문서](https://example.com/doc)'} />);
    const link = screen.getByRole('link', { name: /문서/ });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.getAttribute('rel')).toContain('noreferrer');
  });

  it('일반 마크다운(제목/목록/강조)은 정상 렌더한다', () => {
    render(<SanitizedMarkdown markdown={'## 섹션\n\n- 항목 하나\n- **강조** 항목'} />);
    expect(screen.getByRole('heading', { level: 2, name: '섹션' })).toBeInTheDocument();
    expect(screen.getByText('항목 하나')).toBeInTheDocument();
  });
});
