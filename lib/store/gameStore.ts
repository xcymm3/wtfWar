import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

import { characterSchema } from "@/lib/schemas/character";
import { getPresetCharacters } from "@/lib/characters/presetCharacters";
import {
  createDefaultGameStore,
  loadGameStore,
  saveGameStore,
  type GameStore,
} from "@/lib/storage/gameStorage";
import type {
  BattlePreparation,
  BattleSide,
  TeamBattlePreparation,
  TeamFormation,
} from "@/types/battle";
import type { Character } from "@/types/character";

export type CharacterUpdate = Partial<
  Omit<Character, "id" | "createdAt" | "updatedAt">
>;

export type SelectedCharacterIds = Record<BattleSide, string | null>;
export type TeamCharacterIds = Record<BattleSide, string[]>;

export type GameStoreState = GameStore & {
  hasHydrated: boolean;
  selectedCharacterIds: SelectedCharacterIds;
  preparedBattle: BattlePreparation | null;
  teamCharacterIds: TeamCharacterIds;
  preparedTeamBattle: TeamBattlePreparation | null;
  activeReplayBattleId: string | null;
  activeReplayTeamBattleId: string | null;
  hydrate: () => void;
  addCharacter: (character: Character) => void;
  updateCharacter: (characterId: string, updates: CharacterUpdate) => void;
  removeCharacter: (characterId: string) => void;
  selectCharacter: (side: BattleSide, characterId: string | null) => void;
  clearSelectedCharacters: () => void;
  prepareBattle: (seed: string) => void;
  addCharacterToTeam: (side: BattleSide, characterId: string) => void;
  removeCharacterFromTeam: (side: BattleSide, characterId: string) => void;
  moveTeamCharacter: (
    side: BattleSide,
    characterId: string,
    direction: -1 | 1,
  ) => void;
  setTeamCharacterIds: (teamCharacterIds: TeamCharacterIds) => void;
  clearTeam: (side: BattleSide) => void;
  prepareTeamBattle: (seed: string) => void;
  rematchBattle: (
    seed: string,
    leftCharacter: Character,
    rightCharacter: Character,
  ) => void;
  rematchTeamBattle: (
    seed: string,
    leftTeam: TeamFormation,
    rightTeam: TeamFormation,
  ) => void;
  clearPreparedBattle: () => void;
  clearPreparedTeamBattle: () => void;
  importCharacters: (characters: Character[]) => void;
  addPresetCharacters: () => number;
  setSoundEnabled: (soundEnabled: boolean) => void;
};

const EMPTY_SELECTION: SelectedCharacterIds = {
  left: null,
  right: null,
};

const EMPTY_TEAM_SELECTION: TeamCharacterIds = {
  left: [],
  right: [],
};

export const MAX_TEAM_SIZE = 5;

function createPersistedStore(state: GameStoreState): GameStore {
  return {
    version: state.version,
    characters: state.characters,
    settings: state.settings,
  };
}

function saveState(state: GameStoreState): void {
  saveGameStore(createPersistedStore(state));
}

function assertCharacterExists(
  characters: Character[],
  characterId: string,
): void {
  if (!characters.some((character) => character.id === characterId)) {
    throw new Error(`Character ${characterId} does not exist in the library.`);
  }
}

function createBattlePreparation(
  seed: string,
  leftCharacter: Character,
  rightCharacter: Character,
): BattlePreparation {
  const normalizedSeed = seed.trim();
  if (normalizedSeed.length === 0) {
    throw new Error("A battle seed cannot be empty.");
  }

  return {
    rulesVersion: 1,
    seed: normalizedSeed,
    leftCharacterId: leftCharacter.id,
    rightCharacterId: rightCharacter.id,
    leftCharacter,
    rightCharacter,
    preparedAt: new Date().toISOString(),
  };
}

function createTeamFormation(
  side: BattleSide,
  characters: Character[],
  memberIds: string[],
): TeamFormation {
  if (memberIds.length === 0 || memberIds.length > MAX_TEAM_SIZE) {
    throw new Error("Each team must contain between 1 and 5 characters.");
  }

  if (new Set(memberIds).size !== memberIds.length) {
    throw new Error("A character cannot occupy multiple positions on one team.");
  }

  const members = memberIds.map((characterId) => {
    const character = characters.find((candidate) => candidate.id === characterId);
    if (!character) {
      throw new Error(`Character ${characterId} is no longer available.`);
    }
    return character;
  });

  return { side, members };
}

function createTeamBattlePreparation(
  seed: string,
  characters: Character[],
  leftMemberIds: string[],
  rightMemberIds: string[],
): TeamBattlePreparation {
  const normalizedSeed = seed.trim();
  if (normalizedSeed.length === 0) {
    throw new Error("A battle seed cannot be empty.");
  }

  const allMemberIds = [...leftMemberIds, ...rightMemberIds];
  if (new Set(allMemberIds).size !== allMemberIds.length) {
    throw new Error("A character cannot appear on both teams.");
  }

  const leftTeam = createTeamFormation("left", characters, leftMemberIds);
  const rightTeam = createTeamFormation("right", characters, rightMemberIds);
  return {
    rulesVersion: 2,
    seed: normalizedSeed,
    leftTeam,
    rightTeam,
    preparedAt: new Date().toISOString(),
  };
}

function createTeamRematchPreparation(
  seed: string,
  leftTeam: TeamFormation,
  rightTeam: TeamFormation,
): TeamBattlePreparation {
  const members = [...leftTeam.members, ...rightTeam.members];
  return createTeamBattlePreparation(
    seed,
    members,
    leftTeam.members.map((member) => member.id),
    rightTeam.members.map((member) => member.id),
  );
}

export function createGameStore() {
  const defaultStore = createDefaultGameStore();

  return createStore<GameStoreState>()((set) => ({
    ...defaultStore,
    hasHydrated: false,
    selectedCharacterIds: { ...EMPTY_SELECTION },
    preparedBattle: null,
    teamCharacterIds: { ...EMPTY_TEAM_SELECTION },
    preparedTeamBattle: null,
    activeReplayBattleId: null,
    activeReplayTeamBattleId: null,

    hydrate: () => {
      const storedState = loadGameStore();

      set((state) => ({
        ...state,
        ...storedState,
        hasHydrated: true,
      }));
    },

    addCharacter: (character) => {
      const validCharacter = characterSchema.parse(character);

      set((state) => {
        if (state.characters.some((existing) => existing.id === validCharacter.id)) {
          throw new Error(`Character ${validCharacter.id} already exists in the library.`);
        }
        const nextState = {
          ...state,
          characters: [...state.characters, validCharacter],
        };
        saveState(nextState);
        return nextState;
      });
    },

    updateCharacter: (characterId, updates) => {
      set((state) => {
        const currentCharacter = state.characters.find(
          (character) => character.id === characterId,
        );
        if (!currentCharacter) {
          throw new Error(`Character ${characterId} does not exist in the library.`);
        }

        const nextCharacter = characterSchema.parse({
          ...currentCharacter,
          ...updates,
          id: currentCharacter.id,
          createdAt: currentCharacter.createdAt,
          updatedAt: new Date().toISOString(),
        });
        const nextState = {
          ...state,
          characters: state.characters.map((character) =>
            character.id === characterId ? nextCharacter : character,
          ),
          preparedBattle: null,
          preparedTeamBattle: null,
          activeReplayBattleId: null,
          activeReplayTeamBattleId: null,
        };
        saveState(nextState);
        return nextState;
      });
    },

    removeCharacter: (characterId) => {
      set((state) => {
        assertCharacterExists(state.characters, characterId);
        const nextState = {
          ...state,
          characters: state.characters.filter((character) => character.id !== characterId),
          selectedCharacterIds: {
            left:
              state.selectedCharacterIds.left === characterId
                ? null
                : state.selectedCharacterIds.left,
            right:
              state.selectedCharacterIds.right === characterId
                ? null
                : state.selectedCharacterIds.right,
          },
          preparedBattle: null,
          teamCharacterIds: {
            left: state.teamCharacterIds.left.filter((id) => id !== characterId),
            right: state.teamCharacterIds.right.filter((id) => id !== characterId),
          },
          preparedTeamBattle: null,
          activeReplayBattleId: null,
          activeReplayTeamBattleId: null,
        };
        saveState(nextState);
        return nextState;
      });
    },

    selectCharacter: (side, characterId) => {
      set((state) => {
        if (characterId) assertCharacterExists(state.characters, characterId);

        return {
          ...state,
          selectedCharacterIds: {
            ...state.selectedCharacterIds,
            [side]: characterId,
          },
          preparedBattle: null,
          preparedTeamBattle: null,
          activeReplayBattleId: null,
          activeReplayTeamBattleId: null,
        };
      });
    },

    clearSelectedCharacters: () => {
      set((state) => ({
        ...state,
        selectedCharacterIds: { ...EMPTY_SELECTION },
        preparedBattle: null,
        preparedTeamBattle: null,
        activeReplayBattleId: null,
        activeReplayTeamBattleId: null,
      }));
    },

    prepareBattle: (seed) => {
      set((state) => {
        const { left, right } = state.selectedCharacterIds;
        if (!left || !right) {
          throw new Error("Select both combatants before preparing a battle.");
        }
        assertCharacterExists(state.characters, left);
        assertCharacterExists(state.characters, right);
        const leftCharacter = state.characters.find(
          (character) => character.id === left,
        );
        const rightCharacter = state.characters.find(
          (character) => character.id === right,
        );

        if (!leftCharacter || !rightCharacter) {
          throw new Error("Selected characters are no longer available.");
        }

        return {
          ...state,
          preparedBattle: createBattlePreparation(seed, leftCharacter, rightCharacter),
          preparedTeamBattle: null,
          activeReplayBattleId: null,
          activeReplayTeamBattleId: null,
        };
      });
    },

    addCharacterToTeam: (side, characterId) => {
      set((state) => {
        assertCharacterExists(state.characters, characterId);
        const currentTeam = state.teamCharacterIds[side];
        const opposingSide = side === "left" ? "right" : "left";

        if (currentTeam.includes(characterId)) return state;
        if (state.teamCharacterIds[opposingSide].includes(characterId)) {
          throw new Error("A character cannot appear on both teams.");
        }
        if (currentTeam.length >= MAX_TEAM_SIZE) {
          throw new Error("每支队伍最多容纳 5 名角色。");
        }

        return {
          ...state,
          teamCharacterIds: {
            ...state.teamCharacterIds,
            [side]: [...currentTeam, characterId],
          },
          preparedTeamBattle: null,
          activeReplayBattleId: null,
          activeReplayTeamBattleId: null,
        };
      });
    },

    removeCharacterFromTeam: (side, characterId) => {
      set((state) => ({
        ...state,
        teamCharacterIds: {
          ...state.teamCharacterIds,
          [side]: state.teamCharacterIds[side].filter((id) => id !== characterId),
        },
        preparedTeamBattle: null,
        activeReplayBattleId: null,
        activeReplayTeamBattleId: null,
      }));
    },

    moveTeamCharacter: (side, characterId, direction) => {
      set((state) => {
        const members = state.teamCharacterIds[side];
        const currentIndex = members.indexOf(characterId);
        const nextIndex = currentIndex + direction;
        if (currentIndex < 0 || nextIndex < 0 || nextIndex >= members.length) {
          return state;
        }

        const nextMembers = [...members];
        [nextMembers[currentIndex], nextMembers[nextIndex]] = [
          nextMembers[nextIndex],
          nextMembers[currentIndex],
        ];

        return {
          ...state,
          teamCharacterIds: {
            ...state.teamCharacterIds,
            [side]: nextMembers,
          },
          preparedTeamBattle: null,
          activeReplayBattleId: null,
          activeReplayTeamBattleId: null,
        };
      });
    },

    setTeamCharacterIds: (teamCharacterIds) => {
      set((state) => {
        const nextTeamCharacterIds: TeamCharacterIds = {
          left: [...teamCharacterIds.left],
          right: [...teamCharacterIds.right],
        };
        const allCharacterIds = [
          ...nextTeamCharacterIds.left,
          ...nextTeamCharacterIds.right,
        ];

        if (
          nextTeamCharacterIds.left.length > MAX_TEAM_SIZE
          || nextTeamCharacterIds.right.length > MAX_TEAM_SIZE
        ) {
          throw new Error("每支队伍最多容纳 5 名角色。");
        }
        if (new Set(allCharacterIds).size !== allCharacterIds.length) {
          throw new Error("A character cannot appear on both teams.");
        }
        allCharacterIds.forEach((characterId) => {
          assertCharacterExists(state.characters, characterId);
        });

        return {
          ...state,
          teamCharacterIds: nextTeamCharacterIds,
          preparedTeamBattle: null,
          activeReplayBattleId: null,
          activeReplayTeamBattleId: null,
        };
      });
    },

    clearTeam: (side) => {
      set((state) => ({
        ...state,
        teamCharacterIds: {
          ...state.teamCharacterIds,
          [side]: [],
        },
        preparedTeamBattle: null,
        activeReplayBattleId: null,
        activeReplayTeamBattleId: null,
      }));
    },

    prepareTeamBattle: (seed) => {
      set((state) => ({
        ...state,
        preparedTeamBattle: createTeamBattlePreparation(
          seed,
          state.characters,
          state.teamCharacterIds.left,
          state.teamCharacterIds.right,
        ),
        preparedBattle: null,
        activeReplayBattleId: null,
        activeReplayTeamBattleId: null,
      }));
    },

    rematchBattle: (seed, leftCharacter, rightCharacter) => {
      const validLeftCharacter = characterSchema.parse(leftCharacter);
      const validRightCharacter = characterSchema.parse(rightCharacter);

      set((state) => ({
        ...state,
        preparedBattle: createBattlePreparation(
          seed,
          validLeftCharacter,
          validRightCharacter,
        ),
        preparedTeamBattle: null,
        activeReplayBattleId: null,
        activeReplayTeamBattleId: null,
      }));
    },

    rematchTeamBattle: (seed, leftTeam, rightTeam) => {
      set((state) => ({
        ...state,
        preparedTeamBattle: createTeamRematchPreparation(seed, leftTeam, rightTeam),
        preparedBattle: null,
        activeReplayBattleId: null,
        activeReplayTeamBattleId: null,
      }));
    },

    clearPreparedBattle: () => {
      set((state) => ({ ...state, preparedBattle: null }));
    },

    clearPreparedTeamBattle: () => {
      set((state) => ({ ...state, preparedTeamBattle: null }));
    },

    importCharacters: (characters) => {
      const validCharacters = characters.map((character) =>
        characterSchema.parse(character),
      );
      if (new Set(validCharacters.map((character) => character.id)).size !== validCharacters.length) {
        throw new Error("Imported character data contains duplicate IDs.");
      }

      set((state) => {
        const importedIds = new Set(validCharacters.map((character) => character.id));
        const nextState = {
          ...state,
          characters: [
            ...state.characters.filter((character) => !importedIds.has(character.id)),
            ...validCharacters,
          ],
          preparedBattle: null,
          preparedTeamBattle: null,
          activeReplayBattleId: null,
          activeReplayTeamBattleId: null,
        };
        saveState(nextState);
        return nextState;
      });
    },

    addPresetCharacters: () => {
      let addedCount = 0;

      set((state) => {
        const existingIds = new Set(state.characters.map((character) => character.id));
        const missingPresets = getPresetCharacters()
          .map((character) => characterSchema.parse(character))
          .filter((character) => !existingIds.has(character.id));
        addedCount = missingPresets.length;
        if (addedCount === 0) return state;

        const nextState = {
          ...state,
          characters: [...state.characters, ...missingPresets],
          preparedTeamBattle: null,
          activeReplayTeamBattleId: null,
        };
        saveState(nextState);
        return nextState;
      });

      return addedCount;
    },

    setSoundEnabled: (soundEnabled) => {
      set((state) => {
        const nextState = {
          ...state,
          settings: { ...state.settings, soundEnabled },
        };
        saveState(nextState);
        return nextState;
      });
    },
  }));
}

export const gameStore = createGameStore();

export function useGameStore<T>(selector: (state: GameStoreState) => T): T {
  return useStore(gameStore, selector);
}
