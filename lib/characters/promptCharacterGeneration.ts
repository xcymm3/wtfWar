import { nanoid } from "nanoid";
import { z } from "zod";

import { characterSchema } from "@/lib/schemas/character";
import {
  PROFESSIONS,
  REALMS,
  type Character,
  type Skill,
} from "@/types/character";

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

export const characterGenerationRequestSchema = z.object({
  name: z.string().trim().min(1).max(24),
  prompt: z.string().trim().min(8).max(500),
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
  return `你是“次元竞技场”的角色设计器。根据用户提供的角色名称和角色描述生成一个可用于团队回合制战斗的角色；职业、属性和技能必须综合两项信息判断，仅输出 JSON 对象，不要 Markdown。
JSON 必须含 name、profession、realm、attack、maxHealth、skills。profession 仅可为 tank、warrior、mage、assassin、ranger。realm 仅可为 mortal、martial_master、superpowered、cultivator、deity，应根据角色世界观强度选择战斗力阶位：菜鸟、凡人、高手、超凡、神灵（由低到高）。skills 必须正好两个，组合只能是两个主动技能或一个主动技能加一个被动技能，两个 type 不同，不能使用 buff；至少一个 type 为 damage、critical、area_damage、cleave_passive、charge_strike_passive 或 assassin_passive。每个技能都含 name、description、usageText、type、cooldown；usageText 是战报中放在技能名前的动作短语，如“易掌为拳，使出”，不重复技能名、不包含目标或伤害结果，中文不超过 10 个字。damage 另含 damageMultiplier（0.8-1.8）；critical 另含 damageMultiplier，且必须为 2；area_damage 另含 damageMultiplier（0.45-0.9）；shield 另含 shieldAmount（10-45）；heal 另含 healAmount（10-45），目标始终是己方前排；area_heal 另含 healAmount（5-25）；control 另含 stunChance，且必须为 1；area_control 另含 stunChance，且必须为 1，冷却必须为 5；invincible 无额外字段，冷却 3-5，本回合免疫伤害；lifesteal_passive 与 growth_passive 另含 damageMultiplier；revive_passive 与 assassin_passive 无额外字段。cleave_passive 的 cooldown 必须为 0，会让普通攻击命中敌方全体但降低有效攻击；charge_strike_passive 的 cooldown 必须为 0，另含 chargeTurns（2-5），每满该次数行动对敌方前排释放固定高伤害；lifesteal_passive 在每次造成伤害后回血；growth_passive 在每次行动结束后成长；revive_passive 会在首次阵亡时半血复活；assassin_passive 会让单体攻击和控制优先锁定敌方最后存活者，但自身攻击降低 20%。area_damage 攻击敌方所有存活角色，area_heal 恢复己方所有存活角色。
职业范围：tank 攻击 5-15、生命 145-180；warrior 14-22、120-160；mage 13-23、95-130；assassin 16-25、105-145；ranger 20-30、85-120。冷却 1-5。所有中文文本简洁，技能名不重复。`;
}
