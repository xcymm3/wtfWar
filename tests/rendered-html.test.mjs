import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(path = "/", init = {}) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, {
      ...init,
      headers: { accept: "text/html", ...init.headers },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the character library loading boundary", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>War AI<\/title>/i);
  assert.match(html, /正在读取本地角色库/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("server-renders the manual character creator loading boundary", async () => {
  const response = await render("/create");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /正在准备创角表单/);
});

test("server-renders the battle preparation loading boundary", async () => {
  const response = await render("/battle/prepare");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /正在读取对战阵容/);
});

test("server-renders the battle observer loading boundary", async () => {
  const response = await render("/battle");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /正在加载战斗配置/);
});

test("server-renders the battle history loading boundary", async () => {
  const response = await render("/history");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /正在读取战斗历史/);
});

test("generates a validated local character through the production API route", async () => {
  const response = await render("/api/characters/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      prompt: "使用冰霜法术牵制敌人的年轻法师，外表冷静但出手果断。",
    }),
  });
  assert.equal(response.status, 200);

  const payload = await response.json();
  assert.equal(payload.source, "local");
  assert.equal(payload.character.profession, "mage");
  assert.equal(payload.character.skills.length, 2);
  assert.ok(payload.character.skills.some((skill) => skill.type === "damage"));
});

test("keeps the character library wired to the local game store", async () => {
  const [page, library, presets, creator, generator, generationRoute, preparation, observer, history, transfer, storage, navigation, layout, packageJson, styles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../features/character-library/CharacterLibrary.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../lib/characters/presetCharacters.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../features/character-creator/CharacterCreator.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../lib/characters/promptCharacterGeneration.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/api/characters/generate/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../features/battle-preparation/BattlePreparation.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../features/battle-observer/BattleObserver.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../features/battle-history/BattleHistory.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../lib/storage/characterLibraryTransfer.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../lib/storage/gameStorage.ts", import.meta.url), "utf8"),
    readFile(new URL("../features/navigation/BottomNavigation.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /CharacterLibrary/);
  assert.match(library, /useGameStore/);
  assert.match(library, /按职业筛选/);
  assert.match(library, /aria-pressed/);
  assert.match(library, /已自动导入/);
  assert.match(library, /addPresetCharacters/);
  assert.doesNotMatch(library, /设为红方|设为蓝方/);
  assert.match(library, /删除/);
  assert.match(library, /创建角色/);
  assert.match(presets, /护卫/);
  assert.match(presets, /公主/);
  assert.match(creator, /保存角色卡/);
  assert.match(creator, /手动创角/);
  assert.match(creator, /characterSchema/);
  assert.match(creator, /生成角色属性/);
  assert.match(creator, /自动生成的战斗配置/);
  assert.match(creator, /GeneratedSkillCard/);
  assert.match(creator, /disabled=\{!generatedSkills/);
  assert.match(creator, /api\/characters\/generate/);
  assert.match(creator, /战力阶位/);
  assert.match(creator, /AI 会判定职业/);
  assert.match(creator, /群体伤害/);
  assert.match(creator, /群体治疗/);
  assert.match(creator, /横扫被动/);
  assert.match(creator, /蓄力一击被动/);
  assert.doesNotMatch(creator, /SkillEditor/);
  assert.match(library, /<dt>攻击<\/dt>/);
  assert.match(library, /ProfessionIcon/);
  assert.doesNotMatch(library, /基础攻击|有效攻击|基础生命|有效生命/);
  assert.match(generator, /generateLocalCharacter/);
  assert.doesNotMatch(generator, /preferredProfession/);
  assert.match(generator, /realm/);
  assert.match(generator, /charge_strike_passive/);
  assert.match(generationRoute, /OPENAI_API_KEY/);
  assert.match(preparation, /双方人数可不同/);
  assert.match(preparation, /hasCompleteTeams/);
  assert.doesNotMatch(preparation, /确认单挑配置|classic-duel-panel|prepareBattle/);
  assert.match(preparation, /职业分类/);
  assert.match(preparation, /filteredCharacters/);
  assert.match(preparation, /随机种子/);
  assert.match(preparation, /保存团队阵容/);
  assert.match(preparation, /进入观战/);
  assert.match(preparation, /向前/);
  assert.match(preparation, /addCharacterToTeam/);
  assert.match(observer, /simulateBattle/);
  assert.match(observer, /simulateTeamBattle/);
  assert.match(observer, /getEffectiveCombatStats/);
  assert.match(observer, /逐回合战报/);
  assert.match(observer, /新种子再战/);
  assert.match(observer, /saveBattleRecord/);
  assert.match(observer, /saveTeamBattleRecord/);
  assert.match(observer, /团队逐回合战报/);
  assert.match(observer, /useBattleLogAutoFollow/);
  assert.match(observer, /team-observer-round/);
  assert.match(observer, /displayMembers = isLeft \? \[\.\.\.formation\.members\]\.reverse\(\)/);
  assert.match(observer, /暂停播放/);
  assert.match(observer, /formatTeamBattleLog/);
  assert.doesNotMatch(observer, /team-observer-skills/);
  assert.match(history, /同种子复赛/);
  assert.match(history, /团队回放/);
  assert.match(history, /teamBattles/);
  assert.match(history, /导出角色库/);
  assert.match(history, /导入角色库/);
  assert.match(transfer, /war-ai-game.character-library/);
  assert.match(storage, /migrateLegacyGameStore/);
  assert.match(navigation, /首页/);
  assert.match(navigation, /对战准备/);
  assert.match(navigation, /战斗历史/);
  assert.match(layout, /title:\s*"War AI"/);
  assert.match(layout, /BottomNavigation/);
  assert.match(styles, /\.character-grid/);
  assert.match(styles, /grid-template-columns: repeat\(10, minmax\(0, 1fr\)\)/);
  assert.match(styles, /\.team-observer-frame/);
  assert.match(styles, /\.bottom-navigation/);
  assert.match(styles, /\.battle-profession-filter/);
  assert.match(styles, /\.generated-profile/);
  assert.match(styles, /\.profession-icon/);
  assert.match(packageJson, /"zod"/);
  assert.match(packageJson, /"zustand"/);
  assert.doesNotMatch(library, /codex-preview|_sites-preview|SkeletonPreview/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
