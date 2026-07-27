import type { Skill } from "@/types/character";

const FALLBACK_USAGE_TEXT: Record<Skill["type"], string> = {
  damage: "凝神聚气，使出",
  shield: "凝结灵光，施展",
  heal: "调息运气，施展",
  control: "目光一凛，使出",
  area_damage: "聚力挥出",
  area_heal: "引动生机，施展",
  cleave_passive: "横扫千军",
  charge_strike_passive: "蓄势已久，释放",
  buff: "凝神施展",
};

/** Gives legacy cards a natural report phrase while preserving model-generated text. */
export function getSkillUsageText(
  skill: Pick<Skill, "type" | "usageText">,
): string {
  return skill.usageText?.trim() || FALLBACK_USAGE_TEXT[skill.type];
}
