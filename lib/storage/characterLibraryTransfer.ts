import { z } from "zod";

import { characterSchema } from "@/lib/schemas/character";
import type { Character } from "@/types/character";

const EXPORT_FORMAT = "war-ai-game.character-library";
const EXPORT_VERSION = 1;

const characterLibraryExportSchema = z.object({
  format: z.literal(EXPORT_FORMAT),
  version: z.literal(EXPORT_VERSION),
  exportedAt: z.string().datetime(),
  characters: z.array(characterSchema),
});

function assertUniqueCharacterIds(characters: Character[]): void {
  if (new Set(characters.map((character) => character.id)).size !== characters.length) {
    throw new Error("Imported character data contains duplicate IDs.");
  }
}

export function exportCharacterLibrary(characters: Character[]): string {
  const validCharacters = z.array(characterSchema).parse(characters);

  return JSON.stringify(
    {
      format: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      characters: validCharacters,
    },
    null,
    2,
  );
}

export function parseImportedCharacterLibrary(source: string): Character[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error("The selected file is not valid JSON.");
  }

  if (Array.isArray(parsed)) {
    const result = z.array(characterSchema).safeParse(parsed);
    if (!result.success) {
      throw new Error("The selected file does not contain a valid character library.");
    }

    assertUniqueCharacterIds(result.data);
    return result.data;
  }

  const result = characterLibraryExportSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error("The selected file does not contain a valid character library.");
  }

  assertUniqueCharacterIds(result.data.characters);
  return result.data.characters;
}
