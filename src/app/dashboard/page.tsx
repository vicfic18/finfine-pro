'use client';

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import TopRibbon from '@/components/dashboard/TopRibbon';
import ForecastingCharts from '@/components/dashboard/ForecastingCharts';
import RiskCalendar from '@/components/dashboard/RiskCalendar';
import ScenarioSimulator from '@/components/dashboard/ScenarioSimulator';
import TaxChecksWidget from '@/components/dashboard/TaxChecksWidget';
import LanguageSelector from '@/components/ui/LanguageSelector';
import FinFineProLoader from '@/components/ui/FinFineProLoader';
import type { FinancialMetricData } from '@/lib/financial-store';

export default function DashboardPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<FinancialMetricData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  
  // What-If Simulation State
  const [unplannedExpense, setUnplannedExpense] = useState<number>(0);
  const [delayDays, setDelayDays] = useState<number>(0);

  const loadData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const url = isRefresh ? '/api/dashboard/financial-data?refresh=true' : '/api/dashboard/financial-data';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to load financial records');
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleResetSimulation = () => {
    setUnplannedExpense(0);
    setDelayDays(0);
  };

  if (loading || !data) {
    return <FinFineProLoader />;
  }

  return (
    <div className="flex flex-col max-w-7xl mx-auto w-full font-sans bg-white border border-neutral-200 divide-y divide-neutral-200">
      
      {/* 1. Header: FinFine Pro & Dynamic Business Name */}
      <header className="p-6 sm:p-8 bg-white flex items-start justify-between">
        <div>
          <div className="font-sans font-bold text-xs uppercase tracking-widest text-neutral-400 mb-2">
            {t('common.appName', 'FinFine Pro')}
          </div>
          <h1 className="font-display font-bold text-4xl sm:text-5xl lg:text-6xl text-neutral-900 tracking-tight leading-none">
            {data.businessName || 'My Business'}
          </h1>
        </div>

        <div className="sm:hidden">
          <LanguageSelector variant="compact" />
        </div>
      </header>


      {/* 2. Primary Solvency Ribbon */}
      <section aria-label="Solvency Ribbon">
        <TopRibbon
          data={data}
          simulatedExpense={unplannedExpense}
          simulatedDelay={delayDays}
        />
      </section>

      {/* 3. Cash Flow Trajectory */}
      <section aria-label="Forecasting and Trajectory">
        <ForecastingCharts
          data={data}
          simulatedExpense={unplannedExpense}
          simulatedDelay={delayDays}
        />
      </section>

      {/* 4. Risk Calendar with Month Heatmap & Paginated Schedule Table */}
      <section aria-label="Risk Calendar">
        <RiskCalendar data={data} />
      </section>

      {/* 5. What-If Scenario Simulator */}
      <section aria-label="Scenario Simulator">
        <ScenarioSimulator
          data={data}
          unplannedExpense={unplannedExpense}
          delayDays={delayDays}
          onExpenseChange={setUnplannedExpense}
          onDelayChange={setDelayDays}
          onReset={handleResetSimulation}
        />
      </section>

      {/* 6. Tax Checks (Statutory Rails) */}
      <section aria-label="Tax Checks">
        <TaxChecksWidget data={data} />
      </section>

    </div>
  );
}
