'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { FinancialMetricData } from '@/lib/financial-store';
import Link from 'next/link';
import { ArrowUpRight, ShieldCheck, AlertCircle } from 'lucide-react';

interface TaxChecksWidgetProps {
  data: FinancialMetricData;
}

export default function TaxChecksWidget({ data }: TaxChecksWidgetProps) {
  const { t } = useTranslation();
  const { statutoryCompliance, statutoryLockbox } = data;

  return (
    <div className="w-full bg-white divide-y divide-neutral-200">
      
      {/* Header Cell - Single Clean Heading */}
      <div className="p-5 sm:p-6 bg-white flex flex-col sm:flex-row sm:items-baseline justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 mb-1.5 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            <span className="inline-flex items-center px-1.5 py-0.5 font-bold bg-neutral-900 text-white">
              STATUTORY
            </span>
            <span>/</span>
            <span>Compliance Rails</span>
          </div>
          <h2 className="font-display font-bold text-2xl sm:text-3xl text-neutral-950 tracking-tight">
            Tax Lockbox
          </h2>
          <p className="text-xs text-neutral-500 mt-1">
            Ring-fenced statutory capital and scheduled compliance remittances.
          </p>
        </div>

        <div className="flex items-center space-x-4 text-xs font-mono">
          <div className="flex items-center space-x-2">
            <span className="text-neutral-500">Reserved:</span>
            <span className="font-display font-bold text-base text-neutral-950">
              ₹{statutoryLockbox.toLocaleString('en-IN')}
            </span>
          </div>

          <Link
            href="/dashboard/tax-compliance"
            className="inline-flex items-center space-x-1 px-3 py-1.5 bg-neutral-100 hover:bg-neutral-950 hover:text-white text-neutral-900 font-bold text-[11px] uppercase tracking-wider transition-all border border-neutral-300 hover:border-neutral-950"
          >
            <span>Tax Profile</span>
            <ArrowUpRight size={13} />
          </Link>
        </div>
      </div>

      {/* Statutory Items Grid or Empty State */}
      {statutoryCompliance.length === 0 ? (
        <div className="p-8 text-center text-xs text-neutral-500 bg-white space-y-3">
          <p>No active statutory tax obligations configured for this cycle.</p>
          <Link
            href="/dashboard/tax-compliance"
            className="inline-flex items-center space-x-1.5 px-4 py-2 bg-neutral-950 text-white font-bold text-xs uppercase tracking-wider hover:bg-neutral-800 transition-colors"
          >
            <ShieldCheck size={14} />
            <span>Configure Tax Profile</span>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-neutral-200 bg-white">
          {statutoryCompliance.map((item, idx) => {
            const isUrgent = item.status === 'Urgent';
            const isDelayed = item.status === 'Delayed';

            return (
              <div key={idx} className="p-5 sm:p-6 flex flex-col justify-between space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-neutral-950">
                      {item.taxName}
                    </span>
                    <span
                      className={`font-mono text-[9px] font-bold uppercase px-1.5 py-0.5 border ${
                        isUrgent
                          ? 'border-orange-600 bg-orange-50 text-orange-700'
                          : isDelayed
                          ? 'border-rose-600 bg-rose-50 text-rose-700'
                          : 'border-neutral-300 bg-neutral-100 text-neutral-700'
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>

                  <div className="text-2xl font-bold font-display text-neutral-950">
                    ₹{item.amountDue.toLocaleString('en-IN')}
                  </div>

                  <div className="text-[11px] text-neutral-500 font-mono space-y-0.5">
                    <div>Due: {item.dueDate} ({item.daysLeft} days)</div>
                    <div>Form: {item.form}</div>
                  </div>
                </div>

                <div className="text-[10.5px] text-neutral-400 font-mono pt-2 border-t border-neutral-100">
                  Late Fee: {item.penaltyIfMissedDaily}
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
