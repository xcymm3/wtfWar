import type { Character } from "@/types/character";

import { gameStoreSchema } from "@/lib/schemas/gameStore";

const STORAGE_KEY = "war-ai-game.store.v1";

export type GameStore = {
  version: 1;
  characters: Character[];
  settings: {
    soundEnabled: boolean;
  };
};

export function createDefaultGameStore(): GameStore {
  return {
    version: 1,
    characters: [],
    settings: { soundEnabled: true },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getLegacySkillTarget(value: unknown): string {
  switch (value) {
    case "damage":
    case "critical":
    case "control":
      return "enemy_front";
    case "area_damage":
    case "area_control":
      return "enemies_all";
    case "heal":
      return "ally_front";
    case "area_heal":
      return "allies_all";
    default:
      return "self";
  }
}

function migrateLegacyCharacter(value: unknown): {
  character: unknown;
  didMigrate: boolean;
} {
  if (!isRecord(value)) return { character: value, didMigrate: false };

  let didMigrate = value.realm === undefined;
  const skills = Array.isArray(value.skills)
    ? value.skills.map((skill) => {
      if (!isRecord(skill)) return skill;
      const isPassive =
        typeof skill.type === "string" && skill.type.endsWith("_passive");
      const hasCanonicalFields =
        skill.activation !== undefined &&
        skill.target !== undefined &&
        skill.cooldown !== undefined;
      if (hasCanonicalFields) return skill;

      didMigrate = true;
      return {
        ...skill,
        activation: skill.activation ?? (isPassive ? "passive" : "active"),
        target: skill.target ?? getLegacySkillTarget(skill.type),
        cooldown: skill.cooldown ?? (isPassive ? 0 : 1),
      };
    })
    : value.skills;

  return {
    character: didMigrate
      ? { ...value, realm: value.realm ?? "mortal", skills }
      : value,
    didMigrate,
  };
}

function migrateLegacyGameStore(parsedStore: unknown): {
  store: unknown;
  didMigrate: boolean;
} {
  if (!isRecord(parsedStore)) return { store: parsedStore, didMigrate: false };

  let didMigrate = "battles" in parsedStore || "teamBattles" in parsedStore;
  const characters = Array.isArray(parsedStore.characters)
    ? parsedStore.characters.map((character) => {
      const migratedCharacter = migrateLegacyCharacter(character);
      didMigrate ||= migratedCharacter.didMigrate;
      return migratedCharacter.character;
    })
    : parsedStore.characters;

  return {
    store: {
      version: parsedStore.version,
      characters,
      settings: parsedStore.settings,
    },
    didMigrate,
  };
}

export function loadGameStore(): GameStore {
  if (typeof window === "undefined") return createDefaultGameStore();

  try {
    const rawStore = window.localStorage.getItem(STORAGE_KEY);
    if (!rawStore) return createDefaultGameStore();

    const migratedStore = migrateLegacyGameStore(JSON.parse(rawStore));
    const result = gameStoreSchema.safeParse(migratedStore.store);
    if (!result.success) return createDefaultGameStore();

    if (migratedStore.didMigrate) saveGameStore(result.data);
    return result.data;
  } catch {
    return createDefaultGameStore();
  }
}

export function saveGameStore(store: GameStore): void {
  if (typeof window === "undefined") return;

  const parsedStore = gameStoreSchema.safeParse(store);
  if (!parsedStore.success) {
    throw new Error("Cannot persist an invalid game store.");
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(parsedStore.data));
}
