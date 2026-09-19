'use client';

import React from 'react';
import type { FinancialMetricData } from '@/lib/financial-store';

interface TaxChecksWidgetProps {
  data: FinancialMetricData;
}

export default function TaxChecksWidget({ data }: TaxChecksWidgetProps) {
  const { statutoryCompliance, statutoryLockbox } = data;

  return (
    <div className="w-full bg-white divide-y divide-neutral-200">
      
      {/* Header Cell */}
      <div className="p-4 sm:p-6 bg-white flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400 block mb-1">
            Statutory
          </span>
          <h2 className="font-display font-bold text-2xl sm:text-3xl text-neutral-900 tracking-tight">
            Tax Checks
          </h2>
        </div>

        <div className="flex items-center space-x-2 text-xs">
          <span className="text-neutral-500">Tax Lockbox Reserved:</span>
          <span className="font-display font-bold text-base text-neutral-900">
            ₹{statutoryLockbox.toLocaleString('en-IN')}
          </span>
        </div>
      </div>

      {/* Statutory Items Grid or Empty State */}
      {statutoryCompliance.length === 0 ? (
        <div className="p-6 text-center text-xs text-neutral-500 bg-white">
          No pending statutory tax obligations recorded. Upload tax challans or GST invoices in Documents to track them here.
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
                    <span className="text-[11px] text-neutral-400 uppercase tracking-wider block">Due Amount</span>
                    <div className="font-display font-bold text-2xl sm:text-3xl text-neutral-900 mt-0.5">
                      ₹{tax.amountDue.toLocaleString('en-IN')}
                    </div>
                  </div>
                </div>

                <div className="space-y-1 text-xs pt-3 border-t border-neutral-100">
                  <div className="flex justify-between items-center">
                    <span className="text-neutral-500 text-[11px]">Countdown:</span>
                    <span className={`text-xs font-bold ${isUrgent ? 'text-orange-600' : 'text-neutral-900'}`}>
                      {tax.daysLeft === 0 ? 'DUE TODAY' : `${tax.daysLeft} days left`}
                    </span>
                  </div>
                  <div className="text-[11px] text-neutral-400 truncate" title={tax.penaltyIfMissedDaily}>
                    Penalty: {tax.penaltyIfMissedDaily}
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
