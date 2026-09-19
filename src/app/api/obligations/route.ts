import { NextResponse } from 'next/server';
import {
  listObligations,
  createObligation,
  upsertSupplierProfile,
} from '@/lib/obligation-store';
import type { CreateObligationInput, ObligationFilters } from '@/lib/obligation-store';

/**
 * GET /api/obligations — List all obligations with optional filters
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const filters: ObligationFilters = {};
    const type = searchParams.get('type');
    const category = searchParams.get('category');
    const status = searchParams.get('status');
    const fromDate = searchParams.get('fromDate');
    const toDate = searchParams.get('toDate');

    if (type) filters.type = type as ObligationFilters['type'];
    if (category) filters.category = category as ObligationFilters['category'];
    if (status) filters.status = status as ObligationFilters['status'];
    if (fromDate) filters.fromDate = fromDate;
    if (toDate) filters.toDate = toDate;

    const obligations = await listObligations(undefined, filters);

    return NextResponse.json({ obligations, count: obligations.length });
  } catch (err: any) {
    console.error('Failed to list obligations:', err);
    return NextResponse.json(
      { error: 'Failed to list obligations', details: err?.message || String(err) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/obligations — Create a new obligation
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.title || !body.amount || !body.type) {
      return NextResponse.json(
        { error: 'Missing required fields: title, amount, type' },
        { status: 400 }
      );
    }

    if (!['PAYABLE', 'RECEIVABLE'].includes(body.type)) {
      return NextResponse.json(
        { error: 'type must be PAYABLE or RECEIVABLE' },
        { status: 400 }
      );
    }

    // If supplier obligation, upsert the supplier profile
    let supplierId = body.supplierId;
    if (body.category === 'VENDOR_BILL' && body.counterpartyName && !supplierId) {
      try {
        supplierId = await upsertSupplierProfile({
          supplierName: body.counterpartyName,
          creditPeriodDays: body.creditPeriodDays,
          paymentTermsText: body.paymentTermsText,
        });
      } catch (err) {
        console.warn('Failed to upsert supplier profile:', err);
      }
    }

    const input: CreateObligationInput = {
      title: body.title,
      counterpartyName: body.counterpartyName,
      amount: Number(body.amount),
      dueDate: body.dueDate,
      type: body.type,
      category: body.category || 'OTHER',
      isStatutory: body.isStatutory,
      penaltyRatePerDay: body.penaltyRatePerDay ? Number(body.penaltyRatePerDay) : undefined,
      supplierId,
      productId: body.productId,
      allowPartialPayment: body.allowPartialPayment,
      isRecurring: body.isRecurring,
      frequency: body.frequency,
      dueDayOfMonth: body.dueDayOfMonth ? Number(body.dueDayOfMonth) : undefined,
      notes: body.notes,
    };

    const obligation = await createObligation(input);

    return NextResponse.json({ obligation }, { status: 201 });
  } catch (err: any) {
    console.error('Failed to create obligation:', err);
    return NextResponse.json(
      { error: 'Failed to create obligation', details: err?.message || String(err) },
      { status: 500 }
    );
  }
}
