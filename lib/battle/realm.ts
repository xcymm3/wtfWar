import type { Character, Realm } from "@/types/character";

export const REALM_MULTIPLIERS: Readonly<Record<Realm, number>> = {
  mortal: 1,
  martial_master: 1.6,
  superpowered: 2.4,
  cultivator: 3.6,
  deity: 5,
};

export type EffectiveCombatStats = {
  realm: Realm;
  multiplier: number;
  attack: number;
  maxHealth: number;
};

export function getCharacterRealm(
  character: Pick<Character, "realm">,
): Realm {
  return character.realm ?? "mortal";
}

export function getRealmMultiplier(realm: Realm): number {
  return REALM_MULTIPLIERS[realm];
}

export function scaleByRealm(baseValue: number, realm: Realm): number {
  if (!Number.isFinite(baseValue) || baseValue < 0) {
    throw new RangeError("Base value must be a non-negative finite number.");
  }

  return Math.floor(baseValue * getRealmMultiplier(realm));
}

export function getEffectiveCombatStats(
  character: Pick<Character, "realm" | "attack" | "maxHealth">,
): EffectiveCombatStats {
  const realm = getCharacterRealm(character);

  return {
    realm,
    multiplier: getRealmMultiplier(realm),
    attack: scaleByRealm(character.attack, realm),
    maxHealth: scaleByRealm(character.maxHealth, realm),
  };
}

export function scaleSkillAmountByRealm(
  character: Pick<Character, "realm">,
  baseAmount: number,
): number {
  return scaleByRealm(baseAmount, getCharacterRealm(character));
}
