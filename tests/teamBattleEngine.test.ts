import assert from "node:assert/strict";
import test from "node:test";

import {
  createInitialTeamBattleState,
  simulateTeamBattle,
} from "../lib/battle/teamBattleEngine";
import type { TeamBattlePreparation } from "../types/battle";
import type { Character, Skill } from "../types/character";

const TIMESTAMP = "2026-07-23T00:00:00.000Z";

function createSkill(
  id: string,
  type: Skill["type"] = "buff",
  overrides: Partial<Skill> = {},
): Skill {
  return {
    id,
    name: id,
    description: `${id} placeholder skill`,
    type,
    cooldown: 1,
    ...overrides,
  };
}

function createCharacter(
  id: string,
  attack: number,
  maxHealth: number,
  skills: [Skill, Skill] = [createSkill(`${id}-one`), createSkill(`${id}-two`)],
): Character {
  return {
    id,
    name: id,
    originalPrompt: `${id} team test card`,
    profession: "warrior",
    realm: "mortal",
    attack,
    maxHealth,
    skills,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  };
}

function createPreparation(): TeamBattlePreparation {
  return {
    rulesVersion: 2,
    seed: "team-front-line",
    leftTeam: {
      side: "left",
      members: [
        createCharacter("left-front", 30, 100),
        createCharacter("left-back", 30, 100),
      ],
    },
    rightTeam: {
      side: "right",
      members: [
        createCharacter("right-front", 5, 10),
        createCharacter("right-back", 5, 40),
      ],
    },
    preparedAt: TIMESTAMP,
  };
}

test("creates realm-adjusted team states without mutating team snapshots", () => {
  const preparation = createPreparation();
  preparation.leftTeam.members[0]!.realm = "deity";
  const before = structuredClone(preparation);

  const state = createInitialTeamBattleState(preparation);

  assert.equal(state.left[0]?.effectiveStats.attack, 150);
  assert.equal(state.left[0]?.health, 500);
  assert.deepEqual(preparation, before);
});

test("simulates team turns front-to-back and only targets the current front", () => {
  const preparation = createPreparation();
  const firstResult = simulateTeamBattle(preparation);
  const secondResult = simulateTeamBattle(preparation);

  assert.deepEqual(firstResult, secondResult);
  assert.equal(firstResult.status, "finished");
  assert.ok(firstResult.events.length > 0);

  const roundOneEvents = firstResult.events.filter((event) => event.round === 1);
  const firstSide = roundOneEvents[0]?.actor.side;
  assert.ok(firstSide);
  assert.deepEqual(
    roundOneEvents
      .filter((event) => event.actor.side === firstSide)
      .map((event) => event.actor.position),
    [1, 2],
  );

  let rightFrontDefeated = false;
  for (const event of firstResult.events) {
    for (const target of event.targets.filter((candidate) => candidate.side === "right")) {
      if (target.position === 2) {
        assert.equal(rightFrontDefeated, true, "rear target was hit before the front fell");
      }
      if (target.position === 1 && target.health === 0) {
        rightFrontDefeated = true;
      }
    }
  }

  assert.equal(rightFrontDefeated, true);
  assert.ok(
    firstResult.events.some((event) =>
      event.targets.some((target) => target.side === "right" && target.position === 2),
    ),
  );
});

test("rejects malformed team formations before starting a battle", () => {
  const preparation = createPreparation();
  preparation.rightTeam.members = [
    preparation.leftTeam.members[0]!,
    preparation.leftTeam.members[1]!,
  ];

  assert.throws(
    () => simulateTeamBattle(preparation),
    /more than once/i,
  );
});

test("resolves area damage against every living enemy in formation order", () => {
  const areaDamage = createSkill("left-storm", "area_damage", {
    activation: "active",
    target: "enemies_all",
    cooldown: 3,
    damageMultiplier: 0.9,
  });
  const preparation: TeamBattlePreparation = {
    rulesVersion: 2,
    seed: "area-damage",
    leftTeam: {
      side: "left",
      members: [
        createCharacter("left-caster", 20, 100, [areaDamage, createSkill("left-wait")]),
        createCharacter("left-ally", 5, 100),
      ],
    },
    rightTeam: {
      side: "right",
      members: [
        createCharacter("right-front", 1, 100),
        createCharacter("right-back", 1, 100),
      ],
    },
    preparedAt: TIMESTAMP,
  };

  const result = simulateTeamBattle(preparation);
  const event = result.events.find((candidate) => candidate.skill?.id === areaDamage.id);

  assert.ok(event);
  assert.equal(event.targets.length, 2);
  assert.deepEqual(event.targets.map((target) => target.position), [1, 2]);
  assert.equal(event.targets.every((target) => target.side === "right"), true);
  assert.equal(event.targets.every((target) => target.rawDamage > 0), true);
});

test("resolves area healing for every living ally and records each result", () => {
  const areaHeal = createSkill("left-chorus", "area_heal", {
    activation: "active",
    target: "allies_all",
    cooldown: 2,
    healAmount: 20,
  });
  const preparation: TeamBattlePreparation = {
    rulesVersion: 2,
    seed: "area-heal",
    leftTeam: {
      side: "left",
      members: [
        createCharacter("left-healer", 1, 100, [areaHeal, createSkill("left-pause")]),
        createCharacter("left-ally", 1, 100),
      ],
    },
    rightTeam: {
      side: "right",
      members: [
        createCharacter("right-front", 16, 100),
        createCharacter("right-back", 1, 100),
      ],
    },
    preparedAt: TIMESTAMP,
  };

  const result = simulateTeamBattle(preparation);
  const event = result.events.find((candidate) => candidate.skill?.id === areaHeal.id);

  assert.ok(event);
  assert.deepEqual(event.targets.map((target) => target.position), [1, 2]);
  assert.equal(event.targets.every((target) => target.side === "left"), true);
  assert.ok(event.targets.some((target) => target.healing > 0));
});

test("cleave passive reduces effective attack and turns normal attacks into formation-wide hits", () => {
  const cleave = createSkill("left-cleave", "cleave_passive", {
    activation: "passive",
    target: "self",
    cooldown: 0,
  });
  const preparation: TeamBattlePreparation = {
    rulesVersion: 2,
    seed: "cleave-passive",
    leftTeam: {
      side: "left",
      members: [
        createCharacter("left-cleaver", 20, 100, [cleave, createSkill("left-wait")]),
        createCharacter("left-ally", 1, 100),
      ],
    },
    rightTeam: {
      side: "right",
      members: [
        createCharacter("right-front", 1, 100),
        createCharacter("right-back", 1, 100),
      ],
    },
    preparedAt: TIMESTAMP,
  };

  const initialState = createInitialTeamBattleState(preparation);
  const result = simulateTeamBattle(preparation);
  const event = result.events.find((candidate) => candidate.skill?.id === cleave.id);

  assert.equal(initialState.left[0]?.effectiveStats.attack, 13);
  assert.ok(event);
  assert.deepEqual(event.targets.map((target) => target.position), [1, 2]);
  assert.equal(event.targets.every((target) => target.rawDamage === 13), true);
  assert.equal(event.targets.every((target) => target.side === "right"), true);
});

test("charge strike replaces actions with charging, then releases fixed front-line damage", () => {
  const chargeStrike = createSkill("left-charge", "charge_strike_passive", {
    activation: "passive",
    target: "self",
    cooldown: 0,
    chargeTurns: 3,
  });
  const preparation: TeamBattlePreparation = {
    rulesVersion: 2,
    seed: "charge-strike-passive",
    leftTeam: {
      side: "left",
      members: [
        createCharacter("left-charger", 10, 100, [chargeStrike, createSkill("left-wait")]),
        createCharacter("left-ally", 1, 100),
      ],
    },
    rightTeam: {
      side: "right",
      members: [
        createCharacter("right-front", 1, 100),
        createCharacter("right-back", 1, 100),
      ],
    },
    preparedAt: TIMESTAMP,
  };

  const result = simulateTeamBattle(preparation);
  const chargeEvents = result.events.filter(
    (event) => event.skill?.id === chargeStrike.id,
  );

  assert.ok(chargeEvents.length >= 3);
  assert.deepEqual(
    chargeEvents.slice(0, 2).map((event) => [event.targets.length, event.actor.chargeProgress]),
    [[0, 1], [0, 2]],
  );
  const releaseEvent = chargeEvents[2];
  assert.ok(releaseEvent);
  assert.equal(releaseEvent.actor.chargeProgress, 0);
  assert.equal(releaseEvent.targets.length, 1);
  assert.equal(releaseEvent.targets[0]?.position, 1);
  assert.equal(releaseEvent.targets[0]?.rawDamage, 30);
});

test("stunned charge strike still advances its charge progress", () => {
  const chargeStrike = createSkill("left-charge", "charge_strike_passive", {
    activation: "passive",
    target: "self",
    cooldown: 0,
    chargeTurns: 3,
  });
  const guaranteedStun = createSkill("right-stun", "control", {
    activation: "active",
    target: "enemy_front",
    cooldown: 1,
    stunChance: 1,
  });
  const preparation: TeamBattlePreparation = {
    rulesVersion: 2,
    seed: "stunned-charge-strike",
    leftTeam: {
      side: "left",
      members: [
        createCharacter("left-charger", 10, 100, [chargeStrike, createSkill("left-wait")]),
        createCharacter("left-ally", 1, 100),
      ],
    },
    rightTeam: {
      side: "right",
      members: [
        createCharacter("right-controller", 1, 100, [guaranteedStun, createSkill("right-wait")]),
        createCharacter("right-ally", 1, 100),
      ],
    },
    preparedAt: TIMESTAMP,
  };

  const result = simulateTeamBattle(preparation);
  const skippedChargeEvent = result.events.find(
    (event) =>
      event.actor.characterId === "left-charger"
      && event.narration.includes("蓄力推进"),
  );

  assert.ok(skippedChargeEvent);
  assert.equal(skippedChargeEvent.targets.length, 0);
  assert.ok(skippedChargeEvent.actor.chargeProgress > 0);
});
