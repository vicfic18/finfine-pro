import { NextResponse } from 'next/server';
import { AuthenticationConfigurationError, AuthenticationError, requirePrincipal } from '@/lib/server-auth';
import { getOnboarding, getReadiness, updateOnboarding, type OnboardingPatch } from '@/lib/onboarding-store';

function authError(error: unknown) {
  if (
    error instanceof AuthenticationConfigurationError ||
    (error as { name?: string })?.name === 'AuthenticationConfigurationError' ||
    (error as { status?: number })?.status === 503
  ) {
    return NextResponse.json({ error: (error as Error).message || 'Authentication is not configured.' }, { status: 503 });
  }
  if (
    error instanceof AuthenticationError ||
    (error as { name?: string })?.name === 'AuthenticationError' ||
    (error as { status?: number })?.status === 401
  ) {
    return NextResponse.json({ error: (error as Error).message || 'Authentication is required.' }, { status: 401 });
  }
  return null;
}

export async function PATCH(request: Request) {
  try {
    const tenantId = await requirePrincipal(request);
    const body = await request.json();
    const patch: OnboardingPatch = {};
    for (const field of ['status', 'currentStep', 'profile', 'financialSettings', 'applicableCategories', 'coverage', 'attestations', 'confirmations'] as const) {
      if (Object.prototype.hasOwnProperty.call(body, field)) patch[field] = body[field];
    }
    const onboarding = await updateOnboarding(tenantId, patch);
    const readiness = await getReadiness(tenantId, onboarding);
    return NextResponse.json({ onboarding, readiness }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('Error in PATCH /api/onboarding:', error);
    return authError(error) || NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to update onboarding.',
      detail: error instanceof Error ? error.message : String(error),
    }, { status: 400 });
  }
}

export async function GET(request: Request) {
  try {
    const tenantId = await requirePrincipal(request);
    const onboarding = await getOnboarding(tenantId);
    return NextResponse.json({ onboarding, readiness: await getReadiness(tenantId, onboarding) });
  } catch (error) {
    console.error('Error in GET /api/onboarding:', error);
    return authError(error) || NextResponse.json({
      error: 'Failed to load onboarding.',
      detail: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
