import { NextResponse } from 'next/server';
import { AuthenticationConfigurationError, AuthenticationError, requirePrincipal } from '@/lib/server-auth';
import { getOnboardingStatus } from '@/lib/onboarding-store';

function authError(error: unknown) {
  if (error instanceof AuthenticationConfigurationError) return NextResponse.json({ error: error.message }, { status: 503 });
  if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
  return null;
}

export async function GET(request: Request) {
  try {
    const tenantId = await requirePrincipal(request);
    const { onboarding, readiness, documents } = await getOnboardingStatus(tenantId);
    return NextResponse.json({
      onboarding: {
        status: onboarding.status,
        currentStep: onboarding.currentStep,
        profile: onboarding.profile,
        financialSettings: onboarding.financialSettings,
        applicableCategories: onboarding.applicableCategories,
        coverage: onboarding.coverage,
        attestations: onboarding.attestations,
        confirmations: onboarding.confirmations,
      },
      readiness,
      documents,
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return authError(error) || NextResponse.json({ error: 'Failed to load onboarding status.' }, { status: 500 });
  }
}
