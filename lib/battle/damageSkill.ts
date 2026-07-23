import type { BattleEvent, BattleSide } from "@/types/battle";
import type { Skill } from "@/types/character";

import { BATTLE_RULES } from "./constants";
import { isSkillAvailable, setSkillCooldown } from "./cooldown";
import { applyDamage } from "./damage";
import type { SeededRandom } from "./random";
import {
  getCombatant,
  getOpponentSide,
  type BattleRuntimeState,
} from "./state";

type DamageSkill = Skill & {
  type: "damage";
  damageMultiplier: number;
};

function getDamageSkill(
  skill: Skill | undefined,
  skillId: string,
): DamageSkill {
  if (!skill) {
    throw new Error(`Skill ${skillId} does not belong to this combatant.`);
  }

  if (skill.type !== "damage" || skill.damageMultiplier === undefined) {
    throw new Error(`Skill ${skillId} is not a valid damage skill.`);
  }

  return skill;
}

export function calculateDamageSkillDamage(
  attack: number,
  damageMultiplier: number,
  random: SeededRandom,
): number {
  if (!Number.isInteger(attack) || attack <= 0) {
    throw new RangeError("Attack must be a positive integer.");
  }

  if (
    !Number.isFinite(damageMultiplier) ||
    damageMultiplier < BATTLE_RULES.minDamageMultiplier ||
    damageMultiplier > BATTLE_RULES.maxDamageMultiplier
  ) {
    throw new RangeError("Damage multiplier is outside the allowed range.");
  }

  const randomMultiplier =
    BATTLE_RULES.minDamageRandomMultiplier +
    random.next() *
      (BATTLE_RULES.maxDamageRandomMultiplier -
        BATTLE_RULES.minDamageRandomMultiplier);

  return Math.max(1, Math.floor(attack * damageMultiplier * randomMultiplier));
}

function createDamageSkillNarration({
  attackerName,
  defenderName,
  skill,
  rawDamage,
  shieldAbsorbed,
  healthDamage,
}: {
  attackerName: string;
  defenderName: string;
  skill: Skill;
  rawDamage: number;
  shieldAbsorbed: number;
  healthDamage: number;
}): string {
  const outcomes = [`造成 ${rawDamage} 点伤害`];

  if (shieldAbsorbed > 0) {
    outcomes.push(`其中 ${shieldAbsorbed} 点被护盾吸收`);
  }

  if (healthDamage > 0) {
    outcomes.push(`${defenderName} 失去 ${healthDamage} 点生命`);
  } else {
    outcomes.push(`${defenderName} 未损失生命`);
  }

  return `${attackerName} 使用 ${skill.name}，${outcomes.join("，")}。`;
}

export function resolveDamageSkill(
  state: BattleRuntimeState,
  actor: BattleSide,
  skillId: string,
  random: SeededRandom,
): BattleRuntimeState {
  const target = getOpponentSide(actor);
  const attackerState = getCombatant(state, actor);
  const defenderState = getCombatant(state, target);

  if (attackerState.health <= 0 || defenderState.health <= 0) {
    throw new Error("A defeated combatant cannot take part in an attack.");
  }

  const skill = getDamageSkill(
    attackerState.character.skills.find((candidate) => candidate.id === skillId),
    skillId,
  );

  if (!isSkillAvailable(attackerState, skill.id)) {
    throw new Error(`Skill ${skill.name} is still on cooldown.`);
  }

  const rawDamage = calculateDamageSkillDamage(
    attackerState.effectiveStats.attack,
    skill.damageMultiplier,
    random,
  );
  const resolution = applyDamage(defenderState, rawDamage);
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
    rawDamage: resolution.rawDamage,
    damage: resolution.healthDamage,
    shieldAbsorbed: resolution.shieldAbsorbed,
    healing: 0,
    shieldGranted: 0,
    targetStunned: false,
    actorHealth: attackerAfterSkill.health,
    targetHealth: resolution.target.health,
    actorShield: attackerAfterSkill.shield,
    targetShield: resolution.target.shield,
    actorCooldowns: { ...attackerAfterSkill.cooldowns },
    targetCooldowns: { ...resolution.target.cooldowns },
    actorIsStunned: attackerAfterSkill.isStunned,
    targetIsStunned: resolution.target.isStunned,
    narration: createDamageSkillNarration({
      attackerName: attackerState.character.name,
      defenderName: defenderState.character.name,
      skill,
      rawDamage: resolution.rawDamage,
      shieldAbsorbed: resolution.shieldAbsorbed,
      healthDamage: resolution.healthDamage,
    }),
  };

  return {
    ...state,
    [actor]: attackerAfterSkill,
    [target]: resolution.target,
    events: [...state.events, event],
  };
}
