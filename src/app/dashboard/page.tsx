'use client';

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Link from 'next/link';
import { Sliders, Sparkles, ArrowRight, ShieldCheck, AlertTriangle } from 'lucide-react';
import ForecastingCharts from '@/components/dashboard/ForecastingCharts';
import LanguageSelector from '@/components/ui/LanguageSelector';
import FinFineProLoader from '@/components/ui/FinFineProLoader';
import type { FinancialMetricData } from '@/lib/financial-store';

export default function DashboardPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<FinancialMetricData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const loadData = async () => {
    try {
      const res = await fetch('/api/dashboard/financial-data');
      if (!res.ok) throw new Error('Failed to load financial records');
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading || !data) {
    return <FinFineProLoader />;
  }

  const isSafe = data.solvencyStatus === 'Safe';

  return (
    <div className="flex flex-col max-w-7xl mx-auto w-full font-sans bg-white border border-neutral-200 divide-y divide-neutral-200">
      
      {/* 1. Executive Header: Business Name & Live Status */}
      <header className="p-6 sm:p-8 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-widest text-neutral-400 mb-1.5">
            <span>{t('common.appName', 'FinFine Pro')}</span>
            <span>•</span>
            <span className="text-neutral-500 font-mono">Ap-South-1 Production</span>
          </div>

          <h1 className="font-display font-bold text-3xl sm:text-5xl text-neutral-900 tracking-tight leading-none">
            {data.businessName || 'My Business'}
          </h1>
        </div>

        {/* Quick Solvency Status & Seasonality Settings Shortcut */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center space-x-2 px-3 py-1.5 bg-neutral-50 border border-neutral-200 text-xs">
            {isSafe ? (
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-600" />
            )}
            <div>
              <span className="text-neutral-400 text-[10px] block uppercase font-bold tracking-wider">
                Solvency Status
              </span>
              <span className="font-bold text-neutral-900">
                {data.solvencyStatus} ({data.daysToZero}d Runway)
              </span>
            </div>
          </div>

          <Link
            href="/dashboard/predictions"
            className="inline-flex items-center px-3.5 py-2 text-xs font-bold text-neutral-900 bg-amber-50 hover:bg-amber-100 border border-amber-300 transition-colors shadow-sm"
          >
            <Sliders className="w-3.5 h-3.5 mr-1.5 text-amber-700" />
            Configure Seasonality & Predictions
            <ArrowRight className="w-3.5 h-3.5 ml-1.5 text-amber-700" />
          </Link>

          <LanguageSelector variant="compact" />
        </div>
      </header>

      {/* 2. Primary KPI Bar (Quick Financial Vitals) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-neutral-200 bg-white">
        <div className="p-4 sm:p-6">
          <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider block">
            Total Liquid Cash
          </span>
          <div className="font-display text-2xl sm:text-3xl font-bold text-neutral-900 mt-1">
            ₹{data.totalLiquidBalance.toLocaleString('en-IN')}
          </div>
          <span className="text-[10px] text-neutral-500 mt-0.5 block">
            Verified Bank Ledger Balance
          </span>
        </div>

        <div className="p-4 sm:p-6">
          <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider block">
            Spendable Cash
          </span>
          <div className="font-display text-2xl sm:text-3xl font-bold text-neutral-900 mt-1">
            ₹{data.spendableLiquidity.toLocaleString('en-IN')}
          </div>
          <span className="text-[10px] text-neutral-500 mt-0.5 block">
            After Tax Lockbox & Safety Buffer
          </span>
        </div>

        <div className="p-4 sm:p-6">
          <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider block">
            Cash Runway
          </span>
          <div className={`font-display text-2xl sm:text-3xl font-bold mt-1 ${data.daysToZero < 14 ? 'text-orange-600' : 'text-neutral-900'}`}>
            {data.daysToZero} Days
          </div>
          <span className="text-[10px] text-neutral-500 mt-0.5 block">
            Zero-cash depletion horizon
          </span>
        </div>

        <div className="p-4 sm:p-6">
          <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider block">
            Operating Velocity
          </span>
          <div className="font-display text-2xl sm:text-3xl font-bold text-neutral-900 mt-1">
            ₹{data.netDailyBurn.toLocaleString('en-IN')}/day
          </div>
          <span className="text-[10px] text-neutral-500 mt-0.5 block">
            Net daily burn rate
          </span>
        </div>
      </div>

      {/* 3. Primary Centerpiece: Cash Flow Trajectory Graph (Past History + SageMaker Future Forecast) */}
      <main aria-label="Cash Flow Trajectory Chart">
        <ForecastingCharts data={data} />
      </main>

    </div>
  );
}
