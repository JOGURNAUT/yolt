CREATE TYPE "public"."application_status" AS ENUM('NEW', 'CONTACTED', 'ONBOARDED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."application_volume" AS ENUM('UNDER_20', 'BETWEEN_20_50', 'BETWEEN_50_100', 'OVER_100');--> statement-breakpoint
CREATE TYPE "public"."homepage_slot_kind" AS ENUM('FEATURED_STORE', 'GRAILS', 'EDIT');--> statement-breakpoint
CREATE TABLE "buyer_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"sizes" text[] DEFAULT '{}'::text[] NOT NULL,
	"styles" text[] DEFAULT '{}'::text[] NOT NULL,
	"max_budget_paise" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "homepage_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "homepage_slot_kind" NOT NULL,
	"seller_id" uuid,
	"title" text,
	"listing_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "homepage_slots_window_order" CHECK ("homepage_slots"."starts_at" IS NULL OR "homepage_slots"."ends_at" IS NULL OR "homepage_slots"."ends_at" > "homepage_slots"."starts_at"),
	CONSTRAINT "homepage_slots_shape" CHECK (("homepage_slots"."kind" = 'FEATURED_STORE' AND "homepage_slots"."seller_id" IS NOT NULL) OR ("homepage_slots"."kind" <> 'FEATURED_STORE' AND "homepage_slots"."seller_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "rate_limit_hits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seller_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_name" text NOT NULL,
	"instagram_handle" text NOT NULL,
	"city" text NOT NULL,
	"what_they_sell" text NOT NULL,
	"pieces_per_month" "application_volume" NOT NULL,
	"phone" text NOT NULL,
	"user_id" uuid,
	"status" "application_status" DEFAULT 'NEW' NOT NULL,
	"admin_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sellers" ADD COLUMN "logo_key" text;--> statement-breakpoint
ALTER TABLE "sellers" ADD COLUMN "banner_key" text;--> statement-breakpoint
ALTER TABLE "sellers" ADD COLUMN "pickup_name" text;--> statement-breakpoint
ALTER TABLE "sellers" ADD COLUMN "pickup_phone" text;--> statement-breakpoint
ALTER TABLE "sellers" ADD COLUMN "pickup_line1" text;--> statement-breakpoint
ALTER TABLE "sellers" ADD COLUMN "pickup_line2" text;--> statement-breakpoint
ALTER TABLE "sellers" ADD COLUMN "pickup_landmark" text;--> statement-breakpoint
ALTER TABLE "sellers" ADD COLUMN "pickup_city" text;--> statement-breakpoint
ALTER TABLE "buyer_preferences" ADD CONSTRAINT "buyer_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homepage_slots" ADD CONSTRAINT "homepage_slots_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homepage_slots" ADD CONSTRAINT "homepage_slots_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_applications" ADD CONSTRAINT "seller_applications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "homepage_slots_kind_idx" ON "homepage_slots" USING btree ("kind","created_at");--> statement-breakpoint
CREATE INDEX "rate_limit_hits_key_idx" ON "rate_limit_hits" USING btree ("key","created_at");--> statement-breakpoint
CREATE INDEX "seller_applications_status_idx" ON "seller_applications" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "seller_applications_open_phone" ON "seller_applications" USING btree ("phone") WHERE "seller_applications"."status" IN ('NEW', 'CONTACTED');--> statement-breakpoint
CREATE UNIQUE INDEX "seller_applications_open_handle" ON "seller_applications" USING btree ("instagram_handle") WHERE "seller_applications"."status" IN ('NEW', 'CONTACTED');