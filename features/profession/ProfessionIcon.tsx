import {
  PROFESSION_ICON_MARKS,
  PROFESSION_LABELS,
  type Profession,
} from "@/types/character";

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
      {PROFESSION_ICON_MARKS[profession]}
    </span>
  );
}
