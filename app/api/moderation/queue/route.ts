import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const priority = searchParams.get('priority');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    let query = supabase
      .from('moderation_queue')
      .select(
        `
        *,
        reviews (
          id,
          product_id,
          customer_name,
          rating,
          title,
          review_text,
          risk_score,
          verified_purchase,
          created_at
        )
      `,
        { count: 'exact' }
      )
      .is('resolved_at', null)
      .order('risk_score', { referencedTable: 'reviews', ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (priority) {
      query = query.eq('priority', priority);
    }

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch moderation queue' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      queue: data || [],
      total: count || 0,
      pagination: {
        limit,
        offset,
        hasMore: offset + limit < (count || 0),
      },
    });
  } catch (error) {
    console.error('Error fetching moderation queue:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
