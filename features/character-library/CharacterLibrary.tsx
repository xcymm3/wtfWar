"use client";

import { useEffect, useMemo, useState } from "react";

import Link from "next/link";

import { getEffectiveCombatStats } from "@/lib/battle/realm";
import { useGameStore } from "@/lib/store/gameStore";
import { PRESET_CHARACTERS } from "@/lib/characters/presetCharacters";
import {
  PROFESSIONS,
  PROFESSION_LABELS,
  REALM_LABELS,
  type Character,
  type Profession,
  type Skill,
} from "@/types/character";

const SKILL_TYPE_LABELS: Record<Skill["type"], string> = {
  damage: "伤害",
  shield: "护盾",
  heal: "治疗",
  control: "控制",
  area_damage: "群体伤害",
  area_heal: "群体治疗",
  cleave_passive: "横扫被动",
  charge_strike_passive: "蓄力被动",
  buff: "增益",
};

type ProfessionFilter = Profession | "all";

function getSkillEffect(skill: Skill): string {
  switch (skill.type) {
    case "damage":
      return `伤害倍率 ×${skill.damageMultiplier ?? 0}`;
    case "shield":
      return `获得 ${skill.shieldAmount ?? 0} 护盾`;
    case "heal":
      return `恢复 ${skill.healAmount ?? 0} 生命`;
    case "control":
      return `${Math.round((skill.stunChance ?? 0) * 100)}% 概率眩晕`;
    case "area_damage":
      return `全体伤害倍率 ×${skill.damageMultiplier ?? 0}`;
    case "area_heal":
      return `全队恢复 ${skill.healAmount ?? 0} 生命`;
    case "cleave_passive":
      return "普通攻击改为横扫，但攻击降低";
    case "charge_strike_passive":
      return `每 ${skill.chargeTurns ?? 0} 次行动蓄力一击`;
    case "buff":
      return "Beta 阶段暂未开放";
  }
}

function formatUpdatedAt(updatedAt: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
  }).format(new Date(updatedAt));
}

function BattleSeat({
  side,
  character,
}: {
  side: "left" | "right";
  character: Character | undefined;
}) {
  const isLeft = side === "left";
  const realm = character?.realm ?? "mortal";

  return (
    <section className={`battle-seat ${isLeft ? "battle-seat-left" : "battle-seat-right"}`}>
      <p>{isLeft ? "红方" : "蓝方"}</p>
      <strong>{character?.name ?? "未选择角色"}</strong>
      <span>{character ? `${PROFESSION_LABELS[character.profession]} · ${REALM_LABELS[realm]}` : "从角色库中指定"}</span>
    </section>
  );
}

export function CharacterLibrary() {
  const hasHydrated = useGameStore((state) => state.hasHydrated);
  const characters = useGameStore((state) => state.characters);
  const selectedCharacterIds = useGameStore(
    (state) => state.selectedCharacterIds,
  );
  const hydrate = useGameStore((state) => state.hydrate);
  const selectCharacter = useGameStore((state) => state.selectCharacter);
  const removeCharacter = useGameStore((state) => state.removeCharacter);
  const addPresetCharacters = useGameStore((state) => state.addPresetCharacters);
  const [query, setQuery] = useState("");
  const [professionFilter, setProfessionFilter] = useState<ProfessionFilter>(
    "all",
  );
  const [presetNotice, setPresetNotice] = useState<string | null>(null);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const selectedCharacters = useMemo(
    () => ({
      left: characters.find(
        (character) => character.id === selectedCharacterIds.left,
      ),
      right: characters.find(
        (character) => character.id === selectedCharacterIds.right,
      ),
    }),
    [characters, selectedCharacterIds],
  );

  const filteredCharacters = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");

    return characters
      .filter((character) => {
        const matchesProfession =
          professionFilter === "all" ||
          character.profession === professionFilter;
        const matchesQuery =
          normalizedQuery.length === 0 ||
          character.name.toLocaleLowerCase("zh-CN").includes(normalizedQuery) ||
          character.originalPrompt
            .toLocaleLowerCase("zh-CN")
            .includes(normalizedQuery);

        return matchesProfession && matchesQuery;
      })
      .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt));
  }, [characters, professionFilter, query]);

  function handleRemove(character: Character): void {
    if (window.confirm(`确定从角色库中删除“${character.name}”吗？`)) {
      removeCharacter(character.id);
    }
  }

  function handleAddPresets(): void {
    const addedCount = addPresetCharacters();
    setPresetNotice(
      addedCount > 0
        ? `已加入 ${addedCount} 名预设角色。`
        : "10 名预设角色都已在角色库中。",
    );
  }

  const missingPresetCount = PRESET_CHARACTERS.filter(
    (preset) => !characters.some((character) => character.id === preset.id),
  ).length;

  if (!hasHydrated) {
    return (
      <main className="library-shell">
        <section className="library-loading" aria-live="polite">
          正在读取本地角色库…
        </section>
      </main>
    );
  }

  return (
    <main className="library-shell">
      <div className="library-frame">
        <header className="library-header">
          <div>
            <p className="library-kicker">斗蛐蛐 AI · 角色库</p>
            <h1>选出下一场的主角</h1>
            <p className="library-intro">
              角色将保存在当前浏览器中。指定红蓝双方后，第 16 步的对战准备页会直接读取它们。
            </p>
          </div>
          <div className="library-header-actions">
            <div className="library-count" aria-label={`当前共有 ${characters.length} 名角色`}>
              <strong>{characters.length}</strong>
              <span>名已保存角色</span>
            </div>
            <Link href="/create" className="create-character-link">手动创角</Link>
            <Link href="/battle/prepare" className="battle-prep-link">对战准备</Link>
            <Link href="/history" className="history-link">战斗历史</Link>
            <button
              type="button"
              className="preset-characters-button"
              onClick={handleAddPresets}
            >
              {missingPresetCount > 0 ? `加入 ${missingPresetCount} 个预设角色` : "预设角色已齐全"}
            </button>
          </div>
        </header>

        {presetNotice ? <p className="preset-notice" role="status">{presetNotice}</p> : null}

        <section className="battle-seats" aria-label="当前对战选择">
          <BattleSeat side="left" character={selectedCharacters.left} />
          <div className="versus-mark" aria-hidden="true">VS</div>
          <BattleSeat side="right" character={selectedCharacters.right} />
        </section>

        <section className="library-controls" aria-label="角色库筛选">
          <label className="search-field">
            <span className="sr-only">搜索角色</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索名字或角色描述"
            />
          </label>
          <div className="profession-filters" aria-label="按职业筛选">
            <button
              type="button"
              className={professionFilter === "all" ? "is-active" : ""}
              onClick={() => setProfessionFilter("all")}
            >
              全部
            </button>
            {PROFESSIONS.map((profession) => (
              <button
                key={profession}
                type="button"
                className={professionFilter === profession ? "is-active" : ""}
                onClick={() => setProfessionFilter(profession)}
              >
                {PROFESSION_LABELS[profession]}
              </button>
            ))}
          </div>
        </section>

        {filteredCharacters.length > 0 ? (
          <section className="character-grid" aria-label="角色列表">
            {filteredCharacters.map((character) => {
              const isLeftSelected = selectedCharacterIds.left === character.id;
              const isRightSelected = selectedCharacterIds.right === character.id;
              const effectiveStats = getEffectiveCombatStats(character);
              const realm = character.realm ?? "mortal";

              return (
                <article
                  key={character.id}
                  className={`character-card profession-${character.profession}`}
                >
                  <div className="character-card-topline">
                    <span>{PROFESSION_LABELS[character.profession]} · {REALM_LABELS[realm]}</span>
                    <time dateTime={character.updatedAt}>
                      更新于 {formatUpdatedAt(character.updatedAt)}
                    </time>
                  </div>
                  <h2>{character.name}</h2>
                  <p className="character-prompt">{character.originalPrompt}</p>

                  <dl className="character-stats">
                    <div>
                      <dt>基础攻击</dt>
                      <dd>{character.attack}</dd>
                    </div>
                    <div>
                      <dt>有效攻击</dt>
                      <dd>{effectiveStats.attack}</dd>
                    </div>
                    <div>
                      <dt>基础生命</dt>
                      <dd>{character.maxHealth}</dd>
                    </div>
                    <div>
                      <dt>有效生命</dt>
                      <dd>{effectiveStats.maxHealth}</dd>
                    </div>
                  </dl>

                  <div className="skill-list" aria-label={`${character.name} 的技能`}>
                    {character.skills.map((skill) => (
                      <section key={skill.id} className="skill-item">
                        <div>
                          <span>{SKILL_TYPE_LABELS[skill.type]}</span>
                          <strong>{skill.name}</strong>
                        </div>
                        <p>{getSkillEffect(skill)} · 冷却 {skill.cooldown} 回合</p>
                      </section>
                    ))}
                  </div>

                  <div className="character-actions">
                    <button
                      type="button"
                      className={`seat-button seat-button-left ${isLeftSelected ? "is-selected" : ""}`}
                      aria-pressed={isLeftSelected}
                      onClick={() =>
                        selectCharacter("left", isLeftSelected ? null : character.id)
                      }
                    >
                      {isLeftSelected ? "红方已选" : "设为红方"}
                    </button>
                    <button
                      type="button"
                      className={`seat-button seat-button-right ${isRightSelected ? "is-selected" : ""}`}
                      aria-pressed={isRightSelected}
                      onClick={() =>
                        selectCharacter("right", isRightSelected ? null : character.id)
                      }
                    >
                      {isRightSelected ? "蓝方已选" : "设为蓝方"}
                    </button>
                    <button
                      type="button"
                      className="delete-button"
                      onClick={() => handleRemove(character)}
                    >
                      删除
                    </button>
                  </div>
                </article>
              );
            })}
          </section>
        ) : (
          <section className="library-empty" aria-live="polite">
            <p>{characters.length === 0 ? "角色库还是空的。" : "没有符合筛选条件的角色。"}</p>
            <span>
              {characters.length === 0
                ? "先创建一名角色，再为它指定红方或蓝方。"
                : "尝试清除搜索词或切换职业筛选。"}
            </span>
            {characters.length === 0 ? (
              <Link href="/create" className="empty-create-link">创建第一名角色</Link>
            ) : null}
          </section>
        )}
      </div>
    </main>
  );
}
