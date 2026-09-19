'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Building2,
  CheckCircle2,
  Search,
} from 'lucide-react';
import clsx from 'clsx';
import type { BankStatementDoc } from '@/app/api/ingestion/documents/route';

interface BankStatementsTableProps {
  documents: BankStatementDoc[];
  onSelectDocument: (doc: BankStatementDoc) => void;
}

export default function BankStatementsTable({
  documents,
  onSelectDocument,
}: BankStatementsTableProps) {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedBank, setSelectedBank] = useState<string>('ALL');

  const availableBanks = Array.from(new Set(documents.map((d) => d.bankName)));

  const filteredDocs = documents.filter((doc) => {
    const matchesSearch =
      doc.fileName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.bankName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.accountNumberMasked.includes(searchTerm);

    const matchesBank = selectedBank === 'ALL' || doc.bankName === selectedBank;
    return matchesSearch && matchesBank;
  });

  return (
    <div className="bg-white border border-neutral-200 shadow-xs">
      
      {/* Table Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-6 py-4 border-b border-neutral-200 bg-neutral-50/70 gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <Building2 size={18} className="text-neutral-900" />
            <h3 className="font-display font-bold text-lg text-neutral-900 tracking-tight">
              {t('ingestion.bankStatementsTableTitle')}
            </h3>
            <span className="px-2 py-0.5 text-[11px] font-bold bg-neutral-900 text-white font-mono">
              {filteredDocs.length}
            </span>
          </div>
          <p className="text-xs text-neutral-500 font-sans mt-0.5">
            {t('ingestion.subtitle')}
          </p>
        </div>

        {/* Search & Bank Filter */}
        <div className="flex items-center space-x-2 w-full sm:w-auto text-xs font-sans">
          <div className="relative flex-1 sm:w-56">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t('ingestion.searchBankPlaceholder')}
              className="w-full pl-8 pr-3 py-1.5 bg-white border border-neutral-300 text-neutral-800 placeholder-neutral-400 focus:outline-neutral-900"
            />
          </div>

          {availableBanks.length > 1 && (
            <select
              value={selectedBank}
              onChange={(e) => setSelectedBank(e.target.value)}
              className="py-1.5 px-2 bg-white border border-neutral-300 text-neutral-700 focus:outline-neutral-900"
            >
              <option value="ALL">{t('ingestion.allBanks')}</option>
              {availableBanks.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Table Body */}
      <div className="overflow-x-auto">
        <table className="w-full text-left font-sans text-xs">
          <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-500 uppercase tracking-wider text-[10px] font-semibold">
            <tr>
              <th className="py-3 px-6">{t('ingestion.bankingPartner')}</th>
              <th className="py-3 px-4">{t('ingestion.statementPeriod')}</th>
              <th className="py-3 px-4 text-right">{t('ingestion.balanceRange')}</th>
              <th className="py-3 px-4 text-right">{t('ingestion.volume')}</th>
              <th className="py-3 px-4 text-center">{t('ingestion.statusHeader')}</th>
              <th className="py-3 px-4 text-center">{t('ingestion.reconciliationHeader')}</th>
              <th className="py-3 px-4">{t('ingestion.processedDateHeader')}</th>
              <th className="py-3 px-6 text-right">{t('ingestion.actionHeader')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {filteredDocs.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-10 text-center text-neutral-400">
                  {t('ingestion.noBankMatch')}
                </td>
              </tr>
            ) : (
              filteredDocs.map((doc) => (
                <tr
                  key={doc.id}
                  onClick={() => onSelectDocument(doc)}
                  className="hover:bg-neutral-50/70 transition-colors cursor-pointer group"
                >
                  {/* Banking Partner & Masked Account */}
                  <td className="py-4 px-6">
                    <div className="flex items-center space-x-2.5">
                      <div className="w-8 h-8 bg-neutral-100 border border-neutral-200 flex items-center justify-center text-neutral-900 font-bold text-xs">
                        {doc.bankName.slice(0, 4).toUpperCase()}
                      </div>
                      <div>
                        <span className="font-bold text-neutral-900 block text-sm">
                          {doc.bankName}
                        </span>
                        <span className="font-mono text-[11px] text-neutral-500">
                          {doc.accountNumberMasked}
                        </span>
                      </div>
                    </div>
                  </td>

                  {/* Statement Period */}
                  <td className="py-4 px-4">
                    <span className="font-semibold text-neutral-800 block">
                      {doc.statementPeriod.startDate}
                    </span>
                    <span className="text-[11px] text-neutral-500 block">
                      to {doc.statementPeriod.endDate}
                    </span>
                  </td>

                  {/* Balance Range (Opening -> Closing) */}
                  <td className="py-4 px-4 text-right font-mono">
                    <span className="text-neutral-500 text-[11px] block">
                      Open: ₹{doc.openingBalance.toLocaleString('en-IN')}
                    </span>
                    <span className="font-bold text-neutral-900 text-sm block">
                      Close: ₹{doc.closingBalance.toLocaleString('en-IN')}
                    </span>
                  </td>

                  {/* Volume (Turnover) */}
                  <td className="py-4 px-4 text-right font-mono">
                    <span className="text-emerald-700 font-semibold block text-[11px]">
                      +₹{doc.totalInflow.toLocaleString('en-IN')}
                    </span>
                    <span className="text-indigo-700 font-semibold block text-[11px]">
                      -₹{doc.totalOutflow.toLocaleString('en-IN')}
                    </span>
                    <span className="text-[10px] text-neutral-400 font-sans block">
                      {doc.transactionCount} transactions
                    </span>
                  </td>

                  {/* Processing Status */}
                  <td className="py-4 px-4 text-center">
                    <span
                      className={clsx(
                        "inline-flex items-center space-x-1 px-2.5 py-0.5 text-[10px] font-bold border",
                        doc.status === 'EXTRACTED'
                          ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                          : "bg-neutral-100 text-neutral-700 border-neutral-300"
                      )}
                    >
                      <CheckCircle2 size={11} className="text-emerald-600" />
                      <span>{doc.status === 'EXTRACTED' ? 'Processed' : doc.status}</span>
                    </span>
                  </td>

                  {/* Reconciliation Status */}
                  <td className="py-4 px-4 text-center">
                    <span className="inline-block px-2 py-0.5 text-[11px] font-semibold bg-neutral-100 text-neutral-800 border border-neutral-200">
                      {doc.reconciliationStatus}
                    </span>
                  </td>

                  {/* Processed Date */}
                  <td className="py-4 px-4 text-neutral-500 text-[11px] font-mono">
                    {new Date(doc.processedAt).toLocaleDateString('en-IN', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </td>

                  {/* Action */}
                  <td className="py-4 px-6 text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectDocument(doc);
                      }}
                      className="px-3 py-1.5 font-semibold text-[11px] bg-white border border-neutral-300 hover:bg-neutral-900 hover:text-white transition-colors cursor-pointer"
                    >
                      {t('ingestion.inspectBtn')}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}
