import { NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import * as fs from 'fs';
import * as path from 'path';
import {
  invalidateDashboardCache,
  getMerchantSettings,
  restartPredictionAndRefreshMetrics,
} from '@/lib/financial-store';
import {
  generateAllSampleDocuments,
  SAMPLE_DOCUMENTS_REGISTRY,
} from '../../../../../scripts/generate-sample-data';

const region = process.env.AWS_REGION || 'ap-south-1';
const bucketName =
  process.env.S3_BUCKET_NAME || 'amplify-finfinepro-vicfic-finfinedocumentstoragebu-nm3ks1cueqmt';
const tenantId = process.env.FINFINE_TENANT_ID || 'msme-001';

// Load deployed Lambda & Table ARNs from amplify_outputs.json if available
let outputsCustom: Record<string, any> = {};
try {
  const outputsPath = path.join(process.cwd(), 'amplify_outputs.json');
  if (fs.existsSync(outputsPath)) {
    const outputs = JSON.parse(fs.readFileSync(outputsPath, 'utf8'));
    outputsCustom = outputs.custom || {};
  }
} catch (e) {
  // Non-fatal
}

const extractorArn =
  process.env.DOCUMENT_EXTRACTOR_FUNCTION_ARN || outputsCustom.documentExtractorLambdaArn;
const normalizerArn =
  process.env.INGESTION_NORMALIZER_FUNCTION_ARN || outputsCustom.ingestionNormalizerLambdaArn;

// Canonical DynamoDB Tables
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

const s3Client = new S3Client({ region });
const lambdaClient = new LambdaClient({ region });

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
  manualMetadata: any = {}
) {
  const timestamp = Date.now() + Math.floor(Math.random() * 1000);
  const documentId = docType === 'BANK_STATEMENT' ? `stmt-${timestamp}` : `inv-${timestamp}`;
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
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
    manualMetadata,
  });

  const pipelineResult = await runIngestionNormalizer(extractOutput);
  return { documentId, s3Key, fileName: sanitizedFileName, pipelineResult };
}

/**
 * Ingests the complete MSME enterprise test dataset ONLY through real PDF documents
 * processed via Amazon S3 -> Document Extractor -> Ingestion Normalizer -> DynamoDB.
 * Absolutely ZERO direct database seeding.
 */
async function ingestCompleteEnterpriseSuite() {
  const settings = await getMerchantSettings(tenantId);
  const businessName = settings.businessName || 'My Business';

  // Ensure all sample PDFs exist on disk and reflect the business name
  await generateAllSampleDocuments(businessName);

  const sampleDir = path.join(process.cwd(), 'sample_data');
  const results = [];

  for (const item of SAMPLE_DOCUMENTS_REGISTRY) {
    const pdfPath = path.join(sampleDir, item.fileName);
    if (fs.existsSync(pdfPath)) {
      const pdfBuffer = fs.readFileSync(pdfPath);
      console.log(`[Ingestion Pipeline] Ingesting PDF: ${item.fileName} (${item.docType})...`);
      const res = await ingestPdfBuffer(pdfBuffer, item.fileName, item.docType);
      results.push({
        id: item.id,
        fileName: item.fileName,
        documentId: res.documentId,
        summary: res.pipelineResult?.summary,
      });
    }
  }

  await restartPredictionAndRefreshMetrics({
    reason: 'Complete MSME Suite Ingested',
    sourceDocType: 'MULTI_DOC_SUITE',
  });
  return results;
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
    const contentType = request.headers.get('content-type') || '';

    // -------------------------------------------------------------------------
    // A. JSON Payload (Quick Sample Ingestion)
    // -------------------------------------------------------------------------
    if (contentType.includes('application/json')) {
      const body = await request.json();

      if (body.useSample || body.sampleSet === 'COMPLETE') {
        const sampleType = body.sampleType || 'COMPLETE';
        const sampleDir = path.join(process.cwd(), 'sample_data');
        const settings = await getMerchantSettings(tenantId);
        const businessName = settings.businessName || 'My Business';

        if (sampleType === 'COMPLETE' || !body.sampleType) {
          console.log('[Ingestion API] Ingesting complete MSME PDF test suite (14 documents)...');
          const results = await ingestCompleteEnterpriseSuite();
          const freshMetrics = await restartPredictionAndRefreshMetrics({
            reason: 'Complete Enterprise Suite Ingested',
            sourceDocType: 'BANK_STATEMENT_AND_INVOICES',
          });

          return NextResponse.json({
            success: true,
            sampleType: 'COMPLETE',
            documentsProcessed: results.length,
            message: `All ${results.length} MSME sample PDF documents parsed, extracted, and normalized through Amazon S3 & DynamoDB pipeline! Cash flow prediction restarted.`,
            featuresActivated: [
              'Cash Runway & Spendable Liquidity Ribbon',
              'Statutory Tax Lockbox (GST + TDS + EPFO)',
              '60-Day Cash Flow Trajectory with Itemized Day Events',
              'Risk Calendar Heatmap & Paginated Schedule Table',
              'What-If Cash Simulator with Conflict Detection',
              'Statutory Rails (GSTR-3B & Challan 281 Countdowns)',
              'Obligations View (Fixed Overhead vs Trade Suppliers & Debtor Realities)',
              'Working Capital Cycle (DSO, DIO, DPO, CCC)',
              'Entity Relationship Graph (@xyflow/react)',
            ],
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
        const result = await ingestPdfBuffer(fileBuffer, matched.fileName, matched.docType);
        const freshMetrics = await restartPredictionAndRefreshMetrics({
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

        const result = await ingestPdfBuffer(fileBuffer, fileName, docType, manualMetadata);
        const freshMetrics = await restartPredictionAndRefreshMetrics({
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

      throw new Error('Unsupported JSON payload. Provide useSample: true or rawBase64.');
    }

    // -------------------------------------------------------------------------
    // B. Multipart/form-data (Manual File Upload from Computer)
    // -------------------------------------------------------------------------
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      const docType = ((formData.get('documentType') as string) || 'BANK_STATEMENT') as 'BANK_STATEMENT' | 'INVOICE';
      const customVendor = formData.get('counterpartyName') as string | null;
      const customAmount = formData.get('amount') as string | null;

      let manualMetadata: any = {};
      if (customVendor || customAmount) {
        manualMetadata = {
          counterpartyName: customVendor,
          amount: customAmount ? parseFloat(customAmount) : undefined,
          invoiceNumber: formData.get('invoiceNumber'),
          dueDate: formData.get('dueDate'),
          gstin: formData.get('gstin'),
        };
      }

      if (!file) {
        return NextResponse.json({ error: 'No file provided in form-data' }, { status: 400 });
      }

      const arrayBuffer = await file.arrayBuffer();
      const fileBuffer = Buffer.from(arrayBuffer);
      const fileName = file.name || `upload_${Date.now()}`;

      const result = await ingestPdfBuffer(fileBuffer, fileName, docType, manualMetadata);
      const freshMetrics = await restartPredictionAndRefreshMetrics({
        reason: docType === 'BANK_STATEMENT' ? `New Bank Statement Ingested (${fileName})` : `New Invoice/Bill Ingested (${fileName})`,
        sourceDocType: docType,
      });

      return NextResponse.json({
        success: true,
        documentId: result.documentId,
        fileName: result.fileName,
        s3Key: result.s3Key,
        documentType: docType,
        message:
          docType === 'BANK_STATEMENT'
            ? `Successfully processed and recorded bank statement transactions. Cash flow prediction restarted with new balance.`
            : `Successfully processed and recorded bill/invoice. Cash flow prediction restarted with new commitments.`,
        pipelineSummary: result.pipelineResult?.summary || null,
        predictionSummary: {
          modelName: freshMetrics.mlForecast?.modelName,
          solvencyStatus: freshMetrics.solvencyStatus,
          daysToZero: freshMetrics.daysToZero,
        },
      });
    }

    return NextResponse.json({ error: 'Unsupported Content-Type' }, { status: 400 });
  } catch (err: any) {
    console.error('Failed to ingest document:', err);
    return NextResponse.json(
      { error: 'Document ingestion failed', details: err?.message || String(err) },
      { status: 500 }
    );
  }
}
