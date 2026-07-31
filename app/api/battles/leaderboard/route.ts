import { getBattleLeaderboard } from "@/lib/battle/battleRecordRepository";
import type { BattleLeaderboardSort } from "@/types/battle";

function databaseErrorResponse(error: unknown): Response {
  if (error instanceof Error && error.message === "DATABASE_URL is not configured.") {
    return Response.json(
      { error: "排行榜尚未配置数据库连接。" },
      { status: 503 },
    );
  }

  return Response.json({ error: "排行榜暂时不可用，请稍后重试。" }, { status: 503 });
}

export async function GET(request: Request) {
  const sortParam = new URL(request.url).searchParams.get("sort");
  const sort: BattleLeaderboardSort = sortParam === "winRate" ? "winRate" : "wins";

  try {
    return Response.json({ entries: await getBattleLeaderboard(sort) });
  } catch (error) {
    return databaseErrorResponse(error);
  }
}
