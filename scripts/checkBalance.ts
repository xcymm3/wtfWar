import {
  BALANCE_GUARDRAILS,
  assertProfessionBalance,
  formatProfessionBalanceReport,
  simulateProfessionBalance,
} from "@/lib/balance/balanceSimulation";

const result = simulateProfessionBalance(BALANCE_GUARDRAILS.minMatchesPerPair);
assertProfessionBalance(result);
console.log(formatProfessionBalanceReport(result));
