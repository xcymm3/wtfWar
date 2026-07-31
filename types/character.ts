export const PROFESSIONS = [
  "tank",
  "warrior",
  "mage",
  "assassin",
  "ranger",
] as const;

export type Profession = (typeof PROFESSIONS)[number];

export const PROFESSION_LABELS: Record<Profession, string> = {
  tank: "坦克",
  warrior: "战士",
  mage: "法师",
  assassin: "刺客",
  ranger: "射手",
};

export const REALMS = [
  "mortal",
  "martial_master",
  "superpowered",
  "cultivator",
  "deity",
] as const;

export type Realm = (typeof REALMS)[number];

export const REALM_LABELS: Record<Realm, string> = {
  mortal: "凡人",
  martial_master: "高手",
  superpowered: "超凡",
  cultivator: "传奇",
  deity: "神灵",
};

export const ACTIVE_SKILL_TYPES = [
  "damage",
  "shield",
  "heal",
  "control",
  "area_damage",
  "area_heal",
  "critical",
  "area_control",
  "invincible",
  "buff",
] as const;

export const PASSIVE_SKILL_TYPES = [
  "cleave_passive",
  "charge_strike_passive",
  "lifesteal_passive",
  "growth_passive",
  "revive_passive",
  "assassin_passive",
] as const;

export const SKILL_TYPES = [
  ...ACTIVE_SKILL_TYPES,
  ...PASSIVE_SKILL_TYPES,
] as const;

export type ActiveSkillType = (typeof ACTIVE_SKILL_TYPES)[number];
export type PassiveSkillType = (typeof PASSIVE_SKILL_TYPES)[number];
export type SkillType = (typeof SKILL_TYPES)[number];

export const SKILL_TARGETS = [
  "self",
  "ally_front",
  "enemy_front",
  "enemies_all",
  "allies_all",
] as const;

export type SkillTarget = (typeof SKILL_TARGETS)[number];
export type SkillActivation = "active" | "passive";

export type Skill = {
  id: string;
  name: string;
  description: string;
  /** A concise, model-generated lead-in for the battle report (at most 10 characters). */
  usageText?: string;
  type: SkillType;
  /** Optional only for legacy v1 TypeScript callers; persisted cards are migrated to active. */
  activation?: SkillActivation;
  /** Optional only for legacy v1 TypeScript callers; persisted cards are migrated to a canonical target. */
  target?: SkillTarget;
  cooldown: number;
  damageMultiplier?: number;
  shieldAmount?: number;
  healAmount?: number;
  stunChance?: number;
  chargeTurns?: number;
};

export type Character = {
  id: string;
  name: string;
  originalPrompt: string;
  profession: Profession;
  /** Optional only until a v1 in-memory card passes the v2 migration boundary. */
  realm?: Realm;
  attack: number;
  maxHealth: number;
  skills: [Skill, Skill];
  createdAt: string;
  updatedAt: string;
};
