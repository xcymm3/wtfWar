import type { CombatantState } from "./state";

function assertKnownSkill(
  combatant: CombatantState,
  skillId: string,
): void {
  if (!(skillId in combatant.cooldowns)) {
    throw new Error(`Skill ${skillId} does not belong to this combatant.`);
  }
}

export function isSkillAvailable(
  combatant: CombatantState,
  skillId: string,
): boolean {
  assertKnownSkill(combatant, skillId);
  return combatant.cooldowns[skillId] === 0;
}

export function setSkillCooldown(
  combatant: CombatantState,
  skillId: string,
  cooldown: number,
): CombatantState {
  assertKnownSkill(combatant, skillId);

  if (!Number.isInteger(cooldown) || cooldown < 0) {
    throw new RangeError("Skill cooldown must be a non-negative integer.");
  }

  return {
    ...combatant,
    cooldowns: {
      ...combatant.cooldowns,
      [skillId]: cooldown,
    },
  };
}

/**
 * Advances cooldowns by one of the combatant's action opportunities.
 * The battle controller must call this before skill selection, even after stun.
 */
export function advanceCooldowns(combatant: CombatantState): CombatantState {
  return {
    ...combatant,
    cooldowns: Object.fromEntries(
      Object.entries(combatant.cooldowns).map(([skillId, cooldown]) => [
        skillId,
        Math.max(0, cooldown - 1),
      ]),
    ),
  };
}
