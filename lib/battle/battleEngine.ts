import type { BattleAction, BattleEvent, BattleSide } from "@/types/battle";

import { BATTLE_RULES } from "./constants";
import { advanceCooldowns } from "./cooldown";
import { consumeStun } from "./control";
import { resolveControlSkill } from "./controlSkill";
import { resolveDamageSkill } from "./damageSkill";
import { resolveHealSkill } from "./healSkill";
import { resolveNormalAttack } from "./normalAttack";
import { createSeededRandom, type SeededRandom } from "./random";
import { resolveShieldSkill } from "./shieldSkill";
import {
  createInitialBattleState,
  getCombatant,
  type BattleRuntimeState,
  type BattleWinner,
  type CreateBattleStateInput,
} from "./state";
import { chooseBattleAction } from "./strategy";

export type SimulateBattleInput = CreateBattleStateInput;

function getKnockoutWinner(state: BattleRuntimeState): BattleWinner | null {
  const leftDefeated = state.left.health <= 0;
  const rightDefeated = state.right.health <= 0;

  if (leftDefeated && rightDefeated) return "draw";
  if (leftDefeated) return "right";
  if (rightDefeated) return "left";

  return null;
}

function getTimeoutWinner(state: BattleRuntimeState): BattleWinner {
  const leftHealthRatio =
    state.left.health * state.right.effectiveStats.maxHealth;
  const rightHealthRatio =
    state.right.health * state.left.effectiveStats.maxHealth;

  if (leftHealthRatio > rightHealthRatio) return "left";
  if (rightHealthRatio > leftHealthRatio) return "right";
  if (state.left.health > state.right.health) return "left";
  if (state.right.health > state.left.health) return "right";

  return "draw";
}

function finishBattle(
  state: BattleRuntimeState,
  winner: BattleWinner,
): BattleRuntimeState {
  return {
    ...state,
    status: "finished",
    winner,
  };
}

function createTurnOrder(random: SeededRandom): BattleSide[] {
  const firstActor = random.pick<BattleSide>(["left", "right"]);

  return firstActor === "left" ? ["left", "right"] : ["right", "left"];
}

function appendStunSkipEvent(
  state: BattleRuntimeState,
  actor: BattleSide,
): BattleRuntimeState {
  const actorState = getCombatant(state, actor);
  const event: BattleEvent = {
    round: state.round,
    actor,
    target: actor,
    skill: null,
    rawDamage: 0,
    damage: 0,
    shieldAbsorbed: 0,
    healing: 0,
    shieldGranted: 0,
    targetStunned: false,
    actorHealth: actorState.health,
    targetHealth: actorState.health,
    actorShield: actorState.shield,
    targetShield: actorState.shield,
    actorCooldowns: { ...actorState.cooldowns },
    targetCooldowns: { ...actorState.cooldowns },
    actorIsStunned: actorState.isStunned,
    targetIsStunned: actorState.isStunned,
    narration: `${actorState.character.name} 处于眩晕状态，跳过本次行动。`,
  };

  return {
    ...state,
    events: [...state.events, event],
  };
}

function resolveSkillAction(
  state: BattleRuntimeState,
  actor: BattleSide,
  skillId: string,
  random: SeededRandom,
): BattleRuntimeState {
  const skill = getCombatant(state, actor).character.skills.find(
    (candidate) => candidate.id === skillId,
  );

  if (!skill) {
    throw new Error(`Skill ${skillId} does not belong to this combatant.`);
  }

  switch (skill.type) {
    case "damage":
      return resolveDamageSkill(state, actor, skillId, random);
    case "shield":
      return resolveShieldSkill(state, actor, skillId);
    case "heal":
      return resolveHealSkill(state, actor, skillId);
    case "control":
      return resolveControlSkill(state, actor, skillId, random);
    case "area_damage":
    case "area_heal":
      throw new Error("Team active skills require the v2 battle engine.");
    case "cleave_passive":
    case "charge_strike_passive":
      throw new Error("Passive skills are resolved by the v2 battle engine.");
    case "buff":
      throw new Error("Buff skills are not supported in the Beta battle engine.");
  }
}

function resolveAction(
  state: BattleRuntimeState,
  actor: BattleSide,
  action: BattleAction,
  random: SeededRandom,
): BattleRuntimeState {
  if (action.type === "normal_attack") {
    return resolveNormalAttack(state, actor);
  }

  return resolveSkillAction(state, actor, action.skillId, random);
}

function resolveActionOpportunity(
  state: BattleRuntimeState,
  actor: BattleSide,
  random: SeededRandom,
): BattleRuntimeState {
  const actorState = getCombatant(state, actor);
  const stateWithCooldowns = {
    ...state,
    [actor]: advanceCooldowns(actorState),
  };
  const stunConsumption = consumeStun(getCombatant(stateWithCooldowns, actor));
  const stateAfterStunConsumption = {
    ...stateWithCooldowns,
    [actor]: stunConsumption.target,
  };

  if (stunConsumption.actionSkipped) {
    return appendStunSkipEvent(stateAfterStunConsumption, actor);
  }

  return resolveAction(
    stateAfterStunConsumption,
    actor,
    chooseBattleAction(stateAfterStunConsumption, actor, random),
    random,
  );
}

/**
 * Simulates a complete 1v1 battle. Identical input characters and seed always
 * produce the same terminal state and event log.
 */
export function simulateBattle(input: SimulateBattleInput): BattleRuntimeState {
  const random = createSeededRandom(input.seed);
  let state: BattleRuntimeState = {
    ...createInitialBattleState(input),
    status: "in_progress",
  };

  for (let round = 1; round <= BATTLE_RULES.maxRounds; round += 1) {
    const turnOrder = createTurnOrder(random);
    state = {
      ...state,
      round,
      turnOrder,
      actionIndex: 0,
    };

    for (let actionIndex = 0; actionIndex < turnOrder.length; actionIndex += 1) {
      const knockoutWinner = getKnockoutWinner(state);
      if (knockoutWinner) return finishBattle(state, knockoutWinner);

      const actor = turnOrder[actionIndex];
      state = {
        ...state,
        actionIndex,
      };
      state = resolveActionOpportunity(state, actor, random);

      const winnerAfterAction = getKnockoutWinner(state);
      if (winnerAfterAction) return finishBattle(state, winnerAfterAction);
    }
  }

  return finishBattle(state, getTimeoutWinner(state));
}
