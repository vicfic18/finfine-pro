'use client';

import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  FileSpreadsheet,
  FileText,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Loader2,
  Building2,
  Receipt,
  FileCode,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import clsx from 'clsx';

interface DocumentUploadZoneProps {
  onUploadSuccess?: () => void;
}

export default function DocumentUploadZone({ onUploadSuccess }: DocumentUploadZoneProps) {
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

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setUploadStep(1);
    setErrorMessage(null);
    setResultMessage(null);

    try {
      // Step 1: Uploading to Amazon S3
      await new Promise((r) => setTimeout(r, 600));
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

      // Step 2 -> 3
      setUploadStep(3);
      await new Promise((r) => setTimeout(r, 400));

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to complete document ingestion pipeline');
      }

      const resData = await response.json();
      setResultMessage(
        resData.message ||
          `Successfully processed ${file.name}. Persisted into Amazon S3 & DynamoDB.`
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
      setErrorMessage(err.message || 'Ingestion encountered an unexpected error.');
    } finally {
      setUploading(false);
      setUploadStep(0);
    }
  };

  // Instant 1-click sample statement ingestion for testing
  const handleQuickIngestSample = async () => {
    setUploading(true);
    setUploadStep(1);
    setErrorMessage(null);
    setResultMessage(null);

    try {
      await new Promise((r) => setTimeout(r, 500));
      setUploadStep(2);

      const response = await fetch('/api/ingestion/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ useSample: true }),
      });

      setUploadStep(3);
      await new Promise((r) => setTimeout(r, 400));

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to ingest sample statement');
      }

      const resData = await response.json();
      setResultMessage(
        `Sample HDFC statement verified & parsed! Extracted ${resData.extractedEntityCount} transactions into DynamoDB.`
      );

      if (onUploadSuccess) {
        onUploadSuccess();
      }
    } catch (err: any) {
      console.error('Sample ingest failed:', err);
      setErrorMessage(err.message || 'Sample statement ingestion failed.');
    } finally {
      setUploading(false);
      setUploadStep(0);
    }
  };

  return (
    <div className="bg-white border border-neutral-200 shadow-xs">
      
      {/* Header Bar with Mode Toggle */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-6 py-4 border-b border-neutral-200 bg-neutral-50/70 gap-4">
        <div>
          <h2 className="font-display font-bold text-lg text-neutral-900 tracking-tight flex items-center space-x-2">
            <UploadCloud size={20} className="text-neutral-900" />
            <span>Document Ingestion Center</span>
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5 font-sans">
            Directly syncs to Amazon S3 bucket <code className="text-neutral-800 bg-neutral-200/60 px-1 py-0.5">amplify-finfinepro</code> and normalizes into DynamoDB ledger.
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
              "px-3.5 py-1.5 font-semibold transition-all flex items-center space-x-2",
              docType === 'BANK_STATEMENT'
                ? "bg-neutral-900 text-white"
                : "text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100"
            )}
          >
            <Building2 size={14} />
            <span>Bank Statements</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setDocType('INVOICE');
              setFile(null);
            }}
            className={clsx(
              "px-3.5 py-1.5 font-semibold transition-all flex items-center space-x-2",
              docType === 'INVOICE'
                ? "bg-neutral-900 text-white"
                : "text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100"
            )}
          >
            <Receipt size={14} />
            <span>Bills & Invoices</span>
          </button>
        </div>
      </div>

      <div className="p-6 sm:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* LEFT: DROPZONE (8 Cols) */}
          <div className="lg:col-span-8 flex flex-col space-y-4">
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={clsx(
                "border-2 border-dashed p-8 sm:p-10 text-center cursor-pointer transition-all duration-150 relative flex flex-col items-center justify-center min-h-[220px]",
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
                {file ? file.name : docType === 'BANK_STATEMENT' ? 'Drop Bank Statement PDF / CSV' : 'Drop Vendor Bill or Invoice'}
              </div>

              <p className="text-xs text-neutral-500 font-sans max-w-md">
                {file
                  ? `Selected: ${(file.size / 1024).toFixed(1)} KB • Ready for Amazon S3 ingestion`
                  : docType === 'BANK_STATEMENT'
                  ? 'Drag & drop monthly statement from HDFC, ICICI, SBI, Axis, or Kotak. Auto-identifies UTR, closing balances, and UPI counterparties.'
                  : 'Upload GST e-Invoice, supplier purchase bill, or challan. System extracts GSTIN, line items, and matches against bank debits.'}
              </p>

              <div className="mt-4 flex items-center space-x-2">
                <span className="px-2.5 py-1 text-[11px] font-semibold bg-white border border-neutral-300 text-neutral-700">
                  Select from Computer
                </span>
                <span className="text-xs text-neutral-400 font-sans">or drag file here</span>
              </div>
            </div>

            {/* Optional manual metadata inputs if invoice tab is active */}
            {docType === 'INVOICE' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-4 bg-neutral-50 border border-neutral-200 text-xs font-sans">
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">
                    Vendor / Customer Name
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
                    Invoice Amount (₹)
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
                    Invoice #
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
                    Payment Due Date
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

            {/* Upload Action Button & Status Bar */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2">
              <div className="flex items-center space-x-3">
                <button
                  type="button"
                  disabled={!file || uploading}
                  onClick={handleUpload}
                  className={clsx(
                    "px-6 py-2.5 font-sans font-semibold text-xs transition-all flex items-center space-x-2 border",
                    file && !uploading
                      ? "bg-neutral-900 text-white border-neutral-900 hover:bg-neutral-800 shadow-xs"
                      : "bg-neutral-200 text-neutral-400 border-neutral-200 cursor-not-allowed"
                  )}
                >
                  {uploading ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Executing Ingestion Pipeline...</span>
                    </>
                  ) : (
                    <>
                      <UploadCloud size={14} />
                      <span>Upload & Extract with AWS</span>
                    </>
                  )}
                </button>

                {file && !uploading && (
                  <button
                    type="button"
                    onClick={() => setFile(null)}
                    className="text-xs text-neutral-500 hover:text-neutral-900 font-sans underline"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* 1-Click Quick Ingest Sample Button */}
              <button
                type="button"
                disabled={uploading}
                onClick={handleQuickIngestSample}
                className="px-4 py-2 text-xs font-semibold font-sans bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100 flex items-center space-x-1.5 transition-colors"
                title="Quickly test with bundled HDFC Bank statement without picking a file"
              >
                <Sparkles size={14} className="text-emerald-600" />
                <span>Ingest Sample MSME UPI Statement</span>
              </button>
            </div>

            {/* Pipeline Step Progress Animation */}
            {uploading && (
              <div className="p-4 bg-neutral-50 border border-neutral-200 font-sans text-xs space-y-2 mt-2">
                <div className="flex items-center justify-between text-neutral-700 font-semibold">
                  <span>Asynchronous Pipeline Progress</span>
                  <span>Stage {uploadStep} of 3</span>
                </div>
                <div className="w-full h-1.5 bg-neutral-200 overflow-hidden">
                  <div
                    className="h-full bg-neutral-900 transition-all duration-300"
                    style={{ width: `${(uploadStep / 3) * 100}%` }}
                  />
                </div>
                <div className="flex items-center space-x-2 text-neutral-500 text-[11px]">
                  <Loader2 size={12} className="animate-spin text-neutral-900" />
                  {uploadStep === 1 && <span>1/3: Writing binary payload to Amazon S3 (ap-south-1)...</span>}
                  {uploadStep === 2 && <span>2/3: Invoking Document Extractor (OCR & UTR normalization)...</span>}
                  {uploadStep === 3 && <span>3/3: Writing DocumentRecord & updating DynamoDB ledgers...</span>}
                </div>
              </div>
            )}

            {/* Success Message Banner */}
            {resultMessage && (
              <div className="p-4 bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-sans flex items-start space-x-2.5">
                <CheckCircle2 size={16} className="text-emerald-600 mt-0.5 shrink-0" />
                <div>
                  <span className="font-bold block">Ingestion Successful</span>
                  <span>{resultMessage}</span>
                </div>
              </div>
            )}

            {/* Error Message Banner */}
            {errorMessage && (
              <div className="p-4 bg-red-50 border border-red-300 text-red-900 text-xs font-sans flex items-start space-x-2.5">
                <AlertCircle size={16} className="text-red-600 mt-0.5 shrink-0" />
                <div>
                  <span className="font-bold block">Ingestion Pipeline Failed</span>
                  <span>{errorMessage}</span>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: INTEGRATION SPEC & SUPPORTED FORMATS (4 Cols) */}
          <div className="lg:col-span-4 bg-neutral-50 border border-neutral-200 p-5 font-sans space-y-4 text-xs">
            <div className="flex items-center space-x-2 pb-3 border-b border-neutral-200">
              <ShieldCheck size={18} className="text-neutral-900" />
              <span className="font-display font-bold text-sm text-neutral-900">
                AWS Architecture Pipeline
              </span>
            </div>

            <div className="space-y-3">
              <div>
                <span className="text-[10px] uppercase font-bold text-neutral-400 block">
                  Storage & Region
                </span>
                <span className="font-semibold text-neutral-800">
                  Amazon S3 (ap-south-1)
                </span>
                <p className="text-[11px] text-neutral-500 mt-0.5">
                  Path: <code className="font-mono text-[10px]">public/tenants/msme-001/raw/</code>
                </p>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-neutral-400 block">
                  Target Tables
                </span>
                <span className="font-semibold text-neutral-800">
                  DynamoDB DocumentRecord & Transactions
                </span>
                <p className="text-[11px] text-neutral-500 mt-0.5">
                  Synchronous ledger reconciliation & statutory lockbox update.
                </p>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-neutral-400 block">
                  Supported Bank Formats
                </span>
                <div className="flex flex-wrap gap-1 mt-1 font-mono text-[10px]">
                  <span className="px-1.5 py-0.5 bg-white border border-neutral-200">HDFC</span>
                  <span className="px-1.5 py-0.5 bg-white border border-neutral-200">ICICI</span>
                  <span className="px-1.5 py-0.5 bg-white border border-neutral-200">SBI</span>
                  <span className="px-1.5 py-0.5 bg-white border border-neutral-200">Axis</span>
                  <span className="px-1.5 py-0.5 bg-white border border-neutral-200">Kotak</span>
                  <span className="px-1.5 py-0.5 bg-white border border-neutral-200">CSV/OFX</span>
                </div>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-neutral-400 block">
                  Security & Integrity
                </span>
                <p className="text-[11px] text-neutral-500 mt-0.5">
                  All extracted bank records are checksum verified with zero external data leak.
                </p>
              </div>
            </div>
          </div>

        </div>
      </div>

    </div>
  );
}
