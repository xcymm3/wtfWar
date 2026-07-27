import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";

const port = 4300 + (process.pid % 1000);
const origin = `http://127.0.0.1:${port}`;
const nextBin = fileURLToPath(
  new URL("../node_modules/next/dist/bin/next", import.meta.url),
);
let server;

async function waitForServer() {
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(origin);
      if (response.ok) return;
    } catch {
      // The production server is still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  throw new Error("Next.js production server did not start in time.");
}

before(async () => {
  server = spawn(
    process.execPath,
    [nextBin, "start", "--hostname", "127.0.0.1", "--port", String(port)],
    {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      env: {
        ...process.env,
        OPENAI_API_KEY: "",
        OPENAI_BASE_URL: "",
        OPENAI_MODEL: "",
      },
      stdio: "ignore",
    },
  );

  await waitForServer();
});

after(async () => {
  if (!server || server.exitCode !== null) return;

  await new Promise((resolve) => {
    server.once("exit", resolve);
    server.kill();
  });
});

async function render(path = "/", init = {}) {
  return fetch(`${origin}${path}`, {
    ...init,
    headers: { accept: "text/html", ...init.headers },
  });
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

test("redirects the legacy battle preparation route to the merged home page", async () => {
  const response = await render("/battle/prepare");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /正在读取本地角色库/);
});

test("server-renders the battle observer loading boundary", async () => {
  const response = await render("/battle");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /正在加载战斗配置/);
});

test("generates a validated local character through the production API route", async () => {
  const response = await render("/api/characters/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "霜语",
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
  const [page, library, presets, creator, generator, generationRoute, charactersRoute, repository, preparation, observer, storage, layout, packageJson, styles] = await Promise.all([
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
    readFile(new URL("../app/api/characters/route.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../lib/characters/characterRepository.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../features/battle-preparation/TeamBuilder.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../features/battle-observer/BattleObserver.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../lib/storage/gameStorage.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /CharacterLibrary/);
  assert.match(library, /useGameStore/);
  assert.match(library, /按职业筛选/);
  assert.match(library, /aria-pressed/);
  assert.doesNotMatch(library, /已自动导入/);
  assert.match(library, /addPresetCharacters/);
  assert.match(library, /TeamBuilder/);
  assert.match(library, /beginTeamCharacterDrag/);
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
  assert.match(creator, /fetch\("\/api\/characters"/);
  assert.match(creator, /正在保存到角色库/);
  assert.match(creator, /战力阶位/);
  assert.match(creator, /综合名称与描述判定职业/);
  assert.match(creator, /角色名称与描述/);
  assert.match(creator, /群体伤害/);
  assert.match(creator, /群体治疗/);
  assert.match(creator, /横扫被动/);
  assert.match(creator, /蓄力一击被动/);
  assert.doesNotMatch(creator, /SkillEditor/);
  assert.match(library, /<dt>攻击<\/dt>/);
  assert.match(library, /ProfessionIcon/);
  assert.doesNotMatch(library, /基础攻击|有效攻击|基础生命|有效生命/);
  assert.match(generator, /generateLocalCharacter/);
  assert.match(generator, /角色名称/);
  assert.doesNotMatch(generator, /preferredProfession/);
  assert.match(generator, /realm/);
  assert.match(generator, /charge_strike_passive/);
  assert.match(generationRoute, /OPENAI_API_KEY/);
  assert.doesNotMatch(generationRoute, /response_format/);
  assert.match(charactersRoute, /createRemoteCharacter/);
  assert.match(charactersRoute, /DuplicateCharacterNameError/);
  assert.match(repository, /ensurePresetCharacters/);
  assert.match(repository, /characters\.normalizedName/);
  assert.match(preparation, /拖动角色卡排位/);
  assert.match(preparation, /hasCompleteTeams/);
  assert.match(preparation, /onDragStart/);
  assert.match(preparation, /onDrop/);
  assert.match(preparation, /setTeamCharacterIds/);
  assert.match(preparation, /开始观战/);
  assert.doesNotMatch(preparation, /向前|向后/);
  assert.match(observer, /simulateBattle/);
  assert.match(observer, /simulateTeamBattle/);
  assert.match(observer, /getEffectiveCombatStats/);
  assert.match(observer, /新种子再战/);
  assert.match(observer, /实时战报/);
  assert.match(observer, /useBattleLogAutoFollow/);
  assert.match(observer, /team-observer-round/);
  assert.match(observer, /const displayMembers = formation\.members/);
  assert.match(observer, /自动战斗/);
  assert.match(observer, /暂停战斗/);
  assert.match(observer, /重新战斗/);
  assert.doesNotMatch(observer, /自动播放|暂停播放|重新播放/);
  assert.match(observer, /formatTeamBattleLog/);
  assert.doesNotMatch(observer, /team-observer-skills/);
  assert.match(storage, /migrateLegacyGameStore/);
  assert.doesNotMatch(storage, /teamBattles:/);
  assert.match(layout, /title:\s*"War AI"/);
  assert.doesNotMatch(layout, /BottomNavigation/);
  assert.match(styles, /\.character-grid/);
  assert.match(styles, /grid-template-columns: minmax\(0, 1fr\) 52px minmax\(0, 1fr\)/);
  assert.match(styles, /\.team-observer-list-left[\s\S]*direction: rtl/);
  assert.match(styles, /\.team-battle-log-list li[\s\S]*width: 100%/);
  assert.match(styles, /\.team-observer-frame/);
  assert.doesNotMatch(styles, /\.bottom-navigation/);
  assert.match(styles, /\.battle-profession-filter/);
  assert.match(styles, /\.generated-profile/);
  assert.match(styles, /\.profession-icon/);
  assert.match(packageJson, /"zod"/);
  assert.match(packageJson, /"zustand"/);
  assert.match(packageJson, /"next build"/);
  assert.doesNotMatch(packageJson, /vinext|wrangler|@cloudflare\/vite-plugin/);
  assert.doesNotMatch(library, /codex-preview|_sites-preview|SkeletonPreview/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
