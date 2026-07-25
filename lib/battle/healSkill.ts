import type { BattleEvent, BattleSide } from "@/types/battle";
import type { Skill } from "@/types/character";

import { isSkillAvailable, setSkillCooldown } from "./cooldown";
import { applyHealing } from "./heal";
import { scaleSkillAmountByRealm } from "./realm";
import { getCombatant, type BattleRuntimeState } from "./state";

type HealSkill = Skill & {
  type: "heal";
  healAmount: number;
};

function getHealSkill(skill: Skill | undefined, skillId: string): HealSkill {
  if (!skill) {
    throw new Error(`Skill ${skillId} does not belong to this combatant.`);
  }

  if (skill.type !== "heal" || skill.healAmount === undefined) {
    throw new Error(`Skill ${skillId} is not a valid heal skill.`);
  }

  return skill as HealSkill;
}

function createHealSkillNarration({
  actorName,
  skill,
  healing,
}: {
  actorName: string;
  skill: HealSkill;
  healing: number;
}): string {
  if (healing === 0) {
    return `${actorName} 使用 ${skill.name}，但生命值已满。`;
  }

  return `${actorName} 使用 ${skill.name}，恢复 ${healing} 点生命。`;
}

export function resolveHealSkill(
  state: BattleRuntimeState,
  actor: BattleSide,
  skillId: string,
): BattleRuntimeState {
  const actorState = getCombatant(state, actor);

  if (actorState.health <= 0) {
    throw new Error("A defeated combatant cannot use a heal skill.");
  }

  const skill = getHealSkill(
    actorState.character.skills.find((candidate) => candidate.id === skillId),
    skillId,
  );

  if (!isSkillAvailable(actorState, skill.id)) {
    throw new Error(`Skill ${skill.name} is still on cooldown.`);
  }

  const healResolution = applyHealing(
    actorState,
    scaleSkillAmountByRealm(actorState.character, skill.healAmount),
  );
  const actorAfterSkill = setSkillCooldown(
    healResolution.target,
    skill.id,
    skill.cooldown,
  );
  const event: BattleEvent = {
    round: state.round,
    actor,
    target: actor,
    skill: { id: skill.id, name: skill.name, type: skill.type },
    rawDamage: 0,
    damage: 0,
    shieldAbsorbed: 0,
    healing: healResolution.healing,
    shieldGranted: 0,
    targetStunned: false,
    actorHealth: actorAfterSkill.health,
    targetHealth: actorAfterSkill.health,
    actorShield: actorAfterSkill.shield,
    targetShield: actorAfterSkill.shield,
    actorCooldowns: { ...actorAfterSkill.cooldowns },
    targetCooldowns: { ...actorAfterSkill.cooldowns },
    actorIsStunned: actorAfterSkill.isStunned,
    targetIsStunned: actorAfterSkill.isStunned,
    narration: createHealSkillNarration({
      actorName: actorState.character.name,
      skill,
      healing: healResolution.healing,
    }),
  };

  return {
    ...state,
    [actor]: actorAfterSkill,
    events: [...state.events, event],
  };
}
