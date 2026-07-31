"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ProfessionIcon } from "@/features/profession/ProfessionIcon";
import {
  PROFESSION_LABELS,
  REALM_LABELS,
} from "@/types/character";
import type {
  BattleLeaderboardEntry,
  BattleLeaderboardSort,
  BattleRecord,
  BattleRecordTeam,
  BattleStatistics,
} from "@/types/battle";

function formatRecordedAt(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getWinnerLabel(record: BattleRecord): string {
  if (record.winner === "draw") return "平局";
  return record.winner === "left" ? "红方胜利" : "蓝方胜利";
}

function TeamRoster({ team }: { team: BattleRecordTeam }) {
  return (
    <section className={`battle-stats-team battle-stats-team-${team.side}`}>
      <span>{team.side === "left" ? "红方阵容" : "蓝方阵容"}</span>
      <ol>
        {team.members.map((member, index) => (
          <li key={`${member.id}-${index}`}>
            <em>{index + 1}</em>
            <strong>{member.name}</strong>
            <small><ProfessionIcon profession={member.profession} compact />{PROFESSION_LABELS[member.profession]} · {REALM_LABELS[member.realm]}</small>
          </li>
        ))}
      </ol>
    </section>
  );
}

function LeaderboardRoster({ team }: { team: BattleRecordTeam }) {
  return (
    <ol className="battle-leaderboard-roster">
      {team.members.map((member, index) => (
        <li key={`${member.id}-${index}`}>
          <em>{index + 1}</em>
          <ProfessionIcon profession={member.profession} compact />
          <strong>{member.name}</strong>
        </li>
      ))}
    </ol>
  );
}

function formatWinRate(winRate: number): string {
  return `${Math.round(winRate * 100)}%`;
}

export function BattleStats() {
  const [statistics, setStatistics] = useState<BattleStatistics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false);
  const [leaderboardSort, setLeaderboardSort] = useState<BattleLeaderboardSort>("wins");
  const [leaderboard, setLeaderboard] = useState<BattleLeaderboardEntry[] | null>(null);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;
    void fetch("/api/battles")
      .then(async (response) => {
        const payload = await response.json() as BattleStatistics & { error?: unknown };
        if (!response.ok) {
          throw new Error(typeof payload.error === "string" ? payload.error : "无法读取战斗统计。");
        }
        return payload;
      })
      .then((nextStatistics) => {
        if (isCurrent) setStatistics(nextStatistics);
      })
      .catch((caughtError: unknown) => {
        if (!isCurrent) return;
        setError(caughtError instanceof Error ? caughtError.message : "无法读取战斗统计。");
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    if (!isLeaderboardOpen) return;

    const controller = new AbortController();
    void fetch(`/api/battles/leaderboard?sort=${leaderboardSort}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { entries?: BattleLeaderboardEntry[]; error?: unknown };
        if (!response.ok) {
          throw new Error(typeof payload.error === "string" ? payload.error : "无法读取排行榜。");
        }
        return payload.entries ?? [];
      })
      .then((entries) => setLeaderboard(entries))
      .catch((caughtError: unknown) => {
        if (controller.signal.aborted) return;
        setLeaderboardError(caughtError instanceof Error ? caughtError.message : "无法读取排行榜。");
      });

    return () => controller.abort();
  }, [isLeaderboardOpen, leaderboardSort]);

  function openLeaderboard(): void {
    setLeaderboard(null);
    setLeaderboardError(null);
    setIsLeaderboardOpen(true);
  }

  function changeLeaderboardSort(sort: BattleLeaderboardSort): void {
    if (sort === leaderboardSort) return;
    setLeaderboard(null);
    setLeaderboardError(null);
    setLeaderboardSort(sort);
  }

  return (
    <main className="battle-stats-shell">
      <div className="battle-stats-frame">
        <header className="battle-stats-header">
          <div>
            <p className="library-kicker">全站对局数据</p>
            <h1>战斗统计</h1>
            <p>仅保存竞技模式的完整五人阵容、种子与胜负结果。战斗过程不会入库，也不支持回放。</p>
          </div>
          <div className="battle-stats-header-actions">
            <button type="button" className="battle-leaderboard-button" onClick={openLeaderboard}>排行榜</button>
            <Link href="/" className="back-link">返回角色库</Link>
          </div>
        </header>

        {error ? <p className="form-error" role="alert">{error}</p> : null}

        {statistics ? (
          <>
            <section className="battle-stats-summary" aria-label="战斗汇总">
              <div><span>总场次</span><strong>{statistics.totalBattles}</strong></div>
            </section>

            <section className="battle-stats-records" aria-label="最近战斗记录">
              <div className="battle-stats-records-heading">
                <div>
                  <p className="library-kicker">最近记录</p>
                  <h2>对局摘要</h2>
                </div>
                <span>显示最近 {statistics.records.length} 场</span>
              </div>
              {statistics.records.length > 0 ? (
                <ol>
                  {statistics.records.map((record) => (
                    <li key={record.id} className="battle-stats-record">
                      <div className="battle-stats-record-meta">
                        <strong className={`battle-stats-winner is-${record.winner}`}>{getWinnerLabel(record)}</strong>
                        <span>{formatRecordedAt(record.createdAt)}</span>
                        <code>种子 {record.seed}</code>
                      </div>
                      <div className="battle-stats-rosters">
                        <TeamRoster team={record.leftTeam} />
                        <span className="battle-stats-versus">VS</span>
                        <TeamRoster team={record.rightTeam} />
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="battle-stats-empty">还没有记录。完成第一场队伍对战后，结果会出现在这里。</p>
              )}
            </section>
          </>
        ) : !error ? <p className="battle-stats-loading" aria-live="polite">正在读取战斗统计…</p> : null}

        {isLeaderboardOpen ? (
          <dialog
            open
            className="character-detail-dialog battle-leaderboard-dialog"
            aria-labelledby="battle-leaderboard-title"
            onCancel={(event) => {
              event.preventDefault();
              setIsLeaderboardOpen(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") setIsLeaderboardOpen(false);
            }}
          >
            <div className="character-detail-dialog-header">
              <div>
                <span>完整五人阵容</span>
                <h2 id="battle-leaderboard-title">队伍排行榜</h2>
              </div>
              <button type="button" className="character-detail-close" aria-label="关闭排行榜" onClick={() => setIsLeaderboardOpen(false)}>×</button>
            </div>
            <p className="battle-leaderboard-intro">仅统计竞技模式下双方均选满 5 名角色的对局。同一角色与站位完全相同的阵容会累计为同一队伍。</p>
            <div className="battle-leaderboard-filters" role="group" aria-label="排行榜排序方式">
              <button type="button" className={leaderboardSort === "wins" ? "is-active" : ""} onClick={() => changeLeaderboardSort("wins")} aria-pressed={leaderboardSort === "wins"}>胜场</button>
              <button type="button" className={leaderboardSort === "winRate" ? "is-active" : ""} onClick={() => changeLeaderboardSort("winRate")} aria-pressed={leaderboardSort === "winRate"}>胜率</button>
            </div>
            {leaderboardError ? <p className="form-error" role="alert">{leaderboardError}</p> : null}
            {leaderboard ? (
              leaderboard.length > 0 ? (
                <ol className="battle-leaderboard-list">
                  {leaderboard.map((entry, index) => (
                    <li key={entry.team.members.map((member) => member.id).join(":")}>
                      <span className="battle-leaderboard-rank">#{index + 1}</span>
                      <div>
                        <strong>{entry.team.members.map((member) => member.name).join(" · ")}</strong>
                        <LeaderboardRoster team={entry.team} />
                      </div>
                      <dl>
                        <div><dt>胜场</dt><dd>{entry.wins}</dd></div>
                        <div><dt>胜率</dt><dd>{formatWinRate(entry.winRate)}</dd></div>
                        <div><dt>场次</dt><dd>{entry.games}</dd></div>
                      </dl>
                    </li>
                  ))}
                </ol>
              ) : <p className="battle-stats-empty">还没有竞技模式的完整五人阵容对局记录。</p>
            ) : !leaderboardError ? <p className="battle-stats-loading" aria-live="polite">正在计算排行榜…</p> : null}
          </dialog>
        ) : null}
      </div>
    </main>
  );
}
