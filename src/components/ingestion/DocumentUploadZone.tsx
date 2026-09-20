'use client';

import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  UploadCloud,
  FileSpreadsheet,
  Receipt,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Building2,
  Lock,
  Sparkles,
  X,
  FileText,
  Lightbulb,
  ChevronRight,
  Files,
  Plus,
  Trash2,
} from 'lucide-react';
import clsx from 'clsx';

export type UploadCategory = 'BANK_STATEMENT' | 'BILL_PAYABLE' | 'INVOICE_RECEIVABLE';

interface DocumentUploadZoneProps {
  onUploadSuccess?: () => void;
  defaultCategory?: UploadCategory;
}

export default function DocumentUploadZone({
  onUploadSuccess,
  defaultCategory = 'BANK_STATEMENT',
}: DocumentUploadZoneProps) {
  const { t } = useTranslation();
  const [category, setCategory] = useState<UploadCategory>(defaultCategory);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadStep, setUploadStep] = useState<number>(0);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Optional manual inputs for Bills/Invoices (available when 1 file is selected)
  const [partyName, setPartyName] = useState<string>('');
  const [docAmount, setDocAmount] = useState<string>('');
  const [docNumber, setDocNumber] = useState<string>('');
  const [docDate, setDocDate] = useState<string>('');
  const [showOptionalFields, setShowOptionalFields] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = (newFilesList: FileList | File[]) => {
    const incoming = Array.from(newFilesList);
    if (incoming.length === 0) return;

    setFiles((prev) => {
      const existingKeys = new Set(prev.map((f) => `${f.name}_${f.size}`));
      const nonDuplicates = incoming.filter((f) => !existingKeys.has(`${f.name}_${f.size}`));
      return [...prev, ...nonDuplicates];
    });
    setResultMessage(null);
    setErrorMessage(null);
  };

  const removeFile = (indexToRemove: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== indexToRemove));
  };

  const clearAllFiles = () => {
    setFiles([]);
    setResultMessage(null);
    setErrorMessage(null);
  };

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
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
    }
    // Reset so selecting the same file again triggers change
    if (e.target) e.target.value = '';
  };

  const handleCategoryChange = (newCat: UploadCategory) => {
    setCategory(newCat);
    setFiles([]);
    setResultMessage(null);
    setErrorMessage(null);
    setPartyName('');
    setDocAmount('');
    setDocNumber('');
    setDocDate('');
  };

  const totalSizeKB = (
    files.reduce((acc, f) => acc + f.size, 0) / 1024
  ).toFixed(1);

  const totalSizeFormatted =
    parseFloat(totalSizeKB) > 1024
      ? `${(parseFloat(totalSizeKB) / 1024).toFixed(2)} MB`
      : `${totalSizeKB} KB`;

  // Upload handler
  const handleUpload = async () => {
    if (files.length === 0) return;

    setUploading(true);
    setUploadStep(1);
    setErrorMessage(null);
    setResultMessage(null);

    try {
      await new Promise((r) => setTimeout(r, 400));
      setUploadStep(2);

      const formData = new FormData();
      files.forEach((f) => {
        formData.append('files', f);
      });

      if (category === 'BANK_STATEMENT') {
        formData.append('documentType', 'BANK_STATEMENT');
      } else if (category === 'BILL_PAYABLE') {
        formData.append('documentType', 'INVOICE');
        formData.append('subType', 'PAYABLE');
        if (files.length === 1) {
          if (partyName) formData.append('counterpartyName', partyName);
          if (docAmount) formData.append('amount', docAmount);
          if (docNumber) formData.append('invoiceNumber', docNumber);
          if (docDate) formData.append('dueDate', docDate);
        }
      } else {
        formData.append('documentType', 'INVOICE');
        formData.append('subType', 'RECEIVABLE');
        if (files.length === 1) {
          if (partyName) formData.append('counterpartyName', partyName);
          if (docAmount) formData.append('amount', docAmount);
          if (docNumber) formData.append('invoiceNumber', docNumber);
          if (docDate) formData.append('dueDate', docDate);
        }
      }

      const response = await fetch('/api/ingestion/upload', {
        method: 'POST',
        body: formData,
      });

      setUploadStep(3);
      await new Promise((r) => setTimeout(r, 350));

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || errJson.details || 'Failed to process document');
      }

      const resData = await response.json();
      setResultMessage(
        resData.message ||
          (files.length === 1
            ? `Successfully saved ${files[0].name}. Your records and cash flow have been updated.`
            : `Successfully processed ${files.length} documents. Your records and cash flow have been updated.`)
      );
      setFiles([]);
      setPartyName('');
      setDocAmount('');
      setDocNumber('');
      setDocDate('');
      setShowOptionalFields(false);

      if (onUploadSuccess) {
        onUploadSuccess();
      }
    } catch (err: any) {
      console.error('Upload failed:', err);
      setErrorMessage(err.message || 'Could not process document. Please try again or check the file.');
    } finally {
      setUploading(false);
      setUploadStep(0);
    }
  };

  return (
    <div className="bg-white border border-neutral-200 shadow-xs overflow-hidden">
      
      <div className="flex flex-col md:flex-row">
        
        {/* LEFT COLUMN: Vertical Connected Tabs */}
        <div className="w-full md:w-72 lg:w-80 border-b md:border-b-0 md:border-r border-neutral-200 bg-neutral-50/80 p-4 sm:p-5 flex flex-col justify-between shrink-0 space-y-4">
          
          <div className="space-y-3">
            <div>
              <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-0.5">
                Step 1: Select Type
              </span>
              <h3 className="font-display font-bold text-sm text-neutral-900">
                Choose what to add
              </h3>
            </div>

            {/* Vertical Connected Tab Buttons */}
            <div className="flex flex-col space-y-2 relative">
              
              {/* Tab 1: Bank Statement */}
              <button
                type="button"
                onClick={() => handleCategoryChange('BANK_STATEMENT')}
                className={clsx(
                  "text-left p-3.5 border transition-all cursor-pointer flex items-center justify-between gap-2",
                  category === 'BANK_STATEMENT'
                    ? "bg-white border-neutral-900 text-neutral-900 shadow-sm md:-mr-[21px] md:pr-6 md:border-r-white md:z-10 ring-1 md:ring-0 ring-neutral-900"
                    : "bg-white/70 border-neutral-200 hover:border-neutral-400 hover:bg-white text-neutral-700"
                )}
              >
                <div className="flex items-start space-x-2.5">
                  <div
                    className={clsx(
                      "w-7 h-7 flex items-center justify-center rounded-sm shrink-0 mt-0.5",
                      category === 'BANK_STATEMENT' ? "bg-neutral-900 text-white" : "bg-neutral-200/80 text-neutral-700"
                    )}
                  >
                    <Building2 size={15} />
                  </div>
                  <div>
                    <span className="font-bold text-xs sm:text-sm text-neutral-900 block leading-tight">
                      {t('ingestion.tabBankStatements', 'Bank Statement')}
                    </span>
                    <span className="text-[11px] text-neutral-500 font-sans block mt-0.5 leading-tight">
                      Account passbook / PDF
                    </span>
                  </div>
                </div>

                <div className="shrink-0 flex items-center">
                  {category === 'BANK_STATEMENT' ? (
                    <ChevronRight size={15} className="text-neutral-900 hidden md:block" />
                  ) : null}
                </div>
              </button>

              {/* Tab 2: Bill to Pay (Expense) */}
              <button
                type="button"
                onClick={() => handleCategoryChange('BILL_PAYABLE')}
                className={clsx(
                  "text-left p-3.5 border transition-all cursor-pointer flex items-center justify-between gap-2",
                  category === 'BILL_PAYABLE'
                    ? "bg-white border-neutral-900 text-neutral-900 shadow-sm md:-mr-[21px] md:pr-6 md:border-r-white md:z-10 ring-1 md:ring-0 ring-neutral-900"
                    : "bg-white/70 border-neutral-200 hover:border-neutral-400 hover:bg-white text-neutral-700"
                )}
              >
                <div className="flex items-start space-x-2.5">
                  <div
                    className={clsx(
                      "w-7 h-7 flex items-center justify-center rounded-sm shrink-0 mt-0.5",
                      category === 'BILL_PAYABLE' ? "bg-indigo-900 text-white" : "bg-indigo-50 text-indigo-700"
                    )}
                  >
                    <ArrowDownLeft size={15} />
                  </div>
                  <div>
                    <div className="flex items-center space-x-1.5">
                      <span className="font-bold text-xs sm:text-sm text-neutral-900 block leading-tight">
                        {t('ingestion.tabBillsPayable', 'Bill to Pay')}
                      </span>
                      <span className="text-[9px] font-bold uppercase px-1 py-0.2 bg-indigo-50 text-indigo-700 border border-indigo-200">
                        Out
                      </span>
                    </div>
                    <span className="text-[11px] text-neutral-500 font-sans block mt-0.5 leading-tight">
                      Suppliers, rent, utilities
                    </span>
                  </div>
                </div>

                <div className="shrink-0 flex items-center">
                  {category === 'BILL_PAYABLE' ? (
                    <ChevronRight size={15} className="text-neutral-900 hidden md:block" />
                  ) : null}
                </div>
              </button>

              {/* Tab 3: Sales Invoice (Income) */}
              <button
                type="button"
                onClick={() => handleCategoryChange('INVOICE_RECEIVABLE')}
                className={clsx(
                  "text-left p-3.5 border transition-all cursor-pointer flex items-center justify-between gap-2",
                  category === 'INVOICE_RECEIVABLE'
                    ? "bg-white border-neutral-900 text-neutral-900 shadow-sm md:-mr-[21px] md:pr-6 md:border-r-white md:z-10 ring-1 md:ring-0 ring-neutral-900"
                    : "bg-white/70 border-neutral-200 hover:border-neutral-400 hover:bg-white text-neutral-700"
                )}
              >
                <div className="flex items-start space-x-2.5">
                  <div
                    className={clsx(
                      "w-7 h-7 flex items-center justify-center rounded-sm shrink-0 mt-0.5",
                      category === 'INVOICE_RECEIVABLE' ? "bg-emerald-900 text-white" : "bg-emerald-50 text-emerald-700"
                    )}
                  >
                    <ArrowUpRight size={15} />
                  </div>
                  <div>
                    <div className="flex items-center space-x-1.5">
                      <span className="font-bold text-xs sm:text-sm text-neutral-900 block leading-tight">
                        {t('ingestion.tabInvoicesReceivable', 'Sales Invoice')}
                      </span>
                      <span className="text-[9px] font-bold uppercase px-1 py-0.2 bg-emerald-50 text-emerald-700 border border-emerald-200">
                        In
                      </span>
                    </div>
                    <span className="text-[11px] text-neutral-500 font-sans block mt-0.5 leading-tight">
                      Customer invoices & sales
                    </span>
                  </div>
                </div>

                <div className="shrink-0 flex items-center">
                  {category === 'INVOICE_RECEIVABLE' ? (
                    <ChevronRight size={15} className="text-neutral-900 hidden md:block" />
                  ) : null}
                </div>
              </button>

            </div>
          </div>

          {/* Reassurance note at bottom of left column */}
          <div className="p-3 bg-white border border-neutral-200 text-[11px] text-neutral-500 font-sans space-y-1">
            <div className="flex items-center space-x-1.5 font-bold text-neutral-800">
              <Sparkles size={12} className="text-neutral-700" />
              <span>Automatic Data Reading</span>
            </div>
            <p className="text-[10.5px] leading-relaxed text-neutral-500">
              Upload any clear PDF or scan. Amounts, due dates, and parties are detected automatically.
            </p>
          </div>

        </div>

        {/* RIGHT COLUMN: Connected Main Upload Zone & Form */}
        <div className="flex-1 bg-white p-5 sm:p-7 flex flex-col justify-between space-y-4">
          
          {/* Header of Active Mode with Examples */}
          <div className="space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <div>
                <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-0.5">
                  Step 2: Upload Files
                </span>
                <h3 className="font-display font-bold text-lg text-neutral-900">
                  {category === 'BANK_STATEMENT' && 'Upload Bank Statements'}
                  {category === 'BILL_PAYABLE' && 'Upload Supplier Bills or Expenses'}
                  {category === 'INVOICE_RECEIVABLE' && 'Upload Customer Sales Invoices'}
                </h3>
              </div>

              <span className="text-xs font-mono text-neutral-400">
                PDF, JPG, PNG, CSV • Bulk Multi-File
              </span>
            </div>

            {/* Examples Pill Bar */}
            <div className="flex items-start space-x-2 px-3 py-2 bg-amber-50/80 border border-amber-200 text-amber-900 text-xs font-sans">
              <Lightbulb size={14} className="text-amber-700 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-amber-950">Example files to upload: </span>
                <span className="text-amber-900">
                  {category === 'BANK_STATEMENT' && t('ingestion.bankExamples', 'SBI, HDFC, ICICI, Axis, or Kotak monthly statement PDF or passbook export')}
                  {category === 'BILL_PAYABLE' && t('ingestion.payableExamples', 'Raw material bill from Sharma Textiles, shop rent receipt, or electricity bill')}
                  {category === 'INVOICE_RECEIVABLE' && t('ingestion.receivableExamples', 'Sales tax invoice sent to Apex Retail, client service bill, or GST bill')}
                </span>
              </div>
            </div>
          </div>

          {/* Dropzone Box */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={clsx(
              "border-2 border-dashed p-6 sm:p-7 text-center cursor-pointer transition-all duration-150 flex flex-col items-center justify-center min-h-[150px]",
              isDragging
                ? "border-neutral-900 bg-neutral-100 scale-[0.99]"
                : "border-neutral-300 hover:border-neutral-900 bg-neutral-50/50 hover:bg-neutral-50"
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={category === 'BANK_STATEMENT' ? '.pdf,.csv,.ofx' : '.pdf,.png,.jpg,.jpeg,.csv'}
              onChange={handleFileChange}
              className="hidden"
            />

            <div className="w-11 h-11 bg-white border border-neutral-300 flex items-center justify-center text-neutral-700 shadow-xs mb-2.5">
              {files.length > 1 ? (
                <Files size={22} className="text-neutral-900" />
              ) : category === 'BANK_STATEMENT' ? (
                <FileSpreadsheet size={22} className="text-neutral-900" />
              ) : category === 'BILL_PAYABLE' ? (
                <Receipt size={22} className="text-indigo-900" />
              ) : (
                <FileText size={22} className="text-emerald-900" />
              )}
            </div>

            <div className="font-display font-bold text-base sm:text-lg text-neutral-900 mb-0.5">
              {files.length === 1 ? (
                <span className="text-neutral-900">{files[0].name}</span>
              ) : files.length > 1 ? (
                <span className="text-neutral-900">
                  {files.length} files selected ({totalSizeFormatted})
                </span>
              ) : category === 'BANK_STATEMENT' ? (
                t('ingestion.dropBankStatement', 'Drop your Bank Statement PDF(s) here')
              ) : category === 'BILL_PAYABLE' ? (
                t('ingestion.dropPayable', 'Drop your Supplier Bill(s) or Expense PDF(s) here')
              ) : (
                t('ingestion.dropReceivable', 'Drop your Customer Sales Invoice PDF(s) here')
              )}
            </div>

            <p className="text-xs text-neutral-500 font-sans max-w-md">
              {files.length > 0
                ? `${t('ingestion.selectedPrefix', 'Selected:')} ${files.length} ${files.length === 1 ? 'file' : 'files'} (${totalSizeFormatted}) • ${t('ingestion.readyToProcess', 'Ready to scan')} • Drag more files to add`
                : t('ingestion.fileSupportHint', 'Supports multiple PDFs, photos (JPG, PNG), or CSVs up to 25MB each')}
            </p>

            <div className="mt-3 flex items-center space-x-2">
              <span className="px-3 py-1 text-xs font-semibold bg-white border border-neutral-300 text-neutral-800 shadow-2xs hover:bg-neutral-100 flex items-center space-x-1.5">
                {files.length > 0 ? (
                  <>
                    <Plus size={13} />
                    <span>{t('ingestion.addMoreFiles', 'Add More Files')}</span>
                  </>
                ) : (
                  <span>{t('ingestion.selectFromComputer', 'Choose Files from Computer')}</span>
                )}
              </span>
              <span className="text-xs text-neutral-400 font-sans">
                {t('ingestion.orDragFile', 'or drag & drop files here')}
              </span>
            </div>
          </div>

          {/* Selected Files List Deck */}
          {files.length > 0 && (
            <div className="border border-neutral-200 bg-neutral-50/70 p-3 space-y-2">
              <div className="flex items-center justify-between text-xs font-sans">
                <div className="flex items-center space-x-2">
                  <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                  <span className="font-bold text-neutral-900">
                    {files.length} {files.length === 1 ? 'File' : 'Files'} queued for ingestion
                  </span>
                  <span className="text-neutral-500 font-mono text-[11px]">
                    ({totalSizeFormatted})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={clearAllFiles}
                  className="text-neutral-500 hover:text-red-600 flex items-center space-x-1 font-semibold text-[11px] cursor-pointer"
                >
                  <Trash2 size={13} />
                  <span>{t('ingestion.clearAllFiles', 'Clear All')}</span>
                </button>
              </div>

              {/* Scrollable multi-file list */}
              <div className="max-h-40 overflow-y-auto space-y-1.5 pr-0.5">
                {files.map((f, idx) => (
                  <div
                    key={`${f.name}_${f.size}_${idx}`}
                    className="p-2 bg-white border border-neutral-200 flex items-center justify-between text-xs font-sans rounded-xs hover:border-neutral-300 transition-colors"
                  >
                    <div className="flex items-center space-x-2 min-w-0 pr-2">
                      <span className="w-5 h-5 bg-neutral-100 border border-neutral-200 text-neutral-700 flex items-center justify-center text-[10px] font-mono shrink-0">
                        {idx + 1}
                      </span>
                      <span
                        className="font-medium text-neutral-900 truncate max-w-[200px] sm:max-w-xs md:max-w-sm"
                        title={f.name}
                      >
                        {f.name}
                      </span>
                      <span className="text-neutral-400 font-mono text-[10px] shrink-0">
                        ({(f.size / 1024).toFixed(1)} KB)
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile(idx);
                      }}
                      className="p-1 text-neutral-400 hover:text-red-600 hover:bg-neutral-100 rounded-xs cursor-pointer transition-colors shrink-0"
                      title="Remove file"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bulk Mode Notification vs Single File Quick Details */}
          {category !== 'BANK_STATEMENT' && (
            <>
              {files.length > 1 ? (
                <div className="p-3 bg-neutral-50 border border-neutral-200 text-xs font-sans flex items-start space-x-2 text-neutral-600">
                  <Sparkles size={14} className="text-neutral-700 shrink-0 mt-0.5" />
                  <p className="text-[11px] leading-relaxed">
                    <strong className="text-neutral-900 font-semibold">Bulk processing mode active: </strong>
                    AI will automatically read amounts, due dates, supplier/customer names, and GST numbers from each of the {files.length} files individually.
                  </p>
                </div>
              ) : (
                <div className="border border-neutral-200 bg-neutral-50/50 p-3.5 font-sans text-xs">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-neutral-800 flex items-center space-x-1.5">
                      <Sparkles size={13} className="text-neutral-600" />
                      <span>{t('ingestion.optionalDetails', 'Quick Details (Optional — AI will also read these from the file)')}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowOptionalFields(!showOptionalFields)}
                      className="text-[11px] font-semibold text-neutral-600 hover:text-neutral-900 underline cursor-pointer"
                    >
                      {showOptionalFields ? 'Hide details' : 'Add manual details'}
                    </button>
                  </div>

                  {showOptionalFields && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2.5 border-t border-neutral-200">
                      <div>
                        <label className="block font-semibold text-neutral-700 mb-1">
                          {category === 'BILL_PAYABLE'
                            ? t('ingestion.vendorLabel', 'Supplier / Vendor Name')
                            : t('ingestion.customerLabel', 'Customer / Client Name')}
                        </label>
                        <input
                          type="text"
                          value={partyName}
                          onChange={(e) => setPartyName(e.target.value)}
                          placeholder={category === 'BILL_PAYABLE' ? 'e.g. Sharma Textiles' : 'e.g. Apex Retail'}
                          className="w-full bg-white border border-neutral-300 p-2 text-xs focus:outline-neutral-900"
                        />
                      </div>

                      <div>
                        <label className="block font-semibold text-neutral-700 mb-1">
                          {t('ingestion.amountLabel', 'Amount (₹)')}
                        </label>
                        <input
                          type="number"
                          value={docAmount}
                          onChange={(e) => setDocAmount(e.target.value)}
                          placeholder="35000"
                          className="w-full bg-white border border-neutral-300 p-2 text-xs focus:outline-neutral-900 font-mono"
                        />
                      </div>

                      <div>
                        <label className="block font-semibold text-neutral-700 mb-1">
                          {t('ingestion.invoiceNumLabel', 'Bill / Invoice #')}
                        </label>
                        <input
                          type="text"
                          value={docNumber}
                          onChange={(e) => setDocNumber(e.target.value)}
                          placeholder="INV-8821"
                          className="w-full bg-white border border-neutral-300 p-2 text-xs focus:outline-neutral-900 font-mono"
                        />
                      </div>

                      <div>
                        <label className="block font-semibold text-neutral-700 mb-1">
                          {category === 'BILL_PAYABLE'
                            ? t('ingestion.dueDateLabel', 'Payment Due Date')
                            : t('ingestion.expectedDateLabel', 'Expected Payment Date')}
                        </label>
                        <input
                          type="date"
                          value={docDate}
                          onChange={(e) => setDocDate(e.target.value)}
                          className="w-full bg-white border border-neutral-300 p-2 text-xs focus:outline-neutral-900"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Action Button & Reassurance */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-1 border-t border-neutral-100">
            <button
              type="button"
              disabled={files.length === 0 || uploading}
              onClick={handleUpload}
              className={clsx(
                "px-6 py-2.5 font-sans font-semibold text-xs transition-all flex items-center space-x-2 border",
                files.length > 0 && !uploading
                  ? "bg-neutral-900 text-white border-neutral-900 hover:bg-neutral-800 shadow-xs cursor-pointer"
                  : "bg-neutral-200 text-neutral-400 border-neutral-200 cursor-not-allowed"
              )}
            >
              {uploading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>
                    {files.length > 1
                      ? t('ingestion.processingDocumentBtnBulk', `Reading ${files.length} Documents...`, { count: files.length })
                      : t('ingestion.processingDocumentBtn', 'Reading Document...')}
                  </span>
                </>
              ) : (
                <>
                  {files.length > 1 ? <Files size={14} /> : <UploadCloud size={14} />}
                  <span>
                    {files.length > 1
                      ? t('ingestion.uploadAndProcessBtnBulk', `Scan & Save ${files.length} Documents`, { count: files.length })
                      : t('ingestion.uploadAndProcessBtn', 'Scan & Save Document')}
                  </span>
                </>
              )}
            </button>

            <div className="flex items-center space-x-1.5 text-[11px] text-neutral-500 font-sans">
              <Lock size={12} className="text-neutral-400 shrink-0" />
              <span>{t('ingestion.privacyNote', '100% Private & Safe: Your documents are processed securely and never shared.')}</span>
            </div>
          </div>

          {/* Progress Indicator */}
          {uploading && (
            <div className="p-4 bg-neutral-50 border border-neutral-200 font-sans text-xs space-y-2">
              <div className="flex items-center justify-between text-neutral-800 font-semibold">
                <span>
                  {files.length > 1
                    ? `Processing ${files.length} Documents in Bulk`
                    : t('ingestion.processingProgress', 'Processing Document')}
                </span>
                <span>{t('ingestion.stepOf', { current: uploadStep, total: 3 })}</span>
              </div>
              <div className="w-full h-1.5 bg-neutral-200 overflow-hidden">
                <div
                  className="h-full bg-neutral-900 transition-all duration-300"
                  style={{ width: `${(uploadStep / 3) * 100}%` }}
                />
              </div>
              <div className="flex items-center space-x-2 text-neutral-600 text-[11px]">
                <Loader2 size={12} className="animate-spin text-neutral-900 shrink-0" />
                {uploadStep === 1 && (
                  <span>
                    {files.length > 1
                      ? `1/3: Uploading ${files.length} files securely...`
                      : t('ingestion.step1', '1/3: Uploading file safely...')}
                  </span>
                )}
                {uploadStep === 2 && (
                  <span>
                    {files.length > 1
                      ? `2/3: Reading amounts, dates, and party details across ${files.length} documents...`
                      : t('ingestion.step2', '2/3: Reading amounts, dates, and party details...')}
                  </span>
                )}
                {uploadStep === 3 && (
                  <span>
                    {t('ingestion.step3', '3/3: Updating your cash balance and records...')}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Success Message */}
          {resultMessage && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-sans flex items-start space-x-2.5">
              <CheckCircle2 size={16} className="text-emerald-600 mt-0.5 shrink-0" />
              <div>
                <span className="font-bold block">{t('ingestion.uploadSuccess', 'Document Saved Successfully')}</span>
                <span>{resultMessage}</span>
              </div>
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div className="p-3.5 bg-red-50 border border-red-300 text-red-900 text-xs font-sans flex items-start space-x-2.5">
              <AlertCircle size={16} className="text-red-600 mt-0.5 shrink-0" />
              <div>
                <span className="font-bold block">{t('ingestion.processingError', 'Could not process document')}</span>
                <span>{errorMessage}</span>
              </div>
            </div>
          )}

        </div>

      </div>

    </div>
  );
}
