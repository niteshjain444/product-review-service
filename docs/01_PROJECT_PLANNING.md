# 01 — Project Planning

## 1. Project Overview

The Product Review Service is an in-house replacement for a third-party review platform integration. The system enables customers to submit product reviews, applies automated content moderation, and provides a human moderation dashboard for borderline content. The goal is full ownership of the review pipeline — eliminating vendor dependency, reducing integration fragility, and enabling tailored business rules.

---

## 2. Scope

### In Scope
- Customer-facing review submission form (name, email, rating 1–5, title, body)
- Server-side validation: field format, length, name/email rules, duplicate prevention
- Automated content moderation: profanity, garbage text, spam, PII, negative recommendation detection
- Three-tier risk scoring and routing: auto-publish / human moderation queue / auto-reject
- Human moderation dashboard: queue with priority/risk sorting, approve/reject actions, audit trail
- Auto-rejected reviews view with rejection reasons
- Aggregated product rating statistics (average, breakdown, total count)
- Per-customer rate limiting (daily, monthly, per-product caps)
- Full status audit trail (review_history table)
- Database: Supabase PostgreSQL with migration-managed schema

### Out of Scope (v1)
- Authentication / user login (customer_id is an anonymous UUID)
- Purchase verification integration with payment/order systems
- Photo or video attachments on reviews
- Customer appeals process for rejected reviews
- AI/ML-powered moderation (rule-based only in v1)
- Multi-language support
- Review helpfulness voting (schema supports it; UI not implemented)
- Moderator authentication and role management

---

## 3. Project Timeline

### Phase 0 — Foundation (Week 1)
| Task | Owner | Duration |
|------|-------|----------|
| Database schema design and migration | Backend | 2 days |
| Supabase project setup, RLS decisions | DevOps/Backend | 1 day |
| Next.js project scaffolding, TypeScript config | Frontend | 1 day |
| Core data types, reviewService lib | Backend | 1 day |

### Phase 1 — Submission Pipeline (Week 2)
| Task | Owner | Duration |
|------|-------|----------|
| Review submission API (`/api/reviews/submit`) | Backend | 2 days |
| Field-level validation (rating, title, body length) | Backend | 1 day |
| Name and email server-side validation | Backend | 0.5 days |
| Duplicate review prevention (email + product) | Backend | 0.5 days |
| Rate limiting implementation | Backend | 1 day |

### Phase 2 — Content Moderation Engine (Week 2–3)
| Task | Owner | Duration |
|------|-------|----------|
| Risk scoring system (0–100, three tiers) | Backend | 1 day |
| Profanity detection with word-boundary matching | Backend | 1 day |
| Garbage text detection (vowel ratio + consonant cluster) | Backend | 1 day |
| Spam and PII pattern detection | Backend | 1 day |
| Negative recommendation detection | Backend | 1 day |
| Stateless regex implementation (no shared `g` flag) | Backend | 0.5 days |
| Per-field independent scanning (title + body) | Backend | 0.5 days |

### Phase 3 — Moderation Dashboard (Week 3)
| Task | Owner | Duration |
|------|-------|----------|
| Moderation queue API (`/api/moderation/queue`) | Backend | 1 day |
| Moderation decision API (`/api/moderation/decide`) | Backend | 1 day |
| Auto-rejected reviews API (`/api/moderation/rejected`) | Backend | 0.5 days |
| ModerationDashboard UI component | Frontend | 2 days |
| Dynamic flag reasons in moderation notes | Backend | 0.5 days |

### Phase 4 — Review Display and Statistics (Week 4)
| Task | Owner | Duration |
|------|-------|----------|
| Product reviews API (`/api/reviews/product`) | Backend | 1 day |
| ReviewDisplay component (list + statistics) | Frontend | 2 days |
| Rating aggregation on publish/unpublish events | Backend | 1 day |

### Phase 5 — Polish and Hardening (Week 4–5)
| Task | Owner | Duration |
|------|-------|----------|
| UI bug fixes (input visibility, form reset) | Frontend | 1 day |
| Error message specificity (field-level errors) | Backend | 0.5 days |
| Non-blocking submission flow | Backend | 0.5 days |
| End-to-end testing of all moderation paths | QA | 2 days |
| Documentation (DECISION_LOG, this docs suite) | All | 2 days |

### Phase 6 — Production Readiness (Week 5–6)
| Task | Owner | Duration |
|------|-------|----------|
| RLS policy re-enablement and testing | Backend/Security | 1 day |
| Environment variable management (prod keys) | DevOps | 0.5 days |
| Performance and load testing | QA/Backend | 1 day |
| Deployment pipeline setup | DevOps | 1 day |
| Go-live | All | — |

**Total estimated duration: 5–6 weeks**

---

## 4. Resources

### Team Roles
| Role | Responsibility | FTE |
|------|---------------|-----|
| Engineering Manager | Architecture decisions, stakeholder management, review | 0.25 |
| Backend Engineer | API routes, validation, database, business logic | 1.0 |
| Frontend Engineer | React components, form UX, dashboard UI | 0.75 |
| QA Engineer | Test plan, regression, edge cases, load testing | 0.5 |
| DevOps / Platform | Supabase setup, deployment pipeline, env management | 0.25 |
| Product Manager | Requirements sign-off, UAT coordination | 0.25 |

### Technology Stack
| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Database | Supabase (PostgreSQL) |
| Styling | Tailwind CSS |
| Hosting | Vercel (recommended) or any Node.js host |
| Version Control | Git |

---

## 5. Risks and Mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| R1 | Supabase RLS misconfiguration exposes PII | Medium | High | Explicit RLS policy testing before go-live; security review checklist |
| R2 | False positive auto-rejections frustrate legitimate users | Medium | Medium | Word-boundary regex; moderation review path for appeals; monitor rejection rate |
| R3 | Content moderation regex performance degrades under load | Low | Medium | Stateless patterns; profile at > 100 req/s in load test |
| R4 | Duplicate customer_id collisions (random UUID) | Very Low | Low | UUID v4 collision probability is negligible; monitor anomalies |
| R5 | Spam bots bypass rate limiting via rotating customer_id | Medium | Medium | Layer email-based deduplication; add CAPTCHA in v2 |
| R6 | Moderation queue backlog grows faster than team capacity | Medium | High | Priority triage; monitor queue depth metric; consider async notifications |
| R7 | Schema migration failures in production | Low | High | Test migrations on staging; maintain rollback scripts |
| R8 | Third-party data migration data loss | Medium | High | ETL validation; maintain read-only old system during transition |

---

## 6. Assumptions

- One product is used for demo; system supports multiple products via `product_id`.
- Customer identity is self-reported (name + email); no auth integration in v1.
- Moderation is performed by internal staff; no external moderator portal needed.
- English-language content only for moderation heuristics in v1.
- All timestamps stored and processed in UTC.
- Supabase free tier is sufficient for prototype; upgrade path exists for production.

---

## 7. Success Criteria

| Criterion | Measurement |
|-----------|-------------|
| Clean reviews publish without human intervention | Auto-approve rate ≥ 70% of legitimate reviews |
| Abusive reviews never reach the public | 0 published reviews containing profanity or garbage text |
| Human moderation queue is actionable | Each queue item shows risk score + specific flag reasons |
| Users always receive a submission acknowledgement | 0 HTTP 4xx responses for structurally valid submissions |
| Duplicate reviews are prevented | 0 duplicate email+product combinations in published state |
| Audit trail is complete | 100% of status transitions recorded in review_history |
