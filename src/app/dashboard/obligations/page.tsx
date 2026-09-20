'use client';

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Link from 'next/link';
import ObligationsWidget from '@/components/dashboard/ObligationsWidget';
import ObligationManager from '@/components/obligations/ObligationManager';
import FinFineProLoader from '@/components/ui/FinFineProLoader';
import BrandLogo from '@/components/ui/BrandLogo';
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
    <div className="flex flex-col max-w-7xl mx-auto w-full font-sans space-y-6">
      
      {/* 1. Header with Breadcrumbs */}
      <div className="space-y-2">
        <div className="flex items-center space-x-2 text-xs font-medium text-neutral-400">
          <Link href="/dashboard" className="hover:opacity-80 transition-opacity flex items-center">
            <BrandLogo size="sm" />
          </Link>
          <span>/</span>
          <span className="text-neutral-900 font-semibold">{t('nav.obligations', 'Obligations & Commitments')}</span>
        </div>

        <header className="pt-1">
          <h1 className="font-display font-bold text-3xl sm:text-4xl text-neutral-900 tracking-tight leading-tight">
            {t('obligations.title', 'Scheduled Obligations & Working Capital')}
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-1 max-w-2xl">
            {t('obligations.subtitle', 'Track fixed overheads, supplier payables, debtor clearance velocity, and cash conversion cycles.')}
          </p>
        </header>
      </div>

      {/* 2. Main Container with Tabs */}
      <div className="bg-white border border-neutral-200">
        {/* Tab Navigation */}
        <div className="flex items-center bg-neutral-50 px-4 sm:px-6 border-b border-neutral-200">
          <button
            onClick={() => setActiveTab('manage')}
            className={`px-4 py-3 text-xs font-bold uppercase tracking-widest border-b-2 transition-colors cursor-pointer ${
              activeTab === 'manage'
                ? 'border-neutral-900 text-neutral-900 bg-white'
                : 'border-transparent text-neutral-400 hover:text-neutral-700'
            }`}
          >
            {t('obligations.tabManage', 'Manage Payments')}
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`px-4 py-3 text-xs font-bold uppercase tracking-widest border-b-2 transition-colors cursor-pointer ${
              activeTab === 'analytics'
                ? 'border-neutral-900 text-neutral-900 bg-white'
                : 'border-transparent text-neutral-400 hover:text-neutral-700'
            }`}
          >
            {t('obligations.tabAnalytics', 'Working Capital Analytics')}
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 lg:p-8">
          {activeTab === 'manage' ? (
            <ObligationManager />
          ) : loading || !data ? (
            <FinFineProLoader />
          ) : (
            <ObligationsWidget data={data} />
          )}
        </div>
      </div>

    </div>
  );
}

