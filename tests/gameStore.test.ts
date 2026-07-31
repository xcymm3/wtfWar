import assert from "node:assert/strict";
import test from "node:test";

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
        stunChance: 1,
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

test("builds teams in a mutable front-to-back order", () => {
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

    store.getState().setTeamCharacterIds({
      left: [leftOne.id, leftThree.id, leftTwo.id],
      right: [rightOne.id, rightTwo.id, rightThree.id],
    });
    assert.deepEqual(store.getState().teamCharacterIds.left, [
      leftOne.id,
      leftThree.id,
      leftTwo.id,
    ]);
    assert.throws(
      () => store.getState().setTeamCharacterIds({
        left: [leftOne.id],
        right: [leftOne.id],
      }),
      /both teams/i,
    );
    store.getState().prepareTeamBattle("five-a-side-seed");

    const preparedTeam = store.getState().preparedTeamBattle;
    assert.equal(typeof preparedTeam?.id, "string");
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

test("prepares teams with different member counts", () => {
  withMemoryStorage(() => {
    const store = createGameStore();
    const leftFront = createCharacter("uneven-left-front");
    const leftBack = createCharacter("uneven-left-back");
    const rightFront = createCharacter("uneven-right-front");
    store.getState().hydrate();

    [leftFront, leftBack, rightFront].forEach((character) => store.getState().addCharacter(character));
    store.getState().addCharacterToTeam("left", leftFront.id);
    store.getState().addCharacterToTeam("left", leftBack.id);
    store.getState().addCharacterToTeam("right", rightFront.id);
    store.getState().prepareTeamBattle("uneven-team-seed");

    assert.equal(store.getState().preparedTeamBattle?.leftTeam.members.length, 2);
    assert.equal(store.getState().preparedTeamBattle?.rightTeam.members.length, 1);
  });
});

test("discards legacy battle records while preserving the saved library", () => {
  withMemoryStorage((storage) => {
    const leftCharacter = createCharacter("legacy-left");
    const rightCharacter = createCharacter("legacy-right");

    const legacyCharacters = [leftCharacter, rightCharacter].map((character) => ({
      ...character,
      realm: undefined,
      skills: character.skills.map((skill) => ({
        ...skill,
        activation: undefined,
        target: undefined,
      })),
    }));
    storage.setItem(
      "war-ai-game.store.v1",
      JSON.stringify({
        version: 1,
        characters: legacyCharacters,
        battles: [{ id: "obsolete-record" }],
        teamBattles: [{ id: "obsolete-team-record" }],
        settings: { soundEnabled: true },
      }),
    );

    const migrated = loadGameStore();
    assert.equal(migrated.characters[0]?.realm, "mortal");
    assert.equal(migrated.characters[0]?.skills[0]?.activation, "active");
    assert.equal(migrated.characters[0]?.skills[0]?.target, "enemy_front");
    assert.deepEqual(Object.keys(migrated), ["version", "characters", "settings"]);
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
