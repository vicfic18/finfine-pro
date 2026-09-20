import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ContentBlock,
  type ConversationRole,
} from '@aws-sdk/client-bedrock-runtime';
import type { RawExtractionResult } from './handler';

/**
 * Dormant Bedrock vision extraction restored from `main`.
 *
 * This module is intentionally not imported by `handler.ts`. The active
 * ingestion path remains the deterministic extractor until Bedrock vision is
 * explicitly enabled and tested in the deployment environment.
 */

const DEFAULT_MODELS = [
  process.env.BEDROCK_MODEL_ID || 'nvidia.nemotron-nano-12b-v2',
  'nvidia.nemotron-nano-12b-v2',
  'nvidia.nemotron-nano-12b-v2-vl',
  'apac.anthropic.claude-3-5-haiku-20241022-v1:0',
  'anthropic.claude-3-haiku-20240307-v1:0',
];

const EXTRACTION_SYSTEM_PROMPT = `You are a high-precision multimodal financial document parser specialized for Indian MSMEs (Micro, Small, and Medium Enterprises).
Your task is to analyze financial documents (bank statements, UPI transaction summaries, digital invoice screenshots, vendor bills, receipts, GST payment challans) and extract all financial entities into a strict, validated JSON structure.

Indian MSME Financial Context to handle:
1. Bank Statements & UPI Transactions:
   - For credit entries (CR / Deposit), type is "INFLOW".
   - For debit entries (DR / Withdrawal), type is "OUTFLOW".
   - Extract the counterparty name, UPI VPA/ID, reference number (UTR/RRN), and running balance into the "transactions" array.
   - Extract openingBalance, closingBalance, and statementPeriod.

2. Invoices & Bills (Vendor Bills & Customer Invoices):
   - Set documentType to "INVOICE" or "RECEIPT".
   - Populate "invoiceDetails" with invoiceNumber, invoiceDate, dueDate, partyType ("SUPPLIER" or "CUSTOMER"), partyName, partyGstin, totalAmount.
   - Extract itemized line items into "lineItems" array:
     * productName (e.g. "Sunflower Oil 1L", "Basmati Rice 5kg")
     * quantity (numeric)
     * unitOfMeasure (e.g. "litre", "kg", "pack", "unit")
     * unitPrice (per unit cost/price in INR)
     * grossAmount (quantity * unitPrice)
     * discountAmount (if any)
     * taxAmount (CGST/SGST/IGST if present)
     * netAmount (line total in INR)
   - Extract supplier operational terms into "supplierTerms" (leadTimeDays, creditPeriodDays, paymentTermsText, deliveryCost).
   - If unpaid or scheduled, also add a corresponding record to the "obligations" array.

3. Statutory Tax Identifiers:
   - GSTIN format: 15 alphanumeric characters (e.g., 27AABCS1429B1Z5).
   - PAN format: 10 alphanumeric characters (e.g., AABCS1429B).
   - Flag statutory tax payments with category "GST_PAYMENT" or "TDS_PAYMENT".

CRITICAL RULES:
1. Return ONLY pure valid JSON. Do not enclose in markdown code fences if possible, or use standard JSON.
2. Every number (amount, balance, quantity, price) must be a raw number without currency symbols (₹, Rs, commas).
3. Dates must be formatted as YYYY-MM-DD whenever discernible.
4. If a field is not present or unknown, use null or omit it.`;

export interface BedrockVisionInput {
  fileBytes: Uint8Array;
  fileName: string;
  region?: string;
  modelIds?: readonly string[];
}

export interface BedrockVisionResult {
  extraction: RawExtractionResult;
  modelId: string;
}

function sanitizeDocName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-\s\.]/g, '_').substring(0, 50) || 'document';
}

function cleanJsonOutput(output: string): string {
  const trimmed = output.trim();
  if (trimmed.startsWith('```json')) {
    return trimmed.replace(/^```json\s*/, '').replace(/```\s*$/, '');
  }
  if (trimmed.startsWith('```')) {
    return trimmed.replace(/^```\s*/, '').replace(/```\s*$/, '');
  }
  return trimmed;
}

function contentBlocksFor(fileBytes: Uint8Array, fileName: string): ContentBlock[] {
  const extension = fileName.split('.').pop()?.toLowerCase() || '';
  const blocks: ContentBlock[] = [];

  if (extension === 'pdf') {
    blocks.push({
      document: {
        name: sanitizeDocName(fileName),
        format: 'pdf',
        source: { bytes: fileBytes },
      },
    });
  } else if (['png', 'jpeg', 'jpg', 'webp', 'gif'].includes(extension)) {
    const format = extension === 'jpg' ? 'jpeg' : extension as 'png' | 'jpeg' | 'webp' | 'gif';
    blocks.push({
      image: {
        format,
        source: { bytes: fileBytes },
      },
    });
  } else {
    blocks.push({
      document: {
        name: sanitizeDocName(fileName),
        format: 'pdf',
        source: { bytes: fileBytes },
      },
    });
  }

  blocks.push({
    text: 'Please extract all financial transactions, bank/statement metadata, and obligations from this document according to the strict JSON schema.',
  });
  return blocks;
}

/**
 * Invoke the restored Bedrock vision implementation explicitly.
 * Nothing in the current ingestion flow calls this function.
 */
export async function extractWithBedrockVision(
  input: BedrockVisionInput,
): Promise<BedrockVisionResult> {
  const client = new BedrockRuntimeClient({
    region: input.region || process.env.AWS_REGION || 'ap-south-1',
    maxAttempts: 1,
  });
  const models = Array.from(new Set(input.modelIds?.length ? input.modelIds : DEFAULT_MODELS));
  const content = contentBlocksFor(input.fileBytes, input.fileName);
  let lastError: unknown;

  for (const modelId of models) {
    try {
      const response = await client.send(new ConverseCommand({
        modelId,
        messages: [{ role: 'user' as ConversationRole, content }],
        system: [{ text: EXTRACTION_SYSTEM_PROMPT }],
        inferenceConfig: {
          maxTokens: 4096,
          temperature: 0.0,
        },
      }));
      const outputText = response.output?.message?.content?.find((block) => block.text)?.text;
      if (!outputText) continue;

      return {
        extraction: JSON.parse(cleanJsonOutput(outputText)) as RawExtractionResult,
        modelId,
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    `Bedrock vision extraction failed for all configured models: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}
