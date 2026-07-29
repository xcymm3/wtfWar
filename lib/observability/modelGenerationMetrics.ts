import { nanoid } from "nanoid";
import { sql } from "drizzle-orm";

import { getDb } from "@/db";
import { modelGenerationEvents } from "@/db/schema";

const MODEL_GENERATION_EVENT_RETENTION_LIMIT = 10_000;

type ModelGenerationStatus = "succeeded" | "failed";

export type ModelGenerationAttempt = {
  requestId: string;
  model: string;
  attempt: number;
  status: ModelGenerationStatus;
  durationMs: number;
  upstreamStatus?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  errorCode?: string;
};

function writeStructuredLog(
  level: "info" | "error",
  event: string,
  fields: Record<string, unknown>,
): void {
  const message = JSON.stringify({ event, ...fields });
  if (level === "error") {
    console.error(message);
    return;
  }

  console.info(message);
}

export function logModelGenerationAttempt(attempt: ModelGenerationAttempt): void {
  writeStructuredLog(
    attempt.status === "succeeded" ? "info" : "error",
    `model_generation.${attempt.status}`,
    attempt,
  );
}

export function logModelGenerationRequestFailure(
  requestId: string,
  errorCode: string,
): void {
  writeStructuredLog("error", "model_generation.request_rejected", {
    requestId,
    errorCode,
  });
}

export async function recordModelGenerationAttempt(
  attempt: ModelGenerationAttempt,
): Promise<void> {
  try {
    const db = getDb();
    await db.insert(modelGenerationEvents).values({
      id: nanoid(),
      requestId: attempt.requestId,
      model: attempt.model,
      attempt: attempt.attempt,
      status: attempt.status,
      upstreamStatus: attempt.upstreamStatus,
      durationMs: attempt.durationMs,
      promptTokens: attempt.promptTokens,
      completionTokens: attempt.completionTokens,
      totalTokens: attempt.totalTokens,
      errorCode: attempt.errorCode,
    });
    await db.execute(sql`
      DELETE FROM model_generation_events
      WHERE id IN (
        SELECT id
        FROM (
          SELECT id
          FROM model_generation_events
          ORDER BY created_at DESC, id DESC
          OFFSET ${MODEL_GENERATION_EVENT_RETENTION_LIMIT}
        ) AS stale_model_generation_events
      )
    `);
  } catch (error) {
    // Metrics must not turn a successful character generation into a failure.
    writeStructuredLog("error", "model_generation.metric_persist_failed", {
      requestId: attempt.requestId,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
  }
}
