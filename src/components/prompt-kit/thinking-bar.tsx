'use client';

import { TextShimmer } from '@/components/prompt-kit/text-shimmer';
import { cn } from '@/lib/utils';

type ThinkingBarProps = { className?: string; text?: string; onStop?: () => void; stopLabel?: string; onClick?: () => void };
export function ThinkingBar({ className, text = 'Thinking', onStop, stopLabel = 'Stop', onClick }: ThinkingBarProps) {
  return <div className={cn('flex w-full items-center justify-between rounded-xl border border-border bg-secondary px-3.5 py-2.5 text-secondary-foreground', className)} role="status" aria-live="polite">{onClick ? <button type="button" onClick={onClick} className="text-sm transition-opacity hover:opacity-80"><TextShimmer className="font-medium">{text}</TextShimmer></button> : <TextShimmer className="cursor-default text-xs font-medium">{text}</TextShimmer>}{onStop ? <button onClick={onStop} type="button" className="text-xs font-semibold text-muted-foreground underline decoration-dotted underline-offset-2 transition-colors hover:text-foreground">{stopLabel}</button> : null}</div>;
}
