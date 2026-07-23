import type { CombatantState } from "./state";

export type DamageResolution = {
  target: CombatantState;
  rawDamage: number;
  shieldAbsorbed: number;
  healthDamage: number;
};

export function applyDamage(
  target: CombatantState,
  rawDamage: number,
): DamageResolution {
  if (!Number.isInteger(rawDamage) || rawDamage < 0) {
    throw new RangeError("Damage must be a non-negative integer.");
  }

  const shieldAbsorbed = Math.min(target.shield, rawDamage);
  const healthDamage = rawDamage - shieldAbsorbed;

  return {
    target: {
      ...target,
      shield: target.shield - shieldAbsorbed,
      health: Math.max(0, target.health - healthDamage),
    },
    rawDamage,
    shieldAbsorbed,
    healthDamage,
  };
}
