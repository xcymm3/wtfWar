import { z } from "zod";

import { characterSchema } from "./character";

const teamFormationSchema = z.object({
  side: z.enum(["left", "right"]),
  members: z.array(characterSchema).length(5),
});

/** Validates the complete input before the server re-simulates a team battle. */
export const teamBattleRecordRequestSchema = z.object({
  id: z.string().min(1).max(64),
  rulesVersion: z.literal(2),
  seed: z.string().trim().min(1).max(160),
  leftTeam: teamFormationSchema,
  rightTeam: teamFormationSchema,
  preparedAt: z.string().min(1).max(64),
}).superRefine((battle, context) => {
  if (battle.leftTeam.side !== "left" || battle.rightTeam.side !== "right") {
    context.addIssue({
      code: "custom",
      path: ["leftTeam"],
      message: "Team sides must match their submitted positions.",
    });
  }

  const memberIds = [
    ...battle.leftTeam.members.map((member) => member.id),
    ...battle.rightTeam.members.map((member) => member.id),
  ];
  if (new Set(memberIds).size !== memberIds.length) {
    context.addIssue({
      code: "custom",
      path: ["rightTeam"],
      message: "A character cannot appear in both teams.",
    });
  }
});
