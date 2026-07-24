import { z } from "zod";

import { characterSchema } from "./character";

const battleEventSchema = z.object({
  round: z.number().int().positive(),
  actor: z.enum(["left", "right"]),
  target: z.enum(["left", "right"]),
  skill: z
    .object({
      id: z.string().min(1),
      name: z.string().min(1),
      type: z.enum([
        "damage",
        "shield",
        "heal",
        "control",
        "area_damage",
        "area_heal",
        "cleave_passive",
        "charge_strike_passive",
        "buff",
      ]),
    })
    .nullable(),
  rawDamage: z.number().nonnegative(),
  damage: z.number().nonnegative(),
  shieldAbsorbed: z.number().nonnegative(),
  healing: z.number().nonnegative(),
  shieldGranted: z.number().nonnegative(),
  targetStunned: z.boolean(),
  actorHealth: z.number().nonnegative(),
  targetHealth: z.number().nonnegative(),
  actorShield: z.number().nonnegative(),
  targetShield: z.number().nonnegative(),
  actorCooldowns: z.record(z.string(), z.number().int().nonnegative()),
  targetCooldowns: z.record(z.string(), z.number().int().nonnegative()),
  actorIsStunned: z.boolean(),
  targetIsStunned: z.boolean(),
  narration: z.string(),
});

const battleRecordSchema = z.object({
  rulesVersion: z.literal(1),
  id: z.string().min(1),
  seed: z.string().min(1),
  leftCharacter: characterSchema,
  rightCharacter: characterSchema,
  winner: z.enum(["left", "right", "draw"]),
  rounds: z.number().int().positive(),
  events: z.array(battleEventSchema),
  createdAt: z.string().datetime(),
});

const teamCombatantSnapshotSchema = z.object({
  characterId: z.string().min(1),
  position: z.number().int().positive(),
  health: z.number().nonnegative(),
  shield: z.number().nonnegative(),
  cooldowns: z.record(z.string(), z.number().int().nonnegative()),
  isStunned: z.boolean(),
  chargeProgress: z.number().int().nonnegative(),
});

const teamBattleTargetSchema = teamCombatantSnapshotSchema.extend({
  side: z.enum(["left", "right"]),
  rawDamage: z.number().nonnegative(),
  damage: z.number().nonnegative(),
  shieldAbsorbed: z.number().nonnegative(),
  healing: z.number().nonnegative(),
  shieldGranted: z.number().nonnegative(),
  targetStunned: z.boolean(),
});

const teamBattleEventSchema = z.object({
  round: z.number().int().positive(),
  actor: teamCombatantSnapshotSchema.extend({ side: z.enum(["left", "right"]) }),
  skill: battleEventSchema.shape.skill,
  targets: z.array(teamBattleTargetSchema),
  formations: z.object({
    left: z.array(teamCombatantSnapshotSchema).min(1).max(5),
    right: z.array(teamCombatantSnapshotSchema).min(1).max(5),
  }),
  narration: z.string(),
});

const teamFormationSchema = z.object({
  side: z.enum(["left", "right"]),
  members: z.array(characterSchema).min(1).max(5),
});

const teamBattleRecordSchema = z.object({
  rulesVersion: z.literal(2),
  id: z.string().min(1),
  seed: z.string().min(1),
  leftTeam: teamFormationSchema,
  rightTeam: teamFormationSchema,
  winner: z.enum(["left", "right", "draw"]),
  rounds: z.number().int().positive(),
  events: z.array(teamBattleEventSchema),
  createdAt: z.string().datetime(),
}).superRefine((record, context) => {
  const memberIds = [
    ...record.leftTeam.members.map((member) => member.id),
    ...record.rightTeam.members.map((member) => member.id),
  ];
  if (
    record.leftTeam.side !== "left" ||
    record.rightTeam.side !== "right" ||
    new Set(memberIds).size !== memberIds.length
  ) {
    context.addIssue({
      code: "custom",
      path: ["leftTeam"],
      message: "A team battle record must contain two disjoint formations.",
    });
  }
});

export const gameStoreSchema = z.object({
  version: z.literal(1),
  characters: z.array(characterSchema),
  battles: z.array(battleRecordSchema),
  teamBattles: z.array(teamBattleRecordSchema).default([]),
  settings: z.object({
    soundEnabled: z.boolean(),
  }),
});
