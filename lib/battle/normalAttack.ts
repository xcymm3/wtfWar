import type { BattleEvent, BattleSide } from "@/types/battle";

import { applyDamage } from "./damage";
import {
  getCombatant,
  getOpponentSide,
  type BattleRuntimeState,
} from "./state";

function createNormalAttackNarration({
  attackerName,
  defenderName,
  rawDamage,
  shieldAbsorbed,
  healthDamage,
}: {
  attackerName: string;
  defenderName: string;
  rawDamage: number;
  shieldAbsorbed: number;
  healthDamage: number;
}): string {
  const outcomes = [`造成 ${rawDamage} 点固定伤害`];

  if (shieldAbsorbed > 0) {
    outcomes.push(`其中 ${shieldAbsorbed} 点被护盾吸收`);
  }

  if (healthDamage > 0) {
    outcomes.push(`${defenderName} 失去 ${healthDamage} 点生命`);
  } else {
    outcomes.push(`${defenderName} 未损失生命`);
  }

  return `${attackerName} 发动普通攻击，${outcomes.join("，")}。`;
}

export function resolveNormalAttack(
  state: BattleRuntimeState,
  actor: BattleSide,
): BattleRuntimeState {
  const target = getOpponentSide(actor);
  const attackerState = getCombatant(state, actor);
  const defenderState = getCombatant(state, target);

  if (attackerState.health <= 0 || defenderState.health <= 0) {
    throw new Error("A defeated combatant cannot take part in an attack.");
  }

  const resolution = applyDamage(
    defenderState,
    attackerState.effectiveStats.attack,
  );
  const event: BattleEvent = {
    round: state.round,
    actor,
    target,
    skill: null,
    rawDamage: resolution.rawDamage,
    damage: resolution.healthDamage,
    shieldAbsorbed: resolution.shieldAbsorbed,
    healing: 0,
    shieldGranted: 0,
    targetStunned: false,
    actorHealth: attackerState.health,
    targetHealth: resolution.target.health,
    actorShield: attackerState.shield,
    targetShield: resolution.target.shield,
    actorCooldowns: { ...attackerState.cooldowns },
    targetCooldowns: { ...resolution.target.cooldowns },
    actorIsStunned: attackerState.isStunned,
    targetIsStunned: resolution.target.isStunned,
    narration: createNormalAttackNarration({
      attackerName: attackerState.character.name,
      defenderName: defenderState.character.name,
      rawDamage: resolution.rawDamage,
      shieldAbsorbed: resolution.shieldAbsorbed,
      healthDamage: resolution.healthDamage,
    }),
  };

  return {
    ...state,
    [target]: resolution.target,
    events: [...state.events, event],
  };
}
