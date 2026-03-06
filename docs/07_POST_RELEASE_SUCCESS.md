# 07 — Post-Release Success

## 1. Definition of Success

The Product Review Service is considered a successful production release when, 30 days post go-live:

| Metric | Target |
|--------|--------|
| System availability | ≥ 99.5% uptime |
| API error rate | < 0.5% 5xx responses on submit endpoint |
| Auto-approve rate for legitimate reviews | ≥ 70% |
| False positive auto-rejection rate | < 2% (legitimate reviews silently rejected) |
| Moderation queue median resolution time | < 24 hours |
| Zero published reviews with profanity or garbage text | 100% |
| Duplicate reviews in published state | 0 |
| Complete audit trail coverage | 100% of status transitions in review_history |
| Customer submission success rate | ≥ 99% (structurally valid submissions return 201) |

---

## 2. Monitoring Plan

### Key Metrics to Track (Ongoing)

#### Submission Health
| Metric | Query / Source | Alert If |
|--------|---------------|---------|
| Daily review submissions | Count `reviews` by `created_at::date` | Drop > 50% vs 7-day avg |
| HTTP 400 rate on submit | Vercel Analytics | > 5% of requests |
| HTTP 500 rate on submit | Vercel Analytics | > 0.5% of requests |
| Duplicate email rejections (409) | Count from server logs | Spike > 20/day |

#### Moderation Health
| Metric | Query / Source | Alert If |
|--------|---------------|---------|
| Auto-approve rate | PUBLISHED / total submitted | Drops below 60% |
| Auto-reject rate | REJECTED / total submitted | Exceeds 10% (may indicate false positives) |
| Flag rate | FLAGGED / total submitted | Exceeds 30% |
| Queue depth (unresolved) | `moderation_queue` WHERE `resolved_at IS NULL` | > 50 items |
| Oldest unresolved item age | MIN(created_at) WHERE resolved_at IS NULL | > 48 hours |

#### Content Quality
| Metric | Query / Source | Alert If |
|--------|---------------|---------|
| Published reviews with profanity (sanity check) | Manual audit sample | Any > 0 |
| Average risk score of published reviews | AVG(risk_score) WHERE status=PUBLISHED | > 20 |
| Average risk score of rejected reviews | AVG(risk_score) WHERE status=REJECTED | < 60 (may indicate over-rejection) |

#### System Performance
| Metric | Source | Alert If |
|--------|--------|---------|
| API p95 response time | Vercel Analytics | > 3 seconds |
| Database query p95 | Supabase Performance | > 1 second |
| Supabase connection pool | Supabase Dashboard | > 80% utilisation |

---

## 3. Operational Runbooks

### Runbook: Queue Backlog Growing

**Symptom:** Moderation queue depth > 50 or oldest item age > 48 hours.

**Likely causes:**
1. Increase in spam/flag-triggering submissions
2. Moderation team capacity insufficient
3. Bug causing all reviews to be flagged

**Steps:**
1. Check flag rate — if > 30%, review recent threshold changes in `lib/validation.ts`
2. Check the reasons column of backlogged items — are they all the same flag type?
3. If it's a specific signal causing over-flagging, consider adjusting its score weighting
4. If capacity issue, alert Engineering Manager to discuss temporary moderation coverage
5. If bug, identify the commit that changed behaviour, revert if necessary

---

### Runbook: High Auto-Rejection Rate

**Symptom:** Auto-reject rate exceeds 10% of submissions.

**Likely causes:**
1. False positive in profanity word list (substring match regression)
2. Garbage text detector too aggressive
3. Legitimate product names triggering spam patterns (e.g., product with domain-like name)

**Steps:**
1. Pull a sample of recently rejected reviews from Supabase:
   ```sql
   SELECT title, review_text, risk_score, rejection_reason, created_at
   FROM reviews
   WHERE status = 'REJECTED'
   ORDER BY created_at DESC
   LIMIT 20;
   ```
2. Read the `rejection_reason` — which flag(s) triggered the rejection?
3. If profanity false positive: check word-boundary regex in `lib/validation.ts`; the word `\bword\b` pattern should prevent substrings
4. If garbage text: check if the affected reviews are genuinely readable; if so, tune the vowel ratio threshold
5. Deploy fix to staging first; verify false positive rate drops before production

---

### Runbook: Statistics Not Updating

**Symptom:** Aggregated rating stats (average, count) are stale after reviews are approved.

**Likely cause:** `refreshReviewStatistics()` not being called, or failing silently.

**Steps:**
1. Check server logs for errors in `refreshReviewStatistics`
2. Verify `review_statistics` table has a row for the product:
   ```sql
   SELECT * FROM review_statistics WHERE product_id = '<id>';
   ```
3. Manually trigger refresh by calling `POST /api/moderation/decide` on a test review (approve a review that's already published — this will re-trigger the stats refresh)
4. If `review_statistics` row is missing entirely, check that `POST /api/init` was called after migration

---

### Runbook: PII Found in API Response

**Symptom:** Customer email or internal ID appears in a public API response.

**Immediate action:**
1. Identify which endpoint is leaking PII
2. Revert the deployment via Vercel dashboard (instant)
3. Notify Engineering Manager and Product Manager immediately
4. Assess whether any PII was cached or logged by clients
5. Fix the select query to exclude the PII field
6. Add explicit field allowlist to the relevant Supabase `.select()` call
7. Deploy fix after staging verification
8. Notify affected users if required by GDPR/CCPA

---

## 4. Iteration and Improvement Plan

### 30-Day Review

After 30 days in production, hold a review meeting with engineering and product to assess:
- Are the scoring thresholds (80/30/25/15) producing the right distribution across tiers?
- Are moderators finding the queue manageable? What is their average resolution time?
- Are there new spam or abuse patterns not covered by current rules?
- What are the most common false positive flag types?

**Outputs:** Updated thresholds in `lib/validation.ts` if needed; new patterns added if new abuse vectors identified.

### Planned v2 Enhancements (Priority Order)

| Priority | Enhancement | Rationale |
|----------|-------------|-----------|
| High | Re-enable Supabase RLS with correct policies | Required for multi-tenant security |
| High | Moderator authentication (role-based) | Currently any user can access `/moderation` |
| High | CAPTCHA on review submission | Prevents bot-based review flooding |
| Medium | Email-based duplicate check across rejected reviews | Current check skips rejected; user could resubmit after auto-reject |
| Medium | Customer appeals process | Allow users to contest auto-rejections |
| Medium | Moderator workload metrics dashboard | Track throughput, resolution time per moderator |
| Low | ML-assisted moderation scoring | Complement rule-based system for nuanced cases |
| Low | Multi-language profanity and spam detection | Extend beyond English |
| Low | Photo/video review attachments | Richer review content |
| Low | Review helpfulness voting (schema already supports it) | Improve review quality signal |

---

## 5. Support and Escalation

### Level 1 — Self-Service (Moderators)
- Moderation dashboard documentation covers approve/reject actions
- Runbooks above cover common operational issues

### Level 2 — Engineering (Backend/Frontend Engineers)
- Code-level bugs, API errors, performance issues
- Response time: within 4 hours during business hours

### Level 3 — Engineering Manager
- Architectural issues, data integrity concerns, security incidents
- Response time: within 1 hour for P1/P2

### Incident Post-Mortems

All P1 and P2 incidents require a post-mortem document within 48 hours of resolution, covering:
1. Timeline of the incident
2. Root cause
3. Impact (users affected, data affected, duration)
4. Resolution steps taken
5. Prevention measures (code change, monitoring, process)

Post-mortems are stored in `docs/incidents/` and referenced from the DECISION_LOG if they result in a new design decision.
