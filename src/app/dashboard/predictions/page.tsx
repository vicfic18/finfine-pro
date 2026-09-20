'use client';

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Link from 'next/link';
import {
  Sliders,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Save,
  AlertCircle,
} from 'lucide-react';
import FestiveLiquidityRadar from '@/components/dashboard/FestiveLiquidityRadar';
import RiskCalendar from '@/components/dashboard/RiskCalendar';
import ScenarioSimulator from '@/components/dashboard/ScenarioSimulator';
import TaxChecksWidget from '@/components/dashboard/TaxChecksWidget';
import FinFineProLoader from '@/components/ui/FinFineProLoader';
import BrandLogo from '@/components/ui/BrandLogo';
import { AUTHORITATIVE_MARKET_EVENTS_CATALOG } from '@/lib/tax-rules-engine';
import { DEFAULT_ENABLED_FESTIVALS, type FinancialMetricData, type MerchantSettings } from '@/lib/financial-store';
import { authenticatedFetch } from '@/lib/authenticated-fetch';

export const SECTOR_PRESETS: Record<string, { name: string; description: string; festivals: string[]; weekendSurge: boolean }> = {
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
    description: 'Minimal retail festive impact; strictly governed by statutory tax lockboxes.',
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
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);
  const [showFestivalCustomizer, setShowFestivalCustomizer] = useState<boolean>(false);

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
        authenticatedFetch('/api/dashboard/financial-data'),
        authenticatedFetch('/api/dashboard/settings'),
      ]);

      if (!dataRes.ok) {
        const errorPayload = await dataRes.json().catch(() => null) as { error?: string; details?: string } | null;
        throw new Error(
          errorPayload?.error
            || errorPayload?.details
            || `Unable to load financial forecast (HTTP ${dataRes.status}).`,
        );
      }

      const dataJson = await dataRes.json();
      setData(dataJson);
      if (settingsRes.ok) {
        const settingsJson: MerchantSettings = await settingsRes.json();
        if (settingsJson.businessSector) setBusinessSector(settingsJson.businessSector);
        if (Array.isArray(settingsJson.enabledFestivals)) setEnabledFestivals(settingsJson.enabledFestivals);
        if (settingsJson.enableWeekendSurge !== undefined) setEnableWeekendSurge(settingsJson.enableWeekendSurge);
        if (settingsJson.festivalMultipliers) setCustomMultipliers(settingsJson.festivalMultipliers);
      }
      setLoadError(null);
    } catch (err) {
      console.error('Failed to load predictive modeling data:', err);
      setLoadError(err instanceof Error ? err.message : 'Unable to load predictive modeling data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadDataAndSettings();
    }, 0);
    return () => window.clearTimeout(timer);
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
      const res = await authenticatedFetch('/api/dashboard/settings', {
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

      // Refresh financial metrics to immediately re-calculate forecast with new settings
      const freshDataRes = await authenticatedFetch('/api/dashboard/financial-data?refresh=true');
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

  if (loading) {
    return <FinFineProLoader />;
  }

  if (loadError || !data) {
    return (
      <div className="flex min-h-[420px] items-center justify-center p-6">
        <div className="w-full max-w-lg border border-red-200 bg-red-50 p-6 text-center">
          <AlertCircle className="mx-auto mb-3 h-8 w-8 text-red-600" />
          <h1 className="font-display text-xl font-bold text-neutral-900">Unable to load predictions</h1>
          <p className="mt-2 text-sm text-neutral-600">
            {loadError || 'Financial forecast data is unavailable right now.'}
          </p>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setLoadError(null);
              void loadDataAndSettings();
            }}
            className="mt-4 inline-flex items-center bg-neutral-900 px-4 py-2 text-xs font-bold text-white hover:bg-neutral-800"
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col max-w-7xl mx-auto w-full font-sans space-y-6">
      
      {/* 1. Header with Breadcrumbs */}
      <div className="space-y-2">
        <div className="flex items-center space-x-2 text-xs font-medium text-neutral-400">
          <Link href="/dashboard" className="hover:opacity-80 transition-opacity flex items-center">
            <BrandLogo size="sm" />
          </Link>
          <span>/</span>
          <span className="text-neutral-900 font-semibold">{t('nav.predictions', 'Predictions & Seasonality')}</span>
        </div>

        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
          <div>
            <h1 className="font-display font-bold text-3xl sm:text-4xl text-neutral-900 tracking-tight leading-tight">
              Predictive Seasonality & Liquidity Radar
            </h1>
            <p className="text-xs sm:text-sm text-neutral-500 mt-1 max-w-2xl">
              Model festive sales uplifts, statutory compliance schedules, and what-if cash stress scenarios.
            </p>
          </div>

          <div className="flex items-center space-x-3 shrink-0">
            {savedSuccess && (
              <span className="inline-flex items-center text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-2 border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                Updated Live Forecast
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
                  Updating Forecast...
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5 mr-1.5" />
                  Save Sector Config
                </>
              )}
            </button>
          </div>
        </header>
      </div>

      {/* 2. Business Sector Preset Selector */}
      <section aria-label="Seasonality Configuration" className="bg-white border border-neutral-200 p-5 sm:p-6 space-y-4">
        <div>
          <div className="flex items-center space-x-2 mb-1">
            <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
              <Sliders className="w-3 h-3 mr-1 text-amber-700" />
              Sector Sensitivity
            </span>
            <span className="text-xs text-neutral-400">•</span>
            <span className="text-xs text-neutral-500">
              Auto-calibrates demand surges for your trade
            </span>
          </div>
          <h2 className="font-display font-bold text-xl text-neutral-900">
            Select Your Primary Business Sector
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Object.entries(SECTOR_PRESETS).map(([secKey, secVal]) => {
            const isSelected = businessSector === secKey;
            return (
              <button
                key={secKey}
                type="button"
                onClick={() => handleSectorChange(secKey)}
                className={`p-3.5 text-left border transition-all cursor-pointer ${
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

        {/* Progressive Disclosure: Customize Individual Events */}
        <div className="pt-2 border-t border-neutral-100">
          <button
            type="button"
            onClick={() => setShowFestivalCustomizer(!showFestivalCustomizer)}
            className="flex items-center justify-between w-full py-2 text-xs font-bold text-neutral-800 hover:text-neutral-900 cursor-pointer"
          >
            <div className="flex items-center space-x-2">
              <span>Advanced: Customize Individual Catalysts ({enabledFestivals.length} active)</span>
              {enableWeekendSurge && (
                <span className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-800 font-medium">
                  +25% Weekend Footfall ON
                </span>
              )}
            </div>
            {showFestivalCustomizer ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {showFestivalCustomizer && (
            <div className="pt-4 space-y-4 animate-in fade-in duration-150">
              <div className="flex items-center justify-between bg-neutral-50 p-3 border border-neutral-200">
                <div>
                  <span className="text-xs font-bold text-neutral-900 block">Weekend Footfall Surge</span>
                  <span className="text-[11px] text-neutral-500">+25% sales boost on Friday, Saturday & Sunday</span>
                </div>
                <input
                  id="weekend-toggle"
                  type="checkbox"
                  checked={enableWeekendSurge}
                  onChange={(e) => setEnableWeekendSurge(e.target.checked)}
                  className="rounded accent-neutral-900 cursor-pointer w-4 h-4"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {AUTHORITATIVE_MARKET_EVENTS_CATALOG.map((evt) => {
                  const isEnabled = enabledFestivals.includes(evt.id);
                  return (
                    <div
                      key={evt.id}
                      onClick={() => toggleFestival(evt.id)}
                      className={`p-3 border transition-colors cursor-pointer flex flex-col justify-between ${
                        isEnabled
                          ? 'border-emerald-300 bg-emerald-50/40'
                          : 'border-neutral-200 bg-neutral-50/60 opacity-60'
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <span className="font-bold text-xs text-neutral-900">
                            {evt.name}
                          </span>
                          <input
                            type="checkbox"
                            checked={isEnabled}
                            onChange={() => {}}
                            className="rounded accent-neutral-900 cursor-pointer shrink-0 mt-0.5"
                          />
                        </div>

                        <div className="text-[10.5px] text-neutral-500 font-mono mb-1">
                          <span>{evt.startDate} to {evt.endDate}</span>
                          <span className="mx-1">•</span>
                          <span className="font-bold text-emerald-700 font-sans">
                            {evt.inflowMultiplier}x Uplift
                          </span>
                        </div>

                        <p className="text-[11px] text-neutral-600 line-clamp-2">
                          {evt.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 3. Festive Liquidity Radar & Tax Shield */}
      <section aria-label="Festive Liquidity Radar" className="bg-white border border-neutral-200">
        <FestiveLiquidityRadar data={data} />
      </section>

      {/* 4. What-If Scenario Simulator */}
      <section aria-label="Scenario Simulator" className="bg-white border border-neutral-200">
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
      <section aria-label="Risk Calendar" className="bg-white border border-neutral-200">
        <RiskCalendar data={data} />
      </section>

      {/* 6. Tax Checks (Statutory Rails) */}
      <section aria-label="Tax Checks" className="bg-white border border-neutral-200">
        <TaxChecksWidget data={data} />
      </section>

    </div>
  );
}
