import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import {
  generateAllSampleDocuments,
  SAMPLE_DOCUMENTS_REGISTRY,
} from '../../../../../scripts/generate-sample-data';
import { getMerchantSettings } from '@/lib/financial-store';

const tenantId = process.env.FINFINE_TENANT_ID || 'msme-001';

/**
 * GET /api/ingestion/sample-files
 * Allows customer-side testers to download realistic MSME PDF sample files
 * to their local computers so they can test uploading via the UI dropzone.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const fileNameParam = searchParams.get('file');
    const idParam = searchParams.get('id');

    const sampleDir = path.join(process.cwd(), 'sample_data');
    if (!fs.existsSync(sampleDir)) {
      fs.mkdirSync(sampleDir, { recursive: true });
    }

    const settings = await getMerchantSettings(tenantId);
    const businessName = settings.businessName || 'My Business';

    // 1. If a specific file or ID is requested, download that PDF
    if (fileNameParam || idParam) {
      const targetDoc = SAMPLE_DOCUMENTS_REGISTRY.find(
        (d) => d.fileName === fileNameParam || d.id === idParam || d.fileName === `${idParam}.pdf`
      );

      const fileName = targetDoc ? targetDoc.fileName : fileNameParam;
      if (!fileName) {
        return NextResponse.json({ error: 'File not specified' }, { status: 400 });
      }

      const filePath = path.join(sampleDir, fileName);

      // Generate if missing
      if (!fs.existsSync(filePath)) {
        if (targetDoc) {
          await targetDoc.generator({ businessName, outputPath: filePath });
        } else {
          await generateAllSampleDocuments(businessName);
        }
      }

      if (!fs.existsSync(filePath)) {
        return NextResponse.json({ error: `File ${fileName} not found` }, { status: 404 });
      }

      const fileBuffer = fs.readFileSync(filePath);

      return new NextResponse(fileBuffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${fileName}"`,
          'Content-Length': fileBuffer.length.toString(),
          'Cache-Control': 'no-cache',
        },
      });
    }

    // 2. Otherwise, return list of all available sample documents with download links
    // Ensure all sample PDFs are generated on disk
    await generateAllSampleDocuments(businessName);

    const documents = SAMPLE_DOCUMENTS_REGISTRY.map((doc) => {
      const filePath = path.join(sampleDir, doc.fileName);
      const exists = fs.existsSync(filePath);
      const sizeBytes = exists ? fs.statSync(filePath).size : 0;

      return {
        id: doc.id,
        displayName: doc.displayName,
        fileName: doc.fileName,
        docType: doc.docType,
        description: doc.description,
        sizeKb: (sizeBytes / 1024).toFixed(1),
        downloadUrl: `/api/ingestion/sample-files?file=${encodeURIComponent(doc.fileName)}`,
      };
    });

    return NextResponse.json({
      success: true,
      count: documents.length,
      documents,
    });
  } catch (err: any) {
    console.error('Failed to handle sample-files request:', err);
    return NextResponse.json(
      { error: 'Failed to retrieve sample files', details: err?.message || String(err) },
      { status: 500 }
    );
  }
}
