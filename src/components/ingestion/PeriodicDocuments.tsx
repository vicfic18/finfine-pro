'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, FileText, Loader2, RefreshCw, UploadCloud } from 'lucide-react';
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import PdfDropzone from '@/components/onboarding/PdfDropzone';
import DocumentReview from '@/components/onboarding/DocumentReview';
import type { OnboardingDocument, UploadPurpose } from '@/components/onboarding/types';

const categories: Array<{ purpose: UploadPurpose; title: string; description: string }> = [
  { purpose: 'BANK_ACTIVITY', title: 'Bank activity', description: 'Statements and account activity for the trailing 90 days.' },
  { purpose: 'PRODUCT_SALES', title: 'Product sales', description: 'Product-level sales reports and period summaries.' },
  { purpose: 'CURRENT_INVENTORY', title: 'Current inventory', description: 'Your latest stock snapshot or inventory register.' },
  { purpose: 'PURCHASES', title: 'Purchases & suppliers', description: 'Purchase registers and supplier statements.' },
  { purpose: 'OPEN_OBLIGATIONS', title: 'Open obligations', description: 'Current payables, receivables, and due schedules.' },
  { purpose: 'RECURRING_EXPENSES', title: 'Recurring expenses', description: 'Current evidence for rent, payroll, utilities, and other recurring costs.' },
];

const purposeCategories: Record<UploadPurpose, string> = {
  BANK_ACTIVITY: 'BANK_ACTIVITY',
  PRODUCT_SALES: 'PRODUCT_SALES',
  CURRENT_INVENTORY: 'CURRENT_INVENTORY',
  PURCHASES: 'PURCHASES_SUPPLIERS',
  OPEN_OBLIGATIONS: 'OPEN_OBLIGATIONS',
  RECURRING_EXPENSES: 'RECURRING_EXPENSES',
};

function statusLabel(status?: string) {
  switch (status) {
    case 'EXTRACTED':
    case 'READY': return 'Ready';
    case 'FAILED': return 'Needs review';
    case 'PROCESSING': return 'Processing';
    default: return 'Queued';
  }
}

function periodLabel(document: OnboardingDocument) {
  const period = document.reportingPeriod;
  const start = document.reportingStartDate || period?.startDate;
  const end = document.reportingEndDate || period?.endDate;
  return start || end ? `${start || '—'} → ${end || '—'}` : 'Period being confirmed';
}

function monthGroup(document: OnboardingDocument) {
  const date = document.reportingEndDate || document.reportingPeriod?.endDate || document.createdAt;
  if (!date) return 'Period pending confirmation';
  return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(new Date(date));
}

export default function PeriodicDocuments() {
  const [documents, setDocuments] = useState<OnboardingDocument[]>([]);
  const [selectedPurpose, setSelectedPurpose] = useState<UploadPurpose>('BANK_ACTIVITY');
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadDocuments = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    try {
      const response = await authenticatedFetch('/api/ingestion/documents');
      if (response.status === 401 || response.status === 403) throw new Error('Your session has expired. Please sign in again.');
      if (!response.ok) throw new Error('Documents could not be loaded.');
      const payload = await response.json();
      setDocuments(Array.isArray(payload.documents) ? payload.documents : [
        ...(payload.bankStatements || []),
        ...(payload.billsAndInvoices || []),
      ]);
      setError('');
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Documents could not be loaded.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadDocuments(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadDocuments]);
  useEffect(() => {
    if (!documents.some((document) => ['PENDING', 'PROCESSING'].includes(String(document.status || document.processingStatus)))) return;
    const timer = window.setInterval(() => { void loadDocuments(); }, 8000);
    return () => window.clearInterval(timer);
  }, [documents, loadDocuments]);

  const grouped = useMemo(() => documents.reduce<Record<string, OnboardingDocument[]>>((groups, document) => {
    const key = monthGroup(document);
    groups[key] = [...(groups[key] || []), document];
    return groups;
  }, {}), [documents]);

  const upload = async () => {
    if (!files.length) return;
    setUploading(true); setError(''); setMessage('');
    try {
      for (const file of files) {
        const form = new FormData();
        form.append('file', file);
        form.append('purpose', 'PERIODIC_UPDATE');
        form.append('category', purposeCategories[selectedPurpose]);
        const response = await authenticatedFetch('/api/ingestion/upload', { method: 'POST', body: form });
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error || `Could not upload ${file.name}.`);
        }
      }
      setFiles([]);
      setMessage(`${files.length} PDF${files.length === 1 ? '' : 's'} queued for processing.`);
      await loadDocuments(true);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <div className="documents-loading"><Loader2 size={18} className="animate-spin" /> Loading documents…</div>;

  return <div className="documents-page">
    <header className="documents-header">
      <div><p className="onboarding-eyebrow">Workspace / Documents</p><h1 className="documents-title">A living record of your business.</h1><p className="documents-subtitle">Upload periodic evidence once. We’ll process it in the background and keep the reporting periods visible.</p></div>
      <button type="button" className="documents-refresh" onClick={() => loadDocuments(true)} disabled={refreshing}><RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> {refreshing ? 'Refreshing' : 'Refresh'}</button>
    </header>
    <section className="documents-upload-card" aria-labelledby="documents-upload-title">
      <div className="documents-upload-heading"><div><p className="onboarding-mini-label">Add evidence</p><h2 id="documents-upload-title">Which period are you updating?</h2></div><UploadCloud size={22} /></div>
      <div className="documents-category-tabs" role="tablist" aria-label="Document category">
        {categories.map((category) => <button type="button" role="tab" aria-selected={selectedPurpose === category.purpose} key={category.purpose} onClick={() => { setSelectedPurpose(category.purpose); setFiles([]); }} className={selectedPurpose === category.purpose ? 'is-selected' : ''}>{category.title}</button>)}
      </div>
      <p className="documents-category-description">{categories.find((category) => category.purpose === selectedPurpose)?.description}</p>
      <PdfDropzone files={files} onChange={setFiles} disabled={uploading} label="Drop PDFs here" />
      <div className="documents-upload-footer"><span className="documents-private-note"><CheckCircle2 size={14} /> Private to your workspace · PDF only · 10 MB each</span><button type="button" className="onboarding-button onboarding-button--primary" onClick={upload} disabled={!files.length || uploading}>{uploading ? 'Uploading…' : 'Queue documents'}</button></div>
      {message && <p className="documents-success" role="status">{message}</p>}
      {error && <p className="documents-error" role="alert"><AlertTriangle size={14} /> {error}</p>}
    </section>
    <section className="documents-history" aria-labelledby="documents-history-title">
      <div className="documents-history-heading"><div><p className="onboarding-mini-label">History</p><h2 id="documents-history-title">Reporting periods</h2></div><span>{documents.length} document{documents.length === 1 ? '' : 's'}</span></div>
      {Object.keys(grouped).length === 0 ? <div className="documents-empty"><FileText size={24} /><strong>No documents yet.</strong><span>Your first upload will appear here with its confirmed reporting period.</span></div> : Object.entries(grouped).map(([period, periodDocuments]) => <div className="documents-period" key={period}><div className="documents-period-heading"><h3>{period}</h3><span>{periodDocuments.length} file{periodDocuments.length === 1 ? '' : 's'}</span></div>{periodDocuments.map((document) => <article className="documents-record" key={document.id}><div className="documents-record-icon"><FileText size={17} /></div><div className="documents-record-main"><strong>{document.fileName || 'Uploaded document'}</strong><span>{categories.find((category) => category.purpose === document.purpose)?.title || document.category || 'Document'} · {periodLabel(document)}</span>{document.validationIssues?.length ? <p className="documents-record-warning"><AlertTriangle size={13} /> {document.validationIssues.join(' ')}</p> : null}<DocumentReview document={document} compact /></div><div className={`documents-status documents-status--${String(document.status || document.processingStatus || 'PENDING').toLowerCase()}`}>{['PENDING', 'PROCESSING'].includes(String(document.status || document.processingStatus)) && <Clock3 size={13} />}{statusLabel(document.status || document.processingStatus)}</div></article>)}</div>)}
    </section>
  </div>;
}
