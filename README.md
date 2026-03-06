# Product Review Service

An in-house product review system built with Next.js, TypeScript, and Supabase — replacing a third-party review platform integration.

## Features

- **Review submission** — validated form with name, email, rating (1–5), title, and body
- **Automated content moderation** — risk scoring engine covering profanity, garbage text, spam, PII, and negative recommendation detection
- **Three-tier routing** — auto-publish (score 0–25), human moderation queue (26–74), auto-reject (≥75)
- **Moderation dashboard** — queue sorted by risk score, approve/reject actions, audit trail
- **Auto-rejected reviews tab** — full rejection reasons stored and viewable
- **Product rating statistics** — aggregated average, distribution breakdown, total count
- **Rate limiting** — per-customer daily, monthly, and per-product caps
- **Full audit trail** — every status transition recorded in `review_history`

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 13 (App Router) |
| Language | TypeScript |
| Database | Supabase (PostgreSQL) |
| Styling | Tailwind CSS |

## Getting Started

### 1. Set up environment variables

Create a `.env.local` file in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
```

### 2. Run the database migration

In your Supabase dashboard SQL editor, run:

```
supabase/migrations/20260304145744_001_create_review_system_schema.sql
```

### 3. Start the development server

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 4. Seed the demo product

On first load the app calls `/api/init` automatically. You can also trigger it manually:

```bash
curl -X POST http://localhost:3000/api/init
```

## Project Structure

```
app/
  api/
    reviews/submit/        ← POST: submit a review
    reviews/product/       ← GET: published reviews + statistics
    moderation/queue/      ← GET: moderation queue
    moderation/decide/     ← POST: approve or reject
    moderation/rejected/   ← GET: auto-rejected reviews
    init/                  ← POST: seed demo product
  page.tsx                 ← main UI (demo product + moderation tabs)
  layout.tsx

components/
  ReviewForm.tsx           ← customer submission form
  ReviewDisplay.tsx        ← published reviews + rating statistics
  ModerationDashboard.tsx  ← internal moderation UI

lib/
  validation.ts            ← content moderation engine (scoring, patterns)
  reviewService.ts         ← all database operations
  supabase.ts              ← Supabase client

supabase/
  migrations/              ← versioned SQL migrations

docs/
  01_PROJECT_PLANNING.md
  02_SYSTEM_DESIGN.md      ← HLD + LLD, API contracts, schema
  03_EXECUTION.md          ← task breakdown, agile practices, migration plan
  04_DELIVERY.md           ← milestones, release checklist, UAT scenarios
  05_COMMUNICATION.md      ← stakeholder map, RACI, communication cadence
  06_DEPLOYMENT.md         ← environment setup, CI/CD, rollback procedures
  07_POST_RELEASE_SUCCESS.md ← monitoring, runbooks, KPIs
  08_CODING_EXPECTATIONS.md  ← standards, conventions, anti-patterns
  09_TESTING_GUIDE.md      ← detailed test scenarios

DECISION_LOG.md            ← all architectural decisions (38 decisions)
```

## Review Workflow

```
Submit → Validate (name, email, rating, length)
       → Score content (title + body independently)
       → Score 0–25   → PUBLISHED immediately
       → Score 26–74  → FLAGGED → moderation queue
       → Score ≥ 75   → REJECTED (saved, not published)
```

All submissions return HTTP 201 if structurally valid. Content moderation outcome is applied silently post-save.

## Documentation

All architectural decisions are recorded in [DECISION_LOG.md](DECISION_LOG.md). Detailed design, deployment, and coding standards are in the [docs/](docs/) folder.
