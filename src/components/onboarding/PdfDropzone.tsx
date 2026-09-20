'use client';

import { useRef, useState } from 'react';
import { FileText, UploadCloud, X } from 'lucide-react';
import clsx from 'clsx';

export const MAX_PDF_BYTES = 10 * 1024 * 1024;

interface PdfDropzoneProps {
  label?: string;
  hint?: string;
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
  multiple?: boolean;
}

function validatePdf(file: File) {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    return `${file.name} is not a PDF.`;
  }
  if (file.size > MAX_PDF_BYTES) return `${file.name} is larger than 10 MB.`;
  return null;
}

export default function PdfDropzone({
  label = 'Drop PDF statements here',
  hint = 'PDF only · 10 MB maximum per file',
  files,
  onChange,
  disabled = false,
  multiple = true,
}: PdfDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addFiles = (incoming: FileList | File[]) => {
    const next = Array.from(incoming);
    const invalid = next.map(validatePdf).find(Boolean);
    if (invalid) {
      setError(invalid as string);
      return;
    }
    setError(null);
    onChange(multiple ? [...files, ...next] : next.slice(0, 1));
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        className={clsx('onboarding-dropzone', dragging && 'onboarding-dropzone--active')}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!disabled) addFiles(event.dataTransfer.files);
        }}
        disabled={disabled}
        aria-label={label}
      >
        <span className="onboarding-dropzone__icon"><UploadCloud size={22} strokeWidth={1.7} /></span>
        <span className="onboarding-dropzone__copy">
          <strong>{label}</strong>
          <small>{hint}</small>
        </span>
        <span className="onboarding-dropzone__browse">Browse</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple={multiple}
        className="sr-only"
        onChange={(event) => {
          if (event.target.files) addFiles(event.target.files);
          event.target.value = '';
        }}
        disabled={disabled}
        aria-label="Choose PDF files"
      />
      {error && <p className="onboarding-error" role="alert">{error}</p>}
      {files.length > 0 && (
        <ul className="onboarding-file-list" aria-label="Selected PDF files">
          {files.map((file, index) => (
            <li key={`${file.name}-${file.lastModified}-${index}`} className="onboarding-file-item">
              <span className="flex min-w-0 items-center gap-2">
                <FileText size={16} aria-hidden="true" />
                <span className="truncate">{file.name}</span>
                <span className="onboarding-file-size">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
              </span>
              <button
                type="button"
                onClick={() => onChange(files.filter((_, fileIndex) => fileIndex !== index))}
                aria-label={`Remove ${file.name}`}
                className="onboarding-icon-button"
                disabled={disabled}
              >
                <X size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
