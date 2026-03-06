import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { updateReviewStatus, ReviewStatus } from '@/lib/reviewService';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { review_id, decision, reason, moderator_id } = body;

    if (!review_id || !decision || !['APPROVED', 'REJECTED'].includes(decision)) {
      return NextResponse.json(
        { error: 'Invalid request. Decision must be APPROVED or REJECTED.' },
        { status: 400 }
      );
    }

    let newStatus: ReviewStatus = decision === 'APPROVED' ? 'APPROVED' : 'REJECTED';
    let rejectionReason = undefined;

    if (newStatus === 'REJECTED') {
      rejectionReason = reason || 'Rejected by moderator';
    }

    const updateResult = await updateReviewStatus(
      review_id,
      newStatus,
      `Moderation decision: ${decision}. Moderator: ${moderator_id || 'unknown'}`,
      rejectionReason
    );

    if (!updateResult.success) {
      return NextResponse.json(
        { error: 'Failed to update review status' },
        { status: 500 }
      );
    }

    if (newStatus === 'APPROVED') {
      const { error: publishError } = await supabase
        .from('reviews')
        .update({
          status: 'PUBLISHED',
          published_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', review_id);

      if (publishError) {
        return NextResponse.json(
          { error: 'Failed to publish review' },
          { status: 500 }
        );
      }
    }

    const { error: queueError } = await supabase
      .from('moderation_queue')
      .update({
        resolved_at: new Date().toISOString(),
        assigned_to: moderator_id,
      })
      .eq('review_id', review_id);

    if (queueError) {
      console.error('Error updating queue:', queueError);
    }

    return NextResponse.json({
      success: true,
      review_id,
      new_status: newStatus === 'APPROVED' ? 'PUBLISHED' : 'REJECTED',
      message: `Review ${newStatus === 'APPROVED' ? 'approved and published' : 'rejected'}`,
    });
  } catch (error) {
    console.error('Error in moderation decision:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
