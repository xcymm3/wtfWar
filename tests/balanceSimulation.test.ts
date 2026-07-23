import assert from "node:assert/strict";
import test from "node:test";

import {
  PROFESSION_BALANCE_PROFILES,
  formatProfessionBalanceReport,
  simulateProfessionBalance,
} from "../lib/balance/balanceSimulation";
import { characterSchema } from "../lib/schemas/character";

test("uses legal baseline cards for all five professions", () => {
  assert.equal(PROFESSION_BALANCE_PROFILES.length, 5);

  for (const profile of PROFESSION_BALANCE_PROFILES) {
    const parsedCharacter = characterSchema.safeParse(profile.character);
    assert.equal(parsedCharacter.success, true, profile.profession);
    assert.equal(profile.character.skills.some((skill) => skill.type === "damage"), true);
  }
});

test("produces deterministic, internally consistent profession statistics", () => {
  const firstResult = simulateProfessionBalance(3);
  const secondResult = simulateProfessionBalance(3);

  assert.deepEqual(firstResult, secondResult);
  assert.equal(firstResult.totalMatches, 75);
  assert.equal(firstResult.professionStats.length, 5);
  assert.equal(firstResult.matchupStats.length, 25);

  for (const stats of firstResult.professionStats) {
    assert.equal(stats.games, 30);
    assert.equal(stats.games, stats.wins + stats.losses + stats.draws);
    assert.ok(stats.totalRounds >= stats.games);
  }

  assert.match(formatProfessionBalanceReport(firstResult), /职业平衡基线/);
  assert.match(formatProfessionBalanceReport(firstResult), /技能表现/);
});
