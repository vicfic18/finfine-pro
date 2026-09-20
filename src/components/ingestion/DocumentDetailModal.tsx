'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  X,
  FileSpreadsheet,
  Receipt,
} from 'lucide-react';
import clsx from 'clsx';
import type { BankStatementDoc, BillInvoiceDoc } from '@/app/api/ingestion/documents/route';

interface DocumentDetailModalProps {
  document: (BankStatementDoc | BillInvoiceDoc) | null;
  onClose: () => void;
}

export default function DocumentDetailModal({ document, onClose }: DocumentDetailModalProps) {
  const { t } = useTranslation();
  if (!document) return null;

  const isBankStatement = document.documentType === 'BANK_STATEMENT';
  const raw = document.rawMetadata || {};

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 backdrop-blur-xs font-sans">
      <div className="bg-white border-2 border-neutral-900 max-w-2xl w-full p-6 sm:p-8 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 cursor-pointer"
          title={t('common.cancel')}
        >
          <X size={20} />
        </button>

        {/* Top Header */}
        <div className="flex items-center space-x-2.5 mb-2">
          <div className="p-2 bg-neutral-900 text-white">
            {isBankStatement ? <FileSpreadsheet size={20} /> : <Receipt size={20} />}
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block">
              {isBankStatement ? t('ingestion.modalTitleBank') : t('ingestion.modalTitleInvoice')}
            </span>
            <h3 className="font-display font-bold text-xl sm:text-2xl text-neutral-900 leading-tight">
              {document.fileName}
            </h3>
          </div>
        </div>

        <p className="text-xs text-neutral-500 font-mono mb-6">
          Document ID: {document.id}
        </p>

        {/* Bank Statement Specifics */}
        {isBankStatement && (
          <div className="space-y-6">
            {/* Account & Balances Card */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-neutral-50 border border-neutral-200">
              <div>
                <span className="text-[10px] uppercase font-bold text-neutral-500 block">
                  {t('ingestion.bankingPartner')}
                </span>
                <span className="font-bold text-neutral-900 text-sm">
                  {(document as BankStatementDoc).bankName}
                </span>
                <span className="text-[11px] text-neutral-500 block font-mono">
                  {(document as BankStatementDoc).accountNumberMasked}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-neutral-500 block">
                  {t('ingestion.statementPeriod')}
                </span>
                <span className="font-semibold text-neutral-800 text-xs block">
                  {(document as BankStatementDoc).statementPeriod.startDate}
                </span>
                <span className="text-[11px] text-neutral-500 font-mono">
                  to {(document as BankStatementDoc).statementPeriod.endDate}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-neutral-500 block">
                  {t('ingestion.openingBalance')}
                </span>
                <span className="font-bold text-neutral-900 text-sm font-mono">
                  ₹{(document as BankStatementDoc).openingBalance.toLocaleString('en-IN')}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-neutral-500 block">
                  {t('ingestion.closingBalance')}
                </span>
                <span className="font-bold text-neutral-900 text-sm font-mono">
                  ₹{(document as BankStatementDoc).closingBalance.toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            {/* Turnover Flow Metrics */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-emerald-50/60 border border-emerald-200">
                <span className="text-[10px] uppercase font-bold text-emerald-800 block">
                  {t('topRibbon.inflows')}
                </span>
                <span className="font-display font-bold text-lg text-emerald-800 font-mono">
                  +₹{(document as BankStatementDoc).totalInflow.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="p-3 bg-indigo-50/60 border border-indigo-200">
                <span className="text-[10px] uppercase font-bold text-indigo-800 block">
                  {t('topRibbon.outflows')}
                </span>
                <span className="font-display font-bold text-lg text-indigo-800 font-mono">
                  -₹{(document as BankStatementDoc).totalOutflow.toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            {/* Statutory & Reconciliation details */}
            <div className="p-4 border border-neutral-200 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-neutral-500">{t('ingestion.reconciliationHeader')}</span>
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-semibold border border-emerald-300">
                  {(document as BankStatementDoc).reconciliationStatus}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-neutral-500">{t('ingestion.reconciledTransactions')}</span>
                <span className="font-mono font-bold text-neutral-900">
                  {(document as BankStatementDoc).transactionCount} transactions recorded
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-neutral-500">Source File</span>
                <span className="font-mono text-[11px] text-neutral-700 truncate max-w-xs">
                  {document.fileName}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Bill / Invoice Specifics */}
        {!isBankStatement && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 bg-neutral-50 border border-neutral-200">
              <div>
                <span className="text-[10px] uppercase font-bold text-neutral-500 block">
                  {((document as BillInvoiceDoc).counterpartyType === 'CUSTOMER' || (document as BillInvoiceDoc).category === 'CUSTOMER_INVOICE')
                    ? t('ingestion.customerCol', 'Customer Name')
                    : t('ingestion.supplierCol', 'Who to Pay (Supplier)')}
                </span>
                <span className="font-bold text-neutral-900 text-sm">
                  {(document as BillInvoiceDoc).counterpartyName}
                </span>
                <span className="text-[11px] font-semibold text-neutral-600 block">
                  {((document as BillInvoiceDoc).counterpartyType === 'CUSTOMER' || (document as BillInvoiceDoc).category === 'CUSTOMER_INVOICE')
                    ? 'Customer (Money to Receive)'
                    : 'Supplier (Money to Pay)'}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-neutral-500 block">
                  {t('ingestion.amountLabel', 'Amount (₹)')}
                </span>
                <span
                  className={clsx(
                    "font-bold text-sm font-mono",
                    ((document as BillInvoiceDoc).counterpartyType === 'CUSTOMER' || (document as BillInvoiceDoc).category === 'CUSTOMER_INVOICE')
                      ? "text-emerald-700"
                      : "text-indigo-700"
                  )}
                >
                  {((document as BillInvoiceDoc).counterpartyType === 'CUSTOMER' || (document as BillInvoiceDoc).category === 'CUSTOMER_INVOICE') ? '+' : '-'}₹{(document as BillInvoiceDoc).amount.toLocaleString('en-IN')}
                </span>
                {(document as BillInvoiceDoc).taxAmount ? (
                  <span className="text-[11px] text-neutral-500 block">
                    GST: ₹{(document as BillInvoiceDoc).taxAmount?.toLocaleString('en-IN')}
                  </span>
                ) : null}
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-neutral-500 block">
                  {((document as BillInvoiceDoc).counterpartyType === 'CUSTOMER' || (document as BillInvoiceDoc).category === 'CUSTOMER_INVOICE')
                    ? t('ingestion.expectedDateLabel', 'Expected Date')
                    : t('ingestion.dueDate', 'Due Date')}
                </span>
                <span className="font-semibold text-neutral-800 text-sm">
                  {(document as BillInvoiceDoc).dueDate || 'Immediate'}
                </span>
                <span className="text-[11px] text-neutral-500 block">
                  Date: {(document as BillInvoiceDoc).invoiceDate}
                </span>
              </div>
            </div>

            {/* GSTIN & Bank Match */}
            <div className="p-4 border border-neutral-200 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-neutral-500">GSTIN / Tax ID</span>
                <span className="font-mono font-bold text-neutral-900">
                  {(document as BillInvoiceDoc).gstin || 'Unspecified'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-neutral-500">{t('ingestion.reconciliationHeader')}</span>
                <span className="px-2 py-0.5 bg-neutral-100 text-neutral-800 font-semibold border border-neutral-300">
                  {(document as BillInvoiceDoc).matchedBankRef || 'Matched'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-neutral-500">Source File</span>
                <span className="font-mono text-[11px] text-neutral-700 truncate max-w-xs">
                  {document.fileName}
                </span>
              </div>
            </div>

            {/* Line items if available */}
            {raw.lineItems && Array.isArray(raw.lineItems) && (
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-neutral-600 block mb-2">
                  {t('ingestion.extractedLineItems')}:
                </span>
                <div className="border border-neutral-200 overflow-hidden text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-500">
                      <tr>
                        <th className="p-2">Description</th>
                        <th className="p-2 text-right">Qty</th>
                        <th className="p-2 text-right">Rate</th>
                        <th className="p-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200">
                      {raw.lineItems.map((item: any, idx: number) => (
                        <tr key={idx} className="hover:bg-neutral-50/50">
                          <td className="p-2">{item.desc || item.description}</td>
                          <td className="p-2 text-right font-mono">{item.qty}</td>
                          <td className="p-2 text-right font-mono">₹{item.rate}</td>
                          <td className="p-2 text-right font-mono font-bold">₹{item.total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Modal Footer */}
        <div className="mt-8 pt-4 border-t border-neutral-200 flex items-center justify-between">
          <span className="text-[11px] text-neutral-400 font-mono">
            Processed: {new Date(document.processedAt).toLocaleString('en-IN')}
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-semibold bg-neutral-900 text-white hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            Dismiss
          </button>
        </div>

      </div>
    </div>
  );
}
