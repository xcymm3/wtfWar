import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { characters } from "@/db/schema";
import { normalizeCharacterName } from "@/lib/characters/characterName";
import { getPresetCharacters } from "@/lib/characters/presetCharacters";
import { characterSchema } from "@/lib/schemas/character";
import type { Character } from "@/types/character";

export class DuplicateCharacterNameError extends Error {
  constructor(name: string) {
    super(`已存在名为“${name}”的英雄，请更换名称。`);
    this.name = "DuplicateCharacterNameError";
  }
}

function toDatabaseCharacter(character: Character, isPreset: boolean) {
  const validCharacter = characterSchema.parse(character);
  return {
    id: validCharacter.id,
    name: validCharacter.name.trim(),
    normalizedName: normalizeCharacterName(validCharacter.name),
    data: validCharacter,
    isPreset,
  };
}

export async function ensurePresetCharacters(): Promise<void> {
  const db = getDb();
  const presets = getPresetCharacters().map((character) =>
    toDatabaseCharacter(character, true),
  );

  await db.insert(characters)
    .values(presets)
    .onConflictDoNothing({ target: characters.id });
}

export async function getRemoteCharacters(): Promise<Character[]> {
  await ensurePresetCharacters();
  const db = getDb();
  const rows = await db.select({ data: characters.data })
    .from(characters)
    .orderBy(characters.createdAt);

  return rows.map((row) => characterSchema.parse(row.data));
}

export async function createRemoteCharacter(character: Character): Promise<Character> {
  await ensurePresetCharacters();

  const db = getDb();
  const value = toDatabaseCharacter(character, false);
  const existing = await db.select({ id: characters.id })
    .from(characters)
    .where(eq(characters.normalizedName, value.normalizedName))
    .limit(1);
  if (existing.length > 0) {
    throw new DuplicateCharacterNameError(value.name);
  }

  const inserted = await db.insert(characters)
    .values(value)
    .onConflictDoNothing({ target: characters.normalizedName })
    .returning({ data: characters.data });
  const storedCharacter = inserted[0]?.data;
  if (!storedCharacter) {
    throw new DuplicateCharacterNameError(value.name);
  }

  return characterSchema.parse(storedCharacter);
}
