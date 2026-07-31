import assert from "node:assert/strict";
import test from "node:test";

import { getPresetCharacters } from "../lib/characters/presetCharacters";
import { teamBattleRecordRequestSchema } from "../lib/schemas/teamBattle";

function createBattleRecordRequest() {
  const characters = getPresetCharacters();
  const leftTeam = characters.slice(0, 5);
  const rightTeam = characters.slice(5, 10);
  if (leftTeam.length !== 5 || rightTeam.length !== 5) {
    throw new Error("Expected ten preset characters.");
  }

  return {
    id: "recorded-battle-1",
    rulesVersion: 2 as const,
    competitiveMode: true as const,
    seed: "statistics-seed",
    leftTeam: { side: "left" as const, members: leftTeam },
    rightTeam: { side: "right" as const, members: rightTeam },
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

test("rejects incomplete teams from battle statistics", () => {
  const request = createBattleRecordRequest();
  request.rightTeam.members = request.rightTeam.members.slice(0, 4);

  const parsed = teamBattleRecordRequestSchema.safeParse(request);
  assert.equal(parsed.success, false);
});

test("rejects non-competitive battles from battle statistics", () => {
  const request = { ...createBattleRecordRequest(), competitiveMode: false };

  const parsed = teamBattleRecordRequestSchema.safeParse(request);
  assert.equal(parsed.success, false);
});
