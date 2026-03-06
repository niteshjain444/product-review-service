# 08 — Coding Expectations

## 1. Language and Tooling Standards

| Concern | Standard |
|---------|---------|
| Language | TypeScript (strict mode) — no `any` except at explicit DB boundaries |
| Runtime | Node.js 20+ |
| Framework | Next.js 14 App Router — no Pages Router patterns |
| Styling | Tailwind CSS — no custom CSS files unless absolutely necessary |
| DB client | `@supabase/supabase-js` v2 |
| Linting | ESLint with `next/core-web-vitals` config |
| Formatting | Prettier (default config) |
| Node version manager | Use `.nvmrc` or `engines` field in `package.json` to pin Node version |

---

## 2. Project Structure

```
product-review-service/
├── app/
│   ├── api/
│   │   ├── init/route.ts               ← product seeding
│   │   ├── reviews/
│   │   │   ├── submit/route.ts         ← submission pipeline
│   │   │   └── product/route.ts        ← public review reads
│   │   └── moderation/
│   │       ├── queue/route.ts          ← moderation queue
│   │       ├── decide/route.ts         ← approve/reject
│   │       └── rejected/route.ts       ← auto-rejected view
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── ReviewForm.tsx                  ← customer submission form
│   ├── ReviewDisplay.tsx               ← published reviews + statistics
│   └── ModerationDashboard.tsx         ← internal moderation UI
├── lib/
│   ├── supabase.ts                     ← Supabase client initialisation
│   ├── reviewService.ts                ← all DB operations
│   ├── validation.ts                   ← content moderation engine
│   └── seed.ts                         ← seeding utilities
├── supabase/
│   └── migrations/                     ← timestamped SQL migrations
├── docs/                               ← project documentation
└── DECISION_LOG.md
```

**Rule:** One concern per file. Business logic lives in `lib/`. API routing and request/response shaping lives in `app/api/`. UI rendering lives in `components/`. Never mix DB logic into components or API routes directly — always go through `lib/reviewService.ts`.

---

## 3. TypeScript Standards

### Use explicit types for all public function signatures
```typescript
// Good
export async function submitReview(
  productId: string,
  customerId: string,
  rating: number,
  ...
): Promise<{ data: Review | null; error: any }>

// Bad — return type inferred, not explicit
export async function submitReview(productId, rating) {
```

### Define interfaces for all data shapes
All database entity shapes are defined in `lib/reviewService.ts` as exported interfaces:
```typescript
export interface Review { ... }
export interface ReviewStatistics { ... }
export type ReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'FLAGGED' | 'PUBLISHED' | 'ARCHIVED';
```

Use these types consistently across API routes and components. Do not redefine the same shape inline in multiple places.

### Avoid `any` except at DB boundaries
The Supabase client returns loosely typed results. It is acceptable to type the return of `supabase.from(...).select()` with your own interface. Do not propagate `any` further into the codebase.

```typescript
// Acceptable at DB boundary
const { data, error } = await supabase.from('reviews').select('*').single();
const review = data as Review;  // assert here; type the rest of the code

// Not acceptable
function processReview(review: any) { ... }  // never
```

---

## 4. API Route Standards

### Request validation first, DB operations second
```typescript
// Always validate before touching the database
if (!product_id || !customer_name) {
  return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
}
// Only reach DB operations after all validation passes
```

### Return specific, actionable error messages
```typescript
// Good
return NextResponse.json({ error: 'Title must be at least 5 characters', field: 'title' }, { status: 400 });

// Bad
return NextResponse.json({ error: 'Validation failed' }, { status: 400 });
```

### Never return PII in public-facing API responses
The `GET /api/reviews/product` endpoint must never return `customer_email`. Only `customer_name` is acceptable in public responses. Enforce this via explicit `.select()` field lists:
```typescript
// Good — explicit field selection
.select('id, customer_name, rating, title, review_text, created_at, helpful_count')

// Bad — returns all fields including email
.select('*')
```

### HTTP status codes
| Scenario | Code |
|----------|------|
| Success with created resource | 201 |
| Success with data | 200 |
| Missing or invalid fields | 400 |
| Duplicate resource | 409 |
| Rate limit exceeded | 429 |
| Server/DB error | 500 |

**Never return 4xx for content moderation outcomes.** Structurally valid submissions always return 201 regardless of risk score outcome.

---

## 5. Content Moderation Code Standards

### No shared mutable state in regex patterns

The `g` flag on module-level regex objects causes `lastIndex` state to persist between calls under concurrent requests. This produces intermittent false negatives.

```typescript
// CORRECT — no `g` flag on patterns used with .test()
const SPAM_PATTERNS = [
  /click here/i,         // no `g`
  /buy now/i,
];

// WRONG — `g` flag on shared object
const SPAM_PATTERNS = [
  /click here/gi,        // lastIndex will corrupt under concurrency
];
```

For patterns used with `.match()` (where `g` is needed for multiple matches), store as source strings and instantiate per call:
```typescript
const PII_PATTERN_SOURCES: [string, string][] = [
  [String.raw`\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b`, 'g'],
];

// At call time:
const matches = text.match(new RegExp(source, regexFlags));
```

### Word-boundary profanity matching

Always use `\b` word boundaries for profanity detection to prevent substring false positives:
```typescript
// CORRECT
new RegExp(`\\b${word}\\b`, 'i').test(lower)

// WRONG — matches "skill", "diet", "Essex"
lower.includes(word)
```

### Per-field scanning

Every new content signal must be added to `scanField()`, not directly to `calculateRiskScore()`. This ensures the signal is applied to both title and review body independently.

---

## 6. Database Operation Standards

### Always use `maybeSingle()` for lookups that may return zero rows
```typescript
// Good — returns null if not found, no error
.maybeSingle()

// Bad — throws if not found
.single()
```

### Always check errors before using data
```typescript
const { data, error } = await supabase.from('reviews').select('*').eq('id', id).maybeSingle();
if (error) {
  console.error('Error fetching review:', error);
  return null;
}
// Safe to use data here
```

### Audit every status change
Every call to `updateReviewStatus()` automatically appends to `review_history`. Never update the `status` column on `reviews` directly — always go through `updateReviewStatus()`:
```typescript
// Good
await updateReviewStatus(review.id, 'PUBLISHED', 'Auto-approved: low risk');

// Bad — bypasses audit trail
await supabase.from('reviews').update({ status: 'PUBLISHED' }).eq('id', id);
```

The only exception is `decide/route.ts` setting `PUBLISHED` directly after `updateReviewStatus(APPROVED)` — this is a known legacy pattern that should be consolidated in a future refactor.

### Soft deletes only
Never hard-delete reviews. Archive them:
```typescript
await updateReviewStatus(reviewId, 'ARCHIVED', 'Removed by moderation');
```

---

## 7. Frontend Component Standards

### Controlled components with explicit state
All form inputs are controlled. Every field has a corresponding state key:
```typescript
const [formData, setFormData] = useState({
  customer_name: '',
  customer_email: '',
  rating: 5,
  title: '',
  review_text: '',
});
```

Uncontrolled components (refs or defaultValue) are not permitted in forms. They cause the "invisible typed text" UX bug.

### Never show raw `status` values to users
The `status` field is an internal enum. Translate it before displaying:
```typescript
// Good
message: data.status === 'PUBLISHED' ? 'Your review is live!' : 'Review submitted successfully.'

// Bad
<p>{data.status}</p>
```

### Loading and error states for every async operation
Every component with a fetch must handle three states: loading, error, and data. No fetch result should be silently dropped.

### UUIDs generated on the client
`customer_id` is generated with `crypto.randomUUID()` at submission time — this is the standard browser API (available in all modern browsers and Node 20+). Do not use `Math.random()` or any non-UUID identifier.

---

## 8. Security Standards

### Input validation is server-side
Client-side validation (HTML `required`, `maxLength`) is UX-only. All validation that affects security or data integrity must be enforced in the API route:
- Name format: server-side regex in `submit/route.ts`
- Email format: server-side regex in `submit/route.ts`
- Rating range: `validateReviewSubmission()` in `validation.ts`
- Duplicate prevention: DB query in `submit/route.ts`

### No SQL injection vectors
All database queries use the Supabase JS client's parameterised query builder. Raw SQL (`supabase.rpc()` or template string queries) is not used in this codebase and must not be introduced without a security review.

### No secrets in source code
Supabase keys are accessed via `process.env`. The `.env.local` file is in `.gitignore`. Any accidental commit of a key requires immediate rotation.

### PII handling
- `customer_email` is stored in the DB but **never returned** in public API responses
- `customer_id` is an anonymous UUID — it is not linked to any user account
- The `review_history` audit table stores change reasons but not PII

---

## 9. Code Review Checklist

Before approving any PR, verify:

- [ ] No TypeScript `any` introduced outside DB boundaries
- [ ] New API routes validate all required fields before DB operations
- [ ] New content moderation patterns added to `scanField()`, not `calculateRiskScore()`
- [ ] No new regex patterns with `g` flag on module-level shared objects
- [ ] No direct `status` column updates bypassing `updateReviewStatus()`
- [ ] No `customer_email` returned in public-facing API responses
- [ ] `npm run build` passes with no errors
- [ ] Manual test of affected flow performed by the author
- [ ] `DECISION_LOG.md` updated if a new architectural decision was made
- [ ] No new hardcoded strings that should be constants or configuration

---

## 10. What Not to Do

| Anti-pattern | Why |
|-------------|-----|
| `String.includes(profanityWord)` | Substring match causes false positives ("skill" → "kill") |
| Module-level regex with `g` flag used in `.test()` | Shared `lastIndex` state causes intermittent failures under concurrency |
| Return `{ error: 'Validation failed' }` | Unhelpful; always return the specific field error message |
| `select('*')` on public endpoints | May leak PII or internal fields |
| Hard-delete reviews | Destroys audit trail; use ARCHIVED status |
| Content moderation result returned as 4xx | Blocks user submission for internal decisions; always 201 for structurally valid input |
| Committing `.env.local` | Exposes Supabase keys; rotate immediately if it happens |
| Skipping `review_history` on status update | Breaks audit trail; always use `updateReviewStatus()` |
