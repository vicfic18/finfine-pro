import { NextResponse } from 'next/server';
import { procureTaxRulesAndCalendarEvents } from '../../../../../scripts/procure-tax-rules';

export async function POST() {
  try {
    const result = await procureTaxRulesAndCalendarEvents();
    return NextResponse.json({
      success: true,
      message: 'Statutory compliance catalog and market calendar events procured successfully.',
      ...result,
    });
  } catch (err: any) {
    console.error('Failed to run tax procurement:', err);
    return NextResponse.json(
      { error: 'Failed to procure tax intelligence', details: err?.message || String(err) },
      { status: 500 }
    );
  }
}
