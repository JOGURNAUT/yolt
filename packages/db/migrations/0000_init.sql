CREATE TYPE "public"."condition_grade" AS ENUM('NEW_WITH_TAGS', 'LIKE_NEW', 'GOOD', 'FAIR');--> statement-breakpoint
CREATE TYPE "public"."drop_status" AS ENUM('DRAFT', 'SCHEDULED', 'LIVE', 'ENDED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."hold_source" AS ENUM('CHECKOUT', 'OFFER', 'DROP_CLAIM');--> statement-breakpoint
CREATE TYPE "public"."hold_status" AS ENUM('ACTIVE', 'CONVERTED', 'EXPIRED', 'RELEASED');--> statement-breakpoint
CREATE TYPE "public"."kyc_status" AS ENUM('NOT_STARTED', 'PENDING', 'VERIFIED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."listing_status" AS ENUM('DRAFT', 'SCHEDULED', 'AVAILABLE', 'RESERVED', 'PAYMENT_PENDING', 'SOLD', 'SOLD_ELSEWHERE', 'WITHDRAWN');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('AWAITING_PAYMENT', 'CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED', 'CLOSED', 'EXPIRED', 'CANCELLED_BY_BUYER', 'CANCELLED_BY_SELLER', 'NEEDS_REFUND');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('CREATED', 'PENDING', 'SUCCEEDED', 'FAILED', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."photo_kind" AS ENUM('FRONT', 'BACK', 'LABEL', 'FLAW', 'DETAIL', 'PROOF_OF_PURCHASE');--> statement-breakpoint
CREATE TYPE "public"."refund_status" AS ENUM('REQUESTED', 'PROCESSING', 'SUCCEEDED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."seller_status" AS ENUM('APPLIED', 'APPROVED', 'REJECTED', 'SUSPENDED');--> statement-breakpoint
CREATE TYPE "public"."seller_track" AS ENUM('STORE', 'CLOSET');--> statement-breakpoint
CREATE TABLE "addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"line1" text NOT NULL,
	"line2" text,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"pincode" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"actor_role" text NOT NULL,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" uuid NOT NULL,
	"title" text NOT NULL,
	"cover_url" text,
	"starts_at" timestamp with time zone NOT NULL,
	"status" "drop_status" DEFAULT 'DRAFT' NOT NULL,
	"max_holds_per_buyer" smallint DEFAULT 2 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "follows" (
	"user_id" uuid NOT NULL,
	"seller_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follows_user_id_seller_id_pk" PRIMARY KEY("user_id","seller_id")
);
--> statement-breakpoint
CREATE TABLE "holds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"source" "hold_source" NOT NULL,
	"status" "hold_status" DEFAULT 'ACTIVE' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "listing_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"url" text NOT NULL,
	"kind" "photo_kind" NOT NULL,
	"caption" text,
	"position" smallint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" uuid NOT NULL,
	"drop_id" uuid,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"category" text NOT NULL,
	"brand_declared" text,
	"tag_size" text,
	"measurements" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"condition" "condition_grade" NOT NULL,
	"flaws" text,
	"no_flaws_confirmed" boolean DEFAULT false NOT NULL,
	"price_paise" integer NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"status" "listing_status" DEFAULT 'DRAFT' NOT NULL,
	"current_hold_id" uuid,
	"size_returns_allowed" boolean DEFAULT false NOT NULL,
	"allow_offers" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"sold_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listings_slug_unique" UNIQUE("slug"),
	CONSTRAINT "listings_price_positive" CHECK ("listings"."price_paise" > 0),
	CONSTRAINT "listings_hold_matches_status" CHECK (("listings"."current_hold_id" IS NULL) = ("listings"."status" NOT IN ('RESERVED', 'PAYMENT_PENDING')))
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"listing_id" uuid NOT NULL,
	"price_paise" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"allocated" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"buyer_id" uuid NOT NULL,
	"seller_id" uuid NOT NULL,
	"status" "order_status" DEFAULT 'AWAITING_PAYMENT' NOT NULL,
	"subtotal_paise" integer NOT NULL,
	"shipping_paise" integer NOT NULL,
	"platform_fee_paise" integer DEFAULT 0 NOT NULL,
	"total_paise" integer NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"shipping_address" jsonb,
	"dispatch_by" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_reference_unique" UNIQUE("reference"),
	CONSTRAINT "orders_total_matches" CHECK ("orders"."total_paise" = "orders"."subtotal_paise" + "orders"."shipping_paise" + "orders"."platform_fee_paise")
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "payment_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_order_id" text,
	"amount_paise" integer NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"status" "payment_status" DEFAULT 'CREATED' NOT NULL,
	"provider_payment_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"payment_attempt_id" uuid NOT NULL,
	"amount_paise" integer NOT NULL,
	"reason" text NOT NULL,
	"status" "refund_status" DEFAULT 'REQUESTED' NOT NULL,
	"provider_refund_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_item_id" uuid NOT NULL,
	"seller_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"rating" smallint NOT NULL,
	"accuracy_rating" smallint,
	"body" text,
	"photo_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"seller_reply" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_order_item_id_unique" UNIQUE("order_item_id"),
	CONSTRAINT "reviews_rating_range" CHECK ("reviews"."rating" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE "saved_items" (
	"user_id" uuid NOT NULL,
	"listing_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_items_user_id_listing_id_pk" PRIMARY KEY("user_id","listing_id")
);
--> statement-breakpoint
CREATE TABLE "sellers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"track" "seller_track" NOT NULL,
	"status" "seller_status" DEFAULT 'APPLIED' NOT NULL,
	"kyc_status" "kyc_status" DEFAULT 'NOT_STARTED' NOT NULL,
	"handle" text NOT NULL,
	"display_name" text NOT NULL,
	"bio" text,
	"logo_url" text,
	"banner_url" text,
	"instagram_handle" text,
	"instagram_verified_at" timestamp with time zone,
	"gstin" text,
	"pickup_state" text,
	"shipping_fee_paise" integer DEFAULT 0 NOT NULL,
	"free_shipping_above_paise" integer,
	"dispatch_days" smallint DEFAULT 2 NOT NULL,
	"size_returns_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sellers_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "sellers_handle_unique" UNIQUE("handle")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text,
	"email" text,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_phone_unique" UNIQUE("phone"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drops" ADD CONSTRAINT "drops_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holds" ADD CONSTRAINT "holds_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holds" ADD CONSTRAINT "holds_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_photos" ADD CONSTRAINT "listing_photos_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_drop_id_drops_id_fk" FOREIGN KEY ("drop_id") REFERENCES "public"."drops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_attempt_id_payment_attempts_id_fk" FOREIGN KEY ("payment_attempt_id") REFERENCES "public"."payment_attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_items" ADD CONSTRAINT "saved_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_items" ADD CONSTRAINT "saved_items_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sellers" ADD CONSTRAINT "sellers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "addresses_user_idx" ON "addresses" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_events" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "drops_seller_idx" ON "drops" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "drops_starts_idx" ON "drops" USING btree ("starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "holds_one_active_per_listing" ON "holds" USING btree ("listing_id") WHERE "holds"."status" = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "holds_active_expiry_idx" ON "holds" USING btree ("expires_at") WHERE "holds"."status" = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "holds_order_idx" ON "holds" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "listing_photos_position_uq" ON "listing_photos" USING btree ("listing_id","position");--> statement-breakpoint
CREATE INDEX "listings_seller_status_idx" ON "listings" USING btree ("seller_id","status");--> statement-breakpoint
CREATE INDEX "listings_status_published_idx" ON "listings" USING btree ("status","published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "order_items_order_listing_uq" ON "order_items" USING btree ("order_id","listing_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_items_one_allocation_per_listing" ON "order_items" USING btree ("listing_id") WHERE "order_items"."allocated";--> statement-breakpoint
CREATE INDEX "orders_buyer_idx" ON "orders" USING btree ("buyer_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_seller_idx" ON "orders" USING btree ("seller_id","status");--> statement-breakpoint
CREATE INDEX "outbox_unprocessed_idx" ON "outbox_events" USING btree ("created_at") WHERE "outbox_events"."processed_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_attempts_provider_order_uq" ON "payment_attempts" USING btree ("provider","provider_order_id");--> statement-breakpoint
CREATE INDEX "payment_attempts_order_idx" ON "payment_attempts" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_events_provider_event_uq" ON "payment_events" USING btree ("provider","provider_event_id");--> statement-breakpoint
CREATE INDEX "refunds_order_idx" ON "refunds" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "reviews_seller_idx" ON "reviews" USING btree ("seller_id","created_at");