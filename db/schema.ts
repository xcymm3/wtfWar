import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import type { Character } from "@/types/character";

export const characters = pgTable(
  "characters",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    data: jsonb("data").$type<Character>().notNull(),
    isPreset: boolean("is_preset").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("characters_normalized_name_unique").on(table.normalizedName),
  ],
);

export const modelGenerationEvents = pgTable(
  "model_generation_events",
  {
    id: text("id").primaryKey(),
    requestId: text("request_id").notNull(),
    model: text("model").notNull(),
    attempt: integer("attempt").notNull(),
    status: text("status").notNull(),
    upstreamStatus: integer("upstream_status"),
    durationMs: integer("duration_ms").notNull(),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    totalTokens: integer("total_tokens"),
    errorCode: text("error_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("model_generation_events_created_at_index").on(table.createdAt),
    index("model_generation_events_request_id_index").on(table.requestId),
  ],
);
