import { simulateBattle } from "@/lib/battle/battleEngine";
import type { BattleRuntimeState } from "@/lib/battle/state";
import {
  PROFESSIONS,
  PROFESSION_LABELS,
  type Character,
  type Profession,
  type Skill,
} from "@/types/character";

export const DEFAULT_MATCHES_PER_PAIR = 200;

export type BalanceGuardrails = {
  minMatchesPerPair: number;
  minProfessionWinRate: number;
  maxProfessionWinRate: number;
  maxProfessionDrawRate: number;
  minMatchupWinRate: number;
  maxMatchupWinRate: number;
  maxMirrorSeatBias: number;
  minAverageRounds: number;
  maxAverageRounds: number;
};

/** Release gates for the fixed five-profession baseline simulation. */
export const BALANCE_GUARDRAILS = {
  minMatchesPerPair: 400,
  minProfessionWinRate: 0.38,
  maxProfessionWinRate: 0.62,
  maxProfessionDrawRate: 0.1,
  minMatchupWinRate: 0.25,
  maxMatchupWinRate: 0.75,
  maxMirrorSeatBias: 0.08,
  minAverageRounds: 6,
  maxAverageRounds: 30,
} as const satisfies BalanceGuardrails;

type ProfessionProfile = {
  profession: Profession;
  character: Character;
};

export type ProfessionBalanceStats = {
  profession: Profession;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  totalRounds: number;
};

export type SkillBalanceStats = {
  profession: Profession;
  skillId: string;
  skillName: string;
  skillType: Skill["type"];
  uses: number;
  rawDamage: number;
  healthDamage: number;
  healing: number;
  shieldGranted: number;
  stunAttempts: number;
  stunHits: number;
};

export type MatchupBalanceStats = {
  leftProfession: Profession;
  rightProfession: Profession;
  games: number;
  leftWins: number;
  rightWins: number;
  draws: number;
  totalRounds: number;
};

export type BalanceSimulationResult = {
  matchesPerPair: number;
  totalMatches: number;
  professionStats: ProfessionBalanceStats[];
  skillStats: SkillBalanceStats[];
  matchupStats: MatchupBalanceStats[];
};

export type BalanceViolation = {
  metric: string;
  subject: string;
  actual: number;
  minimum?: number;
  maximum?: number;
};

const TIMESTAMP = "2026-07-23T00:00:00.000Z";

function createSkill(
  id: string,
  name: string,
  type: Skill["type"],
  overrides: Partial<Skill> = {},
): Skill {
  return {
    id,
    name,
    description: name,
    type,
    cooldown: 2,
    ...overrides,
  };
}

function createProfileCharacter(
  profession: Profession,
  attack: number,
  maxHealth: number,
  skills: [Skill, Skill],
): Character {
  const name = `${PROFESSION_LABELS[profession]}基准角色`;

  return {
    id: `balance-${profession}`,
    name,
    originalPrompt: `${name} 用于职业平衡模拟。`,
    profession,
    realm: "mortal",
    attack,
    maxHealth,
    skills,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  };
}

/**
 * One legal, mid-range archetype for each profession. These are a repeatable
 * balance baseline, not the only legal character configurations in the game.
 */
export const PROFESSION_BALANCE_PROFILES: readonly ProfessionProfile[] = [
  {
    profession: "tank",
    character: createProfileCharacter("tank", 10, 165, [
      createSkill("tank-ram", "坚壁冲撞", "damage", {
        damageMultiplier: 1.1,
        cooldown: 2,
      }),
      createSkill("tank-wall", "钢铁壁垒", "shield", {
        shieldAmount: 35,
        cooldown: 3,
      }),
    ]),
  },
  {
    profession: "warrior",
    character: createProfileCharacter("warrior", 18, 140, [
      createSkill("warrior-slash", "裂阵斩", "damage", {
        damageMultiplier: 1.35,
        cooldown: 2,
      }),
      createSkill("warrior-roar", "震慑怒吼", "control", {
        stunChance: 1,
        cooldown: 3,
      }),
    ]),
  },
  {
    profession: "mage",
    character: createProfileCharacter("mage", 18, 110, [
      createSkill("mage-burst", "奥术爆裂", "damage", {
        damageMultiplier: 1.55,
        cooldown: 3,
      }),
      createSkill("mage-frost", "冰霜禁锢", "control", {
        stunChance: 1,
        cooldown: 4,
      }),
    ]),
  },
  {
    profession: "assassin",
    character: createProfileCharacter("assassin", 20, 125, [
      createSkill("assassin-strike", "致命突刺", "damage", {
        damageMultiplier: 1.8,
        cooldown: 3,
      }),
      createSkill("assassin-smoke", "烟幕突袭", "control", {
        stunChance: 1,
        cooldown: 3,
      }),
    ]),
  },
  {
    profession: "ranger",
    character: createProfileCharacter("ranger", 25, 100, [
      createSkill("ranger-arrow", "穿云箭", "damage", {
        damageMultiplier: 1.35,
        cooldown: 2,
      }),
      createSkill("ranger-mend", "战地包扎", "heal", {
        healAmount: 30,
        cooldown: 3,
      }),
    ]),
  },
];

function createProfessionStats(profession: Profession): ProfessionBalanceStats {
  return {
    profession,
    games: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    totalRounds: 0,
  };
}

function createSkillStats(
  profession: Profession,
  skill: Skill,
): SkillBalanceStats {
  return {
    profession,
    skillId: skill.id,
    skillName: skill.name,
    skillType: skill.type,
    uses: 0,
    rawDamage: 0,
    healthDamage: 0,
    healing: 0,
    shieldGranted: 0,
    stunAttempts: 0,
    stunHits: 0,
  };
}

function createMatchupStats(
  leftProfession: Profession,
  rightProfession: Profession,
): MatchupBalanceStats {
  return {
    leftProfession,
    rightProfession,
    games: 0,
    leftWins: 0,
    rightWins: 0,
    draws: 0,
    totalRounds: 0,
  };
}

function getSkillKey(profession: Profession, skillId: string): string {
  return `${profession}:${skillId}`;
}

function getMatchupKey(left: Profession, right: Profession): string {
  return `${left}:${right}`;
}

function recordBattleEvents(
  result: BattleRuntimeState,
  leftProfile: ProfessionProfile,
  rightProfile: ProfessionProfile,
  skillStats: Map<string, SkillBalanceStats>,
): void {
  for (const event of result.events) {
    if (!event.skill) continue;

    const profession =
      event.actor === "left"
        ? leftProfile.profession
        : rightProfile.profession;
    const stats = skillStats.get(getSkillKey(profession, event.skill.id));

    if (!stats) {
      throw new Error(`Missing statistics entry for skill ${event.skill.id}.`);
    }

    stats.uses += 1;
    stats.rawDamage += event.rawDamage;
    stats.healthDamage += event.damage;
    stats.healing += event.healing;
    stats.shieldGranted += event.shieldGranted;

    if (event.skill.type === "control") {
      stats.stunAttempts += 1;
      if (event.targetStunned) stats.stunHits += 1;
    }
  }
}

function assertMatchesPerPair(matchesPerPair: number): void {
  if (!Number.isInteger(matchesPerPair) || matchesPerPair <= 0) {
    throw new RangeError("Matches per profession pair must be a positive integer.");
  }
}

/**
 * Simulates every ordered profession pairing with deterministic seed values.
 * Ordered pairings remove left/right-seat bias from the profession summaries.
 */
export function simulateProfessionBalance(
  matchesPerPair = DEFAULT_MATCHES_PER_PAIR,
): BalanceSimulationResult {
  assertMatchesPerPair(matchesPerPair);

  const professionStats = new Map<Profession, ProfessionBalanceStats>(
    PROFESSIONS.map((profession) => [
      profession,
      createProfessionStats(profession),
    ]),
  );
  const skillStats = new Map<string, SkillBalanceStats>();
  const matchupStats = new Map<string, MatchupBalanceStats>();

  for (const profile of PROFESSION_BALANCE_PROFILES) {
    for (const skill of profile.character.skills) {
      skillStats.set(
        getSkillKey(profile.profession, skill.id),
        createSkillStats(profile.profession, skill),
      );
    }
  }

  for (const leftProfile of PROFESSION_BALANCE_PROFILES) {
    for (const rightProfile of PROFESSION_BALANCE_PROFILES) {
      const matchup = createMatchupStats(
        leftProfile.profession,
        rightProfile.profession,
      );
      matchupStats.set(
        getMatchupKey(leftProfile.profession, rightProfile.profession),
        matchup,
      );

      for (let index = 1; index <= matchesPerPair; index += 1) {
        const result = simulateBattle({
          seed: `balance-v1:${leftProfile.profession}:${rightProfile.profession}:${index}`,
          leftCharacter: leftProfile.character,
          rightCharacter: rightProfile.character,
        });
        const leftStats = professionStats.get(leftProfile.profession);
        const rightStats = professionStats.get(rightProfile.profession);

        if (!leftStats || !rightStats) {
          throw new Error("Missing profession statistics entry.");
        }

        matchup.games += 1;
        matchup.totalRounds += result.round;
        leftStats.games += 1;
        leftStats.totalRounds += result.round;
        rightStats.games += 1;
        rightStats.totalRounds += result.round;

        if (result.winner === "left") {
          matchup.leftWins += 1;
          leftStats.wins += 1;
          rightStats.losses += 1;
        } else if (result.winner === "right") {
          matchup.rightWins += 1;
          rightStats.wins += 1;
          leftStats.losses += 1;
        } else {
          matchup.draws += 1;
          leftStats.draws += 1;
          rightStats.draws += 1;
        }

        recordBattleEvents(result, leftProfile, rightProfile, skillStats);
      }
    }
  }

  return {
    matchesPerPair,
    totalMatches: PROFESSION_BALANCE_PROFILES.length ** 2 * matchesPerPair,
    professionStats: PROFESSIONS.map((profession) => {
      const stats = professionStats.get(profession);
      if (!stats) throw new Error(`Missing statistics for ${profession}.`);
      return stats;
    }),
    skillStats: [...skillStats.values()],
    matchupStats: [...matchupStats.values()],
  };
}

function getRate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function getMatchupStats(
  result: BalanceSimulationResult,
  leftProfession: Profession,
  rightProfession: Profession,
): MatchupBalanceStats {
  const matchup = result.matchupStats.find(
    (stats) =>
      stats.leftProfession === leftProfession &&
      stats.rightProfession === rightProfession,
  );
  if (!matchup) {
    throw new Error(`Missing matchup statistics for ${leftProfession} and ${rightProfession}.`);
  }
  return matchup;
}

/**
 * Evaluates the deterministic baseline against release thresholds. The checks
 * deliberately use both seating directions, so a profession is not rewarded
 * simply for acting first.
 */
export function evaluateProfessionBalance(
  result: BalanceSimulationResult,
  guardrails: BalanceGuardrails = BALANCE_GUARDRAILS,
): BalanceViolation[] {
  const violations: BalanceViolation[] = [];

  if (result.matchesPerPair < guardrails.minMatchesPerPair) {
    violations.push({
      metric: "sample_size",
      subject: "每个有序职业对局",
      actual: result.matchesPerPair,
      minimum: guardrails.minMatchesPerPair,
    });
  }

  for (const stats of result.professionStats) {
    const winRate = getRate(stats.wins, stats.games);
    const drawRate = getRate(stats.draws, stats.games);
    const averageRounds = getRate(stats.totalRounds, stats.games);

    if (winRate < guardrails.minProfessionWinRate || winRate > guardrails.maxProfessionWinRate) {
      violations.push({
        metric: "profession_win_rate",
        subject: PROFESSIONS.includes(stats.profession) ? PROFESSION_LABELS[stats.profession] : stats.profession,
        actual: winRate,
        minimum: guardrails.minProfessionWinRate,
        maximum: guardrails.maxProfessionWinRate,
      });
    }
    if (drawRate > guardrails.maxProfessionDrawRate) {
      violations.push({
        metric: "profession_draw_rate",
        subject: PROFESSION_LABELS[stats.profession],
        actual: drawRate,
        maximum: guardrails.maxProfessionDrawRate,
      });
    }
    if (averageRounds < guardrails.minAverageRounds || averageRounds > guardrails.maxAverageRounds) {
      violations.push({
        metric: "average_rounds",
        subject: PROFESSION_LABELS[stats.profession],
        actual: averageRounds,
        minimum: guardrails.minAverageRounds,
        maximum: guardrails.maxAverageRounds,
      });
    }
  }

  for (let leftIndex = 0; leftIndex < PROFESSIONS.length; leftIndex += 1) {
    const leftProfession = PROFESSIONS[leftIndex]!;
    const mirror = getMatchupStats(result, leftProfession, leftProfession);
    const mirrorDecisiveGames = mirror.leftWins + mirror.rightWins;
    if (mirrorDecisiveGames > 0) {
      const seatBias = Math.abs(mirror.leftWins - mirror.rightWins) / mirrorDecisiveGames;
      if (seatBias > guardrails.maxMirrorSeatBias) {
        violations.push({
          metric: "mirror_seat_bias",
          subject: PROFESSION_LABELS[leftProfession],
          actual: seatBias,
          maximum: guardrails.maxMirrorSeatBias,
        });
      }
    }

    for (let rightIndex = leftIndex + 1; rightIndex < PROFESSIONS.length; rightIndex += 1) {
      const rightProfession = PROFESSIONS[rightIndex]!;
      const forward = getMatchupStats(result, leftProfession, rightProfession);
      const reverse = getMatchupStats(result, rightProfession, leftProfession);
      const leftWins = forward.leftWins + reverse.rightWins;
      const rightWins = forward.rightWins + reverse.leftWins;
      const decisiveGames = leftWins + rightWins;
      const leftWinRate = getRate(leftWins, decisiveGames);

      if (
        decisiveGames === 0 ||
        leftWinRate < guardrails.minMatchupWinRate ||
        leftWinRate > guardrails.maxMatchupWinRate
      ) {
        violations.push({
          metric: "pair_matchup_win_rate",
          subject: `${PROFESSION_LABELS[leftProfession]} vs ${PROFESSION_LABELS[rightProfession]}`,
          actual: leftWinRate,
          minimum: guardrails.minMatchupWinRate,
          maximum: guardrails.maxMatchupWinRate,
        });
      }
    }
  }

  for (const stats of result.skillStats) {
    if (stats.uses === 0) {
      violations.push({
        metric: "skill_usage",
        subject: `${PROFESSION_LABELS[stats.profession]} · ${stats.skillName}`,
        actual: 0,
        minimum: 1,
      });
    }
  }

  return violations;
}

export function formatBalanceViolations(violations: BalanceViolation[]): string {
  return violations.map((violation) => {
    const bounds = [
      violation.minimum === undefined ? null : `最低 ${formatPercentage(violation.minimum)}`,
      violation.maximum === undefined ? null : `最高 ${formatPercentage(violation.maximum)}`,
    ].filter((value): value is string => value !== null).join("，");
    const actual = violation.metric === "average_rounds" || violation.metric === "sample_size"
      ? formatAverage(violation.actual)
      : formatPercentage(violation.actual);
    return `- ${violation.metric}：${violation.subject} 为 ${actual}${bounds ? `（${bounds}）` : ""}`;
  }).join("\n");
}

export function assertProfessionBalance(
  result: BalanceSimulationResult,
  guardrails: BalanceGuardrails = BALANCE_GUARDRAILS,
): void {
  const violations = evaluateProfessionBalance(result, guardrails);
  if (violations.length === 0) return;

  throw new Error(
    `职业平衡检查未通过：\n${formatBalanceViolations(violations)}\n\n${formatProfessionBalanceReport(result)}`,
  );
}

function formatPercentage(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatAverage(value: number): string {
  return value.toFixed(1);
}

function formatSkillEffect(stats: SkillBalanceStats): string {
  if (stats.uses === 0) return "未使用";

  switch (stats.skillType) {
    case "damage":
    case "area_damage":
      return `平均生命伤害 ${formatAverage(stats.healthDamage / stats.uses)}`;
    case "shield":
      return `平均获盾 ${formatAverage(stats.shieldGranted / stats.uses)}`;
    case "heal":
    case "area_heal":
      return `平均治疗 ${formatAverage(stats.healing / stats.uses)}`;
    case "control":
      return `眩晕命中 ${formatPercentage(stats.stunHits / stats.stunAttempts)}`;
    case "buff":
      return "Beta 阶段不参与战斗";
    case "cleave_passive":
      return "被动效果已计入普通攻击";
    case "charge_strike_passive":
      return "被动效果已计入蓄力攻击";
    default:
      return "特殊效果";
  }
}

/** Formats a compact, Markdown-friendly report for terminal output or review. */
export function formatProfessionBalanceReport(
  result: BalanceSimulationResult,
): string {
  const totalProfileGames = result.professionStats.reduce(
    (total, stats) => total + stats.games,
    0,
  );
  const lines = [
    "# 次元竞技场职业平衡基线",
    "",
    `每个有序职业对局模拟 ${result.matchesPerPair} 场，共 ${result.totalMatches} 场；职业统计共计 ${totalProfileGames} 个参赛席位。`,
    "",
    "## 职业汇总",
    "",
    "| 职业 | 场次 | 胜 | 负 | 平 | 胜率 | 平均回合 |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];

  for (const stats of result.professionStats) {
    lines.push(
      `| ${PROFESSION_LABELS[stats.profession]} | ${stats.games} | ${stats.wins} | ${stats.losses} | ${stats.draws} | ${formatPercentage(stats.wins / stats.games)} | ${formatAverage(stats.totalRounds / stats.games)} |`,
    );
  }

  lines.push("", "## 对局胜率（行方胜率）", "");
  lines.push(
    `| 行方 \\ 列方 | ${PROFESSIONS.map((profession) => PROFESSION_LABELS[profession]).join(" | ")} |`,
  );
  lines.push(`| --- | ${PROFESSIONS.map(() => "---:").join(" | ")} |`);

  for (const leftProfession of PROFESSIONS) {
    const cells = PROFESSIONS.map((rightProfession) => {
      const matchup = result.matchupStats.find(
        (stats) =>
          stats.leftProfession === leftProfession &&
          stats.rightProfession === rightProfession,
      );
      if (!matchup) throw new Error("Missing matchup statistics entry.");
      return formatPercentage(matchup.leftWins / matchup.games);
    });
    lines.push(`| ${PROFESSION_LABELS[leftProfession]} | ${cells.join(" | ")} |`);
  }

  lines.push("", "## 技能表现", "");
  lines.push("| 职业 | 技能 | 使用次数 | 效果 |", "| --- | --- | ---: | --- |");

  for (const stats of result.skillStats) {
    lines.push(
      `| ${PROFESSION_LABELS[stats.profession]} | ${stats.skillName} | ${stats.uses} | ${formatSkillEffect(stats)} |`,
    );
  }

  return lines.join("\n");
}
