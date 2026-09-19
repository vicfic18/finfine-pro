'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CalendarDays,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Repeat,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronUp,
  ArrowUpRight,
  ArrowDownLeft,
} from 'lucide-react';

interface ObligationCardData {
  id: string;
  title: string;
  counterpartyName?: string;
  amount: number;
  dueDate?: string;
  type: 'PAYABLE' | 'RECEIVABLE';
  category?: string;
  status?: string;
  isStatutory?: boolean;
  isRecurring?: boolean;
  priorityWeight?: number;
  penaltyRatePerDay?: number;
  allowPartialPayment?: boolean;
}

interface ObligationCardProps {
  obligation: ObligationCardData;
  onMarkPaid: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  isUpdating?: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  GST_PAYMENT: 'GST',
  TDS_PAYMENT: 'TDS',
  VENDOR_BILL: 'Supplier',
  UTILITY_BILL: 'Utility',
  SALARY: 'Salary',
  CUSTOMER_INVOICE: 'Invoice',
  OTHER: 'Other',
};

export default function ObligationCard({
  obligation,
  onMarkPaid,
  onEdit,
  onDelete,
  isUpdating,
}: ObligationCardProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const {
    id,
    title,
    counterpartyName,
    amount,
    dueDate,
    type,
    category,
    status,
    isStatutory,
    isRecurring,
    priorityWeight,
    penaltyRatePerDay,
    allowPartialPayment,
  } = obligation;

  // Calculate days until due
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDateObj = dueDate ? new Date(dueDate) : null;
  const daysDue = dueDateObj
    ? Math.round((dueDateObj.getTime() - today.getTime()) / (1000 * 3600 * 24))
    : null;

  // Color coding for urgency
  const getDueColor = () => {
    if (status === 'PAID') return 'text-emerald-700 bg-emerald-50';
    if (daysDue === null) return 'text-neutral-500 bg-neutral-50';
    if (daysDue <= 0) return 'text-rose-700 bg-rose-50';
    if (daysDue <= 3) return 'text-rose-600 bg-rose-50';
    if (daysDue <= 7) return 'text-amber-700 bg-amber-50';
    return 'text-neutral-600 bg-neutral-50';
  };

  const getDueText = () => {
    if (status === 'PAID') return t('obligationManager.paid', 'Paid');
    if (daysDue === null) return t('obligationManager.noDueDate', 'No due date');
    if (daysDue < 0) return t('obligationManager.overdue', { days: Math.abs(daysDue), defaultValue: `${Math.abs(daysDue)}d overdue` });
    if (daysDue === 0) return t('obligationManager.dueToday', 'Due today');
    if (daysDue === 1) return t('obligationManager.dueTomorrow', 'Due tomorrow');
    return t('obligationManager.dueInDays', { days: daysDue, defaultValue: `${daysDue}d left` });
  };

  const getStatusBorder = () => {
    if (status === 'PAID') return 'border-l-emerald-500';
    if (status === 'DISPUTED') return 'border-l-purple-500';
    if (daysDue !== null && daysDue <= 0) return 'border-l-rose-500';
    if (daysDue !== null && daysDue <= 3) return 'border-l-amber-500';
    return 'border-l-neutral-300';
  };

  const isPaid = status === 'PAID';

  return (
    <div
      className={`border border-neutral-200 border-l-4 ${getStatusBorder()} bg-white transition-all duration-200 hover:border-neutral-300 ${isPaid ? 'opacity-60' : ''}`}
    >
      {/* Main Row */}
      <div className="flex items-center justify-between p-4 sm:p-5">
        {/* Left: Info */}
        <div className="flex-1 min-w-0 mr-4">
          <div className="flex items-center space-x-2 mb-1">
            {/* Type icon */}
            {type === 'PAYABLE' ? (
              <ArrowUpRight size={14} className="text-rose-500 shrink-0" />
            ) : (
              <ArrowDownLeft size={14} className="text-emerald-500 shrink-0" />
            )}
            <span className={`font-semibold text-sm ${isPaid ? 'line-through text-neutral-400' : 'text-neutral-900'} truncate`}>
              {title}
            </span>
            {isRecurring && (
              <Repeat size={12} className="text-neutral-400 shrink-0" />
            )}
            {isStatutory && (
              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 bg-rose-100 text-rose-700 shrink-0">
                {t('obligationManager.statutory', 'Statutory')}
              </span>
            )}
          </div>

          <div className="flex items-center space-x-3 text-[11px] text-neutral-500">
            {counterpartyName && (
              <span className="truncate max-w-[140px]">{counterpartyName}</span>
            )}
            {category && (
              <span className="px-1.5 py-0.5 bg-neutral-100 text-neutral-600 font-medium uppercase tracking-wider text-[10px]">
                {CATEGORY_LABELS[category] || category}
              </span>
            )}
            {dueDate && (
              <span className="flex items-center space-x-1">
                <CalendarDays size={10} />
                <span>{dueDate}</span>
              </span>
            )}
          </div>
        </div>

        {/* Right: Amount + Status */}
        <div className="flex items-center space-x-3 sm:space-x-4 shrink-0">
          {/* Due badge */}
          <span className={`text-[11px] font-semibold px-2 py-1 ${getDueColor()}`}>
            {getDueText()}
          </span>

          {/* Amount */}
          <div className="text-right">
            <div className={`font-display font-bold text-lg sm:text-xl ${type === 'RECEIVABLE' ? 'text-emerald-800' : 'text-neutral-900'}`}>
              {type === 'RECEIVABLE' ? '+' : '-'}₹{amount.toLocaleString('en-IN')}
            </div>
            {priorityWeight !== undefined && priorityWeight > 0 && (
              <div className="text-[10px] text-neutral-400 font-medium">
                P{Math.round(priorityWeight * 100)}
              </div>
            )}
          </div>

          {/* Expand toggle */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors cursor-pointer"
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* Expanded Actions */}
      {expanded && (
        <div className="border-t border-neutral-100 px-4 sm:px-5 py-3 bg-neutral-50/50 flex flex-wrap items-center justify-between gap-2">
          {/* Meta details */}
          <div className="flex items-center space-x-4 text-[11px] text-neutral-500">
            {penaltyRatePerDay && (
              <span className="flex items-center space-x-1">
                <AlertTriangle size={10} className="text-amber-600" />
                <span>₹{penaltyRatePerDay}/day penalty</span>
              </span>
            )}
            {allowPartialPayment && (
              <span className="text-blue-600 font-medium">Partial payment OK</span>
            )}
            {isRecurring && (
              <span className="flex items-center space-x-1 text-neutral-600">
                <Repeat size={10} />
                <span>Recurring</span>
              </span>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center space-x-2">
            {!isPaid && (
              <button
                onClick={() => onMarkPaid(id)}
                disabled={isUpdating}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
              >
                <CheckCircle2 size={13} />
                <span>{t('obligationManager.markPaid', 'Mark Paid')}</span>
              </button>
            )}

            <button
              onClick={() => onEdit(id)}
              className="flex items-center space-x-1.5 px-3 py-1.5 border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-700 text-xs font-semibold transition-colors cursor-pointer"
            >
              <Pencil size={12} />
              <span>{t('obligationManager.edit', 'Edit')}</span>
            </button>

            {!showDeleteConfirm ? (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center space-x-1.5 px-3 py-1.5 border border-neutral-200 bg-white hover:bg-rose-50 hover:border-rose-200 text-neutral-500 hover:text-rose-600 text-xs font-semibold transition-colors cursor-pointer"
              >
                <Trash2 size={12} />
              </button>
            ) : (
              <div className="flex items-center space-x-1.5">
                <button
                  onClick={() => {
                    onDelete(id);
                    setShowDeleteConfirm(false);
                  }}
                  disabled={isUpdating}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {t('obligationManager.confirmDelete', 'Delete')}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-3 py-1.5 border border-neutral-300 bg-white text-neutral-600 text-xs font-semibold hover:bg-neutral-50 transition-colors cursor-pointer"
                >
                  {t('common.cancel', 'Cancel')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
