'use client';

import React from 'react';
import type { FinancialMetricData } from '@/lib/financial-store';

interface MsmeOperationsWidgetProps {
  data: FinancialMetricData;
}

export default function MsmeOperationsWidget({ data }: MsmeOperationsWidgetProps) {
  const paymentRailSavings = data?.paymentRailSavings || {
    monthlyVolume: 0,
    currentEstimatedFees: 0,
    optimizedFees: 0,
    monthlySavings: 0,
    recommendations: [],
  };
  const discountArbitrage = Array.isArray(data?.discountArbitrage) ? data.discountArbitrage : [];
  const statutoryCompliance = Array.isArray(data?.statutoryCompliance) ? data.statutoryCompliance : [];

  return (
    <div className="w-full bg-white divide-y divide-neutral-200">
      
      {/* Header Cell */}
      <div className="p-4 sm:p-6 bg-white">
        <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400 block mb-1">
          Operational Intelligence
        </span>
        <h2 className="font-display font-bold text-2xl sm:text-3xl text-neutral-900 tracking-tight">
          MSME Trade & Statutory Rails
        </h2>
      </div>

      {/* 3-Column Touching Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-neutral-200 w-full bg-white">
        
        {/* 1. Payment Rail Cost & Fee Leakage Tracker */}
        <div className="p-4 sm:p-6 flex flex-col justify-between bg-white">
          <div>
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400 block mb-1">
                Payment Rail Optimization
              </span>
              <h3 className="font-display font-bold text-xl text-neutral-900">
                Payment Fee Tracker
              </h3>
            </div>

            <div className="mt-4 pb-4 border-b border-neutral-200">
              <span className="text-xs text-neutral-500 uppercase tracking-wider font-medium block">Monthly Fee Savings</span>
              <div className="font-display text-4xl sm:text-5xl font-bold text-neutral-900 mt-1">
                ₹{paymentRailSavings.monthlySavings.toLocaleString('en-IN')}
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider block">
                Smart Routing
              </span>
              <div className="divide-y divide-neutral-100">
                {paymentRailSavings.recommendations.map((rec, i) => (
                  <div key={i} className="py-2.5 text-xs">
                    <div className="flex justify-between font-bold text-neutral-900">
                      <span>{rec.vendor}</span>
                      <span className="font-display text-emerald-700 font-semibold">+Save ₹{rec.savings}</span>
                    </div>
                    <div className="flex items-center space-x-2 mt-1 text-[11px] text-neutral-500">
                      <span className="text-neutral-800 font-medium">Use: {rec.bestRail}</span>
                      <span>•</span>
                      <span>Avoid: {rec.avoidRail}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6 text-[11px] text-neutral-400">
            Bills &gt; ₹20k routed via zero-fee NEFT/RTGS over card gateways.
          </div>
        </div>

        {/* 2. Working Capital Financing & Discount Arbitrage */}
        <div className="p-4 sm:p-6 flex flex-col justify-between bg-white">
          <div>
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400 block mb-1">
                Supplier Negotiations
              </span>
              <h3 className="font-display font-bold text-xl text-neutral-900">
                Discount Arbitrage & TReDS
              </h3>
            </div>

            <div className="mt-4 space-y-4 divide-y divide-neutral-100">
              {discountArbitrage.map((arb, i) => (
                <div key={i} className={i > 0 ? 'pt-3' : ''}>
                  <div className="flex items-baseline justify-between">
                    <span className="font-bold text-sm text-neutral-900">{arb.supplierName}</span>
                    <span className="text-xs font-bold text-neutral-900 font-display">
                      {arb.annualizedReturn}% Return
                    </span>
                  </div>

                  <p className="text-xs text-neutral-600 mt-1 leading-relaxed">
                    {arb.recommendation}
                  </p>

                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="text-neutral-500 font-display">Bill: ₹{arb.billAmount.toLocaleString('en-IN')}</span>
                    <button className="px-3 py-1 bg-neutral-900 text-white text-[11px] font-semibold hover:bg-neutral-800 transition-colors">
                      Take Discount
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 text-[11px] text-neutral-400">
            Early payment (2% 10d) outperforms standard bank deposits.
          </div>
        </div>

        {/* 3. Statutory Compliance Radar */}
        <div className="p-4 sm:p-6 flex flex-col justify-between bg-white">
          <div>
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400 block mb-1">
                Statutory Countdown
              </span>
              <h3 className="font-display font-bold text-xl text-neutral-900">
                Tax Compliance Radar
              </h3>
            </div>

            <div className="mt-4 divide-y divide-neutral-100">
              {statutoryCompliance.map((tax, i) => {
                const isUrgent = tax.status === 'Urgent' || tax.daysLeft <= 3;
                return (
                  <div key={i} className="py-3 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-neutral-900 text-sm">{tax.taxName}</span>
                        <span className="text-[10px] text-neutral-500 font-mono">({tax.form})</span>
                      </div>
                      <span className={`text-xs font-bold ${isUrgent ? 'text-orange-600' : 'text-neutral-900'}`}>
                        {tax.daysLeft === 0 ? 'DUE TODAY' : `${tax.daysLeft} days left`}
                      </span>
                    </div>

                    <div className="flex items-baseline justify-between mt-1.5 text-xs">
                      <span className="font-display font-bold text-base text-neutral-900">
                        ₹{tax.amountDue.toLocaleString('en-IN')}
                      </span>
                      <span className="text-orange-600 text-[11px] font-medium">{tax.penaltyIfMissedDaily}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between text-xs">
            <span className="text-neutral-600 font-medium">
              Tax Lockbox Protected:
            </span>
            <span className="font-bold text-neutral-900 font-display text-sm">
              ₹{data.statutoryLockbox.toLocaleString('en-IN')}
            </span>
          </div>
        </div>

      </div>

    </div>
  );
}
