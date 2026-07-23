import assert from "node:assert/strict";
import test from "node:test";

import { simulateBattle } from "../lib/battle/battleEngine";
import { createBattleRecord } from "../lib/battle/battleRecord";
import { createTeamBattleRecord } from "../lib/battle/teamBattleRecord";
import { simulateTeamBattle } from "../lib/battle/teamBattleEngine";
import { createGameStore } from "../lib/store/gameStore";
import { loadGameStore, saveGameStore } from "../lib/storage/gameStorage";
import type { Character } from "../types/character";

const TIMESTAMP = "2026-07-23T00:00:00.000Z";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function createCharacter(id = "warrior-one"): Character {
  return {
    id,
    name: "Warrior One",
    originalPrompt: "A durable front-line fighter.",
    profession: "warrior",
    realm: "mortal",
    attack: 18,
    maxHealth: 140,
    skills: [
      {
        id: `${id}-slash`,
        name: "Slash",
        description: "A reliable strike.",
        type: "damage",
        activation: "active",
        target: "enemy_front",
        cooldown: 2,
        damageMultiplier: 1.3,
      },
      {
        id: `${id}-roar`,
        name: "Roar",
        description: "A short stun.",
        type: "control",
        activation: "active",
        target: "enemy_front",
        cooldown: 3,
        stunChance: 0.3,
      },
    ],
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  };
}

function withMemoryStorage(run: (storage: MemoryStorage) => void): void {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const storage = new MemoryStorage();

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: storage },
  });

  try {
    run(storage);
  } finally {
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", originalWindow);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  }
}

test("hydrates saved characters and keeps selection only in the active session", () => {
  withMemoryStorage(() => {
    const savedCharacter = createCharacter();
    saveGameStore({
      version: 1,
      characters: [savedCharacter],
      battles: [],
      settings: { soundEnabled: false },
    });
    const store = createGameStore();

    assert.equal(store.getState().hasHydrated, false);
    store.getState().hydrate();

    assert.equal(store.getState().hasHydrated, true);
    assert.deepEqual(store.getState().characters, [savedCharacter]);
    assert.deepEqual(store.getState().selectedCharacterIds, {
      left: null,
      right: null,
    });
    assert.equal(store.getState().settings.soundEnabled, false);
  });
});

test("adds, edits, selects, deletes, and persists library characters", () => {
  withMemoryStorage(() => {
    const store = createGameStore();
    store.getState().hydrate();
    const character = createCharacter();

    store.getState().addCharacter(character);
    store.getState().updateCharacter(character.id, {
      name: "Updated Warrior",
      attack: 22,
    });
    store.getState().selectCharacter("left", character.id);
    store.getState().selectCharacter("right", character.id);

    const updatedCharacter = store.getState().characters[0];
    assert.equal(updatedCharacter.name, "Updated Warrior");
    assert.equal(updatedCharacter.attack, 22);
    assert.equal(updatedCharacter.createdAt, TIMESTAMP);
    assert.notEqual(updatedCharacter.updatedAt, TIMESTAMP);
    assert.deepEqual(store.getState().selectedCharacterIds, {
      left: character.id,
      right: character.id,
    });
    store.getState().prepareBattle("rematch-seed");
    assert.equal(store.getState().preparedBattle?.seed, "rematch-seed");
    assert.equal(store.getState().preparedBattle?.leftCharacterId, character.id);
    assert.equal(store.getState().preparedBattle?.rightCharacterId, character.id);
    assert.deepEqual(store.getState().preparedBattle?.leftCharacter, updatedCharacter);

    store.getState().selectCharacter("left", null);
    assert.equal(store.getState().preparedBattle, null);
    assert.throws(
      () => store.getState().prepareBattle("missing-combatant"),
      /select both combatants/i,
    );
    store.getState().selectCharacter("left", character.id);
    store.getState().prepareBattle("final-seed");
    assert.deepEqual(loadGameStore().characters, [updatedCharacter]);
    assert.throws(() => store.getState().addCharacter(character), /already exists/i);
    assert.throws(
      () => store.getState().selectCharacter("left", "unknown-character"),
      /does not exist/i,
    );

    store.getState().removeCharacter(character.id);

    assert.deepEqual(store.getState().characters, []);
    assert.equal(store.getState().preparedBattle, null);
    assert.deepEqual(store.getState().selectedCharacterIds, {
      left: null,
      right: null,
    });
    assert.deepEqual(loadGameStore().characters, []);
  });
});

test("builds equal teams in a mutable front-to-back order", () => {
  withMemoryStorage(() => {
    const store = createGameStore();
    const leftOne = createCharacter("team-left-one");
    const leftTwo = createCharacter("team-left-two");
    const leftThree = createCharacter("team-left-three");
    const rightOne = createCharacter("team-right-one");
    const rightTwo = createCharacter("team-right-two");
    const rightThree = createCharacter("team-right-three");
    store.getState().hydrate();

    [leftOne, leftTwo, leftThree, rightOne, rightTwo, rightThree].forEach(
      (character) => store.getState().addCharacter(character),
    );
    store.getState().addCharacterToTeam("left", leftOne.id);
    store.getState().addCharacterToTeam("left", leftTwo.id);
    store.getState().addCharacterToTeam("left", leftThree.id);
    store.getState().addCharacterToTeam("right", rightOne.id);
    store.getState().addCharacterToTeam("right", rightTwo.id);
    store.getState().addCharacterToTeam("right", rightThree.id);
    assert.throws(
      () => store.getState().addCharacterToTeam("right", leftOne.id),
      /both teams/i,
    );

    store.getState().moveTeamCharacter("left", leftThree.id, -1);
    assert.deepEqual(store.getState().teamCharacterIds.left, [
      leftOne.id,
      leftThree.id,
      leftTwo.id,
    ]);
    store.getState().prepareTeamBattle("five-a-side-seed");

    const preparedTeam = store.getState().preparedTeamBattle;
    assert.equal(preparedTeam?.rulesVersion, 2);
    assert.equal(preparedTeam?.seed, "five-a-side-seed");
    assert.deepEqual(
      preparedTeam?.leftTeam.members.map((character) => character.id),
      [leftOne.id, leftThree.id, leftTwo.id],
    );
    assert.deepEqual(
      preparedTeam?.rightTeam.members.map((character) => character.id),
      [rightOne.id, rightTwo.id, rightThree.id],
    );

    store.getState().removeCharacterFromTeam("left", leftOne.id);
    assert.equal(store.getState().preparedTeamBattle, null);
  });
});

test("saves replayable team reports and prepares historical team rematches", () => {
  withMemoryStorage(() => {
    const store = createGameStore();
    const leftFront = createCharacter("team-report-left-front");
    const leftBack = createCharacter("team-report-left-back");
    const rightFront = createCharacter("team-report-right-front");
    const rightBack = createCharacter("team-report-right-back");
    store.getState().hydrate();

    [leftFront, leftBack, rightFront, rightBack].forEach(
      (character) => store.getState().addCharacter(character),
    );
    store.getState().addCharacterToTeam("left", leftFront.id);
    store.getState().addCharacterToTeam("left", leftBack.id);
    store.getState().addCharacterToTeam("right", rightFront.id);
    store.getState().addCharacterToTeam("right", rightBack.id);
    store.getState().prepareTeamBattle("team-history-seed");

    const preparation = store.getState().preparedTeamBattle;
    assert.ok(preparation);
    const result = simulateTeamBattle(preparation);
    const record = createTeamBattleRecord({
      seed: preparation.seed,
      leftTeam: preparation.leftTeam,
      rightTeam: preparation.rightTeam,
      winner: result.winner ?? "draw",
      rounds: result.round,
      events: result.events,
    });
    store.getState().saveTeamBattleRecord(record);

    assert.equal(store.getState().teamBattles.length, 1);
    assert.equal(loadGameStore().teamBattles[0]?.id, record.id);
    store.getState().openTeamBattleReplay(record.id);
    assert.equal(store.getState().activeReplayTeamBattleId, record.id);
    assert.equal(store.getState().activeReplayBattleId, null);

    store.getState().startHistoricalTeamRematch(record.id);
    assert.equal(store.getState().activeReplayTeamBattleId, null);
    assert.equal(store.getState().preparedTeamBattle?.seed, "team-history-seed");
    assert.deepEqual(
      store.getState().preparedTeamBattle?.leftTeam.members.map((character) => character.id),
      [leftFront.id, leftBack.id],
    );
  });
});

test("saves battle records, replays snapshots, and prepares historical rematches", () => {
  withMemoryStorage(() => {
    const store = createGameStore();
    const leftCharacter = createCharacter("red-warrior");
    const rightCharacter = createCharacter("blue-warrior");
    store.getState().hydrate();
    store.getState().addCharacter(leftCharacter);
    store.getState().addCharacter(rightCharacter);
    store.getState().selectCharacter("left", leftCharacter.id);
    store.getState().selectCharacter("right", rightCharacter.id);
    store.getState().prepareBattle("history-seed");

    const result = simulateBattle({
      seed: "history-seed",
      leftCharacter,
      rightCharacter,
    });
    const record = createBattleRecord({
      seed: "history-seed",
      leftCharacter,
      rightCharacter,
      winner: result.winner,
      rounds: result.round,
      events: result.events,
    });
    store.getState().saveBattleRecord(record);

    assert.equal(store.getState().battles.length, 1);
    assert.equal(loadGameStore().battles[0]?.id, record.id);
    store.getState().openBattleReplay(record.id);
    assert.equal(store.getState().activeReplayBattleId, record.id);
    assert.equal(store.getState().preparedBattle, null);

    store.getState().startHistoricalRematch(record.id);
    assert.equal(store.getState().activeReplayBattleId, null);
    assert.equal(store.getState().preparedBattle?.seed, "history-seed");
    assert.deepEqual(store.getState().preparedBattle?.leftCharacter, record.leftCharacter);
  });
});

test("migrates legacy battle events without discarding the saved library", () => {
  withMemoryStorage((storage) => {
    const leftCharacter = createCharacter("legacy-left");
    const rightCharacter = createCharacter("legacy-right");
    const result = simulateBattle({
      seed: "legacy-seed",
      leftCharacter,
      rightCharacter,
    });
    const record = createBattleRecord({
      seed: "legacy-seed",
      leftCharacter,
      rightCharacter,
      winner: result.winner,
      rounds: result.round,
      events: result.events,
    });
    const legacyEvents = record.events.map((event) => {
      const legacyEvent: Record<string, unknown> = { ...event };
      delete legacyEvent.actorCooldowns;
      delete legacyEvent.targetCooldowns;
      delete legacyEvent.actorIsStunned;
      delete legacyEvent.targetIsStunned;
      return legacyEvent;
    });

    const legacyCharacters = [leftCharacter, rightCharacter].map((character) => ({
      ...character,
      realm: undefined,
      skills: character.skills.map((skill) => ({
        ...skill,
        activation: undefined,
        target: undefined,
      })),
    }));
    const legacyRecord: Record<string, unknown> = {
      ...record,
      rulesVersion: undefined,
      leftCharacter: legacyCharacters[0],
      rightCharacter: legacyCharacters[1],
      events: legacyEvents,
    };
    delete legacyRecord.rulesVersion;

    storage.setItem(
      "war-ai-game.store.v1",
      JSON.stringify({
        version: 1,
        characters: legacyCharacters,
        battles: [legacyRecord],
        settings: { soundEnabled: true },
      }),
    );

    const migrated = loadGameStore();
    assert.equal(migrated.characters[0]?.realm, "mortal");
    assert.equal(migrated.characters[0]?.skills[0]?.activation, "active");
    assert.equal(migrated.characters[0]?.skills[0]?.target, "enemy_front");
    assert.equal(migrated.battles[0]?.rulesVersion, 1);
    assert.deepEqual(migrated.teamBattles, []);
    assert.equal(migrated.battles[0]?.leftCharacter.realm, "mortal");
    assert.deepEqual(migrated.battles[0]?.events[0]?.actorCooldowns, {});
    assert.deepEqual(migrated.battles[0]?.events[0]?.targetCooldowns, {});
    assert.equal(typeof migrated.battles[0]?.events[0]?.actorIsStunned, "boolean");
    assert.equal(typeof migrated.battles[0]?.events[0]?.targetIsStunned, "boolean");
  });
});

test("adds missing presets without overwriting an existing preset card", () => {
  withMemoryStorage(() => {
    const store = createGameStore();
    store.getState().hydrate();

    assert.equal(store.getState().addPresetCharacters(), 10);
    assert.equal(store.getState().characters.length, 10);
    assert.equal(store.getState().addPresetCharacters(), 0);

    store.getState().updateCharacter("preset-tank-guardian", { name: "自定义护卫" });
    assert.equal(store.getState().addPresetCharacters(), 0);
    assert.equal(
      store.getState().characters.find((character) => character.id === "preset-tank-guardian")?.name,
      "自定义护卫",
    );
  });
});
