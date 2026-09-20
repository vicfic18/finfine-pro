'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { FinancialMetricData } from '@/lib/financial-store';

import Link from 'next/link';
import { ArrowUpRight, ShieldCheck } from 'lucide-react';

interface TaxChecksWidgetProps {
  data: FinancialMetricData;
}

export default function TaxChecksWidget({ data }: TaxChecksWidgetProps) {
  const { t } = useTranslation();
  const { statutoryCompliance, statutoryLockbox } = data;

  return (
    <div className="w-full bg-white divide-y divide-neutral-200">
      
      {/* Header Cell */}
      <div className="p-4 sm:p-6 bg-white flex flex-col sm:flex-row sm:items-baseline justify-between gap-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400 block mb-1">
            {t('taxChecks.statutory', 'Statutory')}
          </span>
          <h2 className="font-display font-bold text-2xl sm:text-3xl text-neutral-900 tracking-tight">
            {t('taxChecks.title', 'Tax Checks')}
          </h2>
        </div>

        <div className="flex items-center space-x-4 text-xs">
          <div className="flex items-center space-x-2">
            <span className="text-neutral-500">{t('taxChecks.taxLockboxReserved', 'Tax Lockbox Reserved:')}</span>
            <span className="font-display font-bold text-base text-neutral-900">
              ₹{statutoryLockbox.toLocaleString('en-IN')}
            </span>
          </div>

          <Link
            href="/dashboard/tax-compliance"
            className="inline-flex items-center space-x-1 px-3 py-1.5 bg-neutral-100 hover:bg-neutral-900 hover:text-white text-neutral-800 font-bold text-[11px] uppercase tracking-wider transition-all"
          >
            <span>Tax Profile & Rules</span>
            <ArrowUpRight size={13} />
          </Link>
        </div>
      </div>

      {/* Statutory Items Grid or Empty State */}
      {statutoryCompliance.length === 0 ? (
        <div className="p-8 text-center text-xs text-neutral-500 bg-white space-y-3">
          <p>{t('taxChecks.noObligations', 'No active statutory tax obligations configured for this cycle.')}</p>
          <Link
            href="/dashboard/tax-compliance"
            className="inline-flex items-center space-x-1.5 px-4 py-2 bg-neutral-900 text-white font-bold text-xs uppercase tracking-wider hover:bg-neutral-800 transition-colors"
          >
            <ShieldCheck size={14} />
            <span>Configure Tax Profile & Obligations</span>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-neutral-200 w-full bg-white">
          {statutoryCompliance.map((tax, i) => {
            const isUrgent = tax.status === 'Urgent' || tax.daysLeft <= 3;
            return (
              <div key={i} className="p-4 sm:p-6 flex flex-col justify-between bg-white space-y-4">
                <div>
                  <div className="flex items-baseline justify-between">
                    <span className="font-bold text-neutral-900 text-sm">{tax.taxName}</span>
                    <span className="text-[10px] text-neutral-500 font-mono">({tax.form})</span>
                  </div>

                  <div className="mt-3">
                    <span className="text-[11px] text-neutral-400 uppercase tracking-wider block">
                      {t('taxChecks.dueAmount', 'Due Amount')}
                    </span>
                    <div className="font-display font-bold text-2xl sm:text-3xl text-neutral-900 mt-0.5">
                      ₹{tax.amountDue.toLocaleString('en-IN')}
                    </div>
                  </div>
                </div>

                <div className="space-y-1 text-xs pt-3 border-t border-neutral-100">
                  <div className="flex justify-between items-center">
                    <span className="text-neutral-500 text-[11px]">{t('taxChecks.countdown', 'Countdown:')}</span>
                    <span className={`text-xs font-bold ${isUrgent ? 'text-orange-600' : 'text-neutral-900'}`}>
                      {tax.daysLeft === 0 ? t('taxChecks.dueToday', 'DUE TODAY') : t('taxChecks.daysLeft', { days: tax.daysLeft, defaultValue: `${tax.daysLeft} days left` })}
                    </span>
                  </div>
                  <div className="text-[11px] text-neutral-400 truncate" title={tax.penaltyIfMissedDaily}>
                    {t('taxChecks.penalty', 'Penalty:')} {tax.penaltyIfMissedDaily}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}

