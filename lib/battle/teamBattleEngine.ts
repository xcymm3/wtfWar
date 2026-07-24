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
import { scaleSkillAmountByRealm } from "./realm";
import { applyShield } from "./shield";
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
type CleavePassiveSkill = Skill & { type: "cleave_passive" };
type ChargeStrikePassiveSkill = Skill & {
  type: "charge_strike_passive";
  chargeTurns: number;
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
  if (!getCleavePassive(combatant)) return combatant;

  return {
    ...combatant,
    effectiveStats: {
      ...combatant.effectiveStats,
      attack: Math.floor(combatant.effectiveStats.attack * 0.65),
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
    chargeProgress: combatant.chargeProgress,
  };
}

function createTargetResult(
  state: TeamBattleRuntimeState,
  side: BattleSide,
  combatant: CombatantState,
  resolution: Omit<TeamBattleTargetResult, "side" | "characterId" | "position" | "health" | "shield" | "cooldowns" | "isStunned">,
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
  const availableSkills = actor.character.skills.filter(
    (skill) =>
      skill.activation !== "passive" &&
      ["damage", "shield", "heal", "control", "area_damage", "area_heal"].includes(skill.type) &&
      isSkillAvailable(actor, skill.id),
  );

  const areaHealSkill = selectHighestValueSkill(
    availableSkills.filter((skill) => skill.type === "area_heal"),
    (skill) => skill.healAmount ?? 0,
    random,
  );
  const selfHealSkill = selectHighestValueSkill(
    availableSkills.filter((skill) => skill.type === "heal"),
    (skill) => skill.healAmount ?? 0,
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
  const expectedSelfHealing = selfHealSkill
    ? Math.min(
      actor.effectiveStats.maxHealth - actor.health,
      scaleSkillAmountByRealm(actor.character, selfHealSkill.healAmount ?? 0),
    )
    : 0;
  const injuredAllies = allies.filter(
    (ally) => ally.health > 0 && ally.health < ally.effectiveStats.maxHealth,
  );

  if (areaHealSkill && injuredAllies.length >= 2 && expectedAreaHealing > 0) {
    return { type: "skill", skillId: areaHealSkill.id };
  }

  if (actor.health <= actor.effectiveStats.maxHealth * LOW_HEALTH_RATIO) {
    if (areaHealSkill && expectedAreaHealing >= expectedSelfHealing) {
      return { type: "skill", skillId: areaHealSkill.id };
    }
    if (selfHealSkill) return { type: "skill", skillId: selfHealSkill.id };

    if (actor.shield < BATTLE_RULES.maxShield) {
      const shieldSkill = selectHighestValueSkill(
        availableSkills.filter((skill) => skill.type === "shield"),
        (skill) => skill.shieldAmount ?? 0,
        random,
      );
      if (shieldSkill) return { type: "skill", skillId: shieldSkill.id };
    }
  }

  const damageSkill = selectHighestValueSkill(
    availableSkills.filter((skill) => skill.type === "damage"),
    (skill) => skill.damageMultiplier ?? 0,
    random,
  );
  const areaDamageSkill = selectHighestValueSkill(
    availableSkills.filter((skill) => skill.type === "area_damage"),
    (skill) => (skill.damageMultiplier ?? 0) * enemies.length,
    random,
  );
  if (target.health <= actor.effectiveStats.attack * 2 && damageSkill) {
    return { type: "skill", skillId: damageSkill.id };
  }
  if (
    areaDamageSkill &&
    enemies.length > 0 &&
    (!damageSkill ||
      (areaDamageSkill.damageMultiplier ?? 0) * enemies.length >=
        (damageSkill.damageMultiplier ?? 0))
  ) {
    return { type: "skill", skillId: areaDamageSkill.id };
  }
  if (damageSkill) return { type: "skill", skillId: damageSkill.id };
  if (areaDamageSkill && enemies.length > 0) {
    return { type: "skill", skillId: areaDamageSkill.id };
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
    : [getFrontCombatant(state, targetSide)?.character.id].filter(
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
  }> = [];
  for (const targetId of targetIds) {
    const target = getCombatant(nextState, targetSide, targetId);
    const resolution = applyDamage(target, actor.effectiveStats.attack);
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
      },
    ),
  );

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
      : `${actor.character.name} 攻击敌方前排，造成 ${targets[0]?.rawDamage ?? 0} 点固定伤害。`,
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

  const resolution = applyDamage(
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
    },
  );

  return appendEvent(
    nextState,
    actorSide,
    actorId,
    { id: skill.id, name: skill.name, type: skill.type },
    [targetResult],
    `${actor.character.name} 释放 ${skill.name}，对敌方前排 ${target.character.name} 造成 ${resolution.rawDamage} 点固定伤害。`,
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
  const target = getFrontCombatant(state, targetSide);
  if (!target) throw new Error("A damage skill requires a living front target.");

  const rawDamage = calculateDamageSkillDamage(
    actor.effectiveStats.attack,
    skill.damageMultiplier,
    random,
  );
  const damageResolution = applyDamage(target, rawDamage);
  let nextState = replaceCombatant(
    state,
    targetSide,
    target.character.id,
    damageResolution.target,
  );
  const actorAfterSkill = setSkillCooldown(actor, skill.id, skill.cooldown);
  nextState = replaceCombatant(nextState, actorSide, actorId, actorAfterSkill);
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
    },
  );

  return appendEvent(
    nextState,
    actorSide,
    actorId,
    { id: skill.id, name: skill.name, type: skill.type },
    [targetResult],
    `${actor.character.name} 使用 ${skill.name} 攻击敌方前排 ${target.character.name}。`,
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
  }> = [];
  for (const targetId of targetIds) {
    const target = getCombatant(nextState, targetSide, targetId);
    const rawDamage = calculateDamageSkillDamage(
      actor.effectiveStats.attack,
      skill.damageMultiplier,
      random,
    );
    const damageResolution = applyDamage(target, rawDamage);
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
    });
  }

  const actorAfterSkill = setSkillCooldown(actor, skill.id, skill.cooldown);
  nextState = replaceCombatant(nextState, actorSide, actorId, actorAfterSkill);
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
      },
    ),
  );

  return appendEvent(
    nextState,
    actorSide,
    actorId,
    { id: skill.id, name: skill.name, type: skill.type },
    targets,
    `${actor.character.name} 使用 ${skill.name}，攻击敌方 ${targets.length} 名存活角色。`,
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
  });

  return appendEvent(
    nextState,
    actorSide,
    actorId,
    { id: skill.id, name: skill.name, type: skill.type },
    [targetResult],
    `${actor.character.name} 使用 ${skill.name}，获得 ${shieldResolution.shieldGranted} 点护盾。`,
  );
}

function resolveHealSkill(
  state: TeamBattleRuntimeState,
  actorSide: BattleSide,
  actorId: string,
  skill: HealSkill,
): TeamBattleRuntimeState {
  const actor = getCombatant(state, actorSide, actorId);
  const healResolution = applyHealing(
    actor,
    scaleSkillAmountByRealm(actor.character, skill.healAmount),
  );
  const actorAfterSkill = setSkillCooldown(
    healResolution.target,
    skill.id,
    skill.cooldown,
  );
  const nextState = replaceCombatant(state, actorSide, actorId, actorAfterSkill);
  const targetResult = createTargetResult(nextState, actorSide, actorAfterSkill, {
    rawDamage: 0,
    damage: 0,
    shieldAbsorbed: 0,
    healing: healResolution.healing,
    shieldGranted: 0,
    targetStunned: false,
  });

  return appendEvent(
    nextState,
    actorSide,
    actorId,
    { id: skill.id, name: skill.name, type: skill.type },
    [targetResult],
    `${actor.character.name} 使用 ${skill.name}，恢复 ${healResolution.healing} 点生命。`,
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
      },
    ),
  );

  return appendEvent(
    nextState,
    actorSide,
    actorId,
    { id: skill.id, name: skill.name, type: skill.type },
    targets,
    `${actor.character.name} 使用 ${skill.name}，恢复己方 ${targets.length} 名存活角色。`,
  );
}

function resolveControlSkill(
  state: TeamBattleRuntimeState,
  actorSide: BattleSide,
  actorId: string,
  skill: ControlSkill,
  random: SeededRandom,
): TeamBattleRuntimeState {
  const targetSide = getOpponentSide(actorSide);
  const actor = getCombatant(state, actorSide, actorId);
  const target = getFrontCombatant(state, targetSide);
  if (!target) throw new Error("A control skill requires a living front target.");

  const stunResolution = applyStun(target, random.chance(skill.stunChance));
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
    },
  );

  return appendEvent(
    nextState,
    actorSide,
    actorId,
    { id: skill.id, name: skill.name, type: skill.type },
    [targetResult],
    stunResolution.targetStunned
      ? `${actor.character.name} 使用 ${skill.name}，使敌方前排 ${target.character.name} 陷入眩晕。`
      : `${actor.character.name} 使用 ${skill.name}，但未能眩晕敌方前排 ${target.character.name}。`,
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
      return resolveControlSkill(state, actorSide, actorId, skill as ControlSkill, random);
    case "area_damage":
      if (skill.damageMultiplier === undefined) throw new Error("Area damage skill is missing its multiplier.");
      return resolveAreaDamageSkill(state, actorSide, actorId, skill as AreaDamageSkill, random);
    case "area_heal":
      if (skill.healAmount === undefined) throw new Error("Area heal skill is missing its amount.");
      return resolveAreaHealSkill(state, actorSide, actorId, skill as AreaHealSkill);
    case "cleave_passive":
    case "charge_strike_passive":
      throw new Error("Passive skills resolve automatically during an action opportunity.");
    case "buff":
      throw new Error("Buff skills are not supported.");
  }
}

function resolveActionOpportunity(
  state: TeamBattleRuntimeState,
  actorSide: BattleSide,
  actorId: string,
  random: SeededRandom,
): TeamBattleRuntimeState {
  const actor = getCombatant(state, actorSide, actorId);
  const stateWithCooldowns = replaceCombatant(
    state,
    actorSide,
    actorId,
    advanceCooldowns(actor),
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

  const target = getFrontCombatant(stateAfterStun, getOpponentSide(actorSide));
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

  return action.type === "normal_attack"
    ? resolveNormalAttack(stateAfterStun, actorSide, actorId)
    : resolveSkillAction(stateAfterStun, actorSide, actorId, action.skillId, random);
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

  return finishBattle(state, getTimeoutWinner(state));
}
