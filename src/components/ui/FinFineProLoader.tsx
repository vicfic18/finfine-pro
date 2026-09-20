'use client';

import { useEffect, useState } from 'react';

/**
 * FinFineProLoader
 *
 * Animates the brand name word-by-word:
 *   phase 0 → "Fin" fades in
 *   phase 1 → "Fine" fades in
 *   phase 2 → "Pro" fades in
 *   phase 3 → brief hold
 *   phase 4 → entire group slides up + fades out
 *   → repeats
 */

const WORD_STEP = 380;
const HOLD = 700;
const SLIDE_AWAY = 500;
const GAP = 200;

const TOTAL_CYCLE = WORD_STEP * 3 + HOLD + SLIDE_AWAY + GAP;

type Phase = 0 | 1 | 2 | 3 | 4;

export default function FinFineProLoader() {
  const [phase, setPhase] = useState<Phase>(0);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    function runCycle() {
      setPhase(0);
      timers.push(setTimeout(() => setPhase(1), WORD_STEP));
      timers.push(setTimeout(() => setPhase(2), WORD_STEP * 2));
      timers.push(setTimeout(() => setPhase(3), WORD_STEP * 3));
      timers.push(setTimeout(() => setPhase(4), WORD_STEP * 3 + HOLD));
      timers.push(setTimeout(() => runCycle(), TOTAL_CYCLE));
    }

    runCycle();
    return () => timers.forEach(clearTimeout);
  }, []);

  const wordVisible = (wordPhase: Phase) => phase >= wordPhase && phase < 4;
  const slideAway = phase === 4;

  return (
    <div className="min-h-screen bg-[#FFFFFF] flex items-center justify-center">
      <div
        className="flex items-baseline gap-[0.18em] overflow-hidden"
        style={{
          animation: slideAway
            ? `loader-slide-away ${SLIDE_AWAY}ms cubic-bezier(0.4, 0, 0.8, 0.4) forwards`
            : 'none',
        }}
      >
        {/* "Fin" */}
        <span
          className="font-display font-bold text-4xl sm:text-5xl tracking-tight text-neutral-900 inline-block"
          style={{
            opacity: wordVisible(0) ? 1 : 0,
            transform: wordVisible(0) ? 'translateY(0)' : 'translateY(10px)',
            animation: wordVisible(0)
              ? 'word-reveal 340ms cubic-bezier(0.16,1,0.3,1) forwards'
              : 'none',
          }}
        >
          Fin
        </span>

        {/* "Fine" */}
        <span
          className="font-display font-bold text-4xl sm:text-5xl tracking-tight text-neutral-900 inline-block"
          style={{
            opacity: wordVisible(1) ? 1 : 0,
            transform: wordVisible(1) ? 'translateY(0)' : 'translateY(10px)',
            animation: wordVisible(1)
              ? 'word-reveal 340ms cubic-bezier(0.16,1,0.3,1) forwards'
              : 'none',
          }}
        >
          Fine
        </span>

        {/* "Pro" – subtly lighter */}
        <span
          className="font-sans font-semibold text-2xl sm:text-3xl tracking-tight text-neutral-400 inline-block"
          style={{
            opacity: wordVisible(2) ? 1 : 0,
            transform: wordVisible(2) ? 'translateY(0)' : 'translateY(10px)',
            animation: wordVisible(2)
              ? 'word-reveal 340ms cubic-bezier(0.16,1,0.3,1) forwards'
              : 'none',
          }}
        >
          Pro
        </span>
      </div>
    </div>
  );
}
