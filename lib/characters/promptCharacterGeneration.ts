import { nanoid } from "nanoid";
import { z } from "zod";

import { getGeneratableSkillPlanningGuide } from "@/lib/characters/skillCatalog";
import { characterSchema } from "@/lib/schemas/character";
import {
  PROFESSIONS,
  REALMS,
  SKILL_TYPES,
  type Character,
  type Profession,
  type Skill,
} from "@/types/character";

const generatedSkillTypeSchema = z.enum(SKILL_TYPES).exclude(["buff"]);

export type PlannedSkillType = z.infer<typeof generatedSkillTypeSchema>;

const GROUP_TARGET_SKILL_TYPES = [
  "area_damage",
  "area_heal",
  "area_control",
  "cleave_passive",
] as const satisfies readonly PlannedSkillType[];

function requiresSingleTargetOnlySkills(prompt: string): boolean {
  const normalized = prompt.replaceAll(/\s+/g, "").toLowerCase();
  return /(?:不(?:擅长|善于|会|使用|打)?(?:群体|群攻|群伤|范围|aoe)|(?:只|仅|专注).{0,6}(?:单体|单个目标)|(?:单体|单个目标).{0,8}(?:不(?:擅长|善于|会|使用|打)?(?:群体|群攻|群伤|范围|aoe)))/.test(normalized);
}

export function getDisallowedPlannedSkillTypes(prompt: string): readonly PlannedSkillType[] {
  return requiresSingleTargetOnlySkills(prompt) ? GROUP_TARGET_SKILL_TYPES : [];
}

export function planUsesDisallowedSkillType(
  plan: { primarySkillType: PlannedSkillType; secondarySkillType: PlannedSkillType },
  prompt: string,
): boolean {
  const disallowedTypes = getDisallowedPlannedSkillTypes(prompt);
  return disallowedTypes.includes(plan.primarySkillType) || disallowedTypes.includes(plan.secondarySkillType);
}

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
    damageMultiplier: z.number().min(0.1).max(0.2),
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
  primarySkillType: generatedSkillTypeSchema,
  secondarySkillType: generatedSkillTypeSchema,
}).strict().superRefine((plan, context) => {
  if (plan.primarySkillType === plan.secondarySkillType) {
    context.addIssue({
      code: "custom",
      path: ["secondarySkillType"],
      message: "The two planned skill types must be different.",
    });
  }
});

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

/**
 * Agnes supports OpenAI-compatible JSON Schema output. The plan fixes the
 * profession and first skill before this schema is sent, so every
 * schema-valid detail response has a legal combat foundation.
 */
export function getModelCharacterDetailJsonSchema(
  profession: Profession,
  primarySkillType: PlannedSkillType,
  secondarySkillType: PlannedSkillType,
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
  const primarySkillSchema = typedSkillSchemas.find(
    (skillSchema) => getSkillType(skillSchema) === primarySkillType,
  );
  if (!primarySkillSchema) {
    throw new Error("Invalid generated character JSON Schema: primary skill.");
  }
  const secondarySkillSchema = typedSkillSchemas.find(
    (skillSchema) => getSkillType(skillSchema) === secondarySkillType,
  );
  if (!secondarySkillSchema || primarySkillType === secondarySkillType) {
    throw new Error("Invalid generated character JSON Schema: secondary skill.");
  }

  const ranges = professionSchemaConstraints[profession];
  properties.attack = { type: "integer", minimum: ranges.attack[0], maximum: ranges.attack[1] };
  properties.maxHealth = { type: "integer", minimum: ranges.maxHealth[0], maximum: ranges.maxHealth[1] };
  skills.prefixItems = [
    primarySkillSchema,
    secondarySkillSchema,
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
  return `你是“次元竞技场”的角色设计器。调用方已固定职业和两个技能 type；根据用户提供的角色名称、角色描述和指定战力阶位补全可用于团队回合制战斗的属性和两个技能，仅输出 JSON 对象，不要 Markdown。
JSON 顶层只能含 attack、maxHealth、skills，不得输出 name、realm 或 profession。JSON 结构示例（仅展示字段结构，技能 type 必须以调用方指定值为准）：{"attack":18,"maxHealth":120,"skills":[{"name":"示例技能甲","description":"简短描述。","usageText":"凝神施展","type":"调用方指定的第一个 type","cooldown":3},{"name":"示例技能乙","description":"简短描述。","usageText":"蓄力施展","type":"调用方指定的第二个 type","cooldown":3}]}。skills 必须正好两个：第一个和第二个技能都必须保持调用方分别指定的 type。两个被动技能可以合法组合，角色的普通攻击始终可造成伤害。角色设定出现“不死、复活、重生”时优先使用 revive_passive；出现“成长、越战越强、战斗力 Max”时优先使用 growth_passive。每个技能只能含 name、description、usageText、type、cooldown 和该 type 要求的字段，不得包含 id、activation、target 或其他 type 的字段；usageText 是战报中放在技能名前的动作短语，不重复技能名、不包含目标或伤害结果，中文不超过 10 个字。damage 另含 damageMultiplier（0.8-1.8）；critical 的 damageMultiplier 必须为 2；area_damage 的 damageMultiplier 为 0.45-0.9；shield 的 shieldAmount 为 10-45；heal 的 healAmount 为 10-45；area_heal 的 healAmount 为 5-25；control 与 area_control 的 stunChance 必须为 1；area_control 的冷却必须为 5；invincible 冷却 3-5；charge_strike_passive 的 chargeTurns 为 2-5；lifesteal_passive 的 damageMultiplier 为 0.2-0.6；growth_passive 的 damageMultiplier 为 0.1-0.2。所有中文文本简洁，技能名不重复。
职业范围：tank 攻击 5-15、生命 145-180；warrior 14-22、120-160；mage 13-23、95-130；assassin 16-25、105-145；ranger 20-30、85-120。主动技能的 cooldown 为 1-5（area_control 固定 5，invincible 为 3-5）；所有被动技能（type 以 _passive 结尾）的 cooldown 必须固定为 0。heal 只能描述为治疗己方前排，不能写成自我治疗；lifesteal_passive 必须描述为造成伤害后恢复自身生命。游戏没有独立的闪避机制，invincible 必须描述为直到下次行动前短暂无伤，assassin_passive 不能描述为闪避。所有中文文本简洁，技能名不重复。`;
}

export function getCharacterPlanSystemPrompt(prompt = ""): string {
  const singleTargetConstraint = requiresSingleTargetOnlySkills(prompt)
    ? "用户明确要求只擅长单体、或不擅长群体：严禁选择 area_damage、area_heal、area_control、cleave_passive；这四类都会影响多个目标。"
    : "";
  return `你是“次元竞技场”的角色规划器。根据角色名称、角色描述和指定战力阶位，只选择 profession、primarySkillType、secondarySkillType，不要生成属性或技能文本。JSON 示例：{"profession":"warrior","primarySkillType":"damage","secondarySkillType":"shield"}。profession 仅可为 tank、warrior、mage、assassin、ranger。skillType 必须严格从以下英文标识中选择，不得自造 speed、attack 等值：${generatedSkillTypeSchema.options.join("、")}。技能实际效果：${getGeneratableSkillPlanningGuide()}。两个 skillType 必须不同。普通攻击天然提供伤害，因此双被动合法；“不死、复活、重生”优先 revive_passive，“成长、越战越强、战斗力 Max”优先 growth_passive。heal 只治疗己方当前前排，绝不是自我治疗；只要设定表达“吸血、汲取、攻击后恢复自身生命”，或同时表达“闪避/战斗”和“恢复自身生命”等以自身续航为目的的描述，必须选择 lifesteal_passive，不能选择 heal。游戏没有独立的闪避技能；如设定明确要求短暂无伤，可选择 invincible，但不得把 assassin_passive 描述为闪避。若设定同时出现“战斗力 Max”和“不会死”，必须选择 primarySkillType 为 growth_passive、secondarySkillType 为 revive_passive。${singleTargetConstraint}选择应符合角色设定；仅输出 JSON 对象，不要 Markdown。`;
}
