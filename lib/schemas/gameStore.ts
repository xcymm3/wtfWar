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

export const gameStoreSchema = z.object({
  version: z.literal(1),
  characters: z.array(characterSchema),
  battles: z.array(battleRecordSchema),
  settings: z.object({
    soundEnabled: z.boolean(),
  }),
});
