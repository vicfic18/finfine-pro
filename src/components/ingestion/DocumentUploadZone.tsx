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
  Boxes,
  CalendarClock,
  Repeat,
} from 'lucide-react';
import clsx from 'clsx';
import { authenticatedFetch } from '@/lib/authenticated-fetch';

export type UploadCategory =
  | 'BANK_STATEMENT'
  | 'CURRENT_INVENTORY'
  | 'PRODUCT_SALES'
  | 'BILL_PAYABLE'
  | 'OPEN_OBLIGATIONS'
  | 'RECURRING_EXPENSES';

interface DocumentUploadZoneProps {
  onUploadSuccess?: () => void;
  defaultCategory?: UploadCategory;
}

interface CategoryConfig {
  id: UploadCategory;
  canonicalCategory: string;
  docType: 'BANK_STATEMENT' | 'INVOICE' | 'GST_CHALLAN';
  subType?: 'PAYABLE' | 'RECEIVABLE';
  title: string;
  subtitle: string;
  badge: string;
  badgeColor: string;
  icon: React.ElementType;
  iconBg: string;
  examples: string;
  accept: string;
}

const CATEGORY_CONFIGS: Record<UploadCategory, CategoryConfig> = {
  BANK_STATEMENT: {
    id: 'BANK_STATEMENT',
    canonicalCategory: 'BANK_ACTIVITY',
    docType: 'BANK_STATEMENT',
    title: 'Bank Activity & Statements',
    subtitle: 'Statements and account passbooks (90d)',
    badge: 'Banking',
    badgeColor: 'bg-neutral-100 text-neutral-800 border-neutral-300',
    icon: Building2,
    iconBg: 'bg-neutral-900 text-white',
    examples: 'SBI, HDFC, ICICI, Axis, or Kotak monthly statement PDF or passbook export',
    accept: '.pdf,.csv,.ofx',
  },
  CURRENT_INVENTORY: {
    id: 'CURRENT_INVENTORY',
    canonicalCategory: 'CURRENT_INVENTORY',
    docType: 'INVOICE',
    title: 'Current Inventory & Stock',
    subtitle: 'Stock registers and SKU item reports',
    badge: 'Stock',
    badgeColor: 'bg-amber-50 text-amber-800 border-amber-200',
    icon: Boxes,
    iconBg: 'bg-amber-900 text-white',
    examples: 'Warehouse stock count snapshot, ERP inventory register, or SKU valuation report',
    accept: '.pdf,.csv,.xlsx,.xls,.png,.jpg',
  },
  PRODUCT_SALES: {
    id: 'PRODUCT_SALES',
    canonicalCategory: 'PRODUCT_SALES',
    docType: 'INVOICE',
    subType: 'RECEIVABLE',
    title: 'Product Sales & Invoices',
    subtitle: 'Customer billing and sales registers (In)',
    badge: 'Inflow',
    badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    icon: ArrowUpRight,
    iconBg: 'bg-emerald-900 text-white',
    examples: 'Sales tax invoice sent to Apex Retail, POS summary report, or B2B client GST bill',
    accept: '.pdf,.png,.jpg,.jpeg,.csv',
  },
  BILL_PAYABLE: {
    id: 'BILL_PAYABLE',
    canonicalCategory: 'PURCHASES_SUPPLIERS',
    docType: 'INVOICE',
    subType: 'PAYABLE',
    title: 'Purchases & Supplier Bills',
    subtitle: 'Raw material procurement and vendor bills (Out)',
    badge: 'Outflow',
    badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    icon: ArrowDownLeft,
    iconBg: 'bg-indigo-900 text-white',
    examples: 'Raw material purchase bill from Sharma Textiles, packing material invoice, or goods receipt note',
    accept: '.pdf,.png,.jpg,.jpeg,.csv',
  },
  OPEN_OBLIGATIONS: {
    id: 'OPEN_OBLIGATIONS',
    canonicalCategory: 'OPEN_OBLIGATIONS',
    docType: 'INVOICE',
    title: 'Open Obligations & Schedules',
    subtitle: 'Payables, receivables, and due schedules',
    badge: 'Obligations',
    badgeColor: 'bg-rose-50 text-rose-700 border-rose-200',
    icon: CalendarClock,
    iconBg: 'bg-rose-900 text-white',
    examples: 'Loan EMI schedule, advance tax / GST challan assessment, or debtor aging statement',
    accept: '.pdf,.png,.jpg,.jpeg,.csv',
  },
  RECURRING_EXPENSES: {
    id: 'RECURRING_EXPENSES',
    canonicalCategory: 'RECURRING_EXPENSES',
    docType: 'INVOICE',
    subType: 'PAYABLE',
    title: 'Recurring Expenses & Overheads',
    subtitle: 'Rent, payroll, utilities, and subscriptions',
    badge: 'Fixed Cost',
    badgeColor: 'bg-purple-50 text-purple-700 border-purple-200',
    icon: Repeat,
    iconBg: 'bg-purple-900 text-white',
    examples: 'Commercial shop rent agreement, monthly staff payroll sheet, or electricity/broadband bill',
    accept: '.pdf,.png,.jpg,.jpeg,.csv',
  },
};

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

  // Optional manual inputs (available when 1 file is selected)
  const [partyName, setPartyName] = useState<string>('');
  const [docAmount, setDocAmount] = useState<string>('');
  const [docNumber, setDocNumber] = useState<string>('');
  const [docDate, setDocDate] = useState<string>('');
  const [showOptionalFields, setShowOptionalFields] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeConfig = CATEGORY_CONFIGS[category];

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
    setShowOptionalFields(false);
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

      formData.append('documentType', activeConfig.docType);
      formData.append('category', activeConfig.canonicalCategory);
      if (activeConfig.subType) {
        formData.append('subType', activeConfig.subType);
      }

      if (files.length === 1) {
        if (partyName) formData.append('counterpartyName', partyName);
        if (docAmount) formData.append('amount', docAmount);
        if (docNumber) formData.append('invoiceNumber', docNumber);
        if (docDate) formData.append('dueDate', docDate);
      }

      const response = await authenticatedFetch('/api/ingestion/upload', {
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
        
        {/* LEFT COLUMN: Vertical Connected Tabs with 6 Business Upload Categories */}
        <div className="w-full md:w-80 lg:w-96 border-b md:border-b-0 md:border-r border-neutral-200 bg-neutral-50/80 p-4 sm:p-5 flex flex-col justify-between shrink-0 space-y-4">
          <div className="space-y-3">
            <div>
              <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-0.5">
                Step 1: Select Type
              </span>
              <h3 className="font-display font-bold text-sm text-neutral-900">
                Choose Document Category
              </h3>
            </div>

            {/* Vertical Tab Buttons */}
            <div className="flex flex-col space-y-2 relative">
              {Object.values(CATEGORY_CONFIGS).map((cfg) => {
                const isSelected = category === cfg.id;
                const IconComponent = cfg.icon;

                return (
                  <button
                    key={cfg.id}
                    type="button"
                    onClick={() => handleCategoryChange(cfg.id)}
                    className={clsx(
                      "text-left p-3 border transition-all cursor-pointer flex items-center justify-between gap-2 rounded-xs",
                      isSelected
                        ? "bg-white border-neutral-900 text-neutral-900 shadow-sm md:-mr-[21px] md:pr-6 md:border-r-white md:z-10 ring-1 md:ring-0 ring-neutral-900"
                        : "bg-white/70 border-neutral-200 hover:border-neutral-400 hover:bg-white text-neutral-700"
                    )}
                  >
                    <div className="flex items-start space-x-2.5 min-w-0">
                      <div
                        className={clsx(
                          "w-7 h-7 flex items-center justify-center rounded-xs shrink-0 mt-0.5",
                          isSelected ? cfg.iconBg : "bg-neutral-200/80 text-neutral-700"
                        )}
                      >
                        <IconComponent size={15} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center space-x-1.5 flex-wrap">
                          <span className="font-bold text-xs sm:text-sm text-neutral-900 block leading-tight truncate">
                            {cfg.title}
                          </span>
                          <span className={clsx("text-[9px] font-bold uppercase px-1 py-0.2 border", cfg.badgeColor)}>
                            {cfg.badge}
                          </span>
                        </div>
                        <span className="text-[10.5px] text-neutral-500 font-sans block mt-0.5 leading-tight truncate">
                          {cfg.subtitle}
                        </span>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center">
                      {isSelected ? (
                        <ChevronRight size={15} className="text-neutral-900 hidden md:block" />
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Reassurance note at bottom of left column */}
          <div className="p-3 bg-white border border-neutral-200 text-[11px] text-neutral-500 font-sans space-y-1">
            <div className="flex items-center space-x-1.5 font-bold text-neutral-800">
              <Sparkles size={12} className="text-neutral-700" />
              <span>Multi-Source Pipeline</span>
            </div>
            <p className="text-[10.5px] leading-relaxed text-neutral-500">
              Upload bank accounts, inventory registers, or vendor invoices. Amounts, SKUs, and dates are auto-extracted.
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
                  Step 2: Upload Files • {activeConfig.badge}
                </span>
                <h3 className="font-display font-bold text-lg text-neutral-900">
                  {activeConfig.title}
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
                <span className="font-semibold text-amber-950">Target Documents: </span>
                <span className="text-amber-900">{activeConfig.examples}</span>
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
              accept={activeConfig.accept}
              onChange={handleFileChange}
              className="hidden"
            />

            <div className="w-11 h-11 bg-white border border-neutral-300 flex items-center justify-center text-neutral-700 shadow-xs mb-2.5">
              {files.length > 1 ? (
                <Files size={22} className="text-neutral-900" />
              ) : (
                <activeConfig.icon size={22} className="text-neutral-900" />
              )}
            </div>

            <div className="font-display font-bold text-base sm:text-lg text-neutral-900 mb-0.5">
              {files.length === 1 ? (
                <span className="text-neutral-900">{files[0].name}</span>
              ) : files.length > 1 ? (
                <span className="text-neutral-900">
                  {files.length} files selected ({totalSizeFormatted})
                </span>
              ) : (
                `Drop your ${activeConfig.title} here`
              )}
            </div>

            <p className="text-xs text-neutral-500 font-sans max-w-md">
              {files.length > 0
                ? `${t('ingestion.selectedPrefix', 'Selected:')} ${files.length} ${files.length === 1 ? 'file' : 'files'} (${totalSizeFormatted}) • Ready to scan • Drag more files to add`
                : 'Supports PDF, photos (JPG, PNG), CSV, or Excel up to 25MB each'}
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
                    {files.length} {files.length === 1 ? 'File' : 'Files'} queued for {activeConfig.badge}
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
                    AI will automatically read line items, SKUs, amounts, due dates, and entity references from each of the {files.length} files individually.
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
                          {category === 'CURRENT_INVENTORY'
                            ? 'SKU / Product Name'
                            : category === 'BILL_PAYABLE'
                            ? 'Supplier / Vendor Name'
                            : category === 'PRODUCT_SALES'
                            ? 'Customer / Client Name'
                            : category === 'RECURRING_EXPENSES'
                            ? 'Expense Name / Landlord'
                            : 'Counterparty / Title'}
                        </label>
                        <input
                          type="text"
                          value={partyName}
                          onChange={(e) => setPartyName(e.target.value)}
                          placeholder={
                            category === 'CURRENT_INVENTORY'
                              ? 'e.g. Cotton Yarn 40s (100kg)'
                              : category === 'BILL_PAYABLE'
                              ? 'e.g. Sharma Textiles'
                              : category === 'RECURRING_EXPENSES'
                              ? 'e.g. Shop Rent / BESCOM'
                              : 'e.g. Apex Retail'
                          }
                          className="w-full bg-white border border-neutral-300 p-2 text-xs focus:outline-neutral-900"
                        />
                      </div>

                      <div>
                        <label className="block font-semibold text-neutral-700 mb-1">
                          {category === 'CURRENT_INVENTORY' ? 'Inventory Valuation (₹)' : 'Amount (₹)'}
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
                          {category === 'CURRENT_INVENTORY' ? 'Stock Batch / Register #' : 'Bill / Invoice #'}
                        </label>
                        <input
                          type="text"
                          value={docNumber}
                          onChange={(e) => setDocNumber(e.target.value)}
                          placeholder={category === 'CURRENT_INVENTORY' ? 'STK-2026-09' : 'INV-8821'}
                          className="w-full bg-white border border-neutral-300 p-2 text-xs focus:outline-neutral-900 font-mono"
                        />
                      </div>

                      <div>
                        <label className="block font-semibold text-neutral-700 mb-1">
                          {category === 'BILL_PAYABLE'
                            ? 'Payment Due Date'
                            : category === 'CURRENT_INVENTORY'
                            ? 'Snapshot Date'
                            : 'Date / Due Date'}
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
                      ? `Reading ${files.length} Documents...`
                      : 'Reading Document...'}
                  </span>
                </>
              ) : (
                <>
                  {files.length > 1 ? <Files size={14} /> : <UploadCloud size={14} />}
                  <span>
                    {files.length > 1
                      ? `Scan & Save ${files.length} Documents`
                      : `Scan & Save ${activeConfig.badge}`}
                  </span>
                </>
              )}
            </button>

            <div className="flex items-center space-x-1.5 text-[11px] text-neutral-500 font-sans">
              <Lock size={12} className="text-neutral-400 shrink-0" />
              <span>100% Private & Safe: Encrypted AES-256 storage and deterministic extraction.</span>
            </div>
          </div>

          {/* Progress Indicator */}
          {uploading && (
            <div className="p-4 bg-neutral-50 border border-neutral-200 font-sans text-xs space-y-2">
              <div className="flex items-center justify-between text-neutral-800 font-semibold">
                <span>
                  {files.length > 1
                    ? `Processing ${files.length} Documents (${activeConfig.title})`
                    : `Processing ${activeConfig.title}`}
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
                      ? `1/3: Uploading ${files.length} files securely to S3...`
                      : '1/3: Uploading file safely to S3...'}
                  </span>
                )}
                {uploadStep === 2 && (
                  <span>
                    {files.length > 1
                      ? `2/3: Reading line items, amounts, and dates across ${files.length} documents...`
                      : '2/3: Reading line items, amounts, and metadata...'}
                  </span>
                )}
                {uploadStep === 3 && (
                  <span>
                    3/3: Updating cash balance, inventory balances, and forecast...
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
