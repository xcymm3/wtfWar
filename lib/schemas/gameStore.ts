import { z } from "zod";

import { characterSchema } from "./character";

export const gameStoreSchema = z.object({
  version: z.literal(1),
  characters: z.array(characterSchema),
  settings: z.object({
    soundEnabled: z.boolean(),
  }),
});
