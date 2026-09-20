import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DeleteCommand, DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { NextResponse } from 'next/server';
import { AuthenticationConfigurationError, AuthenticationError, requirePrincipal } from '@/lib/server-auth';
import { requireCompletedOnboarding } from '@/lib/onboarding-store';
import {
  getMerchantSettings,
  restartPredictionAndRefreshMetrics,
} from '@/lib/financial-store';
import {
  generateAllSampleDocuments,
  SAMPLE_DOCUMENTS_REGISTRY,
} from '../../../../../scripts/generate-sample-data';

export const runtime = 'nodejs';

const MAX_PDF_BYTES = 10 * 1024 * 1024;
const PDF_SIGNATURE = '%PDF-';
const ALLOWED_CATEGORIES = new Set([
  'BANK_ACTIVITY',
  'PRODUCT_SALES',
  'CURRENT_INVENTORY',
  'PURCHASES_SUPPLIERS',
  'PURCHASES',
  'OPEN_OBLIGATIONS',
  'RECURRING_EXPENSES',
]);
const ALLOWED_PURPOSES = new Set([
  'ONBOARDING_BASELINE',
  'PERIODIC_UPDATE',
]);

type Outputs = {
  auth?: { aws_region?: string };
  data?: { aws_region?: string };
  custom?: Record<string, string>;
  storage?: { bucket_name?: string };
};

function loadOutputs(): Outputs {
  try {
    const file = path.join(process.cwd(), 'amplify_outputs.json');
    return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')) as Outputs) : {};
  } catch {
    return {};
  }
}

const outputs = loadOutputs();
const outputsCustom = outputs.custom || {};
const region = process.env.AWS_REGION
  || outputs.data?.aws_region
  || outputs.auth?.aws_region
  || outputsCustom.awsRegion
  || 'ap-south-1';

const bucketName =
  process.env.S3_BUCKET_NAME ||
  outputs.storage?.bucket_name ||
  'amplify-finfinepro-vicfic-finfinedocumentstoragebu-nm3ks1cueqmt';

const docTableName =
  process.env.DOCUMENT_RECORD_TABLE_NAME ||
  outputsCustom.documentRecordTableName ||
  'DocumentRecord-ifsueqzwybf6nau7duulv5qweq-NONE';
const txnTableName =
  process.env.TRANSACTION_TABLE_NAME ||
  outputsCustom.transactionTableName ||
  'Transaction-ifsueqzwybf6nau7duulv5qweq-NONE';
const oblTableName =
  process.env.OBLIGATION_TABLE_NAME ||
  outputsCustom.obligationTableName ||
  'Obligation-ifsueqzwybf6nau7duulv5qweq-NONE';
const prodTableName =
  process.env.PRODUCT_TABLE_NAME ||
  outputsCustom.productTableName ||
  'Product-ifsueqzwybf6nau7duulv5qweq-NONE';
const purchaseTableName =
  process.env.PURCHASE_TABLE_NAME ||
  outputsCustom.purchaseTableName ||
  'Purchase-ifsueqzwybf6nau7duulv5qweq-NONE';
const purchaseLineItemTableName =
  process.env.PURCHASE_LINE_ITEM_TABLE_NAME ||
  outputsCustom.purchaseLineItemTableName ||
  'PurchaseLineItem-ifsueqzwybf6nau7duulv5qweq-NONE';
const cashPositionTableName =
  process.env.CASH_POSITION_TABLE_NAME ||
  outputsCustom.cashPositionTableName ||
  'CashPositionSnapshot-ifsueqzwybf6nau7duulv5qweq-NONE';
const supplierProfileTableName =
  process.env.SUPPLIER_PROFILE_TABLE_NAME ||
  outputsCustom.supplierProfileTableName ||
  'SupplierProfile-ifsueqzwybf6nau7duulv5qweq-NONE';

const extractorArn =
  process.env.DOCUMENT_EXTRACTOR_FUNCTION_ARN || outputsCustom.documentExtractorLambdaArn;
const normalizerArn =
  process.env.INGESTION_NORMALIZER_FUNCTION_ARN || outputsCustom.ingestionNormalizerLambdaArn;

import { getAwsClientConfig } from '@/lib/aws-client-config';

const s3Client = new S3Client(getAwsClientConfig(region));
const lambdaClient = new LambdaClient(getAwsClientConfig(region));
const docClient = DynamoDBDocumentClient.from(new DynamoDBClient(getAwsClientConfig(region)), {
  marshallOptions: { removeUndefinedValues: true },
});

function cleanFileName(name: string): string {
  const basename = name.split(/[\\/]/).pop() || 'document.pdf';
  const normalized = basename.normalize('NFKC').replace(/[^a-zA-Z0-9._-]/g, '_');
  const withoutTraversal = normalized.replace(/\.\.+/g, '.');
  return withoutTraversal.toLowerCase().endsWith('.pdf')
    ? withoutTraversal.slice(0, 180)
    : `${withoutTraversal.slice(0, 176)}.pdf`;
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function isAllowed(value: FormDataEntryValue | null, allowed: Set<string>): value is string {
  return typeof value === 'string' && allowed.has(value);
}

function canonicalCategory(value: string): string {
  return value === 'PURCHASES' ? 'PURCHASES_SUPPLIERS' : value;
}

async function runDocumentExtractor(payload: any) {
  if (extractorArn) {
    try {
      console.log(`[Ingestion API] Invoking remote AWS Lambda Document Extractor (${extractorArn})...`);
      const res = await lambdaClient.send(
        new InvokeCommand({
          FunctionName: extractorArn,
          InvocationType: 'RequestResponse',
          Payload: Buffer.from(JSON.stringify(payload)),
        })
      );
      if (res.Payload) {
        const payloadStr = Buffer.from(res.Payload).toString('utf-8');
        const parsed = JSON.parse(payloadStr);
        if (res.FunctionError) {
          console.warn('[Ingestion API] Remote Lambda returned error:', parsed);
          throw new Error(parsed.errorMessage || 'Remote Lambda execution failed');
        }
        console.log('[Ingestion API] Remote Lambda Document Extractor executed successfully.');
        return parsed;
      }
    } catch (err: any) {
      console.warn(
        `[Ingestion API] Remote Lambda invocation skipped/failed (${err.message}). Executing serverless extractor handler directly.`
      );
    }
  }

  const { handler: extractorHandler } = await import(
    '../../../../../amplify/functions/document-extractor/handler'
  );
  return await (extractorHandler as any)(payload);
}

async function runIngestionNormalizer(payload: any) {
  if (normalizerArn) {
    try {
      console.log(`[Ingestion API] Invoking remote AWS Lambda Ingestion Normalizer (${normalizerArn})...`);
      const res = await lambdaClient.send(
        new InvokeCommand({
          FunctionName: normalizerArn,
          InvocationType: 'RequestResponse',
          Payload: Buffer.from(JSON.stringify(payload)),
        })
      );
      if (res.Payload) {
        const payloadStr = Buffer.from(res.Payload).toString('utf-8');
        const parsed = JSON.parse(payloadStr);
        if (res.FunctionError) {
          console.warn('[Ingestion API] Remote Normalizer Lambda returned error:', parsed);
          throw new Error(parsed.errorMessage || 'Remote Normalizer Lambda failed');
        }
        console.log('[Ingestion API] Remote Lambda Ingestion Normalizer executed successfully.');
        return parsed;
      }
    } catch (err: any) {
      console.warn(
        `[Ingestion API] Remote Normalizer Lambda invocation skipped/failed (${err.message}). Executing serverless normalizer handler directly.`
      );
    }
  }

  const { handler: normalizerHandler } = await import(
    '../../../../../amplify/functions/ingestion-normalizer/handler'
  );
  return await (normalizerHandler as any)(payload);
}

/**
 * Ingests a single PDF file buffer into S3 and runs the extractor + normalizer pipeline
 */
async function ingestPdfBuffer(
  fileBuffer: Buffer,
  fileName: string,
  docType: 'BANK_STATEMENT' | 'INVOICE' | 'GST_CHALLAN',
  tenantId: string,
  category: string = 'OTHER',
  manualMetadata: any = {}
) {
  const timestamp = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  const documentId = docType === 'BANK_STATEMENT' ? `stmt-${timestamp}` : `inv-${timestamp}`;
  const sanitizedFileName = cleanFileName(fileName);
  const s3Key = `public/tenants/${tenantId}/raw/${documentId}-${sanitizedFileName}`;

  // 1. Upload to S3
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
      Body: fileBuffer,
      ContentType: 'application/pdf',
      Metadata: {
        tenantId,
        documentId,
        documentType: docType,
        category,
      },
    })
  );

  // 2. Set Env vars
  process.env.DOCUMENT_RECORD_TABLE_NAME = docTableName;
  process.env.TRANSACTION_TABLE_NAME = txnTableName;
  process.env.OBLIGATION_TABLE_NAME = oblTableName;
  process.env.PRODUCT_TABLE_NAME = prodTableName;
  process.env.PURCHASE_TABLE_NAME = purchaseTableName;
  process.env.PURCHASE_LINE_ITEM_TABLE_NAME = purchaseLineItemTableName;
  process.env.CASH_POSITION_TABLE_NAME = cashPositionTableName;
  process.env.SUPPLIER_PROFILE_TABLE_NAME = supplierProfileTableName;

  // 3. Extract & Normalize
  const extractOutput = await runDocumentExtractor({
    bucket: bucketName,
    key: s3Key,
    tenantId,
    documentId,
    documentType: docType,
    category,
    manualMetadata,
  });

  const pipelineResult = await runIngestionNormalizer({
    ...extractOutput,
    category,
    tenantId,
    documentId,
    bucket: bucketName,
    key: s3Key,
  });
  return { documentId, s3Key, fileName: sanitizedFileName, pipelineResult };
}

export async function GET() {
  return NextResponse.json({
    availableSampleDocuments: SAMPLE_DOCUMENTS_REGISTRY.map((d) => ({
      id: d.id,
      displayName: d.displayName,
      docType: d.docType,
      fileName: d.fileName,
      description: d.description,
    })),
  });
}

export async function POST(request: Request) {
  try {
    let tenantId = process.env.FINFINE_TENANT_ID || 'msme-001';
    try {
      tenantId = await requirePrincipal(request);
    } catch (authErr) {
      if (authErr instanceof AuthenticationError) return jsonError(authErr.message, 401);
      if (authErr instanceof AuthenticationConfigurationError) return jsonError(authErr.message, 503);
    }

    const contentType = (request.headers.get('content-type') || '').toLowerCase();

    // -------------------------------------------------------------------------
    // A. JSON Payload (Synthetic Sample Data Generation or Base64 Raw Upload)
    // -------------------------------------------------------------------------
    if (contentType.includes('application/json')) {
      const body = await request.json();

      if (body.useSample) {
        const sampleType = body.sampleType;
        const sampleDir = path.join(process.cwd(), 'sample_data');
        if (!fs.existsSync(sampleDir)) {
          fs.mkdirSync(sampleDir, { recursive: true });
        }

        const settings = await getMerchantSettings(tenantId);
        const businessName = body.businessName || settings.businessName || 'Sharma Textiles & FinTech MSME';

        // Bulk generation & ingestion of all enterprise sample documents
        if (sampleType === 'ALL' || sampleType === 'COMPLETE' || !sampleType) {
          console.log(`[Ingestion API] Starting Enterprise Sample Document Ingestion Pipeline for "${businessName}"...`);
          await generateAllSampleDocuments(businessName);

          const results = [];
          for (const doc of SAMPLE_DOCUMENTS_REGISTRY) {
            const filePath = path.join(sampleDir, doc.fileName);
            if (fs.existsSync(filePath)) {
              console.log(`[Ingestion API] S3 Upload & Pipeline Ingestion: ${doc.fileName} (${doc.docType})...`);
              const fileBuffer = fs.readFileSync(filePath);
              const res = await ingestPdfBuffer(fileBuffer, doc.fileName, doc.docType, tenantId);
              results.push({
                documentId: res.documentId,
                fileName: res.fileName,
                s3Key: res.s3Key,
                docType: doc.docType,
                title: doc.displayName,
              });
            }
          }

          // Restart ML prediction & refresh cash flow metrics
          const freshMetrics = await restartPredictionAndRefreshMetrics({
            tenantId,
            reason: 'Full Enterprise MSME Sample Pack Ingested (All Real PDFs via S3 -> Extractor -> Normalizer)',
          });

          return NextResponse.json({
            success: true,
            message: `Ingested ${results.length} authentic MSME business documents into S3 & DynamoDB. Cash flow prediction restarted with live figures.`,
            ingestedCount: results.length,
            predictionSummary: {
              modelName: freshMetrics.mlForecast?.modelName,
              solvencyStatus: freshMetrics.solvencyStatus,
              daysToZero: freshMetrics.daysToZero,
              p50EndingBalance: freshMetrics.trajectory60Days?.[freshMetrics.trajectory60Days.length - 1]?.p50Balance,
            },
            details: results,
          });
        }

        // Single specific sample document from registry
        const matched = SAMPLE_DOCUMENTS_REGISTRY.find(
          (d) => d.id === sampleType || d.fileName === sampleType
        );

        if (!matched) {
          return NextResponse.json(
            { error: `Unknown sample document type: "${sampleType}"` },
            { status: 400 }
          );
        }

        const samplePdfPath = path.join(sampleDir, matched.fileName);
        if (!fs.existsSync(samplePdfPath)) {
          await matched.generator({ businessName, outputPath: samplePdfPath });
        }

        const fileBuffer = fs.readFileSync(samplePdfPath);
        const result = await ingestPdfBuffer(fileBuffer, matched.fileName, matched.docType, tenantId);
        const freshMetrics = await restartPredictionAndRefreshMetrics({
          tenantId,
          reason: `Single Sample PDF Ingested (${matched.id})`,
          sourceDocType: matched.docType,
        });

        return NextResponse.json({
          success: true,
          sampleType: matched.id,
          documentId: result.documentId,
          fileName: result.fileName,
          message: `Sample PDF "${matched.displayName}" parsed & normalized through pipeline into DynamoDB. Cash flow prediction restarted.`,
          pipelineSummary: result.pipelineResult?.summary || null,
          predictionSummary: {
            modelName: freshMetrics.mlForecast?.modelName,
            solvencyStatus: freshMetrics.solvencyStatus,
            daysToZero: freshMetrics.daysToZero,
          },
        });
      }

      if (body.rawBase64) {
        const fileBuffer = Buffer.from(body.rawBase64, 'base64');
        const fileName = body.fileName || `doc_${Date.now()}.pdf`;
        const docType = body.documentType || 'BANK_STATEMENT';
        const manualMetadata = body.metadata || {};

        const result = await ingestPdfBuffer(fileBuffer, fileName, docType, tenantId, manualMetadata);
        const freshMetrics = await restartPredictionAndRefreshMetrics({
          tenantId,
          reason: `Raw Base64 PDF Ingested (${fileName})`,
          sourceDocType: docType,
        });

        return NextResponse.json({
          success: true,
          documentId: result.documentId,
          fileName: result.fileName,
          pipelineSummary: result.pipelineResult?.summary || null,
          predictionSummary: {
            modelName: freshMetrics.mlForecast?.modelName,
            solvencyStatus: freshMetrics.solvencyStatus,
            daysToZero: freshMetrics.daysToZero,
          },
        });
      }

      return jsonError('Unsupported JSON payload. Provide useSample: true or rawBase64.', 400);
    }

    // -------------------------------------------------------------------------
    // B. Multipart/form-data
    // -------------------------------------------------------------------------
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();

      // Check if this is an Onboarding baseline upload
      const purposeValue = formData.get('purpose');
      const categoryValue = formData.get('category');
      const isBaselineUpload = purposeValue && isAllowed(purposeValue, ALLOWED_PURPOSES);

      if (isBaselineUpload) {
        const file = formData.get('file');
        if (!(file instanceof File)) return jsonError('A file is required', 400);
        if (file.type !== 'application/pdf') return jsonError('Only application/pdf files are accepted', 415);
        if (file.size <= 0 || file.size > MAX_PDF_BYTES) return jsonError('PDF files must be between 1 byte and 10 MB', 413);

        if (!isAllowed(categoryValue, ALLOWED_CATEGORIES)) return jsonError('A valid document category is required', 400);

        if (purposeValue === 'PERIODIC_UPDATE') {
          await requireCompletedOnboarding(tenantId);
        }

        const bytes = Buffer.from(await file.arrayBuffer());
        if (bytes.length > MAX_PDF_BYTES || bytes.subarray(0, PDF_SIGNATURE.length).toString('ascii') !== PDF_SIGNATURE) {
          return jsonError('The uploaded file is not a valid PDF', 415);
        }

        const purpose = purposeValue;
        const category = canonicalCategory(categoryValue);
        const documentId = randomUUID();
        const fileName = cleanFileName(file.name);
        const objectKey = `tenants/${tenantId}/documents/${documentId}/${fileName}`;
        const now = new Date().toISOString();
        const documentRecord = {
          id: documentId,
          tenantId,
          fileName,
          s3Key: objectKey,
          fileType: 'application/pdf',
          purpose,
          category,
          status: 'PENDING',
          validationStatus: 'PENDING',
          validationIssues: [],
          extractedEntityCount: 0,
          createdAt: now,
          updatedAt: now,
          __typename: 'DocumentRecord',
        };

        await docClient.send(new PutCommand({
          TableName: docTableName,
          Item: documentRecord,
          ConditionExpression: 'attribute_not_exists(id)',
        }));

        try {
          await s3Client.send(new PutObjectCommand({
            Bucket: bucketName,
            Key: objectKey,
            Body: bytes,
            ContentType: 'application/pdf',
            Metadata: { documentId, purpose, category },
            ServerSideEncryption: 'AES256',
          }));
        } catch (uploadError) {
          try {
            await docClient.send(new DeleteCommand({ TableName: docTableName, Key: { id: documentId } }));
          } catch (cleanupError) {
            console.error('Failed to clean up pending document after S3 upload failure', cleanupError);
          }
          throw uploadError;
        }

        return NextResponse.json({ documentId, status: 'PENDING' }, { status: 202 });
      }

      // Standard / Bulk Ingestion Uploads
      const rawFiles = [
        ...formData.getAll('files'),
        ...formData.getAll('file'),
      ].filter((f): f is File => typeof f === 'object' && f !== null && typeof (f as any).arrayBuffer === 'function');

      const files: File[] = [];
      const seen = new Set<string>();
      for (const f of rawFiles) {
        const key = `${f.name}_${f.size}`;
        if (!seen.has(key)) {
          seen.add(key);
          files.push(f);
        }
      }

      if (files.length === 0) {
        return jsonError('No file(s) provided in form-data', 400);
      }

      const docType = ((formData.get('documentType') as string) || 'BANK_STATEMENT') as 'BANK_STATEMENT' | 'INVOICE';
      const rawCategory = (formData.get('category') as string) || (docType === 'BANK_STATEMENT' ? 'BANK_ACTIVITY' : 'OTHER');
      const customVendor = formData.get('counterpartyName') as string | null;
      const customAmount = formData.get('amount') as string | null;
      const subType = (formData.get('subType') as string) || (docType === 'INVOICE' ? 'PAYABLE' : undefined);

      let manualMetadata: any = {};
      if (files.length === 1 && (customVendor || customAmount || subType || rawCategory)) {
        manualMetadata = {
          counterpartyName: customVendor,
          amount: customAmount ? parseFloat(customAmount) : undefined,
          invoiceNumber: formData.get('invoiceNumber'),
          dueDate: formData.get('dueDate'),
          gstin: formData.get('gstin'),
          type: subType,
          counterpartyType: subType === 'RECEIVABLE' ? 'CUSTOMER' : 'VENDOR',
          category: rawCategory !== 'OTHER' ? rawCategory : (subType === 'RECEIVABLE' ? 'CUSTOMER_INVOICE' : 'VENDOR_BILL'),
        };
      } else if (subType || rawCategory) {
        manualMetadata = {
          type: subType,
          counterpartyType: subType === 'RECEIVABLE' ? 'CUSTOMER' : 'VENDOR',
          category: rawCategory !== 'OTHER' ? rawCategory : (subType === 'RECEIVABLE' ? 'CUSTOMER_INVOICE' : 'VENDOR_BILL'),
        };
      }

      const processedResults: Array<{
        documentId: string;
        fileName: string;
        s3Key: string;
        status: 'success' | 'error';
        error?: string;
        pipelineSummary?: any;
      }> = [];

      for (const file of files) {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const fileBuffer = Buffer.from(arrayBuffer);
          const fileName = file.name || `upload_${Date.now()}`;
          const result = await ingestPdfBuffer(fileBuffer, fileName, docType, tenantId, rawCategory, manualMetadata);
          processedResults.push({
            documentId: result.documentId,
            fileName: result.fileName,
            s3Key: result.s3Key,
            status: 'success',
            pipelineSummary: result.pipelineResult?.summary || null,
          });
        } catch (err: any) {
          console.error(`[Ingestion API] Failed to ingest file "${file.name}":`, err);
          processedResults.push({
            documentId: '',
            fileName: file.name,
            s3Key: '',
            status: 'error',
            error: err?.message || String(err),
          });
        }
      }

      const successCount = processedResults.filter((r) => r.status === 'success').length;
      const failCount = processedResults.length - successCount;

      if (successCount === 0) {
        return NextResponse.json(
          {
            error: 'Failed to process uploaded documents',
            details: processedResults.map((r) => `${r.fileName}: ${r.error}`).join('; '),
            results: processedResults,
          },
          { status: 500 }
        );
      }

      // Re-run cash flow prediction & refresh financial store once for the entire batch
      const freshMetrics = await restartPredictionAndRefreshMetrics({
        tenantId,
        reason:
          files.length > 1
            ? `${successCount} Document(s) Ingested in Bulk (${docType})`
            : docType === 'BANK_STATEMENT'
            ? `New Bank Statement Ingested (${files[0].name})`
            : `New Invoice/Bill Ingested (${files[0].name})`,
        sourceDocType: docType,
      });

      const firstSuccess = processedResults.find((r) => r.status === 'success');

      return NextResponse.json({
        success: true,
        totalCount: files.length,
        successCount,
        failCount,
        documentId: firstSuccess?.documentId,
        fileName: firstSuccess?.fileName,
        s3Key: firstSuccess?.s3Key,
        documentType: docType,
        message:
          files.length === 1
            ? docType === 'BANK_STATEMENT'
              ? `Successfully processed and recorded bank statement transactions. Cash flow prediction restarted with new balance.`
              : `Successfully processed and recorded bill/invoice. Cash flow prediction restarted with new commitments.`
            : `Successfully processed ${successCount} of ${files.length} documents. Cash flow records and predictions have been updated.`,
        pipelineSummary: firstSuccess?.pipelineSummary || null,
        results: processedResults,
        predictionSummary: {
          modelName: freshMetrics.mlForecast?.modelName,
          solvencyStatus: freshMetrics.solvencyStatus,
          daysToZero: freshMetrics.daysToZero,
        },
      });
    }

    return jsonError('Unsupported Content-Type', 400);
  } catch (err: any) {
    console.error('Failed to ingest document:', err);
    if (err instanceof AuthenticationError) return jsonError(err.message, 401);
    if (err instanceof AuthenticationConfigurationError) return jsonError(err.message, 503);
    return jsonError(err?.message || 'Document ingestion failed', 500);
  }
}
