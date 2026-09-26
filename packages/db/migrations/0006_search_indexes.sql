-- Search (packages/core/src/search.ts). The indexed expressions must stay identical to
-- LISTING_SEARCH_DOC / LISTING_TRGM_DOC / SELLER_TRGM_DOC there, or Postgres won't use them.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "listings_search_fts_idx" ON "listings" USING gin (
  to_tsvector('simple', translate(lower(coalesce("title", '') || ' ' || coalesce("brand_declared", '') || ' ' || coalesce("category", '') || ' ' || coalesce("tag_size", '') || ' ' || coalesce("description", '')), '''’', ''))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "listings_search_trgm_idx" ON "listings" USING gin (
  (translate(lower(coalesce("title", '') || ' ' || coalesce("brand_declared", '')), '''’', '')) gin_trgm_ops
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sellers_search_trgm_idx" ON "sellers" USING gin (
  (lower("display_name" || ' ' || "handle")) gin_trgm_ops
);
