import type { BattleEvent, BattleSide } from "@/types/battle";
import type { Skill } from "@/types/character";

import { isSkillAvailable, setSkillCooldown } from "./cooldown";
import { scaleSkillAmountByRealm } from "./realm";
import { applyShield } from "./shield";
import { getCombatant, type BattleRuntimeState } from "./state";

type ShieldSkill = Skill & {
  type: "shield";
  shieldAmount: number;
};

function getShieldSkill(
  skill: Skill | undefined,
  skillId: string,
): ShieldSkill {
  if (!skill) {
    throw new Error(`Skill ${skillId} does not belong to this combatant.`);
  }

  if (skill.type !== "shield" || skill.shieldAmount === undefined) {
    throw new Error(`Skill ${skillId} is not a valid shield skill.`);
  }

  return skill as ShieldSkill;
}

function createShieldSkillNarration({
  actorName,
  skill,
  shieldGranted,
}: {
  actorName: string;
  skill: ShieldSkill;
  shieldGranted: number;
}): string {
  if (shieldGranted === 0) {
    return `${actorName} 使用 ${skill.name}，但护盾已达到上限。`;
  }

  return `${actorName} 使用 ${skill.name}，获得 ${shieldGranted} 点护盾。`;
}

export function resolveShieldSkill(
  state: BattleRuntimeState,
  actor: BattleSide,
  skillId: string,
): BattleRuntimeState {
  const actorState = getCombatant(state, actor);

  if (actorState.health <= 0) {
    throw new Error("A defeated combatant cannot use a shield skill.");
  }

  const skill = getShieldSkill(
    actorState.character.skills.find((candidate) => candidate.id === skillId),
    skillId,
  );

  if (!isSkillAvailable(actorState, skill.id)) {
    throw new Error(`Skill ${skill.name} is still on cooldown.`);
  }

  const shieldResolution = applyShield(
    actorState,
    scaleSkillAmountByRealm(actorState.character, skill.shieldAmount),
  );
  const actorAfterSkill = setSkillCooldown(
    shieldResolution.target,
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
    healing: 0,
    shieldGranted: shieldResolution.shieldGranted,
    targetStunned: false,
    actorHealth: actorAfterSkill.health,
    targetHealth: actorAfterSkill.health,
    actorShield: actorAfterSkill.shield,
    targetShield: actorAfterSkill.shield,
    actorCooldowns: { ...actorAfterSkill.cooldowns },
    targetCooldowns: { ...actorAfterSkill.cooldowns },
    actorIsStunned: actorAfterSkill.isStunned,
    targetIsStunned: actorAfterSkill.isStunned,
    narration: createShieldSkillNarration({
      actorName: actorState.character.name,
      skill,
      shieldGranted: shieldResolution.shieldGranted,
    }),
  };

  return {
    ...state,
    [actor]: actorAfterSkill,
    events: [...state.events, event],
  };
}
