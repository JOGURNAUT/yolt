CREATE TABLE "drop_reminders" (
	"user_id" uuid NOT NULL,
	"drop_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drop_reminders_user_id_drop_id_pk" PRIMARY KEY("user_id","drop_id")
);
--> statement-breakpoint
ALTER TABLE "drops" ADD COLUMN "reminders_queued_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "drops" ADD COLUMN "opened_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "drop_reminders" ADD CONSTRAINT "drop_reminders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drop_reminders" ADD CONSTRAINT "drop_reminders_drop_id_drops_id_fk" FOREIGN KEY ("drop_id") REFERENCES "public"."drops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "drop_reminders_drop_idx" ON "drop_reminders" USING btree ("drop_id");--> statement-breakpoint
CREATE INDEX "listings_drop_idx" ON "listings" USING btree ("drop_id");--> statement-breakpoint
ALTER TABLE "drops" ADD CONSTRAINT "drops_max_holds_range" CHECK ("drops"."max_holds_per_buyer" BETWEEN 1 AND 5);