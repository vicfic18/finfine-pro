import { NextResponse } from 'next/server';
import {
  getLatestStatutoryAdvisory,
  executeStatutoryCronSync,
} from '@/lib/statutory-cron-service';
import { getMerchantSettings } from '@/lib/financial-store';
import { requirePrincipal } from '@/lib/server-auth';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sectorParam = searchParams.get('sector');

    let tenantId = process.env.FINFINE_TENANT_ID || 'msme-001';
    try {
      tenantId = await requirePrincipal(request);
    } catch {
      // Non-fatal fallback in development
    }

    let sector = sectorParam;
    if (!sector) {
      const settings = await getMerchantSettings(tenantId);
      sector = settings?.businessSector || 'Retail & Distribution';
    }

    const advisory = await getLatestStatutoryAdvisory(sector);

    return NextResponse.json(advisory, {
      headers: {
        'Cache-Control': 'private, max-age=60, stale-while-revalidate=300',
      },
    });
  } catch (err: any) {
    console.error('Failed to load statutory advisory from DynamoDB:', err);
    return NextResponse.json(
      {
        error: 'Failed to load statutory advisory',
        details: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    let tenantId = process.env.FINFINE_TENANT_ID || 'msme-001';
    try {
      tenantId = await requirePrincipal(request);
    } catch {
      // Non-fatal fallback in development
    }

    const body = await request.json().catch(() => ({}));
    let sector = body.sector;

    if (!sector) {
      const settings = await getMerchantSettings(tenantId);
      sector = settings?.businessSector || 'Retail & Distribution';
    }

    const result = await executeStatutoryCronSync({
      triggerSource: 'MANUAL_REFRESH',
      businessSector: sector,
    });

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (err: any) {
    console.error('Failed to execute manual statutory sync:', err);
    return NextResponse.json(
      {
        error: 'Failed to execute statutory sync',
        details: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}
