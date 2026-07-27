import {
  DuplicateCharacterNameError,
  createRemoteCharacter,
  getRemoteCharacters,
} from "@/lib/characters/characterRepository";
import { characterSchema } from "@/lib/schemas/character";

function databaseErrorResponse(error: unknown): Response {
  if (error instanceof DuplicateCharacterNameError) {
    return Response.json({ error: error.message }, { status: 409 });
  }

  if (error instanceof Error && error.message === "DATABASE_URL is not configured.") {
    return Response.json(
      { error: "远端角色库尚未配置数据库连接。" },
      { status: 503 },
    );
  }

  return Response.json({ error: "远端角色库暂时不可用，请稍后重试。" }, { status: 503 });
}

export async function GET() {
  try {
    return Response.json({ characters: await getRemoteCharacters() });
  } catch (error) {
    return databaseErrorResponse(error);
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "角色数据不是有效 JSON。" }, { status: 400 });
  }

  const parsedCharacter = characterSchema.safeParse(body);
  if (!parsedCharacter.success) {
    return Response.json({ error: "角色数据不符合保存要求。" }, { status: 400 });
  }

  try {
    return Response.json({
      character: await createRemoteCharacter(parsedCharacter.data),
    }, { status: 201 });
  } catch (error) {
    return databaseErrorResponse(error);
  }
}
