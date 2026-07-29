CREATE TABLE "model_generation_events" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"model" text NOT NULL,
	"attempt" integer NOT NULL,
	"status" text NOT NULL,
	"upstream_status" integer,
	"duration_ms" integer NOT NULL,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"total_tokens" integer,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "model_generation_events_created_at_index" ON "model_generation_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "model_generation_events_request_id_index" ON "model_generation_events" USING btree ("request_id");