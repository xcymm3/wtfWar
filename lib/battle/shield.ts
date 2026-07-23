import { BATTLE_RULES } from "./constants";
import type { CombatantState } from "./state";

export type ShieldResolution = {
  target: CombatantState;
  requestedShield: number;
  shieldGranted: number;
};

export function applyShield(
  target: CombatantState,
  requestedShield: number,
): ShieldResolution {
  if (!Number.isInteger(requestedShield) || requestedShield <= 0) {
    throw new RangeError("Shield amount must be a positive integer.");
  }

  if (target.shield < 0 || target.shield > BATTLE_RULES.maxShield) {
    throw new RangeError("Combatant shield is outside the allowed range.");
  }

  const nextShield = Math.min(
    BATTLE_RULES.maxShield,
    target.shield + requestedShield,
  );

  return {
    target: {
      ...target,
      shield: nextShield,
    },
    requestedShield,
    shieldGranted: nextShield - target.shield,
  };
}
