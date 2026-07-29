import assert from "node:assert/strict";
import test from "node:test";

import {
  finalizeGeneratedCharacter,
  generateLocalCharacter,
} from "../lib/characters/promptCharacterGeneration";
import { characterSchema } from "../lib/schemas/character";

test("generates a valid local character from a natural-language prompt", () => {
  const character = generateLocalCharacter({
    name: "霜语",
    prompt: "使用冰霜法术牵制敌人的年轻法师，外表冷静但出手果断。",
  });

  assert.equal(character.profession, "mage");
  assert.equal(character.realm, "mortal");
  assert.equal(character.originalPrompt, "使用冰霜法术牵制敌人的年轻法师，外表冷静但出手果断。");
  assert.ok(character.skills.some((skill) => skill.type === "damage"));
  assert.notEqual(character.skills[0].type, character.skills[1].type);
  assert.equal(character.skills.every((skill) => (
    Boolean(skill.usageText) && Array.from(skill.usageText ?? "").length <= 10
  )), true);
  assert.deepEqual(characterSchema.parse(character), character);
});

test("infers profession from the description and rejects invalid model drafts", () => {
  const character = generateLocalCharacter({
    name: "追风",
    prompt: "擅长远程弓箭狙击，也会治疗同伴的冒险者。",
  });

  assert.equal(character.profession, "ranger");
  assert.equal(
    generateLocalCharacter({
      name: "飞剑",
      prompt: "渡劫后的修仙者以飞剑守护山门。",
    }).realm,
    "cultivator",
  );
  assert.equal(
    generateLocalCharacter({
      name: "圣光",
      prompt: "以群体治疗守护全体队友的圣光法师。",
    }).skills.some((skill) => skill.type === "area_heal"),
    true,
  );
  const chargeCharacter = generateLocalCharacter({
    name: "破阵武者",
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

test("uses the role name when inferring a profession", () => {
  const character = generateLocalCharacter({
    name: "冰霜术士",
    prompt: "沉默寡言的旅行者，习惯独自行动。",
  });

  assert.equal(character.profession, "mage");
  assert.equal(character.name, "冰霜术士");
});

test("matches keyword prompts to the new active and passive skill types", () => {
  const cases = [
    { name: "破军", prompt: "以暴击和绝杀著称的武者。", expectedType: "critical" },
    { name: "霜狱", prompt: "擅长群控与眩晕全体的寒冰法师。", expectedType: "area_control" },
    { name: "金身", prompt: "能开启无敌金身挡下致命一击的守卫。", expectedType: "invincible" },
    { name: "血牙", prompt: "靠吸血续战的凶狠斗士。", expectedType: "lifesteal_passive" },
    { name: "战狂", prompt: "越战越强、战意不断成长的狂战士。", expectedType: "growth_passive" },
    { name: "不死鸟", prompt: "倒下后还能复活重生的异能者。", expectedType: "revive_passive" },
    { name: "夜枭", prompt: "最擅长切后和狙杀后排的暗影猎手。", expectedType: "assassin_passive" },
  ] as const;

  for (const testCase of cases) {
    const character = generateLocalCharacter({
      name: testCase.name,
      prompt: testCase.prompt,
    });

    assert.equal(
      character.skills.some((skill) => skill.type === testCase.expectedType),
      true,
      testCase.expectedType,
    );
  }
});
