'use client';

import { CheckCircle2, ChevronDown, ChevronRight, CircleAlert, Code2, LoaderCircle, Sparkles, Wrench } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';

export type ChainOfThoughtStepData = {
  id: string;
  kind: 'tool' | 'code';
  title: string;
  status: 'running' | 'complete' | 'error';
};

export function ChainOfThought({
  children,
  steps,
  isRunning,
  defaultOpen,
}: {
  children: ReactNode;
  steps?: ChainOfThoughtStepData[];
  isRunning?: boolean;
  defaultOpen?: boolean;
}) {
  const contentId = useId();
  const stepList = steps ?? [];
  const running = isRunning ?? stepList.some((s) => s.status === 'running');
  const [userToggledState, setUserToggledState] = useState<boolean | null>(defaultOpen !== undefined ? defaultOpen : null);

  const isOpen = userToggledState !== null ? userToggledState : running;

  const toggle = () => {
    setUserToggledState(!isOpen);
  };

  const count = stepList.length;

  return (
    <div className="mb-2.5 w-full rounded-xl border border-neutral-200/90 bg-neutral-50/80 shadow-xs transition-all">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={isOpen}
        aria-controls={contentId}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-neutral-100/50 rounded-xl"
      >
        <div className="flex items-center gap-2 min-w-0">
          <ChevronRight
            size={14}
            className={`text-neutral-400 transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-90' : ''}`}
          />
          <Sparkles size={14} className={running ? 'text-amber-500 animate-pulse shrink-0' : 'text-neutral-500 shrink-0'} />
          <span className="text-xs font-semibold text-neutral-800 tracking-tight">Thoughts</span>
          {running ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 border border-amber-200/60">
              <LoaderCircle size={10} className="animate-spin text-amber-600" />
              Thinking…
            </span>
          ) : count > 0 ? (
            <span className="text-[11px] text-neutral-400 font-normal">
              ({count} {count === 1 ? 'step' : 'steps'})
            </span>
          ) : null}
        </div>
        <span className="text-[10px] font-medium text-neutral-400 hover:text-neutral-600 transition-colors">
          {isOpen ? 'Collapse' : 'Expand'}
        </span>
      </button>

      {isOpen && (
        <div id={contentId} className="border-t border-neutral-200/70 px-3 pb-2 pt-1">
          {children}
        </div>
      )}
    </div>
  );
}

export function ChainOfThoughtStep({ step, defaultOpen = false }: { step: ChainOfThoughtStepData; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const running = step.status === 'running';
  const detail = step.kind === 'code'
    ? (running ? 'Executing approved calculation code.' : 'Calculation code finished.')
    : (running ? 'FinFine is using this tool now.' : step.status === 'error' ? 'This tool did not finish successfully.' : 'Tool call completed.');
  const StatusIcon = running ? LoaderCircle : step.status === 'error' ? CircleAlert : CheckCircle2;

  return (
    <div className="border-b border-neutral-200/50 py-1.5 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 text-left rounded-lg p-1 hover:bg-neutral-100/60 transition-colors"
        aria-expanded={open}
      >
        <StatusIcon size={14} className={running ? 'animate-spin text-amber-600 shrink-0' : step.status === 'error' ? 'text-red-500 shrink-0' : 'text-emerald-600 shrink-0'} />
        {step.kind === 'code' ? <Code2 size={13} className="text-neutral-500 shrink-0" /> : <Wrench size={13} className="text-neutral-500 shrink-0" />}
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-neutral-700">{step.title}</span>
        <ChevronDown size={13} className={`text-neutral-400 transition-transform duration-200 shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <p className="pb-1 pl-7 pt-1 text-[11px] leading-5 text-neutral-500">{detail}</p>}
    </div>
  );
}
