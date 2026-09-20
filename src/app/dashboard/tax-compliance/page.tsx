'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ShieldAlert,
  ShieldCheck,
  Building2,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Info,
  Scale,
  DollarSign,
  Users,
  ChevronRight,
  ArrowUpRight,
  HelpCircle,
  Sparkles,
} from 'lucide-react';
import clsx from 'clsx';
import FinFineProLoader from '@/components/ui/FinFineProLoader';
import type {
  BusinessEntityType,
  TurnoverBracket,
  GstSchemeType,
  TaxCategory,
  TaxComplianceRule,
  MerchantTaxProfile,
  MatchedTaxRule,
} from '@/lib/tax-rules-engine';

const INDIAN_STATES = [
  'Maharashtra',
  'Karnataka',
  'Tamil Nadu',
  'Delhi',
  'Gujarat',
  'Telangana',
  'West Bengal',
  'Uttar Pradesh',
  'Rajasthan',
  'Kerala',
  'Haryana',
  'Punjab',
  'Madhya Pradesh',
  'Other State / UT',
];

const TURNOVER_BRACKETS: Array<{ key: TurnoverBracket; label: string; min: number; max: number }> = [
  { key: 'BELOW_20L', label: 'Under ₹20 Lakhs', min: 0, max: 2000000 },
  { key: '20L_40L', label: '₹20L – ₹40 Lakhs', min: 2000000, max: 4000000 },
  { key: '40L_1_5CR', label: '₹40L – ₹1.5 Crore', min: 4000000, max: 15000000 },
  { key: '1_5CR_5CR', label: '₹1.5Cr – ₹5 Crore', min: 15000000, max: 50000000 },
  { key: 'ABOVE_5CR', label: 'Above ₹5 Crore', min: 50000000, max: 200000000 },
];

export default function TaxCompliancePage() {
  const { t } = useTranslation();

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Profile & Rules State
  const [profile, setProfile] = useState<MerchantTaxProfile>({
    tenantId: 'msme-001',
    entityType: 'SOLE_PROPRIETORSHIP',
    turnoverBracket: '40L_1_5CR',
    annualTurnover: 5000000,
    gstScheme: 'REGULAR_MONTHLY',
    employeeCount: 8,
    state: 'Maharashtra',
    pan: '',
    gstin: '',
    tan: '',
    cin: '',
    selectedRuleCodes: [],
    customRuleAmounts: {},
    acknowledgedWarnings: [],
  });

  const [rules, setRules] = useState<TaxComplianceRule[]>([]);
  const [activeTab, setActiveTab] = useState<'ALL' | TaxCategory>('ALL');

  // Warning Modal State
  const [pendingRemovalRule, setPendingRemovalRule] = useState<TaxComplianceRule | null>(null);
  const [showWarningModal, setShowWarningModal] = useState<boolean>(false);

  // Load compliance profile & catalog
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const res = await fetch('/api/compliance/rules');
        if (!res.ok) throw new Error('Failed to load compliance rules from server');
        const data = await res.json();
        if (data.profile) setProfile(data.profile);
        if (data.rules) setRules(data.rules);
      } catch (err: any) {
        setErrorMessage(err.message || 'Error loading compliance settings');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Recalculate matching rules dynamically whenever profile or catalog changes
  const matchedRules = useMemo(() => {
    if (!rules.length) return [];
    
    // Evaluate applicability criteria
    return rules
      .map((rule) => {
        const crit = rule.applicabilityCriteria;

        // 1. Entity check
        const matchesEntity = crit.entityTypes.includes(profile.entityType);
        if (!matchesEntity) return null;

        // 2. Turnover check
        if (crit.minTurnoverInr && profile.annualTurnover < crit.minTurnoverInr) return null;
        if (crit.maxTurnoverInr && profile.annualTurnover > crit.maxTurnoverInr) return null;

        // 3. GST Scheme check
        if (crit.gstSchemes && !crit.gstSchemes.includes(profile.gstScheme)) return null;

        // 4. Employee count check
        if (crit.minEmployees && profile.employeeCount < crit.minEmployees) return null;

        // 5. State check
        if (crit.applicableStates && crit.applicableStates.length > 0) {
          if (!crit.applicableStates.map((s) => s.toLowerCase()).includes((profile.state || '').toLowerCase())) {
            return null;
          }
        }

        const isSelected = profile.selectedRuleCodes.includes(rule.ruleCode);
        const customAmount = profile.customRuleAmounts[rule.ruleCode];
        const estimatedAmount = customAmount !== undefined ? customAmount : rule.defaultEstimatedAmount;

        return {
          rule,
          isMandatory: crit.isMandatory,
          estimatedAmount,
          isSelected,
        };
      })
      .filter(Boolean) as Array<{
        rule: TaxComplianceRule;
        isMandatory: boolean;
        estimatedAmount: number;
        isSelected: boolean;
      }>;
  }, [profile, rules]);

  // Filtered by selected category tab
  const filteredMatches = useMemo(() => {
    if (activeTab === 'ALL') return matchedRules;
    return matchedRules.filter((m) => m.rule.category === activeTab);
  }, [matchedRules, activeTab]);

  // Mandatory items summary
  const mandatoryCount = matchedRules.filter((m) => m.isMandatory).length;
  const activeCount = matchedRules.filter((m) => m.isSelected).length;

  // Checkbox toggle handler with mandatory warning protection
  const handleToggleObligation = (match: { rule: TaxComplianceRule; isMandatory: boolean; isSelected: boolean }) => {
    const { rule, isMandatory, isSelected } = match;

    if (isSelected) {
      // Trying to uncheck
      if (isMandatory) {
        // Trigger statutory non-compliance warning modal
        setPendingRemovalRule(rule);
        setShowWarningModal(true);
        return;
      }

      // Safe to remove optional
      setProfile((prev) => ({
        ...prev,
        selectedRuleCodes: prev.selectedRuleCodes.filter((code) => code !== rule.ruleCode),
      }));
    } else {
      // Checking obligation
      setProfile((prev) => ({
        ...prev,
        selectedRuleCodes: Array.from(new Set([...prev.selectedRuleCodes, rule.ruleCode])),
      }));
    }
  };

  // Confirm removal of mandatory rule after acknowledging statutory risk
  const handleConfirmRemoval = () => {
    if (!pendingRemovalRule) return;

    setProfile((prev) => ({
      ...prev,
      selectedRuleCodes: prev.selectedRuleCodes.filter((code) => code !== pendingRemovalRule.ruleCode),
      acknowledgedWarnings: Array.from(new Set([...prev.acknowledgedWarnings, pendingRemovalRule.ruleCode])),
    }));

    setShowWarningModal(false);
    setPendingRemovalRule(null);
  };

  // Amount update handler
  const handleAmountChange = (ruleCode: string, value: number) => {
    setProfile((prev) => ({
      ...prev,
      customRuleAmounts: {
        ...prev.customRuleAmounts,
        [ruleCode]: Math.max(0, value),
      },
    }));
  };

  // Save changes & synchronize to ledger
  const handleSave = async () => {
    setSaving(true);
    setSaveSuccess(false);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/compliance/rules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });

      if (!res.ok) throw new Error('Failed to save compliance configuration');
      const data = await res.json();
      if (data.profile) setProfile(data.profile);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 5000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <FinFineProLoader />;
  }

  return (
    <div className="flex flex-col max-w-6xl mx-auto w-full font-sans bg-white border border-neutral-200 divide-y divide-neutral-200 mb-20">
      {/* 1. Header Section */}
      <header className="p-6 sm:p-8 bg-white flex flex-col sm:flex-row sm:items-baseline justify-between gap-4">
        <div>
          <div className="font-sans font-bold text-xs uppercase tracking-widest text-neutral-400 mb-2">
            FinFine Pro • Statutory Compliance & Tax Profile
          </div>
          <h1 className="font-display font-bold text-3xl sm:text-4xl text-neutral-900 tracking-tight">
            Tax & Statutory Compliance Settings
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-1 max-w-3xl">
            Configure your enterprise classification, turnover level, and statutory obligations. The ruleset engine dynamically calculates your mandatory filing deadlines, tax lockbox reserves, and legal penalties across GST, Income Tax, Payroll, and Corporate governance.
          </p>
        </div>

        {/* Global Save Button */}
        <div className="sm:self-center">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50 flex items-center space-x-2"
          >
            {saving ? (
              <span>Saving & Updating Ledger...</span>
            ) : (
              <>
                <ShieldCheck size={16} />
                <span>Save & Sync Calendar</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Notifications */}
      {saveSuccess && (
        <div className="p-4 bg-emerald-50 text-emerald-900 text-xs font-semibold flex items-center space-x-2">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          <span>Compliance profile and statutory obligations successfully synchronized with your cash flow calendar ledger.</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 bg-red-50 text-red-900 text-xs font-semibold flex items-center space-x-2">
          <AlertTriangle size={16} className="text-red-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* 2. Business Classification & Entity Level */}
      <section className="p-6 sm:p-8 bg-white space-y-6">
        <div className="flex items-center space-x-2 border-b border-neutral-100 pb-3">
          <Building2 className="w-5 h-5 text-neutral-900" />
          <h2 className="font-display font-bold text-xl text-neutral-900">
            1. Business Level & Entity Classification
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Entity Type */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-neutral-500 block">
              Business Legal Entity
            </label>
            <select
              value={profile.entityType}
              onChange={(e) =>
                setProfile((p) => ({
                  ...p,
                  entityType: e.target.value as BusinessEntityType,
                }))
              }
              className="w-full p-2.5 bg-white border border-neutral-300 text-xs font-semibold text-neutral-900 focus:outline-none focus:border-neutral-900"
            >
              <option value="SOLE_PROPRIETORSHIP">Sole Proprietorship (Individual MSME)</option>
              <option value="PARTNERSHIP">Partnership Firm</option>
              <option value="LLP">Limited Liability Partnership (LLP)</option>
              <option value="PVT_LTD">Private Limited Company (Pvt Ltd)</option>
              <option value="FREELANCER">Independent Professional / Freelancer</option>
            </select>
            <span className="text-[11px] text-neutral-400 block">
              Directs statutory MCA, Audit, and partnership taxation rules.
            </span>
          </div>

          {/* Annual Turnover Bracket */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-neutral-500 block">
              Annual Turnover Range
            </label>
            <select
              value={profile.turnoverBracket}
              onChange={(e) => {
                const bracketKey = e.target.value as TurnoverBracket;
                const match = TURNOVER_BRACKETS.find((b) => b.key === bracketKey);
                setProfile((p) => ({
                  ...p,
                  turnoverBracket: bracketKey,
                  annualTurnover: match ? (match.min + match.max) / 2 : p.annualTurnover,
                }));
              }}
              className="w-full p-2.5 bg-white border border-neutral-300 text-xs font-semibold text-neutral-900 focus:outline-none focus:border-neutral-900"
            >
              {TURNOVER_BRACKETS.map((b) => (
                <option key={b.key} value={b.key}>
                  {b.label}
                </option>
              ))}
            </select>
            <span className="text-[11px] text-neutral-400 block">
              Determines GST registration and Section 44AB Tax Audit thresholds.
            </span>
          </div>

          {/* GST Scheme */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-neutral-500 block">
              GST Registration Scheme
            </label>
            <select
              value={profile.gstScheme}
              onChange={(e) =>
                setProfile((p) => ({
                  ...p,
                  gstScheme: e.target.value as GstSchemeType,
                }))
              }
              className="w-full p-2.5 bg-white border border-neutral-300 text-xs font-semibold text-neutral-900 focus:outline-none focus:border-neutral-900"
            >
              <option value="REGULAR_MONTHLY">Regular Monthly (GSTR-1 & GSTR-3B)</option>
              <option value="QRMP_QUARTERLY">QRMP Scheme (Quarterly return with IFF)</option>
              <option value="COMPOSITION">Composition Scheme (Quarterly CMP-08)</option>
              <option value="UNREGISTERED">Unregistered / Below Threshold / Exempt</option>
            </select>
            <span className="text-[11px] text-neutral-400 block">
              Automates monthly 11th/20th or quarterly 18th filing schedule.
            </span>
          </div>

          {/* Employee Count */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                Workforce / Employee Count
              </label>
              <span className="text-xs font-bold text-neutral-900 font-mono">
                {profile.employeeCount} Employees
              </span>
            </div>
            <input
              type="number"
              min="0"
              max="1000"
              value={profile.employeeCount}
              onChange={(e) =>
                setProfile((p) => ({
                  ...p,
                  employeeCount: Math.max(0, parseInt(e.target.value) || 0),
                }))
              }
              className="w-full p-2 bg-white border border-neutral-300 text-xs font-semibold text-neutral-900 focus:outline-none focus:border-neutral-900"
            />
            <div className="text-[11px] text-neutral-500 flex items-center space-x-2">
              <span className={clsx(profile.employeeCount >= 10 ? 'text-amber-700 font-bold' : 'text-neutral-400')}>
                • ESI (10+)
              </span>
              <span className={clsx(profile.employeeCount >= 20 ? 'text-amber-700 font-bold' : 'text-neutral-400')}>
                • EPF (20+)
              </span>
            </div>
          </div>

          {/* Operating State */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-neutral-500 block">
              Operating State (Professional Tax)
            </label>
            <select
              value={profile.state}
              onChange={(e) => setProfile((p) => ({ ...p, state: e.target.value }))}
              className="w-full p-2.5 bg-white border border-neutral-300 text-xs font-semibold text-neutral-900 focus:outline-none focus:border-neutral-900"
            >
              {INDIAN_STATES.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
            <span className="text-[11px] text-neutral-400 block">
              Governs state-specific Professional Tax (PT) monthly filings.
            </span>
          </div>

          {/* Exact Estimated Annual Turnover */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-neutral-500 block">
              Estimated Annual Turnover (₹)
            </label>
            <input
              type="number"
              step="50000"
              value={profile.annualTurnover}
              onChange={(e) =>
                setProfile((p) => ({
                  ...p,
                  annualTurnover: Math.max(0, parseFloat(e.target.value) || 0),
                }))
              }
              className="w-full p-2 bg-white border border-neutral-300 text-xs font-semibold text-neutral-900 focus:outline-none focus:border-neutral-900"
            />
            <span className="text-[11px] text-neutral-400 block font-mono">
              ₹{profile.annualTurnover.toLocaleString('en-IN')}
            </span>
          </div>
        </div>
      </section>

      {/* 3. Automated Matching Intelligence Banner */}
      <section className="p-4 sm:p-6 bg-neutral-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-neutral-200">
        <div className="flex items-start space-x-3">
          <div className="p-2 bg-neutral-900 text-white shrink-0 mt-0.5">
            <Scale size={18} />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-neutral-400">
              Ruleset Engine Analysis
            </div>
            <div className="text-sm font-bold text-neutral-900 mt-0.5">
              Matched {matchedRules.length} statutory compliance rails for your profile ({mandatoryCount} statutorily mandatory).
            </div>
            <p className="text-xs text-neutral-500 mt-0.5">
              Select or customize obligations below. Unchecking mandatory obligations will trigger statutory non-compliance warnings.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-4 shrink-0 text-xs">
          <div className="text-right">
            <span className="text-neutral-500 block text-[11px]">Active in Calendar</span>
            <span className="font-bold text-base text-neutral-900">
              {activeCount} / {matchedRules.length}
            </span>
          </div>
        </div>
      </section>

      {/* 4. Interactive Checkbox-Style Obligations Selector */}
      <section className="p-6 sm:p-8 bg-white space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-100 pb-3">
          <div>
            <h2 className="font-display font-bold text-xl text-neutral-900">
              2. Statutory Obligations & Tax Schedule
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Manage your compliance calendar. Active items are automatically factored into your cash runway and tax lockbox.
            </p>
          </div>

          {/* Category Filter Tabs */}
          <div className="flex flex-wrap gap-1.5 bg-neutral-100 p-1">
            {(['ALL', 'GST', 'TDS', 'ADVANCE_TAX', 'PAYROLL', 'MCA_ROC', 'AUDIT'] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveTab(cat)}
                className={clsx(
                  'px-3 py-1 text-[11px] font-bold uppercase tracking-wider transition-all',
                  activeTab === cat
                    ? 'bg-neutral-900 text-white shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200'
                )}
              >
                {cat === 'ALL'
                  ? 'All'
                  : cat === 'MCA_ROC'
                  ? 'ROC / MCA'
                  : cat === 'ADVANCE_TAX'
                  ? 'Advance Tax'
                  : cat}
              </button>
            ))}
          </div>
        </div>

        {/* Obligations Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredMatches.length === 0 ? (
            <div className="col-span-2 p-8 text-center text-xs text-neutral-400 bg-neutral-50 border border-neutral-200">
              No statutory obligations matched for this category under your current business profile.
            </div>
          ) : (
            filteredMatches.map(({ rule, isMandatory, estimatedAmount, isSelected }) => {
              return (
                <div
                  key={rule.ruleCode}
                  className={clsx(
                    'p-5 border transition-all flex flex-col justify-between space-y-4',
                    isSelected
                      ? 'border-neutral-900 bg-white shadow-xs'
                      : 'border-neutral-200 bg-neutral-50/60 opacity-75'
                  )}
                >
                  {/* Top Row: Checkbox, Title, Badges */}
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <label className="flex items-start space-x-3 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleObligation({ rule, isMandatory, isSelected })}
                          className="mt-1 w-4 h-4 rounded-none border-neutral-300 text-neutral-900 focus:ring-neutral-900 cursor-pointer"
                        />
                        <div>
                          <div className="font-bold text-sm text-neutral-900 leading-snug">
                            {rule.title}
                          </div>
                          <div className="text-[11px] text-neutral-500 font-mono mt-0.5">
                            {rule.form} • {rule.taxAuthority}
                          </div>
                        </div>
                      </label>

                      {/* Mandatory / Optional Badge */}
                      <div className="shrink-0">
                        {isMandatory ? (
                          <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 uppercase">
                            Mandatory
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-semibold bg-neutral-200 text-neutral-700 uppercase">
                            Recommended
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Rule Description & Schedule Rule */}
                    <p className="text-xs text-neutral-600 mt-2.5 line-clamp-2">
                      {rule.description}
                    </p>

                    <div className="mt-3 text-[11px] text-neutral-500 space-y-1">
                      <div className="flex items-center space-x-1.5">
                        <Calendar size={13} className="text-neutral-400 shrink-0" />
                        <span>
                          <strong>Schedule:</strong> {rule.frequency === 'MONTHLY' ? `Monthly by the ${rule.dueDay}th` : `Quarterly / Annual on ${rule.dueDay}th`}
                        </span>
                      </div>
                      <div className="text-[11px] text-neutral-400 font-mono">
                        {rule.legalSection}
                      </div>
                    </div>
                  </div>

                  {/* Bottom Row: Estimated Outflow & Penalty */}
                  <div className="pt-3 border-t border-neutral-100 flex items-end justify-between gap-4">
                    <div className="flex-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block mb-1">
                        Forecast Outflow (₹)
                      </label>
                      <div className="relative max-w-[140px]">
                        <span className="absolute left-2.5 top-2 text-xs font-bold text-neutral-400">₹</span>
                        <input
                          type="number"
                          step="1000"
                          disabled={!isSelected}
                          value={estimatedAmount}
                          onChange={(e) => handleAmountChange(rule.ruleCode, parseFloat(e.target.value) || 0)}
                          className="w-full pl-6 pr-2 py-1.5 bg-white border border-neutral-300 text-xs font-bold text-neutral-900 disabled:bg-neutral-100 disabled:text-neutral-400 focus:outline-none focus:border-neutral-900"
                        />
                      </div>
                    </div>

                    <div className="text-right text-[10px] text-neutral-400 max-w-[180px]">
                      <span className="font-semibold text-neutral-600 block">Late Consequence:</span>
                      <span className="truncate block" title={rule.penaltyClauses}>
                        {rule.penaltyClauses}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* 5. Statutory Non-Compliance Warning Modal */}
      {showWarningModal && pendingRemovalRule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white max-w-lg w-full border border-neutral-900 shadow-2xl p-6 sm:p-8 space-y-6">
            {/* Modal Header */}
            <div className="flex items-start space-x-3">
              <div className="p-2.5 bg-red-100 text-red-700 shrink-0">
                <ShieldAlert size={24} />
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-red-600">
                  Statutory Non-Compliance Alert
                </div>
                <h3 className="font-display font-bold text-xl sm:text-2xl text-neutral-900 mt-1 leading-tight">
                  Remove {pendingRemovalRule.title}?
                </h3>
              </div>
            </div>

            {/* Warning Body */}
            <div className="space-y-3 text-xs text-neutral-700 bg-neutral-50 p-4 border border-neutral-200">
              <p className="font-semibold text-neutral-900">
                This filing is legally mandatory for your business under:
              </p>
              <p className="font-mono text-[11px] text-neutral-800 bg-white p-2 border border-neutral-200">
                {pendingRemovalRule.legalSection}
              </p>
              <p className="text-neutral-600">
                {pendingRemovalRule.riskWarningMessage}
              </p>
              <div className="pt-2 border-t border-neutral-200 text-red-800 font-semibold flex items-center space-x-1.5">
                <AlertTriangle size={14} className="shrink-0" />
                <span>Removing this will distort your cash flow forecast and create unexpected compliance liabilities.</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3 pt-2">
              <button
                onClick={handleConfirmRemoval}
                className="px-4 py-2.5 bg-white hover:bg-neutral-100 text-neutral-600 font-bold text-xs uppercase tracking-wider border border-neutral-300 transition-colors"
              >
                Acknowledge Risk & Exclude
              </button>
              <button
                onClick={() => {
                  setShowWarningModal(false);
                  setPendingRemovalRule(null);
                }}
                className="px-5 py-2.5 bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs uppercase tracking-wider transition-colors shadow-xs"
              >
                Keep Obligation (Recommended)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Footer Sticky Save Bar */}
      <footer className="p-4 sm:p-6 bg-white border-t border-neutral-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="text-xs text-neutral-500">
          Changes will instantly update your <strong>Risk Calendar</strong>, <strong>Tax Checks Widget</strong>, and <strong>Festive Liquidity Radar</strong>.
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="px-8 py-3 bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50 flex items-center justify-center space-x-2 shadow-sm"
        >
          {saving ? (
            <span>Saving Configuration...</span>
          ) : (
            <>
              <ShieldCheck size={16} />
              <span>Save & Update Compliance Calendar</span>
            </>
          )}
        </button>
      </footer>
    </div>
  );
}
