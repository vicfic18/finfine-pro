import { NextResponse } from 'next/server';
import {
  getMerchantSettings,
  saveMerchantSettings,
  resetTenantData,
  invalidateDashboardCache,
  restartPredictionAndRefreshMetrics,
} from '@/lib/financial-store';

export async function GET() {
  try {
    const settings = await getMerchantSettings();
    return NextResponse.json(settings);
  } catch (err: any) {
    console.error('Failed to get merchant settings:', err);
    return NextResponse.json(
      { error: 'Failed to get settings', details: err?.message || String(err) },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const updated = await saveMerchantSettings(body);
    await restartPredictionAndRefreshMetrics({ reason: 'Merchant Financial Settings Updated' });
    return NextResponse.json(updated);
  } catch (err: any) {
    console.error('Failed to update merchant settings:', err);
    return NextResponse.json(
      { error: 'Failed to update settings', details: err?.message || String(err) },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const result = await resetTenantData();
    const freshMetrics = await restartPredictionAndRefreshMetrics({
      reason: 'Complete Account Reset & Data Deletion',
    });
    return NextResponse.json({
      success: true,
      message: 'Account financial data reset successfully. Cache cleared & baseline cash flow prediction restarted.',
      predictionRestarted: true,
      solvencyStatus: freshMetrics.solvencyStatus,
      daysToZero: freshMetrics.daysToZero,
      ...result,
    });
  } catch (err: any) {
    console.error('Failed to reset tenant data:', err);
    return NextResponse.json(
      { error: 'Failed to reset account data', details: err?.message || String(err) },
      { status: 500 }
    );
  }
}
