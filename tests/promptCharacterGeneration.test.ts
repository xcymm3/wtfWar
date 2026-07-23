import assert from "node:assert/strict";
import test from "node:test";

import {
  finalizeGeneratedCharacter,
  generateLocalCharacter,
} from "../lib/characters/promptCharacterGeneration";
import { characterSchema } from "../lib/schemas/character";

test("generates a valid local character from a natural-language prompt", () => {
  const character = generateLocalCharacter({
    prompt: "使用冰霜法术牵制敌人的年轻法师，外表冷静但出手果断。",
  });

  assert.equal(character.profession, "mage");
  assert.equal(character.realm, "mortal");
  assert.equal(character.originalPrompt, "使用冰霜法术牵制敌人的年轻法师，外表冷静但出手果断。");
  assert.ok(character.skills.some((skill) => skill.type === "damage"));
  assert.notEqual(character.skills[0].type, character.skills[1].type);
  assert.deepEqual(characterSchema.parse(character), character);
});

test("honors an explicit profession preference and rejects invalid model drafts", () => {
  const character = generateLocalCharacter({
    prompt: "擅长近战但也会治疗同伴的冒险者。",
    preferredProfession: "ranger",
  });

  assert.equal(character.profession, "ranger");
  assert.equal(
    generateLocalCharacter({
      prompt: "渡劫后的修仙者以飞剑守护山门。",
    }).realm,
    "cultivator",
  );
  assert.equal(
    generateLocalCharacter({
      prompt: "以群体治疗守护全体队友的圣光法师。",
    }).skills.some((skill) => skill.type === "area_heal"),
    true,
  );
  const chargeCharacter = generateLocalCharacter({
    prompt: "擅长蓄力一击、专门击穿敌方前排的武者。",
  });
  const chargePassive = chargeCharacter.skills.find(
    (skill) => skill.type === "charge_strike_passive",
  );
  assert.ok(chargePassive);
  assert.equal(chargePassive.activation, "passive");
  assert.ok(chargePassive.chargeTurns && chargePassive.chargeTurns >= 2);
  assert.throws(
    () => finalizeGeneratedCharacter({
      name: "Invalid",
      profession: "warrior",
      realm: "mortal",
      attack: 18,
      maxHealth: 140,
      skills: [
        {
          name: "One",
          description: "Damage skill.",
          type: "damage",
          cooldown: 2,
          damageMultiplier: 1.2,
        },
        {
          name: "Two",
          description: "Another damage skill.",
          type: "damage",
          cooldown: 3,
          damageMultiplier: 1.3,
        },
      ],
    }, "invalid draft"),
    /different types/i,
  );
});
