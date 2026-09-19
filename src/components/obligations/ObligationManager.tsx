'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import FinFineProLoader from '@/components/ui/FinFineProLoader';
import {
  Plus,
  Filter,
  RefreshCw,
  ArrowUpRight,
  ArrowDownLeft,
  Inbox,
  X,
} from 'lucide-react';
import ObligationCard from './ObligationCard';
import AddObligationModal from './AddObligationModal';

interface ObligationData {
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

const FILTER_CATEGORIES = [
  { key: 'ALL', label: 'All' },
  { key: 'VENDOR_BILL', label: 'Supplier' },
  { key: 'UTILITY_BILL', label: 'Utility' },
  { key: 'SALARY', label: 'Salary' },
  { key: 'GST_PAYMENT', label: 'GST' },
  { key: 'TDS_PAYMENT', label: 'TDS' },
  { key: 'CUSTOMER_INVOICE', label: 'Invoice' },
  { key: 'OTHER', label: 'Other' },
];

const FILTER_STATUSES = [
  { key: 'ALL', label: 'All' },
  { key: 'SCHEDULED', label: 'Scheduled' },
  { key: 'OVERDUE', label: 'Overdue' },
  { key: 'PAID', label: 'Paid' },
  { key: 'DISPUTED', label: 'Disputed' },
];

export default function ObligationManager() {
  const { t } = useTranslation();
  const [obligations, setObligations] = useState<ObligationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  // Filters
  const [showFilters, setShowFilters] = useState(false);
  const [filterType, setFilterType] = useState<'ALL' | 'PAYABLE' | 'RECEIVABLE'>('ALL');
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');

  // Modal
  const [showAddModal, setShowAddModal] = useState(false);

  const fetchObligations = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filterType !== 'ALL') params.set('type', filterType);
      if (filterCategory !== 'ALL') params.set('category', filterCategory);
      if (filterStatus !== 'ALL') params.set('status', filterStatus);

      const res = await fetch(`/api/obligations?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setObligations(data.obligations || []);
    } catch (err) {
      console.error('Failed to fetch obligations:', err);
      setObligations([]);
    } finally {
      setLoading(false);
    }
  }, [filterType, filterCategory, filterStatus]);

  useEffect(() => {
    fetchObligations();
  }, [fetchObligations]);

  const handleMarkPaid = async (id: string) => {
    setUpdating(id);
    try {
      const res = await fetch(`/api/obligations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'PAID' }),
      });
      if (res.ok) {
        await fetchObligations();
      }
    } catch (err) {
      console.error('Failed to mark paid:', err);
    } finally {
      setUpdating(null);
    }
  };

  const handleEdit = (id: string) => {
    // For now, open card expansion — full edit modal can be a follow-up
    console.log('Edit obligation:', id);
  };

  const handleDelete = async (id: string) => {
    setUpdating(id);
    try {
      const res = await fetch(`/api/obligations/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        await fetchObligations();
      }
    } catch (err) {
      console.error('Failed to delete:', err);
    } finally {
      setUpdating(null);
    }
  };

  // Computed stats
  const payableCount = obligations.filter((o) => o.type === 'PAYABLE' && o.status !== 'PAID').length;
  const receivableCount = obligations.filter((o) => o.type === 'RECEIVABLE' && o.status !== 'PAID').length;
  const totalPayable = obligations
    .filter((o) => o.type === 'PAYABLE' && o.status !== 'PAID')
    .reduce((sum, o) => sum + o.amount, 0);
  const totalReceivable = obligations
    .filter((o) => o.type === 'RECEIVABLE' && o.status !== 'PAID')
    .reduce((sum, o) => sum + o.amount, 0);

  const hasActiveFilters = filterType !== 'ALL' || filterCategory !== 'ALL' || filterStatus !== 'ALL';

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-display font-bold text-xl text-neutral-900">
            {t('obligationManager.manageTitle', 'Manage Obligations')}
          </h3>
          <p className="text-xs text-neutral-500 mt-0.5">
            {t('obligationManager.manageSubtitle', 'Add, track, and manage payables and receivables')}
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center space-x-1.5 px-3 py-2 border text-xs font-semibold transition-colors cursor-pointer ${
              hasActiveFilters
                ? 'border-neutral-900 bg-neutral-900 text-white'
                : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
            }`}
          >
            <Filter size={13} />
            <span>{t('obligationManager.filter', 'Filter')}</span>
            {hasActiveFilters && (
              <span className="w-4 h-4 bg-white text-neutral-900 text-[10px] font-bold flex items-center justify-center">
                {[filterType !== 'ALL', filterCategory !== 'ALL', filterStatus !== 'ALL'].filter(Boolean).length}
              </span>
            )}
          </button>

          <button
            onClick={fetchObligations}
            disabled={loading}
            className="p-2 border border-neutral-200 text-neutral-500 hover:bg-neutral-50 transition-colors cursor-pointer"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center space-x-1.5 px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-bold transition-colors cursor-pointer"
          >
            <Plus size={14} />
            <span>{t('obligationManager.addBtn', 'Add Obligation')}</span>
          </button>
        </div>
      </div>

      {/* Summary Stat Row */}
      <div className="grid grid-cols-2 divide-x divide-neutral-200 border border-neutral-200">
        <div className="p-4 flex items-center space-x-3">
          <div className="w-8 h-8 bg-rose-50 flex items-center justify-center">
            <ArrowUpRight size={16} className="text-rose-600" />
          </div>
          <div>
            <div className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">
              {t('obligationManager.totalPayable', 'Payables')} ({payableCount})
            </div>
            <div className="font-display font-bold text-lg text-neutral-900">
              ₹{totalPayable.toLocaleString('en-IN')}
            </div>
          </div>
        </div>
        <div className="p-4 flex items-center space-x-3">
          <div className="w-8 h-8 bg-emerald-50 flex items-center justify-center">
            <ArrowDownLeft size={16} className="text-emerald-600" />
          </div>
          <div>
            <div className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">
              {t('obligationManager.totalReceivable', 'Receivables')} ({receivableCount})
            </div>
            <div className="font-display font-bold text-lg text-emerald-800">
              ₹{totalReceivable.toLocaleString('en-IN')}
            </div>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      {showFilters && (
        <div className="border border-neutral-200 bg-neutral-50/50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-widest">
              {t('obligationManager.filters', 'Filters')}
            </span>
            {hasActiveFilters && (
              <button
                onClick={() => {
                  setFilterType('ALL');
                  setFilterCategory('ALL');
                  setFilterStatus('ALL');
                }}
                className="flex items-center space-x-1 text-[11px] text-neutral-500 hover:text-neutral-900 cursor-pointer"
              >
                <X size={12} />
                <span>{t('obligationManager.clearFilters', 'Clear all')}</span>
              </button>
            )}
          </div>

          {/* Type Filter */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">
              {t('obligationManager.typeFilter', 'Type')}
            </label>
            <div className="flex space-x-1">
              {(['ALL', 'PAYABLE', 'RECEIVABLE'] as const).map((opt) => (
                <button
                  key={opt}
                  onClick={() => setFilterType(opt)}
                  className={`px-3 py-1.5 text-xs font-semibold border transition-colors cursor-pointer ${
                    filterType === opt
                      ? 'bg-neutral-900 text-white border-neutral-900'
                      : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-400'
                  }`}
                >
                  {opt === 'ALL'
                    ? t('obligationManager.all', 'All')
                    : opt === 'PAYABLE'
                    ? t('obligationManager.payables', 'Payables')
                    : t('obligationManager.receivables', 'Receivables')}
                </button>
              ))}
            </div>
          </div>

          {/* Category Filter */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">
              {t('obligationManager.categoryFilter', 'Category')}
            </label>
            <div className="flex flex-wrap gap-1">
              {FILTER_CATEGORIES.map((cat) => (
                <button
                  key={cat.key}
                  onClick={() => setFilterCategory(cat.key)}
                  className={`px-2.5 py-1 text-[11px] font-semibold border transition-colors cursor-pointer ${
                    filterCategory === cat.key
                      ? 'bg-neutral-900 text-white border-neutral-900'
                      : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-400'
                  }`}
                >
                  {t(`obligationManager.cat_${cat.key}`, cat.label)}
                </button>
              ))}
            </div>
          </div>

          {/* Status Filter */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">
              {t('obligationManager.statusFilter', 'Status')}
            </label>
            <div className="flex space-x-1">
              {FILTER_STATUSES.map((st) => (
                <button
                  key={st.key}
                  onClick={() => setFilterStatus(st.key)}
                  className={`px-2.5 py-1 text-[11px] font-semibold border transition-colors cursor-pointer ${
                    filterStatus === st.key
                      ? 'bg-neutral-900 text-white border-neutral-900'
                      : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-400'
                  }`}
                >
                  {t(`obligationManager.status_${st.key}`, st.label)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Obligation List */}
      {loading ? (
        <FinFineProLoader />
      ) : obligations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 space-y-4 border border-dashed border-neutral-200">
          <Inbox size={32} className="text-neutral-300" />
          <div className="text-center">
            <div className="text-sm font-semibold text-neutral-600">
              {hasActiveFilters
                ? t('obligationManager.noResults', 'No obligations match your filters')
                : t('obligationManager.noObligations', 'No obligations yet')}
            </div>
            <div className="text-xs text-neutral-400 mt-1">
              {hasActiveFilters
                ? t('obligationManager.tryDifferentFilter', 'Try adjusting your filters')
                : t('obligationManager.addFirst', 'Add your first supplier payment, utility bill, or customer invoice')}
            </div>
          </div>
          {!hasActiveFilters && (
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center space-x-1.5 px-4 py-2 bg-neutral-900 text-white text-xs font-bold hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              <Plus size={14} />
              <span>{t('obligationManager.addFirstBtn', 'Add Obligation')}</span>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {obligations.map((obl) => (
            <ObligationCard
              key={obl.id}
              obligation={obl}
              onMarkPaid={handleMarkPaid}
              onEdit={handleEdit}
              onDelete={handleDelete}
              isUpdating={updating === obl.id}
            />
          ))}
        </div>
      )}

      {/* Add Modal */}
      <AddObligationModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onCreated={fetchObligations}
      />
    </div>
  );
}
