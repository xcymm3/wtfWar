"use client";

import { nanoid } from "nanoid";
import Link from "next/link";
import {
  type UIEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { simulateBattle } from "@/lib/battle/battleEngine";
import { createBattleRecord } from "@/lib/battle/battleRecord";
import { BATTLE_RULES } from "@/lib/battle/constants";
import { getEffectiveCombatStats } from "@/lib/battle/realm";
import { createTeamBattleRecord } from "@/lib/battle/teamBattleRecord";
import { simulateTeamBattle } from "@/lib/battle/teamBattleEngine";
import { useGameStore } from "@/lib/store/gameStore";
import type {
  BattleEvent,
  BattleSide,
  TeamBattleCombatantSnapshot,
  TeamBattleEvent,
  TeamFormation,
} from "@/types/battle";
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
type TeamVisualState = Record<BattleSide, TeamBattleCombatantSnapshot[]>;

type ObservedBattle = {
  seed: string;
  leftCharacter: Character;
  rightCharacter: Character;
  winner: BattleSide | "draw";
  rounds: number;
  events: BattleEvent[];
};

type ObservedTeamBattle = {
  seed: string;
  leftTeam: TeamFormation;
  rightTeam: TeamFormation;
  winner: BattleSide | "draw";
  rounds: number;
  events: TeamBattleEvent[];
};

function getTeamEffectiveStats(character: Character) {
  const effectiveStats = getEffectiveCombatStats(character);
  if (!character.skills.some((skill) => skill.type === "cleave_passive")) {
    return effectiveStats;
  }

  return {
    ...effectiveStats,
    attack: Math.floor(effectiveStats.attack * 0.65),
  };
}

function createInitialVisualCombatant(character: Character): VisualCombatant {
  return {
    health: getEffectiveCombatStats(character).maxHealth,
    shield: 0,
    cooldowns: Object.fromEntries(character.skills.map((skill) => [skill.id, 0])),
    isStunned: false,
  };
}

function createInitialTeamVisualState(
  leftTeam: TeamFormation,
  rightTeam: TeamFormation,
): TeamVisualState {
  const toSnapshots = (team: TeamFormation) => team.members.map((character, index) => ({
    characterId: character.id,
    position: index + 1,
    health: getTeamEffectiveStats(character).maxHealth,
    shield: 0,
    cooldowns: Object.fromEntries(character.skills.map((skill) => [skill.id, 0])),
    isStunned: false,
    chargeProgress: 0,
  }));

  return {
    left: toSnapshots(leftTeam),
    right: toSnapshots(rightTeam),
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

function getTeamHealthPercentage(character: Character, health: number): number {
  return Math.max(
    0,
    Math.min(100, (health / getTeamEffectiveStats(character).maxHealth) * 100),
  );
}

function useBattleLogAutoFollow(visibleEventCount: number) {
  const logRef = useRef<HTMLOListElement>(null);
  const shouldFollowNewestRef = useRef(true);

  useEffect(() => {
    const log = logRef.current;
    if (!log || !shouldFollowNewestRef.current) return;

    log.scrollTop = log.scrollHeight;
  }, [visibleEventCount]);

  const handleLogScroll = useCallback((event: UIEvent<HTMLOListElement>) => {
    const log = event.currentTarget;
    const distanceFromBottom = log.scrollHeight - log.scrollTop - log.clientHeight;
    shouldFollowNewestRef.current = distanceFromBottom <= 24;
  }, []);

  return { handleLogScroll, logRef };
}

function isStunSkip(event: BattleEvent): boolean {
  return event.skill === null && event.narration.includes("眩晕状态");
}

function isTeamStunSkip(event: TeamBattleEvent): boolean {
  return event.targets.length === 0 && event.narration.includes("眩晕状态");
}

function getTeamTargetLabel(
  target: TeamBattleEvent["targets"][number],
  charactersById: Map<string, Character>,
): string {
  const targetName = charactersById.get(target.characterId)?.name ?? "未知角色";
  return `${target.side === "left" ? "红" : "蓝"}方 P${target.position} ${targetName}`;
}

function getTeamTargetResult(target: TeamBattleEvent["targets"][number]): string {
  if (target.rawDamage > 0) {
    return `造成 ${target.damage} 点伤害${target.shieldAbsorbed > 0 ? `（护盾吸收 ${target.shieldAbsorbed}）` : ""}`;
  }
  if (target.healing > 0) return `恢复 ${target.healing} 点生命`;
  if (target.shieldGranted > 0) return `增加 ${target.shieldGranted} 点护盾`;
  if (target.targetStunned) return "陷入眩晕";
  return "未造成数值变化";
}

function formatTeamBattleLog(
  event: TeamBattleEvent,
  charactersById: Map<string, Character>,
): string {
  const actorName = charactersById.get(event.actor.characterId)?.name ?? "未知角色";
  if (event.targets.length === 0) return event.narration;

  const [target] = event.targets;
  if (!target) return event.narration;

  const relation = target.side === event.actor.side ? "己方" : "敌方";
  const action = event.skill ? `使用 ${event.skill.name}` : "攻击";

  if (event.targets.length > 1) {
    const results = event.targets
      .map((candidate) => `P${candidate.position} ${charactersById.get(candidate.characterId)?.name ?? "未知角色"} ${getTeamTargetResult(candidate)}`)
      .join("；");
    return `${actorName} ${action}，影响${relation}${target.side === "left" ? "红" : "蓝"}方 ${event.targets.length} 名角色：${results}。`;
  }

  const targetLabel = getTeamTargetLabel(target, charactersById);
  if (target.rawDamage > 0) {
    const attackAction = event.skill ? `${action}攻击` : action;
    return `${actorName} ${attackAction}${relation}${targetLabel}，${getTeamTargetResult(target)}。`;
  }
  if (target.healing > 0 || target.shieldGranted > 0) {
    return `${actorName} ${action}，为${relation}${targetLabel} ${getTeamTargetResult(target)}。`;
  }
  if (target.targetStunned) {
    return `${actorName} ${action}，使${relation}${targetLabel}陷入眩晕。`;
  }
  return event.narration;
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
        <span>攻击 {effectiveStats.attack}</span>
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

function TeamFormationPanel({
  side,
  formation,
  snapshots,
}: {
  side: BattleSide;
  formation: TeamFormation;
  snapshots: TeamBattleCombatantSnapshot[];
}) {
  const isLeft = side === "left";
  const currentFrontId = snapshots.find((member) => member.health > 0)?.characterId;
  const displayMembers = isLeft ? [...formation.members].reverse() : formation.members;

  return (
    <ol
      className={`team-observer-list team-observer-list-${side}`}
      aria-label={isLeft ? "红方队伍" : "蓝方队伍"}
    >
      {displayMembers.map((character) => {
        const snapshot = snapshots.find(
          (member) => member.characterId === character.id,
        );
        if (!snapshot) return null;

        const effectiveStats = getTeamEffectiveStats(character);
        const healthPercentage = getTeamHealthPercentage(character, snapshot.health);
        const isDefeated = snapshot.health === 0;
        const isFront = snapshot.characterId === currentFrontId;

        return (
          <li
            key={character.id}
            className={`${isDefeated ? "is-defeated" : ""} ${isFront ? "is-front" : ""}`}
          >
            <div className="team-observer-member-heading">
              <strong>{character.name}</strong>
            </div>
            <div className="health-block">
              <div className="health-label">
                <strong>{snapshot.health} / {effectiveStats.maxHealth}</strong>
              </div>
              <div className="health-track" aria-label={`${character.name} 当前生命 ${snapshot.health}`}>
                <span style={{ width: `${healthPercentage}%` }} />
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function ObserverControls({
  isPlaying,
  hasFinishedReplay,
  onPlay,
  onPause,
  onNext,
  onRestart,
  onNewSeed,
}: {
  isPlaying: boolean;
  hasFinishedReplay: boolean;
  onPlay: () => void;
  onPause: () => void;
  onNext: () => void;
  onRestart: () => void;
  onNewSeed: () => void;
}) {
  return (
    <section className="observer-controls" aria-label="观战控制">
      <button type="button" onClick={onPlay}>
        {isPlaying ? "播放中…" : hasFinishedReplay ? "从头自动播放" : "自动播放"}
      </button>
      <button
        type="button"
        className="secondary-observer-button"
        onClick={onPause}
        disabled={!isPlaying}
      >
        暂停播放
      </button>
      <button
        type="button"
        className="secondary-observer-button"
        onClick={onNext}
        disabled={hasFinishedReplay}
      >
        下一次行动
      </button>
      <button
        type="button"
        className="secondary-observer-button"
        onClick={onRestart}
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
  const { handleLogScroll, logRef } = useBattleLogAutoFollow(visibleEventCount);

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

  function pausePlayback(): void {
    setIsPlaying(false);
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

  const winnerName = winner === "left"
    ? leftCharacter.name
    : winner === "right"
      ? rightCharacter.name
      : "平局";

  return (
    <main className="observer-shell">
      <div className="observer-frame">
        <header className="observer-header">
          <div>
            <p className="library-kicker">War AI · 单挑观战</p>
            <h1>这一回合，谁能站到最后？</h1>
            <p>种子 <code>{seed}</code> · 已展示 {visibleEventCount} / {events.length} 个行动</p>
          </div>
          <div className="observer-header-actions">
            <Link href="/history" className="observer-history-link">战斗历史</Link>
            <Link href="/battle/prepare" className="back-link">返回对战准备</Link>
          </div>
        </header>

        <section className="observer-arena" aria-label="战斗状态">
          <FighterPanel side="left" character={leftCharacter} visualState={visualState.left} />
          <div className="observer-center">
            <span>ROUND</span>
            <strong>{currentRound || "—"}</strong>
            <small>上限 {BATTLE_RULES.maxRounds} 回合</small>
          </div>
          <FighterPanel side="right" character={rightCharacter} visualState={visualState.right} />
        </section>

        <ObserverControls
          isPlaying={isPlaying}
          hasFinishedReplay={hasFinishedReplay}
          onPlay={playFromCurrentPosition}
          onPause={pausePlayback}
          onNext={showNextEvent}
          onRestart={restartReplay}
          onNewSeed={onNewSeed}
        />

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
            <ol ref={logRef} className="battle-log-list" onScroll={handleLogScroll}>
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

function TeamBattleObserverPlayer({
  battle,
  onBattleCompleted,
  onNewSeed,
}: {
  battle: ObservedTeamBattle;
  onBattleCompleted?: () => void;
  onNewSeed: () => void;
}) {
  const { events, leftTeam, rightTeam, rounds, seed, winner } = battle;
  const [visibleEventCount, setVisibleEventCount] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasRecorded, setHasRecorded] = useState(false);
  const visibleEvents = events.slice(0, visibleEventCount);
  const currentRound = visibleEvents.at(-1)?.round ?? 0;
  const hasFinishedReplay = visibleEventCount === events.length;
  const { handleLogScroll, logRef } = useBattleLogAutoFollow(visibleEventCount);
  const visualState = useMemo<TeamVisualState>(() => {
    const latestEvent = visibleEvents.at(-1);
    return latestEvent?.formations ?? createInitialTeamVisualState(leftTeam, rightTeam);
  }, [leftTeam, rightTeam, visibleEvents]);
  const charactersById = useMemo(
    () => new Map(
      [...leftTeam.members, ...rightTeam.members].map((character) => [character.id, character]),
    ),
    [leftTeam, rightTeam],
  );

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

  function pausePlayback(): void {
    setIsPlaying(false);
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

  const winnerName = winner === "left"
    ? "红方队伍"
    : winner === "right"
      ? "蓝方队伍"
      : "平局";

  return (
    <main className="observer-shell">
      <div className="observer-frame team-observer-frame">
        <header className="observer-header">
          <div>
            <p className="library-kicker">War AI · 团队观战</p>
            <h1>前排顶住，后排接力。</h1>
            <p>种子 <code>{seed}</code> · {leftTeam.members.length}v{rightTeam.members.length} · 已展示 {visibleEventCount} / {events.length} 个行动</p>
          </div>
          <div className="observer-header-actions">
            <Link href="/history" className="observer-history-link">战斗历史</Link>
            <Link href="/battle/prepare" className="back-link">返回对战准备</Link>
          </div>
        </header>

        <section className="team-observer-arena" aria-label="团队战斗状态">
          <div className="team-observer-round">
            <span>ROUND</span>
            <strong>{currentRound || "—"}</strong>
            <small>前排优先承受攻击</small>
          </div>
          <TeamFormationPanel side="left" formation={leftTeam} snapshots={visualState.left} />
          <TeamFormationPanel side="right" formation={rightTeam} snapshots={visualState.right} />
        </section>

        <ObserverControls
          isPlaying={isPlaying}
          hasFinishedReplay={hasFinishedReplay}
          onPlay={playFromCurrentPosition}
          onPause={pausePlayback}
          onNext={showNextEvent}
          onRestart={restartReplay}
          onNewSeed={onNewSeed}
        />

        {hasFinishedReplay ? (
          <section className="observer-result" aria-live="polite">
            <span>{winner === "draw" ? "战斗结束" : "胜者"}</span>
            <strong>{winnerName}</strong>
            <p>本场共进行 {rounds} 回合。冻结的队伍、站位和种子可完整复现这份团队战报。</p>
          </section>
        ) : null}

        <section className="battle-log-panel" aria-label="团队逐回合战报">
          <div className="battle-log-heading">
            <div>
              <p className="library-kicker">团队逐回合战报</p>
              <h2>行动与目标结果</h2>
            </div>
            <span>{hasFinishedReplay ? "已完成" : "等待推进"}</span>
          </div>
          {visibleEvents.length > 0 ? (
            <ol
              ref={logRef}
              className="battle-log-list team-battle-log-list"
              onScroll={handleLogScroll}
            >
              {visibleEvents.map((event, index) => {
                const skip = isTeamStunSkip(event);

                return (
                  <li
                    key={`${event.round}-${event.actor.side}-${event.actor.characterId}-${index}`}
                    className={`${skip ? "is-skip" : ""} ${index === visibleEvents.length - 1 ? "is-current" : ""}`}
                  >
                    <span className="battle-log-round">R{event.round}</span>
                    <p className="team-battle-log-summary">
                      {formatTeamBattleLog(event, charactersById)}
                    </p>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="battle-log-empty">点击“自动播放”或“下一次行动”开始团队观战。</p>
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
  const teamBattles = useGameStore((state) => state.teamBattles);
  const preparedBattle = useGameStore((state) => state.preparedBattle);
  const preparedTeamBattle = useGameStore((state) => state.preparedTeamBattle);
  const activeReplayBattleId = useGameStore((state) => state.activeReplayBattleId);
  const activeReplayTeamBattleId = useGameStore(
    (state) => state.activeReplayTeamBattleId,
  );
  const saveBattleRecord = useGameStore((state) => state.saveBattleRecord);
  const saveTeamBattleRecord = useGameStore((state) => state.saveTeamBattleRecord);
  const rematchBattle = useGameStore((state) => state.rematchBattle);
  const rematchTeamBattle = useGameStore((state) => state.rematchTeamBattle);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const replayRecord = useMemo(
    () => battles.find((battle) => battle.id === activeReplayBattleId),
    [activeReplayBattleId, battles],
  );
  const teamReplayRecord = useMemo(
    () => teamBattles.find((battle) => battle.id === activeReplayTeamBattleId),
    [activeReplayTeamBattleId, teamBattles],
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
  const observedTeamBattle = useMemo<ObservedTeamBattle | null>(() => {
    if (teamReplayRecord) {
      return {
        seed: teamReplayRecord.seed,
        leftTeam: teamReplayRecord.leftTeam,
        rightTeam: teamReplayRecord.rightTeam,
        winner: teamReplayRecord.winner,
        rounds: teamReplayRecord.rounds,
        events: teamReplayRecord.events,
      };
    }
    if (!preparedTeamBattle) return null;

    const result = simulateTeamBattle(preparedTeamBattle);
    return {
      seed: preparedTeamBattle.seed,
      leftTeam: preparedTeamBattle.leftTeam,
      rightTeam: preparedTeamBattle.rightTeam,
      winner: result.winner ?? "draw",
      rounds: result.round,
      events: result.events,
    };
  }, [preparedTeamBattle, teamReplayRecord]);
  const newBattleRecord = useMemo(
    () => observedBattle && !replayRecord
      ? createBattleRecord(observedBattle)
      : null,
    [observedBattle, replayRecord],
  );
  const newTeamBattleRecord = useMemo(
    () => observedTeamBattle && !teamReplayRecord
      ? createTeamBattleRecord(observedTeamBattle)
      : null,
    [observedTeamBattle, teamReplayRecord],
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

  if (observedTeamBattle) {
    return (
      <TeamBattleObserverPlayer
        key={teamReplayRecord?.id ?? `${observedTeamBattle.seed}:${observedTeamBattle.leftTeam.members.map((member) => member.id).join(":")}:${observedTeamBattle.rightTeam.members.map((member) => member.id).join(":")}`}
        battle={observedTeamBattle}
        onBattleCompleted={newTeamBattleRecord ? () => saveTeamBattleRecord(newTeamBattleRecord) : undefined}
        onNewSeed={() =>
          rematchTeamBattle(
            `team-battle-${nanoid(12)}`,
            observedTeamBattle.leftTeam,
            observedTeamBattle.rightTeam,
          )
        }
      />
    );
  }

  if (!observedBattle) {
    return (
      <main className="observer-shell">
        <section className="observer-empty">
          <p className="library-kicker">War AI · 观战</p>
          <h1>还没有可观战的对局</h1>
          <p>请先在对战准备页确认双方阵容，并设置随机种子。</p>
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
