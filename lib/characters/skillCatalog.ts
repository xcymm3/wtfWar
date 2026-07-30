import type { SkillType } from "@/types/character";

export type GeneratableSkillInfo = {
  type: Exclude<SkillType, "buff">;
  label: string;
  description: string;
  activation: "主动" | "被动";
};

/** Shared definitions for the model planner and the player-facing skill guide. */
export const GENERATABLE_SKILL_CATALOG: readonly GeneratableSkillInfo[] = [
  { type: "damage", label: "单体伤害", description: "攻击敌方当前前排。", activation: "主动" },
  { type: "critical", label: "暴击", description: "重创敌方当前前排，并恢复自身生命。", activation: "主动" },
  { type: "area_damage", label: "群体伤害", description: "攻击敌方所有存活角色。", activation: "主动" },
  { type: "shield", label: "护盾", description: "为自己施加护盾。", activation: "主动" },
  { type: "heal", label: "前排治疗", description: "治疗己方当前前排，不保证治疗施法者自己。", activation: "主动" },
  { type: "area_heal", label: "群体治疗", description: "治疗己方所有存活角色。", activation: "主动" },
  { type: "control", label: "单体控制", description: "使敌方当前前排跳过下一次行动。", activation: "主动" },
  { type: "area_control", label: "群体控制", description: "使敌方所有存活角色跳过下一次行动。", activation: "主动" },
  { type: "invincible", label: "无敌", description: "本回合免疫伤害，是短暂无伤的唯一对应机制。", activation: "主动" },
  { type: "cleave_passive", label: "横扫", description: "普通攻击改为命中敌方全体，但自身攻击降低。", activation: "被动" },
  { type: "charge_strike_passive", label: "蓄力一击", description: "持续蓄力后攻击敌方前排；蓄力期间不会使用其他行动。", activation: "被动" },
  { type: "lifesteal_passive", label: "吸血", description: "每次造成伤害后恢复自身生命。", activation: "被动" },
  { type: "growth_passive", label: "成长", description: "每次行动后提升自身攻击。", activation: "被动" },
  { type: "revive_passive", label: "复活", description: "首次倒下时以部分生命重返战场。", activation: "被动" },
  { type: "assassin_passive", label: "刺客本能", description: "自身攻击降低，但单体攻击会优先锁定敌方最后的存活角色。", activation: "被动" },
];

export function getGeneratableSkillPlanningGuide(): string {
  return GENERATABLE_SKILL_CATALOG
    .map((skill) => `${skill.type}（${skill.label}，${skill.description}）`)
    .join("；");
}
