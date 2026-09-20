import { NextResponse } from 'next/server';
import { AuthenticationConfigurationError, AuthenticationError, requirePrincipal } from '@/lib/server-auth';
import { completeOnboarding, type OnboardingPatch } from '@/lib/onboarding-store';

export async function POST(request: Request) {
  try {
    const tenantId = await requirePrincipal(request);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (body) {
      const patch: OnboardingPatch = {};
      for (const field of ['profile', 'financialSettings', 'applicableCategories', 'coverage', 'attestations', 'confirmations', 'currentStep'] as const) {
        if (Object.prototype.hasOwnProperty.call(body, field)) patch[field] = body[field] as never;
      }
      return NextResponse.json(await completeOnboarding(tenantId, patch), { headers: { 'Cache-Control': 'private, no-store' } });
    }
    return NextResponse.json(await completeOnboarding(tenantId), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof AuthenticationConfigurationError) return NextResponse.json({ error: error.message }, { status: 503 });
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ONBOARDING_NOT_READY') {
      return NextResponse.json({ error: 'Onboarding is not ready to complete.', readiness: (error as unknown as { readiness: unknown }).readiness }, { status: 422 });
    }
    const details = error instanceof Error ? {
      name: error.name,
      message: error.message,
      cancellationReasons: (error as Error & { CancellationReasons?: unknown }).CancellationReasons,
    } : error;
    console.error('Onboarding completion failed', details);
    return NextResponse.json({
      error: process.env.NODE_ENV === 'development' && error instanceof Error ? error.message : 'Failed to complete onboarding.',
    }, { status: 500 });
  }
}
