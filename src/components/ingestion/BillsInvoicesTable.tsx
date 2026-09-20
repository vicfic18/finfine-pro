'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Receipt,
  Search,
  ArrowUpRight,
  ArrowDownLeft,
  ShieldCheck,
  Building2,
  FileText,
} from 'lucide-react';
import clsx from 'clsx';
import type { BillInvoiceDoc } from '@/app/api/ingestion/documents/route';

interface BillsInvoicesTableProps {
  documents: BillInvoiceDoc[];
  onSelectDocument: (doc: BillInvoiceDoc) => void;
  initialTab?: 'PAYABLE' | 'RECEIVABLE' | 'ALL';
}

export default function BillsInvoicesTable({
  documents,
  onSelectDocument,
  initialTab = 'PAYABLE',
}: BillsInvoicesTableProps) {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'PAYABLE' | 'RECEIVABLE' | 'ALL'>(initialTab);

  const isReceivableDoc = (doc: BillInvoiceDoc) =>
    doc.counterpartyType === 'CUSTOMER' ||
    doc.category === 'CUSTOMER_INVOICE' ||
    (doc.rawMetadata && doc.rawMetadata.type === 'RECEIVABLE');

  const payableDocs = documents.filter((d) => !isReceivableDoc(d));
  const receivableDocs = documents.filter(isReceivableDoc);

  const totalPayableAmount = payableDocs.reduce((sum, d) => sum + (d.amount || 0), 0);
  const totalReceivableAmount = receivableDocs.reduce((sum, d) => sum + (d.amount || 0), 0);

  const currentList =
    activeTab === 'PAYABLE'
      ? payableDocs
      : activeTab === 'RECEIVABLE'
      ? receivableDocs
      : documents;

  const filteredDocs = currentList.filter((doc) => {
    const term = searchTerm.toLowerCase();
    return (
      doc.invoiceNumber.toLowerCase().includes(term) ||
      doc.counterpartyName.toLowerCase().includes(term) ||
      (doc.gstin && doc.gstin.toLowerCase().includes(term)) ||
      doc.fileName.toLowerCase().includes(term)
    );
  });

  return (
    <div className="bg-white border border-neutral-200 shadow-xs">
      
      {/* 1. Header with Segmented Category Tabs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-5 py-3.5 border-b border-neutral-200 bg-neutral-50/70 gap-3">
        
        {/* Tab Buttons */}
        <div className="flex items-center space-x-1 p-1 bg-neutral-200/70 font-sans text-xs">
          {/* Bills to Pay */}
          <button
            type="button"
            onClick={() => setActiveTab('PAYABLE')}
            className={clsx(
              "px-3 py-1.5 font-semibold transition-all flex items-center space-x-1.5 cursor-pointer",
              activeTab === 'PAYABLE'
                ? "bg-white text-neutral-900 shadow-xs"
                : "text-neutral-600 hover:text-neutral-900"
            )}
          >
            <ArrowDownLeft size={14} className="text-indigo-700" />
            <span>{t('ingestion.billsPayableTitle', 'Bills to Pay (Payables)')}</span>
            <span className="px-1.5 py-0.2 bg-neutral-100 text-neutral-700 text-[10px] font-mono font-bold">
              {payableDocs.length}
            </span>
          </button>

          {/* Money to Receive */}
          <button
            type="button"
            onClick={() => setActiveTab('RECEIVABLE')}
            className={clsx(
              "px-3 py-1.5 font-semibold transition-all flex items-center space-x-1.5 cursor-pointer",
              activeTab === 'RECEIVABLE'
                ? "bg-white text-neutral-900 shadow-xs"
                : "text-neutral-600 hover:text-neutral-900"
            )}
          >
            <ArrowUpRight size={14} className="text-emerald-700" />
            <span>{t('ingestion.invoicesReceivableTitle', 'Money to Receive (Receivables)')}</span>
            <span className="px-1.5 py-0.2 bg-neutral-100 text-neutral-700 text-[10px] font-mono font-bold">
              {receivableDocs.length}
            </span>
          </button>

          {/* All */}
          <button
            type="button"
            onClick={() => setActiveTab('ALL')}
            className={clsx(
              "px-3 py-1.5 font-semibold transition-all flex items-center space-x-1.5 cursor-pointer",
              activeTab === 'ALL'
                ? "bg-white text-neutral-900 shadow-xs"
                : "text-neutral-600 hover:text-neutral-900"
            )}
          >
            <span>{t('obligationManager.all', 'All')}</span>
            <span className="px-1.5 py-0.2 bg-neutral-100 text-neutral-700 text-[10px] font-mono font-bold">
              {documents.length}
            </span>
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-64 text-xs font-sans">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={
              activeTab === 'PAYABLE'
                ? t('ingestion.searchPayablePlaceholder', 'Search supplier, bill number...')
                : activeTab === 'RECEIVABLE'
                ? t('ingestion.searchReceivablePlaceholder', 'Search customer, invoice number...')
                : t('ingestion.searchInvoicePlaceholder', 'Search bill or invoice...')
            }
            className="w-full pl-8 pr-3 py-1.5 bg-white border border-neutral-300 text-neutral-800 placeholder-neutral-400 focus:outline-neutral-900"
          />
        </div>

      </div>

      {/* 2. Sub-summary ribbon showing total amount */}
      <div className="px-5 py-2.5 bg-white border-b border-neutral-100 flex flex-wrap items-center justify-between text-xs font-sans gap-2">
        <div className="text-neutral-600">
          {activeTab === 'PAYABLE' && (
            <span>
              {t('ingestion.billsPayableSub', 'Supplier invoices, purchases, rent, and utility bills (Money going out)')}
            </span>
          )}
          {activeTab === 'RECEIVABLE' && (
            <span>
              {t('ingestion.invoicesReceivableSub', 'Sales invoices sent to customers (Money coming in)')}
            </span>
          )}
          {activeTab === 'ALL' && (
            <span>Showing all uploaded invoices, supplier bills, and receipts</span>
          )}
        </div>

        <div className="flex items-center space-x-4 font-mono font-semibold text-xs">
          {activeTab === 'PAYABLE' && (
            <div className="text-neutral-700">
              Total to Pay:{' '}
              <span className="text-indigo-700 font-bold">
                ₹{totalPayableAmount.toLocaleString('en-IN')}
              </span>
            </div>
          )}
          {activeTab === 'RECEIVABLE' && (
            <div className="text-neutral-700">
              Total to Collect:{' '}
              <span className="text-emerald-700 font-bold">
                ₹{totalReceivableAmount.toLocaleString('en-IN')}
              </span>
            </div>
          )}
          {activeTab === 'ALL' && (
            <>
              <span className="text-indigo-700">To Pay: ₹{totalPayableAmount.toLocaleString('en-IN')}</span>
              <span className="text-neutral-300">•</span>
              <span className="text-emerald-700">To Collect: ₹{totalReceivableAmount.toLocaleString('en-IN')}</span>
            </>
          )}
        </div>
      </div>

      {/* 3. Table Body */}
      <div className="overflow-x-auto">
        <table className="w-full text-left font-sans text-xs">
          <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-500 uppercase tracking-wider text-[10px] font-semibold">
            <tr>
              <th className="py-3 px-5">
                {activeTab === 'PAYABLE'
                  ? t('ingestion.supplierCol', 'Who to Pay (Supplier)')
                  : activeTab === 'RECEIVABLE'
                  ? t('ingestion.customerCol', 'Customer Name')
                  : t('ingestion.counterparty', 'Party Name')}
              </th>
              <th className="py-3 px-4">{t('ingestion.invoiceNumber', 'Bill / Invoice #')}</th>
              <th className="py-3 px-4">{t('ingestion.dueDate', 'Due Date')}</th>
              <th className="py-3 px-4 text-right">
                {activeTab === 'PAYABLE' ? 'Amount to Pay' : activeTab === 'RECEIVABLE' ? 'Amount to Collect' : 'Amount'}
              </th>
              <th className="py-3 px-4">{t('ingestion.reconciliationHeader', 'Bank Match')}</th>
              <th className="py-3 px-5 text-right">{t('ingestion.actionHeader', 'Action')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {filteredDocs.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-neutral-400">
                  {activeTab === 'PAYABLE'
                    ? t('ingestion.noPayableMatch', 'No bills to pay recorded yet.')
                    : activeTab === 'RECEIVABLE'
                    ? t('ingestion.noReceivableMatch', 'No customer invoices recorded yet.')
                    : t('ingestion.noInvoiceMatch', 'No bills or invoices match the search.')}
                </td>
              </tr>
            ) : (
              filteredDocs.map((doc) => {
                const isCust = isReceivableDoc(doc);

                return (
                  <tr
                    key={doc.id}
                    onClick={() => onSelectDocument(doc)}
                    className="hover:bg-neutral-50/70 transition-colors cursor-pointer group"
                  >
                    {/* Party Name */}
                    <td className="py-3.5 px-5">
                      <div className="flex items-center space-x-2">
                        <div
                          className={clsx(
                            "w-6 h-6 rounded-sm flex items-center justify-center shrink-0",
                            isCust ? "bg-emerald-50 text-emerald-700" : "bg-indigo-50 text-indigo-700"
                          )}
                        >
                          {isCust ? <ArrowUpRight size={13} /> : <ArrowDownLeft size={13} />}
                        </div>
                        <div>
                          <span className="font-semibold text-neutral-900 block text-sm">
                            {doc.counterpartyName}
                          </span>
                          <span className="text-[10px] text-neutral-500 block">
                            {doc.gstin ? `GST: ${doc.gstin}` : doc.category?.replace(/_/g, ' ') || 'General'}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Invoice # & Filename */}
                    <td className="py-3.5 px-4">
                      <span className="font-bold text-neutral-900 block font-mono text-xs">
                        {doc.invoiceNumber}
                      </span>
                      <span className="text-[11px] text-neutral-400 block truncate max-w-[160px]">
                        {doc.fileName}
                      </span>
                    </td>

                    {/* Due Date */}
                    <td className="py-3.5 px-4">
                      {doc.dueDate ? (
                        <span className="font-semibold text-neutral-800 text-xs block">
                          {doc.dueDate}
                        </span>
                      ) : (
                        <span className="text-neutral-400 text-xs">—</span>
                      )}
                      <span className="text-[10px] text-neutral-400 block">
                        Dated: {doc.invoiceDate}
                      </span>
                    </td>

                    {/* Amount */}
                    <td className="py-3.5 px-4 text-right font-mono">
                      <span
                        className={clsx(
                          "font-bold text-sm block",
                          isCust ? "text-emerald-700" : "text-indigo-700"
                        )}
                      >
                        {isCust ? '+' : '-'}₹{doc.amount.toLocaleString('en-IN')}
                      </span>
                      {doc.taxAmount ? (
                        <span className="text-[10px] text-neutral-400 block">
                          GST ₹{doc.taxAmount.toLocaleString('en-IN')}
                        </span>
                      ) : null}
                    </td>

                    {/* Bank Reconciliation / Match */}
                    <td className="py-3.5 px-4">
                      <span
                        className={clsx(
                          "inline-block px-2 py-0.5 text-[10px] font-semibold border",
                          doc.reconciliationStatus === 'MATCHED'
                            ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                            : doc.reconciliationStatus === 'PARTIALLY_MATCHED'
                            ? "bg-amber-50 text-amber-800 border-amber-300"
                            : "bg-neutral-100 text-neutral-600 border-neutral-200"
                        )}
                      >
                        {doc.matchedBankRef || 'Pending Bank Sync'}
                      </span>
                    </td>

                    {/* Action */}
                    <td className="py-3.5 px-5 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectDocument(doc);
                        }}
                        className="px-2.5 py-1 font-semibold text-[11px] bg-white border border-neutral-300 hover:bg-neutral-900 hover:text-white transition-colors cursor-pointer"
                      >
                        {t('ingestion.inspectBtn', 'View Details')}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}
