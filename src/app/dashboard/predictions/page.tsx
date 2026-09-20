'use client';

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Link from 'next/link';
import {
  Sparkles,
  Sliders,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Save,
  Calendar,
  X,
  ArrowRight,
  ShoppingBag,
  Gem,
  Factory,
  Laptop,
  Compass,
} from 'lucide-react';
import FestiveLiquidityRadar from '@/components/dashboard/FestiveLiquidityRadar';
import StatutoryLegislationFeed from '@/components/dashboard/StatutoryLegislationFeed';
import ScenarioSimulator from '@/components/dashboard/ScenarioSimulator';
import TaxChecksWidget from '@/components/dashboard/TaxChecksWidget';
import FinFineProLoader from '@/components/ui/FinFineProLoader';
import BrandLogo from '@/components/ui/BrandLogo';
import { AUTHORITATIVE_MARKET_EVENTS_CATALOG } from '@/lib/tax-rules-engine';
import { DEFAULT_ENABLED_FESTIVALS, type FinancialMetricData, type MerchantSettings } from '@/lib/financial-store';
import type { StatutoryAdvisoryResponse } from '@/lib/statutory-cron-service';

export interface SectorPreset {
  name: string;
  description: string;
  festivals: string[];
  weekendSurge: boolean;
  tag: string;
  iconName: 'ShoppingBag' | 'Gem' | 'Factory' | 'Laptop' | 'Compass';
}

export const SECTOR_PRESETS: Record<string, SectorPreset> = {
  'Retail & Distribution': {
    name: 'Retail & Distribution',
    description: 'Kirana, supermarkets, FMCG, and consumer stores with peak Diwali, Navratri, and weekend footfall.',
    festivals: [
      'mkt-mega-sales-2026',
      'mkt-navratri-2026',
      'mkt-dussehra-2026',
      'mkt-dhanteras-2026',
      'mkt-diwali-2026',
    ],
    weekendSurge: true,
    tag: 'Retail',
    iconName: 'ShoppingBag',
  },
  'Jewelry & Wedding Apparel': {
    name: 'Jewelry & Wedding Apparel',
    description: 'High-value bridal jewelry, festive gifting, and Dhanteras gold buying cycles.',
    festivals: [
      'mkt-dhanteras-2026',
      'mkt-diwali-2026',
      'mkt-winter-weddings-2026',
      'mkt-navratri-2026',
      'mkt-raksha-bandhan-2026',
    ],
    weekendSurge: true,
    tag: 'Luxury',
    iconName: 'Gem',
  },
  'Corporate B2B & Manufacturing': {
    name: 'Manufacturing & B2B',
    description: 'Industrial supply contracts, raw material procurement, and Section 43B(h) 45-day payment cycles.',
    festivals: [],
    weekendSurge: false,
    tag: 'Industrial',
    iconName: 'Factory',
  },
  'IT & Professional Services': {
    name: 'IT & Professional Services',
    description: 'Software agencies, design studios, and consultancies with monthly retainer billings and TDS withholding.',
    festivals: [],
    weekendSurge: false,
    tag: 'Services',
    iconName: 'Laptop',
  },
  'Custom Sector': {
    name: 'Custom Configuration',
    description: 'Manual parameter configuration tailored to unique MSME seasonal cycles.',
    festivals: DEFAULT_ENABLED_FESTIVALS,
    weekendSurge: true,
    tag: 'Manual',
    iconName: 'Compass',
  },
};

export function renderSectorIcon(iconName: string, className: string = 'w-4 h-4') {
  switch (iconName) {
    case 'ShoppingBag':
      return <ShoppingBag className={className} />;
    case 'Gem':
      return <Gem className={className} />;
    case 'Factory':
      return <Factory className={className} />;
    case 'Laptop':
      return <Laptop className={className} />;
    default:
      return <Compass className={className} />;
  }
}

export function renderSectorWatermark(iconName: string, className: string = 'w-64 h-64') {
  switch (iconName) {
    case 'ShoppingBag':
      return <ShoppingBag className={className} strokeWidth={0.75} />;
    case 'Gem':
      return <Gem className={className} strokeWidth={0.75} />;
    case 'Factory':
      return <Factory className={className} strokeWidth={0.75} />;
    case 'Laptop':
      return <Laptop className={className} strokeWidth={0.75} />;
    default:
      return <Compass className={className} strokeWidth={0.75} />;
  }
}

export default function PredictiveModelingPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<FinancialMetricData | null>(null);
  const [settings, setSettings] = useState<MerchantSettings | null>(null);
  const [advisory, setAdvisory] = useState<StatutoryAdvisoryResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [advisoryLoading, setAdvisoryLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);
  const [showSectorModal, setShowSectorModal] = useState<boolean>(false);
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
        fetch('/api/dashboard/financial-data'),
        fetch('/api/dashboard/settings'),
      ]);

      let currentSector = businessSector;
      if (settingsRes.ok) {
        const settingsJson: MerchantSettings = await settingsRes.json();
        setSettings(settingsJson);
        if (settingsJson.businessSector) {
          currentSector = settingsJson.businessSector;
          setBusinessSector(currentSector);
        }
        if (Array.isArray(settingsJson.enabledFestivals)) setEnabledFestivals(settingsJson.enabledFestivals);
        if (settingsJson.enableWeekendSurge !== undefined) setEnableWeekendSurge(settingsJson.enableWeekendSurge);
        if (settingsJson.festivalMultipliers) setCustomMultipliers(settingsJson.festivalMultipliers);
      }

      if (dataRes.ok) {
        const dataJson = await dataRes.json();
        setData(dataJson);
      }

      fetchAdvisory(currentSector);
    } catch (err) {
      console.error('Failed to load predictive modeling data:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAdvisory = async (sector: string) => {
    try {
      setAdvisoryLoading(true);
      const res = await fetch(`/api/dashboard/predictions/advisory?sector=${encodeURIComponent(sector)}`);
      if (res.ok) {
        const advJson: StatutoryAdvisoryResponse = await res.json();
        setAdvisory(advJson);
      }
    } catch (err) {
      console.warn('Could not load statutory advisory:', err);
    } finally {
      setAdvisoryLoading(false);
    }
  };

  useEffect(() => {
    loadDataAndSettings();
  }, []);

  const handleSectorSelectAndSave = async (sector: string) => {
    setBusinessSector(sector);
    setShowSectorModal(false);
    setSaving(true);
    setSavedSuccess(false);

    const preset = SECTOR_PRESETS[sector];
    const newFestivals = preset && sector !== 'Custom Sector' ? preset.festivals : enabledFestivals;
    const newWeekend = preset && sector !== 'Custom Sector' ? preset.weekendSurge : enableWeekendSurge;

    if (preset && sector !== 'Custom Sector') {
      setEnabledFestivals(newFestivals);
      setEnableWeekendSurge(newWeekend);
    }

    try {
      await fetch('/api/dashboard/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessSector: sector,
          enabledFestivals: newFestivals,
          enableWeekendSurge: newWeekend,
          festivalMultipliers: customMultipliers,
        }),
      });

      const freshDataRes = await fetch('/api/dashboard/financial-data?refresh=true');
      if (freshDataRes.ok) {
        const freshData = await freshDataRes.json();
        setData(freshData);
      }

      await fetchAdvisory(sector);

      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 4000);
    } catch (err) {
      console.error('Error auto-saving sector:', err);
    } finally {
      setSaving(false);
    }
  };

  const toggleFestival = (eventId: string) => {
    setEnabledFestivals((prev) =>
      prev.includes(eventId) ? prev.filter((id) => id !== eventId) : [...prev, eventId]
    );
  };

  const handleManualSaveSettings = async () => {
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

      const freshDataRes = await fetch('/api/dashboard/financial-data?refresh=true');
      if (freshDataRes.ok) {
        const freshData = await freshDataRes.json();
        setData(freshData);
      }

      await fetchAdvisory(businessSector);

      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 4000);
    } catch (err) {
      console.error('Error saving settings:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleRefreshAdvisory = async () => {
    try {
      setAdvisoryLoading(true);
      const res = await fetch('/api/dashboard/predictions/advisory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sector: businessSector }),
      });
      if (res.ok) {
        const result: StatutoryAdvisoryResponse = await res.json();
        setAdvisory(result);
      }
    } catch (err) {
      console.error('Failed to manually trigger statutory advisory sync:', err);
    } finally {
      setAdvisoryLoading(false);
    }
  };

  if (loading || !data) {
    return <FinFineProLoader />;
  }

  const currentPreset = SECTOR_PRESETS[businessSector] || SECTOR_PRESETS['Retail & Distribution'];

  return (
    <div className="flex flex-col max-w-7xl mx-auto w-full font-sans space-y-6">
      
      {/* 1. Header with Breadcrumbs & Single Clean Heading */}
      <div className="space-y-2">
        <div className="flex items-center space-x-2 text-xs font-medium text-neutral-400">
          <Link href="/dashboard" className="hover:opacity-80 transition-opacity flex items-center">
            <BrandLogo size="sm" />
          </Link>
          <span>/</span>
          <span className="text-neutral-900 font-semibold">{t('nav.predictions', 'Forecast')}</span>
        </div>

        <header className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4 pt-1">
          <div>
            <h1 className="font-display font-bold text-3xl sm:text-4xl text-neutral-900 tracking-tight leading-tight">
              Forecast Radar
            </h1>
            <p className="text-xs sm:text-sm text-neutral-500 mt-1 max-w-2xl">
              Forward liquidity modeling adjusted for commercial catalysts and statutory deadlines.
            </p>
          </div>

          <div className="flex items-center space-x-3 shrink-0">
            {savedSuccess && (
              <span className="inline-flex items-center text-xs font-bold text-emerald-800 bg-emerald-50 px-3 py-1.5 border border-emerald-300">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1.5 text-emerald-700" />
                Parameters Synchronized
              </span>
            )}

            {showFestivalCustomizer && (
              <button
                type="button"
                onClick={handleManualSaveSettings}
                disabled={saving}
                className="inline-flex items-center px-4 py-2 bg-neutral-900 text-white hover:bg-neutral-800 text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
              >
                {saving ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Updating...
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5 mr-1.5" />
                    Save Catalysts
                  </>
                )}
              </button>
            )}
          </div>
        </header>
      </div>

      {/* 2. Bauhaus Monochrome Business Profile Anchor Card */}
      <section
        aria-label="Business Sector Profile"
        className="relative bg-neutral-950 text-white border border-neutral-900 p-5 sm:p-7 overflow-hidden shadow-sm"
      >
        {/* Large Semi-Transparent Swiss Silhouette Background Icon */}
        <div
          className="absolute -right-6 -bottom-10 pointer-events-none opacity-[0.07] text-white select-none transition-all duration-700 ease-out transform rotate-[-8deg]"
          aria-hidden="true"
        >
          {renderSectorWatermark(currentPreset.iconName, 'w-64 h-64 sm:w-80 sm:h-80')}
        </div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2.5">
            <div className="flex items-center space-x-2.5">
              <span className="font-mono text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 bg-neutral-900 text-neutral-300 border border-neutral-800">
                ■ Profile Context
              </span>
              <span className="text-neutral-600 font-mono text-xs">/</span>
              <span className="font-mono text-[10px] uppercase tracking-wider text-emerald-400">
                Active in Model
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="w-9 h-9 border border-neutral-800 bg-neutral-900/90 flex items-center justify-center text-white shrink-0">
                {renderSectorIcon(currentPreset.iconName, 'w-4 h-4 text-white')}
              </div>

              <h2 className="font-display font-bold text-2xl sm:text-3xl text-white tracking-tight">
                {currentPreset.name}
              </h2>

              <span className="font-mono text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 border border-neutral-800 bg-neutral-900 text-neutral-300">
                {currentPreset.tag}
              </span>
            </div>

            <p className="text-xs text-neutral-400 max-w-2xl leading-relaxed">
              {currentPreset.description}
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-1 font-mono text-[10.5px]">
              <span className="px-2 py-0.5 border border-neutral-800 bg-neutral-900 text-neutral-300">
                {enabledFestivals.length} active catalysts
              </span>
              {enableWeekendSurge ? (
                <span className="px-2 py-0.5 border border-emerald-900/80 bg-emerald-950/50 text-emerald-300">
                  +25% weekend surge
                </span>
              ) : (
                <span className="px-2 py-0.5 border border-neutral-800 bg-neutral-900 text-neutral-500">
                  weekend surge off
                </span>
              )}
            </div>
          </div>

          <div className="shrink-0 flex items-center">
            <button
              type="button"
              onClick={() => setShowSectorModal(true)}
              className="inline-flex items-center px-4 py-2.5 text-xs font-bold text-neutral-950 bg-white hover:bg-neutral-200 transition-all cursor-pointer border border-white"
            >
              <Sliders className="w-3.5 h-3.5 mr-2 text-neutral-950" />
              Change Business Type
            </button>
          </div>
        </div>

        {/* Progressive Disclosure: Nested Custom Holidays Toggle */}
        <div className="mt-5 pt-3.5 border-t border-neutral-800/80">
          <button
            type="button"
            onClick={() => setShowFestivalCustomizer(!showFestivalCustomizer)}
            className="flex items-center justify-between w-full text-xs font-mono text-neutral-400 hover:text-white cursor-pointer transition-colors"
          >
            <div className="flex items-center space-x-2">
              <span className="uppercase tracking-wider">Configure specific catalyst windows</span>
              <span className="text-[10px] text-neutral-500">
                ({showFestivalCustomizer ? 'collapse' : 'expand'})
              </span>
            </div>
            {showFestivalCustomizer ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>

          {showFestivalCustomizer && (
            <div className="pt-4 space-y-4 animate-in fade-in duration-150">
              <div className="flex items-center justify-between bg-neutral-900 p-3 border border-neutral-800">
                <div>
                  <span className="text-xs font-bold text-white block">Weekend Demand Boost</span>
                  <span className="text-[11px] text-neutral-400">+25% consumer footfall on Friday, Saturday & Sunday</span>
                </div>
                <input
                  id="weekend-toggle"
                  type="checkbox"
                  checked={enableWeekendSurge}
                  onChange={(e) => setEnableWeekendSurge(e.target.checked)}
                  className="rounded accent-white cursor-pointer w-4 h-4"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {AUTHORITATIVE_MARKET_EVENTS_CATALOG.map((evt) => {
                  const isEnabled = enabledFestivals.includes(evt.id);
                  return (
                    <div
                      key={evt.id}
                      onClick={() => toggleFestival(evt.id)}
                      className={`p-3.5 border transition-colors cursor-pointer flex flex-col justify-between ${
                        isEnabled
                          ? 'border-neutral-600 bg-neutral-900 text-white'
                          : 'border-neutral-800/70 bg-neutral-950 text-neutral-500 opacity-60'
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <span className="font-bold text-xs">
                            {evt.name}
                          </span>
                          <input
                            type="checkbox"
                            checked={isEnabled}
                            onChange={() => {}}
                            className="rounded accent-white cursor-pointer shrink-0 mt-0.5"
                          />
                        </div>

                        <div className="text-[10.5px] font-mono text-neutral-400 mb-1">
                          <span>{evt.startDate} → {evt.endDate}</span>
                          <span className="mx-1.5">•</span>
                          <span className="font-bold text-emerald-400">
                            {evt.inflowMultiplier}x boost
                          </span>
                        </div>

                        <p className="text-[11px] text-neutral-400 line-clamp-2">
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

      {/* Progressive Abstraction: Bauhaus Modal for Business Type Selection */}
      {showSectorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 animate-in fade-in duration-150 backdrop-blur-xs">
          <div className="bg-white max-w-2xl w-full border-2 border-neutral-950 shadow-2xl p-5 sm:p-7 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-200">
              <div>
                <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-0.5">
                  Operating Profile
                </span>
                <h3 className="font-display font-bold text-2xl text-neutral-950">
                  Select Business Sector
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSectorModal(false)}
                className="p-1.5 text-neutral-400 hover:text-neutral-950 transition-colors cursor-pointer border border-transparent hover:border-neutral-200"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-neutral-600 leading-normal">
              Selecting a sector dynamically calibrates seasonal demand peaks, weekend footfall multipliers, and applicable statutory regulations.
            </p>

            <div className="space-y-2.5">
              {Object.entries(SECTOR_PRESETS).map(([secKey, secVal]) => {
                const isSelected = businessSector === secKey;
                return (
                  <button
                    key={secKey}
                    type="button"
                    onClick={() => handleSectorSelectAndSave(secKey)}
                    className={`relative overflow-hidden w-full p-4 text-left border transition-all cursor-pointer flex items-center justify-between gap-4 ${
                      isSelected
                        ? 'border-neutral-950 bg-neutral-950 text-white shadow-md'
                        : 'border-neutral-200 bg-white text-neutral-900 hover:border-neutral-950 hover:bg-neutral-50/80'
                    }`}
                  >
                    {/* Semi-Transparent Swiss Silhouette Watermark */}
                    <div
                      className={`absolute -right-3 -bottom-5 pointer-events-none select-none transition-opacity transform rotate-[-8deg] ${
                        isSelected ? 'text-white opacity-[0.08]' : 'text-neutral-950 opacity-[0.04]'
                      }`}
                      aria-hidden="true"
                    >
                      {renderSectorWatermark(secVal.iconName, 'w-24 h-24 sm:w-28 sm:h-28')}
                    </div>

                    <div className="relative z-10 flex items-start space-x-3.5">
                      <div
                        className={`w-8 h-8 border flex items-center justify-center shrink-0 mt-0.5 ${
                          isSelected
                            ? 'border-neutral-800 bg-neutral-900 text-white'
                            : 'border-neutral-200 bg-neutral-100 text-neutral-800'
                        }`}
                      >
                        {renderSectorIcon(secVal.iconName, 'w-4 h-4')}
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-xs sm:text-sm">{secVal.name}</span>
                          <span
                            className={`font-mono text-[9px] font-bold uppercase px-1.5 py-0.5 ${
                              isSelected
                                ? 'bg-neutral-800 text-neutral-300'
                                : 'bg-neutral-100 text-neutral-600'
                            }`}
                          >
                            {secVal.tag}
                          </span>
                        </div>
                        <p className={`text-[11.5px] leading-relaxed ${isSelected ? 'text-neutral-400' : 'text-neutral-500'}`}>
                          {secVal.description}
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0">
                      {isSelected ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      ) : (
                        <ArrowRight className="w-4 h-4 text-neutral-400" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setShowSectorModal(false)}
                className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-neutral-600 hover:text-neutral-950 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Seasonal Radar (Core Liquidity Metrics & Operational Guidance) */}
      <section aria-label="Seasonal Radar" className="bg-white border border-neutral-200">
        <FestiveLiquidityRadar
          data={data}
          advisory={advisory}
          onRefreshAdvisory={handleRefreshAdvisory}
          advisoryLoading={advisoryLoading}
        />
      </section>

      {/* 4. Statutory Intelligence (Verified Legislation & Acts Feed) */}
      <section aria-label="Statutory Intelligence" className="bg-white border border-neutral-200">
        <StatutoryLegislationFeed
          updates={advisory?.activeStatutoryUpdates || []}
          activeSector={businessSector}
        />
      </section>

      {/* 5. Stress Simulator */}
      <section aria-label="Stress Simulator" className="bg-white border border-neutral-200">
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

      {/* 5. Tax Obligations */}
      <section aria-label="Tax Obligations" className="bg-white border border-neutral-200">
        <TaxChecksWidget data={data} />
      </section>

    </div>
  );
}
