'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, Save, Search } from 'lucide-react';
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import type { DocumentProvenance, OnboardingDocument } from './types';

interface ReviewField {
  path: string;
  label: string;
  value: string;
  provenance?: DocumentProvenance;
}

interface DocumentReviewProps {
  document: OnboardingDocument;
  compact?: boolean;
}

const PRIVATE_KEY = /tenant|s3|bucket|pipeline|lambda|secret|token|sourceRecordIds/i;
const SECTION_LABELS: Record<string, string> = {
  transactions: 'Transactions',
  obligations: 'Obligations',
  lineItems: 'Line items',
  inventoryItems: 'Inventory items',
  recurringExpenses: 'Recurring expenses',
};

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === '') return 'Not found';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function fieldsFromDocument(document: OnboardingDocument): ReviewField[] {
  const raw = document.extractedFields;
  if (Array.isArray(raw)) {
    return raw
      .map((field, index) => ({ path: field.label || `field_${index + 1}`, label: field.label || `Field ${index + 1}`, value: displayValue(field.value), provenance: field.provenance }))
      .filter((field) => !PRIVATE_KEY.test(`${field.path} ${field.label} ${field.value}`));
  }
  if (!raw || typeof raw !== 'object') return [];
  return Object.entries(raw)
    .filter(([key]) => !PRIVATE_KEY.test(key))
    .filter(([, value]) => value !== undefined && value !== null && typeof value !== 'object' || (value && !('rawExtraction' in (value as Record<string, unknown>))))
    .map(([key, value]) => {
      const nested = value && typeof value === 'object' ? value as Record<string, unknown> : undefined;
      return {
        path: key,
        label: key.replace(/([A-Z])/g, ' $1').replace(/[_-]/g, ' ').replace(/^./, (letter) => letter.toUpperCase()),
        value: displayValue(nested && 'value' in nested ? nested.value : value),
        provenance: nested?.provenance as DocumentProvenance | undefined,
      };
    });
}

function safeProvenance(field: ReviewField, document: OnboardingDocument) {
  const provenance = field.provenance || document.provenance;
  if (!provenance) return null;
  const parts = [provenance.page ? `page ${provenance.page}` : '', provenance.row ? `row ${provenance.row}` : '', provenance.sourceText ? `“${provenance.sourceText.slice(0, 90)}${provenance.sourceText.length > 90 ? '…' : ''}”` : ''].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

function labelForKey(key: string) {
  return key.replace(/([A-Z])/g, ' $1').replace(/[_-]/g, ' ').replace(/^./, (letter) => letter.toUpperCase());
}

function entitySections(document: OnboardingDocument) {
  return Object.entries(document.extractedData || {})
    .filter(([, value]) => Array.isArray(value) && value.length > 0)
    .map(([key, value]) => ({
      key,
      label: SECTION_LABELS[key] || labelForKey(key),
      rows: value as Array<Record<string, unknown>>,
    }));
}

function compactEntity(row: Record<string, unknown>) {
  return Object.entries(row)
    .filter(([key, value]) => key !== 'provenance' && !PRIVATE_KEY.test(key) && value !== undefined && value !== null && typeof value !== 'object')
    .map(([key, value]) => labelForKey(key) + ': ' + displayValue(value))
    .join(' · ');
}

export default function DocumentReview({ document, compact = false }: DocumentReviewProps) {
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const fields = useMemo(() => fieldsFromDocument(document), [document]);
  const sections = useMemo(() => entitySections(document), [document]);
  const hasReviewData = fields.length > 0 || sections.length > 0 || Boolean(document.validationIssues?.length) || Boolean(document.corrections?.length) || Boolean(document.extractedEntityCount);
  if (!hasReviewData && compact) return null;

  const saveCorrections = async () => {
    const corrections = Object.entries(drafts).filter(([, value]) => value.trim() !== '').map(([fieldPath, confirmedValue]) => ({
      category: document.category || document.purpose || 'DOCUMENT',
      fieldPath,
      extractedValue: fields.find((field) => field.path === fieldPath)?.value,
      confirmedValue: confirmedValue.trim(),
      correctionType: 'MERCHANT_CORRECTION',
      reason: reason.trim() || undefined,
      asOf: new Date().toISOString().slice(0, 10),
    }));
    if (!corrections.length) {
      setError('Add at least one corrected value before saving.');
      return;
    }
    setSaving(true); setError(''); setMessage('');
    try {
      const response = await authenticatedFetch(`/api/ingestion/documents/${encodeURIComponent(document.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ corrections }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || 'Corrections could not be saved.');
      setDrafts({});
      setReason('');
      setMessage(`${body?.saved || corrections.length} correction${(body?.saved || corrections.length) === 1 ? '' : 's'} saved.`);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Corrections could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return <div className={`document-review ${compact ? 'document-review--compact' : ''}`}>
    <button type="button" className="document-review-toggle" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
      <span className="flex items-center gap-2"><Search size={13} /> {open ? 'Hide review details' : 'Review extracted details'}</span><ChevronDown size={15} className={open ? 'document-review-chevron--open' : ''} />
    </button>
    {open && <div className="document-review-panel">
      {document.validationIssues?.length ? <div className="document-review-issues"><AlertTriangle size={14} /><div><strong>Validation notes</strong><ul>{document.validationIssues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div></div> : null}
      {fields.length ? <div className="document-review-fields"><p className="onboarding-mini-label">Extracted fields</p>{fields.map((field) => <div className="document-review-field" key={field.path}><div><strong>{field.label}</strong><span>{field.value}</span>{safeProvenance(field, document) && <small>Source: {safeProvenance(field, document)}</small>}</div><label><span className="sr-only">Correct {field.label}</span><input value={drafts[field.path] || ''} onChange={(event) => setDrafts((current) => ({ ...current, [field.path]: event.target.value }))} placeholder="Enter correction" /></label></div>)}</div> : null}
      {sections.length ? <div className="document-review-entities"><p className="onboarding-mini-label">Extracted records{document.extractedEntityCount ? ' (' + document.extractedEntityCount + ' total)' : ''}</p>{sections.map((section) => <div className="document-review-entity-section" key={section.key}><strong>{section.label}</strong><span className="document-review-entity-count">{section.rows.length} shown</span>{section.rows.slice(0, 25).map((row, index) => <div className="document-review-entity-row" key={section.key + '-' + index}>{compactEntity(row) || 'Record ' + (index + 1)}</div>)}{section.rows.length > 25 && <small>Showing the first 25 records.</small>}</div>)}</div> : null}
      {!fields.length && !sections.length ? <p className="document-review-empty">{document.extractedEntityCount ? document.extractedEntityCount + ' records were extracted, but their details are not available yet.' : 'No extracted fields are available yet.'}</p> : null}
      {document.corrections?.length ? <p className="document-review-corrections"><CheckCircle2 size={14} /> {document.corrections.length} correction{document.corrections.length === 1 ? '' : 's'} already recorded.</p> : null}
      {fields.length > 0 && <div className="document-review-save"><label>Why are you correcting these values? <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Optional context for your records" /></label><button type="button" onClick={saveCorrections} disabled={saving}><Save size={14} /> {saving ? 'Saving…' : 'Save corrections'}</button></div>}
      {message && <p className="document-review-success" role="status">{message}</p>}{error && <p className="document-review-error" role="alert"><AlertTriangle size={13} /> {error}</p>}
    </div>}
  </div>;
}
