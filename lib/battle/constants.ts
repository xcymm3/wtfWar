export const BATTLE_RULES_VERSION = 1 as const;

export const BATTLE_RULES = {
  minAttack: 5,
  maxAttack: 30,
  minHealth: 80,
  maxHealth: 180,
  maxRounds: 30,
  minCooldown: 1,
  maxCooldown: 5,
  minDamageMultiplier: 0.8,
  maxDamageMultiplier: 1.8,
  minDamageRandomMultiplier: 0.9,
  maxDamageRandomMultiplier: 1.1,
  maxShield: 60,
} as const;
