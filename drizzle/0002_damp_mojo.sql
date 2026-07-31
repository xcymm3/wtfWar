CREATE TABLE "battle_records" (
	"id" text PRIMARY KEY NOT NULL,
	"seed" text NOT NULL,
	"left_team" jsonb NOT NULL,
	"right_team" jsonb NOT NULL,
	"winner" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "battle_records_created_at_index" ON "battle_records" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "battle_records_winner_index" ON "battle_records" USING btree ("winner");