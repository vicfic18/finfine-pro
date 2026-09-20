'use client';

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Link from 'next/link';
import {
  Sparkles,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  UploadCloud,
  CalendarClock,
  MessageSquare,
  RefreshCw,
  Clock,
  FileText,
  Building2,
  Calendar
} from 'lucide-react';
import ForecastingCharts from '@/components/dashboard/ForecastingCharts';
import FinFineProLoader from '@/components/ui/FinFineProLoader';
import BrandLogo from '@/components/ui/BrandLogo';
import type { FinancialMetricData } from '@/lib/financial-store';
import { authenticatedFetch } from '@/lib/authenticated-fetch';

export default function DashboardPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<FinancialMetricData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const loadData = async (isRefresh = false) => {
    try {
      setLoading(true);
      setError(null);
      const url = isRefresh ? '/api/dashboard/financial-data?refresh=true' : '/api/dashboard/financial-data';
      const res = await authenticatedFetch(url);
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
    const timer = window.setTimeout(() => { void loadData(); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  if (loading) {
    return <FinFineProLoader />;
  }

  if (error || !data) {
    return (
      <div className="max-w-xl mx-auto my-20 p-8 bg-white border border-neutral-200 text-center space-y-4">
        <div className="w-12 h-12 bg-red-50 text-red-600 mx-auto flex items-center justify-center rounded-full">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold font-display text-neutral-900">
          {t('common.errorLoading', 'Failed to Load Financial Metrics')}
        </h2>
        <p className="text-xs text-neutral-500 max-w-sm mx-auto">
          {error || 'Unable to retrieve live cash flow trajectory.'}
        </p>
        <button
          onClick={() => void loadData(true)}
          className="inline-flex items-center space-x-2 px-5 py-2.5 bg-neutral-900 text-white text-xs font-bold uppercase tracking-wider hover:bg-neutral-800 transition-colors cursor-pointer"
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
    .slice(0, 4);

  return (
    <div className="flex flex-col max-w-7xl mx-auto w-full font-sans space-y-6">
      
      {/* 1. Breadcrumbs & Executive Header */}
      <div className="space-y-2">
        <div className="flex items-center space-x-2 text-xs font-medium text-neutral-400">
          <BrandLogo size="sm" />
          <span>/</span>
          <span>{t('dashboard.overview', 'Overview')}</span>
        </div>

        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
          <div>
            <h1 className="font-display font-bold text-3xl sm:text-4xl text-neutral-900 tracking-tight leading-none">
              {data.businessName || 'My Business'}
            </h1>
            <p className="text-xs text-neutral-500 mt-1.5 flex items-center space-x-2">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
              <span>Deterministic cash flow & liquidity trajectory</span>
            </p>
          </div>
        </header>
      </div>

      {/* 2. Quick Actions Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Link
          href="/dashboard/ingestion"
          className="p-3.5 bg-white border border-neutral-200 hover:border-neutral-900 hover:shadow-xs transition-all group flex items-center justify-between"
        >
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded bg-neutral-100 group-hover:bg-neutral-900 group-hover:text-white flex items-center justify-center text-neutral-700 transition-colors">
              <UploadCloud size={16} />
            </div>
            <div>
              <p className="text-xs font-bold text-neutral-900">{t('dashboard.actionUpload', 'Upload Invoices & Statements')}</p>
              <p className="text-[11px] text-neutral-500">Sync fresh financial data</p>
            </div>
          </div>
          <ArrowRight size={14} className="text-neutral-400 group-hover:text-neutral-900 group-hover:translate-x-0.5 transition-all" />
        </Link>

        <Link
          href="/dashboard/obligations"
          className="p-3.5 bg-white border border-neutral-200 hover:border-neutral-900 hover:shadow-xs transition-all group flex items-center justify-between"
        >
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded bg-neutral-100 group-hover:bg-neutral-900 group-hover:text-white flex items-center justify-center text-neutral-700 transition-colors">
              <CalendarClock size={16} />
            </div>
            <div>
              <p className="text-xs font-bold text-neutral-900">{t('dashboard.actionObligation', 'Schedule Payment / EMI')}</p>
              <p className="text-[11px] text-neutral-500">Manage upcoming outflows</p>
            </div>
          </div>
          <ArrowRight size={14} className="text-neutral-400 group-hover:text-neutral-900 group-hover:translate-x-0.5 transition-all" />
        </Link>

        <Link
          href="/dashboard/chat"
          className="p-3.5 bg-neutral-900 text-white hover:bg-neutral-800 transition-all group flex items-center justify-between"
        >
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded bg-neutral-800 flex items-center justify-center text-amber-400">
              <Sparkles size={16} />
            </div>
            <div>
              <p className="text-xs font-bold text-white">{t('dashboard.actionAI', 'Ask Financial AI')}</p>
              <p className="text-[11px] text-neutral-400">Runway & tax advisory</p>
            </div>
          </div>
          <ArrowRight size={14} className="text-neutral-400 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
        </Link>
      </div>

      {/* 3. Primary KPI Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 bg-white border border-neutral-200 divide-y sm:divide-y-0 sm:divide-x divide-neutral-200">
        <div className="p-4 sm:p-5">
          <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider block">
            {t('dashboard.totalLiquidCash', 'Total Liquid Cash')}
          </span>
          <div className="font-display text-2xl sm:text-3xl font-bold text-neutral-900 mt-1">
            ₹{data.totalLiquidBalance.toLocaleString('en-IN')}
          </div>
          <span className="text-[11px] text-neutral-500 mt-0.5 block">
            {t('dashboard.bankLedger', 'Verified bank ledger balance')}
          </span>
        </div>

        <div className="p-4 sm:p-5">
          <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider block">
            {t('dashboard.spendableCash', 'Spendable Cash')}
          </span>
          <div className="font-display text-2xl sm:text-3xl font-bold text-neutral-900 mt-1">
            ₹{data.spendableLiquidity.toLocaleString('en-IN')}
          </div>
          <span className="text-[11px] text-neutral-500 mt-0.5 block">
            {t('dashboard.afterBuffer', 'After tax lockbox & safety reserve')}
          </span>
        </div>

        <div className="p-4 sm:p-5">
          <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider block">
            {t('dashboard.cashRunway', 'Cash Runway')}
          </span>
          <div className={`font-display text-2xl sm:text-3xl font-bold mt-1 ${data.daysToZero < 14 ? 'text-orange-600' : 'text-neutral-900'}`}>
            {data.daysToZero} {t('dashboard.days', 'Days')}
          </div>
          <span className="text-[11px] text-neutral-500 mt-0.5 block">
            {t('dashboard.zeroDepletion', 'Zero-cash depletion horizon')}
          </span>
        </div>

        <div className="p-4 sm:p-5">
          <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider block">
            {t('dashboard.operatingVelocity', 'Operating Velocity')}
          </span>
          <div className="font-display text-2xl sm:text-3xl font-bold text-neutral-900 mt-1">
            ₹{data.netDailyBurn.toLocaleString('en-IN')}/day
          </div>
          <span className="text-[11px] text-neutral-500 mt-0.5 block">
            {t('dashboard.netBurn', 'Net daily burn rate')}
          </span>
        </div>
      </div>

      {/* 4. Primary Centerpiece: Cash Flow Trajectory Graph */}
      <div className="bg-white border border-neutral-200">
        <ForecastingCharts data={data} />
      </div>

      {/* 5. Command Center Lower Row: Upcoming Commitments & Statutory Sentinel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Upcoming Obligations Summary Card */}
        <div className="bg-white border border-neutral-200 p-5 sm:p-6 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
            <div className="flex items-center space-x-2">
              <CalendarClock className="w-4 h-4 text-neutral-700" />
              <h3 className="font-display font-bold text-lg text-neutral-900">
                {t('dashboard.upcomingCommitments', 'Upcoming Commitments & Outflows')}
              </h3>
            </div>
            <Link
              href="/dashboard/obligations"
              className="text-xs font-semibold text-neutral-600 hover:text-neutral-900 flex items-center space-x-1"
            >
              <span>{t('common.viewAll', 'View All')}</span>
              <ArrowRight size={12} />
            </Link>
          </div>

          <div className="space-y-2.5 flex-1">
            {upcomingEvents.length > 0 ? (
              upcomingEvents.map((evt, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 bg-neutral-50 hover:bg-neutral-100/80 transition-colors border border-neutral-100"
                >
                  <div className="flex items-center space-x-3">
                    <div className="text-center px-2 py-1 bg-white border border-neutral-200 shrink-0">
                      <span className="text-[10px] font-mono text-neutral-500 block">Day +{evt.day}</span>
                      <span className="text-xs font-bold text-neutral-800">{evt.date.split('-').slice(1).join('/')}</span>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-neutral-900">
                        {evt.statutoryDrain || evt.events?.join(', ') || 'Scheduled Payment'}
                      </p>
                      <p className="text-[11px] text-neutral-400">
                        {evt.statutoryDrain ? 'Statutory Tax Deadlines' : 'Vendor & Operational Outflows'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs font-bold font-mono text-neutral-900">
                      -₹{(evt.outflow || 0).toLocaleString('en-IN')}
                    </span>
                    <span className="text-[10px] text-amber-700 font-medium block">Due in {evt.day}d</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-6 text-center text-xs text-neutral-400">
                No immediate payment obligations scheduled in the next 15 days.
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-neutral-100 flex items-center justify-between text-xs text-neutral-500">
            <span>Next 15 Days Outflows:</span>
            <span className="font-bold font-mono text-neutral-900">
              ₹{(data.commitmentsNext15Days || 0).toLocaleString('en-IN')}
            </span>
          </div>
        </div>

        {/* Statutory Tax & Lockbox Sentinel Card */}
        <div className="bg-white border border-neutral-200 p-5 sm:p-6 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <h3 className="font-display font-bold text-lg text-neutral-900">
                {t('dashboard.statutoryTaxSentinel', 'Statutory Tax Lockbox Sentinel')}
              </h3>
            </div>
            <Link
              href="/dashboard/tax-compliance"
              className="text-xs font-semibold text-neutral-600 hover:text-neutral-900 flex items-center space-x-1"
            >
              <span>{t('common.taxProfile', 'Tax Profile')}</span>
              <ArrowRight size={12} />
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-neutral-50 border border-neutral-100">
              <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block">
                GST Reserved
              </span>
              <span className="font-display text-lg font-bold text-neutral-900 mt-0.5 block">
                ₹{(data.statutoryBreakdown?.gst || 0).toLocaleString('en-IN')}
              </span>
              <span className="text-[10px] text-neutral-500">GSTR-3B monthly safe reserve</span>
            </div>

            <div className="p-3 bg-neutral-50 border border-neutral-100">
              <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block">
                TDS & PF/ESIC
              </span>
              <span className="font-display text-lg font-bold text-neutral-900 mt-0.5 block">
                ₹{((data.statutoryBreakdown?.tds || 0) + (data.statutoryBreakdown?.pfEsic || 0)).toLocaleString('en-IN')}
              </span>
              <span className="text-[10px] text-neutral-500">Payroll & vendor withholding</span>
            </div>
          </div>

          <div className="p-3 bg-amber-50/70 border border-amber-200 flex items-start space-x-3">
            <Clock className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
            <div className="text-xs">
              <p className="font-bold text-amber-900">Total Statutory Shield Reserved: ₹{(data.statutoryLockbox || 0).toLocaleString('en-IN')}</p>
              <p className="text-[11px] text-amber-800 mt-0.5">
                Automatically ring-fenced from spendable liquidity to protect your business against MCA penalties.
              </p>
            </div>
          </div>

          <div className="pt-2 border-t border-neutral-100 flex items-center justify-between text-xs text-neutral-500">
            <span>Compliance Integrity:</span>
            <span className="font-bold text-emerald-600 flex items-center space-x-1">
              <ShieldCheck size={13} />
              <span>100% Ring-Fenced</span>
            </span>
          </div>
        </div>

      </div>

    </div>
  );
}
