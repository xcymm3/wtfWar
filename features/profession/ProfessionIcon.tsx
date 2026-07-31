import type { ReactNode } from "react";

import {
  PROFESSION_LABELS,
  type Profession,
} from "@/types/character";

const PROFESSION_GLYPHS: Record<Profession, ReactNode> = {
  tank: <>
    <path d="M12 3.2 18.25 5.7v4.75c0 4.2-2.57 7.98-6.25 9.55-3.68-1.57-6.25-5.35-6.25-9.55V5.7L12 3.2Z" />
    <path d="M12 6.1v10.25M8.6 10.1h6.8" />
  </>,
  warrior: <>
    <path d="m5.05 4.45 2.25-1.2.55 2.5 7.65 7.65-2.1 2.1-7.65-7.65-2.5-.55 1.2-2.25Z" />
    <path d="m18.95 4.45-2.25-1.2-.55 2.5-7.65 7.65 2.1 2.1 7.65-7.65 2.5-.55-1.2-2.25Z" />
    <path d="m9.4 16.5-2.65 2.65M14.6 16.5l2.65 2.65" />
  </>,
  mage: <>
    <path d="m8.1 19.9 7.8-7.8" />
    <path d="m7.1 20.9 2-2M14.9 13.1l2 2" />
    <circle cx="17.1" cy="6.9" r="2.45" />
    <path d="M17.1 2.3v1.2M17.1 10.3v1.2M12.5 6.9h1.2M20.5 6.9h1.2" />
  </>,
  assassin: <>
    <path d="m14.65 3.35 3.15 3.15-8.15 8.15-4.2.75.75-4.2 8.45-7.9Z" />
    <path d="m5.1 18.9 4.15-4.15M14.1 4.85l2.2 2.2" />
    <path d="m7.2 20.8 2.3-2.3" />
  </>,
  ranger: <>
    <path d="M5.25 3.4c5.15 2.05 7.2 7.55 5.1 15.05" />
    <path d="M18.75 20.6c-5.15-2.05-7.2-7.55-5.1-15.05" />
    <path d="M4.25 19.75 19.5 4.5" />
    <path d="m15.7 4.5 3.8.05-.05 3.8M4.25 19.75l3.8-.05.05-3.8" />
  </>,
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
