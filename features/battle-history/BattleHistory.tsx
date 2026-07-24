"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";

import {
  exportCharacterLibrary,
  parseImportedCharacterLibrary,
} from "@/lib/storage/characterLibraryTransfer";
import { useGameStore } from "@/lib/store/gameStore";
import type { BattleRecord, TeamBattleRecord } from "@/types/battle";

type HistoryItem =
  | { kind: "duel"; record: BattleRecord }
  | { kind: "team"; record: TeamBattleRecord };

function formatBattleTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getWinnerLabel(item: HistoryItem): string {
  const { record } = item;
  if (record.winner === "draw") return "平局";
  if (item.kind === "duel") {
    const winner = record.winner === "left"
      ? record.leftCharacter.name
      : record.rightCharacter.name;
    return `${record.winner === "left" ? "红方" : "蓝方"}胜 · ${winner}`;
  }

  const count = record.winner === "left"
    ? record.leftTeam.members.length
    : record.rightTeam.members.length;
  return `${record.winner === "left" ? "红方" : "蓝方"}胜 · ${count} 人团队`;
}

function getMatchTitle(item: HistoryItem): string {
  if (item.kind === "duel") {
    return `${item.record.leftCharacter.name} VS ${item.record.rightCharacter.name}`;
  }

  const leftNames = item.record.leftTeam.members.map((member) => member.name).join("、");
  const rightNames = item.record.rightTeam.members.map((member) => member.name).join("、");
  return `${leftNames} VS ${rightNames}`;
}

function getBattleModeLabel(item: HistoryItem): string {
  return item.kind === "team"
    ? `${item.record.leftTeam.members.length}v${item.record.rightTeam.members.length} 团队战`
    : "历史 1v1 单挑";
}

export function BattleHistory() {
  const router = useRouter();
  const hasHydrated = useGameStore((state) => state.hasHydrated);
  const hydrate = useGameStore((state) => state.hydrate);
  const characters = useGameStore((state) => state.characters);
  const battles = useGameStore((state) => state.battles);
  const teamBattles = useGameStore((state) => state.teamBattles);
  const openBattleReplay = useGameStore((state) => state.openBattleReplay);
  const openTeamBattleReplay = useGameStore((state) => state.openTeamBattleReplay);
  const startHistoricalRematch = useGameStore((state) => state.startHistoricalRematch);
  const startHistoricalTeamRematch = useGameStore(
    (state) => state.startHistoricalTeamRematch,
  );
  const importCharacters = useGameStore((state) => state.importCharacters);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const history = useMemo(
    () => [
      ...battles.map((record): HistoryItem => ({ kind: "duel", record })),
      ...teamBattles.map((record): HistoryItem => ({ kind: "team", record })),
    ].sort((first, second) => second.record.createdAt.localeCompare(first.record.createdAt)),
    [battles, teamBattles],
  );

  function handleReplay(item: HistoryItem): void {
    if (item.kind === "team") {
      openTeamBattleReplay(item.record.id);
    } else {
      openBattleReplay(item.record.id);
    }
    router.push("/battle");
  }

  function handleHistoricalRematch(item: HistoryItem): void {
    if (item.kind === "team") {
      startHistoricalTeamRematch(item.record.id);
    } else {
      startHistoricalRematch(item.record.id);
    }
    router.push("/battle");
  }

  function handleExport(): void {
    try {
      const exportContent = exportCharacterLibrary(characters);
      const blob = new Blob([exportContent], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const downloadLink = document.createElement("a");
      downloadLink.href = url;
      downloadLink.download = "dou-ququ-ai-characters.json";
      downloadLink.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setError(null);
      setNotice(`已导出 ${characters.length} 名角色。`);
    } catch {
      setNotice(null);
      setError("角色库中存在无法导出的数据，请先检查角色卡。");
    }
  }

  async function handleImport(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const importedCharacters = parseImportedCharacterLibrary(await file.text());
      importCharacters(importedCharacters);
      setError(null);
      setNotice(`已导入 ${importedCharacters.length} 名角色；同 ID 的角色已被更新。`);
    } catch (caughtError) {
      setNotice(null);
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "无法读取这个角色库文件。",
      );
    }
  }

  if (!hasHydrated) {
    return (
      <main className="history-shell">
        <section className="history-loading" aria-live="polite">正在读取战斗历史…</section>
      </main>
    );
  }

  return (
    <main className="history-shell">
      <div className="history-frame">
        <header className="history-header">
          <div>
            <p className="library-kicker">War AI · 战斗历史</p>
            <h1>每一场较量，都能重看。</h1>
            <p>
              战报保存了当时的角色快照、队伍站位和行动记录。即使后来编辑或删除角色，历史回放也不会改变。
            </p>
          </div>
          <Link href="/" className="back-link">返回角色库</Link>
        </header>

        <section className="data-transfer-panel" aria-label="角色数据导入导出">
          <div>
            <p className="library-kicker">角色数据</p>
            <h2>备份或迁移角色库</h2>
            <p>导入会按角色 ID 合并：同 ID 更新，其他已有角色保留；战斗历史不会被导入或覆盖。</p>
          </div>
          <div className="data-transfer-actions">
            <button type="button" onClick={handleExport}>导出角色库</button>
            <label className="import-characters-button">
              导入角色库
              <input type="file" accept="application/json,.json" onChange={handleImport} />
            </label>
          </div>
          {notice ? <p className="transfer-notice" role="status">{notice}</p> : null}
          {error ? <p className="transfer-error" role="alert">{error}</p> : null}
        </section>

        <section className="history-list-panel" aria-label="已保存战报">
          <div className="history-list-heading">
            <div>
              <p className="library-kicker">已保存战报</p>
              <h2>{history.length} 场可回看对局</h2>
            </div>
            <span>新对局会保存为团队战；旧单挑记录仍可回放</span>
          </div>

          {history.length > 0 ? (
            <ol className="history-list">
              {history.map((item) => (
                <li key={`${item.kind}-${item.record.id}`}>
                  <article className={`history-record history-record-${item.kind}`}>
                    <div className="history-record-summary">
                      <span className={`history-winner history-winner-${item.record.winner}`}>
                        {getWinnerLabel(item)}
                      </span>
                      <h3>{getMatchTitle(item)}</h3>
                      <p>
                        {getBattleModeLabel(item)} · {item.record.rounds} 回合 · 种子 <code>{item.record.seed}</code> · {formatBattleTime(item.record.createdAt)}
                      </p>
                    </div>
                    <div className="history-record-actions">
                      <button type="button" onClick={() => handleReplay(item)}>
                        {item.kind === "team" ? "团队回放" : "回放"}
                      </button>
                      {item.kind === "team" ? (
                        <button
                          type="button"
                          className="history-rematch-button"
                          onClick={() => handleHistoricalRematch(item)}
                        >
                          同种子复赛
                        </button>
                      ) : null}
                    </div>
                  </article>
                </li>
              ))}
            </ol>
          ) : (
            <div className="history-empty">
              <p>还没有已完成的战报。</p>
              <span>完成一场观战后，它会自动出现在这里。</span>
              <Link href="/battle/prepare" className="empty-create-link">准备第一场对战</Link>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
