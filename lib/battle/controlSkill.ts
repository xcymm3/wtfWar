import type { BattleEvent, BattleSide } from "@/types/battle";
import type { Skill } from "@/types/character";

import { isSkillAvailable, setSkillCooldown } from "./cooldown";
import { applyStun } from "./control";
import type { SeededRandom } from "./random";
import {
  getCombatant,
  getOpponentSide,
  type BattleRuntimeState,
} from "./state";

type ControlSkill = Skill & {
  type: "control";
  stunChance: number;
};

function getControlSkill(
  skill: Skill | undefined,
  skillId: string,
): ControlSkill {
  if (!skill) {
    throw new Error(`Skill ${skillId} does not belong to this combatant.`);
  }

  if (skill.type !== "control" || skill.stunChance === undefined) {
    throw new Error(`Skill ${skillId} is not a valid control skill.`);
  }

  return skill as ControlSkill;
}

function createControlSkillNarration({
  attackerName,
  defenderName,
  skill,
  targetStunned,
}: {
  attackerName: string;
  defenderName: string;
  skill: ControlSkill;
  targetStunned: boolean;
}): string {
  if (targetStunned) {
    return `${attackerName} 使用 ${skill.name}，${defenderName} 陷入眩晕，下次行动将跳过。`;
  }

  return `${attackerName} 使用 ${skill.name}，但未能使 ${defenderName} 眩晕。`;
}

export function resolveControlSkill(
  state: BattleRuntimeState,
  actor: BattleSide,
  skillId: string,
  random: SeededRandom,
): BattleRuntimeState {
  const target = getOpponentSide(actor);
  const attackerState = getCombatant(state, actor);
  const defenderState = getCombatant(state, target);

  if (attackerState.health <= 0 || defenderState.health <= 0) {
    throw new Error("A defeated combatant cannot take part in a control action.");
  }

  const skill = getControlSkill(
    attackerState.character.skills.find((candidate) => candidate.id === skillId),
    skillId,
  );

  if (!isSkillAvailable(attackerState, skill.id)) {
    throw new Error(`Skill ${skill.name} is still on cooldown.`);
  }

  const stunResolution = applyStun(
    defenderState,
    random.chance(skill.stunChance),
  );
  const attackerAfterSkill = setSkillCooldown(
    attackerState,
    skill.id,
    skill.cooldown,
  );
  const event: BattleEvent = {
    round: state.round,
    actor,
    target,
    skill: { id: skill.id, name: skill.name, type: skill.type },
    rawDamage: 0,
    damage: 0,
    shieldAbsorbed: 0,
    healing: 0,
    shieldGranted: 0,
    targetStunned: stunResolution.targetStunned,
    actorHealth: attackerAfterSkill.health,
    targetHealth: stunResolution.target.health,
    actorShield: attackerAfterSkill.shield,
    targetShield: stunResolution.target.shield,
    actorCooldowns: { ...attackerAfterSkill.cooldowns },
    targetCooldowns: { ...stunResolution.target.cooldowns },
    actorIsStunned: attackerAfterSkill.isStunned,
    targetIsStunned: stunResolution.target.isStunned,
    narration: createControlSkillNarration({
      attackerName: attackerState.character.name,
      defenderName: defenderState.character.name,
      skill,
      targetStunned: stunResolution.targetStunned,
    }),
  };

  return {
    ...state,
    [actor]: attackerAfterSkill,
    [target]: stunResolution.target,
    events: [...state.events, event],
  };
}
