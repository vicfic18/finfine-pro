'use client';

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Link from 'next/link';
import {
  Building2,
  ShieldAlert,
  Trash2,
  Save,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Languages,
  ShieldCheck,
  ArrowUpRight,
} from 'lucide-react';
import LanguageSelector from '@/components/ui/LanguageSelector';
import FinFineProLoader from '@/components/ui/FinFineProLoader';
import BrandLogo from '@/components/ui/BrandLogo';

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
  const { t } = useTranslation();
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
    return <FinFineProLoader />;
  }

  return (
    <div className="flex flex-col max-w-4xl mx-auto w-full font-sans space-y-6 pb-16">
      {/* 1. Header with Breadcrumbs */}
      <div className="space-y-2">
        <div className="flex items-center space-x-2 text-xs font-medium text-neutral-400">
          <Link href="/dashboard" className="hover:opacity-80 transition-opacity flex items-center">
            <BrandLogo size="sm" />
          </Link>
          <span>/</span>
          <span className="text-neutral-900 font-semibold">{t('nav.settings', 'Settings')}</span>
        </div>

        <header className="pt-1">
          <h1 className="font-display font-bold text-3xl sm:text-4xl text-neutral-900 tracking-tight leading-tight">
            {t('settings.title', 'Merchant & Financial Settings')}
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-1">
            {t('settings.subtitle', 'Configure business identity, legal identifiers, liquidity safety buffers, and language preferences.')}
          </p>
        </header>
      </div>

      {/* Notifications */}
      {saveSuccess && (
        <div className="p-4 bg-emerald-50 text-emerald-900 text-xs font-medium flex items-center space-x-2 border border-emerald-200 animate-in fade-in">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          <span>{t('settings.savedSuccess', 'Settings successfully updated.')}</span>
        </div>
      )}

      {resetSuccessMessage && (
        <div className="p-4 bg-amber-50 text-amber-900 text-xs font-medium flex items-center space-x-2 border border-amber-200 animate-in fade-in">
          <CheckCircle2 size={16} className="text-amber-600 shrink-0" />
          <span>{resetSuccessMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 bg-red-50 text-red-900 text-xs font-medium flex items-center space-x-2 border border-red-200 animate-in fade-in">
          <AlertTriangle size={16} className="text-red-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Main Settings Form */}
      <form onSubmit={handleSave} className="bg-white border border-neutral-200 divide-y divide-neutral-200 shadow-xs">
        {/* Section 1: Business Identity & Identifiers */}
        <div className="p-6 sm:p-8 space-y-6">
          <div className="flex items-center space-x-2">
            <Building2 size={18} className="text-neutral-700" />
            <h2 className="font-display font-bold text-xl text-neutral-900">
              {t('settings.profileSection', 'Business Identity & Legal Identifiers')}
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 text-xs">
            <div className="space-y-1.5 sm:col-span-2">
              <label className="font-semibold text-neutral-700 uppercase tracking-wider text-[11px]">
                {t('settings.businessName', 'Registered Legal Name')}
              </label>
              <input
                type="text"
                required
                value={settings.businessName}
                onChange={(e) => setSettings({ ...settings, businessName: e.target.value })}
                placeholder={t('settings.businessNamePlaceholder', 'e.g. Rameshwaram Enterprise Pvt Ltd')}
                className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 text-neutral-900 font-medium focus:outline-none focus:border-neutral-900 transition-colors"
              />
              <span className="text-[10px] text-neutral-400">
                {t('settings.businessNameSub', 'Used on invoices and statutory financial filings')}
              </span>
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-neutral-700 uppercase tracking-wider text-[11px]">
                {t('settings.tradeName', 'Brand / Trade Name')}
              </label>
              <input
                type="text"
                value={settings.tradeName || ''}
                onChange={(e) => setSettings({ ...settings, tradeName: e.target.value })}
                placeholder={t('settings.tradeNamePlaceholder', 'e.g. Rameshwaram Stores')}
                className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 text-neutral-900 focus:outline-none focus:border-neutral-900 transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-neutral-700 uppercase tracking-wider text-[11px]">
                {t('settings.industrySector', 'Primary Industry Sector')}
              </label>
              <select
                value={settings.category || 'Retail & Distribution'}
                onChange={(e) => setSettings({ ...settings, category: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 text-neutral-900 focus:outline-none focus:border-neutral-900 transition-colors"
              >
                <option value="Retail & Distribution">Retail & Distribution (Kirana, Supermarkets)</option>
                <option value="Jewelry & Wedding Apparel">Jewelry, Wedding Apparel & Event Venues</option>
                <option value="Corporate B2B & Manufacturing">Corporate B2B & Industrial Manufacturing</option>
                <option value="IT & Professional Services">IT, Digital Agencies & Consultancies</option>
                <option value="Custom Sector">Custom MSME Configuration</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-neutral-700 uppercase tracking-wider text-[11px]">
                {t('settings.gstin')}
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
                {t('settings.pan')}
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
              {t('settings.safetySection')}
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 text-xs">
            <div className="space-y-1.5">
              <label className="font-semibold text-neutral-700 uppercase tracking-wider text-[11px]">
                {t('settings.safetyBuffer')}
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
                {t('settings.safetyBufferSub')}
              </span>
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-neutral-700 uppercase tracking-wider text-[11px]">
                {t('settings.lowRunwayThreshold')}
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
                {t('settings.lowRunwaySub')}
              </span>
            </div>
          </div>
        </div>

        {/* Section 3: Language & Localisation */}
        <div className="p-6 sm:p-8 space-y-6 bg-white">
          <div className="flex items-center space-x-2">
            <Languages size={18} className="text-neutral-700" />
            <h2 className="font-display font-bold text-xl text-neutral-900">
              {t('settings.languageSection')}
            </h2>
          </div>
          <p className="text-xs text-neutral-500">
            {t('settings.languageSub')}
          </p>
          <LanguageSelector variant="pills" />
        </div>

        {/* Action Save Bar */}
        <div className="p-6 sm:p-8 bg-neutral-50 flex items-center justify-between">
          <span className="text-xs text-neutral-500">
            {t('settings.tenantId')} <span className="font-mono font-semibold text-neutral-800">{settings.tenantId}</span>
          </span>

          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 bg-neutral-900 hover:bg-neutral-800 text-white font-semibold text-xs transition-colors flex items-center space-x-2 disabled:opacity-50 cursor-pointer"
          >
            {saving ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                <span>{t('settings.saving')}</span>
              </>
            ) : (
              <>
                <Save size={14} />
                <span>{t('settings.saveChanges')}</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Section 4: Reset Account Data (Purge for Fresh Manual Uploads) */}
      <div className="p-6 sm:p-8 bg-white space-y-4">
        <div className="flex items-center space-x-2 text-rose-700">
          <Trash2 size={18} />
          <h2 className="font-display font-bold text-xl text-neutral-900">
            {t('settings.resetSection')}
          </h2>
        </div>

        <p className="text-xs text-neutral-600 leading-relaxed max-w-2xl">
          {t('settings.resetDesc')}
        </p>

        {!showResetConfirm ? (
          <button
            type="button"
            onClick={() => setShowResetConfirm(true)}
            className="px-4 py-2 border border-rose-300 text-rose-700 hover:bg-rose-50 font-semibold text-xs transition-colors cursor-pointer"
          >
            {t('settings.resetBtn')}
          </button>
        ) : (
          <div className="p-4 bg-rose-50 border border-rose-200 space-y-3 max-w-xl">
            <div className="flex items-start space-x-2 text-rose-900 text-xs">
              <AlertTriangle size={16} className="text-rose-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block">{t('settings.resetConfirmTitle')}</span>
                <span>{t('settings.resetConfirmSub')}</span>
              </div>
            </div>

            <div className="flex items-center space-x-3 pt-1">
              <button
                type="button"
                disabled={resetting}
                onClick={handleResetData}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition-colors disabled:opacity-50 flex items-center space-x-2 cursor-pointer"
              >
                {resetting ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    <span>{t('settings.resettingBtn')}</span>
                  </>
                ) : (
                  <span>{t('settings.resetConfirmBtn')}</span>
                )}
              </button>

              <button
                type="button"
                disabled={resetting}
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 bg-white border border-neutral-300 text-neutral-700 font-semibold text-xs hover:bg-neutral-50 transition-colors cursor-pointer"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
