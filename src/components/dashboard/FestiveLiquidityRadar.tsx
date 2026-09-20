'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Sparkles,
  ShieldAlert,
  Calendar,
  ArrowUpRight,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  Scale,
  Compass,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { FinancialMetricData } from '@/lib/financial-store';
import type { StatutoryAdvisoryResponse } from '@/lib/statutory-cron-service';

interface FestiveLiquidityRadarProps {
  data: FinancialMetricData;
  advisory?: StatutoryAdvisoryResponse | null;
  onRefreshAdvisory?: () => void;
  advisoryLoading?: boolean;
}

export default function FestiveLiquidityRadar({
  data,
  advisory,
  onRefreshAdvisory,
  advisoryLoading,
}: FestiveLiquidityRadarProps) {
  const { t } = useTranslation();
  const mlForecast = data.mlForecast;
  const milestones = mlForecast?.upcomingMilestones || [];
  const festiveUplift = mlForecast?.festiveUpliftInr ?? 0;
  const statutoryDrain = mlForecast?.statutoryTaxDrainInr ?? data.statutoryLockbox ?? 0;
  const p10Min = mlForecast?.confidenceInterval?.p10MinBalance ?? Math.round(data.totalLiquidBalance * 0.7);

  const upcomingFestivalsList = milestones
    .filter((m) => m.type === 'FESTIVAL' || m.type === 'MEGA_SALE')
    .map((m) => m.title)
    .slice(0, 3)
    .join(', ');

  const upcomingTaxesList = milestones
    .filter((m) => m.type === 'STATUTORY_TAX')
    .map((m) => m.title)
    .slice(0, 3)
    .join(', ');

  const recommendations = advisory?.recommendations && advisory.recommendations.length > 0
    ? advisory.recommendations
    : null;

  // Progressive reveal state for directives (all collapsed by default at load time to prevent clutter)
  const [expandedDirectiveIds, setExpandedDirectiveIds] = useState<Record<string, boolean>>({});

  const toggleDirective = (id: string) => {
    setExpandedDirectiveIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const allDirectivesExpanded = recommendations
    ? recommendations.slice(0, 4).every((r) => expandedDirectiveIds[r.id])
    : Boolean(expandedDirectiveIds['fb-replenishment'] && expandedDirectiveIds['fb-statutory']);

  const toggleAllDirectives = () => {
    if (allDirectivesExpanded) {
      setExpandedDirectiveIds({});
    } else {
      const next: Record<string, boolean> = {};
      if (recommendations) {
        recommendations.slice(0, 4).forEach((r) => {
          next[r.id] = true;
        });
      } else {
        next['fb-replenishment'] = true;
        next['fb-statutory'] = true;
      }
      setExpandedDirectiveIds(next);
    }
  };

  return (
    <div className="w-full bg-white divide-y divide-neutral-200">
      {/* 1. Header Section - Bauhaus Modernist Typography */}
      <div className="p-5 sm:p-6 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 mb-1.5 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            <span className="inline-flex items-center px-1.5 py-0.5 font-bold bg-neutral-900 text-white">
              RADAR
            </span>
            <span>/</span>
            <span>Live Liquidity Projection</span>
          </div>
          <h2 className="font-display font-bold text-2xl sm:text-3xl text-neutral-950 tracking-tight">
            Seasonal Radar
          </h2>
          <p className="text-xs text-neutral-500 mt-1 max-w-2xl">
            Forward liquidity projected against commercial sales catalysts and statutory tax obligations.
          </p>
        </div>

        {/* Status Badge */}
        <div className="flex items-center space-x-2.5 sm:self-start bg-neutral-50 px-3 py-2 border border-neutral-200">
          <div className="w-2 h-2 rounded-none bg-emerald-500 animate-pulse" />
          <div className="text-left font-mono">
            <div className="text-[9.5px] text-neutral-400 uppercase tracking-wider font-bold">
              Daily Status
            </div>
            <div className="text-xs font-bold text-neutral-950">
              Up to Date
            </div>
          </div>
        </div>
      </div>

      {/* 2. Core Metrics Grid - High Contrast Modernist Blocks */}
      <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-neutral-200 bg-white">
        {/* Metric 1: Festive Inflow Uplift */}
        <div className="p-5 sm:p-6 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between text-neutral-400">
            <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-neutral-700">
              Projected Festive Lift
            </span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <div>
            <div className="text-3xl sm:text-4xl font-bold font-display text-emerald-600 tracking-tight">
              +₹{festiveUplift.toLocaleString('en-IN')}
            </div>
            <p className="text-[11px] text-neutral-500 mt-1">
              {upcomingFestivalsList
                ? `Expected influx from ${upcomingFestivalsList}`
                : 'Projected boost across active shopping windows'}
            </p>
          </div>
        </div>

        {/* Metric 2: Statutory Tax Reserve */}
        <div className="p-5 sm:p-6 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between text-neutral-400">
            <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-neutral-700">
              Statutory Tax Reserve
            </span>
            <ShieldAlert className="w-4 h-4 text-orange-600" />
          </div>
          <div>
            <div className="text-3xl sm:text-4xl font-bold font-display text-orange-600 tracking-tight">
              -₹{statutoryDrain.toLocaleString('en-IN')}
            </div>
            <p className="text-[11px] text-neutral-500 mt-1">
              {upcomingTaxesList
                ? `${upcomingTaxesList} ring-fenced for compliance`
                : 'Reserved for GST, TDS and advance tax to avert late penalties'}
            </p>
          </div>
        </div>

        {/* Metric 3: Minimum Cash Cushion */}
        <div className="p-5 sm:p-6 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between text-neutral-400">
            <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-neutral-700">
              Minimum Cash Cushion
            </span>
            <AlertTriangle className="w-4 h-4 text-neutral-700" />
          </div>
          <div>
            <div
              className={`text-3xl sm:text-4xl font-bold font-display tracking-tight ${
                p10Min < data.minimumCashBuffer ? 'text-amber-600' : 'text-neutral-950'
              }`}
            >
              ₹{p10Min.toLocaleString('en-IN')}
            </div>
            <p className="text-[11px] text-neutral-500 mt-1">
              Conservative lower-bound liquidity threshold during stressed debtor delays
            </p>
          </div>
        </div>
      </div>

      {/* 3. Operational Advisory - Progressive Reveal */}
      <div className="p-5 sm:p-6 bg-neutral-50/60 space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center space-x-2.5">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-neutral-500 font-bold mb-0.5">
                Directives
              </div>
              <h3 className="font-display font-bold text-lg text-neutral-950">
                Operational Advisory
              </h3>
            </div>
            {recommendations && (
              <span className="font-mono text-[10px] px-2 py-0.5 border border-neutral-200 bg-white text-neutral-600 font-bold">
                {recommendations.length} Active
              </span>
            )}
          </div>

          <div className="flex items-center space-x-2.5">
            <button
              type="button"
              onClick={toggleAllDirectives}
              className="inline-flex items-center px-2.5 py-1 text-[11px] font-mono font-bold uppercase tracking-wider text-neutral-700 bg-white border border-neutral-200 hover:border-neutral-900 hover:text-neutral-950 transition-colors cursor-pointer"
            >
              <span>{allDirectivesExpanded ? 'Collapse All' : 'Expand All'}</span>
              {allDirectivesExpanded ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />}
            </button>

            {advisory?.timestamp && (
              <span className="font-mono text-[10.5px] text-neutral-500 hidden sm:inline">
                Updated {new Date(advisory.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            {onRefreshAdvisory && (
              <button
                type="button"
                onClick={onRefreshAdvisory}
                disabled={advisoryLoading}
                className="inline-flex items-center px-3 py-1 text-[11px] font-bold text-neutral-900 bg-white border border-neutral-300 hover:border-neutral-900 hover:bg-neutral-50 transition-colors disabled:opacity-50 cursor-pointer"
                title="Refresh advisory directives"
              >
                <RefreshCw className={`w-3 h-3 mr-1.5 ${advisoryLoading ? 'animate-spin' : ''}`} />
                {advisoryLoading ? 'Refreshing...' : 'Refresh'}
              </button>
            )}
          </div>
        </div>

        {/* Progressive Reveal: Clean scannable cards with on-demand expansion */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          {recommendations ? (
            recommendations.slice(0, 4).map((rec) => {
              const isExpanded = !!expandedDirectiveIds[rec.id];

              return (
                <div
                  key={rec.id}
                  className={`bg-white border transition-all duration-150 ${
                    isExpanded
                      ? 'border-neutral-900 shadow-sm'
                      : 'border-neutral-200 hover:border-neutral-400'
                  }`}
                >
                  {/* Card Trigger Header - Minimal Clutter at Load Time */}
                  <button
                    type="button"
                    onClick={() => toggleDirective(rec.id)}
                    className="w-full text-left p-3.5 sm:p-4 cursor-pointer focus:outline-none flex items-start justify-between gap-3"
                    aria-expanded={isExpanded}
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center space-x-2">
                        <span
                          className={`font-mono text-[9px] font-bold uppercase px-1.5 py-0.5 border ${
                            rec.urgency === 'HIGH'
                              ? 'border-neutral-900 bg-neutral-900 text-white'
                              : 'border-neutral-300 bg-neutral-100 text-neutral-700'
                          }`}
                        >
                          {rec.tag}
                        </span>
                        <span className="font-mono text-[10px] text-neutral-400">
                          {rec.urgency === 'HIGH' ? 'Critical Action' : 'Advisory'}
                        </span>
                      </div>

                      <h4 className="font-bold text-neutral-950 text-xs sm:text-sm leading-snug flex items-center">
                        <Scale className="w-3.5 h-3.5 text-neutral-500 mr-1.5 shrink-0" />
                        <span className="truncate">{rec.title}</span>
                      </h4>

                      {/* Brief teaser only when collapsed - clean and compact */}
                      {!isExpanded && (
                        <p className="text-[11px] text-neutral-500 truncate mt-0.5">
                          {rec.advice}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center space-x-1 shrink-0 pt-0.5 text-neutral-600 font-mono text-[10.5px]">
                      <span className="hidden sm:inline font-bold uppercase tracking-wider text-[9.5px]">
                        {isExpanded ? 'Hide' : 'Details'}
                      </span>
                      {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    </div>
                  </button>

                  {/* Progressively Revealed Details */}
                  {isExpanded && (
                    <div className="px-3.5 sm:px-4 pb-4 pt-1 space-y-3 border-t border-neutral-100 animate-in fade-in duration-150">
                      <div>
                        <span className="font-mono text-[9px] uppercase tracking-wider text-neutral-400 font-bold block mb-1">
                          Operational Directive
                        </span>
                        <p className="text-[11.5px] text-neutral-900 font-medium leading-relaxed">
                          👉 {rec.advice}
                        </p>
                      </div>

                      <div className="p-2.5 bg-neutral-50 border border-neutral-200 text-neutral-700">
                        <span className="font-mono text-[9px] uppercase tracking-wider text-neutral-500 font-bold block mb-0.5">
                          Cash Flow Impact
                        </span>
                        <p className="text-[11px] leading-normal">
                          {rec.cashEffect}
                        </p>
                      </div>

                      <div className="pt-2 border-t border-neutral-100 flex items-center justify-between text-[10px] font-mono text-neutral-400">
                        <span className="truncate max-w-[240px]" title={rec.lawReference}>
                          Ref: {rec.lawReference}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleDirective(rec.id)}
                          className="text-neutral-500 hover:text-neutral-950 font-bold uppercase tracking-wider cursor-pointer"
                        >
                          Close Details ▲
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            // Fallback Advisory Items with Progressive Disclosure
            <>
              {/* Fallback 1 */}
              <div
                className={`bg-white border transition-all duration-150 ${
                  expandedDirectiveIds['fb-replenishment']
                    ? 'border-neutral-900 shadow-sm'
                    : 'border-neutral-200 hover:border-neutral-400'
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleDirective('fb-replenishment')}
                  className="w-full text-left p-3.5 sm:p-4 cursor-pointer focus:outline-none flex items-start justify-between gap-3"
                  aria-expanded={!!expandedDirectiveIds['fb-replenishment']}
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-[9px] font-bold uppercase px-1.5 py-0.5 border border-emerald-900 bg-emerald-950 text-emerald-300">
                        Procurement
                      </span>
                      <span className="font-mono text-[10px] text-neutral-400">
                        Supply Buffer
                      </span>
                    </div>
                    <h4 className="font-bold text-neutral-950 text-xs sm:text-sm leading-snug flex items-center">
                      <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600 mr-1.5 shrink-0" />
                      <span>Inventory Replenishment Window</span>
                    </h4>
                    {!expandedDirectiveIds['fb-replenishment'] && (
                      <p className="text-[11px] text-neutral-500 truncate mt-0.5">
                        Allocate supplier procurement capital 5-7 days prior to peak shopping periods.
                      </p>
                    )}
                  </div>

                  <div className="flex items-center space-x-1 shrink-0 pt-0.5 text-neutral-600 font-mono text-[10.5px]">
                    <span className="hidden sm:inline font-bold uppercase tracking-wider text-[9.5px]">
                      {expandedDirectiveIds['fb-replenishment'] ? 'Hide' : 'Details'}
                    </span>
                    {expandedDirectiveIds['fb-replenishment'] ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </div>
                </button>

                {expandedDirectiveIds['fb-replenishment'] && (
                  <div className="px-3.5 sm:px-4 pb-4 pt-1 space-y-3 border-t border-neutral-100 animate-in fade-in duration-150">
                    <div>
                      <span className="font-mono text-[9px] uppercase tracking-wider text-neutral-400 font-bold block mb-1">
                        Operational Directive
                      </span>
                      <p className="text-[11.5px] text-neutral-900 font-medium leading-relaxed">
                        👉 Allocate supplier procurement capital 5-7 days prior to peak shopping periods to avert spot supplier price gouging and transit bottlenecks.
                      </p>
                    </div>

                    <div className="p-2.5 bg-neutral-50 border border-neutral-200 text-neutral-700">
                      <span className="font-mono text-[9px] uppercase tracking-wider text-neutral-500 font-bold block mb-0.5">
                        Cash Flow Impact
                      </span>
                      <p className="text-[11px] leading-normal">
                        Reduces rush purchase freight surcharges by up to 12% and protects merchant operating margins.
                      </p>
                    </div>

                    <div className="pt-2 border-t border-neutral-100 flex items-center justify-between text-[10px] font-mono text-neutral-400">
                      <span>Supply Chain Best Practice</span>
                      <button
                        type="button"
                        onClick={() => toggleDirective('fb-replenishment')}
                        className="text-neutral-500 hover:text-neutral-950 font-bold uppercase tracking-wider cursor-pointer"
                      >
                        Close Details ▲
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Fallback 2 */}
              <div
                className={`bg-white border transition-all duration-150 ${
                  expandedDirectiveIds['fb-statutory']
                    ? 'border-neutral-900 shadow-sm'
                    : 'border-neutral-200 hover:border-neutral-400'
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleDirective('fb-statutory')}
                  className="w-full text-left p-3.5 sm:p-4 cursor-pointer focus:outline-none flex items-start justify-between gap-3"
                  aria-expanded={!!expandedDirectiveIds['fb-statutory']}
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-[9px] font-bold uppercase px-1.5 py-0.5 border border-neutral-900 bg-neutral-900 text-white">
                        Statutory
                      </span>
                      <span className="font-mono text-[10px] text-neutral-400">
                        Compliance
                      </span>
                    </div>
                    <h4 className="font-bold text-neutral-950 text-xs sm:text-sm leading-snug flex items-center">
                      <ShieldAlert className="w-3.5 h-3.5 text-orange-600 mr-1.5 shrink-0" />
                      <span>Statutory Compliance Ring-Fencing</span>
                    </h4>
                    {!expandedDirectiveIds['fb-statutory'] && (
                      <p className="text-[11px] text-neutral-500 truncate mt-0.5">
                        Isolate ₹{statutoryDrain.toLocaleString('en-IN')} in liquid reserves for scheduled GST and TDS remittances.
                      </p>
                    )}
                  </div>

                  <div className="flex items-center space-x-1 shrink-0 pt-0.5 text-neutral-600 font-mono text-[10.5px]">
                    <span className="hidden sm:inline font-bold uppercase tracking-wider text-[9.5px]">
                      {expandedDirectiveIds['fb-statutory'] ? 'Hide' : 'Details'}
                    </span>
                    {expandedDirectiveIds['fb-statutory'] ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </div>
                </button>

                {expandedDirectiveIds['fb-statutory'] && (
                  <div className="px-3.5 sm:px-4 pb-4 pt-1 space-y-3 border-t border-neutral-100 animate-in fade-in duration-150">
                    <div>
                      <span className="font-mono text-[9px] uppercase tracking-wider text-neutral-400 font-bold block mb-1">
                        Operational Directive
                      </span>
                      <p className="text-[11.5px] text-neutral-900 font-medium leading-relaxed">
                        👉 Isolate ₹{statutoryDrain.toLocaleString('en-IN')} in liquid reserves for scheduled GST and TDS remittances before allocating working capital to non-essential inventory.
                      </p>
                    </div>

                    <div className="p-2.5 bg-neutral-50 border border-neutral-200 text-neutral-700">
                      <span className="font-mono text-[9px] uppercase tracking-wider text-neutral-500 font-bold block mb-0.5">
                        Cash Flow Impact
                      </span>
                      <p className="text-[11px] leading-normal">
                        Eliminates Section 50 interest penalties (18% p.a.) and prevents working capital account freezing.
                      </p>
                    </div>

                    <div className="pt-2 border-t border-neutral-100 flex items-center justify-between text-[10px] font-mono text-neutral-400">
                      <span>Central Goods & Services Tax Act</span>
                      <button
                        type="button"
                        onClick={() => toggleDirective('fb-statutory')}
                        className="text-neutral-500 hover:text-neutral-950 font-bold uppercase tracking-wider cursor-pointer"
                      >
                        Close Details ▲
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* 4. Catalyst Horizon - Single Clean Heading */}
      {milestones.length > 0 && (
        <div className="p-5 sm:p-6 bg-white">
          <div className="flex items-center justify-between mb-3.5">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-neutral-400 font-bold mb-0.5">
                Timeline
              </div>
              <h3 className="font-display font-bold text-lg text-neutral-950">
                Catalyst Horizon
              </h3>
            </div>
            <span className="font-mono text-[10.5px] text-neutral-400">
              Next 60 Days
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {milestones.slice(0, 6).map((m, idx) => {
              const isTax = m.type === 'STATUTORY_TAX';
              const isSale = m.type === 'MEGA_SALE';

              return (
                <div
                  key={idx}
                  className={`p-3.5 border text-xs flex flex-col justify-between ${
                    isTax
                      ? 'border-neutral-300 bg-neutral-50/70'
                      : isSale
                      ? 'border-neutral-200 bg-white'
                      : 'border-neutral-200 bg-white'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-mono text-[11px] font-bold text-neutral-700 flex items-center">
                        <Calendar className="w-3 h-3 mr-1 text-neutral-400" />
                        {m.date} (+{m.dayOffset}d)
                      </span>
                      <span
                        className={`font-mono text-[9px] font-bold uppercase px-1.5 py-0.5 border ${
                          isTax
                            ? 'border-neutral-900 bg-neutral-900 text-white'
                            : 'border-neutral-200 bg-neutral-100 text-neutral-700'
                        }`}
                      >
                        {isTax ? 'Tax Filing' : isSale ? 'Mega Sale' : 'Festival'}
                      </span>
                    </div>
                    <h4 className="font-bold text-neutral-950 text-xs mb-1">
                      {m.title}
                    </h4>
                    <p className="text-[11px] text-neutral-600 leading-snug">
                      {isTax
                        ? 'Government filing deadline. File on or before schedule to prevent penalty accrual.'
                        : m.expectedImpact}
                    </p>
                  </div>
                  <div className="mt-2.5 pt-2 border-t border-neutral-200/80 text-[10.5px] font-medium text-neutral-700">
                    💡 {isTax ? 'Maintain liquid reserve 3 days prior in primary bank.' : m.recommendedAction}
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
