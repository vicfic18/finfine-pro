'use client';

import { ReactNode } from 'react';
import { Check, LogOut } from 'lucide-react';
import { SarvamGateway } from './SarvamGateway';

const labels = ['Prepare', 'Business', 'Cash rule', 'Bank activity', 'Sales', 'Inventory', 'Purchases', 'Obligations', 'Ready'];

interface OnboardingShellProps {
  step: number;
  children: ReactNode;
  onSaveExit: () => void;
  onBack: () => void;
  onContinue: () => void;
  continueLabel: string;
  continueDisabled?: boolean;
  backDisabled?: boolean;
  statusMessage?: string;
  busy?: boolean;
}

export default function OnboardingShell({
  step,
  children,
  onSaveExit,
  onBack,
  onContinue,
  continueLabel,
  continueDisabled = false,
  backDisabled = false,
  statusMessage,
  busy = false,
}: OnboardingShellProps) {
  return (
    <main className="onboarding-page">
      <aside className="onboarding-rail">
        <div>
          <div className="onboarding-brand"><span>F</span> FinFine Pro</div>
          <p className="onboarding-rail-kicker">Merchant setup / 2026</p>
          <ol className="onboarding-progress" aria-label="Onboarding progress">
            {labels.map((label, index) => {
              const itemStep = index + 1;
              const complete = itemStep < step;
              return (
                <li key={label} className={itemStep === step ? 'is-current' : complete ? 'is-complete' : ''}>
                  <span className="onboarding-progress__dot">{complete ? <Check size={12} /> : itemStep}</span>
                  <span>{label}</span>
                </li>
              );
            })}
          </ol>
        </div>
        <div className="onboarding-rail-footer">
          <span className="onboarding-security"><span aria-hidden="true">●</span> Private by design</span>
          <button type="button" onClick={onSaveExit} className="onboarding-save-link">
            <LogOut size={14} /> Save &amp; exit
          </button>
        </div>
      </aside>
      <section className="onboarding-visual"><SarvamGateway /></section>
      <section className="onboarding-form-surface">
        <div className="onboarding-mobile-topline">
          <span className="onboarding-brand"><span>F</span> FinFine Pro</span>
          <span>{step} / 9</span>
        </div>
        <div className="onboarding-form-content">
          {children}
          <p className="onboarding-live-status" aria-live="polite">{statusMessage || (busy ? 'Working…' : '')}</p>
        </div>
        <footer className="onboarding-actions">
          <button type="button" className="onboarding-button onboarding-button--quiet" onClick={onBack} disabled={backDisabled || busy}>
            Back
          </button>
          <button type="button" className="onboarding-button onboarding-button--primary" onClick={onContinue} disabled={continueDisabled || busy}>
            {busy ? 'Saving…' : continueLabel}
          </button>
        </footer>
      </section>
    </main>
  );
}
