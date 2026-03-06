import { supabase } from './supabase';

export type ReviewStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'FLAGGED'
  | 'PUBLISHED'
  | 'ARCHIVED';

export interface Review {
  id: string;
  product_id: string;
  customer_id: string;
  customer_email: string | null;
  customer_name: string;
  rating: number;
  title: string;
  review_text: string;
  verified_purchase: boolean;
  status: ReviewStatus;
  risk_score: number;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  helpful_count: number;
  unhelpful_count: number;
}

export interface ReviewStatistics {
  product_id: string;
  average_rating: number;
  total_reviews: number;
  verified_reviews: number;
  rating_breakdown: {
    '1': number;
    '2': number;
    '3': number;
    '4': number;
    '5': number;
  };
  last_updated: string;
}

export async function submitReview(
  productId: string,
  customerId: string,
  customerName: string,
  customerEmail: string | null,
  rating: number,
  title: string,
  reviewText: string,
  verifiedPurchase: boolean,
  riskScore: number
): Promise<{ data: Review | null; error: any }> {
  const { data, error } = await supabase
    .from('reviews')
    .insert([
      {
        product_id: productId,
        customer_id: customerId,
        customer_name: customerName,
        customer_email: customerEmail,
        rating,
        title,
        review_text: reviewText,
        verified_purchase: verifiedPurchase,
        risk_score: riskScore,
        status: 'PENDING',
      },
    ])
    .select()
    .single();

  return { data, error };
}

export async function getReviewById(reviewId: string): Promise<Review | null> {
  const { data, error } = await supabase
    .from('reviews')
    .select('*')
    .eq('id', reviewId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching review:', error);
    return null;
  }

  return data;
}

export async function getProductReviews(
  productId: string,
  limit: number = 20,
  offset: number = 0,
  onlyVerified: boolean = false
): Promise<{ reviews: Review[]; total: number }> {
  let query = supabase
    .from('reviews')
    .select('*', { count: 'exact' })
    .eq('product_id', productId)
    .eq('status', 'PUBLISHED')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (onlyVerified) {
    query = query.eq('verified_purchase', true);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('Error fetching product reviews:', error);
    return { reviews: [], total: 0 };
  }

  return { reviews: data || [], total: count || 0 };
}

export async function getReviewStatistics(
  productId: string
): Promise<ReviewStatistics | null> {
  const { data, error } = await supabase
    .from('review_statistics')
    .select('*')
    .eq('product_id', productId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching statistics:', error);
    return null;
  }

  return data;
}

export async function updateReviewStatus(
  reviewId: string,
  newStatus: ReviewStatus,
  changeReason: string,
  rejectionReason?: string
): Promise<{ success: boolean; error?: any }> {
  const review = await getReviewById(reviewId);
  if (!review) {
    return { success: false, error: 'Review not found' };
  }

  const oldStatus = review.status;

  const updateData: any = {
    status: newStatus,
    updated_at: new Date().toISOString(),
  };

  if (rejectionReason) {
    updateData.rejection_reason = rejectionReason;
  }

  if (newStatus === 'PUBLISHED') {
    updateData.published_at = new Date().toISOString();
  }

  const { error: updateError } = await supabase
    .from('reviews')
    .update(updateData)
    .eq('id', reviewId);

  if (updateError) {
    return { success: false, error: updateError };
  }

  await recordReviewHistory(reviewId, oldStatus, newStatus, changeReason);

  if (newStatus === 'PUBLISHED' || oldStatus === 'PUBLISHED') {
    await refreshReviewStatistics(review.product_id);
  }

  return { success: true };
}

export async function recordReviewHistory(
  reviewId: string,
  oldStatus: string,
  newStatus: string,
  changeReason: string,
  changedBy: string = 'system'
): Promise<void> {
  const { error } = await supabase.from('review_history').insert([
    {
      review_id: reviewId,
      old_status: oldStatus,
      new_status: newStatus,
      changed_by: changedBy,
      change_reason: changeReason,
    },
  ]);

  if (error) {
    console.error('Error recording review history:', error);
  }
}

export async function checkRateLimits(
  customerId: string,
  productId: string
): Promise<{ allowed: boolean; reason?: string }> {
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('customer_review_limits')
    .select('*')
    .eq('customer_id', customerId)
    .eq('product_id', productId)
    .maybeSingle();

  if (error) {
    console.error('Error checking rate limits:', error);
    return { allowed: true };
  }

  if (!data) {
    return { allowed: true };
  }

  const lastResetDate = data.last_reset_date;
  const needsReset = lastResetDate !== today;

  let countToday = data.count_today;
  let countThisMonth = data.count_this_month;
  let reviewsPerProduct = data.reviews_per_product;

  if (needsReset && lastResetDate !== today) {
    countToday = 0;
    countThisMonth += countToday;
  }

  if (reviewsPerProduct >= 3) {
    return {
      allowed: false,
      reason: 'You have already submitted the maximum (3) reviews for this product',
    };
  }

  if (countToday >= 10) {
    return {
      allowed: false,
      reason: 'You have reached the daily review submission limit (10 per day)',
    };
  }

  if (countThisMonth >= 100) {
    return {
      allowed: false,
      reason: 'You have reached the monthly review submission limit (100 per month)',
    };
  }

  return { allowed: true };
}

export async function incrementReviewLimits(
  customerId: string,
  productId: string
): Promise<void> {
  const today = new Date().toISOString().split('T')[0];

  const { data: existingData } = await supabase
    .from('customer_review_limits')
    .select('*')
    .eq('customer_id', customerId)
    .eq('product_id', productId)
    .maybeSingle();

  if (!existingData) {
    await supabase.from('customer_review_limits').insert([
      {
        customer_id: customerId,
        product_id: productId,
        count_today: 1,
        count_this_month: 1,
        reviews_per_product: 1,
        last_reset_date: today,
      },
    ]);
  } else {
    const lastResetDate = existingData.last_reset_date;
    const isNewDay = lastResetDate !== today;

    await supabase
      .from('customer_review_limits')
      .update({
        count_today: isNewDay ? 1 : existingData.count_today + 1,
        count_this_month: existingData.count_this_month + 1,
        reviews_per_product: existingData.reviews_per_product + 1,
        last_reset_date: today,
      })
      .eq('customer_id', customerId)
      .eq('product_id', productId);
  }
}

export async function addToModerationQueue(
  reviewId: string,
  priority: 'HIGH' | 'MEDIUM' | 'LOW',
  reason: string
): Promise<void> {
  const { error } = await supabase.from('moderation_queue').insert([
    {
      review_id: reviewId,
      priority,
      reason,
      created_at: new Date().toISOString(),
    },
  ]);

  if (error) {
    console.error('Error adding to moderation queue:', error);
  }
}

export async function refreshReviewStatistics(productId: string): Promise<void> {
  const { data: reviews, error: reviewsError } = await supabase
    .from('reviews')
    .select('rating, verified_purchase')
    .eq('product_id', productId)
    .eq('status', 'PUBLISHED');

  if (reviewsError || !reviews) {
    console.error('Error fetching reviews for statistics:', reviewsError);
    return;
  }

  if (reviews.length === 0) {
    await supabase
      .from('review_statistics')
      .upsert(
        {
          product_id: productId,
          average_rating: 0,
          total_reviews: 0,
          verified_reviews: 0,
          rating_breakdown: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
          last_updated: new Date().toISOString(),
        },
        { onConflict: 'product_id' }
      );
    return;
  }

  const ratingBreakdown = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
  let totalRating = 0;
  let verifiedCount = 0;

  for (const review of reviews) {
    totalRating += review.rating;
    ratingBreakdown[review.rating as keyof typeof ratingBreakdown]++;
    if (review.verified_purchase) {
      verifiedCount++;
    }
  }

  const averageRating = parseFloat((totalRating / reviews.length).toFixed(2));

  const { error: updateError } = await supabase
    .from('review_statistics')
    .upsert(
      {
        product_id: productId,
        average_rating: averageRating,
        total_reviews: reviews.length,
        verified_reviews: verifiedCount,
        rating_breakdown: ratingBreakdown,
        last_updated: new Date().toISOString(),
      },
      { onConflict: 'product_id' }
    );

  if (updateError) {
    console.error('Error updating statistics:', updateError);
  }
}

export async function getProductById(productId: string) {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', productId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching product:', error);
    return null;
  }

  return data;
}

export async function createProduct(
  name: string,
  description: string,
  category: string,
  sku: string
) {
  const { data, error } = await supabase
    .from('products')
    .insert([{ name, description, category, sku }])
    .select()
    .single();

  if (error) {
    console.error('Error creating product:', error);
    return null;
  }

  await supabase.from('review_statistics').insert([
    {
      product_id: data.id,
      average_rating: 0,
      total_reviews: 0,
      verified_reviews: 0,
      rating_breakdown: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
    },
  ]);

  return data;
}
