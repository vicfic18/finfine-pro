'use client';

import React, { useState, useEffect } from 'react';
import {
  Building2,
  ShieldAlert,
  Trash2,
  Save,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';

interface MerchantSettings {
  tenantId: string;
  businessName: string;
  tradeName?: string;
  gstin?: string;
  pan?: string;
  category?: string;
  minimumCashBuffer: number;
  bufferRuleType?: string;
  defaultForecastHorizonDays?: number;
  lowRunwayAlertDays?: number;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<MerchantSettings>({
    tenantId: 'msme-001',
    businessName: '',
    tradeName: '',
    gstin: '',
    pan: '',
    category: 'Retail & Distribution',
    minimumCashBuffer: 10000,
    bufferRuleType: 'ABSOLUTE_INR',
    defaultForecastHorizonDays: 60,
    lowRunwayAlertDays: 14,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Reset state
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetSuccessMessage, setResetSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch('/api/dashboard/settings');
        if (!res.ok) throw new Error('Failed to load settings');
        const data = await res.json();
        setSettings(data);
      } catch (err: any) {
        setErrorMessage(err.message || 'Error loading settings');
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveSuccess(false);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/dashboard/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (!res.ok) throw new Error('Failed to save settings');
      const updated = await res.json();
      setSettings(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error saving settings');
    } finally {
      setSaving(false);
    }
  };

  const handleResetData = async () => {
    setResetting(true);
    setErrorMessage(null);
    setResetSuccessMessage(null);

    try {
      const res = await fetch('/api/dashboard/settings', {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Failed to reset account data');
      const result = await res.json();
      setShowResetConfirm(false);
      setResetSuccessMessage(`Account data cleared successfully. (${result.deletedCount || 0} records purged)`);
      setTimeout(() => setResetSuccessMessage(null), 6000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error resetting data');
    } finally {
      setResetting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center space-y-4 font-sans bg-white">
        <div className="w-8 h-8 border-2 border-neutral-900 border-t-transparent animate-spin" />
        <div className="text-xs uppercase tracking-widest font-semibold text-neutral-500">
          Loading Settings...
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col max-w-4xl mx-auto w-full font-sans bg-white border border-neutral-200 divide-y divide-neutral-200">
      {/* Header */}
      <header className="p-6 sm:p-8 bg-white">
        <div className="font-sans font-bold text-xs uppercase tracking-widest text-neutral-400 mb-2">
          FinFine Pro
        </div>
        <h1 className="font-display font-bold text-3xl sm:text-4xl text-neutral-900 tracking-tight">
          Settings
        </h1>
        <p className="text-xs sm:text-sm text-neutral-500 mt-1">
          Manage your business profile, safety cash buffer, and account data.
        </p>
      </header>

      {/* Notifications */}
      {saveSuccess && (
        <div className="p-4 bg-emerald-50 text-emerald-900 text-xs font-medium flex items-center space-x-2 border-b border-emerald-100">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          <span>Settings saved successfully. All dashboard metrics will reflect these updates.</span>
        </div>
      )}

      {resetSuccessMessage && (
        <div className="p-4 bg-amber-50 text-amber-900 text-xs font-medium flex items-center space-x-2 border-b border-amber-100">
          <CheckCircle2 size={16} className="text-amber-600 shrink-0" />
          <span>{resetSuccessMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 bg-rose-50 text-rose-900 text-xs font-medium flex items-center space-x-2 border-b border-rose-100">
          <AlertTriangle size={16} className="text-rose-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Main Settings Form */}
      <form onSubmit={handleSave} className="divide-y divide-neutral-200">
        {/* Section 1: Business Profile */}
        <div className="p-6 sm:p-8 space-y-6 bg-white">
          <div className="flex items-center space-x-2">
            <Building2 size={18} className="text-neutral-700" />
            <h2 className="font-display font-bold text-xl text-neutral-900">
              Business Profile
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 text-xs">
            <div className="space-y-1.5 sm:col-span-2">
              <label className="font-semibold text-neutral-700 uppercase tracking-wider text-[11px]">
                Business Name
              </label>
              <input
                type="text"
                required
                value={settings.businessName}
                onChange={(e) => setSettings({ ...settings, businessName: e.target.value })}
                placeholder="e.g. Acme Enterprises"
                className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 text-neutral-900 font-medium focus:outline-none focus:border-neutral-900 transition-colors"
              />
              <span className="text-[10px] text-neutral-400">
                This name displays prominently on your dashboard header and reports.
              </span>
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-neutral-700 uppercase tracking-wider text-[11px]">
                Trade Name
              </label>
              <input
                type="text"
                value={settings.tradeName || ''}
                onChange={(e) => setSettings({ ...settings, tradeName: e.target.value })}
                placeholder="e.g. Acme Stores"
                className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 text-neutral-900 focus:outline-none focus:border-neutral-900 transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-neutral-700 uppercase tracking-wider text-[11px]">
                Industry Sector
              </label>
              <select
                value={settings.category || 'Retail & Distribution'}
                onChange={(e) => setSettings({ ...settings, category: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 text-neutral-900 focus:outline-none focus:border-neutral-900 transition-colors"
              >
                <option value="Retail & Distribution">Retail & Distribution</option>
                <option value="Textiles & Apparel">Textiles & Apparel</option>
                <option value="Manufacturing & Production">Manufacturing & Production</option>
                <option value="FMCG & Groceries">FMCG & Groceries</option>
                <option value="Services & Consulting">Services & Consulting</option>
                <option value="Electronics & Hardware">Electronics & Hardware</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-neutral-700 uppercase tracking-wider text-[11px]">
                GSTIN
              </label>
              <input
                type="text"
                value={settings.gstin || ''}
                onChange={(e) => setSettings({ ...settings, gstin: e.target.value.toUpperCase() })}
                placeholder="27AABCS1429B1Z5"
                className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 font-mono text-neutral-900 focus:outline-none focus:border-neutral-900 transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-neutral-700 uppercase tracking-wider text-[11px]">
                PAN
              </label>
              <input
                type="text"
                value={settings.pan || ''}
                onChange={(e) => setSettings({ ...settings, pan: e.target.value.toUpperCase() })}
                placeholder="AABCS1429B"
                className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 font-mono text-neutral-900 focus:outline-none focus:border-neutral-900 transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Financial Rules & Thresholds */}
        <div className="p-6 sm:p-8 space-y-6 bg-white">
          <div className="flex items-center space-x-2">
            <ShieldAlert size={18} className="text-neutral-700" />
            <h2 className="font-display font-bold text-xl text-neutral-900">
              Safety Rules
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 text-xs">
            <div className="space-y-1.5">
              <label className="font-semibold text-neutral-700 uppercase tracking-wider text-[11px]">
                Minimum Cash Safety Buffer (₹)
              </label>
              <input
                type="number"
                min="0"
                step="1000"
                value={settings.minimumCashBuffer}
                onChange={(e) =>
                  setSettings({ ...settings, minimumCashBuffer: Number(e.target.value) })
                }
                className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 font-mono text-neutral-900 font-bold focus:outline-none focus:border-neutral-900 transition-colors"
              />
              <span className="text-[10px] text-neutral-400">
                Amount kept in reserve before calculating spendable liquidity.
              </span>
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-neutral-700 uppercase tracking-wider text-[11px]">
                Low Runway Warning Threshold (Days)
              </label>
              <input
                type="number"
                min="3"
                max="60"
                value={settings.lowRunwayAlertDays || 14}
                onChange={(e) =>
                  setSettings({ ...settings, lowRunwayAlertDays: Number(e.target.value) })
                }
                className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 font-mono text-neutral-900 font-bold focus:outline-none focus:border-neutral-900 transition-colors"
              />
              <span className="text-[10px] text-neutral-400">
                Triggers visual alert when projected zero-cash date is closer than this.
              </span>
            </div>
          </div>
        </div>

        {/* Action Save Bar */}
        <div className="p-6 sm:p-8 bg-neutral-50 flex items-center justify-between">
          <span className="text-xs text-neutral-500">
            Tenant ID: <span className="font-mono font-semibold text-neutral-800">{settings.tenantId}</span>
          </span>

          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 bg-neutral-900 hover:bg-neutral-800 text-white font-semibold text-xs transition-colors flex items-center space-x-2 disabled:opacity-50"
          >
            {saving ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save size={14} />
                <span>Save Changes</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Section 3: Reset Account Data (Purge for Fresh Manual Uploads) */}
      <div className="p-6 sm:p-8 bg-white space-y-4">
        <div className="flex items-center space-x-2 text-rose-700">
          <Trash2 size={18} />
          <h2 className="font-display font-bold text-xl text-neutral-900">
            Reset Data
          </h2>
        </div>

        <p className="text-xs text-neutral-600 leading-relaxed max-w-2xl">
          Permanently delete all parsed bank statements, invoices, extracted transactions, obligations, and
          cash snapshots for this tenant. Use this to start with a completely blank slate and upload your own statements.
        </p>

        {!showResetConfirm ? (
          <button
            type="button"
            onClick={() => setShowResetConfirm(true)}
            className="px-4 py-2 border border-rose-300 text-rose-700 hover:bg-rose-50 font-semibold text-xs transition-colors"
          >
            Reset All Financial Data
          </button>
        ) : (
          <div className="p-4 bg-rose-50 border border-rose-200 space-y-3 max-w-xl">
            <div className="flex items-start space-x-2 text-rose-900 text-xs">
              <AlertTriangle size={16} className="text-rose-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block">Are you absolutely sure?</span>
                <span>All documents, ledger records, and obligations will be wiped immediately.</span>
              </div>
            </div>

            <div className="flex items-center space-x-3 pt-1">
              <button
                type="button"
                disabled={resetting}
                onClick={handleResetData}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition-colors disabled:opacity-50 flex items-center space-x-2"
              >
                {resetting ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    <span>Resetting...</span>
                  </>
                ) : (
                  <span>Yes, Delete All Records</span>
                )}
              </button>

              <button
                type="button"
                disabled={resetting}
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 bg-white border border-neutral-300 text-neutral-700 font-semibold text-xs hover:bg-neutral-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
