import type { ReactNode } from "react";

import type { SkillType } from "@/types/character";

export const SKILL_TYPE_LABELS: Record<SkillType, string> = {
  damage: "伤害",
  shield: "护盾",
  heal: "治疗",
  control: "控制",
  area_damage: "群体伤害",
  area_heal: "群体治疗",
  critical: "暴击",
  area_control: "群体控制",
  invincible: "无敌",
  cleave_passive: "横扫被动",
  charge_strike_passive: "蓄力被动",
  lifesteal_passive: "吸血被动",
  growth_passive: "成长被动",
  revive_passive: "复活被动",
  assassin_passive: "刺客被动",
  buff: "增益",
};

type SkillIconTone = "offense" | "protection" | "control" | "passive";

const SKILL_ICON_TONES: Record<SkillType, SkillIconTone> = {
  damage: "offense",
  critical: "offense",
  area_damage: "offense",
  shield: "protection",
  heal: "protection",
  area_heal: "protection",
  invincible: "protection",
  buff: "protection",
  control: "control",
  area_control: "control",
  cleave_passive: "passive",
  charge_strike_passive: "passive",
  lifesteal_passive: "passive",
  growth_passive: "passive",
  revive_passive: "passive",
  assassin_passive: "passive",
};

const SKILL_GLYPHS: Record<SkillType, ReactNode> = {
  damage: <><path d="m5 19 14-14" /><path d="m12.4 4.6 7 7" /><path d="m5.1 12.8 6.1 6.1" /></>,
  critical: <><path d="m12 2.9 1.88 5.62L19.5 10l-5.62 1.88L12 17.5l-1.88-5.62L4.5 10l5.62-1.48L12 2.9Z" /><path d="m15.2 15.4 3.1 3.1" /></>,
  area_damage: <><circle cx="12" cy="12" r="7.8" /><path d="m12 5.1 1.65 5.25L18.9 12l-5.25 1.65L12 18.9l-1.65-5.25L5.1 12l5.25-1.65L12 5.1Z" /></>,
  shield: <path d="M12 3.25 18 5.7v4.62c0 4.16-2.5 7.85-6 9.43-3.5-1.58-6-5.27-6-9.43V5.7L12 3.25Z" />,
  heal: <><circle cx="12" cy="12" r="8" /><path d="M12 7.4v9.2M7.4 12h9.2" /></>,
  area_heal: <><circle cx="8" cy="12" r="3.3" /><circle cx="16" cy="12" r="3.3" /><path d="M12 5.2v4.1M9.95 7.25h4.1" /></>,
  control: <><circle cx="12" cy="12" r="7.8" /><path d="M8.4 8.4l7.2 7.2M15.6 8.4l-7.2 7.2" /></>,
  area_control: <><circle cx="12" cy="12" r="8.1" /><circle cx="8.4" cy="9.2" r="1.15" /><circle cx="15.6" cy="9.2" r="1.15" /><path d="M8.2 15.3h7.6" /></>,
  invincible: <><path d="M12 3.25 18 5.7v4.62c0 4.16-2.5 7.85-6 9.43-3.5-1.58-6-5.27-6-9.43V5.7L12 3.25Z" /><path d="m8.1 11.8 2.45 2.45 5.35-5.35" /></>,
  cleave_passive: <><path d="M4.2 17.4c4.2-8.45 10.9-10.4 15.6-8.7" /><path d="m5.2 20 3.5-2.6" /><path d="m18.8 5.2 1 3.5" /></>,
  charge_strike_passive: <><path d="M12 3.5v8.7l4.3 2.5" /><circle cx="12" cy="12" r="8.3" /><path d="m18.2 18.2 2.3 2.3" /></>,
  lifesteal_passive: <><path d="M12 20.2S5.1 16.5 5.1 10.4c0-2.25 1.62-3.9 3.75-3.9 1.42 0 2.56.72 3.15 1.78.59-1.06 1.73-1.78 3.15-1.78 2.13 0 3.75 1.65 3.75 3.9 0 6.1-6.9 9.8-6.9 9.8Z" /><path d="M12 9.1v5.1M9.45 11.65h5.1" /></>,
  growth_passive: <><path d="M5.1 18.5h13.8" /><path d="M7.2 16.3V12M12 16.3V8.4M16.8 16.3V4.7" /><path d="m14.5 7 2.3-2.3L19.1 7" /></>,
  revive_passive: <><path d="M19 11.9a7 7 0 1 1-1.65-4.55" /><path d="M19 4.9v4.25h-4.25" /><path d="M12 8.7v6.6M8.7 12h6.6" /></>,
  assassin_passive: <><path d="m13.9 3.4 2.7 2.7-7.95 7.95-3.25.55.55-3.25L13.9 3.4Z" /><path d="m14.9 2.4 2.7 2.7" /><path d="m4.5 19.5 4.2-4.2" /></>,
  buff: <><path d="m12 3.1 1.55 4.85L18.4 9.5l-4.85 1.55L12 15.9l-1.55-4.85L5.6 9.5l4.85-1.55L12 3.1Z" /><path d="M6.5 17.5h11" /></>,
};

export function SkillIcon({
  type,
  compact = false,
}: {
  type: SkillType;
  compact?: boolean;
}) {
  return (
    <span
      className={`skill-icon skill-icon-${SKILL_ICON_TONES[type]}${compact ? " is-compact" : ""}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" focusable="false">
        {SKILL_GLYPHS[type]}
      </svg>
    </span>
  );
}
