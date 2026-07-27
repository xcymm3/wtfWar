"use client";

import { nanoid } from "nanoid";
import { useRouter } from "next/navigation";
import { type DragEvent, useMemo, useState } from "react";

import { ProfessionIcon } from "@/features/profession/ProfessionIcon";
import { getEffectiveCombatStats } from "@/lib/battle/realm";
import { useGameStore } from "@/lib/store/gameStore";
import type { BattleSide } from "@/types/battle";
import {
  PROFESSION_LABELS,
  REALM_LABELS,
  type Character,
} from "@/types/character";

export const TEAM_CHARACTER_DRAG_TYPE = "application/x-war-ai-character";

export function beginTeamCharacterDrag(
  event: DragEvent<HTMLElement>,
  characterId: string,
): void {
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData(TEAM_CHARACTER_DRAG_TYPE, characterId);
  event.dataTransfer.setData("text/plain", characterId);
}

function getDraggedCharacterId(event: DragEvent<HTMLElement>): string | null {
  const characterId = event.dataTransfer.getData(TEAM_CHARACTER_DRAG_TYPE);
  return characterId || null;
}

function createSeed(): string {
  return `battle-${nanoid(12)}`;
}

function TeamLineup({
  side,
  members,
  dropIndex,
  onDropCharacter,
  onClear,
  onRemove,
  onDragTarget,
}: {
  side: BattleSide;
  members: Character[];
  dropIndex: number | null;
  onDropCharacter: (event: DragEvent<HTMLElement>, side: BattleSide, index: number) => void;
  onClear: () => void;
  onRemove: (characterId: string) => void;
  onDragTarget: (side: BattleSide, index: number | null) => void;
}) {
  const sideLabel = side === "left" ? "红方" : "蓝方";

  return (
    <section className={`team-lineup team-lineup-${side}`} aria-label={`${sideLabel}阵容`}>
      <header>
        <div>
          <span>{sideLabel}</span>
          <strong>{members.length}</strong>
        </div>
        <button type="button" onClick={onClear} disabled={members.length === 0}>清空</button>
      </header>
      <ol
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          onDragTarget(side, members.length);
        }}
        onDrop={(event) => onDropCharacter(event, side, members.length)}
      >
        {members.map((character, index) => {
          const realm = character.realm ?? "mortal";
          const effectiveStats = getEffectiveCombatStats(character);

          return (
            <li
              key={character.id}
              draggable
              className={dropIndex === index ? "is-drop-target" : ""}
              onDragStart={(event) => beginTeamCharacterDrag(event, character.id)}
              onDragEnd={() => onDragTarget(side, null)}
              onDragOver={(event) => {
                event.preventDefault();
                event.stopPropagation();
                event.dataTransfer.dropEffect = "move";
                onDragTarget(side, index);
              }}
              onDrop={(event) => {
                event.stopPropagation();
                onDropCharacter(event, side, index);
              }}
            >
              <span className="team-position" aria-label={`第 ${index + 1} 位`}>{index + 1}</span>
              <div className="team-member-summary">
                <strong>{character.name}</strong>
                <span><ProfessionIcon profession={character.profession} compact />{PROFESSION_LABELS[character.profession]} · {REALM_LABELS[realm]}</span>
                <small>攻 {effectiveStats.attack} · 命 {effectiveStats.maxHealth}</small>
              </div>
              <button
                type="button"
                className="team-member-remove"
                onClick={() => onRemove(character.id)}
                aria-label={`将 ${character.name} 移出${sideLabel}`}
              >
                ×
              </button>
            </li>
          );
        })}
        {members.length === 0 ? (
          <li className={`team-lineup-empty ${dropIndex === 0 ? "is-drop-target" : ""}`}>
            拖入角色
          </li>
        ) : null}
      </ol>
    </section>
  );
}

export function TeamBuilder({ characters }: { characters: Character[] }) {
  const router = useRouter();
  const teamCharacterIds = useGameStore((state) => state.teamCharacterIds);
  const removeCharacterFromTeam = useGameStore((state) => state.removeCharacterFromTeam);
  const clearTeam = useGameStore((state) => state.clearTeam);
  const setTeamCharacterIds = useGameStore((state) => state.setTeamCharacterIds);
  const prepareTeamBattle = useGameStore((state) => state.prepareTeamBattle);
  const [seed, setSeed] = useState(createSeed);
  const [error, setError] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ side: BattleSide; index: number } | null>(null);

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
  const hasCompleteTeams = teamMembers.left.length > 0 && teamMembers.right.length > 0;

  function handleAction(action: () => void): void {
    setError(null);
    try {
      action();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "无法调整阵容。");
    }
  }

  function handleDrop(
    event: DragEvent<HTMLElement>,
    destination: BattleSide,
    destinationIndex: number,
  ): void {
    event.preventDefault();
    setDropTarget(null);
    const characterId = getDraggedCharacterId(event);
    if (!characterId) return;

    handleAction(() => {
      const source = teamCharacterIds.left.includes(characterId)
        ? "left"
        : teamCharacterIds.right.includes(characterId)
          ? "right"
          : null;
      const sourceIndex = source ? teamCharacterIds[source].indexOf(characterId) : -1;
      const nextTeamCharacterIds = {
        left: teamCharacterIds.left.filter((id) => id !== characterId),
        right: teamCharacterIds.right.filter((id) => id !== characterId),
      };

      if (nextTeamCharacterIds[destination].length >= 5) {
        throw new Error(`${destination === "left" ? "红方" : "蓝方"}最多 5 名角色。`);
      }

      const adjustedIndex = source === destination && sourceIndex < destinationIndex
        ? destinationIndex - 1
        : destinationIndex;
      const insertionIndex = Math.max(
        0,
        Math.min(adjustedIndex, nextTeamCharacterIds[destination].length),
      );
      nextTeamCharacterIds[destination].splice(insertionIndex, 0, characterId);
      setTeamCharacterIds(nextTeamCharacterIds);
    });
  }

  function handleStartBattle(): void {
    setError(null);
    try {
      prepareTeamBattle(seed);
      router.push("/battle");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "无法开始观战。");
    }
  }

  return (
    <section className="team-builder home-team-builder" aria-labelledby="team-builder-heading">
      <div className="team-builder-heading">
        <div>
          <h2 id="team-builder-heading">阵容</h2>
          <p>拖动角色卡排位</p>
        </div>
        <span>{teamMembers.left.length} v {teamMembers.right.length}</span>
      </div>
      <div className="team-builder-grid">
        <TeamLineup
          side="left"
          members={teamMembers.left}
          dropIndex={dropTarget?.side === "left" ? dropTarget.index : null}
          onDropCharacter={handleDrop}
          onClear={() => handleAction(() => clearTeam("left"))}
          onRemove={(characterId) => handleAction(() => removeCharacterFromTeam("left", characterId))}
          onDragTarget={(side, index) => setDropTarget(index === null ? null : { side, index })}
        />
        <div className="team-builder-versus" aria-hidden="true">VS</div>
        <TeamLineup
          side="right"
          members={teamMembers.right}
          dropIndex={dropTarget?.side === "right" ? dropTarget.index : null}
          onDropCharacter={handleDrop}
          onClear={() => handleAction(() => clearTeam("right"))}
          onRemove={(characterId) => handleAction(() => removeCharacterFromTeam("right", characterId))}
          onDragTarget={(side, index) => setDropTarget(index === null ? null : { side, index })}
        />
      </div>
      <div className="team-builder-footer">
        <div className="seed-input-row">
          <label>
            <span className="sr-only">战斗种子</span>
            <input
              required
              value={seed}
              onChange={(event) => setSeed(event.target.value)}
              placeholder="战斗种子"
            />
          </label>
          <button type="button" onClick={() => setSeed(createSeed())}>换一个</button>
        </div>
        <button type="button" onClick={handleStartBattle} disabled={!hasCompleteTeams}>
          开始观战
        </button>
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </section>
  );
}
