'use client';

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import DocumentUploadZone from '@/components/ingestion/DocumentUploadZone';
import BankStatementsTable from '@/components/ingestion/BankStatementsTable';
import BillsInvoicesTable from '@/components/ingestion/BillsInvoicesTable';
import DocumentDetailModal from '@/components/ingestion/DocumentDetailModal';
import EntityGraphView from '@/components/ingestion/EntityGraphView';
import { RefreshCw } from 'lucide-react';
import clsx from 'clsx';
import type { BankStatementDoc, BillInvoiceDoc } from '@/app/api/ingestion/documents/route';

export default function IngestionPage() {
  const { t } = useTranslation();
  const [bankStatements, setBankStatements] = useState<BankStatementDoc[]>([]);
  const [billsAndInvoices, setBillsAndInvoices] = useState<BillInvoiceDoc[]>([]);
  const [businessName, setBusinessName] = useState<string>('My Business');
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [selectedDoc, setSelectedDoc] = useState<(BankStatementDoc | BillInvoiceDoc) | null>(null);

  const fetchDocuments = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const [docRes, settingsRes] = await Promise.all([
        fetch('/api/ingestion/documents'),
        fetch('/api/dashboard/settings'),
      ]);

      if (docRes.ok) {
        const data = await docRes.json();
        setBankStatements(data.bankStatements || []);
        setBillsAndInvoices(data.billsAndInvoices || []);
      }

      if (settingsRes.ok) {
        const settings = await settingsRes.json();
        if (settings.businessName) setBusinessName(settings.businessName);
      }
    } catch (err) {
      console.error('Failed to load ingestion documents:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  return (
    <div className="flex flex-col max-w-7xl mx-auto w-full font-sans pb-20 bg-white space-y-10">
      
      {/* 1. Header */}
      <header className="pt-2 pb-6 border-b border-neutral-200 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-widest text-neutral-400 block mb-1">
            {t('nav.documents')}
          </span>
          <h1 className="font-display font-bold text-3xl sm:text-4xl text-neutral-900 tracking-tight">
            {t('ingestion.title')}
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-1 max-w-2xl font-sans">
            {t('ingestion.subtitle')}
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => fetchDocuments(true)}
            disabled={refreshing}
            className="px-3.5 py-2 text-xs font-semibold bg-white border border-neutral-300 hover:bg-neutral-100 flex items-center space-x-1.5 transition-colors text-neutral-700 cursor-pointer"
          >
            <RefreshCw size={13} className={clsx(refreshing && "animate-spin text-neutral-900")} />
            <span>{refreshing ? t('ingestion.syncing') : t('ingestion.refreshRecords')}</span>
          </button>
        </div>
      </header>

      {/* 2. Top-Level Document Upload Center (Moved to Top) */}
      <section aria-label="Upload Center">
        <DocumentUploadZone onUploadSuccess={() => fetchDocuments(false)} />
      </section>

      {/* 3. Document Tables */}
      <section aria-label="Ingested Documents Display" className="space-y-10">
        
        {/* Table 1: Bank Statements */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block">
                {t('ingestion.treasury')}
              </span>
              <h2 className="font-display font-bold text-xl sm:text-2xl text-neutral-900 tracking-tight">
                {t('ingestion.bankStatementsTableTitle')}
              </h2>
            </div>
            <span className="text-xs text-neutral-500 font-sans">
              {t('ingestion.searchBankPlaceholder')}
            </span>
          </div>

          <BankStatementsTable
            documents={bankStatements}
            onSelectDocument={(doc) => setSelectedDoc(doc)}
          />
        </div>

        {/* Table 2: Bills and Invoices */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block">
                {t('ingestion.trade')}
              </span>
              <h2 className="font-display font-bold text-xl sm:text-2xl text-neutral-900 tracking-tight">
                {t('ingestion.billsInvoicesTableTitle')}
              </h2>
            </div>
            <span className="text-xs text-neutral-500 font-sans">
              {t('ingestion.searchInvoicePlaceholder')}
            </span>
          </div>

          <BillsInvoicesTable
            documents={billsAndInvoices}
            onSelectDocument={(doc) => setSelectedDoc(doc)}
          />
        </div>

      </section>

      {/* 4. Entity Graph View (Actual Graph Component) */}
      <section aria-label="Entity Graph">
        <EntityGraphView
          businessName={businessName}
          bankStatements={bankStatements}
          billsAndInvoices={billsAndInvoices}
        />
      </section>

      {/* 5. Document Details Modal */}
      <DocumentDetailModal
        document={selectedDoc}
        onClose={() => setSelectedDoc(null)}
      />

    </div>
  );
}
