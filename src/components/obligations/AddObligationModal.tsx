'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X,
  Store,
  Home,
  Wallet,
  FileText,
  Receipt,
  Package,
  ArrowRight,
  ArrowLeft,
  Repeat,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

interface AddObligationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
  initialData?: any | null;
}

type ObligationTypeOption = 'PAYABLE' | 'RECEIVABLE';

interface CategoryOption {
  key: string;
  label: string;
  icon: React.ElementType;
  type: ObligationTypeOption;
  isStatutory?: boolean;
}

const CATEGORY_OPTIONS: CategoryOption[] = [
  { key: 'VENDOR_BILL', label: 'Supplier Payment', icon: Store, type: 'PAYABLE' },
  { key: 'UTILITY_BILL', label: 'Rent / Utility', icon: Home, type: 'PAYABLE' },
  { key: 'SALARY', label: 'Salary / Payroll', icon: Wallet, type: 'PAYABLE' },
  { key: 'GST_PAYMENT', label: 'GST Payment', icon: FileText, type: 'PAYABLE', isStatutory: true },
  { key: 'TDS_PAYMENT', label: 'TDS Payment', icon: FileText, type: 'PAYABLE', isStatutory: true },
  { key: 'CUSTOMER_INVOICE', label: 'Customer Invoice', icon: Receipt, type: 'RECEIVABLE' },
  { key: 'OTHER', label: 'Other', icon: Package, type: 'PAYABLE' },
];

const FREQUENCY_OPTIONS = [
  { key: 'DAILY', label: 'Daily' },
  { key: 'WEEKLY', label: 'Weekly' },
  { key: 'MONTHLY', label: 'Monthly' },
  { key: 'QUARTERLY', label: 'Quarterly' },
];

export default function AddObligationModal({
  isOpen,
  onClose,
  onCreated,
  initialData,
}: AddObligationModalProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState<1 | 2 | 3>(initialData ? 2 : 1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Category
  const [selectedCategory, setSelectedCategory] = useState<CategoryOption | null>(() => {
    if (initialData?.category) {
      return CATEGORY_OPTIONS.find((c) => c.key === initialData.category) || CATEGORY_OPTIONS[0];
    }
    return null;
  });

  // Step 2: Details
  const [title, setTitle] = useState(initialData?.title || '');
  const [counterpartyName, setCounterpartyName] = useState(initialData?.counterpartyName || '');
  const [amount, setAmount] = useState(initialData?.amount ? String(initialData.amount) : '');
  const [dueDate, setDueDate] = useState(initialData?.dueDate || '');
  const [penaltyRate, setPenaltyRate] = useState(initialData?.penaltyRatePerDay ? String(initialData.penaltyRatePerDay) : '');
  const [allowPartialPayment, setAllowPartialPayment] = useState(initialData?.allowPartialPayment || false);
  const [notes, setNotes] = useState(initialData?.notes || '');

  // Recurrence
  const [isRecurring, setIsRecurring] = useState(initialData?.isRecurring || false);
  const [frequency, setFrequency] = useState(initialData?.frequency || 'MONTHLY');
  const [dueDayOfMonth, setDueDayOfMonth] = useState(initialData?.dueDayOfMonth ? String(initialData.dueDayOfMonth) : '');

  // Supplier-specific
  const [creditPeriodDays, setCreditPeriodDays] = useState(initialData?.creditPeriodDays ? String(initialData.creditPeriodDays) : '');

  React.useEffect(() => {
    if (initialData) {
      setStep(2);
      const cat = CATEGORY_OPTIONS.find((c) => c.key === initialData.category) || {
        key: initialData.category || 'OTHER',
        label: initialData.category || 'Other',
        icon: Package,
        type: initialData.type || 'PAYABLE',
        isStatutory: initialData.isStatutory,
      };
      setSelectedCategory(cat);
      setTitle(initialData.title || '');
      setCounterpartyName(initialData.counterpartyName || '');
      setAmount(initialData.amount ? String(initialData.amount) : '');
      setDueDate(initialData.dueDate || '');
      setPenaltyRate(initialData.penaltyRatePerDay ? String(initialData.penaltyRatePerDay) : '');
      setAllowPartialPayment(initialData.allowPartialPayment || false);
      setNotes(initialData.notes || '');
      setIsRecurring(initialData.isRecurring || false);
      setFrequency(initialData.frequency || 'MONTHLY');
      setDueDayOfMonth(initialData.dueDayOfMonth ? String(initialData.dueDayOfMonth) : '');
      setCreditPeriodDays(initialData.creditPeriodDays ? String(initialData.creditPeriodDays) : '');
    } else {
      resetForm();
    }
  }, [initialData, isOpen]);

  const resetForm = () => {
    setStep(1);
    setSelectedCategory(null);
    setTitle('');
    setCounterpartyName('');
    setAmount('');
    setDueDate('');
    setPenaltyRate('');
    setAllowPartialPayment(false);
    setNotes('');
    setIsRecurring(false);
    setFrequency('MONTHLY');
    setDueDayOfMonth('');
    setCreditPeriodDays('');
    setError(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleCategorySelect = (cat: CategoryOption) => {
    setSelectedCategory(cat);
    // Auto-fill type-specific defaults
    if (cat.key === 'VENDOR_BILL') {
      setTitle('');
      setIsRecurring(false);
    } else if (cat.key === 'SALARY') {
      setTitle('Salary Payment');
      setIsRecurring(true);
      setFrequency('MONTHLY');
    } else if (cat.key === 'UTILITY_BILL') {
      setTitle('');
      setIsRecurring(true);
      setFrequency('MONTHLY');
    } else if (cat.key === 'GST_PAYMENT' || cat.key === 'TDS_PAYMENT') {
      setTitle(cat.key === 'GST_PAYMENT' ? 'GST Payment' : 'TDS Payment');
      setIsRecurring(true);
      setFrequency('MONTHLY');
    } else if (cat.key === 'CUSTOMER_INVOICE') {
      setTitle('');
      setIsRecurring(false);
    }
    setStep(2);
  };

  const canProceedToReview = () => {
    return title.trim() !== '' && amount.trim() !== '' && Number(amount) > 0;
  };

  const handleSubmit = async () => {
    if (!selectedCategory || !canProceedToReview()) return;

    setSubmitting(true);
    setError(null);

    try {
      const body: Record<string, any> = {
        title: title.trim(),
        counterpartyName: counterpartyName.trim() || undefined,
        amount: Number(amount),
        dueDate: dueDate || undefined,
        type: selectedCategory.type,
        category: selectedCategory.key,
        isStatutory: selectedCategory.isStatutory || false,
        penaltyRatePerDay: penaltyRate ? Number(penaltyRate) : undefined,
        allowPartialPayment,
        notes: notes.trim() || undefined,
        isRecurring,
      };

      if (isRecurring) {
        body.frequency = frequency;
        body.dueDayOfMonth = dueDayOfMonth ? Number(dueDayOfMonth) : undefined;
      }

      if (selectedCategory.key === 'VENDOR_BILL' && creditPeriodDays) {
        body.creditPeriodDays = Number(creditPeriodDays);
      }

      const url = initialData?.id ? `/api/obligations/${initialData.id}` : '/api/obligations';
      const method = initialData?.id ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to save obligation');
      }

      handleClose();
      onCreated();
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
      <div className="bg-white border border-neutral-200 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-neutral-200">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-0.5">
              {step === 1
                ? t('obligationManager.step1Title', 'Select Type')
                : step === 2
                ? t('obligationManager.step2Title', 'Enter Details')
                : t('obligationManager.step3Title', 'Review & Submit')}
            </div>
            <h2 className="font-display font-bold text-xl text-neutral-900">
              {initialData?.id
                ? t('obligationManager.editObligation', 'Edit Obligation')
                : t('obligationManager.addObligation', 'Add Obligation')}
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="p-2 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center px-5 py-3 bg-neutral-50 border-b border-neutral-100">
          {[1, 2, 3].map((s) => (
            <React.Fragment key={s}>
              <div
                className={`w-6 h-6 flex items-center justify-center text-[11px] font-bold ${
                  s === step
                    ? 'bg-neutral-900 text-white'
                    : s < step
                    ? 'bg-emerald-600 text-white'
                    : 'bg-neutral-200 text-neutral-500'
                }`}
              >
                {s < step ? '✓' : s}
              </div>
              {s < 3 && (
                <div
                  className={`flex-1 h-px mx-2 ${
                    s < step ? 'bg-emerald-400' : 'bg-neutral-200'
                  }`}
                />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="px-5 py-3 bg-rose-50 border-b border-rose-100 flex items-center space-x-2 text-xs text-rose-700">
            <AlertTriangle size={14} />
            <span>{error}</span>
          </div>
        )}

        {/* Step 1: Category Selection */}
        {step === 1 && (
          <div className="p-5">
            <p className="text-xs text-neutral-500 mb-4">
              {t('obligationManager.selectCategoryDesc', 'What type of obligation are you adding?')}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORY_OPTIONS.map((cat) => (
                <button
                  key={cat.key}
                  onClick={() => handleCategorySelect(cat)}
                  className="flex items-center space-x-3 p-4 border border-neutral-200 bg-white hover:bg-neutral-50 hover:border-neutral-400 transition-all text-left group cursor-pointer"
                >
                  <div className="w-9 h-9 bg-neutral-100 group-hover:bg-neutral-900 group-hover:text-white text-neutral-600 flex items-center justify-center transition-colors shrink-0">
                    <cat.icon size={18} />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-neutral-900 leading-tight">
                      {t(`obligationManager.cat_${cat.key}`, cat.label)}
                    </div>
                    <div className="text-[10px] text-neutral-400 mt-0.5">
                      {cat.type === 'RECEIVABLE'
                        ? t('obligationManager.receivable', 'Receivable')
                        : t('obligationManager.payable', 'Payable')}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Details Form */}
        {step === 2 && selectedCategory && (
          <div className="p-5 space-y-4">
            {/* Category badge */}
            <div className="flex items-center space-x-2 text-[11px]">
              <span className="px-2 py-1 bg-neutral-900 text-white font-semibold uppercase tracking-wider">
                {CATEGORY_OPTIONS.find((c) => c.key === selectedCategory.key)?.label}
              </span>
              <span className={`px-2 py-1 font-semibold uppercase tracking-wider ${
                selectedCategory.type === 'RECEIVABLE'
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-rose-100 text-rose-700'
              }`}>
                {selectedCategory.type}
              </span>
            </div>

            {/* Title */}
            <div className="space-y-1.5">
              <label className="font-semibold text-neutral-700 uppercase tracking-wider text-[11px]">
                {t('obligationManager.titleLabel', 'Title / Description')} *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  selectedCategory.key === 'VENDOR_BILL'
                    ? 'e.g., Aggarwal Traders — September stock'
                    : selectedCategory.key === 'CUSTOMER_INVOICE'
                    ? 'e.g., Invoice #1042 — Rajan General Store'
                    : 'Enter description'
                }
                className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 text-neutral-900 text-sm font-medium focus:outline-none focus:border-neutral-900 transition-colors"
                autoFocus
              />
            </div>

            {/* Counterparty */}
            <div className="space-y-1.5">
              <label className="font-semibold text-neutral-700 uppercase tracking-wider text-[11px]">
                {selectedCategory.type === 'RECEIVABLE'
                  ? t('obligationManager.customerName', 'Customer Name')
                  : t('obligationManager.counterpartyName', 'Counterparty / Supplier Name')}
              </label>
              <input
                type="text"
                value={counterpartyName}
                onChange={(e) => setCounterpartyName(e.target.value)}
                placeholder={
                  selectedCategory.key === 'VENDOR_BILL'
                    ? 'e.g., Sharma Distributors'
                    : selectedCategory.key === 'CUSTOMER_INVOICE'
                    ? 'e.g., Rajan General Store'
                    : 'Enter name'
                }
                className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 text-neutral-900 text-sm focus:outline-none focus:border-neutral-900 transition-colors"
              />
            </div>

            {/* Amount + Due Date row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="font-semibold text-neutral-700 uppercase tracking-wider text-[11px]">
                  {t('obligationManager.amount', 'Amount (₹)')} *
                </label>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="45,000"
                  className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 font-mono text-neutral-900 font-bold text-sm focus:outline-none focus:border-neutral-900 transition-colors"
                />
              </div>
              <div className="space-y-1.5">
                <label className="font-semibold text-neutral-700 uppercase tracking-wider text-[11px]">
                  {t('obligationManager.dueDate', 'Due Date')}
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 text-neutral-900 text-sm focus:outline-none focus:border-neutral-900 transition-colors"
                />
              </div>
            </div>

            {/* Supplier-specific: credit period */}
            {selectedCategory.key === 'VENDOR_BILL' && (
              <div className="space-y-1.5">
                <label className="font-semibold text-neutral-700 uppercase tracking-wider text-[11px]">
                  {t('obligationManager.creditPeriod', 'Credit Period (Days)')}
                </label>
                <input
                  type="number"
                  min="0"
                  value={creditPeriodDays}
                  onChange={(e) => setCreditPeriodDays(e.target.value)}
                  placeholder="30"
                  className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 text-neutral-900 text-sm focus:outline-none focus:border-neutral-900 transition-colors"
                />
                <span className="text-[10px] text-neutral-400">
                  {t('obligationManager.creditPeriodSub', 'Saved to supplier profile for analytics')}
                </span>
              </div>
            )}

            {/* Statutory: penalty rate */}
            {selectedCategory.isStatutory && (
              <div className="space-y-1.5">
                <label className="font-semibold text-neutral-700 uppercase tracking-wider text-[11px]">
                  {t('obligationManager.penaltyRate', 'Penalty (₹/day if missed)')}
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={penaltyRate}
                  onChange={(e) => setPenaltyRate(e.target.value)}
                  placeholder="200"
                  className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 font-mono text-neutral-900 text-sm focus:outline-none focus:border-neutral-900 transition-colors"
                />
              </div>
            )}

            {/* Partial Payment toggle */}
            <div className="flex items-center justify-between py-2 border-t border-neutral-100">
              <div>
                <div className="text-xs font-semibold text-neutral-700">
                  {t('obligationManager.allowPartial', 'Allow Partial Payment')}
                </div>
                <div className="text-[10px] text-neutral-400">
                  {t('obligationManager.allowPartialSub', 'Can this bill be paid in installments?')}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAllowPartialPayment(!allowPartialPayment)}
                className={`w-10 h-6 rounded-full transition-colors relative cursor-pointer ${
                  allowPartialPayment ? 'bg-neutral-900' : 'bg-neutral-200'
                }`}
              >
                <div
                  className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform shadow-sm ${
                    allowPartialPayment ? 'translate-x-5' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Recurring toggle */}
            <div className="flex items-center justify-between py-2 border-t border-neutral-100">
              <div>
                <div className="text-xs font-semibold text-neutral-700 flex items-center space-x-1.5">
                  <Repeat size={13} />
                  <span>{t('obligationManager.isRecurring', 'This is Recurring')}</span>
                </div>
                <div className="text-[10px] text-neutral-400">
                  {t('obligationManager.isRecurringSub', 'Auto-creates next period when marked paid')}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsRecurring(!isRecurring)}
                className={`w-10 h-6 rounded-full transition-colors relative cursor-pointer ${
                  isRecurring ? 'bg-neutral-900' : 'bg-neutral-200'
                }`}
              >
                <div
                  className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform shadow-sm ${
                    isRecurring ? 'translate-x-5' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Recurrence details */}
            {isRecurring && (
              <div className="pl-4 border-l-2 border-neutral-200 space-y-3">
                <div className="space-y-1.5">
                  <label className="font-semibold text-neutral-700 uppercase tracking-wider text-[11px]">
                    {t('obligationManager.frequency', 'Frequency')}
                  </label>
                  <div className="flex space-x-1">
                    {FREQUENCY_OPTIONS.map((f) => (
                      <button
                        key={f.key}
                        type="button"
                        onClick={() => setFrequency(f.key)}
                        className={`px-3 py-1.5 text-xs font-semibold border transition-colors cursor-pointer ${
                          frequency === f.key
                            ? 'bg-neutral-900 text-white border-neutral-900'
                            : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-400'
                        }`}
                      >
                        {t(`obligationManager.freq_${f.key}`, f.label)}
                      </button>
                    ))}
                  </div>
                </div>

                {(frequency === 'MONTHLY' || frequency === 'QUARTERLY') && (
                  <div className="space-y-1.5">
                    <label className="font-semibold text-neutral-700 uppercase tracking-wider text-[11px]">
                      {t('obligationManager.dueDay', 'Due Day of Month')}
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={dueDayOfMonth}
                      onChange={(e) => setDueDayOfMonth(e.target.value)}
                      placeholder="1"
                      className="w-24 px-3 py-2 bg-neutral-50 border border-neutral-200 text-neutral-900 text-sm focus:outline-none focus:border-neutral-900 transition-colors"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Notes */}
            <div className="space-y-1.5">
              <label className="font-semibold text-neutral-700 uppercase tracking-wider text-[11px]">
                {t('obligationManager.notes', 'Notes')}
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder={t('obligationManager.notesPlaceholder', 'Any additional notes...')}
                className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 text-neutral-900 text-sm focus:outline-none focus:border-neutral-900 transition-colors resize-none"
              />
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between pt-2 border-t border-neutral-100">
              <button
                onClick={() => {
                  setStep(1);
                  setSelectedCategory(null);
                }}
                className="flex items-center space-x-1.5 px-4 py-2 border border-neutral-200 text-neutral-600 text-xs font-semibold hover:bg-neutral-50 transition-colors cursor-pointer"
              >
                <ArrowLeft size={13} />
                <span>{t('common.back', 'Back')}</span>
              </button>

              <button
                onClick={() => setStep(3)}
                disabled={!canProceedToReview()}
                className="flex items-center space-x-1.5 px-5 py-2 bg-neutral-900 text-white text-xs font-semibold hover:bg-neutral-800 transition-colors disabled:opacity-40 cursor-pointer"
              >
                <span>{t('obligationManager.reviewBtn', 'Review')}</span>
                <ArrowRight size={13} />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Review */}
        {step === 3 && selectedCategory && (
          <div className="p-5 space-y-4">
            <div className="border border-neutral-200 divide-y divide-neutral-100">
              {/* Summary rows */}
              {[
                { label: 'Type', value: `${selectedCategory.type} — ${CATEGORY_OPTIONS.find((c) => c.key === selectedCategory.key)?.label}` },
                { label: 'Title', value: title },
                ...(counterpartyName ? [{ label: 'Counterparty', value: counterpartyName }] : []),
                { label: 'Amount', value: `₹${Number(amount).toLocaleString('en-IN')}` },
                ...(dueDate ? [{ label: 'Due Date', value: dueDate }] : []),
                ...(isRecurring ? [{ label: 'Recurring', value: `${FREQUENCY_OPTIONS.find((f) => f.key === frequency)?.label}${dueDayOfMonth ? ` (Day ${dueDayOfMonth})` : ''}` }] : []),
                ...(allowPartialPayment ? [{ label: 'Partial Payment', value: 'Allowed' }] : []),
                ...(penaltyRate ? [{ label: 'Penalty Rate', value: `₹${penaltyRate}/day` }] : []),
                ...(notes ? [{ label: 'Notes', value: notes }] : []),
              ].map((row, idx) => (
                <div key={idx} className="flex items-baseline justify-between px-4 py-2.5 text-xs">
                  <span className="font-semibold text-neutral-500 uppercase tracking-wider text-[10px]">
                    {row.label}
                  </span>
                  <span className="font-medium text-neutral-900 text-right max-w-[60%]">
                    {row.value}
                  </span>
                </div>
              ))}
            </div>

            {isRecurring && (
              <div className="flex items-start space-x-2 text-xs text-neutral-600 bg-neutral-50 p-3 border border-neutral-100">
                <Repeat size={14} className="text-neutral-400 mt-0.5 shrink-0" />
                <span>
                  {t('obligationManager.recurringNote', 'A RecurringExpense record will also be created. When you mark this obligation as Paid, the next period\'s obligation will be auto-generated.')}
                </span>
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between pt-2 border-t border-neutral-100">
              <button
                onClick={() => setStep(2)}
                className="flex items-center space-x-1.5 px-4 py-2 border border-neutral-200 text-neutral-600 text-xs font-semibold hover:bg-neutral-50 transition-colors cursor-pointer"
              >
                <ArrowLeft size={13} />
                <span>{t('common.back', 'Back')}</span>
              </button>

              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex items-center space-x-1.5 px-5 py-2.5 bg-neutral-900 text-white text-xs font-bold hover:bg-neutral-800 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {submitting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent animate-spin" />
                    <span>{t('obligationManager.creating', 'Creating...')}</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={14} />
                    <span>{t('obligationManager.createBtn', 'Create Obligation')}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
