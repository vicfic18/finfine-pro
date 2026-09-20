'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Clock } from 'lucide-react';
import type { FinancialMetricData } from '@/lib/financial-store';

interface ObligationsWidgetProps {
  data: FinancialMetricData;
}

export default function ObligationsWidget({ data }: ObligationsWidgetProps) {
  const { t } = useTranslation();
  const { fixedObligationsTotal, variableObligationsTotal, fixedPercentageOfExpectedInflow, workingCapitalCycle, debtorsReliability } = data;
  const totalCommitments = fixedObligationsTotal + variableObligationsTotal;
  const fixedShare = totalCommitments > 0 ? Math.round((fixedObligationsTotal / totalCommitments) * 100) : 0;

  return (
    <div className="space-y-8 divide-y divide-neutral-200">
      
      {/* 1. Monthly Overhead Breakdown */}
      <div className="pt-2">
        <div className="flex items-baseline justify-between pb-3 border-b border-neutral-100">
          <div>
            <h3 className="font-display font-bold text-xl text-neutral-900">
              {t('obligations.monthlyCommitments', 'Monthly Commitments')}
            </h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              {t('obligations.commitmentsSubtitle', 'Fixed costs vs flexible supplier payments')}
            </p>
          </div>
          {fixedPercentageOfExpectedInflow > 0 && (
            <span className="text-xs font-semibold text-neutral-700 bg-neutral-100 px-2.5 py-1">
              {t('obligations.ofInflow', { pct: fixedPercentageOfExpectedInflow, defaultValue: `${fixedPercentageOfExpectedInflow}% of Inflow` })}
            </span>
          )}
        </div>

        {/* Linear Meter */}
        <div className="mt-4">
          <div className="flex justify-between text-xs font-medium text-neutral-600 mb-1.5">
            <span>{t('obligations.fixed', 'Fixed:')} {fixedShare}%</span>
            <span>{t('obligations.flexible', 'Flexible:')} {totalCommitments > 0 ? 100 - fixedShare : 0}%</span>
          </div>
          <div className="w-full h-2 bg-neutral-100 flex">
            <div
              className="bg-neutral-900 h-full transition-all duration-500"
              style={{ width: `${fixedShare}%` }}
            />
            <div
              className="bg-neutral-300 h-full transition-all duration-500"
              style={{ width: `${totalCommitments > 0 ? 100 - fixedShare : 0}%` }}
            />
          </div>

          <div className="grid grid-cols-2 divide-x divide-neutral-200 border-y border-neutral-100 mt-4 py-3">
            <div className="pr-4">
              <span className="text-xs font-medium text-neutral-400 block uppercase tracking-wider">
                {t('obligations.fixedCommitments', 'Fixed Commitments')}
              </span>
              <div className="font-display text-2xl sm:text-3xl font-bold text-neutral-900 mt-1">
                ₹{fixedObligationsTotal.toLocaleString('en-IN')}
              </div>
              <div className="text-[11px] text-neutral-400 mt-0.5">
                {t('obligations.fixedCommitmentsSub', 'Rent, Salaries, EMIs')}
              </div>
            </div>

            <div className="pl-4">
              <span className="text-xs font-medium text-neutral-400 block uppercase tracking-wider">
                {t('obligations.flexibleBills', 'Flexible Bills')}
              </span>
              <div className="font-display text-2xl sm:text-3xl font-bold text-neutral-800 mt-1">
                ₹{variableObligationsTotal.toLocaleString('en-IN')}
              </div>
              <div className="text-[11px] text-neutral-400 mt-0.5">
                {t('obligations.flexibleBillsSub', 'Trade Suppliers')}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Working Capital Velocity */}
      <div className="pt-6">
        <div className="flex items-baseline justify-between pb-3 border-b border-neutral-100">
          <div>
            <h3 className="font-display font-bold text-xl text-neutral-900">
              {t('obligations.cashCycle', 'Cash Cycle')}
            </h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              {t('obligations.cashCycleSubtitle', 'Working capital turnaround velocity')}
            </p>
          </div>
          <div className="flex items-baseline space-x-1">
            <span className="font-display font-bold text-3xl text-neutral-900">
              {workingCapitalCycle.ccc}
            </span>
            <span className="text-xs text-neutral-500">{t('common.days', 'days')}</span>
          </div>
        </div>

        {/* Formula breakdown */}
        <div className="grid grid-cols-3 divide-x divide-neutral-200 border-b border-neutral-100 py-3 text-center">
          <div className="px-2">
            <span className="text-[11px] text-neutral-400 uppercase tracking-wider block">
              {t('obligations.customerCredit', 'Customer Credit')}
            </span>
            <span className="font-bold text-lg font-display text-neutral-900">{workingCapitalCycle.dso}d</span>
            <span className="text-[10px] text-neutral-400 block">DSO</span>
          </div>
          <div className="px-2">
            <span className="text-[11px] text-neutral-400 uppercase tracking-wider block">
              {t('obligations.inventory', 'Inventory')}
            </span>
            <span className="font-bold text-lg font-display text-neutral-900">{workingCapitalCycle.dio}d</span>
            <span className="text-[10px] text-neutral-400 block">DIO</span>
          </div>
          <div className="px-2">
            <span className="text-[11px] text-neutral-400 uppercase tracking-wider block">
              {t('obligations.supplierCredit', 'Supplier Credit')}
            </span>
            <span className="font-bold text-lg font-display text-neutral-900">-{workingCapitalCycle.dpo}d</span>
            <span className="text-[10px] text-neutral-400 block">DPO</span>
          </div>
        </div>
      </div>

      {/* 3. Customer Payment Reliability */}
      <div className="pt-6">
        <div className="flex items-baseline justify-between pb-3 border-b border-neutral-100">
          <div>
            <h3 className="font-display font-bold text-xl text-neutral-900">
              {t('obligations.debtorRealities', 'Debtor Realities')}
            </h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              {t('obligations.debtorSubtitle', 'Expected settlement dates based on customer invoices')}
            </p>
          </div>
        </div>

        {debtorsReliability.length === 0 ? (
          <div className="py-6 text-center text-xs text-neutral-400">
            {t('obligations.noDebtors', 'No customer invoice receivables currently tracked.')}
          </div>
        ) : (
          <div className="divide-y divide-neutral-100">
            {debtorsReliability.map((debtor, idx) => (
              <div key={idx} className="py-3 flex items-center justify-between text-xs">
                <div className="space-y-0.5">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-sm text-neutral-900">{debtor.name}</span>
                    <span className="text-[10px] text-neutral-400 uppercase tracking-wider">
                      {debtor.concentrationPercentage}% {t('obligations.share', 'share')}
                    </span>
                  </div>
                  <div className="text-[11px] text-neutral-500 flex items-center space-x-1.5">
                    <Clock size={11} className="text-neutral-400" />
                    <span>
                      {t('obligations.delay', 'Delay:')} +{debtor.averageDelayDays}d • {t('obligations.est', 'Est:')} {debtor.expectedRealisticDate}
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <div className="font-bold text-base font-display text-neutral-900">
                    ₹{debtor.amountDue.toLocaleString('en-IN')}
                  </div>
                  <div className={`text-[11px] font-semibold ${
                    debtor.reliabilityScore >= 80 ? 'text-emerald-700' : debtor.reliabilityScore >= 60 ? 'text-amber-700' : 'text-rose-700'
                  }`}>
                    {debtor.reliabilityScore}% {t('obligations.score', 'Score')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}

