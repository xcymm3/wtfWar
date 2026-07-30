import assert from "node:assert/strict";
import test from "node:test";

import {
  characterGenerationRequestSchema,
  finalizeGeneratedCharacter,
  getCharacterGenerationSystemPrompt,
  getCharacterPlanSystemPrompt,
  getModelCharacterDetailJsonSchema,
  modelCharacterPlanSchema,
  modelGeneratedCharacterDraftSchema,
} from "../lib/characters/promptCharacterGeneration";
import { GENERATABLE_SKILL_CATALOG } from "../lib/characters/skillCatalog";
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
  assert.match(prompt, /不得输出 name、realm 或 profession/);
  assert.match(prompt, /JSON 结构示例/);
  assert.match(prompt, /第一个和第二个技能都必须保持调用方分别指定的 type/);
  assert.match(prompt, /两个被动技能可以合法组合/);
  assert.match(prompt, /所有被动技能.*cooldown 必须固定为 0/);
});

test("distinguishes self-sustain from front-line healing in the skill plan", () => {
  const planPrompt = getCharacterPlanSystemPrompt();
  const detailPrompt = getCharacterGenerationSystemPrompt();

  assert.equal(GENERATABLE_SKILL_CATALOG.length, 15);
  assert.deepEqual(
    GENERATABLE_SKILL_CATALOG.map((skill) => skill.type),
    [
      "damage", "critical", "area_damage", "shield", "heal", "area_heal",
      "control", "area_control", "invincible", "cleave_passive",
      "charge_strike_passive", "lifesteal_passive", "growth_passive",
      "revive_passive", "assassin_passive",
    ],
  );
  assert.match(planPrompt, /必须选择 lifesteal_passive，不能选择 heal/);
  assert.match(planPrompt, /heal 只治疗己方当前前排/);
  assert.match(planPrompt, /游戏没有独立的闪避技能/);
  assert.match(detailPrompt, /heal 只能描述为治疗己方前排/);
  assert.match(detailPrompt, /assassin_passive 不能描述为闪避/);
});

test("constrains model output to legal combat fields and distinct skill pairs", () => {
  assert.equal(modelGeneratedCharacterDraftSchema.safeParse({
    name: "模型不应输出的名称",
    profession: "tank",
    attack: 12,
    maxHealth: 170,
    skills: [],
  }).success, false);
  assert.equal(modelCharacterPlanSchema.safeParse({
    profession: "tank",
    primarySkillType: "growth_passive",
    secondarySkillType: "revive_passive",
  }).success, true);
  assert.equal(modelCharacterPlanSchema.safeParse({
    profession: "assassin",
    primarySkillType: "damage",
    secondarySkillType: "speed",
  }).success, false);
  assert.equal(modelCharacterPlanSchema.safeParse({
    profession: "tank",
    primarySkillType: "shield",
    secondarySkillType: "buff",
  }).success, false);

  const schema = getModelCharacterDetailJsonSchema("tank", "damage", "growth_passive");
  const properties = schema.properties as Record<string, unknown>;
  const skills = properties.skills as { prefixItems: unknown[] };
  assert.match(JSON.stringify(skills.prefixItems[0]), /"const":"damage"/);
  assert.doesNotMatch(JSON.stringify(skills.prefixItems[1]), /"const":"damage"/);
  assert.match(JSON.stringify(skills.prefixItems[1]), /"const":"growth_passive"/);
  assert.match(JSON.stringify(schema), /"minimum":145/);
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
