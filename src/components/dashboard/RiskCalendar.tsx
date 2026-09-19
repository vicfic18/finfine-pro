'use client';

import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { FinancialMetricData } from '@/lib/financial-store';

interface RiskCalendarProps {
  data: FinancialMetricData;
}

export default function RiskCalendar({ data }: RiskCalendarProps) {
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
  const pinchMap = new Map<string, any>();
  (data?.pinchPoints || []).forEach((p) => {
    pinchMap.set(p.date, p);
  });

  const trajectoryMap = new Map<string, any>();
  (data?.trajectory60Days || []).forEach((t) => {
    trajectoryMap.set(t.date, t);
  });

  // Calendar cells
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const calendarCells = [];

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
      
      {/* Header Cell */}
      <div className="p-4 sm:p-6 bg-white">
        <h2 className="font-display font-bold text-2xl sm:text-3xl text-neutral-900 tracking-tight">
          Risk Calendar
        </h2>
        <p className="text-xs text-neutral-500 mt-1">
          Calendar heatmap marked with cash crunch risk and mandatory statutory deadlines.
        </p>
      </div>

      {/* Month Header Banner */}
      <div className="p-3 bg-neutral-50 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-neutral-800">
        <span>{monthName}</span>
        <div className="flex items-center space-x-3 text-[11px] font-normal lowercase tracking-normal">
          <span className="flex items-center"><span className="w-2.5 h-2.5 bg-orange-600 inline-block mr-1" /> high risk</span>
          <span className="flex items-center"><span className="w-2.5 h-2.5 bg-orange-100 border border-orange-300 inline-block mr-1" /> medium risk</span>
          <span className="flex items-center"><span className="w-2.5 h-2.5 bg-white border border-neutral-300 inline-block mr-1" /> normal</span>
        </div>
      </div>

      {/* Days of Week (Touching grid row) */}
      <div className="grid grid-cols-7 text-center text-xs font-semibold text-neutral-500 uppercase tracking-wider bg-neutral-50/50 divide-x divide-neutral-200">
        {weekDays.map((w) => (
          <div key={w} className="py-2">
            {w}
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
              className={`border-r border-b border-neutral-200 h-16 sm:h-20 p-1.5 sm:p-2 flex flex-col justify-between transition-colors ${
                isHigh
                  ? 'bg-orange-600 text-white font-bold'
                  : isMedium
                  ? 'bg-orange-100 text-orange-950 font-semibold'
                  : 'bg-white text-neutral-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs sm:text-sm font-sans">{cell.day}</span>
              </div>

              {cell.pinch && (
                <div className={`text-[10px] leading-tight truncate mt-auto ${isHigh ? 'text-white font-medium' : 'text-orange-900'}`}>
                  {cell.pinch.title.split(' ')[0]} ₹{Math.round(cell.pinch.amount / 1000)}k
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Paginated Schedule Table (Touching right below calendar) */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs font-sans">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50 text-neutral-600 font-semibold uppercase tracking-wider">
              <th className="py-2.5 px-4 w-28">Date</th>
              <th className="py-2.5 px-4">Name</th>
              <th className="py-2.5 px-4 text-right w-36">Price</th>
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
                  <td className="py-3 px-4 font-medium text-neutral-900">
                    {item.name}
                  </td>
                  <td className="py-3 px-4 text-right font-display font-bold text-sm text-neutral-900">
                    {item.priceFormatted}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Minimalist Pagination Bar (Touching footer cell) */}
      {tableItems.length > 0 && (
        <div className="px-4 py-2.5 bg-neutral-50 flex items-center justify-between text-xs text-neutral-600 font-medium">
          <span>
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
            <span className="px-2 font-mono">
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
