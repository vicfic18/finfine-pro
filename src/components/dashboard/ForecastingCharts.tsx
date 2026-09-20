'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  CartesianGrid,
} from 'recharts';
import { Calendar } from 'lucide-react';
import type { FinancialMetricData } from '@/lib/financial-store';

interface ForecastingChartsProps {
  data: FinancialMetricData;
  simulatedExpense?: number;
  simulatedDelay?: number;
}

export default function ForecastingCharts({
  data,
  simulatedExpense = 0,
  simulatedDelay = 0,
}: ForecastingChartsProps) {
  const { t } = useTranslation();
  const trajectory = Array.isArray(data?.trajectory60Days) ? data.trajectory60Days : [];
  const asOfDate = data?.asOfDate || new Date().toISOString().slice(0, 10);

  // Find index of the anchor date or first future point for default selection
  const defaultSelectionIndex = Math.max(
    0,
    trajectory.findIndex((pt) => pt.date === asOfDate || pt.day === 0)
  );
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(defaultSelectionIndex);

  // Map trajectory points into chart data separating historical actuals from future predictions
  const chartData = trajectory.map((pt) => {
    const isPast = pt.isHistorical === true;
    const isAnchor = pt.isAnchor === true || pt.date === asOfDate || pt.day === 0;

    // Actual bank ledger balance (populated only for historical and anchor points)
    const actualBal = isPast || isAnchor
      ? (pt.actualBalance ?? pt.baseBalance ?? 0)
      : undefined;

    // SageMaker predicted balance (populated only for anchor and future points)
    let predExpected = isAnchor
      ? (pt.actualBalance ?? pt.baseBalance ?? 0)
      : (pt.predictedBalance ?? pt.p50Balance ?? pt.baseBalance ?? 0);

    let predUpper = isAnchor
      ? predExpected
      : (pt.p90Balance ?? pt.optimisticBalance ?? predExpected);

    let predLower = isAnchor
      ? predExpected
      : (pt.p10Balance ?? pt.conservativeBalance ?? predExpected);

    // Apply what-if simulation adjustments only to future dates
    if (!isPast && !isAnchor) {
      if (simulatedExpense > 0) {
        predExpected -= simulatedExpense;
        predUpper -= simulatedExpense;
        predLower -= simulatedExpense;
      }
      if (simulatedDelay > 0 && pt.day >= 7) {
        predExpected -= simulatedDelay * 4000;
        predUpper -= simulatedDelay * 2000;
        predLower -= simulatedDelay * 6000;
      }
    }

    return {
      ...pt,
      isPast,
      isAnchor,
      actualBalance: actualBal,
      predictedBalance: isPast ? undefined : Math.round(predExpected),
      displayUpper: isPast ? undefined : Math.round(predUpper),
      displayLower: isPast ? undefined : Math.round(predLower),
      hasFestival: (pt.festivals && pt.festivals.length > 0) || false,
      hasStatutory: !!pt.statutoryDrain,
    };
  });

  const selectedDay = chartData[selectedDayIndex] || chartData[defaultSelectionIndex] || null;

  return (
    <div className="w-full bg-white divide-y divide-neutral-200">
    

      {/* 2. Trajectory Line Chart Cell */}
      <div className="p-4 sm:p-6 bg-white">
        {/* Chart Header Info / Legend */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4 text-xs">
          <div className="flex items-center flex-wrap gap-x-5 gap-y-2">
            {/* Left Half Legend */}
            <div className="flex items-center space-x-2">
              <span className="w-3.5 h-0.5 bg-neutral-900 inline-block" />
              <span className="text-neutral-800 font-medium">
                Historical Bank Ledger (Actuals)
              </span>
            </div>

            {/* Anchor Marker Legend */}
            <div className="flex items-center space-x-2">
              <span className="w-3.5 h-0.5 bg-blue-600 border-t border-dashed border-blue-600 inline-block" />
              <span className="text-blue-700 font-medium">
                Today (As-Of Reference)
              </span>
            </div>

            {/* Right Half Legend */}
            <div className="flex items-center space-x-2">
              <span className="w-3.5 h-0.5 bg-emerald-500 border-t-2 border-dotted border-emerald-500 inline-block" />
              <span className="text-emerald-700 font-bold">
                AI Forecast (Expected)
              </span>
            </div>

            {/* Confidence Cone */}
            <div className="flex items-center space-x-2">
              <span className="w-3 h-3 bg-emerald-100/70 border border-emerald-300 inline-block" />
              <span className="text-neutral-500">
                Range (Worst Case to Best Case)
              </span>
            </div>

            {/* Zero Cash Danger Line */}
            <div className="flex items-center space-x-2">
              <span className="w-3 h-0.5 bg-orange-500 border-t border-dashed border-orange-500 inline-block" />
              <span className="text-orange-600 font-medium">
                {t('charts.zeroCashDangerLine', 'Zero-Cash Danger Line')}
              </span>
            </div>
          </div>

          <div className="text-[11px] text-neutral-400">
            {t('charts.clickPointHint', 'Click any point to inspect ledger transactions or AI forecast breakdown')}
          </div>
        </div>

        {/* Recharts Chart Container */}
        <div className="h-[320px] sm:h-[380px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              onClick={(e: any) => {
                if (e && e.activeTooltipIndex != null) {
                  setSelectedDayIndex(Number(e.activeTooltipIndex));
                } else if (e && e.activePayload && e.activePayload.length > 0) {
                  const pt = e.activePayload[0].payload;
                  const idx = chartData.findIndex((c) => c.date === pt.date);
                  if (idx >= 0) setSelectedDayIndex(idx);
                }
              }}
              margin={{ top: 15, right: 15, left: -15, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="2 2" stroke="#f0f0f0" vertical={false} />

              <XAxis
                dataKey="date"
                tickFormatter={(val) => {
                  if (!val) return '';
                  const parts = val.split('-');
                  return parts.length === 3 ? `${parts[2]}/${parts[1]}` : val;
                }}
                tick={{ fontSize: 11, fill: '#737373' }}
                tickLine={false}
                axisLine={{ stroke: '#e5e5e5' }}
              />

              <YAxis
                tickFormatter={(val) => `₹${Math.round(val / 1000)}k`}
                tick={{ fontSize: 11, fill: '#737373' }}
                tickLine={false}
                axisLine={false}
              />

              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const d = payload[0].payload;
                    const isPast = d.isPast;
                    const isAnchor = d.isAnchor;
                    return (
                      <div className="bg-neutral-900 text-white p-3.5 border border-neutral-700 text-xs font-sans max-w-sm shadow-2xl">
                        {/* Tooltip Header */}
                        <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
                          <div>
                            <div className="flex items-center space-x-1.5">
                              <span
                                className={`text-[9.5px] font-bold uppercase tracking-wider px-1.5 py-0.2 ${
                                  isPast
                                    ? 'bg-neutral-800 text-neutral-300'
                                    : isAnchor
                                    ? 'bg-blue-900/80 text-blue-200 border border-blue-700'
                                    : 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                                }`}
                              >
                                {isPast
                                  ? 'Historical Actual'
                                  : isAnchor
                                  ? 'Today (As-Of)'
                                  : 'AI Forecast'}
                              </span>
                              <span className="text-white font-mono">{d.date}</span>
                            </div>
                            <span className="text-neutral-400 text-[10px] block mt-0.5">
                              {isPast
                                ? `Day ${d.day} (History)`
                                : isAnchor
                                ? 'Day 0 (Anchor Date)'
                                : `Day +${d.day} (Prediction)`}
                            </span>
                          </div>

                          <span
                            className={`font-display text-base font-bold ${
                              (d.predictedBalance ?? d.actualBalance ?? 0) < 0
                                ? 'text-orange-400'
                                : isPast
                                ? 'text-white'
                                : 'text-emerald-400'
                            }`}
                          >
                            ₹{(d.predictedBalance ?? d.actualBalance ?? 0).toLocaleString('en-IN')}
                          </span>
                        </div>

                        {/* Future Quantile Envelope (Worst to Best Case) */}
                        {!isPast && !isAnchor && d.displayLower != null && d.displayUpper != null && (
                          <div className="py-2 border-b border-neutral-800 text-[10.5px] grid grid-cols-3 gap-1">
                            <div>
                              <span className="text-neutral-500 block">Worst Case:</span>
                              <span className="font-mono text-neutral-200 font-medium">
                                ₹{d.displayLower.toLocaleString('en-IN')}
                              </span>
                            </div>
                            <div>
                              <span className="text-neutral-500 block">Expected:</span>
                              <span className="font-mono text-emerald-400 font-medium">
                                ₹{d.predictedBalance.toLocaleString('en-IN')}
                              </span>
                            </div>
                            <div>
                              <span className="text-neutral-500 block">Best Case:</span>
                              <span className="font-mono text-neutral-200 font-medium">
                                ₹{d.displayUpper.toLocaleString('en-IN')}
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Inflow / Outflow Details */}
                        <div className="mt-2 space-y-1 text-[11px]">
                          <div className="flex justify-between text-neutral-300">
                            <span>{isPast ? 'Recorded Inflow:' : 'Expected Inflow:'}</span>
                            <span className="text-emerald-400 font-medium">
                              +₹{(d.inflow ?? 0).toLocaleString('en-IN')}
                              {d.inflowMultiplier && d.inflowMultiplier > 1.0
                                ? ` (${d.inflowMultiplier}x surge)`
                                : ''}
                            </span>
                          </div>
                          <div className="flex justify-between text-neutral-300">
                            <span>{isPast ? 'Recorded Outflow:' : 'Expected Outflow:'}</span>
                            <span className="text-orange-400 font-medium">
                              -₹{(d.outflow ?? 0).toLocaleString('en-IN')}
                            </span>
                          </div>

                          {/* Indian Festival Catalyst Marker */}
                          {d.festivals && d.festivals.length > 0 && (
                            <div className="pt-1.5 border-t border-neutral-800 text-[11px] text-amber-300 flex items-start space-x-1">
                              <span>✨</span>
                              <span>
                                <strong className="font-semibold">Festive Catalyst:</strong>{' '}
                                {d.festivals.join(', ')}
                              </span>
                            </div>
                          )}

                          {/* Statutory Tax Warning */}
                          {d.statutoryDrain && (
                            <div className="pt-1 text-[11px] text-rose-300 flex items-start space-x-1">
                              <span>⚠️</span>
                              <span>
                                <strong className="font-semibold">Statutory Drain:</strong>{' '}
                                {d.statutoryDrain}
                              </span>
                            </div>
                          )}

                          {/* Itemized Transactions or Commitments */}
                          {d.events && d.events.length > 0 && (
                            <div className="pt-1.5 border-t border-neutral-800 text-[10px] text-neutral-400">
                              📌 {isPast ? 'Ledger Entries:' : 'Scheduled:'} {d.events.slice(0, 3).join(', ')}
                              {d.events.length > 3 ? ` (+${d.events.length - 3} more)` : ''}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />

              {/* Zero Balance Danger Line */}
              <ReferenceLine
                y={0}
                stroke="#f97316"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{
                  value: t('charts.zeroBalanceLineLabel', 'Zero Balance Line'),
                  fill: '#ea580c',
                  fontSize: 10,
                  position: 'insideTopLeft',
                }}
              />

              {/* Anchor Vertical Reference Line: Today (As-Of Date) */}
              <ReferenceLine
                x={asOfDate}
                stroke="#2563eb"
                strokeDasharray="3 3"
                strokeWidth={1.75}
                label={{
                  value: 'Today (As-Of Date)',
                  fill: '#1d4ed8',
                  fontSize: 10.5,
                  fontWeight: 700,
                  position: 'top',
                }}
              />

              {/* Shaded Upper Confidence Band (Only for Future Points) */}
              <Area
                type="monotone"
                dataKey="displayUpper"
                stroke="transparent"
                fill="#10b981"
                fillOpacity={0.12}
                isAnimationActive={false}
              />

              {/* White Mask for Lower Confidence Band */}
              <Area
                type="monotone"
                dataKey="displayLower"
                stroke="transparent"
                fill="#ffffff"
                fillOpacity={1.0}
                isAnimationActive={false}
              />

              {/* Left Half: Historical Actuals Solid Line (Verified Bank Ledger) */}
              <Line
                type="monotone"
                dataKey="actualBalance"
                stroke="#0f172a"
                strokeWidth={2.5}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
                activeDot={{ r: 5, fill: '#0f172a', stroke: '#ffffff', strokeWidth: 2 }}
              />

              {/* Right Half: SageMaker Future Predictions Dotted Green Line */}
              <Line
                type="monotone"
                dataKey="predictedBalance"
                stroke="#10b981"
                strokeWidth={2.5}
                strokeDasharray="5 5"
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
                activeDot={{ r: 5, fill: '#10b981', stroke: '#ffffff', strokeWidth: 2 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 3. Selected Day Explainable AI (XAI) Drawer */}
      {selectedDay && (
        <div className="p-4 sm:p-6 bg-neutral-50/70 border-t border-neutral-200">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center flex-wrap gap-2.5 mb-1.5">
                <span className="font-bold text-sm text-neutral-900 font-mono">
                  {selectedDay.date}{' '}
                  {selectedDay.isPast
                    ? `(Historical Day ${selectedDay.day})`
                    : selectedDay.isAnchor
                    ? `(Today / As-Of Date)`
                    : `(Forecast Day +${selectedDay.day})`}
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 bg-neutral-200/80 text-neutral-800 font-display">
                  Balance: ₹
                  {(
                    selectedDay.predictedBalance ??
                    selectedDay.actualBalance ??
                    selectedDay.baseBalance ??
                    0
                  ).toLocaleString('en-IN')}
                </span>

                {selectedDay.isPast && (
                  <span className="text-xs font-semibold px-2 py-0.5 bg-neutral-100 text-neutral-700 border border-neutral-300">
                    Confirmed Bank Ledger
                  </span>
                )}

                {!selectedDay.isPast && !selectedDay.isAnchor && (
                  <span className="text-xs font-semibold px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300">
                    AI Forecast (Expected)
                  </span>
                )}

                {selectedDay.festivals && selectedDay.festivals.length > 0 && (
                  <span className="text-xs font-bold px-2 py-0.5 bg-amber-100 text-amber-900 border border-amber-300">
                    ✨ {selectedDay.festivals.join(', ')} ({selectedDay.inflowMultiplier || 1.8}x Uplift)
                  </span>
                )}
                {selectedDay.statutoryDrain && (
                  <span className="text-xs font-bold px-2 py-0.5 bg-rose-100 text-rose-900 border border-rose-300">
                    🛡️ {selectedDay.statutoryDrain}
                  </span>
                )}
              </div>

              <p className="text-xs text-neutral-600">
                {selectedDay.events && selectedDay.events.length > 0
                  ? `${selectedDay.isPast ? 'Ledger Activity:' : 'Scheduled Obligations:'} ${selectedDay.events.join(', ')}`
                  : `Operating cash velocity (In: +₹${(selectedDay.inflow ?? 0).toLocaleString('en-IN')}, Out: -₹${(selectedDay.outflow ?? 0).toLocaleString('en-IN')})`}
              </p>
            </div>

            <div className="text-right md:self-center shrink-0">
              <span className="text-[11px] text-neutral-400 block uppercase tracking-wider font-medium">
                {t('charts.dailyNetDelta', 'Daily Net Delta')}
              </span>
              <span
                className={`text-xl font-bold font-display ${
                  (selectedDay.netDelta ?? 0) >= 0 ? 'text-emerald-600' : 'text-orange-600'
                }`}
              >
                {(selectedDay.netDelta ?? 0) >= 0 ? '+' : ''}₹
                {(selectedDay.netDelta ?? 0).toLocaleString('en-IN')}
              </span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
