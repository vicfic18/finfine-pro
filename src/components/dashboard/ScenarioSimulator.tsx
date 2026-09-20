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
      
      {/* Header Cell - Single Clean Heading */}
      <div className="flex items-baseline justify-between p-5 sm:p-6 bg-white">
        <div>
          <div className="flex items-center space-x-2 mb-1.5 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            <span className="inline-flex items-center px-1.5 py-0.5 font-bold bg-neutral-900 text-white">
              SIMULATOR
            </span>
            <span>/</span>
            <span>Sensitivity Matrix</span>
          </div>
          <h3 className="font-display font-bold text-2xl sm:text-3xl text-neutral-950 tracking-tight">
            Stress Simulator
          </h3>
          <p className="text-xs text-neutral-500 mt-1">
            Simulate working capital shocks from unbudgeted disbursements and receivable delays.
          </p>
        </div>

        {(unplannedExpense > 0 || delayDays > 0) && (
          <button
            onClick={onReset}
            className="text-xs font-mono font-bold text-neutral-950 hover:underline uppercase tracking-wider cursor-pointer"
          >
            Reset
          </button>
        )}
      </div>

      {/* Sliders Area (2-column touching grid) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-neutral-200">
        
        {/* Slider 1: Unplanned Expense */}
        <div className="p-5 sm:p-6 space-y-3 bg-white">
          <div className="flex justify-between items-baseline">
            <span className="font-mono text-[10.5px] font-bold text-neutral-500 uppercase tracking-widest">
              Unbudgeted Outflow:
            </span>
            <span className="font-display font-bold text-2xl text-neutral-950">
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
            className="w-full accent-neutral-950 cursor-pointer h-1.5 bg-neutral-200"
          />
          <div className="flex justify-between font-mono text-[10px] text-neutral-400">
            <span>₹0</span>
            <span>₹50,000</span>
            <span>₹1,00,000</span>
          </div>
        </div>

        {/* Slider 2: Customer Payment Delay */}
        <div className="p-5 sm:p-6 space-y-3 bg-white">
          <div className="flex justify-between items-baseline">
            <span className="font-mono text-[10.5px] font-bold text-neutral-500 uppercase tracking-widest">
              Debtor Settlement Delay:
            </span>
            <span className="font-display font-bold text-2xl text-neutral-950">
              +{delayDays} Days
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="30"
            step="1"
            value={delayDays}
            onChange={(e) => onDelayChange(Number(e.target.value))}
            className="w-full accent-neutral-950 cursor-pointer h-1.5 bg-neutral-200"
          />
          <div className="flex justify-between font-mono text-[10px] text-neutral-400">
            <span>0 days</span>
            <span>15 days</span>
            <span>30 days</span>
          </div>
        </div>

      </div>

      {/* Impact Analysis Cell */}
      <div className="p-5 sm:p-6 space-y-3 bg-neutral-50/40">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
          <div>
            <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">
              Projected Runway Impact
            </span>
            <div className="flex items-baseline space-x-3">
              <span className="font-display font-bold text-2xl text-neutral-400 line-through">
                {initialRunway}d
              </span>
              <span className="text-neutral-400 font-bold">──►</span>
              <span className={`font-display font-bold text-4xl sm:text-5xl ${newRunway <= 4 ? 'text-orange-600' : 'text-neutral-950'}`}>
                {newRunway} <span className="text-base font-sans font-normal text-neutral-500">days runway</span>
              </span>
            </div>
          </div>

          {hasConflict && (
            <div className="text-xs font-mono text-orange-600 font-semibold uppercase tracking-wider">
              Warning: Liquidity buffer breached under simulated shock.
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
