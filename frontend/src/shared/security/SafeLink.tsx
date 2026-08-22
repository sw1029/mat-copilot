import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { isSafeExternalUrl } from './sanitizeSchema';

// TRD/front.md §11.1 — reverse tabnabbing 방지. 외부 링크는 항상 noopener noreferrer.

interface SafeLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'target' | 'rel'> {
  href: string | undefined;
  children: ReactNode;
  /** URL이 안전하지 않을 때 표시할 대체 요소 */
  fallback?: ReactNode;
}

export function SafeLink({ href, children, fallback = null, ...rest }: SafeLinkProps) {
  if (!isSafeExternalUrl(href)) {
    return <>{fallback ?? children}</>;
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
      {children}
    </a>
  );
}
