'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { signOut } from 'aws-amplify/auth';
import { AlertTriangle, CheckCircle2, CircleHelp, Loader2, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import OnboardingShell from './OnboardingShell';
import PdfDropzone from './PdfDropzone';
import DocumentReview from './DocumentReview';
import { StepHeader } from './StepHeader';
import type { OnboardingDocument, OnboardingState, OnboardingStatusResponse, OnboardingStep, ReadinessSummary, UploadPurpose } from './types';

const purposeCategories: Record<UploadPurpose, string> = {
  BANK_ACTIVITY: 'BANK_ACTIVITY',
  PRODUCT_SALES: 'PRODUCT_SALES',
  CURRENT_INVENTORY: 'CURRENT_INVENTORY',
  PURCHASES: 'PURCHASES_SUPPLIERS',
  OPEN_OBLIGATIONS: 'OPEN_OBLIGATIONS',
  RECURRING_EXPENSES: 'RECURRING_EXPENSES',
};

type FileMap = Partial<Record<UploadPurpose, File[]>>;
const EMPTY_DOCUMENTS: OnboardingDocument[] = [];

const emptyState: OnboardingState = {
  currentStep: 1,
  profile: { timezone: 'Asia/Kolkata', language: 'English' },
  financialSettings: { ruleType: 'ABSOLUTE_INR', minimumCashBuffer: '', currentCash: '', currentCashAsOf: '' },
  attestations: {},
  confirmations: {},
  documents: [],
};

function normalizeStatus(payload: OnboardingStatusResponse): OnboardingState {
  const onboarding = (payload.onboarding || payload) as OnboardingState;
  return {
    ...emptyState,
    ...onboarding,
    profile: { ...emptyState.profile, ...(onboarding.profile || {}) },
    financialSettings: { ...emptyState.financialSettings, ...(onboarding.financialSettings || {}) },
    attestations: { ...emptyState.attestations, ...(onboarding.attestations || {}) },
    confirmations: { ...emptyState.confirmations, ...(onboarding.confirmations || {}) },
    documents: payload.documents || onboarding.documents || [],
    readiness: payload.readiness || onboarding.readiness,
  };
}

function formatPeriod(document: OnboardingDocument) {
  const period = document.reportingPeriod;
  const start = document.reportingStartDate || period?.startDate;
  const end = document.reportingEndDate || period?.endDate;
  if (!start && !end) return 'Period pending confirmation';
  return `${start || '—'} → ${end || '—'}`;
}

export default function OnboardingWizard() {
  const router = useRouter();
  const contentRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<OnboardingState>(emptyState);
  const [files, setFiles] = useState<FileMap>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('');

  const step = Math.min(9, Math.max(1, Number(state.currentStep || 1))) as OnboardingStep;
  const documents = state.documents ?? EMPTY_DOCUMENTS;

  const loadStatus = useCallback(async () => {
    const response = await authenticatedFetch('/api/onboarding/status');
    if (response.status === 401 || response.status === 403) {
      router.replace('/login');
      return null;
    }
    if (!response.ok) throw new Error('We could not load your setup progress.');
    return normalizeStatus((await response.json()) as OnboardingStatusResponse);
  }, [router]);

  useEffect(() => {
    let active = true;
    loadStatus()
      .then((nextState) => {
        if (active && nextState) setState(nextState);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'We could not load your setup progress.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [loadStatus]);

  useEffect(() => {
    if (!documents.some((document) => ['PENDING', 'PROCESSING'].includes(String(document.status || document.processingStatus)))) return;
    const timer = window.setInterval(() => {
      void loadStatus().then((nextState) => {
        if (nextState) {
          setState((current) => ({
            ...current,
            documents: nextState.documents,
            readiness: nextState.readiness,
          }));
        }
      }).catch(() => undefined);
    }, 8000);
    return () => window.clearInterval(timer);
  }, [documents, loadStatus]);

  /* Keep focus movement separate from the status fetch so polling never steals focus. */
  useEffect(() => {
    contentRef.current?.focus();
  }, [step]);

  const patchState = useCallback(async (nextStep = step): Promise<OnboardingStatusResponse> => {
    const response = await authenticatedFetch('/api/onboarding', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentStep: nextStep,
        profile: state.profile,
        financialSettings: state.financialSettings,
        attestations: state.attestations,
        confirmations: state.confirmations,
      }),
    });
    const body = await response.json().catch(() => null) as (OnboardingStatusResponse & { error?: string }) | null;
    if (!response.ok) {
      throw new Error(body?.error || 'Your progress could not be saved.');
    }
    return body as OnboardingStatusResponse;
  }, [state, step]);

  const uploadPurpose = async (purpose: UploadPurpose) => {
    const pending = files[purpose] || [];
    if (pending.length === 0) return;
    for (const file of pending) {
      const form = new FormData();
      form.append('file', file);
      form.append('purpose', 'ONBOARDING_BASELINE');
      form.append('category', purposeCategories[purpose]);
      const response = await authenticatedFetch('/api/ingestion/upload', { method: 'POST', body: form });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || `Could not upload ${file.name}.`);
      }
    }
    setFiles((current) => ({ ...current, [purpose]: [] }));
  };

  const saveAndExit = async () => {
    setBusy(true);
    setError(null);
    try {
      await patchState(step);
      await signOut();
      router.replace('/login?returnTo=%2Fonboarding');
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Could not save your progress.');
    } finally {
      setBusy(false);
    }
  };

  const validateStep = () => {
    if (step === 2 && (!state.profile?.businessName?.trim() || !state.profile?.businessType)) {
      return 'Add your business name and business type to continue.';
    }
    if (step === 3 && (!state.financialSettings?.minimumCashBuffer || !state.financialSettings?.ruleType)) {
      return 'Set a minimum cash buffer and choose a rule type.';
    }
    if (step === 4 && (!state.financialSettings?.currentCash || !state.financialSettings?.currentCashAsOf)) {
      return 'Confirm your current cash position and its as-of date to continue.';
    }
    if (step === 5 && !hasEvidence('PRODUCT_SALES') && !hasNotApplicableReason('salesNotApplicable', 'salesNotApplicableReason')) {
      return 'Upload sales evidence or provide a written reason why it is not applicable.';
    }
    if (step === 6 && !hasEvidence('CURRENT_INVENTORY') && !hasNotApplicableReason('inventoryNotApplicable', 'inventoryNotApplicableReason')) {
      return 'Upload an inventory snapshot or provide a written reason why it is not applicable.';
    }
    if (step === 7 && !hasEvidence('PURCHASES') && !hasNotApplicableReason('purchasesNotApplicable', 'purchasesNotApplicableReason')) {
      return 'Upload purchase evidence or provide a written reason why it is not applicable.';
    }
    if (step === 8 && !hasEvidence('OPEN_OBLIGATIONS') && !hasNotApplicableReason('obligationsNotApplicable', 'obligationsNotApplicableReason')) {
      return 'Upload obligation evidence or provide a written reason why it is not applicable.';
    }
    if (step === 8 && hasEvidence('OPEN_OBLIGATIONS') && !state.confirmations?.obligationsReviewed) {
      return 'Review the open commitments and confirm them before continuing.';
    }
    if (step === 8 && !hasEvidence('RECURRING_EXPENSES') && !hasNotApplicableReason('recurringExpensesNotApplicable', 'recurringExpensesNotApplicableReason')) {
      return 'Upload recurring-expense evidence or provide a written reason why it is not applicable.';
    }
    if (step === 9 && (!state.attestations?.sourceData || !state.attestations?.correctionsReviewed)) {
      return 'Please complete both confirmations before finishing setup.';
    }
    return null;
  };

  const continueStep = async () => {
    const validationError = validateStep();
    if (validationError) {
      setError(validationError);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (step === 4) await uploadPurpose('BANK_ACTIVITY');
      if (step === 5) await uploadPurpose('PRODUCT_SALES');
      if (step === 6) await uploadPurpose('CURRENT_INVENTORY');
      if (step === 7) await uploadPurpose('PURCHASES');
      if (step === 8) {
        await uploadPurpose('OPEN_OBLIGATIONS');
        await uploadPurpose('RECURRING_EXPENSES');
      }
      if (step === 9) {
        const response = await authenticatedFetch('/api/onboarding/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            currentStep: 9,
            profile: state.profile,
            financialSettings: state.financialSettings,
            attestations: state.attestations,
            confirmations: state.confirmations,
          }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error || 'Your setup is not ready to complete yet.');
        }
        setStatusMessage('Setup complete. Taking you to your workspace…');
        router.replace('/dashboard');
        return;
      }
      const nextStep = (step + 1) as OnboardingStep;
      const saved = await patchState(nextStep);
      const refreshed = await loadStatus();
      setState((current) => ({
        ...current,
        ...(saved.onboarding || {}),
        currentStep: nextStep,
        documents: refreshed?.documents || current.documents,
        readiness: refreshed?.readiness || saved.readiness || current.readiness,
      }));
      setStatusMessage(`Step ${nextStep} of 9`);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'We could not save this step.');
    } finally {
      setBusy(false);
    }
  };

  const goBack = async () => {
    if (step <= 1 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const previous = (step - 1) as OnboardingStep;
      const saved = await patchState(previous);
      setState((current) => ({ ...current, ...(saved.onboarding || {}), currentStep: previous, readiness: saved.readiness || current.readiness }));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'We could not save this step.');
    } finally {
      setBusy(false);
    }
  };

  const updateProfile = (key: string, value: string) => setState((current) => ({ ...current, profile: { ...current.profile, [key]: value } }));
  const updateFinancial = (key: string, value: string) => setState((current) => ({ ...current, financialSettings: { ...current.financialSettings, [key]: value } }));
  const toggleConfirmation = (key: string, value: boolean) => setState((current) => ({ ...current, confirmations: { ...current.confirmations, [key]: value } }));
  const setConfirmationValue = (key: string, value: boolean | string) => setState((current) => ({ ...current, confirmations: { ...current.confirmations, [key]: value } }));
  const updateFiles = (purpose: UploadPurpose, value: File[]) => setFiles((current) => ({ ...current, [purpose]: value }));

  const docsByPurpose = useMemo(() => documents.reduce<Record<string, OnboardingDocument[]>>((accumulator, document) => {
    const key = document.purpose || document.category || 'OTHER';
    accumulator[key] = [...(accumulator[key] || []), document];
    return accumulator;
  }, {}), [documents]);

  const hasEvidence = (purpose: UploadPurpose) => Boolean((files[purpose]?.length || 0) + (docsByPurpose[purpose]?.length || 0));
  const hasNotApplicableReason = (key: string, reasonKey: string) => state.confirmations?.[key] === true && String(state.confirmations?.[reasonKey] || '').trim().length > 0;

  if (loading) return <div className="onboarding-loading"><Loader2 className="animate-spin" size={20} /> Loading your setup…</div>;

  const renderStep = () => {
    switch (step) {
      case 1:
        return <>
          <StepHeader eyebrow="01 / Start here" title="Let’s make your cash visible." description="A short setup for a sharper view of your business. Keep your last 90 days of PDFs nearby; you can pause and return at any time." />
          <div className="onboarding-checklist">
            {['Business profile and registration details', 'A minimum cash buffer that feels safe', 'Bank activity for the trailing 90 days', 'Sales, stock, purchases, and obligations evidence'].map((item) => <div key={item}><CheckCircle2 size={17} /> <span>{item}</span></div>)}
          </div>
          <div className="onboarding-note"><CircleHelp size={17} /><span>PDFs stay private to your workspace. FinFine uses them to build a periodic operating picture, not a public profile.</span></div>
        </>;
      case 2:
        return <>
          <StepHeader eyebrow="02 / Business" title="Tell us who we’re looking after." description="These details anchor every report. The fields marked required are enough to begin." />
          <div className="onboarding-grid onboarding-grid--two">
            <label className="onboarding-field onboarding-field--wide">Business name *<input autoFocus value={state.profile?.businessName || ''} onChange={(event) => updateProfile('businessName', event.target.value)} placeholder="e.g. Kaveri Home Goods" /></label>
            <label className="onboarding-field">Business type *<select value={state.profile?.businessType || ''} onChange={(event) => updateProfile('businessType', event.target.value)}><option value="">Choose one</option><option value="RETAIL">Retail</option><option value="WHOLESALE">Wholesale</option><option value="SERVICES">Services</option><option value="MANUFACTURING">Manufacturing</option><option value="OTHER">Other</option></select></label>
            <label className="onboarding-field">Trade name <input value={state.profile?.tradeName || ''} onChange={(event) => updateProfile('tradeName', event.target.value)} placeholder="Optional" /></label>
            <label className="onboarding-field">GSTIN <input inputMode="text" value={state.profile?.gstin || ''} onChange={(event) => updateProfile('gstin', event.target.value.toUpperCase())} placeholder="Optional" /></label>
            <label className="onboarding-field">PAN <input inputMode="text" value={state.profile?.pan || ''} onChange={(event) => updateProfile('pan', event.target.value.toUpperCase())} placeholder="Optional" /></label>
            <label className="onboarding-field">Timezone <select value={state.profile?.timezone || 'Asia/Kolkata'} onChange={(event) => updateProfile('timezone', event.target.value)}><option value="Asia/Kolkata">India Standard Time</option><option value="UTC">UTC</option></select></label>
          </div>
        </>;
      case 3:
        return <>
          <StepHeader eyebrow="03 / Guardrail" title="Choose the cash floor you won’t cross." description="This is a planning guardrail, not a judgement. We’ll keep the amount visible in INR so every recommendation has context." />
          <div className="onboarding-grid onboarding-grid--two">
            <label className="onboarding-field">Rule type <select value={state.financialSettings?.ruleType || 'ABSOLUTE_INR'} onChange={(event) => updateFinancial('ruleType', event.target.value)}><option value="ABSOLUTE_INR">Fixed rupee amount</option><option value="DAYS_OF_EXPENSE">Days of operating expense</option></select></label>
            <label className="onboarding-field">Minimum cash buffer *<span className="onboarding-input-prefix">₹<input inputMode="decimal" value={state.financialSettings?.minimumCashBuffer || ''} onChange={(event) => updateFinancial('minimumCashBuffer', event.target.value.replace(/[^0-9.]/g, ''))} placeholder="0" /></span></label>
          </div>
          <div className="onboarding-value-card"><span>Resolved cash floor</span><strong>₹{Number(state.financialSettings?.minimumCashBuffer || 0).toLocaleString('en-IN')}</strong><small>{state.financialSettings?.ruleType === 'DAYS_OF_EXPENSE' ? 'Based on operating expense days' : 'A fixed operating reserve'}</small></div>
        </>;
      case 4:
        return <>
          <StepHeader eyebrow="04 / Bank activity" title="Show us the movement of money." description="Upload one or more bank statements covering the trailing 90 days. We’ll confirm the reporting period after processing." />
          <PdfDropzone files={files.BANK_ACTIVITY || []} onChange={(value) => updateFiles('BANK_ACTIVITY', value)} label="Drop bank PDFs here" />
          <ExistingDocuments documents={docsByPurpose.BANK_ACTIVITY || []} />
          <div className="onboarding-grid onboarding-grid--two">
            <label className="onboarding-field onboarding-field--compact">Current cash across business accounts *<span className="onboarding-input-prefix">₹<input inputMode="decimal" value={state.financialSettings?.currentCash || ''} onChange={(event) => updateFinancial('currentCash', event.target.value.replace(/[^0-9.]/g, ''))} placeholder="0" /></span></label>
            <label className="onboarding-field onboarding-field--compact">Cash position as of *<input type="date" value={state.financialSettings?.currentCashAsOf || ''} onChange={(event) => updateFinancial('currentCashAsOf', event.target.value)} /></label>
          </div>
        </>;
      case 5:
        return <DocumentStep purpose="PRODUCT_SALES" title="Make sales legible, product by product." description="Upload product-level sales reports for the trailing 90 days. Multiple PDFs are welcome; we’ll group periods once they are validated." files={files} updateFiles={updateFiles} documents={docsByPurpose.PRODUCT_SALES || []} confirmations={state.confirmations || {}} setConfirmationValue={setConfirmationValue} notApplicableKey="salesNotApplicable" notApplicableReasonKey="salesNotApplicableReason" notApplicableLabel="There are no product-level sales records to add." />;
      case 6:
        return <DocumentStep purpose="CURRENT_INVENTORY" title="Take one honest stock snapshot." description="Upload your latest inventory PDF. A current snapshot gives the cash picture a physical counterweight." files={files} updateFiles={updateFiles} documents={docsByPurpose.CURRENT_INVENTORY || []} multiple={false} confirmations={state.confirmations || {}} setConfirmationValue={setConfirmationValue} notApplicableKey="inventoryNotApplicable" notApplicableReasonKey="inventoryNotApplicableReason" notApplicableLabel="There is no current inventory to report." />;
      case 7:
        return <DocumentStep purpose="PURCHASES" title="Bring purchases and suppliers into view." description="Upload purchase registers, supplier statements, or purchase invoices covering the trailing 90 days." files={files} updateFiles={updateFiles} documents={docsByPurpose.PURCHASES || []} confirmations={state.confirmations || {}} setConfirmationValue={setConfirmationValue} notApplicableKey="purchasesNotApplicable" notApplicableReasonKey="purchasesNotApplicableReason" notApplicableLabel="There are no purchases or supplier records to add." />;
      case 8:
        return <>
          <StepHeader eyebrow="08 / Commitments" title="Nothing important should hide in the edges." description="Upload current evidence for open payables, receivables, and recurring expenses. If a category does not apply, say so and keep moving." />
          <div className="onboarding-section-block"><h2>Open payables &amp; receivables</h2><PdfDropzone files={files.OPEN_OBLIGATIONS || []} onChange={(value) => updateFiles('OPEN_OBLIGATIONS', value)} label="Drop obligation PDFs here" /><ExistingDocuments documents={docsByPurpose.OPEN_OBLIGATIONS || []} /><NotApplicableControl checked={Boolean(state.confirmations?.obligationsNotApplicable)} reason={String(state.confirmations?.obligationsNotApplicableReason || '')} onCheckedChange={(value) => setConfirmationValue('obligationsNotApplicable', value)} onReasonChange={(value) => setConfirmationValue('obligationsNotApplicableReason', value)} label="There are no open payables or receivables right now." /></div>
          <div className="onboarding-section-block"><h2>Recurring expenses</h2><PdfDropzone files={files.RECURRING_EXPENSES || []} onChange={(value) => updateFiles('RECURRING_EXPENSES', value)} label="Drop expense evidence here" /><ExistingDocuments documents={docsByPurpose.RECURRING_EXPENSES || []} /><NotApplicableControl checked={Boolean(state.confirmations?.recurringExpensesNotApplicable)} reason={String(state.confirmations?.recurringExpensesNotApplicableReason || '')} onCheckedChange={(value) => setConfirmationValue('recurringExpensesNotApplicable', value)} onReasonChange={(value) => setConfirmationValue('recurringExpensesNotApplicableReason', value)} label="There are no active recurring expenses to add." /></div>
          <label className="onboarding-check-row onboarding-check-row--strong"><input type="checkbox" checked={Boolean(state.confirmations?.obligationsReviewed)} onChange={(event) => toggleConfirmation('obligationsReviewed', event.target.checked)} /><span>I’ve reviewed the open commitments and their current evidence.</span></label>
        </>;
      case 9:
        return <ReadinessReview readiness={state.readiness} documents={documents} attestations={state.attestations || {}} setAttestations={(value) => setState((current) => ({ ...current, attestations: { ...current.attestations, ...value } }))} />;
    }
  };

  return <OnboardingShell step={step} onSaveExit={saveAndExit} onBack={goBack} onContinue={continueStep} continueLabel={step === 9 ? 'Finish setup' : step === 1 ? 'Begin setup' : 'Save & continue'} backDisabled={step === 1} statusMessage={statusMessage} busy={busy}>
    <div ref={contentRef} tabIndex={-1} className="onboarding-content-focus">
      {renderStep()}
      {error && <div className="onboarding-error-banner" role="alert"><AlertTriangle size={17} /> <span>{error}</span></div>}
    </div>
  </OnboardingShell>;
}

function DocumentStep({ purpose, title, description, files, updateFiles, documents, multiple = true, confirmations, setConfirmationValue, notApplicableKey, notApplicableReasonKey, notApplicableLabel }: { purpose: UploadPurpose; title: string; description: string; files: FileMap; updateFiles: (purpose: UploadPurpose, value: File[]) => void; documents: OnboardingDocument[]; multiple?: boolean; confirmations: Record<string, boolean | string>; setConfirmationValue: (key: string, value: boolean | string) => void; notApplicableKey: string; notApplicableReasonKey: string; notApplicableLabel: string }) {
  return <>
    <StepHeader eyebrow={`${purpose === 'CURRENT_INVENTORY' ? '06' : purpose === 'PRODUCT_SALES' ? '05' : '07'} / Documents`} title={title} description={description} />
    <PdfDropzone files={files[purpose] || []} onChange={(value) => updateFiles(purpose, value)} label={purpose === 'CURRENT_INVENTORY' ? 'Drop your inventory PDF here' : 'Drop PDFs here'} multiple={multiple} />
    <ExistingDocuments documents={documents} />
    <NotApplicableControl checked={confirmations[notApplicableKey] === true} reason={String(confirmations[notApplicableReasonKey] || '')} onCheckedChange={(value) => setConfirmationValue(notApplicableKey, value)} onReasonChange={(value) => setConfirmationValue(notApplicableReasonKey, value)} label={notApplicableLabel} />
  </>;
}

function NotApplicableControl({ checked, reason, onCheckedChange, onReasonChange, label }: { checked: boolean; reason: string; onCheckedChange: (value: boolean) => void; onReasonChange: (value: string) => void; label: string }) {
  return <div className="onboarding-na-control"><label className="onboarding-check-row"><input type="checkbox" checked={checked} onChange={(event) => onCheckedChange(event.target.checked)} /><span>{label}</span></label>{checked && <label className="onboarding-field onboarding-na-reason">Reason required <input value={reason} onChange={(event) => onReasonChange(event.target.value)} placeholder="Tell us why this category does not apply" /></label>}</div>;
}

function ExistingDocuments({ documents }: { documents: OnboardingDocument[] }) {
  if (!documents.length) return null;
  return <div className="onboarding-existing-documents"><p className="onboarding-mini-label">Already in your workspace</p>{documents.map((document) => <div key={document.id} className="onboarding-existing-document-wrap"><div className="onboarding-existing-document"><span className="flex min-w-0 items-center gap-2"><CheckCircle2 size={15} /><span className="truncate">{document.fileName || 'Uploaded PDF'}</span></span><span>{document.status || document.processingStatus || 'Processing'} · {formatPeriod(document)}</span></div><DocumentReview document={document} compact /></div>)}</div>;
}

function ReadinessReview({ readiness, documents, attestations, setAttestations }: { readiness?: ReadinessSummary; documents: OnboardingDocument[]; attestations: Record<string, boolean>; setAttestations: (value: Record<string, boolean>) => void }) {
  const coverage = readiness?.coverage ? Object.entries(readiness.coverage) : [];
  return <>
    <StepHeader eyebrow="09 / Final review" title="Your operating picture is almost ready." description="Review coverage, acknowledge the source data, and finish setup. Warnings are not blockers unless they are called out as such." />
    <div className="onboarding-readiness-card"><div className="flex items-start justify-between gap-5"><div><p className="onboarding-mini-label">Readiness</p><strong className="onboarding-readiness-score">{readiness?.score === undefined ? '—' : `${readiness.score}%`}</strong></div><ShieldCheck size={28} /></div>{coverage.length ? <div className="onboarding-coverage-list">{coverage.map(([key, item]) => <div key={key}><span>{item.label || key}</span><span className={item.complete ? 'status-good' : 'status-warning'}>{item.complete ? 'Covered' : 'Review'}</span></div>)}</div> : <p className="mt-4 text-sm text-white/70">Coverage will update as documents finish processing.</p>}</div>
    {(readiness?.blockers || []).length > 0 && <div className="onboarding-warning-card"><AlertTriangle size={18} /><div><strong>One or more checks need attention</strong><ul>{readiness?.blockers?.map((warning) => <li key={warning}>{warning}</li>)}</ul></div></div>}
    {(readiness?.warnings || []).length > 0 && <div className="onboarding-note"><AlertTriangle size={17} /><span>{readiness?.warnings?.join(' ')}</span></div>}
    <div className="onboarding-final-documents"><p className="onboarding-mini-label">Document review</p>{documents.length ? documents.map((document) => <div className="onboarding-final-document" key={document.id}><div className="onboarding-final-document-heading"><strong>{document.fileName || 'Uploaded PDF'}</strong><span>{document.status || document.processingStatus || 'Processing'} · {formatPeriod(document)}</span></div><DocumentReview document={document} /></div>) : <p className="document-review-empty">No documents have been uploaded yet.</p>}</div>
    <div className="onboarding-attestations"><label className="onboarding-check-row"><input type="checkbox" checked={Boolean(attestations.sourceData)} onChange={(event) => setAttestations({ sourceData: event.target.checked })} /><span>I confirm these documents belong to my business and cover the periods shown.</span></label><label className="onboarding-check-row"><input type="checkbox" checked={Boolean(attestations.correctionsReviewed)} onChange={(event) => setAttestations({ correctionsReviewed: event.target.checked })} /><span>I’ve reviewed extracted fields and will correct anything that looks off.</span></label></div>
  </>;
}
