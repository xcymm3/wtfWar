import assert from "node:assert/strict";
import test from "node:test";

import { simulateBattle } from "../lib/battle/battleEngine";
import { advanceCooldowns } from "../lib/battle/cooldown";
import { consumeStun } from "../lib/battle/control";
import { resolveControlSkill } from "../lib/battle/controlSkill";
import { resolveDamageSkill } from "../lib/battle/damageSkill";
import { resolveHealSkill } from "../lib/battle/healSkill";
import { resolveNormalAttack } from "../lib/battle/normalAttack";
import { createSeededRandom } from "../lib/battle/random";
import { resolveShieldSkill } from "../lib/battle/shieldSkill";
import { createInitialBattleState } from "../lib/battle/state";
import type { Character, Skill } from "../types/character";

const TIMESTAMP = "2026-07-23T00:00:00.000Z";

function createSkill(
  id: string,
  type: Skill["type"],
  overrides: Partial<Skill> = {},
): Skill {
  return {
    id,
    name: id,
    description: `${id} skill`,
    type,
    cooldown: 2,
    ...overrides,
  };
}

function createCharacter(
  id: string,
  overrides: Partial<Omit<Character, "id" | "skills">> & {
    skills?: [Skill, Skill];
  } = {},
): Character {
  return {
    id,
    name: id,
    originalPrompt: `${id} prompt`,
    profession: "warrior",
    attack: 20,
    maxHealth: 100,
    skills: [
      createSkill(`${id}-skill-one`, "buff"),
      createSkill(`${id}-skill-two`, "buff"),
    ],
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...overrides,
  };
}

test("simulates identically for the same seed without mutating role cards", () => {
  const leftCharacter = createCharacter("left", {
    attack: 25,
    maxHealth: 120,
    skills: [
      createSkill("left-strike", "damage", { damageMultiplier: 1.6 }),
      createSkill("left-mend", "heal", { healAmount: 25 }),
    ],
  });
  const rightCharacter = createCharacter("right", {
    attack: 22,
    maxHealth: 130,
    skills: [
      createSkill("right-barrier", "shield", { shieldAmount: 20 }),
      createSkill("right-stun", "control", { stunChance: 1 }),
    ],
  });
  const originalInput = structuredClone({ leftCharacter, rightCharacter });

  const firstResult = simulateBattle({
    seed: "deterministic-battle",
    leftCharacter,
    rightCharacter,
  });
  const secondResult = simulateBattle({
    seed: "deterministic-battle",
    leftCharacter,
    rightCharacter,
  });

  assert.deepEqual(firstResult, secondResult);
  assert.equal(firstResult.status, "finished");
  assert.ok(firstResult.events.length > 0);
  assert.deepEqual({ leftCharacter, rightCharacter }, originalInput);
});

test("resolves ordinary attacks as fixed attack damage after shields", () => {
  const leftCharacter = createCharacter("left", { attack: 17 });
  const rightCharacter = createCharacter("right", { maxHealth: 100 });
  const initialState = createInitialBattleState({
    seed: "normal-attack",
    leftCharacter,
    rightCharacter,
  });
  const state = {
    ...initialState,
    round: 1,
    right: { ...initialState.right, shield: 5 },
  };

  const result = resolveNormalAttack(state, "left");

  assert.equal(result.right.shield, 0);
  assert.equal(result.right.health, 88);
  assert.deepEqual(result.events.at(-1), {
    round: 1,
    actor: "left",
    target: "right",
    skill: null,
    rawDamage: 17,
    damage: 12,
    shieldAbsorbed: 5,
    healing: 0,
    shieldGranted: 0,
    targetStunned: false,
    actorHealth: 100,
    targetHealth: 88,
    actorShield: 0,
    targetShield: 0,
    actorCooldowns: {
      "left-skill-one": 0,
      "left-skill-two": 0,
    },
    targetCooldowns: {
      "right-skill-one": 0,
      "right-skill-two": 0,
    },
    actorIsStunned: false,
    targetIsStunned: false,
    narration: "left 发动普通攻击，造成 17 点固定伤害，其中 5 点被护盾吸收，right 失去 12 点生命。",
  });
});

test("scales combat attributes and fixed effects by realm", () => {
  const deityHeal = createSkill("deity-mend", "heal", { healAmount: 10 });
  const deityShield = createSkill("deity-aegis", "shield", { shieldAmount: 10 });
  const deity = createCharacter("deity", {
    realm: "deity",
    attack: 20,
    maxHealth: 100,
    skills: [deityHeal, deityShield],
  });
  const mortal = createCharacter("mortal", { attack: 20, maxHealth: 100 });
  const initialState = createInitialBattleState({
    seed: "realm-scaling",
    leftCharacter: deity,
    rightCharacter: mortal,
  });

  assert.deepEqual(initialState.left.effectiveStats, {
    realm: "deity",
    multiplier: 5,
    attack: 100,
    maxHealth: 500,
  });
  assert.equal(initialState.left.health, 500);
  assert.equal(initialState.right.effectiveStats.attack, 20);
  assert.equal(initialState.right.effectiveStats.maxHealth, 100);

  const afterAttack = resolveNormalAttack(
    { ...initialState, round: 1 },
    "left",
  );
  assert.equal(afterAttack.events.at(-1)?.rawDamage, 100);
  assert.equal(afterAttack.right.health, 0);

  const injuredState = {
    ...initialState,
    left: { ...initialState.left, health: 400 },
  };
  const afterHeal = resolveHealSkill(injuredState, "left", deityHeal.id);
  assert.equal(afterHeal.left.health, 450);
  assert.equal(afterHeal.events.at(-1)?.healing, 50);

  const afterShield = resolveShieldSkill(initialState, "left", deityShield.id);
  assert.equal(afterShield.left.shield, 50);
  assert.equal(afterShield.events.at(-1)?.shieldGranted, 50);
});

test("applies damage skill cooldowns and deterministic bounded damage", () => {
  const damageSkill = createSkill("left-strike", "damage", {
    cooldown: 2,
    damageMultiplier: 1.5,
  });
  const leftCharacter = createCharacter("left", {
    attack: 20,
    skills: [damageSkill, createSkill("left-buff", "buff")],
  });
  const rightCharacter = createCharacter("right");
  const state = createInitialBattleState({
    seed: "damage-skill",
    leftCharacter,
    rightCharacter,
  });

  const result = resolveDamageSkill(
    state,
    "left",
    damageSkill.id,
    createSeededRandom("damage-skill"),
  );
  const event = result.events.at(-1);

  assert.ok(event);
  assert.ok(event.rawDamage >= 27 && event.rawDamage <= 33);
  assert.equal(result.right.health, 100 - event.damage);
  assert.equal(result.left.cooldowns[damageSkill.id], 2);
  assert.throws(
    () =>
      resolveDamageSkill(
        result,
        "left",
        damageSkill.id,
        createSeededRandom("new-random-sequence"),
      ),
    /cooldown/i,
  );

  const availableAgain = advanceCooldowns(advanceCooldowns(result.left));
  assert.equal(availableAgain.cooldowns[damageSkill.id], 0);
});

test("caps shield skills and records their cooldown", () => {
  const shieldSkill = createSkill("left-barrier", "shield", {
    cooldown: 3,
    shieldAmount: 20,
  });
  const leftCharacter = createCharacter("left", {
    skills: [shieldSkill, createSkill("left-buff", "buff")],
  });
  const state = createInitialBattleState({
    seed: "shield-skill",
    leftCharacter,
    rightCharacter: createCharacter("right"),
  });
  const result = resolveShieldSkill(
    { ...state, left: { ...state.left, shield: 50 } },
    "left",
    shieldSkill.id,
  );

  assert.equal(result.left.shield, 60);
  assert.equal(result.left.cooldowns[shieldSkill.id], 3);
  assert.equal(result.events.at(-1)?.shieldGranted, 10);
});

test("caps healing at maximum health and records the actual amount", () => {
  const healSkill = createSkill("left-mend", "heal", {
    cooldown: 2,
    healAmount: 25,
  });
  const leftCharacter = createCharacter("left", {
    maxHealth: 100,
    skills: [healSkill, createSkill("left-buff", "buff")],
  });
  const state = createInitialBattleState({
    seed: "heal-skill",
    leftCharacter,
    rightCharacter: createCharacter("right"),
  });
  const result = resolveHealSkill(
    { ...state, left: { ...state.left, health: 90 } },
    "left",
    healSkill.id,
  );

  assert.equal(result.left.health, 100);
  assert.equal(result.left.cooldowns[healSkill.id], 2);
  assert.equal(result.events.at(-1)?.healing, 10);
});

test("stuns exactly one action opportunity and then clears the status", () => {
  const controlSkill = createSkill("left-stun", "control", {
    cooldown: 2,
    stunChance: 1,
  });
  const leftCharacter = createCharacter("left", {
    skills: [controlSkill, createSkill("left-buff", "buff")],
  });
  const state = createInitialBattleState({
    seed: "control-skill",
    leftCharacter,
    rightCharacter: createCharacter("right"),
  });
  const afterControl = resolveControlSkill(
    state,
    "left",
    controlSkill.id,
    createSeededRandom("control-skill"),
  );
  const stunConsumption = consumeStun(afterControl.right);

  assert.equal(afterControl.right.isStunned, true);
  assert.equal(afterControl.events.at(-1)?.targetStunned, true);
  assert.equal(afterControl.left.cooldowns[controlSkill.id], 2);
  assert.equal(stunConsumption.actionSkipped, true);
  assert.equal(stunConsumption.target.isStunned, false);
});

test("declares a draw when symmetric combat reaches the 50-round limit", () => {
  const leftCharacter = createCharacter("left", {
    attack: 3,
    maxHealth: 180,
  });
  const rightCharacter = createCharacter("right", {
    attack: 3,
    maxHealth: 180,
  });

  const result = simulateBattle({
    seed: "timeout-draw",
    leftCharacter,
    rightCharacter,
  });

  assert.equal(result.status, "finished");
  assert.equal(result.round, 50);
  assert.equal(result.winner, "draw");
  assert.equal(result.left.health, 30);
  assert.equal(result.right.health, 30);
  assert.equal(result.events.length, 100);
});
