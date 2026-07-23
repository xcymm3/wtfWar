import { nanoid } from "nanoid";
import { z } from "zod";

import { createSeededRandom } from "@/lib/battle/random";
import { PROFESSION_STAT_RANGES } from "@/lib/characters/professionRules";
import { characterSchema } from "@/lib/schemas/character";
import {
  PROFESSIONS,
  REALMS,
  type Character,
  type Profession,
  type Realm,
  type Skill,
} from "@/types/character";

type GeneratableSkillType =
  | "damage"
  | "shield"
  | "heal"
  | "control"
  | "area_damage"
  | "area_heal"
  | "cleave_passive"
  | "charge_strike_passive";

const generatedSkillDraftSchema = z.discriminatedUnion("type", [
  z.object({
    name: z.string().trim().min(1).max(24),
    description: z.string().trim().min(1).max(120),
    type: z.literal("damage"),
    cooldown: z.number().int().min(1).max(5),
    damageMultiplier: z.number().min(0.8).max(1.8),
  }).strict(),
  z.object({
    name: z.string().trim().min(1).max(24),
    description: z.string().trim().min(1).max(120),
    type: z.literal("area_damage"),
    cooldown: z.number().int().min(1).max(5),
    damageMultiplier: z.number().min(0.45).max(0.9),
  }).strict(),
  z.object({
    name: z.string().trim().min(1).max(24),
    description: z.string().trim().min(1).max(120),
    type: z.literal("shield"),
    cooldown: z.number().int().min(1).max(5),
    shieldAmount: z.number().int().min(10).max(45),
  }).strict(),
  z.object({
    name: z.string().trim().min(1).max(24),
    description: z.string().trim().min(1).max(120),
    type: z.literal("heal"),
    cooldown: z.number().int().min(1).max(5),
    healAmount: z.number().int().min(10).max(45),
  }).strict(),
  z.object({
    name: z.string().trim().min(1).max(24),
    description: z.string().trim().min(1).max(120),
    type: z.literal("area_heal"),
    cooldown: z.number().int().min(1).max(5),
    healAmount: z.number().int().min(5).max(25),
  }).strict(),
  z.object({
    name: z.string().trim().min(1).max(24),
    description: z.string().trim().min(1).max(120),
    type: z.literal("control"),
    cooldown: z.number().int().min(1).max(5),
    stunChance: z.number().min(0).max(0.5),
  }).strict(),
  z.object({
    name: z.string().trim().min(1).max(24),
    description: z.string().trim().min(1).max(120),
    type: z.literal("cleave_passive"),
    cooldown: z.literal(0),
  }).strict(),
  z.object({
    name: z.string().trim().min(1).max(24),
    description: z.string().trim().min(1).max(120),
    type: z.literal("charge_strike_passive"),
    cooldown: z.literal(0),
    chargeTurns: z.number().int().min(2).max(5),
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
  prompt: z.string().trim().min(8).max(500),
  preferredProfession: z.enum(PROFESSIONS).optional(),
});

export type GeneratedCharacterDraft = z.infer<typeof generatedCharacterDraftSchema>;
export type CharacterGenerationRequest = z.infer<typeof characterGenerationRequestSchema>;

const PROFESSION_KEYWORDS: Record<Profession, string[]> = {
  tank: ["坦克", "守卫", "盾", "护甲", "防御", "壁垒", "肉盾"],
  warrior: ["战士", "剑", "刀", "武", "骑士", "斩"],
  mage: ["法师", "魔法", "法术", "元素", "火焰", "冰", "雷"],
  assassin: ["刺客", "暗影", "潜行", "匕首", "毒", "影"],
  ranger: ["射手", "弓", "箭", "游侠", "狙击", "远程"],
};

const CHARACTER_NAMES: Record<Profession, string[]> = {
  tank: ["铁壁阿九", "玄甲守卫", "城垣"],
  warrior: ["断风", "赤锋", "长刃"],
  mage: ["星火", "霜语", "雷鸣"],
  assassin: ["夜刃", "幽影", "无声"],
  ranger: ["穿云", "远望", "逐风"],
};

const REALM_KEYWORDS: Record<Realm, string[]> = {
  mortal: [],
  martial_master: ["武林高手", "宗师", "大侠", "内功", "武者", "剑客"],
  superpowered: ["超能力", "异能", "念力", "变种", "超人"],
  cultivator: ["修仙", "修真", "仙人", "仙侠", "灵根", "渡劫"],
  deity: ["神灵", "天神", "神明", "神祇"],
};

const REALM_INFERENCE_ORDER: readonly Realm[] = [
  "deity",
  "cultivator",
  "superpowered",
  "martial_master",
];

const SECONDARY_SKILL_TYPES: Record<Profession, readonly GeneratableSkillType[]> = {
  tank: ["shield", "heal"],
  warrior: ["shield", "control"],
  mage: ["shield", "control"],
  assassin: ["control"],
  ranger: ["heal", "control"],
};

const TEAM_SKILL_KEYWORDS = ["群体", "全体", "范围", "团队", "队友"];
const HEAL_KEYWORDS = ["治疗", "恢复", "治愈", "医"];
const CLEAVE_PASSIVE_KEYWORDS = ["横扫", "横斩", "全体普攻", "挥砍全体"];
const CHARGE_PASSIVE_KEYWORDS = ["蓄力", "蓄能", "聚力", "蓄势"];

function inferProfession(prompt: string, randomSeed: string): Profession {
  const normalizedPrompt = prompt.toLocaleLowerCase("zh-CN");
  const match = PROFESSIONS.find((profession) =>
    PROFESSION_KEYWORDS[profession].some((keyword) => normalizedPrompt.includes(keyword)),
  );

  return match ?? createSeededRandom(randomSeed).pick(PROFESSIONS);
}

function inferRealm(prompt: string): Realm {
  const normalizedPrompt = prompt.toLocaleLowerCase("zh-CN");
  const matchedRealm = REALM_INFERENCE_ORDER.find((realm) =>
    REALM_KEYWORDS[realm].some((keyword) => normalizedPrompt.includes(keyword)),
  );

  return matchedRealm ?? "mortal";
}

function inferSecondarySkillType(
  profession: Profession,
  prompt: string,
  random: ReturnType<typeof createSeededRandom>,
): GeneratableSkillType {
  const normalizedPrompt = prompt.toLocaleLowerCase("zh-CN");
  if (CHARGE_PASSIVE_KEYWORDS.some((keyword) => normalizedPrompt.includes(keyword))) {
    return "charge_strike_passive";
  }
  if (CLEAVE_PASSIVE_KEYWORDS.some((keyword) => normalizedPrompt.includes(keyword))) {
    return "cleave_passive";
  }
  if (TEAM_SKILL_KEYWORDS.some((keyword) => normalizedPrompt.includes(keyword))) {
    return HEAL_KEYWORDS.some((keyword) => normalizedPrompt.includes(keyword))
      ? "area_heal"
      : "area_damage";
  }

  return random.pick(SECONDARY_SKILL_TYPES[profession]);
}

function createSkillDraft(
  type: GeneratableSkillType,
  random: ReturnType<typeof createSeededRandom>,
): z.infer<typeof generatedSkillDraftSchema> {
  switch (type) {
    case "damage":
      return {
        name: random.pick(["破阵一击", "致命突袭", "贯穿打击"]),
        description: "集中力量发动一次高效伤害攻击。",
        type,
        cooldown: random.nextInt(2, 4),
        damageMultiplier: random.nextInt(10, 18) / 10,
      };
    case "area_damage":
      return {
        name: random.pick(["裂地冲击", "星火风暴", "箭雨齐射"]),
        description: "对敌方所有存活角色造成范围伤害。",
        type,
        cooldown: random.nextInt(3, 5),
        damageMultiplier: random.nextInt(45, 90) / 100,
      };
    case "shield":
      return {
        name: random.pick(["临时护甲", "壁垒展开", "法力屏障"]),
        description: "为自身施加可吸收伤害的护盾。",
        type,
        cooldown: random.nextInt(2, 4),
        shieldAmount: random.nextInt(18, 38),
      };
    case "heal":
      return {
        name: random.pick(["战地修整", "生命回响", "野战急救"]),
        description: "迅速恢复自身生命值。",
        type,
        cooldown: random.nextInt(3, 5),
        healAmount: random.nextInt(18, 36),
      };
    case "area_heal":
      return {
        name: random.pick(["生命共鸣", "圣光回响", "战歌治愈"]),
        description: "为己方所有存活角色恢复生命。",
        type,
        cooldown: random.nextInt(3, 5),
        healAmount: random.nextInt(8, 22),
      };
    case "control":
      return {
        name: random.pick(["震慑打击", "束缚箭", "寒霜禁锢"]),
        description: "有概率使对手下一次行动跳过。",
        type,
        cooldown: random.nextInt(3, 5),
        stunChance: random.nextInt(20, 45) / 100,
      };
    case "cleave_passive":
      return {
        name: "横扫",
        description: "普通攻击改为命中敌方所有存活角色，但有效攻击降低。",
        type,
        cooldown: 0,
      };
    case "charge_strike_passive":
      return {
        name: "蓄力一击",
        description: "积蓄数次行动后，对敌方前排释放固定高伤害。",
        type,
        cooldown: 0,
        chargeTurns: random.nextInt(2, 4),
      };
  }
}

function draftSkillToCharacterSkill(
  draft: z.infer<typeof generatedSkillDraftSchema>,
): Skill {
  const base = {
    id: nanoid(),
    name: draft.name,
    description: draft.description,
    type: draft.type,
    cooldown: draft.cooldown,
  };

  switch (draft.type) {
    case "damage":
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
    case "cleave_passive":
      return { ...base };
    case "charge_strike_passive":
      return { ...base, chargeTurns: draft.chargeTurns };
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

/**
 * A transparent no-key fallback so the creation flow remains usable locally.
 * It never pretends to be a remote model response and always uses the same
 * validation path as a model-produced draft.
 */
export function generateLocalCharacter(
  request: CharacterGenerationRequest,
): Character {
  const parsedRequest = characterGenerationRequestSchema.parse(request);
  const profession = parsedRequest.preferredProfession
    ?? inferProfession(parsedRequest.prompt, parsedRequest.prompt);
  const random = createSeededRandom(`${profession}\u0000${parsedRequest.prompt}`);
  const ranges = PROFESSION_STAT_RANGES[profession];
  const draft: GeneratedCharacterDraft = {
    name: random.pick(CHARACTER_NAMES[profession]),
    profession,
    realm: inferRealm(parsedRequest.prompt),
    attack: random.nextInt(ranges.attack.min, ranges.attack.max),
    maxHealth: random.nextInt(ranges.maxHealth.min, ranges.maxHealth.max),
    skills: [
      createSkillDraft("damage", random),
      createSkillDraft(inferSecondarySkillType(profession, parsedRequest.prompt, random), random),
    ],
  };

  return finalizeGeneratedCharacter(draft, parsedRequest.prompt);
}

export function getCharacterGenerationSystemPrompt(): string {
  return `你是“斗蛐蛐 AI”的角色设计器。根据用户描述生成一个可用于单挑或团队回合制战斗的角色，仅输出 JSON 对象，不要 Markdown。
JSON 必须含 name、profession、realm、attack、maxHealth、skills。profession 仅可为 tank、warrior、mage、assassin、ranger。realm 仅可为 mortal、martial_master、superpowered、cultivator、deity，应根据角色世界观强度选择：凡人、武林高手、超能力者、修仙者、神灵。skills 必须正好两个，组合只能是两个主动技能或一个主动技能加一个被动技能，两个 type 不同，不能使用 buff；至少一个 type 为 damage、area_damage、cleave_passive 或 charge_strike_passive。每个技能都含 name、description、type、cooldown；damage 另含 damageMultiplier（0.8-1.8），area_damage 另含 damageMultiplier（0.45-0.9），shield 另含 shieldAmount（10-45），heal 另含 healAmount（10-45），area_heal 另含 healAmount（5-25），control 另含 stunChance（0-0.5）。cleave_passive 的 cooldown 必须为 0，会让普通攻击命中敌方全体但降低有效攻击；charge_strike_passive 的 cooldown 必须为 0，另含 chargeTurns（2-5），每满该次数行动对敌方前排释放固定高伤害。area_damage 攻击敌方所有存活角色，area_heal 恢复己方所有存活角色。
职业范围：tank 攻击 5-15、生命 145-180；warrior 14-22、120-160；mage 13-23、95-130；assassin 20-30、85-120；ranger 16-25、105-145。冷却 1-5。所有中文文本简洁，技能名不重复。`;
}
