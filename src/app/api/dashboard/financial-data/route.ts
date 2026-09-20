import { NextResponse } from 'next/server';
import { fetchDashboardData } from '@/lib/financial-store';
import { AuthenticationConfigurationError, AuthenticationError } from '@/lib/server-auth';
import { OnboardingRequiredError, requireCompletedOnboarding } from '@/lib/onboarding-store';

export async function GET(request: Request) {
  try {
    const tenantId = await requireCompletedOnboarding(request);
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get('refresh') === 'true';

    const data = await fetchDashboardData({ forceRefresh, tenantId });

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': forceRefresh
          ? 'no-cache, no-store, must-revalidate'
          : 'private, max-age=30, stale-while-revalidate=120',
      },
    });
  } catch (err: unknown) {
    if (err instanceof AuthenticationConfigurationError) return NextResponse.json({ error: err.message }, { status: 503 });
    if (err instanceof AuthenticationError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof OnboardingRequiredError) return NextResponse.json({ error: err.message, code: err.code, readiness: err.readiness }, { status: 403 });
    console.error('Failed to load dashboard metrics from DynamoDB:', err);
    return NextResponse.json(
      { error: 'Failed to compute dashboard metrics', details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
