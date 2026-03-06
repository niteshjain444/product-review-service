# 02 — System Design: HLD and LLD

---

## Part A: High-Level Design (HLD)

### A1. System Context

The Product Review Service is a self-contained Next.js application that replaces a third-party review platform. It exposes a public submission surface and an internal moderation surface, backed by a Supabase PostgreSQL database.

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser / Client                         │
│                                                                 │
│  ┌─────────────────────┐    ┌──────────────────────────────┐   │
│  │   ReviewForm        │    │   ModerationDashboard        │   │
│  │   (customer-facing) │    │   (internal moderation UI)   │   │
│  └──────────┬──────────┘    └──────────────┬───────────────┘   │
└─────────────┼────────────────────────────── ┼───────────────────┘
              │ HTTPS                          │ HTTPS
              ▼                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Next.js App (API Routes)                      │
│                                                                 │
│  POST /api/reviews/submit        GET /api/moderation/queue      │
│  GET  /api/reviews/product       POST /api/moderation/decide    │
│  POST /api/init                  GET  /api/moderation/rejected  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              lib/validation.ts (content moderation)      │  │
│  │              lib/reviewService.ts (DB operations)        │  │
│  │              lib/supabase.ts (client)                    │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────┬───────────────────────┘
                                          │ Supabase JS client
                                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Supabase (PostgreSQL)                      │
│                                                                 │
│  products  |  reviews  |  review_statistics  |  moderation_queue│
│  review_history  |  customer_review_limits                      │
└─────────────────────────────────────────────────────────────────┘
```

### A2. Key Architectural Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Runtime | Next.js App Router (Node.js) | Unified frontend + API; no separate backend service |
| Database | Supabase PostgreSQL | ACID, standard SQL, built-in auth hooks, real-time ready |
| Moderation | Synchronous inline, rule-based | No external dependency; fast; sufficient for v1 scale |
| Hosting | Vercel (recommended) | Zero-config Next.js deployment; edge network |
| State machine | Explicit status column on `reviews` | Auditable; prevents invalid transitions; simple querying |

### A3. Data Flow: Review Submission

```
Customer fills form
        │
        ▼
POST /api/reviews/submit
        │
        ├─► Structural validation (name, email, rating, title length, body length)
        │         FAIL ──► HTTP 400 with specific field error
        │
        ├─► Duplicate email+product check
        │         FAIL ──► HTTP 409
        │
        ├─► Rate limit check (per customer_id)
        │         FAIL ──► HTTP 429
        │
        ├─► Content risk scoring (validation.ts)
        │       ┌── scanField(title)
        │       └── scanField(review_text)
        │           Combined score 0–100
        │
        ├─► INSERT review (status = PENDING)   ◄── Always saved
        │
        ├─► Increment rate limit counters
        │
        ├─► Score ≥ 75?
        │       YES ──► updateStatus(REJECTED) ──► HTTP 201 "submitted"
        │
        ├─► Score 26–74?
        │       YES ──► updateStatus(FLAGGED) ──► addToModerationQueue ──► HTTP 201
        │
        └─► Score 0–25?
                YES ──► updateStatus(APPROVED) ──► updateStatus(PUBLISHED) ──► HTTP 201
```

### A4. Data Flow: Moderation Decision

```
Moderator views queue (GET /api/moderation/queue)
        │  Returns: items ordered by risk_score DESC, created_at DESC
        │
        ▼
Moderator clicks Approve or Reject
        │
        ▼
POST /api/moderation/decide
        │
        ├─► APPROVED path:
        │       updateReviewStatus(APPROVED)
        │       UPDATE reviews SET status=PUBLISHED, published_at=now()
        │       UPDATE moderation_queue SET resolved_at=now()
        │       refreshReviewStatistics(product_id)
        │
        └─► REJECTED path:
                updateReviewStatus(REJECTED, reason)
                UPDATE moderation_queue SET resolved_at=now()
```

### A5. Moderation Scoring Architecture — Old vs New

**Problem with original architecture (third-party):**
- No visibility into why a review was flagged or rejected
- No ability to tune scoring thresholds for business needs
- Vendor dependency; breaking API changes caused outages
- No audit trail; no rejected reviews viewable
- All moderation decisions opaque to internal teams

**How the new architecture resolves each bottleneck:**

| Old Bottleneck | New Solution |
|---------------|-------------|
| Opaque third-party moderation | Fully transparent `lib/validation.ts`; every flag has a human-readable reason |
| No audit trail | `review_history` table records every status transition with reason and actor |
| Rejected reviews lost | All reviews saved to DB before moderation; rejected reviews queryable |
| No control over thresholds | Risk score constants are code-level constants, easily tunable |
| Vendor API latency | In-process moderation; zero network hop |
| No priority routing | Moderation queue with HIGH/MEDIUM/LOW priority and risk-score sort |

---

## Part B: Low-Level Design (LLD)

### B1. Database Schema

#### Table: `products`
```sql
id          UUID        PK, gen_random_uuid()
name        TEXT        NOT NULL
description TEXT
category    TEXT
sku         TEXT        UNIQUE NOT NULL
created_at  TIMESTAMPTZ DEFAULT now()
updated_at  TIMESTAMPTZ DEFAULT now()
```

#### Table: `reviews` (core entity)
```sql
id               UUID       PK, gen_random_uuid()
product_id       UUID       NOT NULL, FK → products(id)
customer_id      UUID       NOT NULL  (anonymous UUID from client)
customer_email   TEXT                 (required at API layer, nullable in DB for flexibility)
customer_name    TEXT       NOT NULL
rating           SMALLINT   NOT NULL, CHECK (1–5)
title            TEXT       NOT NULL
review_text      TEXT       NOT NULL
verified_purchase BOOLEAN   DEFAULT false
status           TEXT       DEFAULT 'PENDING'
                            CHECK IN ('PENDING','APPROVED','REJECTED','FLAGGED','PUBLISHED','ARCHIVED')
risk_score       SMALLINT   DEFAULT 0, CHECK (0–100)
rejection_reason TEXT
created_at       TIMESTAMPTZ DEFAULT now()
updated_at       TIMESTAMPTZ DEFAULT now()
published_at     TIMESTAMPTZ
helpful_count    INTEGER    DEFAULT 0
unhelpful_count  INTEGER    DEFAULT 0
```

**Indexes:**
```sql
idx_reviews_product_id         ON reviews(product_id)
idx_reviews_status             ON reviews(status)
idx_reviews_created_at         ON reviews(created_at DESC)
idx_reviews_customer_id        ON reviews(customer_id)
idx_reviews_product_status     ON reviews(product_id, status)   -- most common query pattern
```

#### Table: `review_statistics`
```sql
product_id       UUID      PK, FK → products(id)
average_rating   NUMERIC(3,2)  DEFAULT 0
total_reviews    INTEGER    DEFAULT 0
verified_reviews INTEGER    DEFAULT 0
rating_breakdown JSONB      DEFAULT {"1":0,"2":0,"3":0,"4":0,"5":0}
last_updated     TIMESTAMPTZ DEFAULT now()
```
Statistics are recalculated via `refreshReviewStatistics()` on every PUBLISH or un-PUBLISH event. No triggers — explicit application-level refresh for predictability.

#### Table: `moderation_queue`
```sql
id          UUID      PK
review_id   UUID      UNIQUE, FK → reviews(id)
priority    TEXT      CHECK IN ('HIGH','MEDIUM','LOW')
reason      TEXT      NOT NULL  (dynamic: "Risk score: 45. Reasons: Blanket negative recommendation...")
assigned_to UUID      (moderator user ID, nullable)
created_at  TIMESTAMPTZ DEFAULT now()
resolved_at TIMESTAMPTZ          (NULL = unresolved / in queue)
```

**Priority assignment logic:**
```
risk_score >= 60  →  HIGH
risk_score >= 40  →  MEDIUM
risk_score >= 26  →  LOW
```

#### Table: `review_history` (audit trail)
```sql
id            UUID   PK
review_id     UUID   FK → reviews(id)
old_status    TEXT
new_status    TEXT   NOT NULL
changed_by    TEXT   DEFAULT 'system'
change_reason TEXT
created_at    TIMESTAMPTZ DEFAULT now()
```
Every call to `updateReviewStatus()` appends a row here. Immutable; never updated or deleted.

#### Table: `customer_review_limits`
```sql
customer_id         UUID    PK (composite with product_id)
product_id          UUID    PK (composite with customer_id), FK → products(id)
count_today         INTEGER DEFAULT 0
count_this_month    INTEGER DEFAULT 0
reviews_per_product INTEGER DEFAULT 0
last_reset_date     DATE    DEFAULT CURRENT_DATE
```

---

### B2. Content Moderation Engine (`lib/validation.ts`)

#### Risk Score Components

| Signal | Score Added | Notes |
|--------|------------|-------|
| Garbage/unreadable text | +80 | Vowel ratio < 15% OR > 40% words with 4+ consonant clusters |
| Profanity (per word) | +80 | Word-boundary regex; each word independently scored |
| Blanket negative recommendation | +30 | 14 pattern set; no `g` flag |
| Spam or external links | +15 | Domain pattern + keyword list |
| PII detected (per match) | +30 | Email, phone, SSN, credit card patterns |
| External URL (per match) | +25 | `http(s)://` prefix count |
| Excessive capitals > 50% | +15 | Uppercase char ratio |
| **Cap** | **100** | `Math.min(combined, 100)` |

#### Routing Thresholds

```
score  0–25  →  Auto-approve → PUBLISHED
score 26–74  →  FLAGGED → moderation_queue
score  ≥ 75  →  Auto-reject → REJECTED (saved, not published)
```

#### Per-Field Scanning

```typescript
calculateRiskScore(title, reviewText):
  titleResult  = scanField(title, 'review title')
  bodyResult   = scanField(reviewText, 'review text')
  combined     = Math.min(titleResult.score + bodyResult.score, 100)
  flags        = [...titleResult.flags, ...bodyResult.flags]
```

Each field is scanned independently. Abuse in title alone is sufficient to auto-reject.

#### Stateless Regex Pattern Design

- **Patterns used with `.test()`** (NEGATIVE_RECOMMENDATION_PATTERNS, SPAM_PATTERNS): Defined at module level **without** the `g` flag. The `g` flag causes shared `lastIndex` state mutations under concurrent Node.js requests, producing false negatives.
- **PII patterns used with `.match()`**: Stored as `[string, string][]` source tuples. `new RegExp(source, flags)` is instantiated fresh per call, ensuring no state leakage.

---

### B3. API Contract

#### `POST /api/reviews/submit`

**Request:**
```json
{
  "product_id": "uuid",
  "customer_id": "uuid",
  "customer_name": "Jane Smith",
  "customer_email": "jane@example.com",
  "rating": 4,
  "title": "Great product overall",
  "review_text": "I have been using this for 3 months and...",
  "verified_purchase": false
}
```

**Responses:**
| Status | Condition | Body |
|--------|-----------|------|
| 201 | Any structurally valid submission | `{ id, status: "PUBLISHED"/"FLAGGED"/"RECEIVED", message }` |
| 400 | Missing fields, invalid name/email/rating/length | `{ error: "<specific message>", field? }` |
| 409 | Duplicate email+product | `{ error: "You have already submitted a review..." }` |
| 429 | Rate limit exceeded | `{ error: "<limit type>" }` |
| 500 | DB error | `{ error: "Internal server error" }` |

**Note:** Content moderation outcome (REJECTED/FLAGGED/PUBLISHED) never produces a 4xx. Structurally valid reviews always receive 201.

---

#### `GET /api/reviews/product?product_id=<uuid>`

**Query params:** `product_id` (required), `limit` (default 20), `offset` (default 0), `verified_only` (boolean)

**Response:**
```json
{
  "reviews": [...],
  "total": 42,
  "statistics": {
    "average_rating": 4.2,
    "total_reviews": 42,
    "rating_breakdown": { "1": 2, "2": 3, "3": 5, "4": 15, "5": 17 }
  },
  "pagination": { "limit": 20, "offset": 0, "hasMore": true }
}
```

---

#### `GET /api/moderation/queue`

**Query params:** `priority` (optional filter), `limit`, `offset`

**Response:** Queue items with nested `reviews` object, ordered by `risk_score DESC`, `created_at DESC`. Only unresolved items (`resolved_at IS NULL`).

---

#### `POST /api/moderation/decide`

**Request:**
```json
{
  "review_id": "uuid",
  "decision": "APPROVED" | "REJECTED",
  "reason": "optional moderator note",
  "moderator_id": "moderator-demo"
}
```

**Response:** `{ success: true, review_id, new_status, message }`

---

#### `GET /api/moderation/rejected`

Returns reviews with `status = 'REJECTED'`, ordered by `created_at DESC`. Includes `rejection_reason`.

---

### B4. Frontend Component Architecture

```
app/page.tsx
├── Tab: "Demo Product"
│   ├── ReviewForm
│   │   ├── State: { customer_name, customer_email, rating, title, review_text }
│   │   ├── POST /api/init (resolve product_id)
│   │   └── POST /api/reviews/submit
│   └── ReviewDisplay
│       └── GET /api/reviews/product?product_id=...
│           ├── Statistics panel (average rating, breakdown histogram)
│           └── Paginated review list
│
└── Tab: "Moderation Dashboard"
    └── ModerationDashboard
        ├── Tab: "Moderation Queue"
        │   ├── GET /api/moderation/queue (with priority filter)
        │   └── POST /api/moderation/decide (per item)
        └── Tab: "Auto-Rejected"
            └── GET /api/moderation/rejected
```

---

### B5. Review Status State Machine

```
                    ┌──────────┐
              ┌────►│ APPROVED │────┐
              │     └──────────┘    │
              │                     ▼
┌─────────┐   │     ┌──────────┐  ┌───────────┐  ┌──────────┐
│ PENDING │───┤     │  FLAGGED │─►│ PUBLISHED │─►│ ARCHIVED │
└─────────┘   │     └──────────┘  └───────────┘  └──────────┘
              │          │
              │          │ moderator rejects
              │          ▼
              │     ┌──────────┐
              └────►│ REJECTED │  (terminal)
                    └──────────┘
```

- `PENDING → APPROVED → PUBLISHED`: low-risk auto-approve path
- `PENDING → FLAGGED → PUBLISHED`: moderator approves flagged review
- `PENDING → FLAGGED → REJECTED`: moderator rejects flagged review
- `PENDING → REJECTED`: auto-reject (score ≥ 75)
- `PUBLISHED → ARCHIVED`: soft-delete; hard deletes never occur

Every transition is recorded in `review_history`.
