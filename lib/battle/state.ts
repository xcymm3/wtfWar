import type { BattleEvent, BattleSide } from "@/types/battle";
import type { Character } from "@/types/character";

import { BATTLE_RULES_VERSION } from "./constants";
import {
  getEffectiveCombatStats,
  type EffectiveCombatStats,
} from "./realm";

export type BattleStatus = "ready" | "in_progress" | "finished";
export type BattleWinner = BattleSide | "draw";

export type CombatantState = {
  character: Character;
  effectiveStats: EffectiveCombatStats;
  health: number;
  shield: number;
  isStunned: boolean;
  chargeProgress: number;
  cooldowns: Record<string, number>;
};

export type BattleRuntimeState = {
  rulesVersion: typeof BATTLE_RULES_VERSION;
  seed: string;
  status: BattleStatus;
  round: number;
  turnOrder: BattleSide[];
  actionIndex: number;
  left: CombatantState;
  right: CombatantState;
  winner: BattleWinner | null;
  events: BattleEvent[];
};

export type CreateBattleStateInput = {
  seed: string;
  leftCharacter: Character;
  rightCharacter: Character;
};

function copyCharacter(character: Character): Character {
  const [firstSkill, secondSkill] = character.skills;

  return {
    ...character,
    skills: [{ ...firstSkill }, { ...secondSkill }],
  };
}

export function createCombatantState(character: Character): CombatantState {
  const characterSnapshot = copyCharacter(character);
  const effectiveStats = getEffectiveCombatStats(characterSnapshot);

  return {
    character: characterSnapshot,
    effectiveStats,
    health: effectiveStats.maxHealth,
    shield: 0,
    isStunned: false,
    chargeProgress: 0,
    cooldowns: Object.fromEntries(
      characterSnapshot.skills.map((skill) => [skill.id, 0]),
    ),
  };
}

export function createInitialBattleState({
  seed,
  leftCharacter,
  rightCharacter,
}: CreateBattleStateInput): BattleRuntimeState {
  return {
    rulesVersion: BATTLE_RULES_VERSION,
    seed,
    status: "ready",
    round: 0,
    turnOrder: [],
    actionIndex: 0,
    left: createCombatantState(leftCharacter),
    right: createCombatantState(rightCharacter),
    winner: null,
    events: [],
  };
}

export function getOpponentSide(side: BattleSide): BattleSide {
  return side === "left" ? "right" : "left";
}

export function getCombatant(
  state: BattleRuntimeState,
  side: BattleSide,
): CombatantState {
  return state[side];
}
