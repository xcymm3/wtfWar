import assert from "node:assert/strict";
import test from "node:test";

import {
  TEAM_BALANCE_GUARDRAILS,
  assertTeamBalance,
  evaluateTeamBalance,
  simulateTeamBalance,
  type TeamBalanceResult,
} from "../lib/balance/teamBalanceSimulation";

test("runs deterministic 5v5 profession and skill fixtures", () => {
  const first = simulateTeamBalance(1);
  const second = simulateTeamBalance(1);

  assert.deepEqual(first, second);
  assert.equal(first.professionMatchups.length, 10);
  assert.equal(first.skillScenarios.length, 15);

  for (const matchup of first.professionMatchups) {
    assert.equal(matchup.leftWins + matchup.rightWins + matchup.draws, 10);
  }
  for (const scenario of first.skillScenarios) {
    assert.equal(scenario.games, 10);
    assert.equal(scenario.candidateWins + scenario.baselineWins + scenario.draws, scenario.games);
  }
});

test("flags a profession that completely dominates a 5v5 matchup", () => {
  const result = simulateTeamBalance(1);
  const imbalancedResult: TeamBalanceResult = {
    ...result,
    professionMatchups: result.professionMatchups.map((matchup, index) => index === 0
      ? { ...matchup, leftWins: 2, rightWins: 0, draws: 0 }
      : matchup),
  };

  assert.equal(evaluateTeamBalance(imbalancedResult, TEAM_BALANCE_GUARDRAILS).some(
    (violation) => violation.metric === "profession_dominance",
  ), true);
  assert.throws(() => assertTeamBalance(imbalancedResult), /profession_dominance/);
});

test("flags a skill that overwhelms the mixed-team baseline", () => {
  const result = simulateTeamBalance(1);
  const imbalancedResult: TeamBalanceResult = {
    ...result,
    skillScenarios: result.skillScenarios.map((scenario, index) => index === 0
      ? { ...scenario, candidateWins: scenario.games, baselineWins: 0, draws: 0 }
      : scenario),
  };

  assert.equal(evaluateTeamBalance(imbalancedResult, TEAM_BALANCE_GUARDRAILS).some(
    (violation) => violation.metric === "skill_scenario_win_rate",
  ), true);
});
