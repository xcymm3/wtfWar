import type { ReactNode } from "react";

import {
  PROFESSION_LABELS,
  type Profession,
} from "@/types/character";

const PROFESSION_GLYPHS: Record<Profession, ReactNode> = {
  tank: <path d="M12 3.25 18 5.7v4.62c0 4.16-2.5 7.85-6 9.43-3.5-1.58-6-5.27-6-9.43V5.7L12 3.25Z" />,
  warrior: <><path d="m15.9 3.55 4.55 4.55-9.8 9.8-4.55-4.55 9.8-9.8Z" /><path d="m4.4 19.6 3.3-3.3" /><path d="m14.2 5.25 4.55 4.55" /></>,
  mage: <><path d="m12 2.9 1.78 5.33L19.1 10l-5.32 1.77L12 17.1l-1.78-5.33L4.9 10l5.32-1.77L12 2.9Z" /><circle cx="12" cy="10" r="7.1" /></>,
  assassin: <><path d="m13.9 3.4 2.7 2.7-7.95 7.95-3.25.55.55-3.25L13.9 3.4Z" /><path d="m5.3 18.7 5.25-5.25" /><path d="m14.9 2.4 2.7 2.7" /></>,
  ranger: <><path d="M5.25 3.45c5.1 2.05 7.1 7.45 5.1 14.7" /><path d="M18.75 20.55c-5.1-2.05-7.1-7.45-5.1-14.7" /><path d="m5.4 18.6 13.2-13.2" /><path d="m15.9 5.1 2.7.3-.3 2.7" /></>,
};

export function ProfessionIcon({ profession, compact = false }: {
  profession: Profession;
  compact?: boolean;
}) {
  return (
    <span
      className={`profession-icon profession-icon-${profession}${compact ? " is-compact" : ""}`}
      role="img"
      aria-label={`${PROFESSION_LABELS[profession]}职业图标`}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        {PROFESSION_GLYPHS[profession]}
      </svg>
    </span>
  );
}
