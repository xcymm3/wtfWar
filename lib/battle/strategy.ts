import type { BattleAction, BattleSide } from "@/types/battle";
import type { Skill } from "@/types/character";

import { BATTLE_RULES } from "./constants";
import { isSkillAvailable } from "./cooldown";
import type { SeededRandom } from "./random";
import {
  getCombatant,
  getOpponentSide,
  type BattleRuntimeState,
} from "./state";

const LOW_HEALTH_RATIO = 0.35;

function selectHighestValueSkill(
  skills: Skill[],
  getValue: (skill: Skill) => number,
  random: SeededRandom,
): Skill | null {
  if (skills.length === 0) return null;

  const highestValue = Math.max(...skills.map(getValue));
  const highestValueSkills = skills.filter(
    (skill) => getValue(skill) === highestValue,
  );

  return highestValueSkills.length === 1
    ? highestValueSkills[0]
    : random.pick(highestValueSkills);
}

function createSkillAction(skill: Skill): BattleAction {
  return { type: "skill", skillId: skill.id };
}

export function chooseBattleAction(
  state: BattleRuntimeState,
  actor: BattleSide,
  random: SeededRandom,
): BattleAction {
  const target = getOpponentSide(actor);
  const actorState = getCombatant(state, actor);
  const targetState = getCombatant(state, target);

  if (actorState.health <= 0 || targetState.health <= 0) {
    throw new Error("Only living combatants can choose a battle action.");
  }

  const availableSkills = actorState.character.skills.filter((skill) =>
    skill.activation !== "passive" && isSkillAvailable(actorState, skill.id),
  );

  if (
    actorState.health <= actorState.effectiveStats.maxHealth * LOW_HEALTH_RATIO
  ) {
    const healSkill = selectHighestValueSkill(
      availableSkills.filter((skill) => skill.type === "heal"),
      (skill) => skill.healAmount ?? 0,
      random,
    );
    if (healSkill) return createSkillAction(healSkill);

    if (actorState.shield < BATTLE_RULES.maxShield) {
      const shieldSkill = selectHighestValueSkill(
        availableSkills.filter((skill) => skill.type === "shield"),
        (skill) => skill.shieldAmount ?? 0,
        random,
      );
      if (shieldSkill) return createSkillAction(shieldSkill);
    }
  }

  const damageSkill = selectHighestValueSkill(
    availableSkills.filter((skill) => skill.type === "damage"),
    (skill) => skill.damageMultiplier ?? 0,
    random,
  );

  if (targetState.health <= actorState.effectiveStats.attack * 2 && damageSkill) {
    return createSkillAction(damageSkill);
  }

  if (damageSkill) return createSkillAction(damageSkill);

  if (!targetState.isStunned) {
    const controlSkill = selectHighestValueSkill(
      availableSkills.filter((skill) => skill.type === "control"),
      (skill) => skill.stunChance ?? 0,
      random,
    );
    if (controlSkill) return createSkillAction(controlSkill);
  }

  return { type: "normal_attack" };
}
