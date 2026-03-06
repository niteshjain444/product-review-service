# Product Review System - Decision Log

## Overview
This document tracks all architectural decisions, assumptions, and rationale for the re-architected Product Review System replacing the third-party integration.

---

## Database & Persistence

### Decision 1: Supabase PostgreSQL for Primary Database
**Status**: Approved ✓
**Rationale**:
- Provides ACID compliance for transactional consistency
- Built-in Row Level Security (RLS) for data isolation
- Real-time capabilities via PostgreSQL pub/sub
- Cost-effective with generous free tier
- No vendor lock-in; standard PostgreSQL

**Alternatives Considered**:
- MongoDB: Considered but rejected due to lack of ACID for critical reviews data
- Firebase Firestore: Rejected due to higher costs and less flexible querying

---

## Architecture & Design

### Decision 2: Event-Driven Async Processing for Review Validation
**Status**: Approved ✓
**Rationale**:
- Decouples validation checks from submission API response
- Enables parallel processing of spam detection, profanity filtering, duplicate checks
- Allows retry logic for transient failures
- Improves user experience with faster API responses
- Scales horizontally without blocking submission

**Implementation**: Edge Functions for async tasks, database polling for status

---

### Decision 3: Review State Machine with Explicit States
**Status**: Approved ✓
**Rationale**:
- Ensures predictable workflow and prevents invalid state transitions
- Clear audit trail via status history
- Enables enforcement of business rules at each state
- Simplifies troubleshooting and monitoring
- States: PENDING → APPROVED/REJECTED/FLAGGED → PUBLISHED/ARCHIVED

---

### Decision 4: Aggregated Rating Statistics via Database Triggers
**Status**: Approved ✓
**Rationale**:
- Real-time accuracy without query overhead
- Eliminates need for batch jobs or cache invalidation
- Single source of truth in database
- Atomic updates ensuring consistency
- Fast reads with pre-calculated aggregates

**Alternative Considered**: Runtime calculation rejected due to performance impact

---

## API Design

### Decision 5: RESTful API with JSON Request/Response
**Status**: Approved ✓
**Rationale**:
- Familiar to frontend developers
- Easy to test and debug
- Natural fit with HTTP semantics
- Good tooling and documentation standards

---

### Decision 6: Synchronous Validation Response with Async Processing Callback
**Status**: Approved ✓
**Rationale**:
- Immediate feedback to user on blocking validation errors (format, length)
- Non-blocking checks run asynchronously (spam, profanity)
- Response includes submission_id for tracking via polling or webhooks
- User can proceed without waiting for final decision

---

## Review Workflow & Moderation

### Decision 7: Three-Tier Review Validation Strategy
**Status**: Approved ✓
**Components**:
1. **Tier 1 - Synchronous Checks** (400ms timeout):
   - Required fields validation
   - Rating range (1-5) validation
   - Text length constraints
   - Author verification
   - Rate limiting per customer

2. **Tier 2 - Async Automated Checks**:
   - Profanity filtering
   - Spam detection
   - Duplicate detection
   - Sentiment analysis

3. **Tier 3 - Manual Moderation**:
   - High-risk reviews flagged by automated system
   - Moderator manual approval/rejection
   - Appeal process

**Decision Rationale**: Balances security with user experience and operational load

---

### Decision 8: Automatic Approval Rules for Low-Risk Reviews
**Status**: Approved ✓
**Auto-Approve Criteria**:
- No profanity detected
- No spam patterns identified
- Not a duplicate
- Verified purchase (if applicable to product)
- Text length between 20-2000 characters
- Sentiment score between -0.8 and 1.0 (not extreme outliers)

**Rationale**:
- Reduces manual moderation burden
- Enables fast publication for legitimate reviews
- Maintains quality standards
- Fraud prevention maintained through automated checks

---

### Decision 9: Manual Review Queue Triage System
**Status**: Approved ✓
**Priority Levels**:
- **HIGH**: Extreme negative sentiment, potential fraud patterns, product safety concerns
- **MEDIUM**: Profanity detected, borderline spam scores, unverified reviews on high-value products
- **LOW**: Duplicate reviews, minor formatting issues, language correction needed

**Rationale**:
- Helps moderators focus on critical items first
- Enables SLA management (High: 2hrs, Medium: 24hrs, Low: 5 days)
- Improves operational efficiency
- Ensures safety and quality

---

## Data Model

### Decision 10: Review Status Lifecycle
**Status**: Approved ✓
**States**:
- `PENDING`: Awaiting initial validation and checks
- `APPROVED`: Passed all validation, ready to publish
- `REJECTED`: Permanently rejected, not publishable
- `FLAGGED`: Requires manual moderation review
- `PUBLISHED`: Currently visible to customers
- `ARCHIVED`: No longer visible (old/spam reviews)

**Transitions**:
```
PENDING → APPROVED → PUBLISHED → ARCHIVED
PENDING → REJECTED (terminal)
PENDING → FLAGGED → APPROVED → PUBLISHED → ARCHIVED
PENDING → FLAGGED → REJECTED (terminal)
PUBLISHED → ARCHIVED (deletion is archival, not hard delete)
```

**Rationale**: Supports full audit trail, enables recovery, prevents data loss

---

### Decision 11: Rating Calculation Methodology
**Status**: Approved ✓
**Calculation**:
- Average of only PUBLISHED reviews
- Weighted by verification status (optional: +0.1 boost for verified purchases)
- Minimum 3 published reviews to display rating (prevent gaming)
- Breakdown percentages calculated from PUBLISHED reviews only

**Rationale**:
- Prevents unpublished reviews from affecting displayed rating
- Encourages verified purchases
- Minimum threshold prevents low-sample-size ratings
- Transparent and auditable methodology

---

## Security & Privacy

### Decision 12: Row Level Security for Multi-Tenant Data
**Status**: Approved ✓
**Policies**:
- Users can only read published reviews for products
- Users can only view/edit their own submissions
- Moderators can view all reviews with appropriate filters
- Admins have full access
- PII (email, internal IDs) never returned to frontend

**Rationale**: Prevents unauthorized access, complies with privacy regulations

---

### Decision 13: Rate Limiting Per Customer
**Status**: Approved ✓
**Limits**:
- Max 3 reviews per product per customer
- Max 10 reviews per day per customer
- Max 100 reviews per month per customer
- Enforced via customer_id tracking

**Rationale**:
- Prevents review spam and gaming
- Protects system from abuse
- Fair review distribution across customer base
- Configurable per business needs

---

## Frontend & UX

### Decision 14: Progressive Disclosure in Review Submission
**Status**: Approved ✓
**Approach**:
- Simple form with core fields: rating, title, review text, verified_purchase checkbox
- Optional fields hidden behind "Add More Details" toggle
- Real-time validation feedback with character count
- Success/error messaging is clear and actionable

**Rationale**:
- Reduces form abandonment
- Simplifies initial experience
- Expert users can provide detailed feedback
- Mobile-friendly design

---

### Decision 15: Review Display with Aggregated Statistics
**Status**: Approved ✓
**Components**:
- Average rating with 5-star visualization
- Rating distribution histogram (1-5 stars)
- Total review count with "Only Verified Purchases" filter option
- Reviews sorted by "Most Helpful" (default), "Newest", "Oldest", "Highest Rating", "Lowest Rating"
- Individual review cards with date, author (anonymized), rating, verified badge, helpful count
- Pagination (20 reviews per page)

**Rationale**:
- Transparent review presentation
- Builds customer trust
- Helps purchase decisions
- Aggregates provide overview without overwhelming

---

## Phased Migration Strategy

### Decision 16: Dual-Write Period for Validation
**Status**: Approved ✓
**Approach**:
- Phase 1 (Week 1-2): New system in shadow mode, all reviews written to both systems, reads from old system
- Phase 2 (Week 3-4): Gradual traffic migration (25%, 50%, 75%, 100%) with new system reads
- Phase 3 (Week 5): Old system remains read-only for rollback capability
- Phase 4 (Week 6+): Decommission old system after 100% stability

**Rationale**:
- Validates data consistency before cutover
- Enables rapid rollback if issues discovered
- Builds confidence in new system
- Zero-downtime migration
- Business continuity maintained

---

### Decision 17: Data Migration Strategy
**Status**: Approved ✓
**Process**:
1. Extract all reviews from third-party API (batched)
2. Transform to new schema format
3. Validate data integrity and referential consistency
4. Load into Supabase with ETL error logging
5. Spot-check accuracy
6. Migrate product metadata
7. Maintain mapping table for cross-system tracking

**Rollback**: If critical issues found, revert to old system; data remains in new system for forensics

---

## Technology Stack

### Decision 18: Next.js with React for Frontend
**Status**: Approved ✓
**Rationale**:
- Server-side rendering for SEO
- File-based routing simplifies structure
- API routes for backend integration
- Good TypeScript support
- Large ecosystem

---

### Decision 19: Supabase Edge Functions for Async Processing
**Status**: Approved ✓
**Use Cases**:
- Spam detection and profanity filtering
- Sentiment analysis
- Duplicate review detection
- Periodic rating aggregation refresh
- Review status change notifications

**Rationale**:
- Scalable and cost-effective
- No server management
- Built-in to Supabase platform
- Supports cron jobs for scheduled tasks

---

### Decision 20: TypeScript for Type Safety
**Status**: Approved ✓
**Rationale**:
- Catches errors at compile time
- Improves IDE autocomplete and documentation
- Reduces runtime errors in production
- Better maintainability

---

## Monitoring & Operations

### Decision 21: Metrics to Track
**Status**: Approved ✓
**Key Metrics**:
1. **Submission Metrics**:
   - Submissions per hour/day
   - Auto-approval rate %
   - Time to approval (by path)
   - Rejection rate by reason

2. **Quality Metrics**:
   - Average rating trend
   - Rating distribution stability
   - Review count by product

3. **Moderation Metrics**:
   - Queue depth
   - Average resolution time
   - Moderator throughput
   - Appeal success rate

4. **System Metrics**:
   - API response time (p50, p95, p99)
   - Database query performance
   - Error rates by endpoint
   - Cache hit rates

---

## Assumptions

### A1: Customer Data Availability
Assumption: Third-party system maintains customer_id references to internal user system
Fallback: Implement customer anonymization and UUID-based tracking

### A2: Product Hierarchy
Assumption: Single product per review (not variant-level reviews)
Future: Can be extended to support product variants/SKUs

### A3: Moderation Capacity
Assumption: 1-2 moderators available during business hours
Scaling: Can add more moderators without system changes (queue-based)

### A4: Review Content Constraints
Assumption: Text reviews only (no rich text formatting initially)
Future: Can add support for structured data (photos, videos)

### A5: Timezone Handling
Assumption: All timestamps in UTC
Frontend: Converts to user's local timezone for display

### A6: Privacy Regulations
Assumption: GDPR and CCPA compliance required
Implementation: RLS policies enforce data minimization

---

## Future Enhancements (Out of Scope)

1. **AI-Powered Insights**:
   - Automated review summarization
   - Sentiment trend analysis
   - Competitor comparison

2. **Enhanced Features**:
   - Photo/video uploads for reviews
   - Verified purchase integration with payment system
   - Customer response to reviews
   - Review helpfulness scoring

3. **Advanced Moderation**:
   - Machine learning spam detection
   - Automated fake review detection
   - Language translation for multilingual reviews

4. **Analytics**:
   - Review impact on conversion rates
   - Keyword extraction and trending topics
   - Customer segmentation analysis

---

---

## Implementation Decisions (Session Log)

The following decisions were made and implemented during the active development session (2026-03-05 – 2026-03-06).

---

### Decision 22: RLS Disabled for Experimental Setup
**Status**: Implemented ✓
**Context**: Supabase Row Level Security was blocking all API reads/writes during initial setup.
**Decision**: Disabled RLS on all tables (`reviews`, `moderation_queue`, `review_status_history`, `rate_limits`) for the experimental/demo environment.
**Rationale**: Speed of iteration over security posture for a non-production prototype.
**Note**: RLS policies (per Decision 12) must be re-enabled before any production deployment.

---

### Decision 23: Inline Content Moderation (No Edge Functions)
**Status**: Implemented ✓
**Context**: Decision 19 called for Supabase Edge Functions for async spam/profanity checks. This was impractical for the current prototype.
**Decision**: Content moderation runs synchronously within the Next.js API route (`/api/reviews/submit`) using `lib/validation.ts`.
**Rationale**: Simpler to build, test, and debug in a single-service prototype. Edge Functions can be adopted later when async processing is needed at scale.
**Trade-off**: Slightly higher API latency on submission; acceptable for current load.

---

### Decision 24: Risk Scoring System with Three Tiers
**Status**: Implemented ✓
**Scoring**:
- Garbage/unreadable text: **+80 pts**
- Profanity (per word): **+80 pts**
- Blanket negative recommendation: **+30 pts**
- Spam-like content or external links: **+15 pts**
- PII detected (per match): **+30 pts**
- External URL (per match): **+25 pts**
- Excessive capitals (>50% of text): **+15 pts**
- Combined score capped at 100

**Tiers**:
- **0–25**: Auto-approved and published
- **26–74**: Flagged → sent to human moderation queue
- **≥75**: Auto-rejected (saved to DB, not published)

**Rationale**: Profanity and garbage text scores of 80 each guarantee auto-rejection on a single hit, matching the zero-tolerance policy for abusive content.

---

### Decision 25: Per-Field Independent Content Scanning
**Status**: Implemented ✓
**Context**: Early implementation only scanned `review_text`. Abusive language in the `title` field went undetected.
**Decision**: Introduced `scanField(text, fieldLabel)` which applies all moderation rules to each field independently. `calculateRiskScore` calls it for both title and review body, then sums scores (capped at 100).
**Rationale**: Ensures abuse in either field is always caught and correctly attributed in flag messages.

---

### Decision 26: Word-Boundary Profanity Matching
**Status**: Implemented ✓
**Context**: `String.includes()` caused false positives — "skill" matched "kill", "diet" matched "die", "audience" matched "die", "Essex" matched "sex", "whatever" matched "hate".
**Decision**: Replaced `lower.includes(word)` with `new RegExp(\`\\b${word}\\b\`, 'i').test(lower)` for all profanity checks.
**Rationale**: Word boundaries prevent substring collisions while keeping the check case-insensitive and accurate.

---

### Decision 27: Stateless Regex Patterns (No Shared `g` Flag)
**Status**: Implemented ✓
**Context**: Module-level regex objects with the `g` flag share `lastIndex` state across concurrent requests, causing intermittent "Validation failed" errors.
**Decision**:
- Patterns used with `.test()` (spam, negative recommendation) have no `g` flag.
- PII patterns stored as `[string, string][]` source strings; `new RegExp(source, flags)` instantiated per call for `.match()`.
**Rationale**: Eliminates shared mutable state in regex objects under concurrent Node.js request handling.

---

### Decision 28: Garbage Text Detection
**Status**: Implemented ✓
**Algorithm** (`looksLikeGarbage`): Two signals, either triggers a flag (+80 pts):
1. Vowel ratio < 15% across all alphabetic characters (real English averages 35–45%)
2. More than 40% of words contain 4+ consecutive consonants
**Threshold**: Strings shorter than 8 alphabetic chars are ignored (too short to judge).
**Rationale**: Catches keyboard mash and random character sequences that are not readable text, without penalising legitimate short words or proper nouns.

---

### Decision 29: Negative Recommendation Detection
**Status**: Implemented ✓
**Context**: Reviews consisting solely of "don't buy this", "stay away", "total scam" etc. — blanket deterrents with no reasoning — were auto-publishing.
**Decision**: Added `NEGATIVE_RECOMMENDATION_PATTERNS` (14 regex patterns). A match adds +30 pts, sending borderline reviews to the moderation queue.
**Rationale**: Blanket negative recommendations without substantive reasoning should be reviewed by a human before publication, as they disproportionately affect product ratings.

---

### Decision 30: Remove Verified Purchase Checkbox
**Status**: Implemented ✓
**Context**: The submission form had a "Verified Purchase" checkbox, but there is no purchase verification backend or integration.
**Decision**: Removed the checkbox from `ReviewForm.tsx` and the `verified_purchase` field from the submission payload.
**Rationale**: Displaying a "Verified" badge without actual purchase verification is misleading to end users.

---

### Decision 31: One Review Per Email Per Product
**Status**: Implemented ✓
**Decision**: Before saving, the submit API checks for an existing non-rejected review from the same `customer_email` for the same `product_id`. Returns HTTP 409 if a duplicate is found.
**Rationale**: Prevents the same user from inflating ratings by submitting multiple reviews for one product.

---

### Decision 32: Server-Side Name and Email Validation
**Status**: Implemented ✓
**Rules**:
- **Name**: 2–100 characters; only letters, spaces, hyphens, apostrophes, and periods; no digits
- **Email**: Required; must match standard email format regex
**Rationale**: Client-side validation alone is insufficient. Server-side checks prevent junk data entering the database and ensure reviewer identity fields are meaningful.

---

### Decision 33: Specific Validation Error Messages
**Status**: Implemented ✓
**Context**: The API was returning a generic `{ error: "Validation failed" }` response; the frontend displayed this literally without useful detail.
**Decision**: API now returns `validation.errors[0]?.message` as the top-level `error` string (e.g., "Title must be at least 5 characters").
**Rationale**: Users need actionable feedback to correct their submission, not a generic failure message.

---

### Decision 34: Auto-Rejected Reviews Saved to Database
**Status**: Implemented ✓
**Context**: The original flow returned HTTP 400 before calling `submitReview()`, meaning auto-rejected content was never persisted.
**Decision**: `submitReview()` is always called first. Auto-rejection only updates the status after the record exists. Full rejection reason (risk score + flags) stored in `rejection_reason` column.
**Rationale**: Rejected reviews must be auditable. Moderators need to see what was blocked and why, and the data supports future analysis of abuse patterns.

---

### Decision 35: Dedicated Rejected Reviews Dashboard Tab
**Status**: Implemented ✓
**Decision**: Added a second tab ("Auto-Rejected") to `ModerationDashboard.tsx` backed by a new `GET /api/moderation/rejected` endpoint. Displays rejection reason alongside review content and risk score.
**Rationale**: Gives moderators full visibility into automatically blocked content for audit and appeals purposes.

---

### Decision 36: Dynamic Moderation Notes with Flag Reasons
**Status**: Implemented ✓
**Context**: Moderation queue showed a static "Flagged for manual review" note with no detail.
**Decision**: Moderation note is now generated as `Risk score: ${riskScore}. Reasons: ${flags.join('; ')}.` — listing every specific flag that triggered the escalation.
**Rationale**: Moderators need context to make fast, accurate decisions. Vague notes force them to re-analyse the review from scratch.

---

### Decision 37: Moderation Queue Sorted by Risk Score Descending
**Status**: Implemented ✓
**Decision**: Queue ordered by `risk_score DESC`, then `created_at DESC` (most recent high-risk first).
**Rationale**: Highest-risk reviews need the fastest human attention. Sorting by risk score ensures moderators always address the most critical items first.

---

### Decision 38: Non-Blocking Submission Flow (Content Moderation Post-Save)
**Status**: Implemented ✓
**Context**: Auto-rejected reviews were returning HTTP 400, giving users an error message even when name/email/format were all valid.
**Decision**: Content moderation outcome (REJECTED/FLAGGED/PUBLISHED) never blocks the submission response. As long as structural validation passes, the user always receives HTTP 201 with `"Review submitted successfully."` The moderation outcome is applied silently after saving.
**Rationale**: Users have fulfilled their obligation by submitting valid, well-formed content. Whether it gets published is an internal moderation concern — not something the user needs to act on or be penalised for at submission time.

---

## Version History

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2026-03-04 | v1.0 | Engineering Manager | Initial design and decisions |
| 2026-03-06 | v1.1 | Development Session | Decisions 22–38: implementation, bug fixes, moderation pipeline |

---

## Contact & Questions

For questions about any decision, contact the Engineering Manager leading this re-architecture project.
