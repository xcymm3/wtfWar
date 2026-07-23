import type { BattleRecord, TeamBattleRecord } from "@/types/battle";
import type { Character } from "@/types/character";

import { gameStoreSchema } from "@/lib/schemas/gameStore";

const STORAGE_KEY = "war-ai-game.store.v1";
const MAX_STORED_BATTLES = 100;

export type GameStore = {
  version: 1;
  characters: Character[];
  battles: BattleRecord[];
  teamBattles: TeamBattleRecord[];
  settings: {
    soundEnabled: boolean;
  };
};

export function createDefaultGameStore(): GameStore {
  return {
    version: 1,
    characters: [],
    battles: [],
    teamBattles: [],
    settings: { soundEnabled: true },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasCooldownSnapshot(value: unknown): boolean {
  return isRecord(value) && Object.values(value).every(
    (cooldown) => typeof cooldown === "number" && Number.isInteger(cooldown) && cooldown >= 0,
  );
}

function getLegacySkillTarget(value: unknown): string {
  switch (value) {
    case "damage":
    case "control":
      return "enemy_front";
    case "area_damage":
      return "enemies_all";
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
        skill.type === "cleave_passive" || skill.type === "charge_strike_passive";
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
  if (!isRecord(parsedStore)) {
    return { store: parsedStore, didMigrate: false };
  }

  let didMigrate = false;
  const characters = Array.isArray(parsedStore.characters)
    ? parsedStore.characters.map((character) => {
      const migratedCharacter = migrateLegacyCharacter(character);
      didMigrate ||= migratedCharacter.didMigrate;
      return migratedCharacter.character;
    })
    : parsedStore.characters;
  const battles = Array.isArray(parsedStore.battles)
    ? parsedStore.battles.map((battle) => {
      if (!isRecord(battle)) return battle;

      const leftCharacter = migrateLegacyCharacter(battle.leftCharacter);
      const rightCharacter = migrateLegacyCharacter(battle.rightCharacter);
      didMigrate ||= leftCharacter.didMigrate || rightCharacter.didMigrate;
      const needsRulesVersion = battle.rulesVersion === undefined;
      didMigrate ||= needsRulesVersion;
      if (!Array.isArray(battle.events)) {
        return {
          ...battle,
          ...(needsRulesVersion ? { rulesVersion: 1 } : {}),
          leftCharacter: leftCharacter.character,
          rightCharacter: rightCharacter.character,
        };
      }

      const events = battle.events.map((event) => {
        if (!isRecord(event)) return event;

        const hasSnapshots =
          hasCooldownSnapshot(event.actorCooldowns) &&
          hasCooldownSnapshot(event.targetCooldowns) &&
          typeof event.actorIsStunned === "boolean" &&
          typeof event.targetIsStunned === "boolean";
        if (hasSnapshots) return event;

        didMigrate = true;
        return {
          ...event,
          actorCooldowns: hasCooldownSnapshot(event.actorCooldowns)
            ? event.actorCooldowns
            : {},
          targetCooldowns: hasCooldownSnapshot(event.targetCooldowns)
            ? event.targetCooldowns
            : {},
          actorIsStunned:
            typeof event.actorIsStunned === "boolean"
              ? event.actorIsStunned
              : false,
          targetIsStunned:
            typeof event.targetIsStunned === "boolean"
              ? event.targetIsStunned
              : event.targetStunned === true,
        };
      });

      return {
        ...battle,
        ...(needsRulesVersion ? { rulesVersion: 1 } : {}),
        leftCharacter: leftCharacter.character,
        rightCharacter: rightCharacter.character,
        events,
      };
    })
    : parsedStore.battles;
  const teamBattles = Array.isArray(parsedStore.teamBattles)
    ? parsedStore.teamBattles
    : [];
  if (!Array.isArray(parsedStore.teamBattles)) didMigrate = true;

  return {
    store: didMigrate
      ? { ...parsedStore, characters, battles, teamBattles }
      : parsedStore,
    didMigrate,
  };
}

export function loadGameStore(): GameStore {
  if (typeof window === "undefined") return createDefaultGameStore();

  try {
    const rawStore = window.localStorage.getItem(STORAGE_KEY);
    if (!rawStore) return createDefaultGameStore();

    const parsedStore: unknown = JSON.parse(rawStore);
    const migratedStore = migrateLegacyGameStore(parsedStore);
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

  const parsedStore = gameStoreSchema.safeParse({
    ...store,
    battles: store.battles.slice(-MAX_STORED_BATTLES),
    teamBattles: (store.teamBattles ?? []).slice(-MAX_STORED_BATTLES),
  });

  if (!parsedStore.success) {
    throw new Error("Cannot persist an invalid game store.");
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(parsedStore.data));
}
