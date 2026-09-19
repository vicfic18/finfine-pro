import { NextResponse } from 'next/server';
import {
  getObligation,
  updateObligation,
  deleteObligation,
} from '@/lib/obligation-store';

/**
 * GET /api/obligations/[id] — Get a single obligation by ID
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const obligation = await getObligation(id);

    if (!obligation) {
      return NextResponse.json(
        { error: 'Obligation not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ obligation });
  } catch (err: any) {
    console.error('Failed to get obligation:', err);
    return NextResponse.json(
      { error: 'Failed to get obligation', details: err?.message || String(err) },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/obligations/[id] — Update an obligation
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const updated = await updateObligation(id, body);

    if (!updated) {
      return NextResponse.json(
        { error: 'Obligation not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ obligation: updated });
  } catch (err: any) {
    console.error('Failed to update obligation:', err);
    return NextResponse.json(
      { error: 'Failed to update obligation', details: err?.message || String(err) },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/obligations/[id] — Delete an obligation
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const deleted = await deleteObligation(id);

    if (!deleted) {
      return NextResponse.json(
        { error: 'Failed to delete obligation' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Failed to delete obligation:', err);
    return NextResponse.json(
      { error: 'Failed to delete obligation', details: err?.message || String(err) },
      { status: 500 }
    );
  }
}
