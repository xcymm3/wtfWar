import {
  characterGenerationRequestSchema,
  finalizeGeneratedCharacter,
  generatedCharacterDraftSchema,
  getCharacterGenerationSystemPrompt,
} from "@/lib/characters/promptCharacterGeneration";
import {
  logModelGenerationAttempt,
  logModelGenerationRequestFailure,
  recordModelGenerationAttempt,
} from "@/lib/observability/modelGenerationMetrics";
import type { Realm } from "@/types/character";

const DEFAULT_MODEL_REQUEST_TIMEOUT_MS = 60_000;
const MAX_MODEL_REQUEST_TIMEOUT_MS = 60_000;

type ModelConfiguration = {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
};

type ModelUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

type ModelResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: ModelUsage;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type ModelGenerationErrorCode =
  | "model_invalid_response"
  | "model_network_error"
  | "model_timeout"
  | "model_upstream_error";

class ModelGenerationError extends Error {
  constructor(
    readonly code: ModelGenerationErrorCode,
    readonly retryable: boolean,
    readonly upstreamStatus?: number,
    readonly retryInstruction?: string,
  ) {
    super(code);
    this.name = "ModelGenerationError";
  }
}

function getModelValidationRetryInstruction(error: unknown): string {
  if (error instanceof SyntaxError) {
    return "上一次输出不是可解析的 JSON。请只输出一个完整 JSON 对象，并严格遵守字段与数值范围。";
  }

  const issues = typeof error === "object" && error !== null && "issues" in error
    ? (error as { issues?: unknown }).issues
    : undefined;
  if (Array.isArray(issues)) {
    const messages = issues
      .map((issue) => (typeof issue === "object" && issue !== null && "message" in issue
        ? String((issue as { message: unknown }).message)
        : null))
      .filter((message): message is string => message !== null)
      .slice(0, 3);
    if (messages.length > 0) {
      if (messages.some((message) => message.includes("offensive active or passive skill"))) {
        return "上一次没有攻击来源。下一版必须将其中一个技能的 type 设为 damage、critical 或 area_damage；不得同时选择 area_control 和 shield。请输出完整合规 JSON。";
      }
      return `上一次输出未通过规则校验：${messages.join("；")}。请从头生成完整合规 JSON。`;
    }
  }

  return "上一次输出未通过格式或战斗规则校验。请从头生成完整 JSON，并逐项检查字段、范围和技能组合。";
}

function extractJsonContent(content: string): string {
  const trimmedContent = content.trim();
  const fencedJson = trimmedContent.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fencedJson?.[1] ?? trimmedContent;
}

function getModelRequestTimeoutMs(): number {
  const configuredTimeout = Number.parseInt(
    process.env.MODEL_REQUEST_TIMEOUT_MS ?? "",
    10,
  );

  if (!Number.isFinite(configuredTimeout) || configuredTimeout <= 0) {
    return DEFAULT_MODEL_REQUEST_TIMEOUT_MS;
  }

  return Math.min(configuredTimeout, MAX_MODEL_REQUEST_TIMEOUT_MS);
}

function getModelConfiguration(): ModelConfiguration | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  return {
    apiKey,
    baseUrl: (process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/+$/, ""),
    model: process.env.OPENAI_MODEL?.trim() || "gpt-4.1-mini",
    timeoutMs: getModelRequestTimeoutMs(),
  };
}

function normalizeModelGenerationError(
  error: unknown,
  controller: AbortController,
): ModelGenerationError {
  if (error instanceof ModelGenerationError) return error;

  if (controller.signal.aborted) {
    return new ModelGenerationError("model_timeout", true);
  }

  if (error instanceof SyntaxError || (error instanceof Error && error.name === "ZodError")) {
    return new ModelGenerationError(
      "model_invalid_response",
      true,
      undefined,
      getModelValidationRetryInstruction(error),
    );
  }

  return new ModelGenerationError("model_network_error", true);
}

async function generateModelAttempt(
  name: string,
  prompt: string,
  realm: Realm,
  retryInstruction: string | undefined,
  configuration: ModelConfiguration,
  requestId: string,
  attempt: number,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), configuration.timeoutMs);
  const startedAt = Date.now();
  let upstreamStatus: number | undefined;
  let usage: ModelUsage | undefined;

  try {
    const response = await fetch(`${configuration.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${configuration.apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: configuration.model,
        temperature: 0.2,
        max_tokens: 1000,
        messages: [
          { role: "system", content: getCharacterGenerationSystemPrompt() },
          {
            role: "user",
            content: `角色名称：${name}\n角色描述：${prompt}\n指定战斗力阶位：${realm}${retryInstruction ? `\n重试要求：${retryInstruction}` : ""}`,
          },
        ],
      }),
    });
    upstreamStatus = response.status;

    if (!response.ok) {
      throw new ModelGenerationError(
        "model_upstream_error",
        response.status === 429 || response.status >= 500,
        response.status,
      );
    }

    let payload: ModelResponse;
    try {
      payload = await response.json() as ModelResponse;
    } catch {
      throw new ModelGenerationError("model_invalid_response", true, response.status);
    }

    usage = payload.usage;
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new ModelGenerationError("model_invalid_response", true, response.status);
    }

    const rawDraft = JSON.parse(extractJsonContent(content));
    if (!isRecord(rawDraft)) {
      throw new ModelGenerationError("model_invalid_response", true, response.status);
    }
    // The caller owns name and realm; do not let a model echo change them.
    const draft = generatedCharacterDraftSchema.parse({ ...rawDraft, name, realm });
    const character = finalizeGeneratedCharacter(draft, prompt);
    const metric = {
      requestId,
      model: configuration.model,
      attempt,
      status: "succeeded" as const,
      durationMs: Date.now() - startedAt,
      upstreamStatus,
      promptTokens: usage?.prompt_tokens,
      completionTokens: usage?.completion_tokens,
      totalTokens: usage?.total_tokens,
    };
    logModelGenerationAttempt(metric);
    await recordModelGenerationAttempt(metric);
    return character;
  } catch (error) {
    const modelError = normalizeModelGenerationError(error, controller);
    const metric = {
      requestId,
      model: configuration.model,
      attempt,
      status: "failed" as const,
      durationMs: Date.now() - startedAt,
      upstreamStatus: modelError.upstreamStatus ?? upstreamStatus,
      promptTokens: usage?.prompt_tokens,
      completionTokens: usage?.completion_tokens,
      totalTokens: usage?.total_tokens,
      errorCode: modelError.code,
    };
    logModelGenerationAttempt(metric);
    await recordModelGenerationAttempt(metric);
    throw modelError;
  } finally {
    clearTimeout(timeout);
  }
}

async function generateWithModel(
  name: string,
  prompt: string,
  realm: Realm,
  configuration: ModelConfiguration,
  requestId: string,
) {
  let lastError: ModelGenerationError | undefined;
  let retryInstruction: string | undefined;

  // Agnes does not support grammar-constrained JSON. A single retry lets the
  // prompt-based JSON path recover from transient provider or draft failures.
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await generateModelAttempt(
        name,
        prompt,
        realm,
        retryInstruction,
        configuration,
        requestId,
        attempt,
      );
    } catch (error) {
      const modelError = error instanceof ModelGenerationError
        ? error
        : new ModelGenerationError("model_network_error", true);
      lastError = modelError;
      retryInstruction = modelError.retryInstruction;
      if (!modelError.retryable) break;
    }
  }

  throw lastError ?? new ModelGenerationError("model_network_error", true);
}

function jsonResponse(
  payload: Record<string, unknown>,
  requestId: string,
  status = 200,
): Response {
  return Response.json(
    { ...payload, requestId },
    { status, headers: { "X-Request-Id": requestId } },
  );
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    logModelGenerationRequestFailure(requestId, "invalid_json_request");
    return jsonResponse({ error: "请求内容不是有效 JSON。" }, requestId, 400);
  }

  const parsedRequest = characterGenerationRequestSchema.safeParse(body);
  if (!parsedRequest.success) {
    logModelGenerationRequestFailure(requestId, "invalid_generation_request");
    return jsonResponse(
      { error: "请填写角色名称，并用 8 至 500 个字符描述角色。" },
      requestId,
      400,
    );
  }

  const configuration = getModelConfiguration();
  if (!configuration) {
    logModelGenerationRequestFailure(requestId, "model_not_configured");
    return jsonResponse(
      { error: "AI 创角服务尚未配置，请联系管理员配置模型服务或改用手动创角。" },
      requestId,
      503,
    );
  }

  try {
    const character = await generateWithModel(
      parsedRequest.data.name,
      parsedRequest.data.prompt,
      parsedRequest.data.realm,
      configuration,
      requestId,
    );
    return jsonResponse({ character, source: "model" }, requestId);
  } catch (error) {
    const modelError = error instanceof ModelGenerationError
      ? error
      : new ModelGenerationError("model_network_error", true);
    const status = modelError.code === "model_timeout" ? 504 : 502;
    return jsonResponse(
      { error: "角色生成服务暂时无法给出合规角色，请稍后重试或改用手动创角。" },
      requestId,
      status,
    );
  }
}
