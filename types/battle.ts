import type { Character, Profession, Realm, Skill } from "./character";

export type BattleSide = "left" | "right";

export type BattleAction =
  | { type: "normal_attack" }
  | { type: "skill"; skillId: string };

/** A validated v1 match setup that the existing battle observer can simulate. */
export type BattlePreparation = {
  rulesVersion: 1;
  seed: string;
  leftCharacterId: string;
  rightCharacterId: string;
  leftCharacter: Character;
  rightCharacter: Character;
  preparedAt: string;
};

/** Ordered formation used by the v2 team battle engine. Position 1 is frontmost. */
export type TeamFormation = {
  side: BattleSide;
  members: Character[];
};

/** A validated v2 setup with immutable, front-to-back team snapshots. */
export type TeamBattlePreparation = {
  /** A client-generated ID makes recording a prepared battle idempotent. */
  id?: string;
  rulesVersion: 2;
  seed: string;
  leftTeam: TeamFormation;
  rightTeam: TeamFormation;
  preparedAt: string;
};

/** Compact formation snapshot persisted for global battle statistics. */
export type BattleRecordTeam = {
  side: BattleSide;
  members: Array<{
    id: string;
    name: string;
    profession: Profession;
    realm: Realm;
  }>;
};

export type BattleRecordWinner = BattleSide | "draw";

export type BattleRecord = {
  id: string;
  seed: string;
  leftTeam: BattleRecordTeam;
  rightTeam: BattleRecordTeam;
  winner: BattleRecordWinner;
  createdAt: string;
};

export type BattleStatistics = {
  totalBattles: number;
  records: BattleRecord[];
};

export type BattleLeaderboardSort = "wins" | "winRate";

export type BattleLeaderboardEntry = {
  team: BattleRecordTeam;
  games: number;
  wins: number;
  winRate: number;
};

export type TeamBattleCombatantSnapshot = {
  characterId: string;
  position: number;
  health: number;
  shield: number;
  cooldowns: Record<string, number>;
  isStunned: boolean;
  isInvincible: boolean;
  chargeProgress: number;
};

export type TeamBattleTargetResult = TeamBattleCombatantSnapshot & {
  side: BattleSide;
  rawDamage: number;
  damage: number;
  shieldAbsorbed: number;
  healing: number;
  shieldGranted: number;
  targetStunned: boolean;
  targetInvincible: boolean;
  targetRevived: boolean;
};

/** One resolved v2 action, including the entire live formation after it ends. */
export type TeamBattleEvent = {
  round: number;
  actor: TeamBattleCombatantSnapshot & { side: BattleSide };
  skill: Pick<Skill, "id" | "name" | "type"> | null;
  targets: TeamBattleTargetResult[];
  formations: Record<BattleSide, TeamBattleCombatantSnapshot[]>;
  actorHealing: number;
  narration: string;
};

export type BattleEvent = {
  round: number;
  actor: BattleSide;
  target: BattleSide;
  skill: Pick<Skill, "id" | "name" | "type"> | null;
  rawDamage: number;
  damage: number;
  shieldAbsorbed: number;
  healing: number;
  shieldGranted: number;
  targetStunned: boolean;
  actorHealth: number;
  targetHealth: number;
  actorShield: number;
  targetShield: number;
  actorCooldowns: Record<string, number>;
  targetCooldowns: Record<string, number>;
  actorIsStunned: boolean;
  targetIsStunned: boolean;
  narration: string;
};
