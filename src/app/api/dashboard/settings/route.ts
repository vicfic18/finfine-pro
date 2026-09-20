import { NextResponse } from 'next/server';
import {
  getMerchantSettings,
  saveMerchantSettings,
  resetTenantData,
  invalidateDashboardCache,
} from '@/lib/financial-store';
import { AuthenticationConfigurationError, AuthenticationError } from '@/lib/server-auth';
import { OnboardingRequiredError, requireCompletedOnboarding } from '@/lib/onboarding-store';

export async function GET(request: Request) {
  try {
    const tenantId = await requireCompletedOnboarding(request);
    const settings = await getMerchantSettings(tenantId);
    return NextResponse.json(settings);
  } catch (err: unknown) {
    if (err instanceof AuthenticationConfigurationError) return NextResponse.json({ error: err.message }, { status: 503 });
    if (err instanceof AuthenticationError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof OnboardingRequiredError) return NextResponse.json({ error: err.message, code: err.code, readiness: err.readiness }, { status: 403 });
    console.error('Failed to get merchant settings:', err);
    return NextResponse.json(
      { error: 'Failed to get settings', details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const tenantId = await requireCompletedOnboarding(request);
    const body = await request.json();
    const updated = await saveMerchantSettings(body, tenantId);
    invalidateDashboardCache();
    return NextResponse.json(updated);
  } catch (err: unknown) {
    if (err instanceof AuthenticationConfigurationError) return NextResponse.json({ error: err.message }, { status: 503 });
    if (err instanceof AuthenticationError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof OnboardingRequiredError) return NextResponse.json({ error: err.message, code: err.code, readiness: err.readiness }, { status: 403 });
    console.error('Failed to update merchant settings:', err);
    return NextResponse.json(
      { error: 'Failed to update settings', details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const tenantId = await requireCompletedOnboarding(request);
    const result = await resetTenantData(tenantId);
    invalidateDashboardCache();
    return NextResponse.json({
      success: true,
      message: 'Account financial data reset successfully',
      ...result,
    });
  } catch (err: unknown) {
    if (err instanceof AuthenticationConfigurationError) return NextResponse.json({ error: err.message }, { status: 503 });
    if (err instanceof AuthenticationError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof OnboardingRequiredError) return NextResponse.json({ error: err.message, code: err.code, readiness: err.readiness }, { status: 403 });
    console.error('Failed to reset tenant data:', err);
    return NextResponse.json(
      { error: 'Failed to reset account data', details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
