'use client';

import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  UploadCloud,
  FileSpreadsheet,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Building2,
  Receipt,
  ShieldCheck,
  Info,
  FileCheck2,
} from 'lucide-react';
import clsx from 'clsx';

interface DocumentUploadZoneProps {
  onUploadSuccess?: () => void;
}

export default function DocumentUploadZone({ onUploadSuccess }: DocumentUploadZoneProps) {
  const { t } = useTranslation();
  const [docType, setDocType] = useState<'BANK_STATEMENT' | 'INVOICE'>('BANK_STATEMENT');
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadStep, setUploadStep] = useState<number>(0);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Optional manual bill fields if user is uploading an invoice
  const [vendorName, setVendorName] = useState<string>('');
  const [billAmount, setBillAmount] = useState<string>('');
  const [invoiceNumber, setInvoiceNumber] = useState<string>('');
  const [dueDate, setDueDate] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
      setResultMessage(null);
      setErrorMessage(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setResultMessage(null);
      setErrorMessage(null);
    }
  };

  // Upload handler: securely sends document for parsing and reconciliation
  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setUploadStep(1);
    setErrorMessage(null);
    setResultMessage(null);

    try {
      await new Promise((r) => setTimeout(r, 400));
      setUploadStep(2);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('documentType', docType);
      if (vendorName) formData.append('counterpartyName', vendorName);
      if (billAmount) formData.append('amount', billAmount);
      if (invoiceNumber) formData.append('invoiceNumber', invoiceNumber);
      if (dueDate) formData.append('dueDate', dueDate);

      const response = await fetch('/api/ingestion/upload', {
        method: 'POST',
        body: formData,
      });

      setUploadStep(3);
      await new Promise((r) => setTimeout(r, 300));

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to process document');
      }

      const resData = await response.json();
      setResultMessage(
        resData.message ||
          `Successfully processed ${file.name}. Document parsed and reconciled into your cash records.`
      );
      setFile(null);
      setVendorName('');
      setBillAmount('');
      setInvoiceNumber('');
      setDueDate('');

      if (onUploadSuccess) {
        onUploadSuccess();
      }
    } catch (err: any) {
      console.error('Upload failed:', err);
      setErrorMessage(err.message || 'Document processing encountered an unexpected error.');
    } finally {
      setUploading(false);
      setUploadStep(0);
    }
  };

  return (
    <div className="bg-white border border-neutral-200 shadow-xs space-y-0">
      
      {/* 1. Header Bar with Mode Toggle */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-6 py-4 border-b border-neutral-200 bg-neutral-50/70 gap-4">
        <div>
          <h2 className="font-display font-bold text-lg text-neutral-900 tracking-tight flex items-center space-x-2">
            <UploadCloud size={20} className="text-neutral-900" />
            <span>{t('ingestion.uploadCenter')}</span>
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5 font-sans">
            {t('ingestion.uploadCenterSub')}
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center space-x-1 p-1 bg-white border border-neutral-300 font-sans text-xs">
          <button
            type="button"
            onClick={() => {
              setDocType('BANK_STATEMENT');
              setFile(null);
            }}
            className={clsx(
              "px-3.5 py-1.5 font-semibold transition-all flex items-center space-x-2 cursor-pointer",
              docType === 'BANK_STATEMENT'
                ? "bg-neutral-900 text-white"
                : "text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100"
            )}
          >
            <Building2 size={14} />
            <span>{t('ingestion.tabBankStatements')}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setDocType('INVOICE');
              setFile(null);
            }}
            className={clsx(
              "px-3.5 py-1.5 font-semibold transition-all flex items-center space-x-2 cursor-pointer",
              docType === 'INVOICE'
                ? "bg-neutral-900 text-white"
                : "text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100"
            )}
          >
            <Receipt size={14} />
            <span>{t('ingestion.tabBillsInvoices')}</span>
          </button>
        </div>
      </div>

      {/* 2. Main Upload Section */}
      <div className="p-6 sm:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* LEFT: DROPZONE (8 Cols) */}
          <div className="lg:col-span-8 flex flex-col space-y-4">
            
            {/* Customer Information Banner */}
            <div className="flex items-center space-x-2.5 px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 text-neutral-700 text-xs font-sans">
              <Info size={15} className="text-neutral-600 shrink-0" />
              <span>
                <strong>{t('ingestion.automatedBannerBold')}</strong> {t('ingestion.automatedBannerText')}
              </span>
            </div>

            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={clsx(
                "border-2 border-dashed p-8 sm:p-10 text-center cursor-pointer transition-all duration-150 relative flex flex-col items-center justify-center min-h-[200px]",
                isDragging
                  ? "border-neutral-900 bg-neutral-100 scale-[0.99]"
                  : "border-neutral-300 hover:border-neutral-900 bg-neutral-50/40 hover:bg-neutral-50"
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept={docType === 'BANK_STATEMENT' ? '.pdf,.csv,.ofx' : '.pdf,.png,.jpg,.jpeg'}
                onChange={handleFileChange}
                className="hidden"
              />

              <div className="w-12 h-12 bg-white border border-neutral-300 flex items-center justify-center text-neutral-700 shadow-xs mb-3 group-hover:scale-110 transition-transform">
                {docType === 'BANK_STATEMENT' ? (
                  <FileSpreadsheet size={24} className="text-neutral-900" />
                ) : (
                  <FileText size={24} className="text-neutral-900" />
                )}
              </div>

              <div className="font-display font-bold text-lg text-neutral-900 mb-1">
                {file ? file.name : docType === 'BANK_STATEMENT' ? t('ingestion.dropBankStatement') : t('ingestion.dropInvoice')}
              </div>

              <p className="text-xs text-neutral-500 font-sans max-w-md">
                {file
                  ? `${t('ingestion.selectedPrefix')} ${(file.size / 1024).toFixed(1)} KB • ${t('ingestion.readyToProcess')}`
                  : docType === 'BANK_STATEMENT'
                  ? t('ingestion.bankStatementHint')
                  : t('ingestion.invoiceHint')}
              </p>

              <div className="mt-4 flex items-center space-x-2">
                <span className="px-2.5 py-1 text-[11px] font-semibold bg-white border border-neutral-300 text-neutral-700">
                  {t('ingestion.selectFromComputer')}
                </span>
                <span className="text-xs text-neutral-400 font-sans">{t('ingestion.orDragFile')}</span>
              </div>
            </div>

            {/* Optional manual metadata inputs if invoice tab is active */}
            {docType === 'INVOICE' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-4 bg-neutral-50 border border-neutral-200 text-xs font-sans">
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">
                    {t('ingestion.vendorLabel')}
                  </label>
                  <input
                    type="text"
                    value={vendorName}
                    onChange={(e) => setVendorName(e.target.value)}
                    placeholder="e.g. Sharma Textiles"
                    className="w-full bg-white border border-neutral-300 p-2 text-xs focus:outline-neutral-900"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">
                    {t('ingestion.amountLabel')}
                  </label>
                  <input
                    type="number"
                    value={billAmount}
                    onChange={(e) => setBillAmount(e.target.value)}
                    placeholder="35000"
                    className="w-full bg-white border border-neutral-300 p-2 text-xs focus:outline-neutral-900"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">
                    {t('ingestion.invoiceNumLabel')}
                  </label>
                  <input
                    type="text"
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    placeholder="INV-8821"
                    className="w-full bg-white border border-neutral-300 p-2 text-xs focus:outline-neutral-900"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">
                    {t('ingestion.dueDateLabel')}
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full bg-white border border-neutral-300 p-2 text-xs focus:outline-neutral-900"
                  />
                </div>
              </div>
            )}

            {/* Upload Action Button */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2">
              <div className="flex items-center space-x-3">
                <button
                  type="button"
                  disabled={!file || uploading}
                  onClick={handleUpload}
                  className={clsx(
                    "px-6 py-2.5 font-sans font-semibold text-xs transition-all flex items-center space-x-2 border",
                    file && !uploading
                      ? "bg-neutral-900 text-white border-neutral-900 hover:bg-neutral-800 shadow-xs cursor-pointer"
                      : "bg-neutral-200 text-neutral-400 border-neutral-200 cursor-not-allowed"
                  )}
                >
                  {uploading ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>{t('ingestion.processingDocumentBtn')}</span>
                    </>
                  ) : (
                    <>
                      <UploadCloud size={14} />
                      <span>{t('ingestion.uploadAndProcessBtn')}</span>
                    </>
                  )}
                </button>

                {file && !uploading && (
                  <button
                    type="button"
                    onClick={() => setFile(null)}
                    className="text-xs text-neutral-500 hover:text-neutral-900 font-sans underline cursor-pointer"
                  >
                    {t('ingestion.clearSelectedFile')}
                  </button>
                )}
              </div>
            </div>

            {/* Processing Step Progress Animation */}
            {uploading && (
              <div className="p-4 bg-neutral-50 border border-neutral-200 font-sans text-xs space-y-2 mt-2">
                <div className="flex items-center justify-between text-neutral-700 font-semibold">
                  <span>{t('ingestion.processingProgress')}</span>
                  <span>{t('ingestion.stepOf', { current: uploadStep, total: 3 })}</span>
                </div>
                <div className="w-full h-1.5 bg-neutral-200 overflow-hidden">
                  <div
                    className="h-full bg-neutral-900 transition-all duration-300"
                    style={{ width: `${(uploadStep / 3) * 100}%` }}
                  />
                </div>
                <div className="flex items-center space-x-2 text-neutral-500 text-[11px]">
                  <Loader2 size={12} className="animate-spin text-neutral-900" />
                  {uploadStep === 1 && <span>{t('ingestion.step1')}</span>}
                  {uploadStep === 2 && <span>{t('ingestion.step2')}</span>}
                  {uploadStep === 3 && <span>{t('ingestion.step3')}</span>}
                </div>
              </div>
            )}

            {/* Success Message Banner */}
            {resultMessage && (
              <div className="p-4 bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-sans flex items-start space-x-2.5">
                <CheckCircle2 size={16} className="text-emerald-600 mt-0.5 shrink-0" />
                <div>
                  <span className="font-bold block">{t('ingestion.uploadSuccess')}</span>
                  <span>{resultMessage}</span>
                </div>
              </div>
            )}

            {/* Error Message Banner */}
            {errorMessage && (
              <div className="p-4 bg-red-50 border border-red-300 text-red-900 text-xs font-sans flex items-start space-x-2.5">
                <AlertCircle size={16} className="text-red-600 mt-0.5 shrink-0" />
                <div>
                  <span className="font-bold block">{t('ingestion.processingError')}</span>
                  <span>{errorMessage}</span>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: GUIDELINES & SECURITY (4 Cols) */}
          <div className="lg:col-span-4 bg-neutral-50 border border-neutral-200 p-5 font-sans space-y-4 text-xs">
            <div className="flex items-center space-x-2 pb-3 border-b border-neutral-200">
              <ShieldCheck size={18} className="text-neutral-900" />
              <span className="font-display font-bold text-sm text-neutral-900">
                {t('ingestion.guidelinesTitle')}
              </span>
            </div>

            <div className="space-y-4">
              <div>
                <span className="text-[10px] uppercase font-bold text-neutral-400 block">
                  {t('ingestion.supportedTypes')}
                </span>
                <div className="flex flex-wrap gap-1.5 mt-1.5 font-sans text-[11px]">
                  <span className="px-2 py-0.5 bg-white border border-neutral-200 text-neutral-700 font-medium">Bank Statements</span>
                  <span className="px-2 py-0.5 bg-white border border-neutral-200 text-neutral-700 font-medium">GST Invoices</span>
                  <span className="px-2 py-0.5 bg-white border border-neutral-200 text-neutral-700 font-medium">Vendor Bills</span>
                  <span className="px-2 py-0.5 bg-white border border-neutral-200 text-neutral-700 font-medium">Tax Challans (PMT-06 / 281)</span>
                  <span className="px-2 py-0.5 bg-white border border-neutral-200 text-neutral-700 font-medium">Payroll Registers</span>
                </div>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-neutral-400 block">
                  {t('ingestion.automatedReconciliation')}
                </span>
                <p className="text-[11px] text-neutral-600 mt-1 leading-relaxed">
                  {t('ingestion.reconciliationText')}
                </p>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-neutral-400 block">
                  {t('ingestion.dataSecurity')}
                </span>
                <p className="text-[11px] text-neutral-600 mt-1 leading-relaxed">
                  {t('ingestion.securityText')}
                </p>
              </div>

              <div className="pt-2 border-t border-neutral-200 flex items-center space-x-2 text-[11px] text-neutral-500">
                <FileCheck2 size={14} className="text-emerald-600 shrink-0" />
                <span>{t('ingestion.auditReady')}</span>
              </div>
            </div>
          </div>

        </div>
      </div>

    </div>
  );
}
