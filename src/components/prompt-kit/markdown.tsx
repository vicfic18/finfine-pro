'use client';

import { cn } from '@/lib/utils';
import { marked } from 'marked';
import { memo, useId, useMemo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import { CodeBlock, CodeBlockCode } from './code-block';

export type MarkdownProps = { children: string; id?: string; className?: string; components?: Partial<Components> };

function parseMarkdownIntoBlocks(markdown: string) { return marked.lexer(markdown).map((token) => token.raw); }
function extractLanguage(className?: string) { const match = className?.match(/language-(\w+)/); return match ? match[1] : 'plaintext'; }
const INITIAL_COMPONENTS: Partial<Components> = {
  code: function CodeComponent({ className, children, ...props }) {
    const isInline = !props.node?.position?.start.line || props.node.position.start.line === props.node.position.end.line;
    if (isInline) return <code className={cn('rounded bg-black/5 px-1 font-mono text-[0.9em]', className)} {...props}>{children}</code>;
    return <CodeBlock><CodeBlockCode code={String(children).replace(/\n$/, '')} language={extractLanguage(className)} /></CodeBlock>;
  },
  pre: ({ children }) => <>{children}</>,
};
const MemoizedMarkdownBlock = memo(({ content, components = INITIAL_COMPONENTS }: { content: string; components?: Partial<Components> }) => <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={components}>{content}</ReactMarkdown>, (previous, next) => previous.content === next.content);
MemoizedMarkdownBlock.displayName = 'MemoizedMarkdownBlock';
function MarkdownComponent({ children, id, className, components = INITIAL_COMPONENTS }: MarkdownProps) {
  const generatedId = useId();
  const blockId = id ?? generatedId;
  const blocks = useMemo(() => parseMarkdownIntoBlocks(children), [children]);
  return <div className={className}>{blocks.map((block, index) => <MemoizedMarkdownBlock key={`${blockId}-block-${index}`} content={block} components={components} />)}</div>;
}
export const Markdown = memo(MarkdownComponent);
Markdown.displayName = 'Markdown';
