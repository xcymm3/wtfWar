import type {
  BattleAction,
  BattleSide,
  TeamBattleEvent,
  TeamBattlePreparation,
  TeamBattleTargetResult,
} from "@/types/battle";
import type { Skill } from "@/types/character";

import { BATTLE_RULES } from "./constants";
import { advanceCooldowns, isSkillAvailable, setSkillCooldown } from "./cooldown";
import { applyStun, consumeStun } from "./control";
import { applyDamage } from "./damage";
import { calculateDamageSkillDamage } from "./damageSkill";
import { applyHealing } from "./heal";
import { createSeededRandom, type SeededRandom } from "./random";
import { getEffectiveCombatStats, scaleSkillAmountByRealm } from "./realm";
import { applyShield } from "./shield";
import { getSkillUsageText } from "./skillUsageText";
import {
  createCombatantState,
  type BattleStatus,
  type BattleWinner,
  type CombatantState,
} from "./state";

const LOW_HEALTH_RATIO = 0.35;

type DamageSkill = Skill & { type: "damage"; damageMultiplier: number };
type AreaDamageSkill = Skill & {
  type: "area_damage";
  damageMultiplier: number;
};
type ShieldSkill = Skill & { type: "shield"; shieldAmount: number };
type HealSkill = Skill & { type: "heal"; healAmount: number };
type AreaHealSkill = Skill & { type: "area_heal"; healAmount: number };
type ControlSkill = Skill & { type: "control"; stunChance: number };
type CriticalSkill = Skill & { type: "critical"; damageMultiplier: number };
type AreaControlSkill = Skill & { type: "area_control"; stunChance: number };
type InvincibleSkill = Skill & { type: "invincible" };
type CleavePassiveSkill = Skill & { type: "cleave_passive" };
type ChargeStrikePassiveSkill = Skill & {
  type: "charge_strike_passive";
  chargeTurns: number;
};
type DamageResolution = {
  target: CombatantState;
  rawDamage: number;
  healthDamage: number;
  shieldAbsorbed: number;
  targetInvincible: boolean;
  targetRevived: boolean;
};

export type TeamBattleRuntimeState = {
  rulesVersion: 2;
  seed: string;
  status: BattleStatus;
  round: number;
  turnOrder: BattleSide[];
  actionIndex: number;
  left: CombatantState[];
  right: CombatantState[];
  winner: BattleWinner | null;
  events: TeamBattleEvent[];
};

function getOpponentSide(side: BattleSide): BattleSide {
  return side === "left" ? "right" : "left";
}

function applyDamageWithInvincibility(target: CombatantState, amount: number): DamageResolution {
  if (target.isInvincible) {
    return {
      target,
      rawDamage: amount,
      healthDamage: 0,
      shieldAbsorbed: 0,
      targetInvincible: true,
      targetRevived: false,
    };
  }
  const resolution = applyDamage(target, amount);
  if (resolution.target.health > 0 || target.hasRevived || !getPassive(target, "revive_passive")) {
    return { ...resolution, targetInvincible: false, targetRevived: false };
  }
  const revived = { ...resolution.target, health: Math.floor(target.effectiveStats.maxHealth / 2), hasRevived: true };
  return {
    ...resolution,
    target: revived,
    healthDamage: target.health,
    targetInvincible: false,
    targetRevived: true,
  };
}

function getPassive(combatant: CombatantState, type: Skill["type"]): Skill | undefined {
  return combatant.character.skills.find((skill) => skill.type === type);
}

function applyGrowth(state: TeamBattleRuntimeState, side: BattleSide, id: string): TeamBattleRuntimeState {
  const actor = getCombatant(state, side, id);
  const skill = getPassive(actor, "growth_passive");
  if (!skill?.damageMultiplier) return state;
  const multiplier = Math.min(skill.damageMultiplier, BATTLE_RULES.maxGrowthMultiplier);
  const baseAttack = getEffectiveCombatStats(actor.character).attack;
  const attack = actor.effectiveStats.attack + Math.max(1, Math.floor(baseAttack * multiplier));
  return replaceCombatant(state, side, id, { ...actor, effectiveStats: { ...actor.effectiveStats, attack } });
}

function applyLifesteal(
  state: TeamBattleRuntimeState,
  side: BattleSide,
  id: string,
): { state: TeamBattleRuntimeState; healing: number } {
  const actor = getCombatant(state, side, id);
  const skill = getPassive(actor, "lifesteal_passive");
  if (!skill?.damageMultiplier) return { state, healing: 0 };

  const healed = applyHealing(
    actor,
    Math.floor(actor.effectiveStats.attack * skill.damageMultiplier),
  );
  return {
    state: replaceCombatant(state, side, id, healed.target),
    healing: healed.healing,
  };
}

function assertTeamPreparation(input: TeamBattlePreparation): void {
  if (input.rulesVersion !== 2 || input.seed.trim().length === 0) {
    throw new Error("Team battle preparation is invalid.");
  }

  const leftMembers = input.leftTeam.members;
  const rightMembers = input.rightTeam.members;
  if (
    input.leftTeam.side !== "left" ||
    input.rightTeam.side !== "right" ||
    leftMembers.length === 0 ||
    leftMembers.length > 5 ||
    rightMembers.length === 0 ||
    rightMembers.length > 5
  ) {
    throw new Error("Team battles require 1 to 5 characters on each side.");
  }

  const ids = [...leftMembers, ...rightMembers].map((character) => character.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("A character cannot appear more than once in a team battle.");
  }
}

export function createInitialTeamBattleState(
  input: TeamBattlePreparation,
): TeamBattleRuntimeState {
  assertTeamPreparation(input);

  return {
    rulesVersion: 2,
    seed: input.seed,
    status: "ready",
    round: 0,
    turnOrder: [],
    actionIndex: 0,
    left: input.leftTeam.members.map(createTeamCombatantState),
    right: input.rightTeam.members.map(createTeamCombatantState),
    winner: null,
    events: [],
  };
}

function getCleavePassive(
  combatant: CombatantState,
): CleavePassiveSkill | null {
  const skill = combatant.character.skills.find(
    (candidate) => candidate.type === "cleave_passive",
  );
  return skill ? skill as CleavePassiveSkill : null;
}

function getChargeStrikePassive(
  combatant: CombatantState,
): ChargeStrikePassiveSkill | null {
  const skill = combatant.character.skills.find(
    (candidate) => candidate.type === "charge_strike_passive",
  );
  if (!skill) return null;
  if (skill.chargeTurns === undefined) {
    throw new Error("Charge strike passive is missing its charge turns.");
  }
  return skill as ChargeStrikePassiveSkill;
}

function createTeamCombatantState(character: CombatantState["character"]): CombatantState {
  const combatant = createCombatantState(character);
  const multiplier = getCleavePassive(combatant) ? 0.65 : getPassive(combatant, "assassin_passive") ? 0.8 : 1;
  if (multiplier === 1) return combatant;

  return {
    ...combatant,
    effectiveStats: {
      ...combatant.effectiveStats,
      attack: Math.floor(combatant.effectiveStats.attack * multiplier),
    },
  };
}

function getTeam(
  state: TeamBattleRuntimeState,
  side: BattleSide,
): CombatantState[] {
  return state[side];
}

function getCombatant(
  state: TeamBattleRuntimeState,
  side: BattleSide,
  characterId: string,
): CombatantState {
  const combatant = getTeam(state, side).find(
    (candidate) => candidate.character.id === characterId,
  );
  if (!combatant) throw new Error(`Character ${characterId} is not in this battle.`);
  return combatant;
}

function getPosition(
  state: TeamBattleRuntimeState,
  side: BattleSide,
  characterId: string,
): number {
  const position = getTeam(state, side).findIndex(
    (candidate) => candidate.character.id === characterId,
  );
  if (position < 0) throw new Error(`Character ${characterId} is not in this battle.`);
  return position + 1;
}

function getFrontCombatant(
  state: TeamBattleRuntimeState,
  side: BattleSide,
): CombatantState | null {
  return getTeam(state, side).find((combatant) => combatant.health > 0) ?? null;
}

function getLastLivingCombatant(
  state: TeamBattleRuntimeState,
  side: BattleSide,
): CombatantState | null {
  return getTeam(state, side).filter((combatant) => combatant.health > 0).at(-1) ?? null;
}

function getSingleTargetEnemy(
  state: TeamBattleRuntimeState,
  actorSide: BattleSide,
  actor: CombatantState,
): CombatantState | null {
  const targetSide = getOpponentSide(actorSide);
  return getPassive(actor, "assassin_passive")
    ? getLastLivingCombatant(state, targetSide)
    : getFrontCombatant(state, targetSide);
}

function replaceCombatant(
  state: TeamBattleRuntimeState,
  side: BattleSide,
  characterId: string,
  replacement: CombatantState,
): TeamBattleRuntimeState {
  let didReplace = false;
  const nextTeam = getTeam(state, side).map((combatant) => {
    if (combatant.character.id !== characterId) return combatant;
    didReplace = true;
    return replacement;
  });
  if (!didReplace) throw new Error(`Character ${characterId} is not in this battle.`);

  return { ...state, [side]: nextTeam };
}

function createCombatantSnapshot(
  state: TeamBattleRuntimeState,
  side: BattleSide,
  combatant: CombatantState,
) {
  return {
    characterId: combatant.character.id,
    position: getPosition(state, side, combatant.character.id),
    health: combatant.health,
    shield: combatant.shield,
    cooldowns: { ...combatant.cooldowns },
    isStunned: combatant.isStunned,
    isInvincible: combatant.isInvincible,
    chargeProgress: combatant.chargeProgress,
  };
}

function createTargetResult(
  state: TeamBattleRuntimeState,
  side: BattleSide,
  combatant: CombatantState,
  resolution: Omit<TeamBattleTargetResult, "side" | "characterId" | "position" | "health" | "shield" | "cooldowns" | "isStunned" | "isInvincible" | "chargeProgress">,
): TeamBattleTargetResult {
  return {
    side,
    ...createCombatantSnapshot(state, side, combatant),
    ...resolution,
  };
}

function appendEvent(
  state: TeamBattleRuntimeState,
  actorSide: BattleSide,
  actorId: string,
  skill: Pick<Skill, "id" | "name" | "type"> | null,
  targets: TeamBattleTargetResult[],
  narration: string,
  actorHealing = 0,
): TeamBattleRuntimeState {
  const actor = getCombatant(state, actorSide, actorId);

  return {
    ...state,
    events: [
      ...state.events,
      {
        round: state.round,
        actor: { side: actorSide, ...createCombatantSnapshot(state, actorSide, actor) },
        skill,
        targets,
        formations: {
          left: state.left.map((combatant) =>
            createCombatantSnapshot(state, "left", combatant),
          ),
          right: state.right.map((combatant) =>
            createCombatantSnapshot(state, "right", combatant),
          ),
        },
        actorHealing,
        narration,
      },
    ],
  };
}

function selectHighestValueSkill(
  skills: Skill[],
  getValue: (skill: Skill) => number,
  random: SeededRandom,
): Skill | null {
  if (skills.length === 0) return null;

  const highestValue = Math.max(...skills.map(getValue));
  const finalists = skills.filter((skill) => getValue(skill) === highestValue);
  return finalists.length === 1 ? finalists[0] : random.pick(finalists);
}

function chooseTeamBattleAction(
  actor: CombatantState,
  target: CombatantState,
  allies: CombatantState[],
  enemies: CombatantState[],
  random: SeededRandom,
): BattleAction {
  const frontAlly = allies.find((ally) => ally.health > 0) ?? actor;
  const availableSkills = actor.character.skills.filter(
    (skill) =>
      skill.activation !== "passive" &&
      ["damage", "shield", "heal", "control", "area_damage", "area_heal", "critical", "area_control", "invincible"].includes(skill.type) &&
      isSkillAvailable(actor, skill.id),
  );

  const areaHealSkill = selectHighestValueSkill(
    availableSkills.filter((skill) => skill.type === "area_heal"),
    (skill) => skill.healAmount ?? 0,
    random,
  );
  const frontHealSkill = selectHighestValueSkill(
    availableSkills.filter((skill) => skill.type === "heal"),
    (skill) => skill.healAmount ?? 0,
    random,
  );
  const invincibleSkill = selectHighestValueSkill(
    availableSkills.filter((skill) => skill.type === "invincible"),
    () => 1,
    random,
  );
  const expectedAreaHealing = areaHealSkill
    ? allies
      .filter((ally) => ally.health > 0)
      .reduce(
        (total, ally) => total + Math.min(
          ally.effectiveStats.maxHealth - ally.health,
          scaleSkillAmountByRealm(actor.character, areaHealSkill.healAmount ?? 0),
        ),
        0,
      )
    : 0;
  const expectedFrontHealing = frontHealSkill
    ? Math.min(
      frontAlly.effectiveStats.maxHealth - frontAlly.health,
      scaleSkillAmountByRealm(actor.character, frontHealSkill.healAmount ?? 0),
    )
    : 0;
  const injuredAllies = allies.filter(
    (ally) => ally.health > 0 && ally.health < ally.effectiveStats.maxHealth,
  );
  const lowHealthFront = frontAlly.health <= frontAlly.effectiveStats.maxHealth * LOW_HEALTH_RATIO;
  const lowHealthActor = actor.health <= actor.effectiveStats.maxHealth * LOW_HEALTH_RATIO;

  if (areaHealSkill && injuredAllies.length >= 2 && expectedAreaHealing > 0) {
    return { type: "skill", skillId: areaHealSkill.id };
  }

  if (lowHealthFront || lowHealthActor) {
    if (areaHealSkill && expectedAreaHealing >= expectedFrontHealing && expectedAreaHealing > 0) {
      return { type: "skill", skillId: areaHealSkill.id };
    }
    if (frontHealSkill && expectedFrontHealing > 0) {
      return { type: "skill", skillId: frontHealSkill.id };
    }
    if (
      invincibleSkill &&
      !actor.isInvincible &&
      frontAlly.character.id === actor.character.id
    ) {
      return { type: "skill", skillId: invincibleSkill.id };
    }

    if (actor.shield < BATTLE_RULES.maxShield) {
      const shieldSkill = selectHighestValueSkill(
        availableSkills.filter((skill) => skill.type === "shield"),
        (skill) => skill.shieldAmount ?? 0,
        random,
      );
      if (shieldSkill) return { type: "skill", skillId: shieldSkill.id };
    }
  }

  const singleTargetDamageSkill = selectHighestValueSkill(
    availableSkills.filter((skill) => skill.type === "damage" || skill.type === "critical"),
    (skill) => skill.damageMultiplier ?? 0,
    random,
  );
  const areaDamageSkill = selectHighestValueSkill(
    availableSkills.filter((skill) => skill.type === "area_damage"),
    (skill) => (skill.damageMultiplier ?? 0) * enemies.length,
    random,
  );
  if (
    singleTargetDamageSkill &&
    target.health <= actor.effectiveStats.attack * (singleTargetDamageSkill.damageMultiplier ?? 0)
  ) {
    return { type: "skill", skillId: singleTargetDamageSkill.id };
  }
  if (
    areaDamageSkill &&
    enemies.length > 0 &&
    (!singleTargetDamageSkill ||
      (areaDamageSkill.damageMultiplier ?? 0) * enemies.length >=
        (singleTargetDamageSkill.damageMultiplier ?? 0))
  ) {
    return { type: "skill", skillId: areaDamageSkill.id };
  }
  if (singleTargetDamageSkill) {
    return { type: "skill", skillId: singleTargetDamageSkill.id };
  }
  if (areaDamageSkill && enemies.length > 0) {
    return { type: "skill", skillId: areaDamageSkill.id };
  }

  if (enemies.length >= 2 && enemies.some((enemy) => !enemy.isStunned)) {
    const areaControlSkill = selectHighestValueSkill(
      availableSkills.filter((skill) => skill.type === "area_control"),
      () => 1,
      random,
    );
    if (areaControlSkill) return { type: "skill", skillId: areaControlSkill.id };
  }

  if (!target.isStunned) {
    const controlSkill = selectHighestValueSkill(
      availableSkills.filter((skill) => skill.type === "control"),
      (skill) => skill.stunChance ?? 0,
      random,
    );
    if (controlSkill) return { type: "skill", skillId: controlSkill.id };
  }

  return { type: "normal_attack" };
}

function getSkill(
  actor: CombatantState,
  skillId: string,
): Skill {
  const skill = actor.character.skills.find((candidate) => candidate.id === skillId);
  if (!skill) throw new Error(`Skill ${skillId} does not belong to this combatant.`);
  if (!isSkillAvailable(actor, skill.id)) {
    throw new Error(`Skill ${skill.name} is still on cooldown.`);
  }
  return skill;
}

function formatSkillUse(actorName: string, skill: Skill): string {
  return `${actorName} ${getSkillUsageText(skill)} ${skill.name}`;
}

function resolveNormalAttack(
  state: TeamBattleRuntimeState,
  actorSide: BattleSide,
  actorId: string,
): TeamBattleRuntimeState {
  const targetSide = getOpponentSide(actorSide);
  const actor = getCombatant(state, actorSide, actorId);
  const cleavePassive = getCleavePassive(actor);
  const targetIds = cleavePassive
    ? getTeam(state, targetSide)
      .filter((target) => target.health > 0)
      .map((target) => target.character.id)
    : [getSingleTargetEnemy(state, actorSide, actor)?.character.id].filter(
      (targetId): targetId is string => Boolean(targetId),
    );
  if (targetIds.length === 0) {
    throw new Error("A normal attack requires at least one living target.");
  }

  let nextState = state;
  const resolutions: Array<{
    characterId: string;
    rawDamage: number;
    damage: number;
    shieldAbsorbed: number;
    targetInvincible: boolean;
    targetRevived: boolean;
  }> = [];
  for (const targetId of targetIds) {
    const target = getCombatant(nextState, targetSide, targetId);
    const resolution = applyDamageWithInvincibility(target, actor.effectiveStats.attack);
    nextState = replaceCombatant(
      nextState,
      targetSide,
      targetId,
      resolution.target,
    );
    resolutions.push({
      characterId: targetId,
      rawDamage: resolution.rawDamage,
      damage: resolution.healthDamage,
      shieldAbsorbed: resolution.shieldAbsorbed,
      targetInvincible: resolution.targetInvincible,
      targetRevived: resolution.targetRevived,
    });
  }
  const targets = resolutions.map((resolution) =>
    createTargetResult(
      nextState,
      targetSide,
      getCombatant(nextState, targetSide, resolution.characterId),
      {
        rawDamage: resolution.rawDamage,
        damage: resolution.damage,
        shieldAbsorbed: resolution.shieldAbsorbed,
        healing: 0,
        shieldGranted: 0,
        targetStunned: false,
        targetInvincible: resolution.targetInvincible,
        targetRevived: resolution.targetRevived,
      },
    ),
  );

  const lifesteal = resolutions.some((resolution) => resolution.damage > 0)
    ? applyLifesteal(nextState, actorSide, actorId)
    : { state: nextState, healing: 0 };
  nextState = lifesteal.state;
  return appendEvent(
    nextState,
    actorSide,
    actorId,
    cleavePassive
      ? { id: cleavePassive.id, name: cleavePassive.name, type: cleavePassive.type }
      : null,
    targets,
    cleavePassive
      ? `${actor.character.name} 的 ${cleavePassive.name} 生效，横扫敌方 ${targets.length} 名存活角色。`
      : `${actor.character.name} 攻击敌方 ${targetIds.length} 名角色，造成 ${targets[0]?.damage ?? 0} 点伤害。`,
    lifesteal.healing,
  );
}

function resolveChargeStrikeAction(
  state: TeamBattleRuntimeState,
  actorSide: BattleSide,
  actorId: string,
  skill: ChargeStrikePassiveSkill,
): TeamBattleRuntimeState {
  const actor = getCombatant(state, actorSide, actorId);
  const chargeTurns = skill.chargeTurns;
  const nextChargeProgress = Math.min(actor.chargeProgress + 1, chargeTurns);

  if (nextChargeProgress < chargeTurns) {
    const chargingActor = { ...actor, chargeProgress: nextChargeProgress };
    const nextState = replaceCombatant(state, actorSide, actorId, chargingActor);
    return appendEvent(
      nextState,
      actorSide,
      actorId,
      { id: skill.id, name: skill.name, type: skill.type },
      [],
      `${actor.character.name} 正在蓄力（${nextChargeProgress}/${chargeTurns}）。`,
    );
  }

  const targetSide = getOpponentSide(actorSide);
  const target = getFrontCombatant(state, targetSide);
  if (!target) throw new Error("A charge strike requires a living front target.");

  const resolution = applyDamageWithInvincibility(
    target,
    actor.effectiveStats.attack * chargeTurns,
  );
  let nextState = replaceCombatant(
    state,
    targetSide,
    target.character.id,
    resolution.target,
  );
  nextState = replaceCombatant(
    nextState,
    actorSide,
    actorId,
    { ...actor, chargeProgress: 0 },
  );
  const targetResult = createTargetResult(
    nextState,
    targetSide,
    resolution.target,
    {
      rawDamage: resolution.rawDamage,
      damage: resolution.healthDamage,
      shieldAbsorbed: resolution.shieldAbsorbed,
      healing: 0,
      shieldGranted: 0,
      targetStunned: false,
      targetInvincible: resolution.targetInvincible,
      targetRevived: resolution.targetRevived,
    },
  );

  return appendEvent(
    nextState,
    actorSide,
    actorId,
    { id: skill.id, name: skill.name, type: skill.type },
    [targetResult],
    `${formatSkillUse(actor.character.name, skill)}攻击敌方 ${target.character.name}，造成 ${resolution.healthDamage} 点伤害。`,
  );
}

function resolveDamageSkill(
  state: TeamBattleRuntimeState,
  actorSide: BattleSide,
  actorId: string,
  skill: DamageSkill,
  random: SeededRandom,
): TeamBattleRuntimeState {
  const targetSide = getOpponentSide(actorSide);
  const actor = getCombatant(state, actorSide, actorId);
  const target = getSingleTargetEnemy(state, actorSide, actor);
  if (!target) throw new Error("A damage skill requires a living front target.");

  const rawDamage = calculateDamageSkillDamage(
    actor.effectiveStats.attack,
    skill.damageMultiplier,
    random,
  );
  const damageResolution = applyDamageWithInvincibility(target, rawDamage);
  let nextState = replaceCombatant(
    state,
    targetSide,
    target.character.id,
    damageResolution.target,
  );
  const actorAfterSkill = setSkillCooldown(actor, skill.id, skill.cooldown);
  nextState = replaceCombatant(nextState, actorSide, actorId, actorAfterSkill);
  const lifesteal = damageResolution.healthDamage > 0
    ? applyLifesteal(nextState, actorSide, actorId)
    : { state: nextState, healing: 0 };
  nextState = lifesteal.state;
  const targetResult = createTargetResult(
    nextState,
    targetSide,
    damageResolution.target,
    {
      rawDamage: damageResolution.rawDamage,
      damage: damageResolution.healthDamage,
      shieldAbsorbed: damageResolution.shieldAbsorbed,
      healing: 0,
      shieldGranted: 0,
      targetStunned: false,
      targetInvincible: damageResolution.targetInvincible,
      targetRevived: damageResolution.targetRevived,
    },
  );

  return appendEvent(
    nextState,
    actorSide,
    actorId,
    { id: skill.id, name: skill.name, type: skill.type },
    [targetResult],
    `${formatSkillUse(actor.character.name, skill)}攻击敌方 ${target.character.name}，造成 ${damageResolution.healthDamage} 点伤害。`,
    lifesteal.healing,
  );
}

function resolveAreaDamageSkill(
  state: TeamBattleRuntimeState,
  actorSide: BattleSide,
  actorId: string,
  skill: AreaDamageSkill,
  random: SeededRandom,
): TeamBattleRuntimeState {
  const targetSide = getOpponentSide(actorSide);
  const actor = getCombatant(state, actorSide, actorId);
  const targetIds = getTeam(state, targetSide)
    .filter((target) => target.health > 0)
    .map((target) => target.character.id);
  if (targetIds.length === 0) {
    throw new Error("An area damage skill requires at least one living target.");
  }

  let nextState = state;
  const resolutions: Array<{
    characterId: string;
    rawDamage: number;
    damage: number;
    shieldAbsorbed: number;
    targetInvincible: boolean;
    targetRevived: boolean;
  }> = [];
  for (const targetId of targetIds) {
    const target = getCombatant(nextState, targetSide, targetId);
    const rawDamage = calculateDamageSkillDamage(
      actor.effectiveStats.attack,
      skill.damageMultiplier,
      random,
      {
        min: BATTLE_RULES.minAreaDamageMultiplier,
        max: BATTLE_RULES.maxAreaDamageMultiplier,
      },
    );
    const damageResolution = applyDamageWithInvincibility(target, rawDamage);
    nextState = replaceCombatant(
      nextState,
      targetSide,
      targetId,
      damageResolution.target,
    );
    resolutions.push({
      characterId: targetId,
      rawDamage: damageResolution.rawDamage,
      damage: damageResolution.healthDamage,
      shieldAbsorbed: damageResolution.shieldAbsorbed,
      targetInvincible: damageResolution.targetInvincible,
      targetRevived: damageResolution.targetRevived,
    });
  }

  const actorAfterSkill = setSkillCooldown(actor, skill.id, skill.cooldown);
  nextState = replaceCombatant(nextState, actorSide, actorId, actorAfterSkill);
  const lifesteal = resolutions.some((resolution) => resolution.damage > 0)
    ? applyLifesteal(nextState, actorSide, actorId)
    : { state: nextState, healing: 0 };
  nextState = lifesteal.state;
  const targets = resolutions.map((resolution) =>
    createTargetResult(
      nextState,
      targetSide,
      getCombatant(nextState, targetSide, resolution.characterId),
      {
        rawDamage: resolution.rawDamage,
        damage: resolution.damage,
        shieldAbsorbed: resolution.shieldAbsorbed,
        healing: 0,
        shieldGranted: 0,
        targetStunned: false,
        targetInvincible: resolution.targetInvincible,
        targetRevived: resolution.targetRevived,
      },
    ),
  );

  return appendEvent(
    nextState,
    actorSide,
    actorId,
    { id: skill.id, name: skill.name, type: skill.type },
    targets,
    `${formatSkillUse(actor.character.name, skill)}攻击敌方全体，影响 ${targets.length} 名角色。`,
    lifesteal.healing,
  );
}

function resolveShieldSkill(
  state: TeamBattleRuntimeState,
  actorSide: BattleSide,
  actorId: string,
  skill: ShieldSkill,
): TeamBattleRuntimeState {
  const actor = getCombatant(state, actorSide, actorId);
  const shieldResolution = applyShield(
    actor,
    scaleSkillAmountByRealm(actor.character, skill.shieldAmount),
  );
  const actorAfterSkill = setSkillCooldown(
    shieldResolution.target,
    skill.id,
    skill.cooldown,
  );
  const nextState = replaceCombatant(
    state,
    actorSide,
    actorId,
    actorAfterSkill,
  );
  const targetResult = createTargetResult(nextState, actorSide, actorAfterSkill, {
    rawDamage: 0,
    damage: 0,
    shieldAbsorbed: 0,
    healing: 0,
    shieldGranted: shieldResolution.shieldGranted,
    targetStunned: false,
    targetInvincible: false,
    targetRevived: false,
  });

  return appendEvent(
    nextState,
    actorSide,
    actorId,
    { id: skill.id, name: skill.name, type: skill.type },
    [targetResult],
    `${formatSkillUse(actor.character.name, skill)}，获得 ${shieldResolution.shieldGranted} 点护盾。`,
  );
}

function resolveHealSkill(
  state: TeamBattleRuntimeState,
  actorSide: BattleSide,
  actorId: string,
  skill: HealSkill,
): TeamBattleRuntimeState {
  const actor = getCombatant(state, actorSide, actorId);
  const target = getFrontCombatant(state, actorSide);
  if (!target) throw new Error("A heal skill requires a living allied front target.");
  const healResolution = applyHealing(
    target,
    scaleSkillAmountByRealm(actor.character, skill.healAmount),
  );
  let nextState = replaceCombatant(state, actorSide, target.character.id, healResolution.target);
  const actorAfterHealing = getCombatant(nextState, actorSide, actorId);
  const actorAfterSkill = setSkillCooldown(
    actorAfterHealing,
    skill.id,
    skill.cooldown,
  );
  nextState = replaceCombatant(nextState, actorSide, actorId, actorAfterSkill);
  const targetResult = createTargetResult(nextState, actorSide, healResolution.target, {
    rawDamage: 0,
    damage: 0,
    shieldAbsorbed: 0,
    healing: healResolution.healing,
    shieldGranted: 0,
    targetStunned: false,
    targetInvincible: false,
    targetRevived: false,
  });

  return appendEvent(
    nextState,
    actorSide,
    actorId,
    { id: skill.id, name: skill.name, type: skill.type },
    [targetResult],
    `${formatSkillUse(actor.character.name, skill)}，为己方 ${target.character.name} 恢复 ${healResolution.healing} 点生命。`,
  );
}

function resolveAreaHealSkill(
  state: TeamBattleRuntimeState,
  actorSide: BattleSide,
  actorId: string,
  skill: AreaHealSkill,
): TeamBattleRuntimeState {
  const actor = getCombatant(state, actorSide, actorId);
  const targetIds = getTeam(state, actorSide)
    .filter((target) => target.health > 0)
    .map((target) => target.character.id);
  let nextState = state;
  const resolutions: Array<{ characterId: string; healing: number }> = [];
  const requestedHealing = scaleSkillAmountByRealm(actor.character, skill.healAmount);

  for (const targetId of targetIds) {
    const target = getCombatant(nextState, actorSide, targetId);
    const healResolution = applyHealing(target, requestedHealing);
    nextState = replaceCombatant(
      nextState,
      actorSide,
      targetId,
      healResolution.target,
    );
    resolutions.push({ characterId: targetId, healing: healResolution.healing });
  }

  const actorAfterHealing = getCombatant(nextState, actorSide, actorId);
  const actorAfterSkill = setSkillCooldown(
    actorAfterHealing,
    skill.id,
    skill.cooldown,
  );
  nextState = replaceCombatant(nextState, actorSide, actorId, actorAfterSkill);
  const targets = resolutions.map((resolution) =>
    createTargetResult(
      nextState,
      actorSide,
      getCombatant(nextState, actorSide, resolution.characterId),
      {
        rawDamage: 0,
        damage: 0,
        shieldAbsorbed: 0,
        healing: resolution.healing,
        shieldGranted: 0,
        targetStunned: false,
        targetInvincible: false,
        targetRevived: false,
      },
    ),
  );

  return appendEvent(
    nextState,
    actorSide,
    actorId,
    { id: skill.id, name: skill.name, type: skill.type },
    targets,
    `${formatSkillUse(actor.character.name, skill)}，恢复己方 ${targets.length} 名角色。`,
  );
}

function resolveControlSkill(
  state: TeamBattleRuntimeState,
  actorSide: BattleSide,
  actorId: string,
  skill: ControlSkill,
): TeamBattleRuntimeState {
  const targetSide = getOpponentSide(actorSide);
  const actor = getCombatant(state, actorSide, actorId);
  const target = getSingleTargetEnemy(state, actorSide, actor);
  if (!target) throw new Error("A control skill requires a living front target.");

  const stunResolution = applyStun(target, true);
  let nextState = replaceCombatant(
    state,
    targetSide,
    target.character.id,
    stunResolution.target,
  );
  const actorAfterSkill = setSkillCooldown(actor, skill.id, skill.cooldown);
  nextState = replaceCombatant(nextState, actorSide, actorId, actorAfterSkill);
  const targetResult = createTargetResult(
    nextState,
    targetSide,
    stunResolution.target,
    {
      rawDamage: 0,
      damage: 0,
      shieldAbsorbed: 0,
      healing: 0,
      shieldGranted: 0,
      targetStunned: stunResolution.targetStunned,
      targetInvincible: false,
      targetRevived: false,
    },
  );

  return appendEvent(
    nextState,
    actorSide,
    actorId,
    { id: skill.id, name: skill.name, type: skill.type },
    [targetResult],
    `${formatSkillUse(actor.character.name, skill)}，使敌方 ${target.character.name} 陷入眩晕。`,
  );
}

function resolveInvincibleSkill(
  state: TeamBattleRuntimeState,
  actorSide: BattleSide,
  actorId: string,
  skill: InvincibleSkill,
): TeamBattleRuntimeState {
  const actor = getCombatant(state, actorSide, actorId);
  const nextActor = setSkillCooldown({ ...actor, isInvincible: true }, skill.id, skill.cooldown);
  const nextState = replaceCombatant(state, actorSide, actorId, nextActor);
  return appendEvent(
    nextState,
    actorSide,
    actorId,
    { id: skill.id, name: skill.name, type: skill.type },
    [],
    `${formatSkillUse(actor.character.name, skill)}，直到下次行动前免疫伤害。`,
  );
}

function resolveAreaControlSkill(
  state: TeamBattleRuntimeState,
  actorSide: BattleSide,
  actorId: string,
  skill: AreaControlSkill,
): TeamBattleRuntimeState {
  const targetSide = getOpponentSide(actorSide);
  const actor = getCombatant(state, actorSide, actorId);
  let nextState = state;
  const targets: TeamBattleTargetResult[] = [];
  for (const target of getTeam(state, targetSide).filter((item) => item.health > 0)) {
    const stunResolution = applyStun(target, true);
    nextState = replaceCombatant(nextState, targetSide, target.character.id, stunResolution.target);
    targets.push(createTargetResult(nextState, targetSide, stunResolution.target, {
      rawDamage: 0,
      damage: 0,
      shieldAbsorbed: 0,
      healing: 0,
      shieldGranted: 0,
      targetStunned: stunResolution.targetStunned,
      targetInvincible: false,
      targetRevived: false,
    }));
  }
  nextState = replaceCombatant(nextState, actorSide, actorId, setSkillCooldown(actor, skill.id, skill.cooldown));
  return appendEvent(
    nextState,
    actorSide,
    actorId,
    { id: skill.id, name: skill.name, type: skill.type },
    targets,
    `${formatSkillUse(actor.character.name, skill)}，眩晕敌方全体。`,
  );
}

function resolveCriticalSkill(
  state: TeamBattleRuntimeState,
  actorSide: BattleSide,
  actorId: string,
  skill: CriticalSkill,
  random: SeededRandom,
): TeamBattleRuntimeState {
  const targetSide = getOpponentSide(actorSide);
  const actor = getCombatant(state, actorSide, actorId);
  const target = getSingleTargetEnemy(state, actorSide, actor);
  if (!target) throw new Error("A critical skill requires a living target.");

  const criticalRandomMultiplier =
    BATTLE_RULES.minDamageRandomMultiplier +
    random.next() *
      (BATTLE_RULES.maxDamageRandomMultiplier -
        BATTLE_RULES.minDamageRandomMultiplier);
  const rawDamage = Math.max(
    1,
    Math.floor(actor.effectiveStats.attack * skill.damageMultiplier * criticalRandomMultiplier),
  );
  const damageResolution = applyDamageWithInvincibility(target, rawDamage);
  let nextState = replaceCombatant(
    state,
    targetSide,
    target.character.id,
    damageResolution.target,
  );
  let actorAfterSkill = setSkillCooldown(actor, skill.id, skill.cooldown);
  let actorHealing = 0;
  if (damageResolution.healthDamage > 0) {
    const criticalHealing = applyHealing(actorAfterSkill, damageResolution.healthDamage);
    actorAfterSkill = criticalHealing.target;
    actorHealing += criticalHealing.healing;
  }
  nextState = replaceCombatant(nextState, actorSide, actorId, actorAfterSkill);
  const lifesteal = damageResolution.healthDamage > 0
    ? applyLifesteal(nextState, actorSide, actorId)
    : { state: nextState, healing: 0 };
  nextState = lifesteal.state;
  actorHealing += lifesteal.healing;
  const targetResult = createTargetResult(
    nextState,
    targetSide,
    damageResolution.target,
    {
      rawDamage: damageResolution.rawDamage,
      damage: damageResolution.healthDamage,
      shieldAbsorbed: damageResolution.shieldAbsorbed,
      healing: 0,
      shieldGranted: 0,
      targetStunned: false,
      targetInvincible: damageResolution.targetInvincible,
      targetRevived: damageResolution.targetRevived,
    },
  );

  return appendEvent(
    nextState,
    actorSide,
    actorId,
    { id: skill.id, name: skill.name, type: skill.type },
    [targetResult],
    `${formatSkillUse(actor.character.name, skill)}攻击敌方 ${target.character.name}，造成 ${damageResolution.healthDamage} 点伤害。`,
    actorHealing,
  );
}

function resolveSkillAction(
  state: TeamBattleRuntimeState,
  actorSide: BattleSide,
  actorId: string,
  skillId: string,
  random: SeededRandom,
): TeamBattleRuntimeState {
  const actor = getCombatant(state, actorSide, actorId);
  const skill = getSkill(actor, skillId);

  switch (skill.type) {
    case "damage":
      if (skill.damageMultiplier === undefined) throw new Error("Damage skill is missing its multiplier.");
      return resolveDamageSkill(state, actorSide, actorId, skill as DamageSkill, random);
    case "shield":
      if (skill.shieldAmount === undefined) throw new Error("Shield skill is missing its amount.");
      return resolveShieldSkill(state, actorSide, actorId, skill as ShieldSkill);
    case "heal":
      if (skill.healAmount === undefined) throw new Error("Heal skill is missing its amount.");
      return resolveHealSkill(state, actorSide, actorId, skill as HealSkill);
    case "control":
      if (skill.stunChance === undefined) throw new Error("Control skill is missing its stun chance.");
      return resolveControlSkill(state, actorSide, actorId, skill as ControlSkill);
    case "area_damage":
      if (skill.damageMultiplier === undefined) throw new Error("Area damage skill is missing its multiplier.");
      return resolveAreaDamageSkill(state, actorSide, actorId, skill as AreaDamageSkill, random);
    case "area_heal":
      if (skill.healAmount === undefined) throw new Error("Area heal skill is missing its amount.");
      return resolveAreaHealSkill(state, actorSide, actorId, skill as AreaHealSkill);
    case "critical":
      if (skill.damageMultiplier === undefined) throw new Error("Critical skill is missing its multiplier.");
      return resolveCriticalSkill(state, actorSide, actorId, skill as CriticalSkill, random);
    case "area_control":
      return resolveAreaControlSkill(state, actorSide, actorId, skill as AreaControlSkill);
    case "invincible":
      return resolveInvincibleSkill(state, actorSide, actorId, skill as InvincibleSkill);
    case "cleave_passive":
    case "charge_strike_passive":
    case "lifesteal_passive":
    case "growth_passive":
    case "revive_passive":
    case "assassin_passive":
      throw new Error("Passive skills resolve automatically during an action opportunity.");
    case "buff":
      throw new Error("Buff skills are not supported.");
    default:
      throw new Error("This skill type is not implemented yet.");
  }
}

function resolveActionOpportunity(
  state: TeamBattleRuntimeState,
  actorSide: BattleSide,
  actorId: string,
  random: SeededRandom,
): TeamBattleRuntimeState {
  const actor = getCombatant(state, actorSide, actorId);
  const actorBeforeAction = actor.isInvincible
    ? { ...actor, isInvincible: false }
    : actor;
  const stateWithCooldowns = replaceCombatant(
    state,
    actorSide,
    actorId,
    advanceCooldowns(actorBeforeAction),
  );
  const actorAfterCooldowns = getCombatant(stateWithCooldowns, actorSide, actorId);
  const stunConsumption = consumeStun(actorAfterCooldowns);
  const stateAfterStun = replaceCombatant(
    stateWithCooldowns,
    actorSide,
    actorId,
    stunConsumption.target,
  );

  if (stunConsumption.actionSkipped) {
    const actorAfterStun = getCombatant(stateAfterStun, actorSide, actorId);
    const chargeStrikePassive = getChargeStrikePassive(actorAfterStun);
    if (chargeStrikePassive) {
      const chargeProgress = Math.min(
        actorAfterStun.chargeProgress + 1,
        chargeStrikePassive.chargeTurns,
      );
      const stateAfterCharge = replaceCombatant(
        stateAfterStun,
        actorSide,
        actorId,
        { ...actorAfterStun, chargeProgress },
      );
      return appendEvent(
        stateAfterCharge,
        actorSide,
        actorId,
        {
          id: chargeStrikePassive.id,
          name: chargeStrikePassive.name,
          type: chargeStrikePassive.type,
        },
        [],
        `${actor.character.name} 处于眩晕状态，跳过本次行动，但蓄力推进至 ${chargeProgress}/${chargeStrikePassive.chargeTurns}。`,
      );
    }
    return appendEvent(
      stateAfterStun,
      actorSide,
      actorId,
      null,
      [],
      `${actor.character.name} 处于眩晕状态，跳过本次行动。`,
    );
  }

  const target = getSingleTargetEnemy(
    stateAfterStun,
    actorSide,
    getCombatant(stateAfterStun, actorSide, actorId),
  );
  if (!target) return stateAfterStun;
  const actorAfterStun = getCombatant(stateAfterStun, actorSide, actorId);
  const chargeStrikePassive = getChargeStrikePassive(actorAfterStun);
  if (chargeStrikePassive) {
    return resolveChargeStrikeAction(
      stateAfterStun,
      actorSide,
      actorId,
      chargeStrikePassive,
    );
  }
  const action = chooseTeamBattleAction(
    actorAfterStun,
    target,
    getTeam(stateAfterStun, actorSide),
    getTeam(stateAfterStun, getOpponentSide(actorSide)).filter(
      (combatant) => combatant.health > 0,
    ),
    random,
  );

  const nextState = action.type === "normal_attack"
    ? resolveNormalAttack(stateAfterStun, actorSide, actorId)
    : resolveSkillAction(stateAfterStun, actorSide, actorId, action.skillId, random);
  return applyGrowth(nextState, actorSide, actorId);
}

function getKnockoutWinner(state: TeamBattleRuntimeState): BattleWinner | null {
  const leftDefeated = !getFrontCombatant(state, "left");
  const rightDefeated = !getFrontCombatant(state, "right");
  if (leftDefeated && rightDefeated) return "draw";
  if (leftDefeated) return "right";
  if (rightDefeated) return "left";
  return null;
}

function getTimeoutWinner(state: TeamBattleRuntimeState): BattleWinner {
  const leftHealth = state.left.reduce((total, combatant) => total + combatant.health, 0);
  const rightHealth = state.right.reduce((total, combatant) => total + combatant.health, 0);
  const leftMaxHealth = state.left.reduce(
    (total, combatant) => total + combatant.effectiveStats.maxHealth,
    0,
  );
  const rightMaxHealth = state.right.reduce(
    (total, combatant) => total + combatant.effectiveStats.maxHealth,
    0,
  );

  if (leftHealth * rightMaxHealth > rightHealth * leftMaxHealth) return "left";
  if (rightHealth * leftMaxHealth > leftHealth * rightMaxHealth) return "right";
  if (leftHealth > rightHealth) return "left";
  if (rightHealth > leftHealth) return "right";
  return "draw";
}

function finishBattle(
  state: TeamBattleRuntimeState,
  winner: BattleWinner,
): TeamBattleRuntimeState {
  return { ...state, status: "finished", winner };
}

/**
 * Simulates a complete v2 team battle. Every round alternates by formation
 * position: red P1, blue P1, red P2, blue P2, and so on. Every single-target
 * action hits the current enemy front. Equal input snapshots and seed always
 * produce the same result.
 */
export function simulateTeamBattle(
  input: TeamBattlePreparation,
): TeamBattleRuntimeState {
  const random = createSeededRandom(input.seed);
  let state: TeamBattleRuntimeState = {
    ...createInitialTeamBattleState(input),
    status: "in_progress",
  };

  for (let round = 1; round <= BATTLE_RULES.maxRounds; round += 1) {
    const turnOrder: BattleSide[] = ["left", "right"];
    state = { ...state, round, turnOrder, actionIndex: 0 };

    const formationSize = Math.max(state.left.length, state.right.length);
    for (let positionIndex = 0; positionIndex < formationSize; positionIndex += 1) {
      for (const side of turnOrder) {
        const memberId = getTeam(state, side)[positionIndex]?.character.id;
        if (!memberId) continue;

        const winnerBeforeAction = getKnockoutWinner(state);
        if (winnerBeforeAction) return finishBattle(state, winnerBeforeAction);

        const actor = getCombatant(state, side, memberId);
        if (actor.health <= 0) continue;
        state = { ...state, actionIndex: state.actionIndex + 1 };
        state = resolveActionOpportunity(state, side, memberId, random);

        const winnerAfterAction = getKnockoutWinner(state);
        if (winnerAfterAction) return finishBattle(state, winnerAfterAction);
      }
    }
  }

  return finishBattle(state, "draw");
}
