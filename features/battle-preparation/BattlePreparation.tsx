"use client";

import { nanoid } from "nanoid";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { getEffectiveCombatStats } from "@/lib/battle/realm";
import { useGameStore } from "@/lib/store/gameStore";
import { ProfessionIcon } from "@/features/profession/ProfessionIcon";
import type { BattleSide } from "@/types/battle";
import {
  PROFESSIONS,
  PROFESSION_LABELS,
  REALM_LABELS,
  type Character,
  type Profession,
} from "@/types/character";

type ProfessionFilter = Profession | "all";

function TeamLineup({
  side,
  members,
  onMove,
  onRemove,
  onClear,
}: {
  side: BattleSide;
  members: Character[];
  onMove: (characterId: string, direction: -1 | 1) => void;
  onRemove: (characterId: string) => void;
  onClear: () => void;
}) {
  const isLeft = side === "left";
  const sideLabel = isLeft ? "红方" : "蓝方";

  return (
    <section className={`team-lineup team-lineup-${side}`} aria-label={`${sideLabel}队伍`}>
      <header>
        <div>
          <span>{sideLabel}</span>
          <strong>{members.length} 人</strong>
        </div>
        <button type="button" onClick={onClear} disabled={members.length === 0}>
          清空
        </button>
      </header>
      <p className="team-lineup-hint">从上到下为前到后，1 号位优先承受攻击。</p>
      {members.length > 0 ? (
        <ol>
          {members.map((character, index) => {
            const realm = character.realm ?? "mortal";
            const effectiveStats = getEffectiveCombatStats(character);

            return (
              <li key={character.id}>
                <span className="team-position">
                  {index + 1}
                  <small>{index === 0 ? "前排" : "后位"}</small>
                </span>
                <div className="team-member-summary">
                  <strong>{character.name}</strong>
                  <span><ProfessionIcon profession={character.profession} compact />{PROFESSION_LABELS[character.profession]} · {REALM_LABELS[realm]}</span>
                  <small>攻 {effectiveStats.attack} · 命 {effectiveStats.maxHealth}</small>
                </div>
                <div className="team-member-actions">
                  <button
                    type="button"
                    onClick={() => onMove(character.id, -1)}
                    disabled={index === 0}
                    aria-label={`让 ${character.name} 向前移动`}
                  >
                    向前
                  </button>
                  <button
                    type="button"
                    onClick={() => onMove(character.id, 1)}
                    disabled={index === members.length - 1}
                    aria-label={`让 ${character.name} 向后移动`}
                  >
                    向后
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(character.id)}
                    aria-label={`将 ${character.name} 移出${sideLabel}`}
                  >
                    移出
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="team-lineup-empty">从下方角色库加入 1–5 名角色。</p>
      )}
    </section>
  );
}

function createSeed(): string {
  return `battle-${nanoid(12)}`;
}

function sameMemberOrder(members: Character[], ids: string[]): boolean {
  return members.length === ids.length && members.every(
    (member, index) => member.id === ids[index],
  );
}

export function BattlePreparation() {
  const hasHydrated = useGameStore((state) => state.hasHydrated);
  const hydrate = useGameStore((state) => state.hydrate);
  const characters = useGameStore((state) => state.characters);
  const teamCharacterIds = useGameStore((state) => state.teamCharacterIds);
  const preparedTeamBattle = useGameStore((state) => state.preparedTeamBattle);
  const addCharacterToTeam = useGameStore((state) => state.addCharacterToTeam);
  const removeCharacterFromTeam = useGameStore(
    (state) => state.removeCharacterFromTeam,
  );
  const moveTeamCharacter = useGameStore((state) => state.moveTeamCharacter);
  const clearTeam = useGameStore((state) => state.clearTeam);
  const prepareTeamBattle = useGameStore((state) => state.prepareTeamBattle);
  const [seed, setSeed] = useState(createSeed);
  const [error, setError] = useState<string | null>(null);
  const [professionFilter, setProfessionFilter] = useState<ProfessionFilter>("all");

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const teamMembers = useMemo(
    () => ({
      left: teamCharacterIds.left.flatMap((characterId) => {
        const character = characters.find((candidate) => candidate.id === characterId);
        return character ? [character] : [];
      }),
      right: teamCharacterIds.right.flatMap((characterId) => {
        const character = characters.find((candidate) => candidate.id === characterId);
        return character ? [character] : [];
      }),
    }),
    [characters, teamCharacterIds],
  );
  const isPreparedForCurrentTeam =
    preparedTeamBattle?.seed === seed.trim() &&
    sameMemberOrder(preparedTeamBattle.leftTeam.members, teamCharacterIds.left) &&
    sameMemberOrder(preparedTeamBattle.rightTeam.members, teamCharacterIds.right);
  const hasCompleteTeams = teamMembers.left.length > 0 && teamMembers.right.length > 0;
  const filteredCharacters = useMemo(
    () => characters.filter(
      (character) => professionFilter === "all" || character.profession === professionFilter,
    ),
    [characters, professionFilter],
  );

  function handleTeamPrepare(): void {
    setError(null);

    try {
      prepareTeamBattle(seed);
      setSeed(seed.trim());
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "无法保存团队阵容。",
      );
    }
  }

  function handleTeamAction(action: () => void): void {
    setError(null);
    try {
      action();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "无法调整队伍。",
      );
    }
  }

  if (!hasHydrated) {
    return (
      <main className="preparation-shell">
        <section className="preparation-loading" aria-live="polite">
          正在读取对战阵容…
        </section>
      </main>
    );
  }

  if (characters.length === 0) {
    return (
      <main className="preparation-shell">
        <section className="preparation-empty">
          <p className="library-kicker">次元竞技场 · 对战准备</p>
          <h1>还没有可出战的角色</h1>
          <p>请先回到角色库创建角色或加入预设角色，再为双方布置队伍。</p>
          <Link href="/" className="empty-create-link">返回角色库</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="preparation-shell">
      <div className="preparation-frame">
        <header className="preparation-header">
          <div>
            <p className="library-kicker">次元竞技场 · 对战准备</p>
            <h1>布置队伍与战斗种子</h1>
            <p>
              每队可排入 1–5 名角色；位置越靠前，越会先承受攻击。双方人数可不同，不设战力或阶位上限。
            </p>
          </div>
          <Link href="/" className="back-link">返回角色库</Link>
        </header>

        <section className="team-builder" aria-labelledby="team-builder-heading">
          <div className="team-builder-heading">
            <div>
              <p className="library-kicker">团队阵容</p>
              <h2 id="team-builder-heading">从前排到后排，自由安排站位</h2>
            </div>
            <span>{teamMembers.left.length} v {teamMembers.right.length}</span>
          </div>
          <div className="team-builder-grid">
            <TeamLineup
              side="left"
              members={teamMembers.left}
              onMove={(characterId, direction) =>
                handleTeamAction(() => moveTeamCharacter("left", characterId, direction))
              }
              onRemove={(characterId) =>
                handleTeamAction(() => removeCharacterFromTeam("left", characterId))
              }
              onClear={() => handleTeamAction(() => clearTeam("left"))}
            />
            <div className="team-builder-versus" aria-hidden="true">VS</div>
            <TeamLineup
              side="right"
              members={teamMembers.right}
              onMove={(characterId, direction) =>
                handleTeamAction(() => moveTeamCharacter("right", characterId, direction))
              }
              onRemove={(characterId) =>
                handleTeamAction(() => removeCharacterFromTeam("right", characterId))
              }
              onClear={() => handleTeamAction(() => clearTeam("right"))}
            />
          </div>

          <section className="team-roster" aria-label="可加入队伍的角色">
            <header>
              <div>
                <h3>从角色库补充队员</h3>
                <p>同一名角色只能出现一次。队伍满 5 人后不能继续加入。</p>
              </div>
            </header>
            <div className="battle-profession-filter" aria-label="按职业查看角色">
              <span>职业分类</span>
              <div className="profession-filters" role="group" aria-label="选择职业">
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
            <div className="team-roster-grid">
              {filteredCharacters.map((character) => {
                const realm = character.realm ?? "mortal";
                const isOnLeft = teamCharacterIds.left.includes(character.id);
                const isOnRight = teamCharacterIds.right.includes(character.id);
                const isAssigned = isOnLeft || isOnRight;
                const leftIsFull = teamMembers.left.length >= 5;
                const rightIsFull = teamMembers.right.length >= 5;

                return (
                  <article key={character.id} className="team-roster-card">
                    <div>
                      <strong>{character.name}</strong>
                      <span><ProfessionIcon profession={character.profession} compact />{PROFESSION_LABELS[character.profession]} · {REALM_LABELS[realm]}</span>
                    </div>
                    <div>
                      <button
                        type="button"
                        disabled={isAssigned || leftIsFull}
                        onClick={() => handleTeamAction(() => addCharacterToTeam("left", character.id))}
                      >
                        {isOnLeft ? "已在红方" : isOnRight ? "已在蓝方" : "加入红方"}
                      </button>
                      <button
                        type="button"
                        disabled={isAssigned || rightIsFull}
                        onClick={() => handleTeamAction(() => addCharacterToTeam("right", character.id))}
                      >
                        {isOnRight ? "已在蓝方" : isOnLeft ? "已在红方" : "加入蓝方"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
            {filteredCharacters.length === 0 ? (
              <p className="team-roster-empty">该职业暂时没有角色，切换职业即可继续查看。</p>
            ) : null}
          </section>
        </section>

        <section className="seed-panel" aria-labelledby="seed-heading">
          <div>
            <p className="library-kicker">可复现战斗</p>
            <h2 id="seed-heading">随机种子</h2>
            <p>相同队伍顺序、角色快照和种子会得到相同的战斗过程。</p>
          </div>
          <div className="seed-input-row">
            <label>
              <span className="sr-only">战斗随机种子</span>
              <input
                required
                value={seed}
                onChange={(event) => setSeed(event.target.value)}
                placeholder="例如：five-deities"
              />
            </label>
            <button type="button" onClick={() => setSeed(createSeed())}>
              重新生成
            </button>
          </div>
        </section>

        {error ? <p className="form-error" role="alert">{error}</p> : null}

        <footer className="preparation-actions team-preparation-actions">
          <div>
            <strong>{hasCompleteTeams ? `阵容合法：${teamMembers.left.length} v ${teamMembers.right.length}` : "双方至少各需 1 名角色。"}</strong>
            <span>保存后会冻结当前队伍顺序和角色快照，可立即进入团队观战并生成完整战报。</span>
          </div>
          <button type="button" onClick={handleTeamPrepare} disabled={!hasCompleteTeams}>
            保存团队阵容
          </button>
        </footer>

        {isPreparedForCurrentTeam && preparedTeamBattle ? (
          <section className="prepared-notice" aria-live="polite">
            团队阵容已保存：红方 {preparedTeamBattle.leftTeam.members.length} 人，对阵蓝方 {preparedTeamBattle.rightTeam.members.length} 人，种子为 <code>{preparedTeamBattle.seed}</code>。
            <Link href="/battle" className="watch-battle-link">进入观战</Link>
          </section>
        ) : null}
      </div>
    </main>
  );
}
