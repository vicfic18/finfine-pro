'use client';

import { CheckCircle2, ChevronDown, CircleAlert, Code2, LoaderCircle, Wrench } from 'lucide-react';
import { useState, type ReactNode } from 'react';

export type ChainOfThoughtStepData = {
  id: string;
  kind: 'tool' | 'code';
  title: string;
  status: 'running' | 'complete' | 'error';
};

export function ChainOfThought({ children }: { children: ReactNode }) {
  return <div className="mb-2 w-full rounded-xl border border-neutral-200 bg-neutral-50/80 px-3 py-2">{children}</div>;
}

export function ChainOfThoughtStep({ step, defaultOpen = false }: { step: ChainOfThoughtStepData; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const running = step.status === 'running';
  const detail = step.kind === 'code'
    ? (running ? 'Executing approved calculation code. The code itself is hidden.' : 'Calculation code finished. The code itself is hidden.')
    : (running ? 'FinFine is using this tool now.' : step.status === 'error' ? 'This tool did not finish successfully.' : 'Tool call completed.');
  const StatusIcon = running ? LoaderCircle : step.status === 'error' ? CircleAlert : CheckCircle2;

  return (
    <div className="border-b border-neutral-200/70 py-1.5 last:border-b-0">
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-center gap-2 text-left" aria-expanded={open}>
        <StatusIcon size={14} className={running ? 'animate-spin text-amber-600' : step.status === 'error' ? 'text-red-500' : 'text-emerald-600'} />
        {step.kind === 'code' ? <Code2 size={13} className="text-neutral-500" /> : <Wrench size={13} className="text-neutral-500" />}
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-neutral-700">{step.title}</span>
        <ChevronDown size={14} className={`text-neutral-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <p className="pb-1 pl-[2.6rem] pt-1 text-[11px] leading-5 text-neutral-500">{detail}</p>}
    </div>
  );
}
