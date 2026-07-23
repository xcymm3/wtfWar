import type { CombatantState } from "./state";

export type StunResolution = {
  target: CombatantState;
  targetStunned: boolean;
};

export type StunConsumption = {
  target: CombatantState;
  actionSkipped: boolean;
};

export function applyStun(
  target: CombatantState,
  targetStunned: boolean,
): StunResolution {
  return {
    target: {
      ...target,
      isStunned: target.isStunned || targetStunned,
    },
    targetStunned,
  };
}

/**
 * Consumes the target's pending stun at the beginning of its action opportunity.
 */
export function consumeStun(target: CombatantState): StunConsumption {
  if (!target.isStunned) {
    return { target, actionSkipped: false };
  }

  return {
    target: {
      ...target,
      isStunned: false,
    },
    actionSkipped: true,
  };
}
