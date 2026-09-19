'use client';

import React, { useState } from 'react';
import {
  Receipt,
  Search,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownLeft,
  ShieldCheck,
  Tag,
  Filter,
} from 'lucide-react';
import clsx from 'clsx';
import type { BillInvoiceDoc } from '@/app/api/ingestion/documents/route';

interface BillsInvoicesTableProps {
  documents: BillInvoiceDoc[];
  onSelectDocument: (doc: BillInvoiceDoc) => void;
}

export default function BillsInvoicesTable({
  documents,
  onSelectDocument,
}: BillsInvoicesTableProps) {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'VENDOR' | 'CUSTOMER' | 'TAX_AUTHORITY'>('ALL');

  const filteredDocs = documents.filter((doc) => {
    const matchesSearch =
      doc.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.counterpartyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (doc.gstin && doc.gstin.toLowerCase().includes(searchTerm.toLowerCase())) ||
      doc.fileName.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesType = typeFilter === 'ALL' || doc.counterpartyType === typeFilter;
    return matchesSearch && matchesType;
  });

  return (
    <div className="bg-white border border-neutral-200 shadow-xs">
      
      {/* Table Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-6 py-4 border-b border-neutral-200 bg-neutral-50/70 gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <Receipt size={18} className="text-neutral-900" />
            <h3 className="font-display font-bold text-lg text-neutral-900 tracking-tight">
              External Bills & Invoices
            </h3>
            <span className="px-2 py-0.5 text-[11px] font-bold bg-neutral-900 text-white font-mono">
              {filteredDocs.length}
            </span>
          </div>
          <p className="text-xs text-neutral-500 font-sans mt-0.5">
            Vendor purchase bills, customer invoices, and statutory challans linked to bank transactions.
          </p>
        </div>

        {/* Search & Type Filter */}
        <div className="flex items-center space-x-2 w-full sm:w-auto text-xs font-sans">
          <div className="relative flex-1 sm:w-56">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search vendor, invoice #, GSTIN..."
              className="w-full pl-8 pr-3 py-1.5 bg-white border border-neutral-300 text-neutral-800 placeholder-neutral-400 focus:outline-neutral-900"
            />
          </div>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as any)}
            className="py-1.5 px-2 bg-white border border-neutral-300 text-neutral-700 focus:outline-neutral-900"
          >
            <option value="ALL">All Document Types</option>
            <option value="VENDOR">Vendor Bills (Payable)</option>
            <option value="CUSTOMER">Customer Invoices (Receivable)</option>
            <option value="TAX_AUTHORITY">Tax Challans (Statutory)</option>
          </select>
        </div>
      </div>

      {/* Table Body */}
      <div className="overflow-x-auto">
        <table className="w-full text-left font-sans text-xs">
          <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-500 uppercase tracking-wider text-[10px] font-semibold">
            <tr>
              <th className="py-3 px-6">Invoice # & Document</th>
              <th className="py-3 px-4">Counterparty</th>
              <th className="py-3 px-4">Classification</th>
              <th className="py-3 px-4">GSTIN / Tax ID</th>
              <th className="py-3 px-4">Dates</th>
              <th className="py-3 px-4 text-right">Amount</th>
              <th className="py-3 px-4">Bank Reconciliation Match</th>
              <th className="py-3 px-6 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {filteredDocs.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-10 text-center text-neutral-400">
                  No invoices or bills match the active search filter.
                </td>
              </tr>
            ) : (
              filteredDocs.map((doc) => {
                const isCustomer = doc.counterpartyType === 'CUSTOMER';
                const isVendor = doc.counterpartyType === 'VENDOR';
                const isTax = doc.counterpartyType === 'TAX_AUTHORITY';

                return (
                  <tr
                    key={doc.id}
                    onClick={() => onSelectDocument(doc)}
                    className="hover:bg-neutral-50/70 transition-colors cursor-pointer group"
                  >
                    {/* Invoice # & Filename */}
                    <td className="py-4 px-6">
                      <span className="font-bold text-neutral-900 block text-sm font-mono">
                        {doc.invoiceNumber}
                      </span>
                      <span className="text-[11px] text-neutral-500 block truncate max-w-[180px]">
                        {doc.fileName}
                      </span>
                    </td>

                    {/* Counterparty Name */}
                    <td className="py-4 px-4">
                      <span className="font-semibold text-neutral-900 block text-sm">
                        {doc.counterpartyName}
                      </span>
                      <span className="text-[10px] text-neutral-500 block uppercase">
                        {doc.category.replace('_', ' ')}
                      </span>
                    </td>

                    {/* Classification Badge */}
                    <td className="py-4 px-4">
                      <span
                        className={clsx(
                          "inline-flex items-center space-x-1 px-2 py-0.5 text-[10px] font-bold border",
                          isCustomer
                            ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                            : isVendor
                            ? "bg-indigo-50 text-indigo-800 border-indigo-300"
                            : "bg-amber-50 text-amber-800 border-amber-300"
                        )}
                      >
                        {isCustomer ? (
                          <ArrowUpRight size={11} className="text-emerald-700" />
                        ) : isVendor ? (
                          <ArrowDownLeft size={11} className="text-indigo-700" />
                        ) : (
                          <ShieldCheck size={11} className="text-amber-700" />
                        )}
                        <span>
                          {isCustomer ? 'RECEIVABLE' : isVendor ? 'PAYABLE' : 'STATUTORY'}
                        </span>
                      </span>
                    </td>

                    {/* GSTIN / Tax ID */}
                    <td className="py-4 px-4 font-mono text-[11px] text-neutral-700">
                      {doc.gstin || 'Non-GST'}
                    </td>

                    {/* Invoice Date & Due Date */}
                    <td className="py-4 px-4">
                      <span className="text-[11px] text-neutral-500 block">
                        Inv: {doc.invoiceDate}
                      </span>
                      {doc.dueDate && (
                        <span className="font-semibold text-neutral-800 text-[11px] block">
                          Due: {doc.dueDate}
                        </span>
                      )}
                    </td>

                    {/* Amount */}
                    <td className="py-4 px-4 text-right font-mono">
                      <span
                        className={clsx(
                          "font-bold text-sm block",
                          isCustomer ? "text-emerald-700" : isVendor ? "text-indigo-700" : "text-amber-800"
                        )}
                      >
                        {isCustomer ? '+' : '-'}₹{doc.amount.toLocaleString('en-IN')}
                      </span>
                      {doc.taxAmount ? (
                        <span className="text-[10px] text-neutral-400 block">
                          Tax ₹{doc.taxAmount.toLocaleString('en-IN')}
                        </span>
                      ) : null}
                    </td>

                    {/* Bank Reconciliation Match */}
                    <td className="py-4 px-4">
                      <span
                        className={clsx(
                          "inline-block px-2 py-0.5 text-[10px] font-semibold border",
                          doc.reconciliationStatus === 'MATCHED'
                            ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                            : doc.reconciliationStatus === 'PARTIALLY_MATCHED'
                            ? "bg-amber-50 text-amber-800 border-amber-300"
                            : "bg-neutral-100 text-neutral-600 border-neutral-300"
                        )}
                      >
                        {doc.matchedBankRef || 'Pending Bank Sync'}
                      </span>
                    </td>

                    {/* Action */}
                    <td className="py-4 px-6 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectDocument(doc);
                        }}
                        className="px-3 py-1.5 font-semibold text-[11px] bg-white border border-neutral-300 hover:bg-neutral-900 hover:text-white transition-colors"
                      >
                        Inspect
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
