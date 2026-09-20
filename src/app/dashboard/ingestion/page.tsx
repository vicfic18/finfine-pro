'use client';

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Link from 'next/link';
import DocumentUploadZone from '@/components/ingestion/DocumentUploadZone';
import BankStatementsTable from '@/components/ingestion/BankStatementsTable';
import BillsInvoicesTable from '@/components/ingestion/BillsInvoicesTable';
import DocumentDetailModal from '@/components/ingestion/DocumentDetailModal';
import EntityGraphView from '@/components/ingestion/EntityGraphView';
import { RefreshCw, Network } from 'lucide-react';
import clsx from 'clsx';
import BrandLogo from '@/components/ui/BrandLogo';
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

  const hasDocuments = bankStatements.length > 0 || billsAndInvoices.length > 0;

  return (
    <div className="flex flex-col max-w-7xl mx-auto w-full font-sans pb-20 space-y-8">
      
      {/* 1. Header with Breadcrumbs */}
      <div className="space-y-2">
        <div className="flex items-center space-x-2 text-xs font-medium text-neutral-400">
          <Link href="/dashboard" className="hover:opacity-80 transition-opacity flex items-center">
            <BrandLogo size="sm" />
          </Link>
          <span>/</span>
          <span className="text-neutral-900 font-semibold">{t('nav.documents', 'Documents & Ingestion')}</span>
        </div>

        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
          <div>
            <h1 className="font-display font-bold text-3xl sm:text-4xl text-neutral-900 tracking-tight leading-tight">
              {t('ingestion.title', 'Financial Document Ingestion')}
            </h1>
            <p className="text-xs sm:text-sm text-neutral-500 mt-1 max-w-2xl font-sans">
              {t('ingestion.subtitle', 'Upload GST invoices, bills, and multi-bank statements for instant AI ledger parsing.')}
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => fetchDocuments(true)}
              disabled={refreshing}
              className="px-3.5 py-2 text-xs font-semibold bg-white border border-neutral-300 hover:bg-neutral-100 flex items-center space-x-1.5 transition-colors text-neutral-700 cursor-pointer shadow-xs"
            >
              <RefreshCw size={13} className={clsx(refreshing && "animate-spin text-neutral-900")} />
              <span>{refreshing ? t('ingestion.syncing', 'Syncing...') : t('ingestion.refreshRecords', 'Refresh Records')}</span>
            </button>
          </div>
        </header>
      </div>

      {/* 2. Top-Level Document Upload Center */}
      <section aria-label="Upload Center" className="bg-white border border-neutral-200">
        <DocumentUploadZone onUploadSuccess={() => fetchDocuments(false)} />
      </section>

      {/* 3. Document Tables */}
      <section aria-label="Ingested Documents Display" className="space-y-8">
        
        {/* Table 1: Bank Statements */}
        <div className="space-y-2.5">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block">
              {t('ingestion.treasury', 'Treasury Ledger')}
            </span>
            <h2 className="font-display font-bold text-xl text-neutral-900 tracking-tight">
              {t('ingestion.bankStatementsTableTitle', 'Bank Account Statements')}
            </h2>
          </div>

          <BankStatementsTable
            documents={bankStatements}
            onSelectDocument={(doc) => setSelectedDoc(doc)}
          />
        </div>

        {/* Table 2: Bills and Invoices */}
        <div className="space-y-2.5">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block">
              {t('ingestion.trade', 'Trade Payables & Receivables')}
            </span>
            <h2 className="font-display font-bold text-xl text-neutral-900 tracking-tight">
              {t('ingestion.billsInvoicesTableTitle', 'Commercial Invoices & Bills')}
            </h2>
          </div>

          <BillsInvoicesTable
            documents={billsAndInvoices}
            onSelectDocument={(doc) => setSelectedDoc(doc)}
          />
        </div>

      </section>

      {/* 4. Entity Graph View (Rendered conditionally or with empty guidance) */}
      <section aria-label="Entity Graph">
        {hasDocuments ? (
          <EntityGraphView
            businessName={businessName}
            bankStatements={bankStatements}
            billsAndInvoices={billsAndInvoices}
          />
        ) : (
          <div className="p-8 bg-neutral-50 border border-neutral-200 text-center space-y-3">
            <div className="w-10 h-10 rounded-full bg-neutral-200 text-neutral-600 flex items-center justify-center mx-auto">
              <Network size={20} />
            </div>
            <h3 className="text-sm font-bold text-neutral-800">Counterparty Entity Graph</h3>
            <p className="text-xs text-neutral-500 max-w-md mx-auto">
              Upload commercial invoices or bank statements above to visualize the financial relationship graph connecting your business to suppliers, customers, and banks.
            </p>
          </div>
        )}
      </section>

      {/* 5. Document Details Modal */}
      <DocumentDetailModal
        document={selectedDoc}
        onClose={() => setSelectedDoc(null)}
      />

    </div>
  );
}
