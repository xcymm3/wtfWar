import assert from "node:assert/strict";
import test from "node:test";

import { normalizeCharacterName } from "../lib/characters/characterName";

test("normalizes hero names before checking uniqueness", () => {
  assert.equal(normalizeCharacterName("  Iron   Guard  "), "iron guard");
  assert.equal(normalizeCharacterName("  护卫  "), "护卫");
});
