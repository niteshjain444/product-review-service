# 06 — Deployment

## 1. Environment Strategy

Three environments are maintained:

| Environment | Purpose | Database | Deploy Trigger |
|-------------|---------|----------|----------------|
| Local (dev) | Individual development | Local `.env.local` pointing to dev Supabase project | Manual (`npm run dev`) |
| Staging | Integration testing, UAT, pre-release verification | Staging Supabase project (separate from prod) | Merge to `staging` branch (auto-deploy) |
| Production | Live traffic | Production Supabase project | Merge to `main` after staging sign-off |

---

## 2. Environment Variables

All secrets and configuration are managed via environment variables. **No keys are hardcoded in source code.**

### Required Variables

| Variable | Description | Where to obtain |
|----------|-------------|-----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Supabase dashboard → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key (safe for browser) | Supabase dashboard → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server-only, bypasses RLS) | Supabase dashboard → Settings → API |

### Environment-Specific Setup

**Local (`.env.local` — never committed to git):**
```env
NEXT_PUBLIC_SUPABASE_URL=https://<your-dev-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<dev-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<dev-service-role-key>
```

**Staging / Production (Vercel Dashboard → Environment Variables):**
- Set separately per environment in Vercel project settings
- Production keys must never be used in local or staging environments
- Rotate keys immediately if accidentally committed to git

### Security Rules
- `SUPABASE_SERVICE_ROLE_KEY` is **server-only** — never pass it to the browser. It is used only in API routes that need to bypass RLS (e.g., moderation operations).
- `NEXT_PUBLIC_*` variables are safe for the browser but should still use appropriate RLS policies to restrict what the anon key can access.

---

## 3. Database Deployment

### Migration Management

Migrations are stored in `supabase/migrations/` with a timestamp-prefixed filename:
```
supabase/migrations/
  20260304145744_001_create_review_system_schema.sql
  20260305_000000_002_<next-migration>.sql  ← future migrations
```

### Running Migrations

**Local development:**
```bash
# Apply via Supabase CLI
supabase db push

# Or run SQL directly in Supabase dashboard SQL editor
```

**Staging / Production:**
```bash
# Via Supabase CLI with project ref
supabase db push --project-ref <staging-project-ref>
supabase db push --project-ref <prod-project-ref>
```

**Always run migrations on staging before production.** Migration failures in production require manual intervention and may cause downtime.

### RLS Policy Activation (Production Only)

The prototype disables RLS for development speed. Before production go-live:

```sql
-- Enable RLS (already defined in migration, just disabled for dev)
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_statistics ENABLE ROW LEVEL SECURITY;
ALTER TABLE moderation_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_review_limits ENABLE ROW LEVEL SECURITY;
```

The API routes use the **service role key** (via `supabase` client in `lib/supabase.ts`) which bypasses RLS, so moderation operations will continue to work. The anon key used by the browser will be restricted by RLS policies.

### Seeding Production

After migrations, seed the demo product:
```bash
curl -X POST https://<prod-url>/api/init
```
This is idempotent — calling it multiple times will not create duplicates (it upserts by SKU).

---

## 4. Application Deployment (Vercel)

### Initial Setup

1. Push repository to GitHub
2. Connect GitHub repo to Vercel project
3. Set environment variables in Vercel dashboard for each environment
4. Vercel auto-detects Next.js and configures build settings

### Build Configuration

```json
// Vercel auto-detected (no vercel.json required for standard Next.js)
Build Command:   npm run build
Output Directory: .next
Install Command: npm install
Node.js Version: 20.x
```

### Deployment Commands (manual if needed)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy to preview (staging-equivalent)
vercel

# Deploy to production
vercel --prod
```

### Deployment Pipeline

```
Developer pushes to feature branch
        │
        ▼
PR opened → Vercel creates preview deployment (auto)
        │
        ▼
PR reviewed and approved
        │
        ▼
Merge to staging branch
        │  Vercel auto-deploys to staging environment
        ▼
QA and UAT on staging
        │
        ▼
Staging sign-off (QA + PM)
        │
        ▼
Merge to main
        │  Vercel auto-deploys to production
        ▼
Post-deploy smoke test (see 04_DELIVERY.md checklist)
```

---

## 5. Health Checks

After each deployment, run the following health checks:

```bash
# 1. Check product reviews endpoint
curl "https://<url>/api/reviews/product?product_id=<demo-product-id>"
# Expected: 200 with { reviews: [], statistics: {...} }

# 2. Check init endpoint
curl -X POST "https://<url>/api/init"
# Expected: 200 with { product_id: "..." }

# 3. Check moderation queue
curl "https://<url>/api/moderation/queue"
# Expected: 200 with { queue: [...], total: N }

# 4. Submit a test review
curl -X POST "https://<url>/api/reviews/submit" \
  -H "Content-Type: application/json" \
  -d '{"product_id":"<id>","customer_id":"00000000-0000-0000-0000-000000000001","customer_name":"Test User","customer_email":"deploy-test@example.com","rating":5,"title":"Deploy test review","review_text":"This is a deployment verification review submitted automatically."}'
# Expected: 201
```

---

## 6. Rollback Procedure

### Application Rollback (Vercel)
1. Go to Vercel dashboard → Deployments
2. Find the previous stable deployment
3. Click "Promote to Production" — this is instant and zero-downtime

### Database Rollback
Database rollbacks are complex and risky. Prefer forward-fix (write a new migration) over rolling back.

If a migration must be rolled back:
1. Assess what data was written since the migration ran
2. Write a compensating migration that reverts schema changes without losing data
3. Test the compensating migration on a database snapshot first
4. Apply to staging, verify, then production
5. Never drop tables or columns with live data without first archiving data

---

## 7. Zero-Downtime Deployment Checklist

Vercel deployments are zero-downtime by default (traffic switches atomically). The following additional steps ensure continuity:

- [ ] All database migrations are backward compatible (add columns; never drop in the same release as code that depends on them being absent)
- [ ] New API response fields are additive (old frontend versions still work)
- [ ] Environment variables for new features are set before code that uses them is deployed
- [ ] No in-flight reviews are lost during deployment (Supabase transactions are atomic)

---

## 8. Monitoring and Alerting Setup

Configure the following in Vercel and Supabase before go-live:

| Monitor | Tool | Alert Threshold |
|---------|------|-----------------|
| API error rate | Vercel Analytics | > 1% 5xx responses |
| API response time | Vercel Analytics | p95 > 3 seconds |
| Database connection errors | Supabase logs | Any connection pool exhaustion |
| Slow queries | Supabase Performance | > 1 second query time |
| Deployment failures | Vercel / GitHub Actions | Any build failure |

See 07_POST_RELEASE_SUCCESS.md for ongoing monitoring strategy.
