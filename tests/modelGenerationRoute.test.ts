import assert from "node:assert/strict";
import test from "node:test";

import { POST } from "../app/api/characters/generate/route";

type CapturedLog = Record<string, unknown>;

const originalFetch = globalThis.fetch;
const originalConsoleInfo = console.info;
const originalConsoleError = console.error;

function setEnvironment(name: string, value: string): () => void {
  const previousValue = process.env[name];
  process.env[name] = value;

  return () => {
    if (previousValue === undefined) {
      delete process.env[name];
      return;
    }
    process.env[name] = previousValue;
  };
}

function createRequest(): Request {
  return new Request("http://localhost/api/characters/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "霜语",
      prompt: "使用冰霜法术牵制敌人的年轻法师，外表冷静但出手果断。",
      realm: "cultivator",
    }),
  });
}

function captureLogs(): { logs: CapturedLog[]; restore: () => void } {
  const logs: CapturedLog[] = [];
  const capture = (...values: unknown[]) => {
    const message = values[0];
    if (typeof message !== "string") return;

    try {
      logs.push(JSON.parse(message) as CapturedLog);
    } catch {
      // Ignore non-JSON logs from unrelated runtime behavior.
    }
  };

  console.info = capture;
  console.error = capture;
  return {
    logs,
    restore: () => {
      console.info = originalConsoleInfo;
      console.error = originalConsoleError;
    },
  };
}

test("returns a request ID and logs a successful model attempt", async () => {
  const restoreApiKey = setEnvironment("OPENAI_API_KEY", "test-key");
  const restoreBaseUrl = setEnvironment("OPENAI_BASE_URL", "https://model.test/v1");
  const restoreModel = setEnvironment("OPENAI_MODEL", "test-model");
  const restoreTimeout = setEnvironment("MODEL_REQUEST_TIMEOUT_MS", "1000");
  const captured = captureLogs();
  let callCount = 0;
  globalThis.fetch = async () => {
    callCount += 1;
    if (callCount === 1) {
      return Response.json({
        choices: [{ message: { content: JSON.stringify({ profession: "mage", primarySkillType: "damage", secondarySkillType: "control" }) } }],
        usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
      });
    }
    return Response.json({
      choices: [{
        message: {
          content: JSON.stringify({
            attack: 18,
            maxHealth: 112,
            skills: [
              {
                name: "冰棱术",
                description: "向敌方前排发射冰棱。",
                usageText: "抬手施展",
                type: "damage",
                cooldown: 3,
                damageMultiplier: 1.4,
              },
              {
                name: "寒霜禁锢",
                description: "使敌方前排下一次行动必定跳过。",
                usageText: "凝结寒霜",
                type: "control",
                cooldown: 4,
                stunChance: 1,
              },
            ],
          }),
        },
      }],
      usage: { prompt_tokens: 100, completion_tokens: 70, total_tokens: 170 },
    });
  };

  try {
    const response = await POST(createRequest());
    const payload = await response.json() as { character?: { realm?: unknown }; requestId?: unknown };

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-request-id"), payload.requestId);
    assert.equal(typeof payload.requestId, "string");
    assert.equal(payload.character?.realm, "cultivator");
    const successLog = captured.logs.find((entry) => entry.event === "model_generation.succeeded");
    assert.ok(successLog);
    assert.equal(successLog.requestId, payload.requestId);
    assert.equal(successLog.model, "test-model");
    assert.equal(successLog.attempt, 1);
    assert.equal(successLog.status, "succeeded");
    assert.equal(successLog.upstreamStatus, 200);
    assert.equal(successLog.promptTokens, 120);
    assert.equal(successLog.completionTokens, 80);
    assert.equal(successLog.totalTokens, 200);
    assert.equal(typeof successLog.durationMs, "number");
  } finally {
    globalThis.fetch = originalFetch;
    captured.restore();
    restoreTimeout();
    restoreModel();
    restoreBaseUrl();
    restoreApiKey();
  }
});

test("aborts timed-out model calls and records each retry", async () => {
  const restoreApiKey = setEnvironment("OPENAI_API_KEY", "test-key");
  const restoreBaseUrl = setEnvironment("OPENAI_BASE_URL", "https://model.test/v1");
  const restoreTimeout = setEnvironment("MODEL_REQUEST_TIMEOUT_MS", "5");
  const captured = captureLogs();
  globalThis.fetch = (_input, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => {
      const error = new Error("The request was aborted.");
      error.name = "AbortError";
      reject(error);
    });
  });

  try {
    const response = await POST(createRequest());
    const payload = await response.json() as { requestId?: unknown };
    const timeoutLogs = captured.logs.filter(
      (entry) => entry.event === "model_generation.failed" && entry.errorCode === "model_timeout",
    );

    assert.equal(response.status, 504);
    assert.equal(response.headers.get("x-request-id"), payload.requestId);
    assert.equal(timeoutLogs.length, 2);
    assert.equal(timeoutLogs.every((entry) => entry.requestId === payload.requestId), true);
  } finally {
    globalThis.fetch = originalFetch;
    captured.restore();
    restoreTimeout();
    restoreBaseUrl();
    restoreApiKey();
  }
});

test("feeds schema failures into the retry prompt", async () => {
  const restoreApiKey = setEnvironment("OPENAI_API_KEY", "test-key");
  const restoreBaseUrl = setEnvironment("OPENAI_BASE_URL", "https://model.test/v1");
  const restoreModel = setEnvironment("OPENAI_MODEL", "test-model");
  const restoreTimeout = setEnvironment("MODEL_REQUEST_TIMEOUT_MS", "1000");
  const captured = captureLogs();
  const requestMessages: string[] = [];
  let callCount = 0;
  globalThis.fetch = async (_input, init) => {
    callCount += 1;
    const requestBody = JSON.parse(String(init?.body)) as {
      messages: Array<{ content: string }>;
    };
    requestMessages.push(requestBody.messages[1]!.content);

    if (callCount === 1 || callCount === 3) {
      return Response.json({
        choices: [{ message: { content: JSON.stringify({ profession: "mage", primarySkillType: "damage", secondarySkillType: "control" }) } }],
      });
    }

    if (callCount === 2) {
      return Response.json({
        choices: [{
          message: {
            content: JSON.stringify({
              attack: 18,
              maxHealth: 112,
              skills: [
                {
                  name: "冰棱术",
                  description: "向敌方前排发射冰棱。",
                  usageText: "抬手施展",
                  type: "damage",
                  cooldown: 3,
                  damageMultiplier: 1.4,
                },
                {
                  name: "第二冰棱",
                  description: "再向敌方前排发射冰棱。",
                  usageText: "凝神施展",
                  type: "damage",
                  cooldown: 2,
                  damageMultiplier: 1.2,
                },
              ],
            }),
          },
        }],
      });
    }

    return Response.json({
      choices: [{
        message: {
          content: JSON.stringify({
            attack: 18,
            maxHealth: 112,
            skills: [
              {
                name: "冰棱术",
                description: "向敌方前排发射冰棱。",
                usageText: "抬手施展",
                type: "damage",
                cooldown: 3,
                damageMultiplier: 1.4,
              },
              {
                name: "寒霜禁锢",
                description: "使敌方前排下一次行动必定跳过。",
                usageText: "凝结寒霜",
                type: "control",
                cooldown: 4,
                stunChance: 1,
              },
            ],
          }),
        },
      }],
    });
  };

  try {
    const response = await POST(createRequest());

    assert.equal(response.status, 200);
    assert.equal(callCount, 4);
    assert.match(requestMessages[3]!, /two skills must have different types/);
    assert.match(requestMessages[3]!, /第二冰棱/);
  } finally {
    globalThis.fetch = originalFetch;
    captured.restore();
    restoreTimeout();
    restoreModel();
    restoreBaseUrl();
    restoreApiKey();
  }
});
