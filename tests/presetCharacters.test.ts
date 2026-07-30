import assert from "node:assert/strict";
import test from "node:test";

import {
  PRESET_CHARACTERS,
  getPresetCharacters,
} from "../lib/characters/presetCharacters";
import { characterSchema } from "../lib/schemas/character";

test("ships ten valid presets with two characters per profession", () => {
  assert.equal(PRESET_CHARACTERS.length, 10);
  assert.deepEqual(
    PRESET_CHARACTERS.map((character) => character.name),
    ["护卫", "剑客", "吸血鬼", "长矛手", "术士", "治疗师", "武士", "有翼兽", "女巫", "公主"],
  );

  for (const profession of ["tank", "warrior", "mage", "assassin", "ranger"]) {
    assert.equal(
      PRESET_CHARACTERS.filter((character) => character.profession === profession).length,
      2,
    );
  }

  for (const character of PRESET_CHARACTERS) {
    assert.equal(characterSchema.safeParse(character).success, true);
  }
});

test("returns independent copies for each preset import", () => {
  const firstCopy = getPresetCharacters();
  const secondCopy = getPresetCharacters();
  firstCopy[0]!.name = "已修改";
  firstCopy[0]!.skills[0].name = "已修改技能";

  assert.equal(secondCopy[0]!.name, "护卫");
  assert.equal(secondCopy[0]!.skills[0].name, "守护壁垒");
});

test("gives each preset skills that match its theme and current combat rules", () => {
  const presetsByName = new Map(
    PRESET_CHARACTERS.map((character) => [character.name, character]),
  );

  assert.deepEqual(
    presetsByName.get("吸血鬼")?.skills.map((skill) => skill.type),
    ["critical", "lifesteal_passive"],
  );
  assert.deepEqual(
    presetsByName.get("有翼兽")?.skills.map((skill) => skill.type),
    ["damage", "assassin_passive"],
  );
  assert.deepEqual(
    presetsByName.get("治疗师")?.skills.map((skill) => skill.type),
    ["heal", "area_heal"],
  );
  assert.deepEqual(
    presetsByName.get("术士")?.skills.map((skill) => skill.type),
    ["area_damage", "area_control"],
  );
  assert.deepEqual(
    presetsByName.get("女巫")?.skills.map((skill) => skill.type),
    ["damage", "revive_passive"],
  );
});
