import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { isSafeExternalUrl, markdownSanitizeSchema } from './sanitizeSchema';

// TRD ADR-003 — react-markdown + rehype-sanitize. dangerouslySetInnerHTML 금지.

interface SanitizedMarkdownProps {
  markdown: string;
  className?: string;
}

export const SanitizedMarkdown = memo(function SanitizedMarkdown({
  markdown,
  className,
}: SanitizedMarkdownProps) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, markdownSanitizeSchema]]}
        components={{
          a: ({ href, children }) =>
            isSafeExternalUrl(href) ? (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
});
