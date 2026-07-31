import assert from "node:assert/strict";
import test from "node:test";

import { getPresetCharacters } from "../lib/characters/presetCharacters";
import { teamBattleRecordRequestSchema } from "../lib/schemas/teamBattle";

function createBattleRecordRequest() {
  const [leftCharacter, rightCharacter] = getPresetCharacters();
  if (!leftCharacter || !rightCharacter) throw new Error("Expected preset characters.");

  return {
    id: "recorded-battle-1",
    rulesVersion: 2 as const,
    seed: "statistics-seed",
    leftTeam: { side: "left" as const, members: [leftCharacter] },
    rightTeam: { side: "right" as const, members: [rightCharacter] },
    preparedAt: "2026-07-31T10:00:00.000Z",
  };
}

test("accepts a bounded v2 team battle record request", () => {
  const parsed = teamBattleRecordRequestSchema.safeParse(createBattleRecordRequest());

  assert.equal(parsed.success, true);
});

test("rejects a character appearing in both recorded teams", () => {
  const request = createBattleRecordRequest();
  request.rightTeam.members = [...request.leftTeam.members];

  const parsed = teamBattleRecordRequestSchema.safeParse(request);
  assert.equal(parsed.success, false);
});
