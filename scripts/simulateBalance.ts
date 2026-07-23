import {
  DEFAULT_MATCHES_PER_PAIR,
  formatProfessionBalanceReport,
  simulateProfessionBalance,
} from "@/lib/balance/balanceSimulation";

function getMatchesPerPair(args: string[]): number {
  const argument = args.find((value) => value.startsWith("--matches="));

  if (!argument) return DEFAULT_MATCHES_PER_PAIR;

  const value = Number(argument.slice("--matches=".length));
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError("--matches must be a positive integer.");
  }

  return value;
}

const result = simulateProfessionBalance(getMatchesPerPair(process.argv.slice(2)));
console.log(formatProfessionBalanceReport(result));
