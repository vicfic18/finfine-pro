'use client';

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Link from 'next/link';
import {
  Sparkles,
  Sliders,
  CheckCircle2,
  ArrowLeft,
  Store,
  RefreshCw,
  Save,
  HelpCircle,
  Calendar,
  AlertCircle,
} from 'lucide-react';
import FestiveLiquidityRadar from '@/components/dashboard/FestiveLiquidityRadar';
import RiskCalendar from '@/components/dashboard/RiskCalendar';
import ScenarioSimulator from '@/components/dashboard/ScenarioSimulator';
import TaxChecksWidget from '@/components/dashboard/TaxChecksWidget';
import LanguageSelector from '@/components/ui/LanguageSelector';
import FinFineProLoader from '@/components/ui/FinFineProLoader';
import { AUTHORITATIVE_MARKET_EVENTS_CATALOG } from '@/lib/tax-rules-engine';
import { DEFAULT_ENABLED_FESTIVALS, type FinancialMetricData, type MerchantSettings } from '@/lib/financial-store';

const SECTOR_PRESETS: Record<string, { name: string; description: string; festivals: string[]; weekendSurge: boolean }> = {
  'Retail & Distribution': {
    name: 'Retail & Distribution (Kirana, Supermarkets)',
    description: 'High sensitivity to nationwide mega sales, Diwali, Navratri, and weekend footfall.',
    festivals: [
      'mkt-mega-sales-2026',
      'mkt-navratri-2026',
      'mkt-dussehra-2026',
      'mkt-dhanteras-2026',
      'mkt-diwali-2026',
    ],
    weekendSurge: true,
  },
  'Jewelry & Wedding Apparel': {
    name: 'Jewelry, Wedding Apparel & Event Venues',
    description: 'Directly benefits from Winter Wedding season, Dhanteras gold buying, and festive gifting.',
    festivals: [
      'mkt-dhanteras-2026',
      'mkt-diwali-2026',
      'mkt-winter-weddings-2026',
      'mkt-navratri-2026',
      'mkt-raksha-bandhan-2026',
    ],
    weekendSurge: true,
  },
  'Corporate B2B & Manufacturing': {
    name: 'Corporate B2B & Industrial Manufacturing',
    description: 'Minimal retail festive impact; strictly governed by 7th/20th statutory tax lockboxes.',
    festivals: [],
    weekendSurge: false,
  },
  'IT & Professional Services': {
    name: 'IT, Digital Agencies & Consultancies',
    description: 'Insensitive to wedding or consumer festive surges; driven by quarterly billing cycles.',
    festivals: [],
    weekendSurge: false,
  },
  'Custom Sector': {
    name: 'Custom MSME Configuration',
    description: 'Manually select exactly which Indian festive surges apply to your balance sheet.',
    festivals: DEFAULT_ENABLED_FESTIVALS,
    weekendSurge: true,
  },
};

export default function PredictiveModelingPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<FinancialMetricData | null>(null);
  const [settings, setSettings] = useState<MerchantSettings | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  // Configuration State
  const [businessSector, setBusinessSector] = useState<string>('Retail & Distribution');
  const [enabledFestivals, setEnabledFestivals] = useState<string[]>(DEFAULT_ENABLED_FESTIVALS);
  const [enableWeekendSurge, setEnableWeekendSurge] = useState<boolean>(true);
  const [customMultipliers, setCustomMultipliers] = useState<Record<string, number>>({});

  // Simulation State
  const [unplannedExpense, setUnplannedExpense] = useState<number>(0);
  const [delayDays, setDelayDays] = useState<number>(0);

  const loadDataAndSettings = async () => {
    try {
      const [dataRes, settingsRes] = await Promise.all([
        fetch('/api/dashboard/financial-data'),
        fetch('/api/dashboard/settings'),
      ]);

      if (dataRes.ok) {
        const dataJson = await dataRes.json();
        setData(dataJson);
      }
      if (settingsRes.ok) {
        const settingsJson: MerchantSettings = await settingsRes.json();
        setSettings(settingsJson);
        if (settingsJson.businessSector) setBusinessSector(settingsJson.businessSector);
        if (Array.isArray(settingsJson.enabledFestivals)) setEnabledFestivals(settingsJson.enabledFestivals);
        if (settingsJson.enableWeekendSurge !== undefined) setEnableWeekendSurge(settingsJson.enableWeekendSurge);
        if (settingsJson.festivalMultipliers) setCustomMultipliers(settingsJson.festivalMultipliers);
      }
    } catch (err) {
      console.error('Failed to load predictive modeling data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDataAndSettings();
  }, []);

  const handleSectorChange = (sector: string) => {
    setBusinessSector(sector);
    const preset = SECTOR_PRESETS[sector];
    if (preset && sector !== 'Custom Sector') {
      setEnabledFestivals(preset.festivals);
      setEnableWeekendSurge(preset.weekendSurge);
    }
  };

  const toggleFestival = (eventId: string) => {
    setEnabledFestivals((prev) =>
      prev.includes(eventId) ? prev.filter((id) => id !== eventId) : [...prev, eventId]
    );
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    setSavedSuccess(false);
    try {
      const res = await fetch('/api/dashboard/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessSector,
          enabledFestivals,
          enableWeekendSurge,
          festivalMultipliers: customMultipliers,
        }),
      });

      if (!res.ok) throw new Error('Failed to persist settings');

      // Refresh financial metrics to immediately re-calculate SageMaker forecast with new settings
      const freshDataRes = await fetch('/api/dashboard/financial-data?refresh=true');
      if (freshDataRes.ok) {
        const freshData = await freshDataRes.json();
        setData(freshData);
      }

      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 4000);
    } catch (err) {
      console.error('Error saving predictive settings:', err);
    } finally {
      setSaving(false);
    }
  };

  if (loading || !data) {
    return <FinFineProLoader />;
  }

  return (
    <div className="flex flex-col max-w-7xl mx-auto w-full font-sans bg-white border border-neutral-200 divide-y divide-neutral-200">
      
      {/* 1. Header with Breadcrumb Back to Main Dashboard */}
      <header className="p-6 sm:p-8 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs text-neutral-400 mb-2 font-mono">
            <Link
              href="/dashboard"
              className="hover:text-neutral-900 flex items-center transition-colors group"
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-1 group-hover:-translate-x-0.5 transition-transform" />
              {t('common.appName', 'Dashboard')}
            </Link>
            <span>/</span>
            <span className="text-neutral-700 font-bold uppercase tracking-wider">
              Predictive Modeling & Intelligence
            </span>
          </div>

          <h1 className="font-display font-bold text-3xl sm:text-4xl text-neutral-900 tracking-tight leading-tight">
            Predictive Business Seasonality & Solvency
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-1 max-w-2xl">
            Configure Indian festival sales uplifts, statutory compliance schedules, and what-if cash stress
            scenarios tailored to your specific business sector.
          </p>
        </div>

        <div className="flex items-center space-x-3 shrink-0">
          <LanguageSelector variant="compact" />
          <Link
            href="/dashboard"
            className="px-3.5 py-2 text-xs font-bold text-neutral-800 bg-neutral-100 hover:bg-neutral-200 border border-neutral-300 transition-colors"
          >
            View Live Trajectory Graph →
          </Link>
        </div>
      </header>

      {/* 2. Business Seasonality & Festival Configuration Card */}
      <section aria-label="Seasonality Configuration" className="bg-neutral-50/50 p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 mb-1">
              <span className="inline-flex items-center px-2 py-0.5 text-[10.5px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                <Sliders className="w-3 h-3 mr-1 text-amber-700" />
                Business Seasonality Modeling
              </span>
              <span className="text-xs text-neutral-400">•</span>
              <span className="text-xs text-neutral-500">
                Only enabled catalysts impact your SageMaker cash predictions
              </span>
            </div>
            <h2 className="font-display font-bold text-xl sm:text-2xl text-neutral-900">
              Indian Market Catalysts & Sector Sensitivity
            </h2>
          </div>

          {/* Save Settings Action Button */}
          <div className="flex items-center space-x-3">
            {savedSuccess && (
              <span className="inline-flex items-center text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1.5 border border-emerald-200 animate-in fade-in">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                Settings Saved & Forecast Updated
              </span>
            )}

            <button
              type="button"
              onClick={handleSaveSettings}
              disabled={saving}
              className="inline-flex items-center px-4 py-2 bg-neutral-900 text-white hover:bg-neutral-800 text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Updating Models...
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5 mr-1.5" />
                  Save Predictive Settings
                </>
              )}
            </button>
          </div>
        </div>

        {/* Sector Preset Selector */}
        <div className="bg-white p-4 sm:p-5 border border-neutral-200 space-y-3">
          <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700">
            Select Your Primary Business Sector
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {Object.entries(SECTOR_PRESETS).map(([secKey, secVal]) => {
              const isSelected = businessSector === secKey;
              return (
                <button
                  key={secKey}
                  type="button"
                  onClick={() => handleSectorChange(secKey)}
                  className={`p-3 text-left border transition-all cursor-pointer ${
                    isSelected
                      ? 'border-neutral-900 bg-neutral-900 text-white shadow-sm'
                      : 'border-neutral-200 bg-white text-neutral-800 hover:border-neutral-400'
                  }`}
                >
                  <div className="font-bold text-xs flex items-center justify-between">
                    <span>{secKey}</span>
                    {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                  </div>
                  <p className={`text-[11px] mt-1 line-clamp-2 leading-relaxed ${isSelected ? 'text-neutral-300' : 'text-neutral-500'}`}>
                    {secVal.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Individual Festival & Surge Toggles Grid */}
        <div className="bg-white p-4 sm:p-5 border border-neutral-200 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-100 pb-3">
            <div>
              <h3 className="font-bold text-sm text-neutral-900">
                Active Market Catalysts & Festivals
              </h3>
              <p className="text-xs text-neutral-500">
                Toggle individual events ON or OFF. For instance, wedding surges only apply if relevant to your business.
              </p>
            </div>

            {/* Weekend Surge Global Toggle */}
            <div className="flex items-center space-x-2 bg-neutral-50 px-3 py-1.5 border border-neutral-200">
              <input
                id="weekend-toggle"
                type="checkbox"
                checked={enableWeekendSurge}
                onChange={(e) => setEnableWeekendSurge(e.target.checked)}
                className="rounded accent-neutral-900 cursor-pointer"
              />
              <label htmlFor="weekend-toggle" className="text-xs font-semibold text-neutral-800 cursor-pointer">
                Weekend Footfall Surge (+25% fri-sun)
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {AUTHORITATIVE_MARKET_EVENTS_CATALOG.map((evt) => {
              const isEnabled = enabledFestivals.includes(evt.id);
              const isWedding = evt.id === 'mkt-winter-weddings-2026';

              return (
                <div
                  key={evt.id}
                  className={`p-3.5 border transition-colors flex flex-col justify-between ${
                    isEnabled
                      ? isWedding
                        ? 'border-indigo-300 bg-indigo-50/40'
                        : 'border-emerald-300 bg-emerald-50/40'
                      : 'border-neutral-200 bg-neutral-50/60 opacity-60'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="font-bold text-xs text-neutral-900">
                        {evt.name}
                      </div>
                      <input
                        type="checkbox"
                        checked={isEnabled}
                        onChange={() => toggleFestival(evt.id)}
                        className="rounded accent-neutral-900 cursor-pointer shrink-0 mt-0.5"
                        title={isEnabled ? 'Click to disable' : 'Click to enable'}
                      />
                    </div>

                    <div className="flex items-center space-x-2 text-[10.5px] text-neutral-500 font-mono mb-1.5">
                      <span>{evt.startDate} to {evt.endDate}</span>
                      <span>•</span>
                      <span className="font-bold text-emerald-700 font-sans">
                        {evt.inflowMultiplier}x Uplift
                      </span>
                    </div>

                    <p className="text-[11px] text-neutral-600 leading-snug">
                      {evt.description}
                    </p>
                  </div>

                  <div className="mt-2.5 pt-2 border-t border-neutral-200/50 flex items-center justify-between text-[10.5px]">
                    <span className="font-medium text-neutral-500">
                      Status: {isEnabled ? (
                        <strong className="text-emerald-700 font-bold">Active in Forecast</strong>
                      ) : (
                        <span className="text-neutral-400">Disabled</span>
                      )}
                    </span>
                    {isWedding && (
                      <span className="text-[9.5px] px-1.5 py-0.2 bg-indigo-100 text-indigo-800 font-bold uppercase">
                        Wedding Window
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 3. Festive Liquidity Radar & Tax Shield */}
      <section aria-label="Festive Liquidity Radar">
        <FestiveLiquidityRadar data={data} />
      </section>

      {/* 4. What-If Scenario Simulator */}
      <section aria-label="Scenario Simulator">
        <ScenarioSimulator
          data={data}
          unplannedExpense={unplannedExpense}
          delayDays={delayDays}
          onExpenseChange={setUnplannedExpense}
          onDelayChange={setDelayDays}
          onReset={() => {
            setUnplannedExpense(0);
            setDelayDays(0);
          }}
        />
      </section>

      {/* 5. Risk Calendar with Month Heatmap & Scheduled Commitments */}
      <section aria-label="Risk Calendar">
        <RiskCalendar data={data} />
      </section>

      {/* 6. Tax Checks (Statutory Rails) */}
      <section aria-label="Tax Checks">
        <TaxChecksWidget data={data} />
      </section>

    </div>
  );
}
