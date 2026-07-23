"use client";

import { nanoid } from "nanoid";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { simulateBattle } from "@/lib/battle/battleEngine";
import { createBattleRecord } from "@/lib/battle/battleRecord";
import { BATTLE_RULES } from "@/lib/battle/constants";
import { getEffectiveCombatStats } from "@/lib/battle/realm";
import { useGameStore } from "@/lib/store/gameStore";
import type { BattleEvent, BattleSide } from "@/types/battle";
import {
  PROFESSION_LABELS,
  REALM_LABELS,
  type Character,
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

type VisualCombatant = {
  health: number;
  shield: number;
  cooldowns: Record<string, number>;
  isStunned: boolean;
};

type VisualBattleState = Record<BattleSide, VisualCombatant>;

type ObservedBattle = {
  seed: string;
  leftCharacter: Character;
  rightCharacter: Character;
  winner: BattleSide | "draw";
  rounds: number;
  events: BattleEvent[];
};

function createInitialVisualCombatant(character: Character): VisualCombatant {
  return {
    health: getEffectiveCombatStats(character).maxHealth,
    shield: 0,
    cooldowns: Object.fromEntries(character.skills.map((skill) => [skill.id, 0])),
    isStunned: false,
  };
}

function applyEvent(
  state: VisualBattleState,
  event: BattleEvent,
): VisualBattleState {
  return {
    ...state,
    [event.actor]: {
      health: event.actorHealth,
      shield: event.actorShield,
      cooldowns: event.actorCooldowns,
      isStunned: event.actorIsStunned,
    },
    [event.target]: {
      health: event.targetHealth,
      shield: event.targetShield,
      cooldowns: event.targetCooldowns,
      isStunned: event.targetIsStunned,
    },
  };
}

function getHealthPercentage(character: Character, health: number): number {
  return Math.max(
    0,
    Math.min(100, (health / getEffectiveCombatStats(character).maxHealth) * 100),
  );
}

function isStunSkip(event: BattleEvent): boolean {
  return event.skill === null && event.narration.includes("眩晕状态");
}

function FighterPanel({
  side,
  character,
  visualState,
}: {
  side: BattleSide;
  character: Character;
  visualState: VisualCombatant;
}) {
  const isLeft = side === "left";
  const effectiveStats = getEffectiveCombatStats(character);
  const realm = character.realm ?? "mortal";
  const healthPercentage = getHealthPercentage(character, visualState.health);

  return (
    <section className={`observer-fighter observer-fighter-${side}`}>
      <div className="observer-fighter-heading">
        <span>{isLeft ? "红方" : "蓝方"}</span>
        <strong>{character.name}</strong>
        <small>{PROFESSION_LABELS[character.profession]} · {REALM_LABELS[realm]}</small>
      </div>
      <div className="health-block">
        <div className="health-label">
          <span>生命</span>
          <strong>{visualState.health} / {effectiveStats.maxHealth}</strong>
        </div>
        <div className="health-track" aria-label={`${character.name} 当前生命 ${visualState.health}`}>
          <span style={{ width: `${healthPercentage}%` }} />
        </div>
      </div>
      <div className="observer-status-row">
        <span>攻击 {effectiveStats.attack}（基础 {character.attack}）</span>
        <span>护盾 {visualState.shield}</span>
        {visualState.isStunned ? <span className="stunned-status">眩晕</span> : null}
      </div>
      <div className="cooldown-list" aria-label={`${character.name} 技能冷却`}>
        {character.skills.map((skill) => {
          const cooldown = visualState.cooldowns[skill.id] ?? 0;

          return (
            <div key={skill.id} className={cooldown > 0 ? "is-cooling" : ""}>
              <span>{SKILL_TYPE_LABELS[skill.type]}</span>
              <strong>{skill.name}</strong>
              <em>{cooldown > 0 ? `${cooldown} 回合` : "可用"}</em>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function BattleObserverPlayer({
  battle,
  onBattleCompleted,
  onNewSeed,
}: {
  battle: ObservedBattle;
  onBattleCompleted?: () => void;
  onNewSeed: () => void;
}) {
  const { events, leftCharacter, rightCharacter, rounds, seed, winner } = battle;
  const [visibleEventCount, setVisibleEventCount] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasRecorded, setHasRecorded] = useState(false);
  const visualState = useMemo(() => {
    const initialState: VisualBattleState = {
      left: createInitialVisualCombatant(leftCharacter),
      right: createInitialVisualCombatant(rightCharacter),
    };

    return events.slice(0, visibleEventCount).reduce(applyEvent, initialState);
  }, [events, leftCharacter, rightCharacter, visibleEventCount]);
  const visibleEvents = events.slice(0, visibleEventCount);
  const currentRound = visibleEvents.at(-1)?.round ?? 0;
  const hasFinishedReplay = visibleEventCount === events.length;

  const finishBattleIfNeeded = useCallback((): void => {
    if (!hasRecorded && onBattleCompleted) {
      onBattleCompleted();
      setHasRecorded(true);
    }
  }, [hasRecorded, onBattleCompleted]);

  useEffect(() => {
    if (!isPlaying || hasFinishedReplay) return;

    const timer = window.setTimeout(() => {
      const nextCount = visibleEventCount + 1;
      setVisibleEventCount(nextCount);
      if (nextCount >= events.length) {
        setIsPlaying(false);
        finishBattleIfNeeded();
      }
    }, 600);

    return () => window.clearTimeout(timer);
  }, [events.length, finishBattleIfNeeded, hasFinishedReplay, isPlaying, visibleEventCount]);

  function playFromCurrentPosition(): void {
    if (hasFinishedReplay) setVisibleEventCount(0);
    setIsPlaying(true);
  }

  function showNextEvent(): void {
    const nextCount = Math.min(visibleEventCount + 1, events.length);
    setIsPlaying(false);
    setVisibleEventCount(nextCount);
    if (nextCount >= events.length) finishBattleIfNeeded();
  }

  function restartReplay(): void {
    setIsPlaying(false);
    setVisibleEventCount(0);
  }

  const winnerName =
    winner === "left"
      ? leftCharacter.name
      : winner === "right"
        ? rightCharacter.name
        : "平局";

  return (
    <main className="observer-shell">
      <div className="observer-frame">
        <header className="observer-header">
          <div>
            <p className="library-kicker">斗蛐蛐 AI · 观战</p>
            <h1>这一回合，谁能站到最后？</h1>
            <p>种子 <code>{seed}</code> · 已展示 {visibleEventCount} / {events.length} 个行动</p>
          </div>
          <div className="observer-header-actions">
            <Link href="/history" className="observer-history-link">战斗历史</Link>
            <Link href="/battle/prepare" className="back-link">返回对战准备</Link>
          </div>
        </header>

        <section className="observer-arena" aria-label="战斗状态">
          <FighterPanel
            side="left"
            character={leftCharacter}
            visualState={visualState.left}
          />
          <div className="observer-center">
            <span>ROUND</span>
            <strong>{currentRound || "—"}</strong>
            <small>上限 {BATTLE_RULES.maxRounds} 回合</small>
          </div>
          <FighterPanel
            side="right"
            character={rightCharacter}
            visualState={visualState.right}
          />
        </section>

        <section className="observer-controls" aria-label="观战控制">
          <button type="button" onClick={playFromCurrentPosition}>
            {isPlaying ? "播放中…" : hasFinishedReplay ? "从头自动播放" : "自动播放"}
          </button>
          <button
            type="button"
            className="secondary-observer-button"
            onClick={showNextEvent}
            disabled={hasFinishedReplay}
          >
            下一次行动
          </button>
          <button
            type="button"
            className="secondary-observer-button"
            onClick={restartReplay}
          >
            重新播放
          </button>
          <button
            type="button"
            className="secondary-observer-button"
            onClick={onNewSeed}
          >
            新种子再战
          </button>
        </section>

        {hasFinishedReplay ? (
          <section className="observer-result" aria-live="polite">
            <span>{winner === "draw" ? "战斗结束" : "胜者"}</span>
            <strong>{winnerName}</strong>
            <p>本场共进行 {rounds} 回合。相同阵容和种子始终会复现同一结果。</p>
          </section>
        ) : null}

        <section className="battle-log-panel" aria-label="逐回合战报">
          <div className="battle-log-heading">
            <div>
              <p className="library-kicker">逐回合战报</p>
              <h2>行动记录</h2>
            </div>
            <span>{hasFinishedReplay ? "已完成" : "等待推进"}</span>
          </div>
          {visibleEvents.length > 0 ? (
            <ol className="battle-log-list">
              {visibleEvents.map((event, index) => {
                const skip = isStunSkip(event);

                return (
                  <li
                    key={`${event.round}-${event.actor}-${index}`}
                    className={`${skip ? "is-skip" : ""} ${index === visibleEvents.length - 1 ? "is-current" : ""}`}
                  >
                    <span className="battle-log-round">R{event.round}</span>
                    <div>
                      <strong>
                        {event.skill
                          ? `${event.skill.name} · ${SKILL_TYPE_LABELS[event.skill.type]}`
                          : skip
                            ? "眩晕跳过"
                            : "普通攻击"}
                      </strong>
                      <p>{event.narration}</p>
                    </div>
                    <em>{event.actor === "left" ? "红方" : "蓝方"}</em>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="battle-log-empty">点击“自动播放”或“下一次行动”开始观战。</p>
          )}
        </section>
      </div>
    </main>
  );
}

export function BattleObserver() {
  const hasHydrated = useGameStore((state) => state.hasHydrated);
  const hydrate = useGameStore((state) => state.hydrate);
  const battles = useGameStore((state) => state.battles);
  const preparedBattle = useGameStore((state) => state.preparedBattle);
  const preparedTeamBattle = useGameStore((state) => state.preparedTeamBattle);
  const activeReplayBattleId = useGameStore((state) => state.activeReplayBattleId);
  const saveBattleRecord = useGameStore((state) => state.saveBattleRecord);
  const rematchBattle = useGameStore((state) => state.rematchBattle);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const replayRecord = useMemo(
    () => battles.find((battle) => battle.id === activeReplayBattleId),
    [activeReplayBattleId, battles],
  );
  const observedBattle = useMemo<ObservedBattle | null>(() => {
    if (replayRecord) {
      return {
        seed: replayRecord.seed,
        leftCharacter: replayRecord.leftCharacter,
        rightCharacter: replayRecord.rightCharacter,
        winner: replayRecord.winner,
        rounds: replayRecord.rounds,
        events: replayRecord.events,
      };
    }

    if (!preparedBattle) return null;

    const result = simulateBattle({
      seed: preparedBattle.seed,
      leftCharacter: preparedBattle.leftCharacter,
      rightCharacter: preparedBattle.rightCharacter,
    });

    return {
      seed: preparedBattle.seed,
      leftCharacter: preparedBattle.leftCharacter,
      rightCharacter: preparedBattle.rightCharacter,
      winner: result.winner,
      rounds: result.round,
      events: result.events,
    };
  }, [preparedBattle, replayRecord]);
  const newBattleRecord = useMemo(
    () => observedBattle && !replayRecord
      ? createBattleRecord(observedBattle)
      : null,
    [observedBattle, replayRecord],
  );

  if (!hasHydrated) {
    return (
      <main className="observer-shell">
        <section className="observer-loading" aria-live="polite">
          正在加载战斗配置…
        </section>
      </main>
    );
  }

  if (!observedBattle) {
    return (
      <main className="observer-shell">
        <section className="observer-empty">
          <p className="library-kicker">斗蛐蛐 AI · 观战</p>
          <h1>{preparedTeamBattle ? "团队阵容已保存" : "还没有可观战的对局"}</h1>
          <p>
            {preparedTeamBattle
              ? `已保存 ${preparedTeamBattle.leftTeam.members.length} v ${preparedTeamBattle.rightTeam.members.length} 队伍。团队结算已就绪，观战界面与团队战报将在后续步骤接入。`
              : "请先选择双方角色，并在对战准备页确认一个随机种子。"}
          </p>
          <Link href="/battle/prepare" className="empty-create-link">前往对战准备</Link>
        </section>
      </main>
    );
  }

  return (
    <BattleObserverPlayer
      key={replayRecord?.id ?? `${observedBattle.leftCharacter.id}:${observedBattle.rightCharacter.id}:${observedBattle.seed}`}
      battle={observedBattle}
      onBattleCompleted={newBattleRecord ? () => saveBattleRecord(newBattleRecord) : undefined}
      onNewSeed={() =>
        rematchBattle(
          `battle-${nanoid(12)}`,
          observedBattle.leftCharacter,
          observedBattle.rightCharacter,
        )
      }
    />
  );
}
