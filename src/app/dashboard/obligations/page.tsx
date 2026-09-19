'use client';

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import ObligationsWidget from '@/components/dashboard/ObligationsWidget';
import ObligationManager from '@/components/obligations/ObligationManager';
import LanguageSelector from '@/components/ui/LanguageSelector';
import type { FinancialMetricData } from '@/lib/financial-store';

export default function ObligationsPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<FinancialMetricData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'manage' | 'analytics'>('manage');

  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch('/api/dashboard/financial-data');
        if (!res.ok) throw new Error('Failed to load financial records');
        const json = await res.json();
        setData(json);
      } catch (err) {
        console.error('Failed to load obligations data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  return (
    <div className="flex flex-col max-w-7xl mx-auto w-full font-sans bg-white border border-neutral-200 divide-y divide-neutral-200">
      
      {/* Header */}
      <header className="p-6 sm:p-8 bg-white flex items-start justify-between">
        <div>
          <div className="font-sans font-bold text-xs uppercase tracking-widest text-neutral-400 mb-2">
            {t('common.appName', 'FinFine Pro')}
          </div>
          <h1 className="font-display font-bold text-4xl sm:text-5xl text-neutral-900 tracking-tight">
            {t('obligations.title', 'Obligations')}
          </h1>
          <p className="text-sm text-neutral-500 mt-2 max-w-2xl">
            {t('obligations.subtitle', 'Track fixed overheads, supplier payables, debtor clearance velocity, and cash conversion cycles.')}
          </p>
        </div>

        <div className="sm:hidden">
          <LanguageSelector variant="compact" />
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="flex items-center bg-neutral-50 px-6 sm:px-8">
        <button
          onClick={() => setActiveTab('manage')}
          className={`px-4 py-3 text-xs font-bold uppercase tracking-widest border-b-2 transition-colors cursor-pointer ${
            activeTab === 'manage'
              ? 'border-neutral-900 text-neutral-900 bg-white'
              : 'border-transparent text-neutral-400 hover:text-neutral-700'
          }`}
        >
          {t('obligations.tabManage', 'Manage')}
        </button>
        <button
          onClick={() => setActiveTab('analytics')}
          className={`px-4 py-3 text-xs font-bold uppercase tracking-widest border-b-2 transition-colors cursor-pointer ${
            activeTab === 'analytics'
              ? 'border-neutral-900 text-neutral-900 bg-white'
              : 'border-transparent text-neutral-400 hover:text-neutral-700'
          }`}
        >
          {t('obligations.tabAnalytics', 'Analytics')}
        </button>
      </div>

      {/* Content */}
      <div className="p-6 sm:p-8">
        {activeTab === 'manage' ? (
          <ObligationManager />
        ) : loading || !data ? (
          <div className="flex flex-col items-center justify-center py-16 space-y-4">
            <div className="w-8 h-8 border-2 border-neutral-900 border-t-transparent animate-spin" />
            <div className="text-xs uppercase tracking-widest font-semibold text-neutral-500">
              {t('obligations.loading', 'Loading Recurrent Obligations...')}
            </div>
          </div>
        ) : (
          <ObligationsWidget data={data} />
        )}
      </div>

    </div>
  );
}
