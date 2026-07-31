import { simulateTeamBattle } from "@/lib/battle/teamBattleEngine";
import { getRangeMidpoint, PROFESSION_STAT_RANGES } from "@/lib/characters/professionRules";
import type { TeamBattlePreparation, TeamFormation } from "@/types/battle";
import type { Character, Profession, Skill, SkillType } from "@/types/character";
import { PROFESSIONS, SKILL_TYPES } from "@/types/character";

const TIMESTAMP = "2026-07-31T00:00:00.000Z";
const TEAM_SIZE = 5;
type BalanceSkillType = Exclude<SkillType, "buff">;

const BALANCE_SKILL_TYPES: readonly BalanceSkillType[] = SKILL_TYPES.filter(
  (type): type is BalanceSkillType => type !== "buff",
);

export const TEAM_BALANCE_GUARDRAILS = {
  matchesPerScenario: 80,
  minProfessionMatchupWinRate: 0.2,
  maxProfessionMatchupWinRate: 0.8,
  minSkillScenarioWinRate: 0.3,
  maxSkillScenarioWinRate: 0.7,
} as const;

export type TeamBalanceViolation = {
  metric: "profession_dominance" | "skill_scenario_win_rate";
  subject: string;
  actual: number;
  minimum: number;
  maximum: number;
};

export type TeamBalanceResult = {
  matchesPerScenario: number;
  professionMatchups: Array<{
    leftProfession: Profession;
    rightProfession: Profession;
    leftWins: number;
    rightWins: number;
    draws: number;
  }>;
  skillScenarios: Array<{
    skillType: BalanceSkillType;
    games: number;
    candidateWins: number;
    baselineWins: number;
    draws: number;
  }>;
};

function createSkill(
  id: string,
  type: BalanceSkillType,
): Skill {
  const base = {
    id,
    name: type,
    description: type,
    usageText: "平衡测试",
    type,
    cooldown: 3,
  } as const;

  switch (type) {
    case "damage":
      return { ...base, cooldown: 2, damageMultiplier: 1.3 };
    case "critical":
      return { ...base, cooldown: 4, damageMultiplier: 2 };
    case "area_damage":
      return { ...base, cooldown: 3, damageMultiplier: 0.65 };
    case "shield":
      return { ...base, shieldAmount: 28 };
    case "heal":
      return { ...base, healAmount: 28 };
    case "area_heal":
      return { ...base, cooldown: 4, healAmount: 16 };
    case "control":
      return { ...base, stunChance: 1 };
    case "area_control":
      return { ...base, cooldown: 5, stunChance: 1 };
    case "invincible":
      return { ...base, cooldown: 4 };
    case "cleave_passive":
      return { ...base, cooldown: 0, activation: "passive", target: "self" };
    case "charge_strike_passive":
      return { ...base, cooldown: 0, activation: "passive", target: "self", chargeTurns: 3 };
    case "lifesteal_passive":
      return { ...base, cooldown: 0, activation: "passive", target: "self", damageMultiplier: 0.35 };
    case "growth_passive":
      return { ...base, cooldown: 0, activation: "passive", target: "self", damageMultiplier: 0.15 };
    case "revive_passive":
    case "assassin_passive":
      return { ...base, cooldown: 0, activation: "passive", target: "self" };
  }
}

function getSupportSkill(type: BalanceSkillType): BalanceSkillType {
  return type === "damage" ? "control" : "damage";
}

function createCharacter(
  id: string,
  profession: Profession,
  primarySkillType: BalanceSkillType = "damage",
): Character {
  const ranges = PROFESSION_STAT_RANGES[profession];
  return {
    id,
    name: id,
    originalPrompt: "用于五人团队平衡测试。",
    profession,
    realm: "mortal",
    attack: getRangeMidpoint(ranges.attack),
    maxHealth: getRangeMidpoint(ranges.maxHealth),
    skills: [
      createSkill(`${id}-${primarySkillType}`, primarySkillType),
      createSkill(`${id}-${getSupportSkill(primarySkillType)}`, getSupportSkill(primarySkillType)),
    ],
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  };
}

function createMixedTeam(
  side: "left" | "right",
  prefix: string,
  replacement?: { position: number; skillType: BalanceSkillType },
): TeamFormation {
  return {
    side,
    members: PROFESSIONS.map((profession, position) => createCharacter(
      `${prefix}-${profession}-${position + 1}`,
      profession,
      replacement?.position === position ? replacement.skillType : "damage",
    )),
  };
}

function createProfessionComparisonTeam(
  side: "left" | "right",
  prefix: string,
  position: number,
  profession: Profession,
): TeamFormation {
  return {
    side,
    members: PROFESSIONS.map((defaultProfession, memberPosition) => createCharacter(
      `${prefix}-${memberPosition + 1}`,
      memberPosition === position ? profession : defaultProfession,
      "damage",
    )),
  };
}

function simulate(
  seed: string,
  leftTeam: TeamFormation,
  rightTeam: TeamFormation,
) {
  const preparation: TeamBattlePreparation = {
    rulesVersion: 2,
    competitiveMode: true,
    seed,
    leftTeam,
    rightTeam,
    preparedAt: TIMESTAMP,
  };
  return simulateTeamBattle(preparation).winner ?? "draw";
}

function assertMatchesPerScenario(matchesPerScenario: number): void {
  if (!Number.isInteger(matchesPerScenario) || matchesPerScenario <= 0) {
    throw new RangeError("Matches per team scenario must be a positive integer.");
  }
}

/**
 * Uses 5v5 fixtures only. Profession fixtures replace one member of an
 * otherwise mirrored mixed formation, while skill fixtures replace one skill.
 */
export function simulateTeamBalance(
  matchesPerScenario = TEAM_BALANCE_GUARDRAILS.matchesPerScenario,
): TeamBalanceResult {
  assertMatchesPerScenario(matchesPerScenario);
  const professionMatchups: TeamBalanceResult["professionMatchups"] = [];
  const skillScenarios: TeamBalanceResult["skillScenarios"] = [];

  for (let leftIndex = 0; leftIndex < PROFESSIONS.length; leftIndex += 1) {
    const leftProfession = PROFESSIONS[leftIndex]!;
    for (let rightIndex = leftIndex + 1; rightIndex < PROFESSIONS.length; rightIndex += 1) {
      const rightProfession = PROFESSIONS[rightIndex]!;
      const stats = { leftProfession, rightProfession, leftWins: 0, rightWins: 0, draws: 0 };
      for (let position = 0; position < TEAM_SIZE; position += 1) {
        for (let index = 1; index <= matchesPerScenario; index += 1) {
          const firstWinner = simulate(
            `team-profession:${leftProfession}:${rightProfession}:${position}:${index}:forward`,
            createProfessionComparisonTeam("left", "left-candidate", position, leftProfession),
            createProfessionComparisonTeam("right", "right-baseline", position, rightProfession),
          );
          const secondWinner = simulate(
            `team-profession:${leftProfession}:${rightProfession}:${position}:${index}:reverse`,
            createProfessionComparisonTeam("left", "left-baseline", position, rightProfession),
            createProfessionComparisonTeam("right", "right-candidate", position, leftProfession),
          );
          if (firstWinner === "left") stats.leftWins += 1;
          else if (firstWinner === "right") stats.rightWins += 1;
          else stats.draws += 1;
          if (secondWinner === "right") stats.leftWins += 1;
          else if (secondWinner === "left") stats.rightWins += 1;
          else stats.draws += 1;
        }
      }
      professionMatchups.push(stats);
    }
  }

  for (const skillType of BALANCE_SKILL_TYPES) {
    const stats = { skillType, games: 0, candidateWins: 0, baselineWins: 0, draws: 0 };
    for (let position = 0; position < TEAM_SIZE; position += 1) {
      for (let index = 1; index <= matchesPerScenario; index += 1) {
        const candidate = { position, skillType };
        const firstWinner = simulate(
          `team-skill:${skillType}:${position}:${index}:forward`,
          createMixedTeam("left", "candidate", candidate),
          createMixedTeam("right", "baseline"),
        );
        const secondWinner = simulate(
          `team-skill:${skillType}:${position}:${index}:reverse`,
          createMixedTeam("left", "baseline"),
          createMixedTeam("right", "candidate", candidate),
        );
        stats.games += 2;
        if (firstWinner === "left") stats.candidateWins += 1;
        else if (firstWinner === "right") stats.baselineWins += 1;
        else stats.draws += 1;
        if (secondWinner === "right") stats.candidateWins += 1;
        else if (secondWinner === "left") stats.baselineWins += 1;
        else stats.draws += 1;
      }
    }
    skillScenarios.push(stats);
  }

  return { matchesPerScenario, professionMatchups, skillScenarios };
}

function getWinRate(wins: number, games: number): number {
  return games === 0 ? 0 : wins / games;
}

export function evaluateTeamBalance(
  result: TeamBalanceResult,
  guardrails = TEAM_BALANCE_GUARDRAILS,
): TeamBalanceViolation[] {
  const violations: TeamBalanceViolation[] = [];
  for (const matchup of result.professionMatchups) {
    const decisiveGames = matchup.leftWins + matchup.rightWins;
    const winRate = getWinRate(matchup.leftWins, decisiveGames);
    if (winRate < guardrails.minProfessionMatchupWinRate || winRate > guardrails.maxProfessionMatchupWinRate) {
      violations.push({
        metric: "profession_dominance",
        subject: `${matchup.leftProfession} vs ${matchup.rightProfession}`,
        actual: winRate,
        minimum: guardrails.minProfessionMatchupWinRate,
        maximum: guardrails.maxProfessionMatchupWinRate,
      });
    }
  }
  for (const scenario of result.skillScenarios) {
    const decisiveGames = scenario.candidateWins + scenario.baselineWins;
    const winRate = getWinRate(scenario.candidateWins, decisiveGames);
    if (winRate < guardrails.minSkillScenarioWinRate || winRate > guardrails.maxSkillScenarioWinRate) {
      violations.push({
        metric: "skill_scenario_win_rate",
        subject: scenario.skillType,
        actual: winRate,
        minimum: guardrails.minSkillScenarioWinRate,
        maximum: guardrails.maxSkillScenarioWinRate,
      });
    }
  }
  return violations;
}

export function assertTeamBalance(result: TeamBalanceResult): void {
  const violations = evaluateTeamBalance(result);
  if (violations.length === 0) return;
  throw new Error(violations.map((violation) =>
    `${violation.metric}: ${violation.subject} ${Math.round(violation.actual * 100)}% (目标 ${Math.round(violation.minimum * 100)}%-${Math.round(violation.maximum * 100)}%)`,
  ).join("\n"));
}
