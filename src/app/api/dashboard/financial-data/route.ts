import { NextResponse } from 'next/server';
import { fetchDashboardData } from '@/lib/financial-store';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get('refresh') === 'true';

    const data = await fetchDashboardData({ forceRefresh });

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': forceRefresh
          ? 'no-cache, no-store, must-revalidate'
          : 'private, max-age=30, stale-while-revalidate=120',
      },
    });
  } catch (err: any) {
    console.error('Failed to load dashboard metrics from DynamoDB:', err);
    return NextResponse.json(
      { error: 'Failed to compute dashboard metrics', details: err?.message || String(err) },
      { status: 500 }
    );
  }
}
