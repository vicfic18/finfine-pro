'use client';

import React, { useState } from 'react';
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
  const trajectory = Array.isArray(data?.trajectory60Days) ? data.trajectory60Days : [];
  const [selectedDay, setSelectedDay] = useState<any | null>(
    trajectory[3] || trajectory[0] || null
  );

  // Recalculate chart points if simulation sliders are adjusted
  const chartData = trajectory.map((pt) => {
    let adjBase = pt.baseBalance;
    let adjOpt = pt.optimisticBalance;
    let adjCons = pt.conservativeBalance;

    if (simulatedExpense > 0) {
      adjBase -= simulatedExpense;
      adjOpt -= simulatedExpense;
      adjCons -= simulatedExpense;
    }
    if (simulatedDelay > 0 && pt.day >= 7) {
      adjBase -= simulatedDelay * 4000;
      adjOpt -= simulatedDelay * 2000;
      adjCons -= simulatedDelay * 6000;
    }

    return {
      ...pt,
      baseBalance: adjBase,
      optimisticBalance: adjOpt,
      conservativeBalance: adjCons,
    };
  });

  return (
    <div className="w-full bg-white divide-y divide-neutral-200">
      
      {/* Header Cell */}
      <div className="p-4 sm:p-6 bg-white">
        <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider block mb-1">
          Projection • 60-Day Horizon
        </span>
        <h2 className="font-display font-bold text-2xl sm:text-3xl text-neutral-900 tracking-tight">
          Cash Flow Trajectory
        </h2>
      </div>

      {/* Trajectory Line Chart Cell */}
      <div className="p-4 sm:p-6 bg-white">
        {/* Chart Header Info */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4 text-xs">
          <div className="flex items-center space-x-5">
            <div className="flex items-center space-x-2">
              <span className="w-3 h-0.5 bg-neutral-900 inline-block" />
              <span className="text-neutral-700 font-medium">Expected Balance</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="w-3 h-3 bg-neutral-200 inline-block" />
              <span className="text-neutral-500">Confidence Band</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="w-3 h-0.5 bg-orange-500 border-t border-dashed border-orange-500 inline-block" />
              <span className="text-orange-600 font-medium">Zero-Cash Danger Line</span>
            </div>
          </div>

          <div className="text-[11px] text-neutral-400">
            Click any point to inspect that day&apos;s cash flow
          </div>
        </div>

        {/* Recharts Clean Chart Container */}
        <div className="h-[280px] sm:h-[340px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              onClick={(e: any) => {
                if (e && e.activePayload && e.activePayload.length > 0) {
                  setSelectedDay(e.activePayload[0].payload);
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
                      <div className="bg-neutral-900 text-white p-3 border border-neutral-700 text-xs font-sans max-w-xs">
                        <div className="flex items-center justify-between font-bold pb-1.5 border-b border-neutral-800">
                          <span>{d.date} (Day {d.day})</span>
                          <span className={d.baseBalance < 0 ? 'text-orange-400' : 'text-emerald-400 font-display'}>
                            ₹{d.baseBalance.toLocaleString('en-IN')}
                          </span>
                        </div>
                        <div className="mt-2 space-y-1 text-[11px]">
                          <div className="flex justify-between text-neutral-300">
                            <span>Inflows:</span>
                            <span className="text-emerald-400 font-medium">+₹{d.inflow.toLocaleString('en-IN')}</span>
                          </div>
                          <div className="flex justify-between text-neutral-300">
                            <span>Outflows:</span>
                            <span className="text-orange-400 font-medium">-₹{d.outflow.toLocaleString('en-IN')}</span>
                          </div>
                          {d.events && d.events.length > 0 && (
                            <div className="pt-1.5 border-t border-neutral-800 text-[10px] text-amber-300">
                              📌 Key Events: {d.events.join(', ')}
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
                  value: 'Zero Balance Line',
                  fill: '#ea580c',
                  fontSize: 10,
                  position: 'insideTopLeft',
                }}
              />

              <Area
                type="linear"
                dataKey="optimisticBalance"
                stroke="transparent"
                fill="#e5e5e5"
                fillOpacity={0.6}
              />
              <Area
                type="linear"
                dataKey="conservativeBalance"
                stroke="transparent"
                fill="#ffffff"
                fillOpacity={1.0}
              />

              <Line
                type="linear"
                dataKey="baseBalance"
                stroke="#171717"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: '#171717', stroke: '#fff', strokeWidth: 2 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Selected Day Inspection Row (Touching border cell) */}
      {selectedDay && (
        <div className="p-4 sm:p-6 bg-neutral-50/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-3">
              <span className="font-bold text-sm text-neutral-900">
                Day {selectedDay.day}: {selectedDay.date}
              </span>
              <span className="text-xs font-semibold text-neutral-700">
                Balance: ₹{selectedDay.baseBalance.toLocaleString('en-IN')}
              </span>
            </div>
            <p className="text-xs text-neutral-600 mt-1">
              {selectedDay.events && selectedDay.events.length > 0
                ? `Scheduled: ${selectedDay.events.join(', ')}`
                : `Operations (In: ₹${selectedDay.inflow.toLocaleString('en-IN')}, Out: ₹${selectedDay.outflow.toLocaleString('en-IN')})`}
            </p>
          </div>

          <div className="text-right sm:self-center shrink-0">
            <span className="text-[11px] text-neutral-400 block uppercase tracking-wider font-medium">Daily Net Delta</span>
            <span className={`text-xl font-bold font-display ${selectedDay.netDelta >= 0 ? 'text-emerald-600' : 'text-orange-600'}`}>
              {selectedDay.netDelta >= 0 ? '+' : ''}₹{selectedDay.netDelta.toLocaleString('en-IN')}
            </span>
          </div>
        </div>
      )}

    </div>
  );
}
