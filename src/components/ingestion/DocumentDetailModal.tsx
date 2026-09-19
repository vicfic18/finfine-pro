'use client';

import React from 'react';
import {
  X,
  FileSpreadsheet,
  FileText,
  Building2,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  ExternalLink,
  Receipt,
  FileCode,
} from 'lucide-react';
import type { BankStatementDoc, BillInvoiceDoc } from '@/app/api/ingestion/documents/route';

interface DocumentDetailModalProps {
  document: (BankStatementDoc | BillInvoiceDoc) | null;
  onClose: () => void;
}

export default function DocumentDetailModal({ document, onClose }: DocumentDetailModalProps) {
  if (!document) return null;

  const isBankStatement = document.documentType === 'BANK_STATEMENT';
  const raw = document.rawMetadata || {};

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 backdrop-blur-xs font-sans">
      <div className="bg-white border-2 border-neutral-900 max-w-2xl w-full p-6 sm:p-8 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100"
          title="Close modal"
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
              {isBankStatement ? 'Bank Statement Record' : 'External Bill / Invoice Record'}
            </span>
            <h3 className="font-display font-bold text-xl sm:text-2xl text-neutral-900 leading-tight">
              {document.fileName}
            </h3>
          </div>
        </div>

        <p className="text-xs text-neutral-500 font-mono mb-6">
          Document ID: {document.id} • Tenant: {document.tenantId}
        </p>

        {/* Bank Statement Specifics */}
        {isBankStatement && (
          <div className="space-y-6">
            {/* Account & Balances Card */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-neutral-50 border border-neutral-200">
              <div>
                <span className="text-[10px] uppercase font-bold text-neutral-500 block">
                  Banking Partner
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
                  Statement Period
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
                  Opening Balance
                </span>
                <span className="font-bold text-neutral-900 text-sm font-mono">
                  ₹{(document as BankStatementDoc).openingBalance.toLocaleString('en-IN')}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-neutral-500 block">
                  Closing Balance
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
                  Total Credits (Inflow)
                </span>
                <span className="font-display font-bold text-lg text-emerald-800 font-mono">
                  +₹{(document as BankStatementDoc).totalInflow.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="p-3 bg-indigo-50/60 border border-indigo-200">
                <span className="text-[10px] uppercase font-bold text-indigo-800 block">
                  Total Debits (Outflow)
                </span>
                <span className="font-display font-bold text-lg text-indigo-800 font-mono">
                  -₹{(document as BankStatementDoc).totalOutflow.toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            {/* Statutory & Reconciliation details */}
            <div className="p-4 border border-neutral-200 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-neutral-500">Reconciliation Status</span>
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-semibold border border-emerald-300">
                  {(document as BankStatementDoc).reconciliationStatus}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-neutral-500">Extracted Transactions</span>
                <span className="font-mono font-bold text-neutral-900">
                  {(document as BankStatementDoc).transactionCount} transactions normalized
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-neutral-500">S3 Storage Key</span>
                <span className="font-mono text-[11px] text-neutral-700 truncate max-w-xs">
                  {document.s3Key}
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
                  Counterparty Entity
                </span>
                <span className="font-bold text-neutral-900 text-sm">
                  {(document as BillInvoiceDoc).counterpartyName}
                </span>
                <span className="text-[11px] text-neutral-500 block">
                  {(document as BillInvoiceDoc).counterpartyType}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-neutral-500 block">
                  Invoice Amount
                </span>
                <span className="font-bold text-neutral-900 text-sm font-mono">
                  ₹{(document as BillInvoiceDoc).amount.toLocaleString('en-IN')}
                </span>
                {(document as BillInvoiceDoc).taxAmount && (
                  <span className="text-[11px] text-neutral-500 block">
                    Tax: ₹{(document as BillInvoiceDoc).taxAmount?.toLocaleString('en-IN')}
                  </span>
                )}
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-neutral-500 block">
                  Due Date
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
                <span className="text-neutral-500">Bank Statement Reconciliation</span>
                <span className="px-2 py-0.5 bg-neutral-100 text-neutral-800 font-semibold border border-neutral-300">
                  {(document as BillInvoiceDoc).matchedBankRef}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-neutral-500">Storage Key</span>
                <span className="font-mono text-[11px] text-neutral-700 truncate max-w-xs">
                  {document.s3Key}
                </span>
              </div>
            </div>

            {/* Line items if available */}
            {raw.lineItems && Array.isArray(raw.lineItems) && (
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-neutral-600 block mb-2">
                  Parsed Line Items:
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
            className="px-5 py-2 text-xs font-semibold bg-neutral-900 text-white hover:bg-neutral-800 transition-colors"
          >
            Dismiss
          </button>
        </div>

      </div>
    </div>
  );
}
