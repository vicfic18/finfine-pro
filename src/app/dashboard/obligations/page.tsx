'use client';

import React, { useState, useEffect } from 'react';
import ObligationsWidget from '@/components/dashboard/ObligationsWidget';
import type { FinancialMetricData } from '@/lib/financial-store';

export default function ObligationsPage() {
  const [data, setData] = useState<FinancialMetricData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

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

  if (loading || !data) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center space-y-4 font-sans bg-white">
        <div className="w-8 h-8 border-2 border-neutral-900 border-t-transparent animate-spin" />
        <div className="text-xs uppercase tracking-widest font-semibold text-neutral-500">
          Loading Recurrent Obligations...
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col max-w-7xl mx-auto w-full font-sans bg-white border border-neutral-200 divide-y divide-neutral-200">
      
      {/* Header */}
      <header className="p-6 sm:p-8 bg-white">
        <div className="font-sans font-bold text-xs uppercase tracking-widest text-neutral-400 mb-2">
          FinFine Pro
        </div>
        <h1 className="font-display font-bold text-4xl sm:text-5xl text-neutral-900 tracking-tight">
          Periodic Events
        </h1>
        <p className="text-sm text-neutral-500 mt-2 max-w-2xl">
          Track fixed store overheads, supplier payables, debtor clearance velocity, and cash conversion cycles.
        </p>
      </header>

      {/* Obligations Overview */}
      <div className="p-6 sm:p-8">
        <ObligationsWidget data={data} />
      </div>

    </div>
  );
}
