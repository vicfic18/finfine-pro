import { NextResponse } from 'next/server';
import {
  getTaxComplianceRules,
  getMerchantTaxProfile,
  saveMerchantTaxProfile,
} from '@/lib/tax-compliance-store';
import { matchApplicableTaxRules } from '@/lib/tax-rules-engine';

export async function GET() {
  try {
    const [rules, profile] = await Promise.all([
      getTaxComplianceRules(),
      getMerchantTaxProfile(),
    ]);

    const matchedRules = matchApplicableTaxRules(profile, rules);

    return NextResponse.json({
      profile,
      rules,
      matchedRules,
    });
  } catch (err: any) {
    console.error('Failed to get compliance rules:', err);
    return NextResponse.json(
      { error: 'Failed to retrieve compliance rules', details: err?.message || String(err) },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const updatedProfile = await saveMerchantTaxProfile(body);
    const rules = await getTaxComplianceRules();
    const matchedRules = matchApplicableTaxRules(updatedProfile, rules);

    return NextResponse.json({
      success: true,
      profile: updatedProfile,
      matchedRules,
    });
  } catch (err: any) {
    console.error('Failed to update compliance profile:', err);
    return NextResponse.json(
      { error: 'Failed to update compliance profile', details: err?.message || String(err) },
      { status: 500 }
    );
  }
}
