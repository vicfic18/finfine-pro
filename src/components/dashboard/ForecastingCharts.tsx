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
import { Sparkles, Activity, AlertCircle } from 'lucide-react';
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
  const [modelMode, setModelMode] = useState<'SAGEMAKER' | 'HEURISTIC'>('SAGEMAKER');
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(3);

  // Recalculate chart points if simulation sliders or model toggles are adjusted
  const chartData = trajectory.map((pt) => {
    // Mode selection: SageMaker P50 or Heuristic Base
    const isSM = modelMode === 'SAGEMAKER';
    let adjExpected = isSM && pt.p50Balance != null ? pt.p50Balance : (pt.baseBalance ?? 0);
    let adjUpper = isSM && pt.p90Balance != null ? pt.p90Balance : (pt.optimisticBalance ?? 0);
    let adjLower = isSM && pt.p10Balance != null ? pt.p10Balance : (pt.conservativeBalance ?? 0);

    if (simulatedExpense > 0) {
      adjExpected -= simulatedExpense;
      adjUpper -= simulatedExpense;
      adjLower -= simulatedExpense;
    }
    if (simulatedDelay > 0 && pt.day >= 7) {
      adjExpected -= simulatedDelay * 4000;
      adjUpper -= simulatedDelay * 2000;
      adjLower -= simulatedDelay * 6000;
    }

    return {
      ...pt,
      displayExpected: Math.round(adjExpected),
      displayUpper: Math.round(adjUpper),
      displayLower: Math.round(adjLower),
      hasFestival: (pt.festivals && pt.festivals.length > 0) || false,
      hasStatutory: !!pt.statutoryDrain,
    };
  });

  const selectedDay = chartData[selectedDayIndex] || chartData[0] || null;

  return (
    <div className="w-full bg-white divide-y divide-neutral-200">
      
      {/* Header Cell with Model Selector Toggle */}
      <div className="p-4 sm:p-6 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 mb-1">
            <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider block">
              {t('charts.projectionHorizon', 'Projection • 60-Day Horizon')}
            </span>
            <span className="text-neutral-300">•</span>
            <span className="inline-flex items-center text-[10.5px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1 animate-pulse" />
              AWS SageMaker Serverless
            </span>
          </div>
          <h2 className="font-display font-bold text-2xl sm:text-3xl text-neutral-900 tracking-tight">
            {t('charts.cashFlowTrajectory', 'Cash Flow Trajectory')}
          </h2>
        </div>

        {/* Model Selection Segmented Toggle */}
        <div className="flex items-center self-start sm:self-auto bg-neutral-100 p-1 border border-neutral-200">
          <button
            type="button"
            onClick={() => setModelMode('SAGEMAKER')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-bold transition-colors ${
              modelMode === 'SAGEMAKER'
                ? 'bg-white text-neutral-900 shadow-sm border border-neutral-200/80'
                : 'text-neutral-500 hover:text-neutral-900'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>SageMaker AI (Chronos)</span>
          </button>
          <button
            type="button"
            onClick={() => setModelMode('HEURISTIC')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
              modelMode === 'HEURISTIC'
                ? 'bg-white text-neutral-900 shadow-sm border border-neutral-200/80'
                : 'text-neutral-500 hover:text-neutral-900'
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-neutral-400" />
            <span>Rule-Based Baseline</span>
          </button>
        </div>
      </div>

      {/* Trajectory Line Chart Cell */}
      <div className="p-4 sm:p-6 bg-white">
        {/* Chart Header Info / Legend */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4 text-xs">
          <div className="flex items-center flex-wrap gap-x-5 gap-y-2">
            <div className="flex items-center space-x-2">
              <span className="w-3 h-0.5 bg-neutral-900 inline-block" />
              <span className="text-neutral-700 font-medium">
                {modelMode === 'SAGEMAKER' ? 'Expected Balance (P50)' : t('charts.expectedBalance', 'Expected Balance')}
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="w-3 h-3 bg-neutral-200 inline-block" />
              <span className="text-neutral-500">
                {modelMode === 'SAGEMAKER' ? 'Confidence Cone (P10 - P90)' : t('charts.confidenceBand', 'Confidence Band')}
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 border border-amber-600 inline-block" />
              <span className="text-amber-800 font-medium text-[11px]">
                Indian Festival Surge
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />
              <span className="text-rose-700 font-medium text-[11px]">
                Statutory Tax Drain (20th/7th)
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="w-3 h-0.5 bg-orange-500 border-t border-dashed border-orange-500 inline-block" />
              <span className="text-orange-600 font-medium">
                {t('charts.zeroCashDangerLine', 'Zero-Cash Danger Line')}
              </span>
            </div>
          </div>

          <div className="text-[11px] text-neutral-400">
            {t('charts.clickPointHint', "Click any point to inspect Explainable AI breakdown")}
          </div>
        </div>

        {/* Recharts Clean Chart Container */}
        <div className="h-[300px] sm:h-[360px] w-full">
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
              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="2 2" stroke="#e5e5e5" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(val) => {
                  const parts = val.split('-');
                  return `${parts[2]}/${parts[1]}`;
                }}
                tick={{ fontSize: 11, fill: '#737373' }}
                tickLine={false}
                axisLine={{ stroke: '#d4d4d4' }}
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
                    return (
                      <div className="bg-neutral-900 text-white p-3.5 border border-neutral-700 text-xs font-sans max-w-sm shadow-xl">
                        <div className="flex items-center justify-between font-bold pb-2 border-b border-neutral-800">
                          <div>
                            <span className="text-white font-mono">{d.date}</span>
                            <span className="text-neutral-400 text-[10.5px] ml-1.5 font-normal">
                              ({t('charts.day', 'Day')} {d.day})
                            </span>
                          </div>
                          <span className={d.displayExpected < 0 ? 'text-orange-400' : 'text-emerald-400 font-display text-sm'}>
                            ₹{d.displayExpected.toLocaleString('en-IN')}
                          </span>
                        </div>

                        {/* P10 - P90 Quantile Band for SageMaker */}
                        {modelMode === 'SAGEMAKER' && (
                          <div className="py-2 border-b border-neutral-800 text-[10.5px] text-neutral-300 grid grid-cols-3 gap-1">
                            <div>
                              <span className="text-neutral-500 block">P10 (Worst):</span>
                              <span className="font-mono text-neutral-200 font-medium">₹{d.displayLower.toLocaleString('en-IN')}</span>
                            </div>
                            <div>
                              <span className="text-neutral-500 block">P50 (Median):</span>
                              <span className="font-mono text-emerald-400 font-medium">₹{d.displayExpected.toLocaleString('en-IN')}</span>
                            </div>
                            <div>
                              <span className="text-neutral-500 block">P90 (Best):</span>
                              <span className="font-mono text-neutral-200 font-medium">₹{d.displayUpper.toLocaleString('en-IN')}</span>
                            </div>
                          </div>
                        )}

                        <div className="mt-2 space-y-1 text-[11px]">
                          <div className="flex justify-between text-neutral-300">
                            <span>{t('common.inflows', 'Expected Inflow')}:</span>
                            <span className="text-emerald-400 font-medium">
                              +₹{d.inflow.toLocaleString('en-IN')}
                              {d.inflowMultiplier && d.inflowMultiplier > 1.0 ? ` (${d.inflowMultiplier}x surge)` : ''}
                            </span>
                          </div>
                          <div className="flex justify-between text-neutral-300">
                            <span>{t('common.outflows', 'Expected Outflow')}:</span>
                            <span className="text-orange-400 font-medium">-₹{d.outflow.toLocaleString('en-IN')}</span>
                          </div>

                          {/* Indian Festival Catalyst Marker */}
                          {d.festivals && d.festivals.length > 0 && (
                            <div className="pt-1.5 border-t border-neutral-800 text-[11px] text-amber-300 flex items-start space-x-1">
                              <span>✨</span>
                              <span>
                                <strong className="font-semibold">Festive Catalyst:</strong> {d.festivals.join(', ')}
                              </span>
                            </div>
                          )}

                          {/* Statutory Tax Warning */}
                          {d.statutoryDrain && (
                            <div className="pt-1 text-[11px] text-rose-300 flex items-start space-x-1">
                              <span>⚠️</span>
                              <span>
                                <strong className="font-semibold">Statutory Drain:</strong> {d.statutoryDrain}
                              </span>
                            </div>
                          )}

                          {d.events && d.events.length > 0 && (
                            <div className="pt-1.5 border-t border-neutral-800 text-[10px] text-neutral-400">
                              📌 {t('charts.keyEvents', 'Scheduled:')} {d.events.join(', ')}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />

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

              {/* Shaded Upper Confidence Band */}
              <Area
                type="linear"
                dataKey="displayUpper"
                stroke="transparent"
                fill="#e5e5e5"
                fillOpacity={0.55}
              />
              {/* White Mask for Lower Confidence Band */}
              <Area
                type="linear"
                dataKey="displayLower"
                stroke="transparent"
                fill="#ffffff"
                fillOpacity={1.0}
              />

              {/* Expected Balance Solid Line */}
              <Line
                type="linear"
                dataKey="displayExpected"
                stroke="#171717"
                strokeWidth={2.2}
                dot={(props: any) => {
                  const { cx, cy, payload } = props;
                  if (payload.hasFestival) {
                    return (
                      <circle
                        key={props.key}
                        cx={cx}
                        cy={cy}
                        r={4}
                        fill="#fbbf24"
                        stroke="#b45309"
                        strokeWidth={1.5}
                      />
                    );
                  }
                  if (payload.hasStatutory) {
                    return (
                      <circle
                        key={props.key}
                        cx={cx}
                        cy={cy}
                        r={3.5}
                        fill="#f43f5e"
                        stroke="#9f1239"
                        strokeWidth={1.5}
                      />
                    );
                  }
                  return null;
                }}
                activeDot={{ r: 5, fill: '#171717', stroke: '#fff', strokeWidth: 2 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Selected Day Explainable AI (XAI) Drawer */}
      {selectedDay && (
        <div className="p-4 sm:p-6 bg-neutral-50/70 border-t border-neutral-200">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center flex-wrap gap-2.5 mb-1.5">
                <span className="font-bold text-sm text-neutral-900 font-mono">
                  {selectedDay.date} (Day {selectedDay.day})
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 bg-neutral-200/80 text-neutral-800">
                  Balance: ₹{(selectedDay.displayExpected ?? selectedDay.baseBalance ?? 0).toLocaleString('en-IN')}
                </span>
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
                  ? `Scheduled Commitments: ${selectedDay.events.join(', ')}`
                  : `Normal operational velocity (Expected In: ₹${(selectedDay.inflow ?? 0).toLocaleString('en-IN')}, Out: ₹${(selectedDay.outflow ?? 0).toLocaleString('en-IN')})`}
              </p>
            </div>

            <div className="text-right md:self-center shrink-0">
              <span className="text-[11px] text-neutral-400 block uppercase tracking-wider font-medium">
                {t('charts.dailyNetDelta', 'Daily Net Delta')}
              </span>
              <span className={`text-xl font-bold font-display ${(selectedDay.netDelta ?? 0) >= 0 ? 'text-emerald-600' : 'text-orange-600'}`}>
                {(selectedDay.netDelta ?? 0) >= 0 ? '+' : ''}₹{(selectedDay.netDelta ?? 0).toLocaleString('en-IN')}
              </span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
