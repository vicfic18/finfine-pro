'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { FinancialMetricData } from '@/lib/financial-store';

interface ScenarioSimulatorProps {
  data: FinancialMetricData;
  unplannedExpense: number;
  delayDays: number;
  onExpenseChange: (val: number) => void;
  onDelayChange: (val: number) => void;
  onReset: () => void;
}

export default function ScenarioSimulator({
  data,
  unplannedExpense,
  delayDays,
  onExpenseChange,
  onDelayChange,
  onReset,
}: ScenarioSimulatorProps) {
  const { t } = useTranslation();

  // Dynamic simulation computations
  const initialRunway = data.daysToZero;
  const simulatedReduction = Math.min(
    initialRunway - 1,
    Math.floor(unplannedExpense / 6000) + Math.floor(delayDays * 1.6)
  );
  const newRunway = Math.max(1, initialRunway - simulatedReduction);

  // Conflict detection
  const hasConflict = unplannedExpense > 30000 || delayDays > 5;

  return (
    <div className="w-full bg-white divide-y divide-neutral-200">
      
      {/* Header Cell */}
      <div className="flex items-baseline justify-between p-4 sm:p-6 bg-white">
        <div>
          <h3 className="font-display font-bold text-2xl sm:text-3xl text-neutral-900 tracking-tight">
            {t('scenario.title', 'Cash Simulator')}
          </h3>
          <p className="text-xs text-neutral-500 mt-0.5">
            {t('scenario.subtitle', 'Test sudden expenses or customer payment delays')}
          </p>
        </div>

        {(unplannedExpense > 0 || delayDays > 0) && (
          <button
            onClick={onReset}
            className="text-xs font-semibold text-neutral-900 hover:underline transition-colors uppercase tracking-wider cursor-pointer"
          >
            {t('scenario.reset', 'Reset')}
          </button>
        )}
      </div>

      {/* Sliders Area (2-column touching grid) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-neutral-200">
        
        {/* Slider 1: Unplanned Expense */}
        <div className="p-4 sm:p-6 space-y-3 bg-white">
          <div className="flex justify-between items-baseline">
            <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider">
              {t('scenario.unplannedExpense', 'Unplanned Expense:')}
            </span>
            <span className="font-display font-bold text-2xl text-neutral-900">
              ₹{unplannedExpense.toLocaleString('en-IN')}
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="100000"
            step="5000"
            value={unplannedExpense}
            onChange={(e) => onExpenseChange(Number(e.target.value))}
            className="w-full accent-neutral-900 cursor-pointer h-1.5 bg-neutral-200"
          />
          <div className="flex justify-between text-[10px] text-neutral-400">
            <span>₹0</span>
            <span>₹50k</span>
            <span>₹100k</span>
          </div>
        </div>

        {/* Slider 2: Customer Payment Delay */}
        <div className="p-4 sm:p-6 space-y-3 bg-white">
          <div className="flex justify-between items-baseline">
            <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider">
              {t('scenario.customerDelay', 'Customer Delay:')}
            </span>
            <span className="font-display font-bold text-2xl text-neutral-900">
              +{delayDays} {t('scenario.daysSuffix', 'Days')}
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="30"
            step="1"
            value={delayDays}
            onChange={(e) => onDelayChange(Number(e.target.value))}
            className="w-full accent-neutral-900 cursor-pointer h-1.5 bg-neutral-200"
          />
          <div className="flex justify-between text-[10px] text-neutral-400">
            <span>0 {t('common.days', 'days')}</span>
            <span>15 {t('common.days', 'days')}</span>
            <span>30 {t('common.days', 'days')}</span>
          </div>
        </div>

      </div>

      {/* Impact Analysis Cell */}
      <div className="p-4 sm:p-6 space-y-3 bg-neutral-50/20">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400 block mb-1">
              {t('scenario.projectedRunwayImpact', 'Projected Runway Impact')}
            </span>
            <div className="flex items-baseline space-x-3">
              <span className="font-display font-bold text-2xl text-neutral-400 line-through">
                {initialRunway}d
              </span>
              <span className="text-neutral-400 font-bold">──►</span>
              <span className={`font-display font-bold text-4xl sm:text-5xl ${newRunway <= 4 ? 'text-orange-600' : 'text-neutral-900'}`}>
                {newRunway} <span className="text-lg font-sans font-normal text-neutral-500">{t('scenario.daysRunway', 'days runway')}</span>
              </span>
            </div>
          </div>

          {hasConflict && (
            <div className="text-xs text-orange-600 font-semibold">
              {t('scenario.warningConflict', 'Warning: Projected runway falls below safe operating buffer')}
            </div>
          )}
        </div>

        {/* Action Strategy */}
        <div className="text-xs text-neutral-600 pt-1">
          <span className="font-bold text-neutral-900 uppercase tracking-wider block mb-1">
            {t('scenario.mitigationStrategy', 'Mitigation Strategy:')}
          </span>
          <p className="leading-relaxed">
            {unplannedExpense > 0 || delayDays > 0 ? (
              <>
                <span className="block mb-1">
                  {t('scenario.mitigationPoint1', { amount: unplannedExpense.toLocaleString('en-IN'), defaultValue: `1. Consider splitting unexpected outflow of ₹${unplannedExpense.toLocaleString('en-IN')} across multiple payment cycles.` })}
                </span>
                <span className="block">
                  {t('scenario.mitigationPoint2', '2. Follow up on receivables due in the next 14 days before committing new capital.')}
                </span>
              </>
            ) : (
              t('scenario.stableNotice', 'Operational balance is currently stable. Adjust sliders to simulate cash stress and test solvency thresholds.')
            )}
          </p>
        </div>
      </div>

    </div>
  );
}

