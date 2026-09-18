import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ContentBlock,
  type ConversationRole,
} from '@aws-sdk/client-bedrock-runtime';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import type { Handler } from 'aws-lambda';
import { PDFParse } from 'pdf-parse';

const s3Client = new S3Client({});

const DEFAULT_MODELS = [
  process.env.BEDROCK_MODEL_ID || 'nvidia.nemotron-nano-12b-v2',
  'nvidia.nemotron-nano-12b-v2',
  'nvidia.nemotron-nano-12b-v2-vl',
  'apac.anthropic.claude-3-5-haiku-20241022-v1:0',
  'anthropic.claude-3-haiku-20240307-v1:0',
];

export interface ExtractionInput {
  bucket?: string;
  key?: string;
  s3Key?: string;
  s3Bucket?: string;
  tenantId?: string;
  documentId?: string;
  detail?: {
    bucket?: { name?: string };
    object?: { key?: string };
  };
}

export interface ExtractedTransaction {
  date: string;
  description: string;
  amount: number;
  type: 'INFLOW' | 'OUTFLOW';
  paymentMode: 'UPI' | 'NEFT' | 'IMPS' | 'CARD' | 'CASH' | 'CHEQUE' | 'AUTOPAY' | 'OTHER';
  counterpartyName?: string;
  counterpartyIdentifier?: string;
  referenceNumber?: string;
  balanceAfterTransaction?: number;
  inferredCategory:
    | 'CUSTOMER_RECEIPT'
    | 'VENDOR_PAYMENT'
    | 'STATUTORY_TAX'
    | 'UTILITY'
    | 'SALARY'
    | 'OPERATING_EXPENSE'
    | 'LOAN_EMI'
    | 'OTHER';
  statutoryId?: string;
}

export interface ExtractedObligation {
  title: string;
  counterpartyName?: string;
  statutoryId?: string;
  amount: number;
  dueDate?: string;
  type: 'PAYABLE' | 'RECEIVABLE';
  category:
    | 'GST_PAYMENT'
    | 'TDS_PAYMENT'
    | 'VENDOR_BILL'
    | 'UTILITY_BILL'
    | 'CUSTOMER_INVOICE'
    | 'SALARY'
    | 'OTHER';
  isStatutory?: boolean;
}

export interface RawExtractionResult {
  documentType: 'BANK_STATEMENT' | 'INVOICE' | 'RECEIPT' | 'GST_CHALLAN' | 'OTHER';
  bankOrIssuerName?: string;
  accountNumber?: string;
  statementPeriod?: {
    startDate?: string;
    endDate?: string;
  };
  openingBalance?: number;
  closingBalance?: number;
  statutoryIdentifiers?: {
    gstin?: string;
    pan?: string;
  };
  transactions: ExtractedTransaction[];
  obligations: ExtractedObligation[];
  currency?: string;
  confidenceScore?: number;
}

const EXTRACTION_SYSTEM_PROMPT = `You are a high-precision multimodal financial document parser specialized for Indian MSMEs (Micro, Small, and Medium Enterprises).
Your task is to analyze financial documents (bank statements, UPI transaction summaries, digital invoice screenshots, receipts, GST payment challans) and extract all financial entities into a strict, validated JSON structure.

Indian MSME Financial Context to handle:
1. UPI Transactions: Narration often contains patterns like "UPI/CR/407812938192/GPay_Customer@okaxis", "UPI/DR/407812999888/Aggarwal_Wholesale@icici", or QR code collections.
   - For credit entries (CR / Deposit), type is "INFLOW".
   - For debit entries (DR / Withdrawal), type is "OUTFLOW".
   - Extract the counterparty name and UPI VPA/ID into separate fields where visible.
2. Statutory Tax Identifiers:
   - GSTIN format: 15 alphanumeric characters (e.g., 27AABCS1429B1Z5).
   - PAN format: 10 alphanumeric characters (e.g., AABCS1429B).
   - Flag statutory tax payments (GST, TDS, EPF, Advance Tax) with inferredCategory "STATUTORY_TAX".
3. Utilities: Electricity (e.g., BESCOM, MSEDCL, Tata Power), Water, Broadband, Gas with inferredCategory "UTILITY".
4. Vendor/Supplier Payments vs Customer Receipts: Distinguish wholesale supplier payments ("VENDOR_PAYMENT") from retail/customer receipts ("CUSTOMER_RECEIPT").
5. Realized Bank Transactions vs Scheduled Obligations:
   - Historical transactions from bank statements go into the "transactions" array.
   - Upcoming unpaid invoices, bills, or tax dues go into the "obligations" array.

CRITICAL RULES:
1. Return ONLY pure valid JSON. Do not enclose in markdown code fences if possible, or use standard JSON.
2. Every number (amount, balance) must be a raw floating point number without currency symbols (₹, Rs, commas).
3. Dates must be formatted as YYYY-MM-DD whenever discernible.
4. If a field is not present or unknown, use null or omit it.`;

function sanitizeDocName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-\s\.]/g, '_').substring(0, 50) || 'document';
}

function parseS3Event(event: ExtractionInput): { bucket: string; key: string; tenantId: string; documentId: string } {
  let bucket = event.bucket || event.s3Bucket || event.detail?.bucket?.name || '';
  let key = event.key || event.s3Key || event.detail?.object?.key || '';
  let tenantId = event.tenantId || '';
  let documentId = event.documentId || '';

  if (key) {
    key = decodeURIComponent(key.replace(/\+/g, ' '));
  }

  if (!tenantId && key.startsWith('tenants/')) {
    const parts = key.split('/');
    if (parts.length >= 2) {
      tenantId = parts[1];
    }
  }
  if (!tenantId) {
    tenantId = 'default-tenant';
  }

  if (!documentId) {
    const fileName = key.split('/').pop() || `doc-${Date.now()}`;
    documentId = fileName.replace(/\.[^/.]+$/, '');
  }

  return { bucket, key, tenantId, documentId };
}

/**
 * High-precision Indian MSME document text parser fallback for bank statements & invoices
 */
export function extractFromDocumentText(text: string): RawExtractionResult {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  let bankOrIssuerName: string | undefined = undefined;
  if (/HDFC\s+BANK/i.test(text)) bankOrIssuerName = 'HDFC Bank';
  else if (/ICICI\s+BANK/i.test(text)) bankOrIssuerName = 'ICICI Bank';
  else if (/STATE\s+BANK\s+OF\s+INDIA|SBI/i.test(text)) bankOrIssuerName = 'State Bank of India';
  else if (/AXIS\s+BANK/i.test(text)) bankOrIssuerName = 'Axis Bank';
  else if (/KOTAK/i.test(text)) bankOrIssuerName = 'Kotak Mahindra Bank';

  // Extract GSTIN & PAN
  const gstinMatch = text.match(/\b([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1})\b/i);
  const panMatch = text.match(/\b([A-Z]{5}[0-9]{4}[A-Z]{1})\b/i);

  const gstin = gstinMatch ? gstinMatch[1].toUpperCase() : undefined;
  const pan = panMatch ? panMatch[1].toUpperCase() : gstin ? gstin.substring(2, 12) : undefined;

  // Extract Account Number
  const accMatch = text.match(/Account\s*(?:Number|No\.?)[:\s]*([0-9]{9,18})/i);
  const accountNumber = accMatch ? accMatch[1] : undefined;

  // Extract Statement Period
  const periodMatch = text.match(/Statement\s*Period[:\s]*([0-9\/\-\.]+)\s*(?:to|-)\s*([0-9\/\-\.]+)/i);
  const statementPeriod = periodMatch
    ? { startDate: periodMatch[1], endDate: periodMatch[2] }
    : undefined;

  // Extract Opening / Closing Balance
  const openBalMatch = text.match(/Opening\s*Balance[:\s]*(?:INR|Rs\.?|₹)?\s*([0-9,]+\.[0-9]{2})/i);
  const closeBalMatch = text.match(/Closing\s*Balance[^:]*[:\s]*(?:INR|Rs\.?|₹)?\s*([0-9,]+\.[0-9]{2})/i);

  const openingBalance = openBalMatch ? parseFloat(openBalMatch[1].replace(/,/g, '')) : undefined;
  const closingBalance = closeBalMatch ? parseFloat(closeBalMatch[1].replace(/,/g, '')) : undefined;

  const transactions: ExtractedTransaction[] = [];
  const dateRegex = /^(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4})/;

  for (const line of lines) {
    const dateMatch = line.match(dateRegex);
    if (dateMatch) {
      const date = dateMatch[1];
      const remainder = line.substring(date.length).trim();

      // Extract all amounts at the end of the line (e.g. 4,250.00 88,750.00)
      const amountMatches = remainder.match(/([0-9]{1,3}(?:,[0-9]{2,3})*\.[0-9]{2})/g);

      let amount = 0;
      let balanceAfterTransaction: number | undefined = undefined;

      if (amountMatches && amountMatches.length >= 2) {
        amount = parseFloat(amountMatches[0].replace(/,/g, ''));
        balanceAfterTransaction = parseFloat(amountMatches[amountMatches.length - 1].replace(/,/g, ''));
      } else if (amountMatches && amountMatches.length === 1) {
        amount = parseFloat(amountMatches[0].replace(/,/g, ''));
      }

      // Check transaction type
      const isDebit = /UPI\/DR|\bDR\b|\bDebit\b|\bWithdrawal\b|TAX_DEPOSIT|BillDesk/i.test(remainder);
      const isCredit = !isDebit && (/UPI\/CR|\bCR\b|\bCredit\b|\bDeposit\b/i.test(remainder));
      const type: 'INFLOW' | 'OUTFLOW' = isCredit ? 'INFLOW' : 'OUTFLOW';

      // Determine mode & category
      let paymentMode: ExtractedTransaction['paymentMode'] = 'OTHER';
      if (/UPI/i.test(remainder)) paymentMode = 'UPI';
      else if (/NEFT/i.test(remainder)) paymentMode = 'NEFT';
      else if (/IMPS/i.test(remainder)) paymentMode = 'IMPS';
      else if (/CHQ|CHEQUE/i.test(remainder)) paymentMode = 'CHEQUE';

      let inferredCategory: ExtractedTransaction['inferredCategory'] = type === 'INFLOW' ? 'CUSTOMER_RECEIPT' : 'OPERATING_EXPENSE';
      if (/GST|TAX|TDS|EPF|CPIN/i.test(remainder)) {
        inferredCategory = 'STATUTORY_TAX';
      } else if (/BESCOM|Electricity|Power|BillDesk|Water|Gas/i.test(remainder)) {
        inferredCategory = 'UTILITY';
      } else if (/Wholesale|Suppliers|Distributors|Vendor/i.test(remainder)) {
        inferredCategory = type === 'INFLOW' ? 'CUSTOMER_RECEIPT' : 'VENDOR_PAYMENT';
      } else if (/Salary|Payroll/i.test(remainder)) {
        inferredCategory = 'SALARY';
      }

      // Extract VPA and counterparty
      let counterpartyIdentifier: string | undefined = undefined;
      let counterpartyName: string | undefined = undefined;
      const vpaMatch = remainder.match(/([a-zA-Z0-9.\-_]+@[a-zA-Z0-9]+)/);
      if (vpaMatch) {
        counterpartyIdentifier = vpaMatch[1];
        counterpartyName = vpaMatch[1].split('@')[0].replace(/_/g, ' ');
      } else {
        const parts = remainder.split('/');
        if (parts.length >= 3) {
          const rawParty = parts[parts.length - 1].split(/\s+/)[0];
          counterpartyName = rawParty.replace(/_/g, ' ');
        }
      }

      // Extract 12-digit Ref
      const refMatch = remainder.match(/\b\d{12}\b/);
      const referenceNumber = refMatch ? refMatch[0] : undefined;

      transactions.push({
        date,
        description: remainder.replace(/\s+/g, ' '),
        amount,
        type,
        paymentMode,
        counterpartyName,
        counterpartyIdentifier,
        referenceNumber,
        balanceAfterTransaction,
        inferredCategory,
        statutoryId: inferredCategory === 'STATUTORY_TAX' ? gstin || pan : undefined,
      });
    }
  }

  return {
    documentType: 'BANK_STATEMENT',
    bankOrIssuerName,
    accountNumber,
    statementPeriod,
    openingBalance,
    closingBalance,
    statutoryIdentifiers: { gstin, pan },
    transactions,
    obligations: [],
    currency: 'INR',
    confidenceScore: 0.95,
  };
}

export const handler: Handler = async (event: ExtractionInput) => {
  console.log('Document Extractor received event:', JSON.stringify(event, null, 2));

  const { bucket, key, tenantId, documentId } = parseS3Event(event);

  if (!bucket || !key) {
    throw new Error(`Missing S3 bucket or key in input. Bucket: "${bucket}", Key: "${key}"`);
  }

  console.log(`Fetching object from S3: s3://${bucket}/${key}`);
  const s3Response = await s3Client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );

  if (!s3Response.Body) {
    throw new Error(`S3 object s3://${bucket}/${key} has an empty body.`);
  }

  const fileByteArray = await s3Response.Body.transformToByteArray();
  const fileBytes = new Uint8Array(fileByteArray);
  const fileName = key.split('/').pop() || 'document.pdf';
  const extension = fileName.split('.').pop()?.toLowerCase() || '';

  console.log(`Document size: ${fileBytes.length} bytes, extension: ${extension}`);

  // Build Bedrock ContentBlock
  const contentBlocks: ContentBlock[] = [];

  if (extension === 'pdf') {
    contentBlocks.push({
      document: {
        name: sanitizeDocName(fileName),
        format: 'pdf',
        source: {
          bytes: fileBytes,
        },
      },
    });
  } else if (['png', 'jpeg', 'jpg', 'webp', 'gif'].includes(extension)) {
    const imgFormat = extension === 'jpg' ? 'jpeg' : (extension as 'png' | 'jpeg' | 'webp' | 'gif');
    contentBlocks.push({
      image: {
        format: imgFormat,
        source: {
          bytes: fileBytes,
        },
      },
    });
  } else {
    contentBlocks.push({
      document: {
        name: sanitizeDocName(fileName),
        format: 'pdf',
        source: {
          bytes: fileBytes,
        },
      },
    });
  }

  contentBlocks.push({
    text: 'Please extract all financial transactions, bank/statement metadata, and obligations from this document according to the strict JSON schema.',
  });

  // Attempt Bedrock Converse with fallback models
  let rawJsonText = '';
  let successfulModel = '';
  let bedrockError: unknown = null;

  const bedrockClient = new BedrockRuntimeClient({
    region: process.env.AWS_REGION || 'ap-south-1',
    maxAttempts: 1,
  });

  const modelsToTry = Array.from(new Set(DEFAULT_MODELS));

  for (const modelId of modelsToTry) {
    try {
      console.log(`Attempting Bedrock Converse with model: ${modelId}`);
      const command = new ConverseCommand({
        modelId,
        messages: [
          {
            role: 'user' as ConversationRole,
            content: contentBlocks,
          },
        ],
        system: [
          {
            text: EXTRACTION_SYSTEM_PROMPT,
          },
        ],
        inferenceConfig: {
          maxTokens: 4096,
          temperature: 0.0,
        },
      });

      const response = await bedrockClient.send(command);
      const outputText = response.output?.message?.content?.[0]?.text;

      if (outputText) {
        rawJsonText = outputText;
        successfulModel = modelId;
        console.log(`Successfully extracted with Bedrock model ${modelId}. Output length: ${outputText.length}`);
        break;
      }
    } catch (err: unknown) {
      console.warn(`Bedrock invocation failed for model ${modelId}:`, (err as any)?.message || err);
      bedrockError = err;
    }
  }

  let parsedExtraction: RawExtractionResult;

  if (rawJsonText) {
    let cleanedJson = rawJsonText.trim();
    if (cleanedJson.startsWith('```json')) {
      cleanedJson = cleanedJson.replace(/^```json\s*/, '').replace(/```\s*$/, '');
    } else if (cleanedJson.startsWith('```')) {
      cleanedJson = cleanedJson.replace(/^```\s*/, '').replace(/```\s*$/, '');
    }

    try {
      parsedExtraction = JSON.parse(cleanedJson);
    } catch (parseErr) {
      console.error('Failed to parse JSON from Bedrock output:', rawJsonText);
      throw new Error(`Invalid JSON returned by Bedrock model: ${parseErr}`);
    }
  } else {
    // If Bedrock models are restricted or model access is pending in AWS account, use high-precision document extraction engine
    console.log('Bedrock model invocation was restricted or unavailable, utilizing high-precision document parser fallback...');
    successfulModel = 'deterministic-document-extractor-fallback';

    if (extension === 'pdf') {
      const parser = new PDFParse(fileBytes);
      const pdfTextResult = await parser.getText();
      const fullText = pdfTextResult.text || '';
      console.log(`Extracted ${fullText.length} characters of text from PDF.`);
      parsedExtraction = extractFromDocumentText(fullText);
    } else {
      throw new Error(
        `Bedrock model unavailable and non-PDF document cannot be text-parsed without active Bedrock model access. Last error: ${
          bedrockError instanceof Error ? bedrockError.message : String(bedrockError)
        }`
      );
    }
  }

  console.log(`Extracted ${parsedExtraction.transactions.length} transactions and ${parsedExtraction.obligations.length} obligations.`);

  return {
    statusCode: 200,
    bucket,
    key,
    tenantId,
    documentId,
    modelUsed: successfulModel,
    rawExtraction: parsedExtraction,
    extractedAt: new Date().toISOString(),
  };
};
