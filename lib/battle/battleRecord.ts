import type { BattleEvent, BattleRecord, BattleSide } from "@/types/battle";
import type { Character } from "@/types/character";

function createStableRecordId(
  seed: string,
  leftCharacter: Character,
  rightCharacter: Character,
): string {
  const source = [
    seed,
    leftCharacter.id,
    leftCharacter.updatedAt,
    rightCharacter.id,
    rightCharacter.updatedAt,
  ].join("\u0000");
  let hash = 2_166_136_261;

  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }

  return `battle-${(hash >>> 0).toString(36)}`;
}

function copyCharacter(character: Character): Character {
  return {
    ...character,
    skills: character.skills.map((skill) => ({ ...skill })) as Character["skills"],
  };
}

function copyEvent(event: BattleEvent): BattleEvent {
  return {
    ...event,
    skill: event.skill ? { ...event.skill } : null,
    actorCooldowns: { ...event.actorCooldowns },
    targetCooldowns: { ...event.targetCooldowns },
  };
}

export function createBattleRecord({
  seed,
  leftCharacter,
  rightCharacter,
  winner,
  rounds,
  events,
}: {
  seed: string;
  leftCharacter: Character;
  rightCharacter: Character;
  winner: BattleSide | "draw";
  rounds: number;
  events: BattleEvent[];
}): BattleRecord {
  return {
    rulesVersion: 1,
    id: createStableRecordId(seed, leftCharacter, rightCharacter),
    seed,
    leftCharacter: copyCharacter(leftCharacter),
    rightCharacter: copyCharacter(rightCharacter),
    winner,
    rounds,
    events: events.map(copyEvent),
    createdAt: new Date().toISOString(),
  };
}
