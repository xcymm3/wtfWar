import {
  characterGenerationRequestSchema,
  finalizeGeneratedCharacter,
  generateLocalCharacter,
  generatedCharacterDraftSchema,
  getCharacterGenerationSystemPrompt,
} from "@/lib/characters/promptCharacterGeneration";

type ModelConfiguration = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

function extractJsonContent(content: string): string {
  const trimmedContent = content.trim();
  const fencedJson = trimmedContent.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fencedJson?.[1] ?? trimmedContent;
}

function getModelConfiguration(): ModelConfiguration | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  return {
    apiKey,
    baseUrl: (process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/+$/, ""),
    model: process.env.OPENAI_MODEL?.trim() || "gpt-4.1-mini",
  };
}

async function generateWithModel(
  name: string,
  prompt: string,
  configuration: ModelConfiguration,
) {
  let lastError: unknown;

  // Agnes does not support grammar-constrained JSON. A lower temperature and a
  // single retry let the prompt-based JSON path recover from occasional drafts
  // that do not satisfy the game schema.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(`${configuration.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${configuration.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: configuration.model,
          temperature: 0.2,
          max_tokens: 1000,
          messages: [
            { role: "system", content: getCharacterGenerationSystemPrompt() },
            {
              role: "user",
              content: `角色名称：${name}\n角色描述：${prompt}`,
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error("The configured character model returned an error.");
      }

      const payload = await response.json() as {
        choices?: Array<{ message?: { content?: string | null } }>;
      };
      const content = payload.choices?.[0]?.message?.content;
      if (!content) throw new Error("The configured character model returned no content.");

      const draft = generatedCharacterDraftSchema.parse(
        JSON.parse(extractJsonContent(content)),
      );
      return finalizeGeneratedCharacter({ ...draft, name }, prompt);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "请求内容不是有效 JSON。" }, { status: 400 });
  }

  const parsedRequest = characterGenerationRequestSchema.safeParse(body);
  if (!parsedRequest.success) {
    return Response.json(
      { error: "请填写角色名称，并用 8 至 500 个字符描述角色。" },
      { status: 400 },
    );
  }

  try {
    const configuration = getModelConfiguration();
    const character = configuration
      ? await generateWithModel(
        parsedRequest.data.name,
        parsedRequest.data.prompt,
        configuration,
      )
      : generateLocalCharacter(parsedRequest.data);

    return Response.json({
      character,
      source: configuration ? "model" : "local",
    });
  } catch {
    return Response.json(
      { error: "角色生成服务暂时无法给出合规角色，请稍后重试或改用手动创角。" },
      { status: 502 },
    );
  }
}
