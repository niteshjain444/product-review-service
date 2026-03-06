import { NextRequest, NextResponse } from 'next/server';
import { getProductReviews, getReviewStatistics } from '@/lib/reviewService';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('product_id');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');
    const onlyVerified = searchParams.get('verified_only') === 'true';

    if (!productId) {
      return NextResponse.json(
        { error: 'product_id is required' },
        { status: 400 }
      );
    }

    const [{ reviews, total }, statistics] = await Promise.all([
      getProductReviews(productId, limit, offset, onlyVerified),
      getReviewStatistics(productId),
    ]);

    return NextResponse.json({
      reviews,
      total,
      statistics,
      pagination: {
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    console.error('Error fetching product reviews:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
