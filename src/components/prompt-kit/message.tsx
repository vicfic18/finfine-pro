'use client';

import { Bot, RotateCcw } from 'lucide-react';
import type { HTMLProps, ReactNode } from 'react';
import { ChainOfThought, ChainOfThoughtStep, type ChainOfThoughtStepData } from '@/components/prompt-kit/chain-of-thought';
import { Markdown } from '@/components/prompt-kit/markdown';

export type ChatMessageRole = 'user' | 'assistant';
export type ChatMessageStatus = 'pending' | 'complete' | 'failed' | 'cancelled';

export interface ChatMessageData {
  id: string;
  role: ChatMessageRole;
  content: string;
  status: ChatMessageStatus;
  createdAt: number;
  requestId?: string;
  steps?: ChainOfThoughtStepData[];
}

export type MessageProps = { children: ReactNode; className?: string } & HTMLProps<HTMLDivElement>;
export function Message({ children, className, ...props }: MessageProps) {
  return <div className={`flex gap-3 ${className ?? ''}`} {...props}>{children}</div>;
}

export function MessageAvatar({ fallback = 'F', className }: { src?: string; alt?: string; fallback?: ReactNode; className?: string }) {
  return <div className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-xs font-semibold text-muted-foreground shadow-sm ${className ?? ''}`}>{fallback}</div>;
}

export function MessageContent({ children, className, ...props }: { children: ReactNode; className?: string } & HTMLProps<HTMLDivElement>) {
  return <div className={`rounded-2xl rounded-bl-md border border-border bg-card px-4 py-3 text-sm text-card-foreground shadow-sm ${className ?? ''}`} {...props}>{children}</div>;
}

export function MessageActions({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`mt-2 flex items-center gap-2 text-xs text-neutral-500 ${className ?? ''}`}>{children}</div>;
}

export function MessageAction({ children, tooltip }: { children: ReactNode; tooltip?: ReactNode }) {
  return <span title={typeof tooltip === 'string' ? tooltip : undefined}>{children}</span>;
}

export function ChatMessage({ message, onRetry }: { message: ChatMessageData; onRetry?: (message: ChatMessageData) => void }) {
  const isUser = message.role === 'user';
  const canRetry = !isUser && (message.status === 'failed' || message.status === 'cancelled') && Boolean(onRetry);
  return (
    <Message className={`w-full ${isUser ? 'justify-end' : 'justify-start'}`} aria-label={`${isUser ? 'You' : 'FinFine'} message`}>
      {!isUser && <MessageAvatar fallback={<Bot size={16} strokeWidth={1.8} />} />}
      <div className={`flex max-w-[min(88%,42rem)] flex-col ${isUser ? 'items-end' : 'items-start'}`}>
        {!isUser && Boolean(message.steps?.length) && (
          <ChainOfThought>
            {message.steps?.map((step) => <ChainOfThoughtStep key={step.id} step={step} defaultOpen={step.status === 'running'} />)}
          </ChainOfThought>
        )}
        {message.status === 'pending' ? (
          <MessageContent className="text-neutral-500" aria-live="polite"><span className="flex items-center gap-2"><span className="flex gap-1" aria-hidden="true"><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400 [animation-delay:-0.2s]" /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400 [animation-delay:-0.1s]" /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400" /></span>FinFine is checking your records…</span></MessageContent>
        ) : message.status === 'failed' || message.status === 'cancelled' ? (
          <MessageContent className="text-neutral-500">{message.status === 'failed' ? 'FinFine could not complete this request.' : 'Request cancelled.'}</MessageContent>
        ) : isUser ? (
          <div className="rounded-2xl rounded-br-md bg-primary px-4 py-3 text-sm text-primary-foreground shadow-sm"><p className="whitespace-pre-wrap leading-6">{message.content}</p></div>
        ) : (
          <MessageContent className="prose prose-sm max-w-none"><Markdown>{message.content}</Markdown></MessageContent>
        )}
        {(message.status === 'failed' || message.status === 'cancelled') && (
          <MessageActions className={message.status === 'failed' ? 'text-red-600' : ''}>
            <span>{message.content || (message.status === 'failed' ? 'We could not complete that request.' : 'Request cancelled.')}</span>
            {canRetry && <button type="button" onClick={() => onRetry?.(message)} className="inline-flex items-center gap-1 font-semibold underline underline-offset-2" aria-label="Retry request"><RotateCcw size={12} /> Retry</button>}
          </MessageActions>
        )}
      </div>
    </Message>
  );
}
