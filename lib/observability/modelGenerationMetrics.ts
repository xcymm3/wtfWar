import { nanoid } from "nanoid";

import { getDb } from "@/db";
import { modelGenerationEvents } from "@/db/schema";

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
    await getDb().insert(modelGenerationEvents).values({
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
  } catch (error) {
    // Metrics must not turn a successful character generation into a failure.
    writeStructuredLog("error", "model_generation.metric_persist_failed", {
      requestId: attempt.requestId,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
  }
}
