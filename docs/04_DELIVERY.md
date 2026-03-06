# 04 — Delivery

## 1. Delivery Philosophy

Delivery is incremental. Each sprint produces a working, testable slice of the system — not a big-bang release at the end. Every sprint output is deployable to a staging environment so stakeholders can verify behaviour early and often.

The delivery pipeline is: **Build → Test → Review → Stage → Release**.

---

## 2. Delivery Milestones

### Milestone 1: Database and Skeleton (End of Week 1)
**Deliverable:** Running Next.js app connected to Supabase with schema deployed.
- All 6 database tables created via migration
- `/api/init` endpoint seeds demo product
- `lib/reviewService.ts` and `lib/supabase.ts` functional
- Basic review submission saves a PENDING row to the database

**Verification:** POST to `/api/reviews/submit` with valid payload → row visible in Supabase table editor.

---

### Milestone 2: Full Submission Pipeline (End of Week 2)
**Deliverable:** Review submission works end-to-end with all validation and routing.
- Structural validation: name, email, rating, title, body
- Duplicate and rate limit enforcement
- Content moderation engine (all signals)
- Three-tier routing: PUBLISHED / FLAGGED / REJECTED
- All submissions return HTTP 201 (never blocked by moderation)
- Audit trail recorded in `review_history`

**Verification:**
- Submit a clean review → PUBLISHED
- Submit a profanity review → REJECTED (visible in Supabase, 201 returned to user)
- Submit "don't buy this" → FLAGGED (appears in moderation_queue)
- Submit same email twice for same product → 409

---

### Milestone 3: Moderation Dashboard (End of Week 3)
**Deliverable:** Internal moderators can view and action the queue.
- Moderation queue UI with priority filter and risk-score sort
- Approve → review publishes; Reject → review rejected with reason
- Auto-Rejected tab visible with full rejection reasons
- Dynamic moderation notes showing specific flags

**Verification:** Moderator approves a FLAGGED review → appears in ReviewDisplay for that product.

---

### Milestone 4: Review Display (End of Week 4)
**Deliverable:** Customers can read published reviews with statistics.
- ReviewDisplay component shows paginated PUBLISHED reviews
- Statistics panel shows average rating, breakdown, total count
- Statistics update in real time when moderation decisions change review state

**Verification:** Approve 3 flagged reviews → statistics panel reflects updated average and count.

---

### Milestone 5: Production-Ready (End of Week 5–6)
**Deliverable:** System ready for production traffic.
- RLS policies re-enabled and tested
- All environment variables externalised (no hardcoded keys)
- Load test completed: 100 concurrent submissions with no failures
- Security review: no PII returned to frontend, no SQL injection vectors
- All documentation complete

**Verification:** Full end-to-end regression test on staging passes. Security review sign-off obtained.

---

## 3. Release Checklist

### Pre-Release
- [ ] All Milestone 1–5 verification steps pass on staging
- [ ] No TypeScript compilation errors (`npm run build` clean)
- [ ] No ESLint errors or warnings
- [ ] Environment variables set in production (not `.env.local`)
- [ ] Supabase RLS policies enabled and tested with appropriate roles
- [ ] Database migration has been run on production Supabase project
- [ ] Demo product seeded in production database
- [ ] Load test results reviewed and acceptable
- [ ] DECISION_LOG.md up to date

### Go-Live
- [ ] DNS / deployment URL confirmed
- [ ] Health check: GET `/api/reviews/product?product_id=<demo-id>` returns 200
- [ ] Health check: POST `/api/init` returns product_id
- [ ] Smoke test: submit one clean review end-to-end
- [ ] Smoke test: moderation dashboard loads queue (empty is fine)
- [ ] Alert/monitoring in place (see 07_POST_RELEASE_SUCCESS.md)

### Post-Release (first 24 hours)
- [ ] Monitor error rate on `/api/reviews/submit`
- [ ] Monitor moderation queue depth
- [ ] Confirm no PII leaking in API responses
- [ ] Confirm `review_history` is populating correctly
- [ ] Check Supabase dashboard for any query errors or slow queries

---

## 4. Rollback Plan

If a critical defect is found post-release:

1. **Immediate:** Revert Vercel deployment to the previous stable deployment via Vercel dashboard (instant).
2. **Database:** No automatic rollback of database state. If a migration needs reverting, apply a down-migration manually after assessing data impact.
3. **Old system:** If migrating from a third-party system, keep old system read-only for at least 2 weeks post-cutover. Frontend can be switched back to old API within minutes.
4. **Communication:** Notify stakeholders within 30 minutes of any rollback. See 05_COMMUNICATION.md for escalation path.

---

## 5. Acceptance Testing

### User Acceptance Test (UAT) Scenarios

| Scenario | Steps | Expected Result |
|----------|-------|-----------------|
| Clean review publishes | Submit valid review with no risky content | 201; review appears in product page immediately |
| Abusive review rejected silently | Submit review containing profanity | 201 "submitted"; review not published; visible in Auto-Rejected tab |
| Borderline review flagged | Submit "don't buy this" review | 201; review appears in Moderation Queue with flag reason |
| Duplicate email blocked | Submit two reviews with same email for same product | Second submission returns 409 |
| Moderator approves | Approve flagged review in dashboard | Review appears in product page; statistics update |
| Moderator rejects | Reject flagged review in dashboard | Review moves to rejected state; real reason stored |
| Garbage text rejected | Submit "asdfjkl qwerty zxcvbn" as review text | 201; rejected silently; "Unreadable or garbage text" in rejection reason |
| Rate limiting | Submit 4th review for same product from same customer_id | 429 returned |
| Invalid email blocked | Submit review with "notanemail" as email | 400 with specific error message |
| Title-only abuse caught | Submit clean body but abusive title | Review correctly flagged/rejected based on title scan |

### UAT Sign-Off
UAT is considered complete when:
- All 10 scenarios above pass on staging
- Product Manager and Engineering Manager have verified behaviour
- No P1 or P2 defects are open
