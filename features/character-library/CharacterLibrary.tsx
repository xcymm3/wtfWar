"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { getEffectiveCombatStats } from "@/lib/battle/realm";
import { characterSchema } from "@/lib/schemas/character";
import { MAX_TEAM_SIZE, useGameStore } from "@/lib/store/gameStore";
import {
  beginTeamCharacterDrag,
  TeamBuilder,
} from "@/features/battle-preparation/TeamBuilder";
import { ProfessionIcon } from "@/features/profession/ProfessionIcon";
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
type SortKey = "profession" | "updatedAt";
type SortDirection = "asc" | "desc";

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

export function CharacterLibrary() {
  const hasHydrated = useGameStore((state) => state.hasHydrated);
  const characters = useGameStore((state) => state.characters);
  const hydrate = useGameStore((state) => state.hydrate);
  const removeCharacter = useGameStore((state) => state.removeCharacter);
  const teamCharacterIds = useGameStore((state) => state.teamCharacterIds);
  const addCharacterToTeam = useGameStore((state) => state.addCharacterToTeam);
  const addPresetCharacters = useGameStore((state) => state.addPresetCharacters);
  const importCharacters = useGameStore((state) => state.importCharacters);
  const hasImportedPresets = useRef(false);
  const [query, setQuery] = useState("");
  const [professionFilter, setProfessionFilter] = useState<ProfessionFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("updatedAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [remoteLibraryNotice, setRemoteLibraryNotice] = useState<string | null>(null);
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!hasHydrated || hasImportedPresets.current) return;

    hasImportedPresets.current = true;
    addPresetCharacters();
  }, [addPresetCharacters, hasHydrated]);

  useEffect(() => {
    if (!hasHydrated) return;

    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/characters");
        const payload = await response.json() as { characters?: unknown; error?: unknown };
        if (!response.ok) {
          throw new Error(
            typeof payload.error === "string" ? payload.error : "远端角色库暂时不可用。",
          );
        }

        const remoteCharacters = Array.isArray(payload.characters)
          ? payload.characters.map((character) => characterSchema.parse(character))
          : [];
        if (!cancelled) {
          importCharacters(remoteCharacters);
          setRemoteLibraryNotice(null);
        }
      } catch (error) {
        if (!cancelled) {
          setRemoteLibraryNotice(
            error instanceof Error ? error.message : "远端角色库暂时不可用。",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasHydrated, importCharacters]);

  const filteredCharacters = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");

    return characters
      .filter((character) => {
        const matchesProfession = professionFilter === "all" || character.profession === professionFilter;
        const matchesQuery = normalizedQuery.length === 0
          || character.name.toLocaleLowerCase("zh-CN").includes(normalizedQuery)
          || character.originalPrompt.toLocaleLowerCase("zh-CN").includes(normalizedQuery);

        return matchesProfession && matchesQuery;
      })
      .sort((first, second) => {
        const direction = sortDirection === "asc" ? 1 : -1;
        const primary = sortKey === "profession"
          ? PROFESSIONS.indexOf(first.profession) - PROFESSIONS.indexOf(second.profession)
          : first.updatedAt.localeCompare(second.updatedAt);

        if (primary !== 0) return primary * direction;
        return first.name.localeCompare(second.name, "zh-CN") * direction;
      });
  }, [characters, professionFilter, query, sortDirection, sortKey]);

  function handleRemove(character: Character): void {
    if (window.confirm(`确定从角色库中删除“${character.name}”吗？`)) {
      removeCharacter(character.id);
      setSelectedCharacter(null);
    }
  }

  function handleAddToTeam(side: "left" | "right", characterId: string): void {
    try {
      addCharacterToTeam(side, characterId);
    } catch (error) {
      setRemoteLibraryNotice(error instanceof Error ? error.message : "无法加入阵容。");
    }
  }

  if (!hasHydrated) {
    return (
      <main className="library-shell">
        <section className="library-loading" aria-live="polite">正在读取本地角色库…</section>
      </main>
    );
  }

  return (
    <main className="library-shell">
      <div className="library-frame">
        <header className="library-header">
          <p className="library-kicker">阵容选择</p>
        </header>

        {remoteLibraryNotice ? <p className="form-error" role="alert">{remoteLibraryNotice}</p> : null}

        <TeamBuilder characters={characters} />

        <section className="library-controls" aria-label="角色库筛选">
          <div className="library-toolbar">
            <span className="library-count" aria-label={`当前角色数：${characters.length}`}>当前角色数：{characters.length}</span>
            <div className="library-toolbar-actions">
              <button type="button" className="library-help-button" onClick={() => setIsHelpOpen(true)}>玩法介绍</button>
              <Link href="/create" className="create-character-link">创建角色</Link>
            </div>
          </div>
          <label className="search-field">
            <span className="sr-only">搜索角色</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索名字或角色描述"
            />
          </label>
          <div className="library-profession-filter">
            <span>职业</span>
            <div className="profession-filters" aria-label="按职业筛选">
              <button
                type="button"
                className={professionFilter === "all" ? "is-active" : ""}
                onClick={() => setProfessionFilter("all")}
                aria-pressed={professionFilter === "all"}
              >
                全部
              </button>
              {PROFESSIONS.map((profession) => (
                <button
                  key={profession}
                  type="button"
                  className={professionFilter === profession ? "is-active" : ""}
                  onClick={() => setProfessionFilter(profession)}
                  aria-pressed={professionFilter === profession}
                >
                  {PROFESSION_LABELS[profession]}
                </button>
              ))}
            </div>
          </div>
          <div className="library-sort-control">
            <span>排序</span>
            <div className="library-sort-buttons" aria-label="角色排序">
              <button
                type="button"
                className={sortKey === "profession" ? "is-active" : ""}
                onClick={() => setSortKey("profession")}
                aria-pressed={sortKey === "profession"}
              >
                职业
              </button>
              <button
                type="button"
                className={sortKey === "updatedAt" ? "is-active" : ""}
                onClick={() => setSortKey("updatedAt")}
                aria-pressed={sortKey === "updatedAt"}
              >
                时间
              </button>
              <button
                type="button"
                className={sortDirection === "asc" ? "is-active" : ""}
                onClick={() => setSortDirection("asc")}
                aria-pressed={sortDirection === "asc"}
              >
                正序
              </button>
              <button
                type="button"
                className={sortDirection === "desc" ? "is-active" : ""}
                onClick={() => setSortDirection("desc")}
                aria-pressed={sortDirection === "desc"}
              >
                倒序
              </button>
            </div>
          </div>
        </section>

        {filteredCharacters.length > 0 ? (
          <section className="character-grid" aria-label="角色列表">
            {filteredCharacters.map((character) => {
              const effectiveStats = getEffectiveCombatStats(character);
              const realm = character.realm ?? "mortal";
              const isAssigned = teamCharacterIds.left.includes(character.id) || teamCharacterIds.right.includes(character.id);
              const leftTeamIsFull = teamCharacterIds.left.length >= MAX_TEAM_SIZE;
              const rightTeamIsFull = teamCharacterIds.right.length >= MAX_TEAM_SIZE;

              return (
                <article
                  key={character.id}
                  draggable
                  onDragStart={(event) => beginTeamCharacterDrag(event, character.id)}
                  className={`character-card profession-${character.profession}`}
                  title="拖到上方阵容；点击“…”查看详情"
                >
                  <div className="character-card-summary">
                    <span className="character-summary-profession"><ProfessionIcon profession={character.profession} compact />{PROFESSION_LABELS[character.profession]}</span>
                    <span className="character-summary-realm">战斗力 {REALM_LABELS[realm]}</span>
                    <strong className="character-summary-name">{character.name}</strong>
                    <span className="character-summary-stat">攻击 <b>{effectiveStats.attack}</b></span>
                    <span className="character-summary-stat">血量 <b>{effectiveStats.maxHealth}</b></span>
                  </div>
                  <div className="character-card-actions">
                    <button
                      type="button"
                      className="team-add-button team-add-left character-card-team-button"
                      onClick={() => handleAddToTeam("left", character.id)}
                      disabled={isAssigned || leftTeamIsFull}
                      title={leftTeamIsFull ? "红方已满" : "加入红方"}
                    >
                      红方
                    </button>
                    <button
                      type="button"
                      className="team-add-button team-add-right character-card-team-button"
                      onClick={() => handleAddToTeam("right", character.id)}
                      disabled={isAssigned || rightTeamIsFull}
                      title={rightTeamIsFull ? "蓝方已满" : "加入蓝方"}
                    >
                      蓝方
                    </button>
                    <button
                      type="button"
                      className="character-more-button"
                      aria-label={`查看 ${character.name} 的完整详情`}
                      onClick={() => setSelectedCharacter(character)}
                    >
                      …
                    </button>
                  </div>
                </article>
              );
            })}
          </section>
        ) : (
          <section className="library-empty" aria-live="polite">
            <p>{characters.length === 0 ? "正在导入预设角色…" : "没有符合筛选条件的角色。"}</p>
            <span>{characters.length === 0 ? "稍候片刻，预设角色会自动出现在这里。" : "尝试清除搜索词或切换职业筛选。"}</span>
            <Link href="/create" className="empty-create-link">创建角色</Link>
          </section>
        )}

        {selectedCharacter ? (() => {
          const selectedStats = getEffectiveCombatStats(selectedCharacter);
          const selectedRealm = selectedCharacter.realm ?? "mortal";

          return (
            <dialog
              open
              className="character-detail-dialog"
              aria-labelledby="character-detail-title"
              onCancel={(event) => {
                event.preventDefault();
                setSelectedCharacter(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setSelectedCharacter(null);
                }
              }}
            >
              <div className="character-detail-dialog-header">
                <div>
                  <span><ProfessionIcon profession={selectedCharacter.profession} compact />{PROFESSION_LABELS[selectedCharacter.profession]} · {REALM_LABELS[selectedRealm]}</span>
                  <h2 id="character-detail-title">{selectedCharacter.name}</h2>
                </div>
                <button type="button" className="character-detail-close" aria-label="关闭角色详情" onClick={() => setSelectedCharacter(null)}>×</button>
              </div>

              <p className="character-detail-prompt">{selectedCharacter.originalPrompt}</p>

              <dl className="character-stats character-detail-stats">
                <div><dt>攻击</dt><dd>{selectedStats.attack}</dd></div>
                <div><dt>生命</dt><dd>{selectedStats.maxHealth}</dd></div>
              </dl>

              <div className="skill-list" aria-label={`${selectedCharacter.name} 的技能`}>
                {selectedCharacter.skills.map((skill) => (
                  <section key={skill.id} className="skill-item">
                    <div><span>{SKILL_TYPE_LABELS[skill.type]}</span><strong>{skill.name}</strong></div>
                    <p>{getSkillEffect(skill)} · 冷却 {skill.cooldown} 回合</p>
                  </section>
                ))}
              </div>

              <div className="character-actions character-detail-actions">
                <button type="button" className="delete-button" onClick={() => handleRemove(selectedCharacter)}>
                  删除角色
                </button>
              </div>
              <time className="character-detail-updated" dateTime={selectedCharacter.updatedAt}>更新于 {formatUpdatedAt(selectedCharacter.updatedAt)}</time>
            </dialog>
          );
        })() : null}

        {isHelpOpen ? (
          <dialog
            open
            className="character-detail-dialog library-help-dialog"
            aria-labelledby="game-help-title"
            onCancel={(event) => {
              event.preventDefault();
              setIsHelpOpen(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") setIsHelpOpen(false);
            }}
          >
            <div className="character-detail-dialog-header">
              <div>
                <span>War AI</span>
                <h2 id="game-help-title">游戏玩法</h2>
              </div>
              <button type="button" className="character-detail-close" aria-label="关闭帮助" onClick={() => setIsHelpOpen(false)}>×</button>
            </div>
            <ol className="game-help-list">
              <li>
                <strong>AI 创建角色</strong>
                <p>点击“创建角色”，输入名称、角色设定和战斗力；AI 会生成职业、属性和技能。同名角色不能重复保存。</p>
              </li>
              <li>
                <strong>选择战斗力</strong>
                <p>战斗力分为凡人、武林高手、超能力者、修仙者和神灵。阶位越高，最终攻击与血量越高。</p>
              </li>
              <li>
                <strong>开始游戏</strong>
                <p>在角色卡上加入红方或蓝方，也可拖动角色调整站位。每队最多 5 人，前排先战；双方各有至少一人后，点击“开始观战”。</p>
              </li>
            </ol>
          </dialog>
        ) : null}
      </div>
    </main>
  );
}
