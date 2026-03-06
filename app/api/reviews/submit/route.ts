import { NextRequest, NextResponse } from 'next/server';
import { validateReviewSubmission, shouldAutoApprove, shouldAutoReject, shouldFlag } from '@/lib/validation';
import {
  submitReview,
  checkRateLimits,
  incrementReviewLimits,
  updateReviewStatus,
  addToModerationQueue,
} from '@/lib/reviewService';
import { supabase } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      product_id,
      customer_id,
      customer_name,
      customer_email,
      rating,
      title,
      review_text,
      verified_purchase = false,
    } = body;

    if (!product_id || !customer_id || !customer_name || !rating || !title || !review_text) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Name: letters, spaces, hyphens, apostrophes only; 2–100 chars; no digits
    const trimmedName = customer_name.trim();
    if (trimmedName.length < 2 || trimmedName.length > 100) {
      return NextResponse.json(
        { error: 'Name must be between 2 and 100 characters' },
        { status: 400 }
      );
    }
    if (!/^[A-Za-z\s'\-\.]+$/.test(trimmedName)) {
      return NextResponse.json(
        { error: 'Name can only contain letters, spaces, hyphens, and apostrophes' },
        { status: 400 }
      );
    }

    // Email: required and must be a valid format
    if (!customer_email || !customer_email.trim()) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }
    if (!/^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/.test(customer_email.trim())) {
      return NextResponse.json(
        { error: 'Please provide a valid email address' },
        { status: 400 }
      );
    }

    // Enforce 1 review per email per product
    if (customer_email) {
      const { data: existingReview } = await supabase
        .from('reviews')
        .select('id')
        .eq('product_id', product_id)
        .eq('customer_email', customer_email.toLowerCase())
        .not('status', 'eq', 'REJECTED')
        .maybeSingle();

      if (existingReview) {
        return NextResponse.json(
          { error: 'You have already submitted a review for this product.' },
          { status: 409 }
        );
      }
    }

    const rateLimitCheck = await checkRateLimits(customer_id, product_id);
    if (!rateLimitCheck.allowed) {
      return NextResponse.json(
        { error: rateLimitCheck.reason || 'Rate limit exceeded' },
        { status: 429 }
      );
    }

    const validation = validateReviewSubmission(rating, title, review_text);
    if (!validation.valid) {
      const firstError = validation.errors[0];
      return NextResponse.json(
        {
          error: firstError?.message || 'Validation failed',
          field: firstError?.field,
          details: validation.errors,
        },
        { status: 400 }
      );
    }

    const riskScore = validation.riskScore;
    const flags = validation.flags;

    // Always save the review first so rejected ones are recorded and viewable
    const { data: review, error: submitError } = await submitReview(
      product_id,
      customer_id,
      customer_name,
      customer_email || null,
      rating,
      title,
      review_text,
      verified_purchase,
      riskScore
    );

    if (submitError || !review) {
      console.error('Review submission error:', submitError);
      return NextResponse.json(
        { error: 'Failed to submit review', details: submitError?.message || 'Unknown error' },
        { status: 500 }
      );
    }

    await incrementReviewLimits(customer_id, product_id);

    // Auto-reject: score >= 75 (garbage text = 80, profanity = 80 per word)
    const autoRejectCheck = shouldAutoReject(riskScore);
    if (autoRejectCheck.reject) {
      const rejectionReason = `Auto-rejected. Risk score: ${riskScore}. Reasons: ${flags.join('; ')}.`;
      await updateReviewStatus(review.id, 'REJECTED', rejectionReason, rejectionReason);
      return NextResponse.json(
        {
          id: review.id,
          status: 'RECEIVED',
          message: 'Review submitted successfully.',
        },
        { status: 201 }
      );
    }

    // Check flag BEFORE auto-approve — scores 26-74 must go to moderation
    if (shouldFlag(riskScore)) {
      await updateReviewStatus(
        review.id,
        'FLAGGED',
        'Flagged for manual review: elevated risk score'
      );

      const priority = riskScore >= 60 ? 'HIGH' : riskScore >= 40 ? 'MEDIUM' : 'LOW';
      const moderationNote = `Risk score: ${riskScore}. Reasons: ${flags.join('; ')}.`;
      await addToModerationQueue(review.id, priority, moderationNote);

      return NextResponse.json(
        {
          id: review.id,
          status: 'FLAGGED',
          message: 'Review submitted and is pending moderation before publication',
        },
        { status: 201 }
      );
    }

    // Only reaches here for score 0-25
    await updateReviewStatus(
      review.id,
      'APPROVED',
      'Auto-approved: passed all validation checks'
    );

    await updateReviewStatus(
      review.id,
      'PUBLISHED',
      'Auto-published: low-risk review'
    );

    return NextResponse.json(
      {
        id: review.id,
        status: 'PUBLISHED',
        message: 'Review submitted and published successfully',
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error submitting review:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
