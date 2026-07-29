import { nanoid } from "nanoid";
import { z } from "zod";

import { characterSchema } from "@/lib/schemas/character";
import {
  PROFESSIONS,
  REALMS,
  type Character,
  type Profession,
  type Skill,
} from "@/types/character";

export const OFFENSIVE_SKILL_TYPES = [
  "damage",
  "critical",
  "area_damage",
  "cleave_passive",
  "charge_strike_passive",
  "assassin_passive",
] as const;

export type OffensiveSkillType = (typeof OFFENSIVE_SKILL_TYPES)[number];

const generatedSkillDraftSchema = z.discriminatedUnion("type", [
  z.object({
    name: z.string().trim().min(1).max(24),
    description: z.string().trim().min(1).max(120),
    usageText: z.string().trim().min(1).max(10),
    type: z.literal("damage"),
    cooldown: z.number().int().min(1).max(5),
    damageMultiplier: z.number().min(0.8).max(1.8),
  }).strict(),
  z.object({
    name: z.string().trim().min(1).max(24),
    description: z.string().trim().min(1).max(120),
    usageText: z.string().trim().min(1).max(10),
    type: z.literal("critical"),
    cooldown: z.number().int().min(1).max(5),
    damageMultiplier: z.literal(2),
  }).strict(),
  z.object({
    name: z.string().trim().min(1).max(24),
    description: z.string().trim().min(1).max(120),
    usageText: z.string().trim().min(1).max(10),
    type: z.literal("area_damage"),
    cooldown: z.number().int().min(1).max(5),
    damageMultiplier: z.number().min(0.45).max(0.9),
  }).strict(),
  z.object({
    name: z.string().trim().min(1).max(24),
    description: z.string().trim().min(1).max(120),
    usageText: z.string().trim().min(1).max(10),
    type: z.literal("shield"),
    cooldown: z.number().int().min(1).max(5),
    shieldAmount: z.number().int().min(10).max(45),
  }).strict(),
  z.object({
    name: z.string().trim().min(1).max(24),
    description: z.string().trim().min(1).max(120),
    usageText: z.string().trim().min(1).max(10),
    type: z.literal("heal"),
    cooldown: z.number().int().min(1).max(5),
    healAmount: z.number().int().min(10).max(45),
  }).strict(),
  z.object({
    name: z.string().trim().min(1).max(24),
    description: z.string().trim().min(1).max(120),
    usageText: z.string().trim().min(1).max(10),
    type: z.literal("area_heal"),
    cooldown: z.number().int().min(1).max(5),
    healAmount: z.number().int().min(5).max(25),
  }).strict(),
  z.object({
    name: z.string().trim().min(1).max(24),
    description: z.string().trim().min(1).max(120),
    usageText: z.string().trim().min(1).max(10),
    type: z.literal("control"),
    cooldown: z.number().int().min(1).max(5),
    stunChance: z.literal(1),
  }).strict(),
  z.object({
    name: z.string().trim().min(1).max(24),
    description: z.string().trim().min(1).max(120),
    usageText: z.string().trim().min(1).max(10),
    type: z.literal("area_control"),
    cooldown: z.literal(5),
    stunChance: z.literal(1),
  }).strict(),
  z.object({
    name: z.string().trim().min(1).max(24),
    description: z.string().trim().min(1).max(120),
    usageText: z.string().trim().min(1).max(10),
    type: z.literal("invincible"),
    cooldown: z.number().int().min(3).max(5),
  }).strict(),
  z.object({
    name: z.string().trim().min(1).max(24),
    description: z.string().trim().min(1).max(120),
    usageText: z.string().trim().min(1).max(10),
    type: z.literal("cleave_passive"),
    cooldown: z.literal(0),
  }).strict(),
  z.object({
    name: z.string().trim().min(1).max(24),
    description: z.string().trim().min(1).max(120),
    usageText: z.string().trim().min(1).max(10),
    type: z.literal("charge_strike_passive"),
    cooldown: z.literal(0),
    chargeTurns: z.number().int().min(2).max(5),
  }).strict(),
  z.object({
    name: z.string().trim().min(1).max(24),
    description: z.string().trim().min(1).max(120),
    usageText: z.string().trim().min(1).max(10),
    type: z.literal("lifesteal_passive"),
    cooldown: z.literal(0),
    damageMultiplier: z.number().min(0.2).max(0.6),
  }).strict(),
  z.object({
    name: z.string().trim().min(1).max(24),
    description: z.string().trim().min(1).max(120),
    usageText: z.string().trim().min(1).max(10),
    type: z.literal("growth_passive"),
    cooldown: z.literal(0),
    damageMultiplier: z.number().min(0.2).max(0.5),
  }).strict(),
  z.object({
    name: z.string().trim().min(1).max(24),
    description: z.string().trim().min(1).max(120),
    usageText: z.string().trim().min(1).max(10),
    type: z.literal("revive_passive"),
    cooldown: z.literal(0),
  }).strict(),
  z.object({
    name: z.string().trim().min(1).max(24),
    description: z.string().trim().min(1).max(120),
    usageText: z.string().trim().min(1).max(10),
    type: z.literal("assassin_passive"),
    cooldown: z.literal(0),
  }).strict(),
]);

export const generatedCharacterDraftSchema = z.object({
  name: z.string().trim().min(1).max(24),
  profession: z.enum(PROFESSIONS),
  realm: z.enum(REALMS),
  attack: z.number().int().min(5).max(30),
  maxHealth: z.number().int().min(80).max(180),
  skills: z.tuple([generatedSkillDraftSchema, generatedSkillDraftSchema]),
}).strict();

/** The model owns only combat choices; request data owns the name and realm. */
export const modelGeneratedCharacterDraftSchema = generatedCharacterDraftSchema.omit({
  name: true,
  realm: true,
});

/** First-stage model output: select constraints, never invent combat values. */
export const modelCharacterPlanSchema = z.object({
  profession: z.enum(PROFESSIONS),
  offensiveSkillType: z.enum(OFFENSIVE_SKILL_TYPES),
}).strict();

export const modelCharacterPlanJsonSchema = z.toJSONSchema(modelCharacterPlanSchema);

const professionSchemaConstraints = {
  tank: { attack: [5, 15], maxHealth: [145, 180] },
  warrior: { attack: [14, 22], maxHealth: [120, 160] },
  mage: { attack: [13, 23], maxHealth: [95, 130] },
  assassin: { attack: [16, 25], maxHealth: [105, 145] },
  ranger: { attack: [20, 30], maxHealth: [85, 120] },
} as const;

export const modelGeneratedCharacterDetailSchema = modelGeneratedCharacterDraftSchema.omit({
  profession: true,
});
const modelGeneratedCharacterDetailBaseJsonSchema = z.toJSONSchema(
  modelGeneratedCharacterDetailSchema,
);

function getRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Invalid generated character JSON Schema: ${label}.`);
  }
  return value as Record<string, unknown>;
}

function getSkillType(skillSchema: Record<string, unknown>): string {
  const properties = getRecord(skillSchema.properties, "skill properties");
  const type = getRecord(properties.type, "skill type");
  if (typeof type.const !== "string") {
    throw new Error("Invalid generated character JSON Schema: skill type.");
  }
  return type.const;
}

function getCompatibleCompanionSkillSchemas(
  offensiveSkillType: OffensiveSkillType,
  skillSchemas: Record<string, unknown>[],
): Record<string, unknown>[] {
  const offensiveSkillIsPassive = offensiveSkillType.endsWith("_passive");
  return skillSchemas.filter((skillSchema) => {
    const type = getSkillType(skillSchema);
    if (type === offensiveSkillType) return false;
    return !offensiveSkillIsPassive || !type.endsWith("_passive");
  });
}

/**
 * Agnes supports OpenAI-compatible JSON Schema output. The plan fixes the
 * profession and first offensive skill before this schema is sent, so every
 * schema-valid detail response has a legal combat foundation.
 */
export function getModelCharacterDetailJsonSchema(
  profession: Profession,
  offensiveSkillType: OffensiveSkillType,
): Record<string, unknown> {
  const schema = structuredClone(modelGeneratedCharacterDetailBaseJsonSchema) as Record<string, unknown>;
  const properties = getRecord(schema.properties, "detail properties");
  const skills = getRecord(properties.skills, "detail skills");
  const prefixItems = skills.prefixItems;
  if (!Array.isArray(prefixItems) || prefixItems.length !== 2) {
    throw new Error("Invalid generated character JSON Schema: skill tuple.");
  }

  const firstSkill = getRecord(prefixItems[0], "first skill");
  const skillSchemas = firstSkill.oneOf;
  if (!Array.isArray(skillSchemas)) {
    throw new Error("Invalid generated character JSON Schema: skill variants.");
  }
  const typedSkillSchemas = skillSchemas.map((skillSchema) => getRecord(skillSchema, "skill variant"));
  const offensiveSkillSchema = typedSkillSchemas.find(
    (skillSchema) => getSkillType(skillSchema) === offensiveSkillType,
  );
  if (!offensiveSkillSchema) {
    throw new Error("Invalid generated character JSON Schema: offensive skill.");
  }

  const ranges = professionSchemaConstraints[profession];
  properties.attack = { type: "integer", minimum: ranges.attack[0], maximum: ranges.attack[1] };
  properties.maxHealth = { type: "integer", minimum: ranges.maxHealth[0], maximum: ranges.maxHealth[1] };
  skills.prefixItems = [
    offensiveSkillSchema,
    { oneOf: getCompatibleCompanionSkillSchemas(offensiveSkillType, typedSkillSchemas) },
  ];
  return schema;
}

export const characterGenerationRequestSchema = z.object({
  name: z.string().trim().min(1).max(24),
  prompt: z.string().trim().min(8).max(500),
  realm: z.enum(REALMS),
});

export type GeneratedCharacterDraft = z.infer<typeof generatedCharacterDraftSchema>;
export type CharacterGenerationRequest = z.infer<typeof characterGenerationRequestSchema>;

function draftSkillToCharacterSkill(
  draft: z.infer<typeof generatedSkillDraftSchema>,
): Skill {
  const base = {
    id: nanoid(),
    name: draft.name,
    description: draft.description,
    usageText: draft.usageText,
    type: draft.type,
    cooldown: draft.cooldown,
  };

  switch (draft.type) {
    case "damage":
      return { ...base, damageMultiplier: draft.damageMultiplier };
    case "critical":
      return { ...base, damageMultiplier: draft.damageMultiplier };
    case "area_damage":
      return { ...base, damageMultiplier: draft.damageMultiplier };
    case "shield":
      return { ...base, shieldAmount: draft.shieldAmount };
    case "heal":
      return { ...base, healAmount: draft.healAmount };
    case "area_heal":
      return { ...base, healAmount: draft.healAmount };
    case "control":
      return { ...base, stunChance: draft.stunChance };
    case "area_control":
      return { ...base, stunChance: draft.stunChance };
    case "invincible":
      return { ...base };
    case "cleave_passive":
      return { ...base };
    case "charge_strike_passive":
      return { ...base, chargeTurns: draft.chargeTurns };
    case "lifesteal_passive":
      return { ...base, damageMultiplier: draft.damageMultiplier };
    case "growth_passive":
      return { ...base, damageMultiplier: draft.damageMultiplier };
    case "revive_passive":
      return { ...base };
    case "assassin_passive":
      return { ...base };
  }
}

/** Converts any model draft into a fully validated, storable character card. */
export function finalizeGeneratedCharacter(
  draft: GeneratedCharacterDraft,
  originalPrompt: string,
): Character {
  const parsedDraft = generatedCharacterDraftSchema.parse(draft);
  const timestamp = new Date().toISOString();
  const character = {
    id: nanoid(),
    name: parsedDraft.name,
    originalPrompt: originalPrompt.trim(),
    profession: parsedDraft.profession,
    realm: parsedDraft.realm,
    attack: parsedDraft.attack,
    maxHealth: parsedDraft.maxHealth,
    skills: parsedDraft.skills.map(draftSkillToCharacterSkill) as Character["skills"],
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  return characterSchema.parse(character);
}

export function getCharacterGenerationSystemPrompt(): string {
  return `你是“次元竞技场”的角色设计器。调用方已固定职业和第一个攻击技能 type；根据用户提供的角色名称、角色描述和指定战斗力阶位补全可用于团队回合制战斗的属性和两个技能，仅输出 JSON 对象，不要 Markdown。
JSON 顶层只能含 attack、maxHealth、skills，不得输出 name、realm 或 profession。skills 必须正好两个：第一个技能必须保持调用方指定的攻击 type，第二个技能必须使用调用方 JSON Schema 允许的不同 type。每个技能只能含 name、description、usageText、type、cooldown 和该 type 要求的字段，不得包含 id、activation、target 或其他 type 的字段；usageText 是战报中放在技能名前的动作短语，不重复技能名、不包含目标或伤害结果，中文不超过 10 个字。damage 另含 damageMultiplier（0.8-1.8）；critical 的 damageMultiplier 必须为 2；area_damage 的 damageMultiplier 为 0.45-0.9；shield 的 shieldAmount 为 10-45；heal 的 healAmount 为 10-45；area_heal 的 healAmount 为 5-25；control 与 area_control 的 stunChance 必须为 1；area_control 的冷却必须为 5；invincible 冷却 3-5；charge_strike_passive 的 chargeTurns 为 2-5；lifesteal_passive 的 damageMultiplier 为 0.2-0.6；growth_passive 的 damageMultiplier 为 0.2-0.5。所有中文文本简洁，技能名不重复。
职业范围：tank 攻击 5-15、生命 145-180；warrior 14-22、120-160；mage 13-23、95-130；assassin 16-25、105-145；ranger 20-30、85-120。冷却 1-5。所有中文文本简洁，技能名不重复。`;
}

export function getCharacterPlanSystemPrompt(): string {
  return `你是“次元竞技场”的角色规划器。根据角色名称、角色描述和指定战斗力阶位，只选择 profession 与 offensiveSkillType，不要生成属性或技能文本。profession 仅可为 tank、warrior、mage、assassin、ranger。offensiveSkillType 仅可为 damage、critical、area_damage、cleave_passive、charge_strike_passive、assassin_passive。选择应符合角色设定；仅输出 JSON 对象，不要 Markdown。`;
}
