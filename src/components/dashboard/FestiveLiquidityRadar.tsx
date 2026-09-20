'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, ShieldAlert, Calendar, ArrowUpRight, TrendingUp, AlertTriangle } from 'lucide-react';
import type { FinancialMetricData } from '@/lib/financial-store';

interface FestiveLiquidityRadarProps {
  data: FinancialMetricData;
}

export default function FestiveLiquidityRadar({ data }: FestiveLiquidityRadarProps) {
  const { t } = useTranslation();
  const mlForecast = data.mlForecast;
  const milestones = mlForecast?.upcomingMilestones || [];
  const festiveUplift = mlForecast?.festiveUpliftInr ?? 125000;
  const statutoryDrain = mlForecast?.statutoryTaxDrainInr ?? 65000;
  const p10Min = mlForecast?.confidenceInterval?.p10MinBalance ?? Math.round(data.totalLiquidBalance * 0.7);

  return (
    <div className="w-full bg-white divide-y divide-neutral-200">
      {/* Header Section */}
      <div className="p-4 sm:p-6 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 mb-1.5">
            <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
              <Sparkles className="w-3 h-3 mr-1 text-amber-600" />
              AWS SageMaker Intelligence
            </span>
            <span className="text-[11px] font-mono text-neutral-400">
              Serverless • {mlForecast?.engine === 'AWS_SAGEMAKER_SERVERLESS' ? 'Live Cloud Endpoint' : 'Chronos-Bolt Quantile'}
            </span>
          </div>
          <h2 className="font-display font-bold text-2xl sm:text-3xl text-neutral-900 tracking-tight">
            {t('festive.title', 'Festive Liquidity Radar & Tax Shield')}
          </h2>
          <p className="text-xs text-neutral-500 mt-1 max-w-2xl">
            {t(
              'festive.subtitle',
              'Indian festival demand surges (Diwali, Dhanteras, BBD) and statutory tax traps (GSTR-3B, TDS, Advance Tax) projected on sparse cash patterns.'
            )}
          </p>
        </div>

        {/* Solvency Status Pill */}
        <div className="flex items-center space-x-3 sm:self-start bg-neutral-50 p-2.5 border border-neutral-200">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <div className="text-left">
            <div className="text-[10px] text-neutral-400 uppercase font-bold tracking-wider">
              {t('festive.radarStatus', 'Model Status')}
            </div>
            <div className="text-xs font-bold text-neutral-900">
              {mlForecast?.modelName || 'Amazon-Chronos-Bolt'}
            </div>
          </div>
        </div>
      </div>

      {/* 3 Core Metric Highlights */}
      <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-neutral-200 bg-white">
        {/* Metric 1: Festive Uplift */}
        <div className="p-4 sm:p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between text-neutral-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">
              {t('festive.projectedLift', 'Projected Festive Inflow Lift')}
            </span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-bold font-display text-emerald-600">
              +₹{festiveUplift.toLocaleString('en-IN')}
            </div>
            <p className="text-[11px] text-neutral-500 mt-1">
              Estimated consumer UPI surge from Navratri, Dhanteras & Diwali
            </p>
          </div>
        </div>

        {/* Metric 2: Statutory Tax Reserve Required */}
        <div className="p-4 sm:p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between text-neutral-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">
              {t('festive.statutoryDrain', 'Statutory Tax Lockbox Drain')}
            </span>
            <ShieldAlert className="w-4 h-4 text-orange-600" />
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-bold font-display text-orange-600">
              -₹{statutoryDrain.toLocaleString('en-IN')}
            </div>
            <p className="text-[11px] text-neutral-500 mt-1">
              GSTR-3B (20th), TDS (7th) & Advance Tax ring-fenced
            </p>
          </div>
        </div>

        {/* Metric 3: Conservative 90% VaR Balance */}
        <div className="p-4 sm:p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between text-neutral-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">
              {t('festive.worstCaseBalance', '90% VaR Minimum Balance (P10)')}
            </span>
            <AlertTriangle className="w-4 h-4 text-neutral-700" />
          </div>
          <div>
            <div className={`text-2xl sm:text-3xl font-bold font-display ${p10Min < data.minimumCashBuffer ? 'text-amber-600' : 'text-neutral-900'}`}>
              ₹{p10Min.toLocaleString('en-IN')}
            </div>
            <p className="text-[11px] text-neutral-500 mt-1">
              Pessimistic scenario lower-bound (10th percentile stress limit)
            </p>
          </div>
        </div>
      </div>

      {/* Strategic AI Recommendations Banner */}
      <div className="p-4 sm:p-6 bg-neutral-50/70">
        <div className="text-xs font-bold text-neutral-900 uppercase tracking-wider mb-2 flex items-center">
          <Sparkles className="w-3.5 h-3.5 text-amber-500 mr-1.5" />
          {t('festive.strategicGuidance', 'CFO AI Recommendation • Indian Festive Window')}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-neutral-700">
          <div className="p-3 bg-white border border-neutral-200 flex items-start space-x-2.5">
            <ArrowUpRight className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-neutral-900 block mb-0.5">
                Pre-Festive Inventory Stocking Window
              </span>
              Purchase wholesale inventory before festival surges to capture bulk trade discounts (typically 2-4% cash discounts) and avoid supply delays.
            </div>
          </div>
          <div className="p-3 bg-white border border-neutral-200 flex items-start space-x-2.5">
            <ShieldAlert className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-neutral-900 block mb-0.5">
                GSTR-3B Tax Ring-Fencing (20th of Month)
              </span>
              Do not deploy full weekend cash collections into inventory on the 18th; ring-fence required GST challan funds to avert 18% p.a. statutory interest penalties.
            </div>
          </div>
        </div>
      </div>

      {/* Upcoming Indian Milestones Timeline */}
      {milestones.length > 0 && (
        <div className="p-4 sm:p-6 bg-white">
          <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">
            {t('festive.timelineHeading', 'Upcoming Festive & Statutory Catalysts (Next 60 Days)')}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {milestones.slice(0, 6).map((m, idx) => {
              const isTax = m.type === 'STATUTORY_TAX';
              const isSale = m.type === 'MEGA_SALE';

              return (
                <div
                  key={idx}
                  className={`p-3 border text-xs flex flex-col justify-between ${
                    isTax
                      ? 'bg-rose-50/40 border-rose-200'
                      : isSale
                      ? 'bg-amber-50/40 border-amber-200'
                      : 'bg-emerald-50/40 border-emerald-200'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-mono text-[11px] font-bold text-neutral-600 flex items-center">
                        <Calendar className="w-3 h-3 mr-1 text-neutral-400" />
                        {m.date} (+{m.dayOffset}d)
                      </span>
                      <span
                        className={`text-[9.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 ${
                          isTax
                            ? 'bg-rose-100 text-rose-800'
                            : isSale
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {isTax ? 'Tax Deadline' : isSale ? 'Mega Sale' : 'Festival'}
                      </span>
                    </div>
                    <h4 className="font-bold text-neutral-900 text-xs mb-1">
                      {m.title}
                    </h4>
                    <p className="text-[11px] text-neutral-600 leading-snug">
                      {m.expectedImpact}
                    </p>
                  </div>
                  <div className="mt-2.5 pt-2 border-t border-neutral-200/60 text-[10.5px] font-medium text-neutral-700">
                    💡 {m.recommendedAction}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
