'use client';

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Link from 'next/link';
import {
  ArrowRight,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import ForecastingCharts from '@/components/dashboard/ForecastingCharts';
import RiskCalendar from '@/components/dashboard/RiskCalendar';
import FinFineProLoader from '@/components/ui/FinFineProLoader';
import BrandLogo from '@/components/ui/BrandLogo';
import type { FinancialMetricData } from '@/lib/financial-store';

export default function DashboardPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<FinancialMetricData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/dashboard/financial-data');
      if (!res.ok) throw new Error('Failed to load financial records');
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      console.error('Failed to load dashboard data:', err);
      setError(err?.message || 'Could not fetch dashboard metrics. Please check your network or server status.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading) {
    return <FinFineProLoader />;
  }

  if (error || !data) {
    return (
      <div className="max-w-xl mx-auto my-20 p-8 bg-white border border-neutral-300 text-center space-y-4 shadow-sm">
        <div className="w-12 h-12 bg-red-50 text-red-600 mx-auto flex items-center justify-center border border-red-200">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold font-display text-neutral-950">
          {t('common.errorLoading', 'Failed to Load Financial Metrics')}
        </h2>
        <p className="text-xs text-neutral-500 max-w-sm mx-auto">
          {error || 'Unable to retrieve live cash flow trajectory.'}
        </p>
        <button
          onClick={loadData}
          className="inline-flex items-center space-x-2 px-5 py-2.5 bg-neutral-950 text-white text-xs font-mono font-bold uppercase tracking-wider hover:bg-neutral-800 transition-colors cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
          <span>{t('common.retry', 'Retry Connection')}</span>
        </button>
      </div>
    );
  }

  const isSafe = data.solvencyStatus === 'Safe';

  // Extract upcoming events and commitments from future trajectory
  const upcomingEvents = (data.trajectory60Days || [])
    .filter((d) => !d.isHistorical && !d.isAnchor && (d.events?.length > 0 || d.statutoryDrain))
    .slice(0, 6);

  return (
    <div className="max-w-7xl mx-auto w-full font-sans border border-neutral-300 bg-white divide-y divide-neutral-300 shadow-xs">
      
      {/* 1. Bauhaus Header Masthead */}
      <header className="p-6 sm:p-8 bg-white flex flex-col justify-between gap-4">
        <div className="flex items-center justify-between pb-3 border-b border-neutral-200 text-xs">
          <div className="flex items-center space-x-2 font-mono text-[10.5px] font-bold text-neutral-500 uppercase tracking-widest">
            <BrandLogo size="sm" />
            <span>/</span>
            <span>{t('dashboard.overview', 'Overview')}</span>
            <span>/</span>
          </div>

        </div>

        <div className="pt-2 flex flex-col sm:flex-row sm:items-baseline justify-between gap-3">
          <div>
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-400 block mb-1">
              Welcome
            </span>
            <h1 className="font-display font-bold text-3xl sm:text-4xl lg:text-5xl text-neutral-950 tracking-tight leading-none">
              {data.businessName || 'My Business'}
            </h1>
          </div>
        </div>
      </header>

      {/* 2. Primary KPI Bar - Two Column Grid on Mobile, Four Column on Desktop */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-neutral-300">
        
        {/* KPI 01: Total Liquid Cash */}
        <div className="p-4 sm:p-6 lg:p-7 bg-white flex flex-col justify-between hover:bg-neutral-50/40 transition-colors">
          <div>
            <span className="font-mono text-[9.5px] sm:text-[10.5px] font-bold text-neutral-400 uppercase tracking-[0.15em] sm:tracking-[0.18em] block truncate">
              {t('dashboard.totalLiquidCash', 'Total Liquid Cash')}
            </span>
            <div className="my-2 sm:my-3 font-display text-xl sm:text-3xl lg:text-[42px] font-bold text-neutral-950 tracking-tight leading-none tabular-nums truncate">
              <span className="text-base sm:text-2xl lg:text-3xl text-neutral-400 font-light font-sans mr-0.5 select-none">₹</span>
              {data.totalLiquidBalance.toLocaleString('en-IN')}
            </div>
          </div>
          <div className="pt-2 sm:pt-3 border-t border-neutral-100 flex items-center justify-between text-[10px] sm:text-[11px] font-mono text-neutral-500">
            <span className="truncate">Bank ledger</span>
            <span className="font-bold text-neutral-900 shrink-0">Reconciled</span>
          </div>
        </div>

        {/* KPI 02: Spendable Cash */}
        <div className="p-4 sm:p-6 lg:p-7 bg-white flex flex-col justify-between hover:bg-neutral-50/40 transition-colors">
          <div>
            <span className="font-mono text-[9.5px] sm:text-[10.5px] font-bold text-neutral-400 uppercase tracking-[0.15em] sm:tracking-[0.18em] block truncate">
              {t('dashboard.spendableCash', 'Spendable Cash')}
            </span>
            <div className="my-2 sm:my-3 font-display text-xl sm:text-3xl lg:text-[42px] font-bold text-neutral-950 tracking-tight leading-none tabular-nums truncate">
              <span className="text-base sm:text-2xl lg:text-3xl text-neutral-400 font-light font-sans mr-0.5 select-none">₹</span>
              {data.spendableLiquidity.toLocaleString('en-IN')}
            </div>
          </div>
          <div className="pt-2 sm:pt-3 border-t border-neutral-100 flex items-center justify-between text-[10px] sm:text-[11px] font-mono text-neutral-500">
            <span className="truncate">Lockbox buffer</span>
            <span className="font-bold text-emerald-700 shrink-0">Protected</span>
          </div>
        </div>

        {/* KPI 03: Cash Runway */}
        <div className="p-4 sm:p-6 lg:p-7 bg-white flex flex-col justify-between hover:bg-neutral-50/40 transition-colors">
          <div>
            <span className="font-mono text-[9.5px] sm:text-[10.5px] font-bold text-neutral-400 uppercase tracking-[0.15em] sm:tracking-[0.18em] block truncate">
              {t('dashboard.cashRunway', 'Cash Runway')}
            </span>
            <div className="my-2 sm:my-3 flex items-baseline truncate">
              <div className={`font-display text-2xl sm:text-4xl lg:text-[50px] font-bold tracking-tight leading-none tabular-nums ${
                data.daysToZero < 14 ? 'text-orange-600' : 'text-neutral-950'
              }`}>
                {data.daysToZero}
              </div>
              <span className="text-xs sm:text-base lg:text-lg font-bold font-mono text-neutral-400 ml-1.5 sm:ml-2 tracking-wider uppercase">
                {t('dashboard.days', 'Days')}
              </span>
            </div>
          </div>
          <div className="pt-2 sm:pt-3 border-t border-neutral-100 flex items-center justify-between text-[10px] sm:text-[11px] font-mono text-neutral-500">
            <span className="truncate">Zero depletion</span>
            <span className={`font-bold shrink-0 ${data.daysToZero < 14 ? 'text-orange-600' : 'text-emerald-700'}`}>
              {data.daysToZero < 14 ? 'Low Runway' : 'Solvent'}
            </span>
          </div>
        </div>

        {/* KPI 04: Operating Velocity */}
        <div className="p-4 sm:p-6 lg:p-7 bg-white flex flex-col justify-between hover:bg-neutral-50/40 transition-colors">
          <div>
            <span className="font-mono text-[9.5px] sm:text-[10.5px] font-bold text-neutral-400 uppercase tracking-[0.15em] sm:tracking-[0.18em] block truncate">
              {t('dashboard.operatingVelocity', 'Operating Velocity')}
            </span>
            <div className="my-2 sm:my-3 flex items-baseline truncate">
              <div className="font-display text-xl sm:text-3xl lg:text-[42px] font-bold text-neutral-950 tracking-tight leading-none tabular-nums truncate">
                <span className="text-base sm:text-2xl lg:text-3xl text-neutral-400 font-light font-sans mr-0.5 select-none">₹</span>
                {data.netDailyBurn.toLocaleString('en-IN')}
              </div>
              <span className="text-[10px] sm:text-xs font-bold font-mono text-neutral-400 ml-1 sm:ml-1.5 uppercase shrink-0">
                /day
              </span>
            </div>
          </div>
          <div className="pt-2 sm:pt-3 border-t border-neutral-100 flex items-center justify-between text-[10px] sm:text-[11px] font-mono text-neutral-500">
            <span className="truncate">Daily burn</span>
            <span className="font-bold text-neutral-900 shrink-0">30d Avg</span>
          </div>
        </div>

      </div>

      {/* 3. Primary Centerpiece: Cash Flow Trajectory Graph (Zero gap continuation) */}
      <section aria-label="Cash Flow Trajectory" className="bg-white">
        <ForecastingCharts data={data} />
      </section>

      {/* 4. Side-By-Side Geometrical Grid: Upcoming Commitments & Liquidity Calendar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-neutral-300 bg-white">
        
        {/* Left Column: Upcoming Commitments & Outflows */}
        <div className="bg-white p-6 sm:p-8 flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-200">
              <div>
                <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-0.5">
                  01 / Commitments
                </span>
                <h3 className="font-display font-bold text-2xl text-neutral-950 tracking-tight">
                  {t('dashboard.upcomingCommitments', 'Upcoming Commitments')}
                </h3>
              </div>
              <Link
                href="/dashboard/obligations"
                className="inline-flex items-center px-3 py-1.5 text-xs font-mono font-bold uppercase tracking-wider text-neutral-950 bg-white border border-neutral-300 hover:border-neutral-950 hover:bg-neutral-50 transition-colors cursor-pointer"
              >
                <span>{t('common.viewAll', 'Manage All')}</span>
                <ArrowRight size={12} className="ml-1.5" />
              </Link>
            </div>

            {/* Big Outflows Summary Hero */}
            <div className="p-4 bg-neutral-50 border border-neutral-200 flex items-baseline justify-between">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-neutral-500 block">
                  Next 15 Days Outflows
                </span>
                <span className="font-display text-2xl sm:text-3xl font-bold text-neutral-950 tabular-nums">
                  ₹{(data.commitmentsNext15Days || 0).toLocaleString('en-IN')}
                </span>
              </div>
              <span className="font-mono text-[10.5px] text-neutral-500">
                {upcomingEvents.length} obligations due
              </span>
            </div>

            {/* Itemized Commitments List */}
            <div className="space-y-2.5">
              {upcomingEvents.length > 0 ? (
                upcomingEvents.map((evt, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 bg-white border border-neutral-200 hover:border-neutral-950 transition-colors flex items-center justify-between gap-3 shadow-xs"
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className="text-center px-2 py-1 bg-neutral-900 text-white font-mono shrink-0">
                        <span className="text-[9px] block uppercase text-neutral-400 font-bold">Day</span>
                        <span className="text-xs font-bold leading-tight">+{evt.day}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-neutral-950 truncate">
                          {evt.statutoryDrain || evt.events?.join(', ') || 'Scheduled Payment'}
                        </p>
                        <p className="text-[10.5px] text-neutral-500 font-mono mt-0.5">
                          Date: {evt.date} • {evt.statutoryDrain ? 'Statutory Remittance' : 'Commercial Supplier'}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-sm font-bold font-display text-neutral-950 block">
                        -₹{(evt.outflow || 0).toLocaleString('en-IN')}
                      </span>
                      <span className="text-[10px] font-mono text-amber-700 font-bold">
                        Due in {evt.day}d
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-xs text-neutral-400 font-mono border border-dashed border-neutral-200">
                  No immediate payment obligations scheduled in the next 15 days.
                </div>
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-neutral-200 flex items-center justify-between text-xs font-mono text-neutral-500">
            <span>Solvency ring-fence:</span>
            <span className="font-bold text-emerald-700">₹{data.spendableLiquidity.toLocaleString('en-IN')} buffered</span>
          </div>
        </div>

        {/* Right Column: Liquidity Calendar */}
        <div className="bg-white">
          <RiskCalendar data={data} />
        </div>

      </div>

    </div>
  );
}
