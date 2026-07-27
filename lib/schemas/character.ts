import { z } from "zod";

import { BATTLE_RULES } from "@/lib/battle/constants";
import { PROFESSION_STAT_RANGES } from "@/lib/characters/professionRules";
import {
  ACTIVE_SKILL_TYPES,
  PASSIVE_SKILL_TYPES,
  PROFESSIONS,
  REALMS,
  SKILL_TARGETS,
  SKILL_TYPES,
} from "@/types/character";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getLegacyTarget(type: unknown): "self" | "enemy_front" | "enemies_all" | "allies_all" {
  switch (type) {
    case "damage":
    case "control":
      return "enemy_front";
    case "area_damage":
      return "enemies_all";
    case "area_heal":
      return "allies_all";
    default:
      return "self";
  }
}

function normalizeLegacySkill(value: unknown): unknown {
  if (!isRecord(value)) return value;

  const type = value.type;
  const isPassive = type === "cleave_passive" || type === "charge_strike_passive";

  return {
    ...value,
    activation: value.activation ?? (isPassive ? "passive" : "active"),
    target: value.target ?? getLegacyTarget(type),
    cooldown: value.cooldown ?? (isPassive ? 0 : 1),
  };
}

function normalizeLegacyCharacter(value: unknown): unknown {
  if (!isRecord(value)) return value;

  return {
    ...value,
    realm: value.realm ?? "mortal",
    skills: Array.isArray(value.skills)
      ? value.skills.map(normalizeLegacySkill)
      : value.skills,
  };
}

const normalizedSkillSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(24),
  description: z.string().trim().min(1).max(120),
  usageText: z.string().trim().min(1).max(10).optional(),
  type: z.enum(SKILL_TYPES),
  activation: z.enum(["active", "passive"]),
  target: z.enum(SKILL_TARGETS),
  cooldown: z.number().int().min(0).max(BATTLE_RULES.maxCooldown),
  damageMultiplier: z.number().min(0.45).max(BATTLE_RULES.maxDamageMultiplier).optional(),
  shieldAmount: z.number().int().positive().max(45).optional(),
  healAmount: z.number().int().positive().max(45).optional(),
  stunChance: z.number().min(0).max(0.5).optional(),
  chargeTurns: z.number().int().min(2).max(5).optional(),
}).superRefine((skill, context) => {
  const isActiveType = (ACTIVE_SKILL_TYPES as readonly string[]).includes(skill.type);
  const isPassiveType = (PASSIVE_SKILL_TYPES as readonly string[]).includes(skill.type);

  if (skill.activation === "active" && !isActiveType) {
    context.addIssue({
      code: "custom",
      path: ["activation"],
      message: "Passive skill types must use passive activation.",
    });
  }
  if (skill.activation === "passive" && !isPassiveType) {
    context.addIssue({
      code: "custom",
      path: ["activation"],
      message: "Active skill types must use active activation.",
    });
  }

  if (skill.activation === "active") {
    if (skill.cooldown < BATTLE_RULES.minCooldown) {
      context.addIssue({
        code: "custom",
        path: ["cooldown"],
        message: "Active skills require a cooldown between 1 and 5.",
      });
    }
  } else if (skill.cooldown !== 0) {
    context.addIssue({
      code: "custom",
      path: ["cooldown"],
      message: "Passive skills use cooldown 0.",
    });
  }

  const expectedTarget = getLegacyTarget(skill.type);
  if (skill.target !== expectedTarget) {
    context.addIssue({
      code: "custom",
      path: ["target"],
      message: `${skill.type} must target ${expectedTarget}.`,
    });
  }

  if (skill.type === "damage") {
    if (skill.damageMultiplier === undefined || skill.damageMultiplier < BATTLE_RULES.minDamageMultiplier) {
      context.addIssue({
        code: "custom",
        path: ["damageMultiplier"],
        message: "damage skill requires damageMultiplier between 0.8 and 1.8.",
      });
    }
  }
  if (skill.type === "area_damage") {
    if (skill.damageMultiplier === undefined || skill.damageMultiplier > 0.9) {
      context.addIssue({
        code: "custom",
        path: ["damageMultiplier"],
        message: "area_damage requires damageMultiplier between 0.45 and 0.9.",
      });
    }
  }
  if (skill.type === "shield" && skill.shieldAmount === undefined) {
    context.addIssue({
      code: "custom",
      path: ["shieldAmount"],
      message: "shield skill requires shieldAmount.",
    });
  }
  if (skill.type === "heal") {
    if (skill.healAmount === undefined || skill.healAmount < 10) {
      context.addIssue({
        code: "custom",
        path: ["healAmount"],
        message: "heal skill requires healAmount between 10 and 45.",
      });
    }
  }
  if (skill.type === "area_heal") {
    if (skill.healAmount === undefined || skill.healAmount < 5 || skill.healAmount > 25) {
      context.addIssue({
        code: "custom",
        path: ["healAmount"],
        message: "area_heal requires healAmount between 5 and 25.",
      });
    }
  }
  if (skill.type === "control" && skill.stunChance === undefined) {
    context.addIssue({
      code: "custom",
      path: ["stunChance"],
      message: "control skill requires stunChance.",
    });
  }
  if (skill.type === "charge_strike_passive" && skill.chargeTurns === undefined) {
    context.addIssue({
      code: "custom",
      path: ["chargeTurns"],
      message: "charge_strike_passive requires chargeTurns between 2 and 5.",
    });
  }
});

export const skillSchema = z.preprocess(normalizeLegacySkill, normalizedSkillSchema);

const normalizedCharacterSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(24),
  originalPrompt: z.string().trim().min(1).max(500),
  profession: z.enum(PROFESSIONS),
  realm: z.enum(REALMS),
  attack: z.number().int().min(BATTLE_RULES.minAttack).max(BATTLE_RULES.maxAttack),
  maxHealth: z.number().int().min(BATTLE_RULES.minHealth).max(BATTLE_RULES.maxHealth),
  skills: z.tuple([skillSchema, skillSchema]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).superRefine((character, context) => {
  const ranges = PROFESSION_STAT_RANGES[character.profession];

  if (
    character.attack < ranges.attack.min ||
    character.attack > ranges.attack.max
  ) {
    context.addIssue({
      code: "custom",
      path: ["attack"],
      message: `${character.profession} attack must be within its profession range.`,
    });
  }

  if (
    character.maxHealth < ranges.maxHealth.min ||
    character.maxHealth > ranges.maxHealth.max
  ) {
    context.addIssue({
      code: "custom",
      path: ["maxHealth"],
      message: `${character.profession} maxHealth must be within its profession range.`,
    });
  }

  const activeSkills = character.skills.filter((skill) => skill.activation === "active");
  const passiveSkills = character.skills.filter((skill) => skill.activation === "passive");
  const hasOffensiveSource = character.skills.some(
    (skill) => ["damage", "area_damage", "cleave_passive", "charge_strike_passive"].includes(skill.type),
  );

  if (!hasOffensiveSource) {
    context.addIssue({
      code: "custom",
      path: ["skills"],
      message: "A character must have an offensive active or passive skill.",
    });
  }
  if (passiveSkills.length > 1 || activeSkills.length === 0) {
    context.addIssue({
      code: "custom",
      path: ["skills"],
      message: "A character must have one or two active skills and at most one passive skill.",
    });
  }
  if (character.skills.some((skill) => skill.type === "buff")) {
    context.addIssue({
      code: "custom",
      path: ["skills"],
      message: "Buff skills are not supported in the v2 character library.",
    });
  }

  const skillTypes = character.skills.map((skill) => skill.type);
  if (new Set(skillTypes).size !== skillTypes.length) {
    context.addIssue({
      code: "custom",
      path: ["skills"],
      message: "The two skills must have different types.",
    });
  }
  if (character.skills[0].name === character.skills[1].name) {
    context.addIssue({
      code: "custom",
      path: ["skills", 1, "name"],
      message: "The two skills must have different names.",
    });
  }
});

export const characterSchema = z.preprocess(
  normalizeLegacyCharacter,
  normalizedCharacterSchema,
);
