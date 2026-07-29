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
  | "critical"
  | "shield"
  | "heal"
  | "control"
  | "area_damage"
  | "area_heal"
  | "area_control"
  | "invincible"
  | "cleave_passive"
  | "charge_strike_passive"
  | "lifesteal_passive"
  | "growth_passive"
  | "revive_passive"
  | "assassin_passive";

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

const PROFESSION_KEYWORDS: Record<Profession, string[]> = {
  tank: ["坦克", "守卫", "盾", "护甲", "防御", "壁垒", "肉盾"],
  warrior: ["战士", "剑", "刀", "武", "骑士", "斩"],
  mage: ["法师", "魔法", "法术", "元素", "火焰", "冰", "雷"],
  assassin: ["刺客", "暗影", "潜行", "匕首", "毒", "影"],
  ranger: ["射手", "弓", "箭", "游侠", "狙击", "远程"],
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
  tank: ["shield", "heal", "invincible", "revive_passive"],
  warrior: ["critical", "control", "growth_passive"],
  mage: ["control", "area_damage", "area_control", "invincible"],
  assassin: ["critical", "control", "lifesteal_passive", "assassin_passive"],
  ranger: ["heal", "control", "area_damage", "critical"],
};

const TEAM_SKILL_KEYWORDS = ["群体", "全体", "范围", "团队", "队友"];
const HEAL_KEYWORDS = ["治疗", "恢复", "治愈", "医"];
const CLEAVE_PASSIVE_KEYWORDS = ["横扫", "横斩", "全体普攻", "挥砍全体"];
const CHARGE_PASSIVE_KEYWORDS = ["蓄力", "蓄能", "聚力", "蓄势"];
const CRITICAL_KEYWORDS = ["暴击", "必杀", "绝杀", "致命一击", "斩杀"];
const AREA_CONTROL_KEYWORDS = ["群控", "群体控制", "控制全场", "眩晕全体", "威压全场"];
const INVINCIBLE_KEYWORDS = ["无敌", "金身", "不灭", "护体", "免伤"];
const LIFESTEAL_KEYWORDS = ["吸血", "嗜血", "血战", "以战养战"];
const GROWTH_KEYWORDS = ["成长", "越战越强", "战意", "叠攻", "愈战愈强"];
const REVIVE_KEYWORDS = ["复活", "重生", "不死", "浴火"];
const ASSASSIN_PASSIVE_KEYWORDS = ["后排", "切后", "绕后", "偷袭后方", "狙杀后排"];

function inferProfession(
  name: string,
  prompt: string,
  randomSeed: string,
): Profession {
  const normalizedName = name.toLocaleLowerCase("zh-CN");
  const normalizedPrompt = prompt.toLocaleLowerCase("zh-CN");
  const rankedProfessions = PROFESSIONS.map((profession) => ({
    profession,
    score: PROFESSION_KEYWORDS[profession].reduce(
      (score, keyword) => score
        + (normalizedName.includes(keyword) ? 2 : 0)
        + (normalizedPrompt.includes(keyword) ? 1 : 0),
      0,
    ),
  })).sort((first, second) => second.score - first.score);

  return rankedProfessions[0]?.score
    ? rankedProfessions[0].profession
    : createSeededRandom(randomSeed).pick(PROFESSIONS);
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
  if (AREA_CONTROL_KEYWORDS.some((keyword) => normalizedPrompt.includes(keyword))) {
    return "area_control";
  }
  if (INVINCIBLE_KEYWORDS.some((keyword) => normalizedPrompt.includes(keyword))) {
    return "invincible";
  }
  if (REVIVE_KEYWORDS.some((keyword) => normalizedPrompt.includes(keyword))) {
    return "revive_passive";
  }
  if (GROWTH_KEYWORDS.some((keyword) => normalizedPrompt.includes(keyword))) {
    return "growth_passive";
  }
  if (LIFESTEAL_KEYWORDS.some((keyword) => normalizedPrompt.includes(keyword))) {
    return "lifesteal_passive";
  }
  if (ASSASSIN_PASSIVE_KEYWORDS.some((keyword) => normalizedPrompt.includes(keyword))) {
    return "assassin_passive";
  }
  if (CRITICAL_KEYWORDS.some((keyword) => normalizedPrompt.includes(keyword))) {
    return "critical";
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
        usageText: random.pick(["凝神聚气，使出", "身形一闪，使出", "汇聚劲力，施展"]),
        type,
        cooldown: random.nextInt(2, 4),
        damageMultiplier: random.nextInt(10, 18) / 10,
      };
    case "critical":
      return {
        name: random.pick(["绝杀暴击", "断魂突刺", "破军绝斩"]),
        description: "对敌方前排造成双倍伤害，并按实际伤害恢复自身生命。",
        usageText: random.pick(["凝神一击，施展", "杀意骤起，使出", "寒芒乍现，施展"]),
        type,
        cooldown: random.nextInt(3, 5),
        damageMultiplier: 2,
      };
    case "area_damage":
      return {
        name: random.pick(["裂地冲击", "星火风暴", "箭雨齐射"]),
        description: "对敌方所有存活角色造成范围伤害。",
        usageText: random.pick(["聚力挥出", "引动风雷，施展", "抬手唤出"]),
        type,
        cooldown: random.nextInt(3, 5),
        damageMultiplier: random.nextInt(45, 90) / 100,
      };
    case "shield":
      return {
        name: random.pick(["临时护甲", "壁垒展开", "法力屏障"]),
        description: "为自身施加可吸收伤害的护盾。",
        usageText: random.pick(["凝结灵光，施展", "抬手展开", "气息沉稳，施展"]),
        type,
        cooldown: random.nextInt(2, 4),
        shieldAmount: random.nextInt(18, 38),
      };
    case "heal":
      return {
        name: random.pick(["战地修整", "生命回响", "野战急救"]),
        description: "迅速恢复己方前排生命值。",
        usageText: random.pick(["调息运气，施展", "收敛心神，施展", "轻抚伤处，施展"]),
        type,
        cooldown: random.nextInt(3, 5),
        healAmount: random.nextInt(18, 36),
      };
    case "area_heal":
      return {
        name: random.pick(["生命共鸣", "圣光回响", "战歌治愈"]),
        description: "为己方所有存活角色恢复生命。",
        usageText: random.pick(["引动生机，施展", "放声吟唱", "挥洒光辉，施展"]),
        type,
        cooldown: random.nextInt(3, 5),
        healAmount: random.nextInt(8, 22),
      };
    case "control":
      return {
        name: random.pick(["震慑打击", "束缚箭", "寒霜禁锢"]),
        description: "使敌方前排下一次行动必定跳过。",
        usageText: random.pick(["目光一凛，使出", "冷然出手，使出", "屏息凝神，施展"]),
        type,
        cooldown: random.nextInt(3, 5),
        stunChance: 1,
      };
    case "area_control":
      return {
        name: random.pick(["全场威压", "寒域封锁", "定身风暴"]),
        description: "使敌方所有存活角色下一次行动必定跳过。",
        usageText: random.pick(["威压全场，施展", "寒潮席卷，施展", "气场骤落，施展"]),
        type,
        cooldown: 5,
        stunChance: 1,
      };
    case "invincible":
      return {
        name: random.pick(["不灭金身", "护体神光", "绝对屏障"]),
        description: "使自己在本回合免疫所有伤害。",
        usageText: random.pick(["护体光芒，施展", "金光骤起，施展", "灵光护体，施展"]),
        type,
        cooldown: random.nextInt(3, 5),
      };
    case "cleave_passive":
      return {
        name: "横扫",
        description: "普通攻击改为命中敌方所有存活角色，但有效攻击降低。",
        usageText: "横扫千军",
        type,
        cooldown: 0,
      };
    case "charge_strike_passive":
      return {
        name: "蓄力一击",
        description: "积蓄数次行动后，对敌方前排释放固定高伤害。",
        usageText: "蓄势已久，释放",
        type,
        cooldown: 0,
        chargeTurns: random.nextInt(2, 4),
      };
    case "lifesteal_passive":
      return {
        name: "嗜血",
        description: "每次造成伤害后，按当前攻击的一定比例恢复自身生命。",
        usageText: "嗜血汲取",
        type,
        cooldown: 0,
        damageMultiplier: random.nextInt(20, 45) / 100,
      };
    case "growth_passive":
      return {
        name: "成长",
        description: "每次行动结束后，按当前攻击的一定比例提升攻击。",
        usageText: "战意渐盛",
        type,
        cooldown: 0,
        damageMultiplier: random.nextInt(20, 40) / 100,
      };
    case "revive_passive":
      return {
        name: "复苏之躯",
        description: "首次阵亡时，以一半最大生命重新站起。",
        usageText: "浴火重生",
        type,
        cooldown: 0,
      };
    case "assassin_passive":
      return {
        name: "影袭",
        description: "攻击降低 20%，单体攻击与控制优先锁定敌方最后存活者。",
        usageText: "潜行突袭",
        type,
        cooldown: 0,
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

/**
 * A transparent no-key fallback so the creation flow remains usable locally.
 * It never pretends to be a remote model response and always uses the same
 * validation path as a model-produced draft.
 */
export function generateLocalCharacter(
  request: CharacterGenerationRequest,
): Character {
  const parsedRequest = characterGenerationRequestSchema.parse(request);
  const generationContext = `角色名称：${parsedRequest.name}\n角色描述：${parsedRequest.prompt}`;
  const profession = inferProfession(
    parsedRequest.name,
    parsedRequest.prompt,
    generationContext,
  );
  const random = createSeededRandom(`${profession}\u0000${generationContext}`);
  const ranges = PROFESSION_STAT_RANGES[profession];
  const draft: GeneratedCharacterDraft = {
    name: parsedRequest.name,
    profession,
    realm: inferRealm(generationContext),
    attack: random.nextInt(ranges.attack.min, ranges.attack.max),
    maxHealth: random.nextInt(ranges.maxHealth.min, ranges.maxHealth.max),
    skills: [
      createSkillDraft("damage", random),
      createSkillDraft(inferSecondarySkillType(profession, generationContext, random), random),
    ],
  };

  return finalizeGeneratedCharacter(draft, parsedRequest.prompt);
}

export function getCharacterGenerationSystemPrompt(): string {
  return `你是“次元竞技场”的角色设计器。根据用户提供的角色名称和角色描述生成一个可用于团队回合制战斗的角色；职业、属性和技能必须综合两项信息判断，仅输出 JSON 对象，不要 Markdown。
JSON 必须含 name、profession、realm、attack、maxHealth、skills。profession 仅可为 tank、warrior、mage、assassin、ranger。realm 仅可为 mortal、martial_master、superpowered、cultivator、deity，应根据角色世界观强度选择战斗力阶位：菜鸟、凡人、高手、超凡、神灵（由低到高）。skills 必须正好两个，组合只能是两个主动技能或一个主动技能加一个被动技能，两个 type 不同，不能使用 buff；至少一个 type 为 damage、critical、area_damage、cleave_passive、charge_strike_passive 或 assassin_passive。每个技能都含 name、description、usageText、type、cooldown；usageText 是战报中放在技能名前的动作短语，如“易掌为拳，使出”，不重复技能名、不包含目标或伤害结果，中文不超过 10 个字。damage 另含 damageMultiplier（0.8-1.8）；critical 另含 damageMultiplier，且必须为 2；area_damage 另含 damageMultiplier（0.45-0.9）；shield 另含 shieldAmount（10-45）；heal 另含 healAmount（10-45），目标始终是己方前排；area_heal 另含 healAmount（5-25）；control 另含 stunChance，且必须为 1；area_control 另含 stunChance，且必须为 1，冷却必须为 5；invincible 无额外字段，冷却 3-5，本回合免疫伤害；lifesteal_passive 与 growth_passive 另含 damageMultiplier；revive_passive 与 assassin_passive 无额外字段。cleave_passive 的 cooldown 必须为 0，会让普通攻击命中敌方全体但降低有效攻击；charge_strike_passive 的 cooldown 必须为 0，另含 chargeTurns（2-5），每满该次数行动对敌方前排释放固定高伤害；lifesteal_passive 在每次造成伤害后回血；growth_passive 在每次行动结束后成长；revive_passive 会在首次阵亡时半血复活；assassin_passive 会让单体攻击和控制优先锁定敌方最后存活者，但自身攻击降低 20%。area_damage 攻击敌方所有存活角色，area_heal 恢复己方所有存活角色。
职业范围：tank 攻击 5-15、生命 145-180；warrior 14-22、120-160；mage 13-23、95-130；assassin 16-25、105-145；ranger 20-30、85-120。冷却 1-5。所有中文文本简洁，技能名不重复。`;
}
