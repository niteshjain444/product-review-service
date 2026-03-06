# Product Review System - Testing Guide

## Overview

This testing guide provides step-by-step instructions for validating the core workflows of the re-architected product review system.

## System Architecture

The review system implements a three-tier validation strategy:

1. **Synchronous Validation** (immediate feedback)
   - Required fields validation
   - Rating range (1-5)
   - Text length constraints
   - Rate limiting checks

2. **Asynchronous Risk Assessment**
   - Spam detection (URLs, suspicious patterns)
   - Profanity detection
   - Sentiment analysis
   - Risk scoring (0-100)

3. **Moderation Decision**
   - Auto-approve: Risk score ≤ 25
   - Flag for review: Risk score 26-40 (Medium)
   - Auto-reject: Risk score > 75 (High)

## Test Scenarios

### Scenario 1: Successful Review Submission (Auto-Published)

**Objective**: Verify that a legitimate review passes validation and is immediately published.

**Steps**:
1. Navigate to the application home page
2. Click "Demo Product" tab if not already there
3. Fill the review form with:
   - **Name**: "Test User 1"
   - **Email**: "test1@example.com"
   - **Rating**: 5 stars
   - **Verified Purchase**: Check the box
   - **Title**: "Excellent product quality"
   - **Review**: "This product exceeded my expectations. The quality is outstanding and delivery was fast. Highly recommended to all customers looking for value and reliability."

4. Click "Submit Review"

**Expected Outcome**:
- ✓ Form validation passes
- ✓ Review status shows "PUBLISHED"
- ✓ Success message appears: "Review submitted and published successfully"
- ✓ Review immediately appears in the review list below
- ✓ Product statistics (average rating) update to include this review
- ✓ Verified purchase badge visible on review

**Key Points**:
- Risk score should be ~10 (legitimate content, no spam)
- Auto-approved due to low risk score
- Published immediately without moderation

---

### Scenario 2: Flagged Review (Manual Moderation)

**Objective**: Verify that medium-risk reviews are flagged for manual moderation.

**Steps**:
1. Fill the review form with:
   - **Name**: "Test User 2"
   - **Email**: "test2@example.com"
   - **Rating**: 2 stars
   - **Title**: "Product issue"
   - **Review**: "This product has problems. Check out http://alternativesite.com for better options. CLICK HERE for my review. The build quality is poor and shipping took forever."

2. Submit the review

**Expected Outcome**:
- ✓ Form validation passes
- ✓ Review status shows "FLAGGED"
- ✓ Success message shows: "Review submitted and queued for moderation"
- ✓ Review appears in "Moderation Dashboard" tab
- ✓ Review shown with "MEDIUM PRIORITY" badge
- ✓ Risk score shown (should be ~50-60 due to URLs and suspicious patterns)

**Verification Steps**:
1. Click "Moderation Dashboard" tab
2. Filter by "Medium Priority" or view all
3. Verify the flagged review appears in the queue
4. Moderator can see the full review content, risk score, and reason for flagging

**Key Points**:
- Risk score calculated from URL detection, spam keywords
- Not visible to customers yet (status: FLAGGED)
- Requires moderator approval before publication
- Can be approved or rejected

---

### Scenario 3: Moderator Approval

**Objective**: Verify that moderators can approve flagged reviews for publication.

**Steps**:
1. Go to "Moderation Dashboard"
2. Locate the flagged review from Scenario 2
3. Review the content and metadata
4. Click the green "Approve" button

**Expected Outcome**:
- ✓ Review status changes to "PUBLISHED"
- ✓ Success message: "Review approved and published successfully"
- ✓ Review disappears from moderation queue
- ✓ Review immediately appears in the product review list
- ✓ Product statistics update to include this review

**Key Points**:
- Moderator has full context to make decision
- Approval automatically publishes the review
- Review now visible to all customers

---

### Scenario 4: Moderator Rejection

**Objective**: Verify that moderators can reject inappropriate reviews.

**Steps**:
1. Create a new flagged review with obvious policy violations
2. Go to "Moderation Dashboard"
3. Locate the review to be rejected
4. Click the red "Reject" button

**Expected Outcome**:
- ✓ Review status changes to "REJECTED"
- ✓ Success message: "Review rejected successfully"
- ✓ Review disappears from moderation queue
- ✓ Review never appears in customer-facing review list
- ✓ Review is archived (soft delete, not hard deleted)

**Key Points**:
- Rejected reviews remain in database (audit trail)
- Not visible to customers
- Can be reviewed later for appeal/analysis
- Counts toward audit logs

---

### Scenario 5: High-Risk Review Auto-Rejection

**Objective**: Verify that extremely risky reviews are automatically rejected.

**Steps**:
1. Fill the review form with:
   - **Name**: "Spam Tester"
   - **Email**: "spam@test.com"
   - **Rating**: 1 star
   - **Title**: "BADWORD1 BADWORD2 offensive spam"
   - **Review**: "BADWORD1 BADWORD1 offensive. Check out http://casino.com and http://viagra.com for better prices. CLICK HERE NOW! LIMITED OFFER! BUY NOW! spam spam spam"

2. Submit the review

**Expected Outcome**:
- ✓ Validation passes (format is correct)
- ✓ Error message appears: "Review failed spam/profanity check - high risk score"
- ✓ Review is NOT submitted to database
- ✓ No confirmation ID provided
- ✓ Form remains populated (user can edit and resubmit)

**Key Points**:
- Risk score should be >75 (multiple profanity hits, URLs, spam keywords)
- Automatic rejection prevents storage of harmful content
- User gets immediate feedback to improve content
- Stricter than moderation queue (never stored)

---

### Scenario 6: Rate Limiting

**Objective**: Verify that rate limiting prevents review spam.

**Steps**:
1. Submit 3 reviews for the same product using different names
2. Attempt to submit a 4th review for the same product

**Expected Outcome** (4th submission):
- ✓ Validation fails
- ✓ Error message: "You have already submitted the maximum (3) reviews for this product"
- ✓ Review is not created

**Additional Rate Limits to Test**:
- **Daily Limit**: Try submitting 11 reviews in one day
  - Expected: "You have reached the daily review submission limit (10 per day)"

- **Monthly Limit**: Try submitting 101 reviews in one month
  - Expected: "You have reached the monthly review submission limit (100 per month)"

**Key Points**:
- Limits tracked per customer per product
- Prevents gaming of review system
- Resets daily and monthly automatically
- Enforced at API level

---

### Scenario 7: Rating Aggregation

**Objective**: Verify that product statistics accurately reflect published reviews.

**Steps**:
1. Ensure you have published reviews with different ratings (1-5 stars)
2. Navigate to product review section
3. Observe the statistics panel at the top

**Expected Outcome**:
- ✓ Average rating correctly calculated from published reviews only
- ✓ Total review count matches published reviews
- ✓ Rating breakdown percentages sum to 100%
- ✓ Distribution histogram accurately represents all ratings
- ✓ Verified purchase count correct

**Example Calculation**:
```
Published Reviews:
- Review 1: 5 stars, verified
- Review 2: 4 stars, verified
- Review 3: 2 stars, not verified
- Review 4: 5 stars, verified

Statistics Should Show:
- Average: (5+4+2+5)/4 = 4.0 stars
- Total: 4 reviews
- Verified: 3
- Breakdown: 1★(1), 2★(1), 3★(0), 4★(1), 5★(2)
```

**Key Points**:
- Only PUBLISHED reviews count
- PENDING, REJECTED, FLAGGED reviews excluded
- Statistics update in real-time
- Ratings from deleted (archived) reviews removed

---

## Data Validation Tests

### Field Validation

| Field | Min | Max | Valid Example | Invalid Examples |
|-------|-----|-----|----------------|------------------|
| Name | 1 | - | "John Smith" | "" (empty) |
| Rating | 1 | 5 | 4 | 0, 6, 3.5 |
| Title | 5 | 200 | "Great product" | "Bad" (too short), 201 char string (too long) |
| Review | 20 | 5000 | "Detailed review text..." | "Short" (too short), 5001 char string |
| Email | - | - | "user@example.com" | "invalid-email", "user@" |

### Testing Field Validation

1. **Empty Required Fields**: Try submitting with name empty
   - Expected: "Name is required" error

2. **Too Short Title**: Enter "Test"
   - Expected: "Title must be at least 5 characters"

3. **Too Long Title**: Enter 201+ characters
   - Expected: "Title must not exceed 200 characters"

4. **Too Short Review**: Enter "Short text here"
   - Expected: "Review must be at least 20 characters"

5. **Too Long Review**: Paste 5001+ characters
   - Expected: "Review must not exceed 5000 characters"

---

## Performance Tests

### Load Testing

1. **Submission Performance**:
   - Submit 10 reviews consecutively
   - Measure response time (should be <500ms)
   - Verify all reviews created successfully

2. **Review Display Performance**:
   - Open product with 50+ published reviews
   - Load time should be <1 second
   - Pagination should load additional reviews quickly

3. **Moderation Queue Performance**:
   - Create 20+ flagged reviews
   - Queue should load in <500ms
   - Filtering by priority should be instant

---

## End-to-End Workflow Test

### Complete Migration Scenario

**Objective**: Simulate phased migration from old to new system.

**Phase 1: Shadow Mode (Validation)**
1. Create 5 reviews via submission form
2. Verify reviews appear in new system
3. Verify statistics calculate correctly
4. Check all data integrity (no missing fields)

**Phase 2: Gradual Cutover**
1. Set 25% of traffic to new system (simulate by creating 1 review)
2. Set 50% traffic (create 1 more review)
3. Verify performance maintained

**Phase 3: Rollback Capability**
1. Attempt to query review data
2. Verify complete historical data preserved
3. Ensure all audit logs intact

---

## Troubleshooting

### Review Not Appearing After Submission

**Check List**:
1. Is the review status "PUBLISHED"? (Check API response)
2. Is the product ID correct?
3. Is the review timestamp recent?
4. Try refreshing the page (may be cache)

### Statistics Not Updating

**Check List**:
1. Are statistics being refreshed? (Check refreshReviewStatistics call)
2. Are all reviews in "PUBLISHED" status?
3. Check database directly for review records
4. Verify statistics table has entry for product

### Moderation Dashboard Empty

**Check List**:
1. Are there flagged reviews? (Check database moderation_queue table)
2. Is the RLS policy allowing access?
3. Try filtering different priority levels
4. Check browser console for API errors

---

## Verification Checklist

- [ ] Scenario 1: Low-risk review auto-publishes
- [ ] Scenario 2: Medium-risk review flags for moderation
- [ ] Scenario 3: Moderator can approve flagged reviews
- [ ] Scenario 4: Moderator can reject reviews
- [ ] Scenario 5: High-risk review auto-rejects
- [ ] Scenario 6: Rate limiting prevents spam
- [ ] Scenario 7: Statistics accurately reflect published reviews
- [ ] Field validation works for all fields
- [ ] Performance metrics acceptable
- [ ] Audit trail records all state changes

---

## Success Criteria

✓ All 7 test scenarios pass successfully
✓ No data loss or corruption
✓ Performance acceptable (<500ms API responses)
✓ Security: Only published reviews visible to customers
✓ Moderation: Flagged reviews cannot be manually bypassed
✓ Statistics: Always accurate and real-time
✓ Rate limiting: Prevents abuse
✓ Audit trail: Complete history preserved

---

## Database Inspection

### Useful Queries

**View all reviews for a product**:
```sql
SELECT id, status, rating, risk_score, created_at
FROM reviews
WHERE product_id = 'demo-product-001'
ORDER BY created_at DESC;
```

**View moderation queue**:
```sql
SELECT mq.*, r.title, r.review_text, r.risk_score
FROM moderation_queue mq
JOIN reviews r ON mq.review_id = r.id
WHERE mq.resolved_at IS NULL
ORDER BY mq.priority DESC, mq.created_at ASC;
```

**View product statistics**:
```sql
SELECT * FROM review_statistics
WHERE product_id = 'demo-product-001';
```

**View review history (audit trail)**:
```sql
SELECT * FROM review_history
WHERE review_id = '{review_id}'
ORDER BY created_at DESC;
```

---

## Next Steps After Testing

1. Run the build: `npm run build`
2. Fix any TypeScript errors
3. Check console for warnings
4. Deploy to staging environment
5. Run full regression test suite
6. Monitor production metrics post-deployment
