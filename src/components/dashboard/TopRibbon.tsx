'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { FinancialMetricData } from '@/lib/financial-store';

interface TopRibbonProps {
  data: FinancialMetricData;
  simulatedExpense?: number;
  simulatedDelay?: number;
}

export default function TopRibbon({ data, simulatedExpense = 0, simulatedDelay = 0 }: TopRibbonProps) {
  const { t } = useTranslation();

  // Adjust daysToZero based on simulation if active
  let effectiveDaysToZero = data.daysToZero;
  let effectiveSpendable = Math.max(0, data.spendableLiquidity - simulatedExpense);
  
  if (simulatedExpense > 0 || simulatedDelay > 0) {
    const impactDeduction = Math.floor(simulatedExpense / 5000) + Math.floor(simulatedDelay * 1.5);
    effectiveDaysToZero = Math.max(2, data.daysToZero - impactDeduction);
  }

  const isCriticalRunway = effectiveDaysToZero < 14;
  const isShortfall = data.liquidityStressRatio < 1.0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-neutral-200 w-full bg-white">
      
      {/* 1. Cash Runway */}
      <div className="border-b lg:border-b-0 border-neutral-200 p-4 sm:p-6 lg:p-7 flex flex-col justify-between bg-white">
        <div>
          <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
            {t('topRibbon.cashRunway', 'Cash Runway')}
          </div>

          <div className="flex items-baseline space-x-1.5 sm:space-x-2 mt-3 sm:mt-4">
            <span className={`font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-none ${
              isCriticalRunway ? 'text-orange-600' : 'text-neutral-900'
            }`}>
              {effectiveDaysToZero}
            </span>
            <span className="text-xs sm:text-sm font-semibold text-neutral-500 uppercase tracking-wider">
              {t('topRibbon.daysLeft', 'days left')}
            </span>
          </div>
        </div>

        <div className="mt-5 text-[11px] text-neutral-400">
          {t('topRibbon.zeroCashBufferNote', 'Zero-cash buffer without new sales')}
        </div>
      </div>

      {/* 2. Spendable Cash */}
      <div className="border-b lg:border-b-0 border-neutral-200 p-4 sm:p-6 lg:p-7 flex flex-col justify-between bg-white">
        <div>
          <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
            {t('topRibbon.spendableCash', 'Spendable Cash')}
          </div>

          <div className="mt-3 sm:mt-4">
            <div className="font-display text-2xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-neutral-900 leading-none">
              ₹{effectiveSpendable.toLocaleString('en-IN')}
            </div>
          </div>
        </div>

        <div className="mt-5 space-y-0.5 text-[11px]">
          <div className="flex justify-between text-neutral-500">
            <span>{t('topRibbon.taxLockbox', 'Tax Lockbox:')}</span>
            <span className="font-medium text-neutral-800 font-display">₹{data.statutoryLockbox.toLocaleString('en-IN')}</span>
          </div>
          {data.minimumCashBuffer > 0 && (
            <div className="flex justify-between text-neutral-500">
              <span>{t('topRibbon.safetyBuffer', 'Safety Buffer:')}</span>
              <span className="font-medium text-neutral-800 font-display">₹{data.minimumCashBuffer.toLocaleString('en-IN')}</span>
            </div>
          )}
          <div className="flex justify-between text-neutral-400">
            <span>{t('topRibbon.totalBank', 'Total Bank:')}</span>
            <span className="font-medium text-neutral-700">₹{data.totalLiquidBalance.toLocaleString('en-IN')}</span>
          </div>
        </div>
      </div>

      {/* 3. Daily Money Spent */}
      <div className="p-4 sm:p-6 lg:p-7 flex flex-col justify-between bg-white">
        <div>
          <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
            {t('topRibbon.dailyBurn', 'Daily Burn')}
          </div>

          <div className="flex items-baseline space-x-1.5 mt-3 sm:mt-4">
            <span className="font-display text-2xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-neutral-900 leading-none">
              ₹{data.netDailyBurn.toLocaleString('en-IN')}
            </span>
            <span className="text-[10px] sm:text-xs text-neutral-400 font-medium">
              {t('topRibbon.perDay', '/day')}
            </span>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between text-[11px] text-neutral-500">
          <span>{t('topRibbon.monthly', 'Monthly:')}</span>
          <span className="font-semibold text-neutral-900 font-display">
            ₹{(data.netDailyBurn * 30).toLocaleString('en-IN')}
          </span>
        </div>
      </div>

      {/* 4. 15-Day Bill Coverage */}
      <div className="p-4 sm:p-6 lg:p-7 flex flex-col justify-between bg-white">
        <div>
          <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
            {t('topRibbon.fifteenDayCoverage', '15-Day Coverage')}
          </div>

          <div className="flex items-baseline space-x-1.5 sm:space-x-2 mt-3 sm:mt-4">
            <span className={`font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-none ${
              isShortfall ? 'text-orange-600' : 'text-neutral-900'
            }`}>
              {data.liquidityStressRatio}x
            </span>
          </div>
        </div>

        <div className="mt-5 space-y-0.5 text-[11px]">
          <div className="flex justify-between text-neutral-500">
            <span>{t('topRibbon.inflowsNext15', 'Inflows:')}</span>
            <span className="font-medium text-neutral-800">
              ₹{(data.totalLiquidBalance + data.inflowsNext15Days).toLocaleString('en-IN')}
            </span>
          </div>
          <div className="flex justify-between text-neutral-400">
            <span>{t('topRibbon.dueBills', 'Due Bills:')}</span>
            <span className={`font-medium ${isShortfall ? 'text-orange-600 font-semibold' : 'text-neutral-700'}`}>
              ₹{data.commitmentsNext15Days.toLocaleString('en-IN')}
            </span>
          </div>
        </div>
      </div>

    </div>
  );
}

