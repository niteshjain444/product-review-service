# 03 — Execution

## 1. Task Breakdown

Tasks are organised by workstream and ordered by dependency. Each task includes acceptance criteria so "done" is unambiguous.

---

### Workstream 1: Infrastructure and Database

| ID | Task | Acceptance Criteria |
|----|------|---------------------|
| INF-01 | Create Supabase project and note connection strings | Project accessible; anon key and service role key recorded in `.env.local` |
| INF-02 | Run `001_create_review_system_schema.sql` migration | All 6 tables exist; indexes created; RLS policies defined (disabled for prototype) |
| INF-03 | Seed demo product via `/api/init` | `products` table contains demo product; `review_statistics` row initialised |
| INF-04 | Validate Supabase client connectivity | `lib/supabase.ts` connects; basic select on `products` returns data |

---

### Workstream 2: Core Review Submission

| ID | Task | Acceptance Criteria |
|----|------|---------------------|
| SUB-01 | Implement `submitReview()` in `lib/reviewService.ts` | Row inserted into `reviews` with status `PENDING`; returns `{ data, error }` |
| SUB-02 | Implement `POST /api/reviews/submit` — structural validation | Missing fields → 400; invalid name format → 400; invalid email → 400; bad rating → 400 |
| SUB-03 | Implement duplicate review prevention | Same email + product_id (non-rejected) → 409 |
| SUB-04 | Implement rate limiting check and increment | 3rd review for same product → 429; daily and monthly caps enforced |
| SUB-05 | Wire content moderation into submission pipeline | Risk score computed; non-blocking — 201 returned for all structurally valid requests |
| SUB-06 | Implement `updateReviewStatus()` with audit trail | Status updated; `review_history` row appended for every call |

---

### Workstream 3: Content Moderation Engine

| ID | Task | Acceptance Criteria |
|----|------|---------------------|
| MOD-01 | Implement `looksLikeGarbage()` | Keyboard mash → true; real sentences → false; strings < 8 alpha chars → false |
| MOD-02 | Implement profanity detection with word-boundary regex | "kill" triggers; "skill" does not; "die" triggers; "diet" does not |
| MOD-03 | Implement negative recommendation patterns | "don't buy", "stay away", "total scam" each trigger; reasoned criticism does not |
| MOD-04 | Implement spam and PII detection | URLs, domain names, email addresses, phone numbers, credit card patterns detected |
| MOD-05 | Implement `scanField()` for independent per-field scoring | Abuse in title alone flags/rejects the review; body clean + abusive title → still caught |
| MOD-06 | Implement `calculateRiskScore()` combining both fields | Score = min(title_score + body_score, 100); flags array merged from both |
| MOD-07 | Validate all regex patterns as stateless (no shared `g` flag) | 50 concurrent submission requests produce no intermittent validation failures |
| MOD-08 | Implement three-tier routing (auto-publish / flag / auto-reject) | Score 0–25 → PUBLISHED; 26–74 → FLAGGED; ≥75 → REJECTED; all return 201 |

---

### Workstream 4: Moderation Dashboard

| ID | Task | Acceptance Criteria |
|----|------|---------------------|
| DASH-01 | Implement `GET /api/moderation/queue` | Returns unresolved items with nested review data; ordered by risk_score DESC, created_at DESC |
| DASH-02 | Implement priority filter on queue API | `?priority=HIGH` returns only HIGH priority items |
| DASH-03 | Implement `POST /api/moderation/decide` | APPROVED → review status PUBLISHED + published_at set; REJECTED → status REJECTED + reason stored |
| DASH-04 | Implement `GET /api/moderation/rejected` | Returns reviews with status = REJECTED; includes rejection_reason |
| DASH-05 | Build ModerationDashboard React component | Queue tab shows all pending items; Auto-Rejected tab shows rejected reviews; approve/reject buttons functional |
| DASH-06 | Dynamic moderation notes display specific flags | Queue item shows "Risk score: 45. Reasons: Blanket negative recommendation in review text" |
| DASH-07 | Moderator rejection stores full reason | Rejection reason in DB includes moderator note + original flag reasons, not generic string |

---

### Workstream 5: Review Display

| ID | Task | Acceptance Criteria |
|----|------|---------------------|
| DISP-01 | Implement `GET /api/reviews/product` | Returns PUBLISHED reviews + statistics for given product_id; paginated |
| DISP-02 | Implement `refreshReviewStatistics()` | average_rating, total_reviews, rating_breakdown accurate after each publish/unpublish |
| DISP-03 | Build ReviewDisplay component | Shows statistics panel (average, breakdown histogram, total count); lists reviews with name, rating, title, body, date |

---

### Workstream 6: Frontend Form

| ID | Task | Acceptance Criteria |
|----|------|---------------------|
| FORM-01 | Build ReviewForm component | All fields render with correct input types; input text visible without highlighting |
| FORM-02 | Client-side character counters | Title shows n/200; body shows n/5000 |
| FORM-03 | Form resets on successful submission | All fields clear after 201 response |
| FORM-04 | Success/error message display | Success: "Review submitted successfully."; Error: specific server message shown |
| FORM-05 | Remove verified purchase checkbox | No checkbox rendered; `verified_purchase` not sent in payload |

---

## 2. Agile Development Practices

### Sprint Structure (2-week sprints)

**Sprint 1** — Foundation + Submission Pipeline
- INF-01 through INF-04
- SUB-01 through SUB-04
- MOD-01 through MOD-04

**Sprint 2** — Moderation Engine + Dashboard
- SUB-05, SUB-06
- MOD-05 through MOD-08
- DASH-01 through DASH-04

**Sprint 3** — UI + Display + Hardening
- DASH-05 through DASH-07
- DISP-01 through DISP-03
- FORM-01 through FORM-05
- Documentation and decision log

### Ceremonies

| Ceremony | Frequency | Duration | Purpose |
|----------|-----------|----------|---------|
| Sprint Planning | Start of each sprint | 1 hour | Select tasks, assign owners, clarify acceptance criteria |
| Daily Standup | Daily | 15 min | Blockers, progress, coordination |
| Sprint Review | End of each sprint | 30 min | Demo working features to stakeholders |
| Sprint Retrospective | End of each sprint | 30 min | Process improvements |
| Backlog Grooming | Mid-sprint | 30 min | Refine upcoming tasks, add edge cases |

### Definition of Done

A task is "done" when:
1. Code is written and reviewed (PR approved by at least one other engineer)
2. Acceptance criteria in the task table above are met
3. No TypeScript compilation errors
4. No console errors or warnings for the affected flow
5. Manual test of the happy path and at least one error path completed
6. DECISION_LOG.md updated if a new architectural decision was made

### Branching Strategy

```
main                    ← production-ready; protected
  └── feature/<task-id>-<short-desc>   ← one branch per task
        └── merged via PR with review
```

- No direct commits to `main`
- Feature branches rebased on `main` before merge
- Squash merge to keep history clean

---

## 3. System Compatibility and Data Migration

### Compatibility Matrix

| Concern | Status |
|---------|--------|
| Node.js version | >= 18 (required for `crypto.randomUUID()` natively) |
| Next.js version | 14 (App Router) — incompatible with Pages Router patterns |
| Supabase JS client | v2 (`@supabase/supabase-js`) — v1 API is different |
| TypeScript | >= 5.0 |
| Browser support | Modern browsers (ES2020+); no IE support required |

### Data Migration from Third-Party System

#### Migration Strategy: Extract → Transform → Validate → Load

**Step 1: Extract**
- Pull all reviews from the old third-party system via their export API or data dump
- Export fields: customer identifier, product identifier, rating, review text, submission date, current status, any existing moderation decisions

**Step 2: Transform**
- Map old status values to new state machine values:
  ```
  old: "published"  → new: "PUBLISHED"
  old: "pending"    → new: "PUBLISHED"  (assume legacy pending = published)
  old: "removed"    → new: "ARCHIVED"
  old: "flagged"    → new: "PUBLISHED"  (legacy flagged but visible = published)
  ```
- Generate new UUID `id` for each review
- Map old product identifiers to new `products.id` UUIDs (requires product seeding first)
- Generate anonymous `customer_id` UUID if no internal customer ID available
- Set `verified_purchase = false` for all migrated reviews (no verification data)
- Set `risk_score = 0` for all migrated reviews (they passed the old system)
- Set `rejection_reason = NULL`; `published_at = created_at` for published reviews

**Step 3: Validate**
- Count: total migrated = total exported
- Check: no orphaned `product_id` references
- Check: all rating values are in range 1–5
- Check: no duplicate `customer_email + product_id` combinations (dedup if found)
- Check: all timestamps parse as valid ISO 8601

**Step 4: Load**
- Bulk insert into `reviews` table in batches of 500
- After each batch, verify row count
- Run `refreshReviewStatistics()` for every product after all batches complete

**Step 5: Cutover**
- Switch frontend to read from new system
- Keep old system read-only for 2 weeks as rollback option
- Monitor error rates and review counts vs. old system baseline

#### Rollback Plan
- If critical issues are found within 72 hours of cutover, revert frontend to old system API
- New system data is retained for forensic analysis
- No data is deleted from either system during the transition window
