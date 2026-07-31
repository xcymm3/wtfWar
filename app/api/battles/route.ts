import { simulateTeamBattle } from "@/lib/battle/teamBattleEngine";
import {
  createBattleRecord,
  getBattleStatistics,
} from "@/lib/battle/battleRecordRepository";
import { teamBattleRecordRequestSchema } from "@/lib/schemas/teamBattle";

function databaseErrorResponse(error: unknown): Response {
  if (error instanceof Error && error.message === "DATABASE_URL is not configured.") {
    return Response.json(
      { error: "战斗统计尚未配置数据库连接。" },
      { status: 503 },
    );
  }

  return Response.json({ error: "战斗统计暂时不可用，请稍后重试。" }, { status: 503 });
}

export async function GET() {
  try {
    return Response.json(await getBattleStatistics());
  } catch (error) {
    return databaseErrorResponse(error);
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "对局数据不是有效 JSON。" }, { status: 400 });
  }

  const parsedBattle = teamBattleRecordRequestSchema.safeParse(body);
  if (!parsedBattle.success) {
    return Response.json({ error: "对局数据不符合记录要求。" }, { status: 400 });
  }

  try {
    const result = simulateTeamBattle(parsedBattle.data);
    const winner = result.winner ?? "draw";
    await createBattleRecord({
      id: parsedBattle.data.id,
      seed: parsedBattle.data.seed,
      leftTeam: parsedBattle.data.leftTeam,
      rightTeam: parsedBattle.data.rightTeam,
      competitiveMode: parsedBattle.data.competitiveMode,
      winner,
    });
    return Response.json({ winner }, { status: 201 });
  } catch (error) {
    return databaseErrorResponse(error);
  }
}
