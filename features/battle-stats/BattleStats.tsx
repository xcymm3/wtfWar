"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ProfessionIcon } from "@/features/profession/ProfessionIcon";
import {
  PROFESSION_LABELS,
  REALM_LABELS,
} from "@/types/character";
import type {
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

export function BattleStats() {
  const [statistics, setStatistics] = useState<BattleStatistics | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <main className="battle-stats-shell">
      <div className="battle-stats-frame">
        <header className="battle-stats-header">
          <div>
            <p className="library-kicker">全站对局数据</p>
            <h1>战斗统计</h1>
            <p>仅保存阵容、种子与胜负结果。战斗过程不会入库，也不支持回放。</p>
          </div>
          <Link href="/" className="back-link">返回角色库</Link>
        </header>

        {error ? <p className="form-error" role="alert">{error}</p> : null}

        {statistics ? (
          <>
            <section className="battle-stats-summary" aria-label="战斗汇总">
              <div><span>总场次</span><strong>{statistics.totalBattles}</strong></div>
              <div className="is-left"><span>红方胜场</span><strong>{statistics.leftWins}</strong></div>
              <div className="is-right"><span>蓝方胜场</span><strong>{statistics.rightWins}</strong></div>
              <div><span>平局</span><strong>{statistics.draws}</strong></div>
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
      </div>
    </main>
  );
}
