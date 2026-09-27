CREATE TYPE "public"."claim_reason" AS ENUM('NOT_AS_DESCRIBED', 'DAMAGED', 'WRONG_ITEM', 'NOT_RECEIVED');--> statement-breakpoint
CREATE TYPE "public"."claim_status" AS ENUM('OPEN', 'ESCALATED', 'REFUNDED', 'REJECTED', 'WITHDRAWN');--> statement-breakpoint
CREATE TABLE "claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"seller_id" uuid NOT NULL,
	"reason" "claim_reason" NOT NULL,
	"description" text NOT NULL,
	"photo_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "claim_status" DEFAULT 'OPEN' NOT NULL,
	"seller_response" text,
	"seller_responded_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"refund_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "seller_replied_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_refund_id_refunds_id_fk" FOREIGN KEY ("refund_id") REFERENCES "public"."refunds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "claims_one_per_order" ON "claims" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "claims_seller_status_idx" ON "claims" USING btree ("seller_id","status");--> statement-breakpoint
ALTER TABLE "listings" DROP COLUMN "size_returns_allowed";--> statement-breakpoint
ALTER TABLE "sellers" DROP COLUMN "size_returns_default";