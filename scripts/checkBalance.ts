import {
  assertTeamBalance,
  simulateTeamBalance,
  TEAM_BALANCE_GUARDRAILS,
} from "@/lib/balance/teamBalanceSimulation";

const result = simulateTeamBalance(TEAM_BALANCE_GUARDRAILS.matchesPerScenario);
assertTeamBalance(result);
console.log("5v5 职业属性与技能平衡检查通过。");
