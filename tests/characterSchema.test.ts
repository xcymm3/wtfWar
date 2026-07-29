import assert from "node:assert/strict";
import test from "node:test";

import { characterSchema } from "../lib/schemas/character";
import type { Character } from "../types/character";

const TIMESTAMP = "2026-07-23T00:00:00.000Z";

function createCharacter(): Character {
  return {
    id: "manual-warrior",
    name: "Manual Warrior",
    originalPrompt: "A manually created legal role card.",
    profession: "warrior",
    attack: 18,
    maxHealth: 140,
    skills: [
      {
        id: "manual-warrior-slash",
        name: "Slash",
        description: "A legal damage skill.",
        type: "damage",
        cooldown: 2,
        damageMultiplier: 1.3,
      },
      {
        id: "manual-warrior-shield",
        name: "Shield",
        description: "A legal shield skill.",
        type: "shield",
        cooldown: 3,
        shieldAmount: 25,
      },
    ],
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  };
}

test("accepts manual roles only when profession and skill rules are satisfied", () => {
  const migratedLegacyCharacter = characterSchema.parse(createCharacter());
  assert.equal(migratedLegacyCharacter.realm, "mortal");
  assert.equal(migratedLegacyCharacter.skills[0].activation, "active");
  assert.equal(migratedLegacyCharacter.skills[0].target, "enemy_front");

  const outOfProfessionRange = {
    ...createCharacter(),
    attack: 25,
  };
  assert.equal(characterSchema.safeParse(outOfProfessionRange).success, false);

  const duplicateSkillType = {
    ...createCharacter(),
    skills: [
      createCharacter().skills[0],
      {
        ...createCharacter().skills[1],
        id: "manual-warrior-second-damage",
        name: "Second Slash",
        type: "damage" as const,
        damageMultiplier: 1.2,
        shieldAmount: undefined,
      },
    ] as Character["skills"],
  };
  assert.equal(characterSchema.safeParse(duplicateSkillType).success, false);

  const missingDamageEffect = {
    ...createCharacter(),
    skills: [
      {
        ...createCharacter().skills[0],
        damageMultiplier: undefined,
      },
      createCharacter().skills[1],
    ] as Character["skills"],
  };
  assert.equal(characterSchema.safeParse(missingDamageEffect).success, false);
});

test("accepts v2 group skills and two passive slots", () => {
  const teamCharacter = {
    ...createCharacter(),
    realm: "deity" as const,
    skills: [
      {
        id: "manual-warrior-rally",
        name: "星辉复苏",
        description: "恢复己方全体生命。",
        type: "area_heal" as const,
        activation: "active" as const,
        target: "allies_all" as const,
        cooldown: 3,
        healAmount: 20,
      },
      {
        id: "manual-warrior-charge",
        name: "蓄力一击",
        description: "积蓄力量后攻击前排。",
        type: "charge_strike_passive" as const,
        activation: "passive" as const,
        target: "self" as const,
        cooldown: 0,
        chargeTurns: 3,
      },
    ],
  };

  assert.equal(characterSchema.safeParse(teamCharacter).success, true);
  const twoPassives = {
    ...teamCharacter,
    skills: [
      {
        id: "manual-warrior-growth",
        name: "成长",
        description: "每次行动后提高攻击。",
        type: "growth_passive" as const,
        activation: "passive" as const,
        target: "self" as const,
        cooldown: 0,
        damageMultiplier: 0.3,
      },
      {
        id: "manual-warrior-revive",
        name: "复苏",
        description: "首次阵亡时半血复活。",
        type: "revive_passive" as const,
        activation: "passive" as const,
        target: "self" as const,
        cooldown: 0,
      },
    ],
  };
  assert.equal(characterSchema.safeParse(twoPassives).success, true);
});

test("enforces the effect ranges used by AI-generated skills", () => {
  const baseCharacter = createCharacter();
  const cases = [
    {
      name: "weak area damage",
      skills: [
        { ...baseCharacter.skills[0], type: "area_damage" as const, damageMultiplier: 0.4 },
        baseCharacter.skills[1],
      ] as Character["skills"],
    },
    {
      name: "weak shield",
      skills: [
        baseCharacter.skills[0],
        { ...baseCharacter.skills[1], shieldAmount: 9 },
      ] as Character["skills"],
    },
    {
      name: "excessive lifesteal",
      skills: [
        baseCharacter.skills[0],
        {
          ...baseCharacter.skills[1],
          id: "manual-warrior-leech",
          name: "Leech",
          type: "lifesteal_passive" as const,
          activation: "passive" as const,
          target: "self" as const,
          cooldown: 0,
          damageMultiplier: 0.7,
          shieldAmount: undefined,
        },
      ] as Character["skills"],
    },
    {
      name: "excessive growth",
      skills: [
        baseCharacter.skills[0],
        {
          ...baseCharacter.skills[1],
          id: "manual-warrior-growth",
          name: "Growth",
          type: "growth_passive" as const,
          activation: "passive" as const,
          target: "self" as const,
          cooldown: 0,
          damageMultiplier: 0.6,
          shieldAmount: undefined,
        },
      ] as Character["skills"],
    },
  ];

  for (const { name, skills } of cases) {
    const character = {
      ...baseCharacter,
      skills,
    };
    assert.equal(characterSchema.safeParse(character).success, false, name);
  }
});
