import assert from "node:assert/strict";
import test from "node:test";

import {
  characterGenerationRequestSchema,
  finalizeGeneratedCharacter,
  getCharacterGenerationSystemPrompt,
} from "../lib/characters/promptCharacterGeneration";
import { characterSchema } from "../lib/schemas/character";

test("converts a valid AI draft into a storable character", () => {
  const character = finalizeGeneratedCharacter({
    name: "霜语",
    profession: "mage",
    realm: "mortal",
    attack: 18,
    maxHealth: 112,
    skills: [
      {
        name: "冰棱术",
        description: "向敌方前排发射冰棱。",
        usageText: "抬手施展",
        type: "damage",
        cooldown: 3,
        damageMultiplier: 1.4,
      },
      {
        name: "寒霜禁锢",
        description: "使敌方前排下一次行动必定跳过。",
        usageText: "凝结寒霜",
        type: "control",
        cooldown: 4,
        stunChance: 1,
      },
    ],
  }, "使用冰霜法术牵制敌人的年轻法师，外表冷静但出手果断。");

  assert.equal(character.name, "霜语");
  assert.equal(character.originalPrompt, "使用冰霜法术牵制敌人的年轻法师，外表冷静但出手果断。");
  assert.deepEqual(characterSchema.parse(character), character);
});

test("rejects AI drafts that violate character rules", () => {
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
          usageText: "凝神施展",
          type: "damage",
          cooldown: 2,
          damageMultiplier: 1.2,
        },
        {
          name: "Two",
          description: "Another damage skill.",
          usageText: "蓄力施展",
          type: "damage",
          cooldown: 3,
          damageMultiplier: 1.3,
        },
      ],
    }, "invalid draft"),
    /different types/i,
  );
});

test("tells the model the legal passive multiplier ranges", () => {
  const prompt = getCharacterGenerationSystemPrompt();

  assert.match(prompt, /lifesteal_passive.*0\.2-0\.6/);
  assert.match(prompt, /growth_passive.*0\.2-0\.5/);
  assert.match(prompt, /不得包含 id、activation、target/);
  assert.match(prompt, /严格使用用户指定的值/);
  assert.match(prompt, /不能只生成控制、护盾、治疗、无敌或辅助被动/);
});

test("requires the selected combat realm with each generation request", () => {
  assert.equal(characterGenerationRequestSchema.safeParse({
    name: "霜语",
    prompt: "使用冰霜法术牵制敌人的年轻法师，外表冷静但出手果断。",
  }).success, false);
  assert.equal(characterGenerationRequestSchema.safeParse({
    name: "霜语",
    prompt: "使用冰霜法术牵制敌人的年轻法师，外表冷静但出手果断。",
    realm: "cultivator",
  }).success, true);
});
