'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { FinancialMetricData } from '@/lib/financial-store';

interface RiskCalendarProps {
  data: FinancialMetricData;
}

type PinchPoint = FinancialMetricData['pinchPoints'][number];
type TrajectoryPoint = FinancialMetricData['trajectory60Days'][number];
type CalendarCell = {
  empty: boolean;
  key: string;
  day?: number;
  fullDate?: string;
  pinch?: PinchPoint;
  traj?: TrajectoryPoint;
  risk?: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
};

export default function RiskCalendar({ data }: RiskCalendarProps) {
  const { t } = useTranslation();
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 5;

  // Parse year and month from asOfDate or default to Oct 2026
  const baseDate = data.asOfDate ? new Date(data.asOfDate) : new Date(2026, 9, 7);
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth(); // 9 for October (0-indexed)

  const monthName = baseDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  // Compute first day of month (0 = Sun, 1 = Mon, ..., 6 = Sat)
  const firstDayIndex = new Date(year, month, 1).getDay();
  const totalDaysInMonth = new Date(year, month + 1, 0).getDate();

  // Map pinch points and daily events by date string "YYYY-MM-DD"
  const pinchMap = new Map<string, PinchPoint>();
  (data?.pinchPoints || []).forEach((p) => {
    pinchMap.set(p.date, p);
  });

  const trajectoryMap = new Map<string, TrajectoryPoint>();
  (data?.trajectory60Days || []).forEach((t) => {
    trajectoryMap.set(t.date, t);
  });

  // Calendar cells
  const weekDays = [
    { key: 'sun', label: 'Sun' },
    { key: 'mon', label: 'Mon' },
    { key: 'tue', label: 'Tue' },
    { key: 'wed', label: 'Wed' },
    { key: 'thu', label: 'Thu' },
    { key: 'fri', label: 'Fri' },
    { key: 'sat', label: 'Sat' },
  ];
  const calendarCells: CalendarCell[] = [];

  // Empty leading days
  for (let i = 0; i < firstDayIndex; i++) {
    calendarCells.push({ empty: true, key: `empty-${i}` });
  }

  // Month days
  for (let day = 1; day <= totalDaysInMonth; day++) {
    const dayStr = String(day).padStart(2, '0');
    const monthStr = String(month + 1).padStart(2, '0');
    const fullDate = `${year}-${monthStr}-${dayStr}`;

    const pinch = pinchMap.get(fullDate);
    const traj = trajectoryMap.get(fullDate);

    let risk: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE' = 'NONE';
    if (pinch) {
      risk = pinch.riskLevel;
    } else if (traj && traj.baseBalance < 0) {
      risk = 'HIGH';
    } else if (traj && traj.outflow > 25000) {
      risk = 'MEDIUM';
    }

    calendarCells.push({
      empty: false,
      day,
      fullDate,
      pinch,
      traj,
      risk,
      key: `day-${day}`,
    });
  }

  // Extract all itemized schedule records for the table (dd-mm, name, price)
  const tableItems: Array<{ dateFormatted: string; name: string; priceFormatted: string }> = [];

  // 1. Add all pinch points
  data.pinchPoints.forEach((p) => {
    const parts = p.date.split('-');
    const ddMm = parts.length === 3 ? `${parts[2]}-${parts[1]}` : p.date;
    tableItems.push({
      dateFormatted: ddMm,
      name: p.title,
      priceFormatted: `₹${p.amount.toLocaleString('en-IN')}`,
    });
  });

  // 2. Also check matrix debts due if any not yet covered
  data.matrixDebts.forEach((m) => {
    if (!tableItems.some((t) => t.name.toLowerCase().includes(m.name.toLowerCase()))) {
      const calcDay = Math.max(1, Math.min(31, 7 + m.daysDue));
      const ddMm = `${String(calcDay).padStart(2, '0')}-10`;
      tableItems.push({
        dateFormatted: ddMm,
        name: m.name,
        priceFormatted: `₹${m.amount.toLocaleString('en-IN')}`,
      });
    }
  });

  // Sort by day in dateFormatted
  tableItems.sort((a, b) => {
    const dayA = parseInt(a.dateFormatted.split('-')[0], 10);
    const dayB = parseInt(b.dateFormatted.split('-')[0], 10);
    return dayA - dayB;
  });

  // Pagination calculations
  const totalPages = Math.ceil(tableItems.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedItems = tableItems.slice(startIndex, startIndex + pageSize);

  return (
    <div className="w-full bg-white divide-y divide-neutral-200">
      
      {/* Header Cell - Single Clean Heading */}
      <div className="p-5 sm:p-6 bg-white">
        <div className="flex items-center space-x-2 mb-1.5 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          <span className="inline-flex items-center px-1.5 py-0.5 font-bold bg-neutral-900 text-white">
            CALENDAR
          </span>
          <span>/</span>
          <span>Disbursement Schedule</span>
        </div>
        <h2 className="font-display font-bold text-2xl sm:text-3xl text-neutral-950 tracking-tight">
          Liquidity Calendar
        </h2>
        <p className="text-xs text-neutral-500 mt-1">
          Daily cash flow volatility and mandatory disbursement schedule.
        </p>
      </div>

      {/* Month Header Banner */}
      <div className="p-3.5 bg-neutral-50 flex items-center justify-between text-xs font-mono font-bold uppercase tracking-wider text-neutral-800">
        <span>{monthName}</span>
        <div className="flex items-center space-x-3 text-[11px] font-normal lowercase tracking-normal font-mono">
          <span className="flex items-center">
            <span className="w-2.5 h-2.5 bg-orange-600 inline-block mr-1" />
            tight liquidity
          </span>
          <span className="flex items-center">
            <span className="w-2.5 h-2.5 bg-orange-100 border border-orange-300 inline-block mr-1" />
            moderate outflow
          </span>
          <span className="flex items-center">
            <span className="w-2.5 h-2.5 bg-white border border-neutral-300 inline-block mr-1" />
            solvent
          </span>
        </div>
      </div>

      {/* Days of Week (Touching grid row) */}
      <div className="grid grid-cols-7 text-center text-xs font-mono font-bold text-neutral-500 uppercase tracking-widest bg-neutral-50/50 divide-x divide-neutral-200">
        {weekDays.map((w) => (
          <div key={w.key} className="py-2">
            {w.label}
          </div>
        ))}
      </div>

      {/* Calendar Days Matrix (Touching 7-col grid) */}
      <div className="grid grid-cols-7 border-t border-l border-neutral-200">
        {calendarCells.map((cell) => {
          if (cell.empty) {
            return (
              <div
                key={cell.key}
                className="border-r border-b border-neutral-200 h-16 sm:h-20 bg-neutral-50/30"
              />
            );
          }

          const isHigh = cell.risk === 'HIGH';
          const isMedium = cell.risk === 'MEDIUM';

          return (
            <div
              key={cell.key}
              className={`border-r border-b border-neutral-200 p-1.5 sm:p-2.5 h-16 sm:h-20 flex flex-col justify-between transition-colors ${
                isHigh
                  ? 'bg-orange-600 text-white'
                  : isMedium
                  ? 'bg-orange-50/70 hover:bg-orange-100/60'
                  : 'bg-white hover:bg-neutral-50'
              }`}
            >
              <div className="flex justify-between items-start">
                <span
                  className={`font-mono text-xs sm:text-sm font-bold ${
                    isHigh ? 'text-white' : 'text-neutral-900'
                  }`}
                >
                  {cell.day}
                </span>

                {cell.pinch && (
                  <span
                    className={`w-1.5 h-1.5 rounded-none ${
                      isHigh ? 'bg-white' : 'bg-orange-600'
                    }`}
                  />
                )}
              </div>

              {/* Event / Outflow summary snippet */}
              <div className="truncate">
                {cell.pinch ? (
                  <span
                    className={`text-[9px] sm:text-[10px] truncate block font-medium ${
                      isHigh ? 'text-orange-100' : 'text-orange-800'
                    }`}
                    title={cell.pinch.title}
                  >
                    {cell.pinch.title}
                  </span>
                ) : cell.traj && cell.traj.events && cell.traj.events.length > 0 ? (
                  <span className="text-[9px] sm:text-[10px] text-neutral-400 truncate block font-mono">
                    {cell.traj.events[0]}
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {/* Itemized Payments Table Header */}
      <div className="p-4 bg-white border-b border-neutral-200">
        <h4 className="font-mono text-xs font-bold uppercase tracking-widest text-neutral-500">
          Scheduled Commitments
        </h4>
      </div>

      {/* Itemized Table (Touching grid row) */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50/70 text-neutral-400 uppercase font-mono text-[10px] tracking-wider">
              <th className="py-2.5 px-4 w-28">Date</th>
              <th className="py-2.5 px-4">Payee / Obligation</th>
              <th className="py-2.5 px-4 text-right w-36">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {tableItems.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-6 px-4 text-center text-neutral-400 text-xs">
                  No scheduled payment obligations recorded for this month.
                </td>
              </tr>
            ) : (
              paginatedItems.map((item, idx) => (
                <tr key={idx} className="hover:bg-neutral-50/50 transition-colors">
                  <td className="py-3 px-4 font-mono text-neutral-600 font-medium">
                    {item.dateFormatted}
                  </td>
                  <td className="py-3 px-4 font-medium text-neutral-950">
                    {item.name}
                  </td>
                  <td className="py-3 px-4 text-right font-display font-bold text-sm text-neutral-950">
                    {item.priceFormatted}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Minimalist Pagination Bar */}
      {tableItems.length > 0 && (
        <div className="px-4 py-2.5 bg-neutral-50 flex items-center justify-between text-xs text-neutral-600 font-medium">
          <span className="font-mono text-[11px]">
            Showing {startIndex + 1}–{Math.min(startIndex + pageSize, tableItems.length)} of {tableItems.length}
          </span>

          <div className="flex items-center space-x-1">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1 border border-neutral-200 bg-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-neutral-100 transition-colors"
              title="Previous page"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="px-2 font-mono text-[11px]">
              {currentPage} / {Math.max(1, totalPages)}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages || totalPages <= 1}
              className="p-1 border border-neutral-200 bg-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-neutral-100 transition-colors"
              title="Next page"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
