import { defaultSchema } from 'rehype-sanitize';

// TRD/front.md §11.2 — Markdown sanitize allowlist.
// 허용: p, br, strong, em, code, pre, ul, ol, li, blockquote, h1~h4, table류, a
// 금지: script, iframe, object, embed, style, form, input, button, inline handler,
//        javascript:/data:/vbscript: URL

export const markdownSanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    'p',
    'br',
    'strong',
    'em',
    'code',
    'pre',
    'ul',
    'ol',
    'li',
    'blockquote',
    'h1',
    'h2',
    'h3',
    'h4',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
    'a',
    'del',
    'hr',
  ],
  attributes: {
    a: [['href' /* protocol allowlist below */], ['title']],
    code: [['className', /^language-./]],
    th: [['align']],
    td: [['align']],
  },
  protocols: {
    href: ['https', 'mailto'],
  },
  clobberPrefix: 'md-',
  strip: ['script', 'style'],
} as typeof defaultSchema;

/** 외부 링크 허용 여부: https만 (TRD §7.8) */
export function isSafeExternalUrl(url: string | undefined): url is string {
  if (!url) return false;
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}
