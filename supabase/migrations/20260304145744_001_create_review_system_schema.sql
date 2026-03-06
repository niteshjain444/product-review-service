/*
  # Create Product Review System Schema

  ## Overview
  This migration creates the foundational schema for the product review system, replacing
  third-party integration. It establishes the core entities, relationships, and audit capabilities.

  ## New Tables

  1. **products** - Product catalog
     - id: UUID primary key
     - name: Product name
     - description: Product description
     - category: Product category for organization
     - sku: Stock keeping unit (product identifier)
     - created_at: Timestamp
     - updated_at: Timestamp

  2. **reviews** - Individual customer reviews
     - id: UUID primary key
     - product_id: Foreign key to products
     - customer_id: Customer/user identifier (can be anonymous UUID)
     - customer_email: Email for communication (optional, for non-auth users)
     - customer_name: Display name for review
     - rating: Numeric rating (1-5)
     - title: Review title/summary
     - review_text: Full review content
     - verified_purchase: Boolean flag for verified purchase status
     - status: Current state in workflow (PENDING, APPROVED, REJECTED, FLAGGED, PUBLISHED, ARCHIVED)
     - risk_score: Automated risk assessment (0-100, higher = riskier)
     - rejection_reason: Reason if rejected
     - created_at: Submission timestamp
     - updated_at: Last modification timestamp
     - published_at: When review became publicly visible
     - helpful_count: Number of users who found helpful
     - unhelpful_count: Number of users who found unhelpful

  3. **review_statistics** - Aggregated product rating data
     - product_id: FK to products (primary key)
     - average_rating: Average of published reviews
     - total_reviews: Count of published reviews
     - verified_reviews: Count of verified purchase reviews
     - rating_breakdown: JSON with counts per star (1-5)
     - last_updated: When statistics were last recalculated
     
  4. **moderation_queue** - Reviews pending manual review
     - id: UUID primary key
     - review_id: FK to reviews (unique)
     - priority: HIGH, MEDIUM, LOW
     - reason: Why it needs manual review
     - assigned_to: Moderator user ID (nullable)
     - created_at: When added to queue
     - resolved_at: When moderator resolved it

  5. **review_history** - Audit trail for all review state changes
     - id: UUID primary key
     - review_id: FK to reviews
     - old_status: Previous status
     - new_status: New status
     - changed_by: Who made the change (system or user ID)
     - change_reason: Why the change was made
     - created_at: Timestamp of change

  6. **customer_review_limits** - Track review submission counts for rate limiting
     - customer_id: Customer identifier
     - product_id: Product identifier
     - count_today: Reviews submitted today
     - count_this_month: Reviews submitted this month
     - reviews_per_product: Count of reviews for this product
     - last_reset_date: Last date counts were reset
     - PRIMARY KEY (customer_id, product_id)

  ## Security (Row Level Security)
  - All tables have RLS enabled
  - Policies enforce customer data privacy
  - Published reviews visible to all users
  - Unpublished reviews only visible to author
  - System functions bypass RLS for moderation

  ## Indexes
  - product_id on reviews (for product review lookups)
  - status on reviews (for filtering by state)
  - created_at on reviews (for sorting)
  - composite (product_id, status) on reviews (common query pattern)
  - review_id on moderation_queue (unique constraint)
  - customer_id, product_id on reviews (rate limiting checks)

  ## Important Notes
  1. All PII (customer email, name) is stored but governed by RLS to prevent unauthorized access
  2. Hard deletes never occur - reviews are archived instead (soft delete pattern)
  3. Timestamps always in UTC
  4. Rating breakdown stored as JSON for fast access without separate table
  5. Moderation queue is separate table for efficient filtering and assignment
  6. Review history provides complete audit trail for compliance and debugging
*/

-- Create products table
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  sku TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create reviews table with comprehensive workflow support
CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id),
  customer_id UUID NOT NULL,
  customer_email TEXT,
  customer_name TEXT NOT NULL,
  rating SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title TEXT NOT NULL,
  review_text TEXT NOT NULL,
  verified_purchase BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'FLAGGED', 'PUBLISHED', 'ARCHIVED')),
  risk_score SMALLINT DEFAULT 0 CHECK (risk_score >= 0 AND risk_score <= 100),
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  published_at TIMESTAMPTZ,
  helpful_count INTEGER DEFAULT 0,
  unhelpful_count INTEGER DEFAULT 0
);

-- Create review statistics table for aggregated data
CREATE TABLE IF NOT EXISTS review_statistics (
  product_id UUID PRIMARY KEY REFERENCES products(id),
  average_rating NUMERIC(3,2) DEFAULT 0,
  total_reviews INTEGER DEFAULT 0,
  verified_reviews INTEGER DEFAULT 0,
  rating_breakdown JSONB DEFAULT '{
    "1": 0,
    "2": 0,
    "3": 0,
    "4": 0,
    "5": 0
  }',
  last_updated TIMESTAMPTZ DEFAULT now()
);

-- Create moderation queue table
CREATE TABLE IF NOT EXISTS moderation_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID NOT NULL UNIQUE REFERENCES reviews(id),
  priority TEXT DEFAULT 'MEDIUM' CHECK (priority IN ('HIGH', 'MEDIUM', 'LOW')),
  reason TEXT NOT NULL,
  assigned_to UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

-- Create review history (audit trail)
CREATE TABLE IF NOT EXISTS review_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID NOT NULL REFERENCES reviews(id),
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_by TEXT DEFAULT 'system',
  change_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create customer review limits tracking table
CREATE TABLE IF NOT EXISTS customer_review_limits (
  customer_id UUID NOT NULL,
  product_id UUID NOT NULL,
  count_today INTEGER DEFAULT 0,
  count_this_month INTEGER DEFAULT 0,
  reviews_per_product INTEGER DEFAULT 0,
  last_reset_date DATE DEFAULT CURRENT_DATE,
  PRIMARY KEY (customer_id, product_id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Create indexes for query performance
CREATE INDEX IF NOT EXISTS idx_reviews_product_id ON reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(status);
CREATE INDEX IF NOT EXISTS idx_reviews_created_at ON reviews(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_customer_id ON reviews(customer_id);
CREATE INDEX IF NOT EXISTS idx_reviews_product_status ON reviews(product_id, status);
CREATE INDEX IF NOT EXISTS idx_moderation_queue_priority ON moderation_queue(priority, resolved_at);
CREATE INDEX IF NOT EXISTS idx_review_history_review_id ON review_history(review_id);
CREATE INDEX IF NOT EXISTS idx_customer_limits_dates ON customer_review_limits(last_reset_date);

-- Enable Row Level Security
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_statistics ENABLE ROW LEVEL SECURITY;
ALTER TABLE moderation_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_review_limits ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Anyone can read products
CREATE POLICY "Products are readable to all"
  ON products FOR SELECT
  USING (true);

-- RLS Policy: Published reviews are readable to all
CREATE POLICY "Published reviews readable to all"
  ON reviews FOR SELECT
  USING (status = 'PUBLISHED');

-- RLS Policy: Users can see their own reviews (any status)
CREATE POLICY "Users can read own reviews"
  ON reviews FOR SELECT
  USING (customer_id::text = current_user);

-- RLS Policy: Users can insert their own reviews
CREATE POLICY "Users can submit reviews"
  ON reviews FOR INSERT
  WITH CHECK (customer_id::text = current_user);

-- RLS Policy: Statistics readable by all
CREATE POLICY "Review statistics readable to all"
  ON review_statistics FOR SELECT
  USING (true);

-- RLS Policy: Moderation queue hidden by default
CREATE POLICY "Moderation queue hidden by default"
  ON moderation_queue FOR SELECT
  USING (false);

-- RLS Policy: Review history hidden by default
CREATE POLICY "Review history hidden by default"
  ON review_history FOR SELECT
  USING (false);

-- RLS Policy: Rate limiting data hidden by default
CREATE POLICY "Rate limiting data hidden by default"
  ON customer_review_limits FOR SELECT
  USING (false);
