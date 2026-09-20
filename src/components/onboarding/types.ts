export type OnboardingStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type UploadPurpose =
  | 'BANK_ACTIVITY'
  | 'PRODUCT_SALES'
  | 'CURRENT_INVENTORY'
  | 'PURCHASES'
  | 'OPEN_OBLIGATIONS'
  | 'RECURRING_EXPENSES';

export type DocumentStatus = 'PENDING' | 'PROCESSING' | 'EXTRACTED' | 'READY' | 'FAILED' | string;

export interface OnboardingDocument {
  id: string;
  fileName?: string;
  purpose?: UploadPurpose | string;
  category?: string;
  status?: DocumentStatus;
  processingStatus?: DocumentStatus;
  reportingStartDate?: string;
  reportingEndDate?: string;
  reportingPeriod?: { startDate?: string; endDate?: string };
  validationStatus?: string;
  validationIssues?: string[];
  extractedEntityCount?: number;
  extractionSummary?: Record<string, number>;
  extractedData?: {
    transactions?: Array<Record<string, unknown>>;
    obligations?: Array<Record<string, unknown>>;
    lineItems?: Array<Record<string, unknown>>;
    inventoryItems?: Array<Record<string, unknown>>;
    recurringExpenses?: Array<Record<string, unknown>>;
    invoiceDetails?: Record<string, unknown>;
    supplierTerms?: Record<string, unknown>;
  };
  createdAt?: string;
  processedAt?: string;
  extractedFields?: Array<{ label: string; value: string; confidence?: number; provenance?: DocumentProvenance }> | Record<string, unknown>;
  provenance?: DocumentProvenance;
  corrections?: Array<{ field: string; value: string }>;
}

export interface DocumentProvenance {
  page?: number;
  row?: number;
  sourceText?: string;
}

export interface ReadinessSummary {
  ready?: boolean;
  score?: number;
  warnings?: string[];
  blockers?: string[];
  coverage?: Record<string, { complete?: boolean; label?: string; detail?: string }>;
}

export interface OnboardingState {
  status?: string;
  currentStep?: number;
  profile?: {
    businessName?: string;
    businessType?: string;
    tradeName?: string;
    gstin?: string;
    pan?: string;
    timezone?: string;
    language?: string;
  };
  financialSettings?: {
    minimumCashBuffer?: number | string;
    ruleType?: string;
    currentCash?: number | string;
    currentCashAsOf?: string;
  };
  attestations?: Record<string, boolean>;
  confirmations?: Record<string, boolean | string>;
  documents?: OnboardingDocument[];
  readiness?: ReadinessSummary;
}

export interface OnboardingStatusResponse {
  onboarding?: OnboardingState;
  readiness?: ReadinessSummary;
  documents?: OnboardingDocument[];
  [key: string]: unknown;
}
