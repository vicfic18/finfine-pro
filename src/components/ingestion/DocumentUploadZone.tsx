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
  Download,
  ShieldCheck,
  FolderDown,
  ArrowUpRight,
  Info,
} from 'lucide-react';
import clsx from 'clsx';

interface DocumentUploadZoneProps {
  onUploadSuccess?: () => void;
}

interface SampleDocItem {
  id: string;
  fileName: string;
  title: string;
  amount: string;
  category: 'BANK' | 'PAYABLE' | 'RECEIVABLE' | 'STATUTORY' | 'OVERHEAD';
  docType: 'BANK_STATEMENT' | 'INVOICE';
  description: string;
}

const SAMPLE_FILES: SampleDocItem[] = [
  {
    id: 'BANK_STATEMENT',
    fileName: 'sample_upi_bank_statement.pdf',
    title: 'HDFC Current Account Statement',
    amount: '₹1,42,850 Cash Balance',
    category: 'BANK',
    docType: 'BANK_STATEMENT',
    description: 'Current account statement with 9 UPI/NEFT transactions & opening/closing balance reconciliation.',
  },
  {
    id: 'VENDOR_BILL_SHARMA',
    fileName: 'sample_vendor_bill_sharma_textiles.pdf',
    title: 'Sharma Textiles & Fabrics',
    amount: '₹35,000 Bill (2% Discount)',
    category: 'PAYABLE',
    docType: 'INVOICE',
    description: 'Cotton & Linen supplies invoice with Net 15 terms and 2% early cash discount arbitrage.',
  },
  {
    id: 'VENDOR_BILL_AGGARWAL',
    fileName: 'sample_vendor_bill_aggarwal.pdf',
    title: 'Aggarwal Wholesale Mart',
    amount: '₹48,000 Bill (2% Discount)',
    category: 'PAYABLE',
    docType: 'INVOICE',
    description: 'Dyeing & chemical raw materials with Net 20 terms and 2% prompt settlement rebate.',
  },
  {
    id: 'CUSTOMER_INVOICE_APEX',
    fileName: 'sample_customer_invoice_apex_retail.pdf',
    title: 'Apex Retail Mart (Receivable)',
    amount: '₹40,000 Receivable',
    category: 'RECEIVABLE',
    docType: 'INVOICE',
    description: 'Customer sales invoice for ready-to-wear shirts, due 14th Oct. High reliability debtor.',
  },
  {
    id: 'CUSTOMER_INVOICE_CITY',
    fileName: 'sample_customer_invoice_city_fashion.pdf',
    title: 'City Fashion Hub (Receivable)',
    amount: '₹55,000 Receivable',
    category: 'RECEIVABLE',
    docType: 'INVOICE',
    description: 'Festive ethnic collection dispatch invoice, due 19th Oct. Moderate delay pattern.',
  },
  {
    id: 'CUSTOMER_INVOICE_BALAJI',
    fileName: 'sample_customer_invoice_balaji.pdf',
    title: 'Balaji Supermarket (Receivable)',
    amount: '₹28,000 Receivable',
    category: 'RECEIVABLE',
    docType: 'INVOICE',
    description: 'Cotton nightwear batch consignment, due 25th Oct. Reliable prompt payer.',
  },
  {
    id: 'CUSTOMER_INVOICE_ROYAL',
    fileName: 'sample_customer_invoice_royal_traders.pdf',
    title: 'Royal Traders (Overdue Receivable)',
    amount: '₹22,000 Overdue',
    category: 'RECEIVABLE',
    docType: 'INVOICE',
    description: 'Summer collection invoice overdue since 28th Sep. Flags collection risk alert.',
  },
  {
    id: 'TAX_GST',
    fileName: 'sample_statutory_gst_challan.pdf',
    title: 'GST PMT-06 / GSTR-3B Challan',
    amount: '₹42,000 Statutory Due',
    category: 'STATUTORY',
    docType: 'INVOICE',
    description: 'GST tax deposit challan with CPIN 26102700819201 due 20th Oct. Triggers Statutory Lockbox.',
  },
  {
    id: 'TAX_TDS',
    fileName: 'sample_statutory_tds_challan.pdf',
    title: 'Income Tax TDS Challan 281',
    amount: '₹14,500 Statutory Due',
    category: 'STATUTORY',
    docType: 'INVOICE',
    description: 'Section 194C contractor withholding challan due 7th Oct. Lockbox priority protection.',
  },
  {
    id: 'TAX_EPFO',
    fileName: 'sample_statutory_epfo_challan.pdf',
    title: 'EPFO & ESIC ECR Return',
    amount: '₹18,200 Statutory Due',
    category: 'STATUTORY',
    docType: 'INVOICE',
    description: 'Staff social security and provident fund monthly challan due 15th Oct.',
  },
  {
    id: 'OVERHEAD_PAYROLL',
    fileName: 'sample_payroll_salary_sheet.pdf',
    title: 'Store Staff Wages Register',
    amount: '₹65,000 Payroll Due',
    category: 'OVERHEAD',
    docType: 'INVOICE',
    description: '5-staff monthly payroll register due 10th Oct, driving net daily operational burn.',
  },
  {
    id: 'OVERHEAD_RENT',
    fileName: 'sample_rent_receipt.pdf',
    title: 'Shop & Godown Lease Voucher',
    amount: '₹28,000 Rent Due',
    category: 'OVERHEAD',
    docType: 'INVOICE',
    description: 'Commercial shop and godown lease voucher due 10th Oct. Non-deferrable fixed overhead.',
  },
  {
    id: 'OVERHEAD_LOAN_EMI',
    fileName: 'sample_loan_emi_notice.pdf',
    title: 'HDFC MSME Loan EMI Notice',
    amount: '₹16,400 EMI Due',
    category: 'OVERHEAD',
    docType: 'INVOICE',
    description: 'Business equipment loan monthly demand instalment due 12th Oct.',
  },
  {
    id: 'OVERHEAD_BESCOM',
    fileName: 'sample_utility_bill_bescom.pdf',
    title: 'BESCOM Power Demand Bill',
    amount: '₹8,900 Power Due',
    category: 'OVERHEAD',
    docType: 'INVOICE',
    description: 'Commercial electric power consumption demand bill due 18th Oct.',
  },
];

export default function DocumentUploadZone({ onUploadSuccess }: DocumentUploadZoneProps) {
  const [docType, setDocType] = useState<'BANK_STATEMENT' | 'INVOICE'>('BANK_STATEMENT');
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadStep, setUploadStep] = useState<number>(0);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loadingSampleFile, setLoadingSampleFile] = useState<string | null>(null);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('ALL');

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

  // Upload handler: streams genuine PDF to S3, calls document extractor & normalizer
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
        throw new Error(errJson.error || 'Failed to complete document ingestion pipeline');
      }

      const resData = await response.json();
      setResultMessage(
        resData.message ||
          `Successfully processed ${file.name}. Parsed via Document Extractor & normalized to DynamoDB.`
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

  // Customer-side helper: loads an authentic sample PDF directly into browser File state
  const handleLoadSampleIntoDropzone = async (sample: SampleDocItem) => {
    setLoadingSampleFile(sample.id);
    setErrorMessage(null);
    setResultMessage(null);

    try {
      const res = await fetch(`/api/ingestion/sample-files?file=${encodeURIComponent(sample.fileName)}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch sample PDF (${res.statusText})`);
      }
      const blob = await res.blob();
      const loadedFile = new File([blob], sample.fileName, { type: 'application/pdf' });
      setFile(loadedFile);
      setDocType(sample.docType);
      setResultMessage(`Loaded "${sample.title}" (${(loadedFile.size / 1024).toFixed(1)} KB) into upload zone. Click "Upload & Extract with AWS" to execute the pipeline.`);
    } catch (err: any) {
      setErrorMessage(`Could not load sample PDF: ${err.message}`);
    } finally {
      setLoadingSampleFile(null);
    }
  };

  // Ingests sample documents through the pure S3 + Extractor pipeline (Zero DB bypass)
  const handleQuickIngestSample = async (sampleType: string = 'COMPLETE') => {
    setUploading(true);
    setUploadStep(1);
    setErrorMessage(null);
    setResultMessage(null);

    try {
      await new Promise((r) => setTimeout(r, 400));
      setUploadStep(2);

      const response = await fetch('/api/ingestion/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ useSample: true, sampleType }),
      });

      setUploadStep(3);
      await new Promise((r) => setTimeout(r, 300));

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to complete sample document ingestion');
      }

      const resData = await response.json();
      setResultMessage(
        resData.message ||
          `Sample document (${sampleType}) successfully parsed & normalized into DynamoDB ledger.`
      );

      if (onUploadSuccess) {
        onUploadSuccess();
      }
    } catch (err: any) {
      console.error('Sample ingest failed:', err);
      setErrorMessage(err.message || 'Sample ingestion encountered an error.');
    } finally {
      setUploading(false);
      setUploadStep(0);
    }
  };

  const filteredSamples = SAMPLE_FILES.filter((s) => {
    if (activeCategoryFilter === 'ALL') return true;
    return s.category === activeCategoryFilter;
  });

  return (
    <div className="bg-white border border-neutral-200 shadow-xs space-y-0">
      
      {/* 1. Header Bar with Mode Toggle */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-6 py-4 border-b border-neutral-200 bg-neutral-50/70 gap-4">
        <div>
          <h2 className="font-display font-bold text-lg text-neutral-900 tracking-tight flex items-center space-x-2">
            <UploadCloud size={20} className="text-neutral-900" />
            <span>Document Ingestion Center</span>
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5 font-sans">
            Upload PDF documents to Amazon S3. Serverless Lambda extractors parse binary text and normalize directly into DynamoDB.
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

      {/* 2. Main Upload Section */}
      <div className="p-6 sm:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* LEFT: DROPZONE (8 Cols) */}
          <div className="lg:col-span-8 flex flex-col space-y-4">
            
            {/* Zero Direct DB Seed Notice */}
            <div className="flex items-center space-x-2 px-3.5 py-2 bg-neutral-100 border border-neutral-200 text-neutral-700 text-xs font-sans">
              <Info size={14} className="text-neutral-600 shrink-0" />
              <span>
                <strong>Pure PDF Pipeline:</strong> FinFine Pro computes all metrics strictly from extracted PDF text. Direct database writes or mock injections are disabled.
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
                {file ? file.name : docType === 'BANK_STATEMENT' ? 'Drop Bank Statement PDF' : 'Drop Vendor Bill or Invoice PDF'}
              </div>

              <p className="text-xs text-neutral-500 font-sans max-w-md">
                {file
                  ? `Selected: ${(file.size / 1024).toFixed(1)} KB • Ready for S3 upload & Lambda extraction`
                  : docType === 'BANK_STATEMENT'
                  ? 'Drag & drop monthly statement PDF from HDFC, ICICI, SBI, Axis, or Kotak. Auto-identifies UTR, closing balances, and UPI counterparties.'
                  : 'Upload GST e-Invoice, supplier purchase bill, or challan PDF. System extracts GSTIN, line items, and matches against bank debits.'}
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

            {/* Upload Action Button & Suite Ingestion */}
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
                    Clear Selected File
                  </button>
                )}
              </div>

              {/* Complete Suite Batch Ingestion (Strict PDF Ingestion) */}
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => handleQuickIngestSample('COMPLETE')}
                  className="px-4 py-2 text-xs font-bold font-sans bg-emerald-600 text-white hover:bg-emerald-700 flex items-center space-x-1.5 transition-colors shadow-xs cursor-pointer"
                  title="Uploads and extracts all 14 sample MSME PDFs through S3, Extractor, and Normalizer"
                >
                  <Sparkles size={14} className="text-emerald-200" />
                  <span>Ingest Complete MSME Suite (14 PDFs)</span>
                </button>
              </div>
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
                  {uploadStep === 1 && <span>1/3: Uploading PDF binary payload to Amazon S3 (ap-south-1)...</span>}
                  {uploadStep === 2 && <span>2/3: Document Extractor parsing PDF structure & tables with AWS...</span>}
                  {uploadStep === 3 && <span>3/3: Ingestion Normalizer writing canonical ledgers to DynamoDB...</span>}
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

          {/* RIGHT: INTEGRATION SPEC & ARCHITECTURE (4 Cols) */}
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
                  Ledgers populated exclusively through document extraction. Zero artificial seeding.
                </p>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-neutral-400 block">
                  Document Types Supported
                </span>
                <div className="flex flex-wrap gap-1 mt-1 font-mono text-[10px]">
                  <span className="px-1.5 py-0.5 bg-white border border-neutral-200">HDFC / ICICI</span>
                  <span className="px-1.5 py-0.5 bg-white border border-neutral-200">GST PMT-06</span>
                  <span className="px-1.5 py-0.5 bg-white border border-neutral-200">TDS 281</span>
                  <span className="px-1.5 py-0.5 bg-white border border-neutral-200">EPFO ECR</span>
                  <span className="px-1.5 py-0.5 bg-white border border-neutral-200">Vendor Bills</span>
                </div>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-neutral-400 block">
                  Customer-Side Testing
                </span>
                <p className="text-[11px] text-neutral-500 mt-0.5">
                  Download any sample PDF below to your computer, then test manual drag-and-drop ingestion.
                </p>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* 3. Dedicated Customer-Side Sample PDFs Download & Testing Section */}
      <div className="border-t border-neutral-200 bg-neutral-50/60 p-6 sm:p-8 font-sans">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="font-display font-bold text-base text-neutral-900 tracking-tight flex items-center space-x-2">
              <FolderDown size={18} className="text-neutral-900" />
              <span>Customer-Side Testing: Realistic MSME PDF Documents</span>
            </h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              Download these authentic Indian MSME PDF documents to your local computer to test drag-and-drop file upload, or load them directly into the upload dropzone.
            </p>
          </div>

          {/* Category Filter Chips */}
          <div className="flex items-center space-x-1.5 text-xs font-semibold">
            {[
              { id: 'ALL', label: 'All (14)' },
              { id: 'BANK', label: 'Bank Statement' },
              { id: 'PAYABLE', label: 'Vendor Bills' },
              { id: 'RECEIVABLE', label: 'Receivables' },
              { id: 'STATUTORY', label: 'Tax Challans' },
              { id: 'OVERHEAD', label: 'Overheads' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveCategoryFilter(tab.id)}
                className={clsx(
                  "px-2.5 py-1 text-[11px] border transition-colors cursor-pointer",
                  activeCategoryFilter === tab.id
                    ? "bg-neutral-900 text-white border-neutral-900"
                    : "bg-white text-neutral-600 border-neutral-300 hover:border-neutral-900"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Grid of Sample PDF Documents */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredSamples.map((sample) => (
            <div
              key={sample.id}
              className="bg-white border border-neutral-200 p-3.5 hover:border-neutral-400 transition-colors flex flex-col justify-between space-y-3"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <span className="font-display font-bold text-xs text-neutral-900 line-clamp-1">
                    {sample.title}
                  </span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-neutral-100 text-neutral-700 border border-neutral-200 shrink-0">
                    {sample.amount}
                  </span>
                </div>
                <p className="text-[11px] text-neutral-500 mt-1 line-clamp-2 leading-relaxed">
                  {sample.description}
                </p>
                <div className="mt-2 text-[10px] font-mono text-neutral-400 truncate">
                  {sample.fileName}
                </div>
              </div>

              {/* Action Buttons: Download PDF & Load into Dropzone */}
              <div className="flex items-center space-x-2 pt-2 border-t border-neutral-100">
                <a
                  href={`/api/ingestion/sample-files?file=${encodeURIComponent(sample.fileName)}`}
                  download={sample.fileName}
                  className="flex-1 py-1.5 px-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-[11px] font-semibold flex items-center justify-center space-x-1.5 transition-colors border border-neutral-200"
                  title="Download PDF to computer for local testing"
                >
                  <Download size={12} />
                  <span>Download PDF</span>
                </a>

                <button
                  type="button"
                  disabled={uploading || loadingSampleFile === sample.id}
                  onClick={() => handleLoadSampleIntoDropzone(sample)}
                  className="flex-1 py-1.5 px-2 bg-white hover:bg-neutral-100 text-neutral-900 text-[11px] font-semibold flex items-center justify-center space-x-1.5 transition-colors border border-neutral-300"
                  title="Loads this authentic PDF file directly into the dropzone above"
                >
                  {loadingSampleFile === sample.id ? (
                    <Loader2 size={12} className="animate-spin text-neutral-900" />
                  ) : (
                    <ArrowUpRight size={12} />
                  )}
                  <span>Select for Upload</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
