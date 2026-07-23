import type {
  BattleSide,
  TeamBattleCombatantSnapshot,
  TeamBattleEvent,
  TeamBattleRecord,
  TeamBattleTargetResult,
  TeamFormation,
} from "@/types/battle";
import type { Character } from "@/types/character";

function createStableRecordId(
  seed: string,
  leftTeam: TeamFormation,
  rightTeam: TeamFormation,
): string {
  const source = [
    seed,
    ...leftTeam.members.map((character) => `left:${character.id}:${character.updatedAt}`),
    ...rightTeam.members.map((character) => `right:${character.id}:${character.updatedAt}`),
  ].join("\u0000");
  let hash = 2_166_136_261;

  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }

  return `team-battle-${(hash >>> 0).toString(36)}`;
}

function copyCharacter(character: Character): Character {
  return {
    ...character,
    skills: character.skills.map((skill) => ({ ...skill })) as Character["skills"],
  };
}

function copyFormation(formation: TeamFormation): TeamFormation {
  return {
    side: formation.side,
    members: formation.members.map(copyCharacter),
  };
}

function copyCombatant(
  combatant: TeamBattleCombatantSnapshot,
): TeamBattleCombatantSnapshot {
  return {
    ...combatant,
    cooldowns: { ...combatant.cooldowns },
  };
}

function copyTarget(target: TeamBattleTargetResult): TeamBattleTargetResult {
  return {
    ...copyCombatant(target),
    side: target.side,
    rawDamage: target.rawDamage,
    damage: target.damage,
    shieldAbsorbed: target.shieldAbsorbed,
    healing: target.healing,
    shieldGranted: target.shieldGranted,
    targetStunned: target.targetStunned,
  };
}

function copyEvent(event: TeamBattleEvent): TeamBattleEvent {
  return {
    ...event,
    actor: { side: event.actor.side, ...copyCombatant(event.actor) },
    skill: event.skill ? { ...event.skill } : null,
    targets: event.targets.map(copyTarget),
    formations: {
      left: event.formations.left.map(copyCombatant),
      right: event.formations.right.map(copyCombatant),
    },
  };
}

export function createTeamBattleRecord({
  seed,
  leftTeam,
  rightTeam,
  winner,
  rounds,
  events,
}: {
  seed: string;
  leftTeam: TeamFormation;
  rightTeam: TeamFormation;
  winner: BattleSide | "draw";
  rounds: number;
  events: TeamBattleEvent[];
}): TeamBattleRecord {
  return {
    rulesVersion: 2,
    id: createStableRecordId(seed, leftTeam, rightTeam),
    seed,
    leftTeam: copyFormation(leftTeam),
    rightTeam: copyFormation(rightTeam),
    winner,
    rounds,
    events: events.map(copyEvent),
    createdAt: new Date().toISOString(),
  };
}
