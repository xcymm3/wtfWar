"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";

import {
  exportCharacterLibrary,
  parseImportedCharacterLibrary,
} from "@/lib/storage/characterLibraryTransfer";
import { useGameStore } from "@/lib/store/gameStore";
import type { BattleRecord } from "@/types/battle";

function formatBattleTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getWinnerLabel(record: BattleRecord): string {
  if (record.winner === "left") return `红方胜 · ${record.leftCharacter.name}`;
  if (record.winner === "right") return `蓝方胜 · ${record.rightCharacter.name}`;
  return "平局";
}

export function BattleHistory() {
  const router = useRouter();
  const hasHydrated = useGameStore((state) => state.hasHydrated);
  const hydrate = useGameStore((state) => state.hydrate);
  const characters = useGameStore((state) => state.characters);
  const battles = useGameStore((state) => state.battles);
  const openBattleReplay = useGameStore((state) => state.openBattleReplay);
  const startHistoricalRematch = useGameStore((state) => state.startHistoricalRematch);
  const importCharacters = useGameStore((state) => state.importCharacters);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const history = useMemo(
    () => [...battles].sort((first, second) => second.createdAt.localeCompare(first.createdAt)),
    [battles],
  );

  function handleReplay(recordId: string): void {
    openBattleReplay(recordId);
    router.push("/battle");
  }

  function handleHistoricalRematch(recordId: string): void {
    startHistoricalRematch(recordId);
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
            <p className="library-kicker">斗蛐蛐 AI · 战斗历史</p>
            <h1>每一场较量，都能重看。</h1>
            <p>
              战报保存了当时的角色快照和行动记录。即使后来编辑或删除角色，历史回放也不会改变。
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
            <span>只保存最近 100 场</span>
          </div>

          {history.length > 0 ? (
            <ol className="history-list">
              {history.map((record) => (
                <li key={record.id}>
                  <article className="history-record">
                    <div className="history-record-summary">
                      <span className={`history-winner history-winner-${record.winner}`}>
                        {getWinnerLabel(record)}
                      </span>
                      <h3>{record.leftCharacter.name} <em>VS</em> {record.rightCharacter.name}</h3>
                      <p>
                        {record.rounds} 回合 · 种子 <code>{record.seed}</code> · {formatBattleTime(record.createdAt)}
                      </p>
                    </div>
                    <div className="history-record-actions">
                      <button type="button" onClick={() => handleReplay(record.id)}>回放</button>
                      <button
                        type="button"
                        className="history-rematch-button"
                        onClick={() => handleHistoricalRematch(record.id)}
                      >
                        同种子复赛
                      </button>
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
