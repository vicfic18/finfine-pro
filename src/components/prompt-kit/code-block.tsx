'use client';

import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';
import { codeToHtml } from 'shiki';

export type CodeBlockProps = { children?: React.ReactNode; className?: string } & React.HTMLProps<HTMLDivElement>;
export function CodeBlock({ children, className, ...props }: CodeBlockProps) {
  return <div className={cn('not-prose flex w-full flex-col overflow-clip rounded-xl border border-neutral-200 bg-neutral-50 text-neutral-900', className)} {...props}>{children}</div>;
}

export type CodeBlockCodeProps = { code: string; language?: string; theme?: string; className?: string } & React.HTMLProps<HTMLDivElement>;
export function CodeBlockCode({ code, language = 'plaintext', theme = 'github-light', className, ...props }: CodeBlockCodeProps) {
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (!code) return () => { active = false; };
    codeToHtml(code, { lang: language, theme }).then((html) => { if (active) setHighlightedHtml(html); }).catch(() => { if (active) setHighlightedHtml(null); });
    return () => { active = false; };
  }, [code, language, theme]);
  const classNames = cn('w-full overflow-x-auto text-[13px] [&>pre]:px-4 [&>pre]:py-4', className);
  return highlightedHtml ? <div className={classNames} dangerouslySetInnerHTML={{ __html: highlightedHtml }} {...props} /> : <div className={classNames} {...props}><pre><code>{code}</code></pre></div>;
}

export function CodeBlockGroup({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center justify-between', className)} {...props}>{children}</div>;
}
