import type { Profession } from "@/types/character";

export type AttributeRange = {
  min: number;
  max: number;
};

export type ProfessionStatRange = {
  attack: AttributeRange;
  maxHealth: AttributeRange;
};

/** Profession ranges from docs/battle-rules.md. */
export const PROFESSION_STAT_RANGES: Record<Profession, ProfessionStatRange> = {
  tank: {
    attack: { min: 5, max: 15 },
    maxHealth: { min: 145, max: 180 },
  },
  warrior: {
    attack: { min: 14, max: 22 },
    maxHealth: { min: 120, max: 160 },
  },
  mage: {
    attack: { min: 13, max: 23 },
    maxHealth: { min: 95, max: 130 },
  },
  assassin: {
    attack: { min: 16, max: 25 },
    maxHealth: { min: 105, max: 145 },
  },
  ranger: {
    attack: { min: 20, max: 30 },
    maxHealth: { min: 85, max: 120 },
  },
};

export function getRangeMidpoint(range: AttributeRange): number {
  return Math.round((range.min + range.max) / 2);
}
