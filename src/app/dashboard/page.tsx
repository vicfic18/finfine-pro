'use client';

import React, { useState, useEffect } from 'react';
import TopRibbon from '@/components/dashboard/TopRibbon';
import ForecastingCharts from '@/components/dashboard/ForecastingCharts';
import RiskCalendar from '@/components/dashboard/RiskCalendar';
import ScenarioSimulator from '@/components/dashboard/ScenarioSimulator';
import TaxChecksWidget from '@/components/dashboard/TaxChecksWidget';
import type { FinancialMetricData } from '@/lib/financial-store';

export default function DashboardPage() {
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
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center space-y-4 font-sans bg-white">
        <div className="w-8 h-8 border-2 border-neutral-900 border-t-transparent animate-spin" />
        <div className="text-xs uppercase tracking-widest font-semibold text-neutral-500">
          Loading Financial Records...
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col max-w-7xl mx-auto w-full font-sans bg-white border border-neutral-200 divide-y divide-neutral-200">
      
      {/* 1. Header: FinFine Pro in Gilroy Bold & Business Name in Bold Cirka */}
      <header className="p-6 sm:p-8 bg-white">
        <div className="font-sans font-bold text-xs uppercase tracking-widest text-neutral-400 mb-2">
          FinFine Pro
        </div>
        <h1 className="font-display font-bold text-4xl sm:text-5xl lg:text-6xl text-neutral-900 tracking-tight leading-none">
          Shree Ganesh Enterprises
        </h1>
      </header>

      {/* 2. Primary Solvency & Executive Health Ribbon (Touching Grid) */}
      <section aria-label="Executive Health Ribbon">
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
