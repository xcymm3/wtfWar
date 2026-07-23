import assert from "node:assert/strict";
import test from "node:test";

import {
  exportCharacterLibrary,
  parseImportedCharacterLibrary,
} from "../lib/storage/characterLibraryTransfer";
import { characterSchema } from "../lib/schemas/character";
import type { Character } from "../types/character";

const character: Character = {
  id: "transfer-warrior",
  name: "Transfer Warrior",
  originalPrompt: "A durable fighter ready for export.",
  profession: "warrior",
  attack: 18,
  maxHealth: 140,
  skills: [
    {
      id: "transfer-slash",
      name: "Slash",
      description: "A reliable strike.",
      type: "damage",
      cooldown: 2,
      damageMultiplier: 1.3,
    },
    {
      id: "transfer-roar",
      name: "Roar",
      description: "A short stun.",
      type: "control",
      cooldown: 3,
      stunChance: 0.3,
    },
  ],
  createdAt: "2026-07-23T00:00:00.000Z",
  updatedAt: "2026-07-23T00:00:00.000Z",
};

test("exports and imports a validated character library", () => {
  const exported = exportCharacterLibrary([character]);
  const payload = JSON.parse(exported) as { format: string; version: number };
  const canonicalCharacter = characterSchema.parse(character);

  assert.equal(payload.format, "war-ai-game.character-library");
  assert.equal(payload.version, 1);
  assert.deepEqual(parseImportedCharacterLibrary(exported), [canonicalCharacter]);
  assert.deepEqual(parseImportedCharacterLibrary(JSON.stringify([character])), [canonicalCharacter]);
});

test("rejects malformed and duplicate character imports", () => {
  assert.throws(
    () => parseImportedCharacterLibrary("not json"),
    /not valid JSON/i,
  );
  assert.throws(
    () => parseImportedCharacterLibrary(JSON.stringify([character, character])),
    /duplicate IDs/i,
  );
});
