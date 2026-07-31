import { desc, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { battleRecords } from "@/db/schema";
import type {
  BattleLeaderboardEntry,
  BattleLeaderboardSort,
  BattleRecord,
  BattleRecordTeam,
  BattleRecordWinner,
  BattleStatistics,
  TeamFormation,
} from "@/types/battle";

const RECENT_RECORD_LIMIT = 100;
const LEADERBOARD_LIMIT = 10;

const fullTeamRecordCondition = sql`
  jsonb_array_length(${battleRecords.leftTeam} -> 'members') = 5
  AND jsonb_array_length(${battleRecords.rightTeam} -> 'members') = 5
`;

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
  if (input.leftTeam.members.length !== 5 || input.rightTeam.members.length !== 5) {
    throw new RangeError("Only complete five-person teams can be recorded.");
  }

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
    }).from(battleRecords).where(fullTeamRecordCondition),
    db.select()
      .from(battleRecords)
      .where(fullTeamRecordCondition)
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

type MutableLeaderboardEntry = Omit<BattleLeaderboardEntry, "winRate">;

function getFormationKey(team: BattleRecordTeam): string {
  return team.members.map((member) => member.id).join(":");
}

export async function getBattleLeaderboard(
  sort: BattleLeaderboardSort,
): Promise<BattleLeaderboardEntry[]> {
  const db = getDb();
  const records = await db.select({
    leftTeam: battleRecords.leftTeam,
    rightTeam: battleRecords.rightTeam,
    winner: battleRecords.winner,
  }).from(battleRecords).where(fullTeamRecordCondition);
  const entries = new Map<string, MutableLeaderboardEntry>();

  for (const record of records) {
    ([
      [record.leftTeam, "left"],
      [record.rightTeam, "right"],
    ] as const).forEach(([team, side]) => {
      const key = getFormationKey(team);
      const entry = entries.get(key) ?? { team, games: 0, wins: 0 };
      entry.games += 1;
      if (record.winner === side) entry.wins += 1;
      entries.set(key, entry);
    });
  }

  return [...entries.values()]
    .map((entry) => ({
      ...entry,
      winRate: entry.games > 0 ? entry.wins / entry.games : 0,
    }))
    .sort((first, second) => {
      const primary = sort === "wins"
        ? second.wins - first.wins
        : second.winRate - first.winRate;
      if (primary !== 0) return primary;
      if (second.wins !== first.wins) return second.wins - first.wins;
      if (second.games !== first.games) return second.games - first.games;
      return getFormationKey(first.team).localeCompare(getFormationKey(second.team));
    })
    .slice(0, LEADERBOARD_LIMIT);
}
