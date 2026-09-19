'use client';

import React, { useState, useEffect } from 'react';
import EntityMindmapGraph from '@/components/ingestion/EntityMindmapGraph';
import DocumentUploadZone from '@/components/ingestion/DocumentUploadZone';
import BankStatementsTable from '@/components/ingestion/BankStatementsTable';
import BillsInvoicesTable from '@/components/ingestion/BillsInvoicesTable';
import DocumentDetailModal from '@/components/ingestion/DocumentDetailModal';
import {
  FileSpreadsheet,
  Receipt,
  UploadCloud,
  CheckCircle2,
  RefreshCw,
  Building2,
  Layers,
  ArrowDownUp,
} from 'lucide-react';
import clsx from 'clsx';
import type { BankStatementDoc, BillInvoiceDoc } from '@/app/api/ingestion/documents/route';

export default function IngestionPage() {
  const [bankStatements, setBankStatements] = useState<BankStatementDoc[]>([]);
  const [billsAndInvoices, setBillsAndInvoices] = useState<BillInvoiceDoc[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [selectedDoc, setSelectedDoc] = useState<(BankStatementDoc | BillInvoiceDoc) | null>(null);

  const fetchDocuments = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await fetch('/api/ingestion/documents');
      if (!res.ok) throw new Error('Failed to load documents');
      const data = await res.json();
      setBankStatements(data.bankStatements || []);
      setBillsAndInvoices(data.billsAndInvoices || []);
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
      
      {/* 1. Header & Quick Stat Counters */}
      <header className="pt-2 pb-6 border-b border-neutral-200 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-widest text-neutral-400 block mb-1">
            Data Pipelines & Entity Ingestion
          </span>
          <h1 className="font-display font-bold text-3xl sm:text-4xl text-neutral-900 tracking-tight">
            Document Ingestion & Entity Graph
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-1 max-w-2xl font-sans">
            Continuous ingestion of HDFC/ICICI bank statements, vendor bills, customer invoices, and statutory tax challans linked to real AWS storage.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => fetchDocuments(true)}
            disabled={refreshing}
            className="px-3.5 py-2 text-xs font-semibold bg-white border border-neutral-300 hover:bg-neutral-100 flex items-center space-x-1.5 transition-colors text-neutral-700"
          >
            <RefreshCw size={13} className={clsx(refreshing && "animate-spin text-neutral-900")} />
            <span>{refreshing ? 'Syncing DynamoDB...' : 'Refresh Records'}</span>
          </button>
        </div>
      </header>

      {/* 2. Top-Level Entity Mindmap Graph */}
      <section aria-label="Entity Mindmap Graph">
        <EntityMindmapGraph />
      </section>

      {/* 3. Document Upload Center (Amazon S3 + Bedrock Pipeline) */}
      <section aria-label="Document Upload Center">
        <DocumentUploadZone onUploadSuccess={() => fetchDocuments(false)} />
      </section>

      {/* 4. Split Ingestion Document Tables */}
      <section aria-label="Ingested Documents Display" className="space-y-10">
        
        {/* Table 1: Bank Statements */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block">
                Source of Truth
              </span>
              <h2 className="font-display font-bold text-xl sm:text-2xl text-neutral-900 tracking-tight">
                Bank Statements Ledger
              </h2>
            </div>
            <span className="text-xs text-neutral-500 font-sans">
              Auto-reconciled with UPI & NEFT payment rails
            </span>
          </div>

          <BankStatementsTable
            documents={bankStatements}
            onSelectDocument={(doc) => setSelectedDoc(doc)}
          />
        </div>

        {/* Table 2: External Bills and Invoices */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block">
                Trade & Statutory Obligations
              </span>
              <h2 className="font-display font-bold text-xl sm:text-2xl text-neutral-900 tracking-tight">
                External Bills & Invoices
              </h2>
            </div>
            <span className="text-xs text-neutral-500 font-sans">
              Matched against bank statement debits and credits
            </span>
          </div>

          <BillsInvoicesTable
            documents={billsAndInvoices}
            onSelectDocument={(doc) => setSelectedDoc(doc)}
          />
        </div>

      </section>

      {/* 5. Document Details Modal */}
      <DocumentDetailModal
        document={selectedDoc}
        onClose={() => setSelectedDoc(null)}
      />

    </div>
  );
}
