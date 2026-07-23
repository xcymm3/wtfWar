import type { CombatantState } from "./state";

export type HealResolution = {
  target: CombatantState;
  requestedHealing: number;
  healing: number;
};

export function applyHealing(
  target: CombatantState,
  requestedHealing: number,
): HealResolution {
  if (!Number.isInteger(requestedHealing) || requestedHealing <= 0) {
    throw new RangeError("Healing amount must be a positive integer.");
  }

  if (target.health < 0 || target.health > target.effectiveStats.maxHealth) {
    throw new RangeError("Combatant health is outside the allowed range.");
  }

  const nextHealth = Math.min(
    target.effectiveStats.maxHealth,
    target.health + requestedHealing,
  );

  return {
    target: {
      ...target,
      health: nextHealth,
    },
    requestedHealing,
    healing: nextHealth - target.health,
  };
}
