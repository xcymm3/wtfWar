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

test("alternates team turns by formation position and only targets the current front", () => {
  const preparation = createPreparation();
  preparation.rightTeam.members[0]!.maxHealth = 100;
  const firstResult = simulateTeamBattle(preparation);
  const secondResult = simulateTeamBattle(preparation);

  assert.deepEqual(firstResult, secondResult);
  assert.equal(firstResult.status, "finished");
  assert.ok(firstResult.events.length > 0);

  const roundOneEvents = firstResult.events.filter((event) => event.round === 1);
  assert.deepEqual(
    roundOneEvents.slice(0, 4).map((event) => [event.actor.side, event.actor.position]),
    [["left", 1], ["right", 1], ["left", 2], ["right", 2]],
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

test("allows teams with different member counts", () => {
  const preparation = createPreparation();
  preparation.rightTeam.members = [preparation.rightTeam.members[0]!];
  preparation.leftTeam.members[0]!.attack = 1;
  preparation.rightTeam.members[0]!.maxHealth = 1_000;

  const initialState = createInitialTeamBattleState(preparation);
  const result = simulateTeamBattle(preparation);

  assert.equal(initialState.left.length, 2);
  assert.equal(initialState.right.length, 1);
  assert.equal(result.status, "finished");
  assert.ok(result.events.some((event) => event.actor.side === "left" && event.actor.position === 2));
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
    damageMultiplier: 0.6,
    usageText: "引动风雷，施展",
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
  assert.match(event.narration, /引动风雷，施展 left-storm攻击敌方全体/);
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

test("heal skills restore the allied front instead of the caster", () => {
  const healFront = createSkill("left-heal-front", "heal", {
    activation: "active",
    target: "ally_front",
    cooldown: 1,
    healAmount: 30,
  });
  const preparation: TeamBattlePreparation = {
    rulesVersion: 2,
    seed: "heal-front-target",
    leftTeam: {
      side: "left",
      members: [
        createCharacter("left-front", 1, 100),
        createCharacter("left-healer", 1, 100, [healFront, createSkill("left-wait")]),
      ],
    },
    rightTeam: {
      side: "right",
      members: [
        createCharacter("right-bruiser", 80, 100),
        createCharacter("right-back", 1, 100),
      ],
    },
    preparedAt: TIMESTAMP,
  };

  const result = simulateTeamBattle(preparation);
  const healEvent = result.events.find((event) => event.skill?.id === healFront.id);

  assert.ok(healEvent);
  assert.equal(healEvent.targets.length, 1);
  assert.equal(healEvent.targets[0]?.side, "left");
  assert.equal(healEvent.targets[0]?.position, 1);
  assert.equal(healEvent.targets[0]?.characterId, "left-front");
  assert.ok((healEvent.targets[0]?.healing ?? 0) > 0);
});

test("area control stuns every living enemy for their next action", () => {
  const areaControl = createSkill("left-freeze-all", "area_control", {
    activation: "active",
    target: "enemies_all",
    cooldown: 5,
    stunChance: 1,
  });
  const preparation: TeamBattlePreparation = {
    rulesVersion: 2,
    seed: "area-control-all",
    leftTeam: {
      side: "left",
      members: [
        createCharacter("left-controller", 1, 100, [areaControl, createSkill("left-wait")]),
        createCharacter("left-ally", 1, 100),
      ],
    },
    rightTeam: {
      side: "right",
      members: [
        createCharacter("right-front", 10, 100),
        createCharacter("right-back", 10, 100),
      ],
    },
    preparedAt: TIMESTAMP,
  };

  const result = simulateTeamBattle(preparation);
  const controlEvent = result.events.find((event) => event.skill?.id === areaControl.id);
  const skippedActors = result.events.filter((event) => event.narration.includes("处于眩晕状态"));

  assert.ok(controlEvent);
  assert.equal(controlEvent.targets.length, 2);
  assert.equal(controlEvent.targets.every((target) => target.targetStunned), true);
  assert.equal(skippedActors.some((event) => event.actor.characterId === "right-front"), true);
  assert.equal(skippedActors.some((event) => event.actor.characterId === "right-back"), true);
});

test("invincible blocks damage for the current round and then expires", () => {
  const invincible = createSkill("left-invincible", "invincible", {
    activation: "active",
    target: "self",
    cooldown: 3,
  });
  const preparation: TeamBattlePreparation = {
    rulesVersion: 2,
    seed: "invincible-expiry",
    leftTeam: {
      side: "left",
      members: [
        createCharacter("left-guardian", 1, 100, [invincible, createSkill("left-wait")]),
      ],
    },
    rightTeam: {
      side: "right",
      members: [
        createCharacter("right-hitter", 70, 100),
      ],
    },
    preparedAt: TIMESTAMP,
  };

  const result = simulateTeamBattle(preparation);
  const invincibleEvent = result.events.find((event) => event.skill?.id === invincible.id);
  const rightAttacks = result.events.filter((event) => event.actor.characterId === "right-hitter");

  assert.ok(invincibleEvent);
  assert.equal(invincibleEvent.round, 2);
  assert.equal(rightAttacks[0]?.targets[0]?.health, 30);
  assert.equal(rightAttacks[1]?.targets[0]?.targetInvincible, true);
  assert.equal(rightAttacks[1]?.targets[0]?.health, 30);
  assert.equal((rightAttacks[2]?.targets[0]?.health ?? 30) < 30, true);
});

test("critical skills heal the actor after dealing damage", () => {
  const critical = createSkill("left-critical", "critical", {
    activation: "active",
    target: "enemy_front",
    cooldown: 1,
    damageMultiplier: 2,
  });
  const areaDamage = createSkill("right-area", "area_damage", {
    activation: "active",
    target: "enemies_all",
    cooldown: 1,
    damageMultiplier: 0.6,
  });
  const preparation: TeamBattlePreparation = {
    rulesVersion: 2,
    seed: "critical-heals-actor",
    leftTeam: {
      side: "left",
      members: [
        createCharacter("left-front", 1, 100),
        createCharacter("left-crit", 20, 100, [critical, createSkill("left-wait")]),
      ],
    },
    rightTeam: {
      side: "right",
      members: [
        createCharacter("right-caster", 20, 100, [areaDamage, createSkill("right-wait")]),
        createCharacter("right-ally", 1, 100),
      ],
    },
    preparedAt: TIMESTAMP,
  };

  const result = simulateTeamBattle(preparation);
  const criticalEvent = result.events.find((event) => event.skill?.id === critical.id);

  assert.ok(criticalEvent);
  assert.ok(criticalEvent.actorHealing > 0);
  assert.equal(criticalEvent.targets[0]?.side, "right");
  assert.equal(criticalEvent.targets[0]?.damage > 0, true);
});

test("lifesteal heals after damage skills land", () => {
  const strike = createSkill("left-strike", "damage", {
    activation: "active",
    target: "enemy_front",
    cooldown: 1,
    damageMultiplier: 1.2,
  });
  const lifesteal = createSkill("left-lifesteal", "lifesteal_passive", {
    activation: "passive",
    target: "self",
    cooldown: 0,
    damageMultiplier: 0.5,
  });
  const preparation: TeamBattlePreparation = {
    rulesVersion: 2,
    seed: "lifesteal-after-skill",
    leftTeam: {
      side: "left",
      members: [
        createCharacter("left-drain", 20, 100, [strike, lifesteal]),
      ],
    },
    rightTeam: {
      side: "right",
      members: [
        createCharacter("right-front", 20, 120),
      ],
    },
    preparedAt: TIMESTAMP,
  };

  const result = simulateTeamBattle(preparation);
  const healedStrike = result.events.find(
    (event) => event.skill?.id === strike.id && event.actorHealing > 0,
  );

  assert.ok(healedStrike);
  assert.equal(healedStrike.round, 2);
});

test("growth passive increases attack after each completed action", () => {
  const shield = createSkill("left-shield", "shield", {
    activation: "active",
    target: "self",
    cooldown: 5,
    shieldAmount: 20,
  });
  const growth = createSkill("left-growth", "growth_passive", {
    activation: "passive",
    target: "self",
    cooldown: 0,
    damageMultiplier: 0.2,
  });
  const preparation: TeamBattlePreparation = {
    rulesVersion: 2,
    seed: "growth-after-action",
    leftTeam: {
      side: "left",
      members: [
        createCharacter("left-grower", 10, 100, [shield, growth]),
      ],
    },
    rightTeam: {
      side: "right",
      members: [
        createCharacter("right-dummy", 1, 100),
      ],
    },
    preparedAt: TIMESTAMP,
  };

  const result = simulateTeamBattle(preparation);
  const leftAttacks = result.events.filter(
    (event) => event.actor.characterId === "left-grower" && event.skill === null,
  );

  assert.ok(leftAttacks.length >= 2);
  assert.equal(leftAttacks[0]?.targets[0]?.rawDamage, 10);
  assert.equal((leftAttacks[1]?.targets[0]?.rawDamage ?? 0) > 10, true);
});

test("revive passive brings a defeated target back at half health", () => {
  const strike = createSkill("left-heavy", "damage", {
    activation: "active",
    target: "enemy_front",
    cooldown: 1,
    damageMultiplier: 1.8,
  });
  const revive = createSkill("right-revive", "revive_passive", {
    activation: "passive",
    target: "self",
    cooldown: 0,
  });
  const preparation: TeamBattlePreparation = {
    rulesVersion: 2,
    seed: "revive-half-health",
    leftTeam: {
      side: "left",
      members: [
        createCharacter("left-slayer", 30, 100, [strike, createSkill("left-wait")]),
      ],
    },
    rightTeam: {
      side: "right",
      members: [
        createCharacter("right-phoenix", 1, 40, [revive, createSkill("right-wait")]),
      ],
    },
    preparedAt: TIMESTAMP,
  };

  const result = simulateTeamBattle(preparation);
  const reviveHit = result.events.find((event) => event.targets.some((target) => target.targetRevived));

  assert.ok(reviveHit);
  assert.equal(reviveHit.targets[0]?.targetRevived, true);
  assert.equal(reviveHit.targets[0]?.health, 20);
});

test("assassin passive lowers attack and retargets single-target skills to the rear", () => {
  const strike = createSkill("left-assassin-strike", "damage", {
    activation: "active",
    target: "enemy_front",
    cooldown: 1,
    damageMultiplier: 1.2,
  });
  const assassin = createSkill("left-assassin-passive", "assassin_passive", {
    activation: "passive",
    target: "self",
    cooldown: 0,
  });
  const preparation: TeamBattlePreparation = {
    rulesVersion: 2,
    seed: "assassin-retargets-skill",
    leftTeam: {
      side: "left",
      members: [
        createCharacter("left-assassin", 20, 100, [strike, assassin]),
      ],
    },
    rightTeam: {
      side: "right",
      members: [
        createCharacter("right-front", 1, 120),
        createCharacter("right-back", 1, 120),
      ],
    },
    preparedAt: TIMESTAMP,
  };

  const initialState = createInitialTeamBattleState(preparation);
  const result = simulateTeamBattle(preparation);
  const strikeEvent = result.events.find((event) => event.skill?.id === strike.id);

  assert.equal(initialState.left[0]?.effectiveStats.attack, 16);
  assert.ok(strikeEvent);
  assert.equal(strikeEvent.targets[0]?.position, 2);
  assert.equal(strikeEvent.targets[0]?.characterId, "right-back");
});
