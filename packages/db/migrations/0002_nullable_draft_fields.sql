ALTER TABLE "listings" ALTER COLUMN "title" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "listings" ALTER COLUMN "category" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "listings" ALTER COLUMN "condition" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "listings" ALTER COLUMN "price_paise" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_complete_unless_draft" CHECK ("listings"."status" = 'DRAFT' OR ("listings"."title" IS NOT NULL AND "listings"."category" IS NOT NULL AND "listings"."condition" IS NOT NULL AND "listings"."price_paise" IS NOT NULL));