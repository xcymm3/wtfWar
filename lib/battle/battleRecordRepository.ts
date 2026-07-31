import { desc, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { battleRecords } from "@/db/schema";
import type {
  BattleRecord,
  BattleRecordTeam,
  BattleRecordWinner,
  BattleStatistics,
  TeamFormation,
} from "@/types/battle";

const RECENT_RECORD_LIMIT = 100;

function toBattleRecordTeam(team: TeamFormation): BattleRecordTeam {
  return {
    side: team.side,
    members: team.members.map((member) => ({
      id: member.id,
      name: member.name,
      profession: member.profession,
      realm: member.realm ?? "mortal",
    })),
  };
}

function toBattleRecord(row: typeof battleRecords.$inferSelect): BattleRecord {
  return {
    id: row.id,
    seed: row.seed,
    leftTeam: row.leftTeam,
    rightTeam: row.rightTeam,
    winner: row.winner,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function createBattleRecord(input: {
  id: string;
  seed: string;
  leftTeam: TeamFormation;
  rightTeam: TeamFormation;
  winner: BattleRecordWinner;
}): Promise<void> {
  const db = getDb();
  await db.insert(battleRecords)
    .values({
      id: input.id,
      seed: input.seed,
      leftTeam: toBattleRecordTeam(input.leftTeam),
      rightTeam: toBattleRecordTeam(input.rightTeam),
      winner: input.winner,
    })
    .onConflictDoNothing({ target: battleRecords.id });
}

export async function getBattleStatistics(): Promise<BattleStatistics> {
  const db = getDb();
  const [summaryRows, records] = await Promise.all([
    db.select({
      totalBattles: sql<number>`count(*)::int`,
      leftWins: sql<number>`count(*) filter (where ${battleRecords.winner} = 'left')::int`,
      rightWins: sql<number>`count(*) filter (where ${battleRecords.winner} = 'right')::int`,
      draws: sql<number>`count(*) filter (where ${battleRecords.winner} = 'draw')::int`,
    }).from(battleRecords),
    db.select()
      .from(battleRecords)
      .orderBy(desc(battleRecords.createdAt))
      .limit(RECENT_RECORD_LIMIT),
  ]);

  const summary = summaryRows[0];
  return {
    totalBattles: summary?.totalBattles ?? 0,
    leftWins: summary?.leftWins ?? 0,
    rightWins: summary?.rightWins ?? 0,
    draws: summary?.draws ?? 0,
    records: records.map(toBattleRecord),
  };
}
