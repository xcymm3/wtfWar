"use client";

import { nanoid } from "nanoid";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { BATTLE_RULES } from "@/lib/battle/constants";
import { getEffectiveCombatStats } from "@/lib/battle/realm";
import {
  PROFESSION_STAT_RANGES,
  getRangeMidpoint,
} from "@/lib/characters/professionRules";
import { characterSchema } from "@/lib/schemas/character";
import { useGameStore } from "@/lib/store/gameStore";
import {
  PROFESSIONS,
  PROFESSION_LABELS,
  REALMS,
  REALM_LABELS,
  type Character,
  type Profession,
  type Realm,
  type Skill,
} from "@/types/character";

const MANUAL_SKILL_TYPES = [
  "damage",
  "shield",
  "heal",
  "control",
  "area_damage",
  "area_heal",
  "cleave_passive",
  "charge_strike_passive",
] as const;

type ManualSkillType = (typeof MANUAL_SKILL_TYPES)[number];

type SkillDraft = {
  name: string;
  description: string;
  type: ManualSkillType;
  cooldown: number;
  effectValue: number;
};

type GenerationProfession = Profession | "auto";

const SKILL_TYPE_LABELS: Record<ManualSkillType, string> = {
  damage: "伤害",
  shield: "护盾",
  heal: "治疗",
  control: "控制",
  area_damage: "群体伤害",
  area_heal: "群体治疗",
  cleave_passive: "横扫被动",
  charge_strike_passive: "蓄力一击被动",
};

function isPassiveSkillType(type: ManualSkillType): boolean {
  return type === "cleave_passive" || type === "charge_strike_passive";
}

function getDefaultEffectValue(type: ManualSkillType): number {
  switch (type) {
    case "damage":
      return 1.3;
    case "area_damage":
      return 0.7;
    case "shield":
    case "heal":
      return 25;
    case "area_heal":
      return 15;
    case "control":
      return 30;
    case "cleave_passive":
      return 0;
    case "charge_strike_passive":
      return 3;
  }
}

function createDefaultSkill(
  type: ManualSkillType,
  position: 1 | 2,
): SkillDraft {
  const defaults: Record<ManualSkillType, Pick<SkillDraft, "name" | "description">> = {
    damage: {
      name: position === 1 ? "破阵一击" : "追击斩",
      description: "集中力量发动一次伤害攻击。",
    },
    area_damage: {
      name: "裂地冲击",
      description: "对敌方全体存活角色造成范围伤害。",
    },
    shield: {
      name: "临时护甲",
      description: "为自身施加可吸收伤害的护盾。",
    },
    heal: {
      name: "战地修整",
      description: "恢复自身生命值。",
    },
    area_heal: {
      name: "生命共鸣",
      description: "为己方全体存活角色恢复生命。",
    },
    control: {
      name: "震慑打击",
      description: "有概率令对手下一次行动跳过。",
    },
    cleave_passive: {
      name: "横扫",
      description: "普通攻击改为命中敌方全体，入场有效攻击降低 35%。",
    },
    charge_strike_passive: {
      name: "蓄力一击",
      description: "每三次行动释放一次高伤害蓄力攻击，期间不使用主动技能。",
    },
  };

  return {
    ...defaults[type],
    type,
    cooldown: isPassiveSkillType(type) ? 0 : 2,
    effectValue: getDefaultEffectValue(type),
  };
}

function toSkill(draft: SkillDraft): Skill {
  const isPassive = isPassiveSkillType(draft.type);
  const base = {
    id: nanoid(),
    name: draft.name.trim(),
    description: draft.description.trim(),
    type: draft.type,
    activation: isPassive ? "passive" as const : "active" as const,
    target: isPassive ? "self" as const : undefined,
    cooldown: isPassive ? 0 : draft.cooldown,
  };

  switch (draft.type) {
    case "damage":
      return { ...base, damageMultiplier: draft.effectValue };
    case "area_damage":
      return { ...base, damageMultiplier: draft.effectValue };
    case "shield":
      return { ...base, shieldAmount: draft.effectValue };
    case "heal":
      return { ...base, healAmount: draft.effectValue };
    case "area_heal":
      return { ...base, healAmount: draft.effectValue };
    case "control":
      return { ...base, stunChance: draft.effectValue / 100 };
    case "cleave_passive":
      return base;
    case "charge_strike_passive":
      return { ...base, chargeTurns: draft.effectValue };
  }
}

function toSkillDraft(skill: Skill): SkillDraft {
  switch (skill.type) {
    case "damage":
      return {
        name: skill.name,
        description: skill.description,
        type: skill.type,
        cooldown: skill.cooldown,
        effectValue: skill.damageMultiplier ?? 1.3,
      };
    case "area_damage":
      return {
        name: skill.name,
        description: skill.description,
        type: skill.type,
        cooldown: skill.cooldown,
        effectValue: skill.damageMultiplier ?? 0.7,
      };
    case "shield":
      return {
        name: skill.name,
        description: skill.description,
        type: skill.type,
        cooldown: skill.cooldown,
        effectValue: skill.shieldAmount ?? 25,
      };
    case "heal":
      return {
        name: skill.name,
        description: skill.description,
        type: skill.type,
        cooldown: skill.cooldown,
        effectValue: skill.healAmount ?? 25,
      };
    case "area_heal":
      return {
        name: skill.name,
        description: skill.description,
        type: skill.type,
        cooldown: skill.cooldown,
        effectValue: skill.healAmount ?? 15,
      };
    case "control":
      return {
        name: skill.name,
        description: skill.description,
        type: skill.type,
        cooldown: skill.cooldown,
        effectValue: (skill.stunChance ?? 0.3) * 100,
      };
    case "cleave_passive":
      return {
        name: skill.name,
        description: skill.description,
        type: skill.type,
        cooldown: 0,
        effectValue: 0,
      };
    case "charge_strike_passive":
      return {
        name: skill.name,
        description: skill.description,
        type: skill.type,
        cooldown: 0,
        effectValue: skill.chargeTurns ?? 3,
      };
    case "buff":
      throw new Error("不支持增益技能。");
  }
}

function getEffectField(type: ManualSkillType): {
  label: string;
  min: number;
  max: number;
  step: number;
  suffix: string;
} | null {
  switch (type) {
    case "damage":
      return {
        label: "伤害倍率",
        min: BATTLE_RULES.minDamageMultiplier,
        max: BATTLE_RULES.maxDamageMultiplier,
        step: 0.1,
        suffix: "×",
      };
    case "area_damage":
      return {
        label: "全体伤害倍率",
        min: 0.45,
        max: 0.9,
        step: 0.05,
        suffix: "×",
      };
    case "shield":
      return { label: "护盾值", min: 10, max: 45, step: 1, suffix: "点" };
    case "heal":
      return { label: "治疗量", min: 10, max: 45, step: 1, suffix: "点" };
    case "area_heal":
      return { label: "全队治疗量", min: 5, max: 25, step: 1, suffix: "点" };
    case "control":
      return { label: "眩晕概率", min: 0, max: 50, step: 5, suffix: "%" };
    case "cleave_passive":
      return null;
    case "charge_strike_passive":
      return { label: "蓄力回合", min: 2, max: 5, step: 1, suffix: "次行动" };
  }
}

function SkillEditor({
  label,
  position,
  draft,
  otherType,
  onChange,
}: {
  label: string;
  position: 1 | 2;
  draft: SkillDraft;
  otherType: ManualSkillType;
  onChange: (nextDraft: SkillDraft) => void;
}) {
  const effect = getEffectField(draft.type);
  const isPassive = isPassiveSkillType(draft.type);

  return (
    <fieldset className="skill-editor">
      <legend>{label}</legend>
      <div className="field-grid skill-basic-fields">
        <label>
          <span>技能类型</span>
          <select
            value={draft.type}
            onChange={(event) => {
              const type = event.target.value as ManualSkillType;
              onChange(createDefaultSkill(type, position));
            }}
          >
            {MANUAL_SKILL_TYPES.map((type) => (
              <option
                key={type}
                value={type}
                disabled={
                  type === otherType
                  || (isPassiveSkillType(type) && isPassiveSkillType(otherType))
                }
              >
                {SKILL_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>
        {isPassive ? (
          <label>
            <span>触发方式</span>
            <div className="skill-static-value">持续生效</div>
          </label>
        ) : (
          <label>
            <span>冷却</span>
            <select
              value={draft.cooldown}
              onChange={(event) =>
                onChange({ ...draft, cooldown: Number(event.target.value) })
              }
            >
              {[1, 2, 3, 4, 5].map((cooldown) => (
                <option key={cooldown} value={cooldown}>
                  {cooldown} 回合
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <label>
        <span>技能名称</span>
        <input
          required
          maxLength={24}
          value={draft.name}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
        />
      </label>
      <label>
        <span>技能说明</span>
        <textarea
          required
          maxLength={120}
          rows={2}
          value={draft.description}
          onChange={(event) =>
            onChange({ ...draft, description: event.target.value })
          }
        />
      </label>
      {effect ? (
        <label className="effect-field">
          <span>{effect.label}</span>
          <div>
            <input
              required
              type="number"
              min={effect.min}
              max={effect.max}
              step={effect.step}
              value={draft.effectValue}
              onChange={(event) =>
                onChange({ ...draft, effectValue: Number(event.target.value) })
              }
            />
            <em>{effect.suffix}</em>
          </div>
        </label>
      ) : (
        <p className="passive-effect-hint">
          普通攻击会命中敌方全部存活角色；入场有效攻击降低 35%。
        </p>
      )}
    </fieldset>
  );
}

export function CharacterCreator() {
  const router = useRouter();
  const hasHydrated = useGameStore((state) => state.hasHydrated);
  const hydrate = useGameStore((state) => state.hydrate);
  const addCharacter = useGameStore((state) => state.addCharacter);
  const [profession, setProfession] = useState<Profession>("warrior");
  const [realm, setRealm] = useState<Realm>("mortal");
  const initialRanges = PROFESSION_STAT_RANGES.warrior;
  const [name, setName] = useState("");
  const [originalPrompt, setOriginalPrompt] = useState("");
  const [attack, setAttack] = useState(getRangeMidpoint(initialRanges.attack));
  const [maxHealth, setMaxHealth] = useState(
    getRangeMidpoint(initialRanges.maxHealth),
  );
  const [firstSkill, setFirstSkill] = useState<SkillDraft>(
    createDefaultSkill("damage", 1),
  );
  const [secondSkill, setSecondSkill] = useState<SkillDraft>(
    createDefaultSkill("shield", 2),
  );
  const [generationPrompt, setGenerationPrompt] = useState("");
  const [generationProfession, setGenerationProfession] = useState<GenerationProfession>("auto");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationNotice, setGenerationNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const ranges = PROFESSION_STAT_RANGES[profession];
  const professionDescription = `${ranges.attack.min}–${ranges.attack.max} 攻击 · ${ranges.maxHealth.min}–${ranges.maxHealth.max} 生命`;
  const effectiveStats = getEffectiveCombatStats({ realm, attack, maxHealth });

  function changeProfession(nextProfession: Profession): void {
    const nextRanges = PROFESSION_STAT_RANGES[nextProfession];
    setProfession(nextProfession);
    setAttack(getRangeMidpoint(nextRanges.attack));
    setMaxHealth(getRangeMidpoint(nextRanges.maxHealth));
  }

  async function handleGenerate(): Promise<void> {
    if (generationPrompt.trim().length < 8) {
      setGenerationNotice(null);
      setError("请至少用 8 个字符描述你想创建的角色。");
      return;
    }

    setIsGenerating(true);
    setError(null);
    setGenerationNotice(null);

    try {
      const response = await fetch("/api/characters/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: generationPrompt,
          preferredProfession:
            generationProfession === "auto" ? undefined : generationProfession,
        }),
      });
      const payload = await response.json() as {
        character?: unknown;
        source?: unknown;
        error?: unknown;
      };

      if (!response.ok) {
        throw new Error(
          typeof payload.error === "string" ? payload.error : "角色生成失败。",
        );
      }

      const generated = characterSchema.parse(payload.character) as Character;
      setName(generated.name);
      setOriginalPrompt(generationPrompt.trim());
      setProfession(generated.profession);
      setRealm(generated.realm ?? "mortal");
      setAttack(generated.attack);
      setMaxHealth(generated.maxHealth);
      setFirstSkill(toSkillDraft(generated.skills[0]));
      setSecondSkill(toSkillDraft(generated.skills[1]));
      setGenerationNotice(
        payload.source === "model"
          ? `AI 已生成角色卡，并建议阶位为“${REALM_LABELS[generated.realm ?? "mortal"]}”；可继续修改后保存。`
          : `当前未配置模型，已按战斗规则自动生成角色卡，并判定为“${REALM_LABELS[generated.realm ?? "mortal"]}”；可继续编辑后保存。`,
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "角色生成失败。",
      );
    } finally {
      setIsGenerating(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setError(null);

    const timestamp = new Date().toISOString();
    const character: Character = {
      id: nanoid(),
      name: name.trim(),
      originalPrompt: originalPrompt.trim(),
      profession,
      realm,
      attack,
      maxHealth,
      skills: [toSkill(firstSkill), toSkill(secondSkill)],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const validation = characterSchema.safeParse(character);

    if (!validation.success) {
      setError(validation.error.issues[0]?.message ?? "请检查角色信息。");
      return;
    }

    try {
      addCharacter(validation.data);
      router.push("/");
    } catch {
      setError("角色保存失败，请检查信息后重试。");
    }
  }

  if (!hasHydrated) {
    return (
      <main className="creator-shell">
        <section className="creator-loading" aria-live="polite">
          正在准备创角表单…
        </section>
      </main>
    );
  }

  return (
    <main className="creator-shell">
      <div className="creator-frame">
        <header className="creator-header">
          <div>
            <p className="library-kicker">War AI · 手动创角</p>
            <h1>把设想变成可战斗的角色</h1>
            <p>
              输入一句角色设想，让 AI 自动填充合规角色卡；你也可以继续使用表单逐项调整。
            </p>
          </div>
          <Link href="/" className="back-link">返回角色库</Link>
        </header>

        <form className="creator-form" onSubmit={handleSubmit}>
          <section className="ai-generator-panel" aria-label="AI 自动创角">
            <div className="section-heading">
              <span>AI</span>
              <div>
                <h2>一句话自动创角</h2>
                <p>生成结果会先填入下方表单，所有数值和技能都会经过战斗规则校验。</p>
              </div>
            </div>
            <label>
              <span>角色设想</span>
              <textarea
                required
                maxLength={500}
                rows={3}
                value={generationPrompt}
                onChange={(event) => setGenerationPrompt(event.target.value)}
                placeholder="例如：用冰霜法术牵制敌人的年轻法师，外表冷静但出手果断。"
              />
            </label>
            <div className="ai-generator-actions">
              <label>
                <span>职业偏好</span>
                <select
                  value={generationProfession}
                  onChange={(event) =>
                    setGenerationProfession(event.target.value as GenerationProfession)
                  }
                >
                  <option value="auto">由描述自动判断</option>
                  {PROFESSIONS.map((item) => (
                    <option key={item} value={item}>{PROFESSION_LABELS[item]}</option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={handleGenerate} disabled={isGenerating}>
                {isGenerating ? "正在生成…" : "AI 自动生成"}
              </button>
            </div>
            {generationNotice ? <p className="generation-notice" role="status">{generationNotice}</p> : null}
          </section>

          <section className="form-section">
            <div className="section-heading">
              <span>01</span>
              <div>
                <h2>角色档案</h2>
                <p>角色名与原始设想会一起保存在角色库中。</p>
              </div>
            </div>
            <label>
              <span>角色名称</span>
              <input
                required
                maxLength={24}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="例如：铁壁阿九"
              />
            </label>
            <label>
              <span>角色描述</span>
              <textarea
                required
                maxLength={500}
                rows={3}
                value={originalPrompt}
                onChange={(event) => setOriginalPrompt(event.target.value)}
                placeholder="例如：沉默寡言的前线守卫，善于保护同伴。"
              />
            </label>
          </section>

          <section className="form-section">
            <div className="section-heading">
              <span>02</span>
              <div>
                <h2>职业与属性</h2>
                <p>职业决定基础属性范围；阶位会在战斗中换算为有效属性。</p>
              </div>
            </div>
            <div className="profession-picker" aria-label="选择职业">
              {PROFESSIONS.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={profession === item ? "is-active" : ""}
                  onClick={() => changeProfession(item)}
                >
                  {PROFESSION_LABELS[item]}
                </button>
              ))}
            </div>
            <p className="profession-range">当前范围：{professionDescription}</p>
            <div className="realm-heading">
              <span>战力阶位</span>
              <small>阶位不会改变基础属性范围，但会放大入场后的属性与固定治疗、护盾。</small>
            </div>
            <div className="realm-picker" aria-label="选择战力阶位">
              {REALMS.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={realm === item ? "is-active" : ""}
                  onClick={() => setRealm(item)}
                >
                  {REALM_LABELS[item]}
                </button>
              ))}
            </div>
            <div className="field-grid attribute-fields">
              <label>
                <span>基础攻击</span>
                <input
                  required
                  type="number"
                  min={ranges.attack.min}
                  max={ranges.attack.max}
                  value={attack}
                  onChange={(event) => setAttack(Number(event.target.value))}
                />
              </label>
              <label>
                <span>基础最大生命</span>
                <input
                  required
                  type="number"
                  min={ranges.maxHealth.min}
                  max={ranges.maxHealth.max}
                  value={maxHealth}
                  onChange={(event) => setMaxHealth(Number(event.target.value))}
                />
              </label>
            </div>
            <p className="effective-attribute-preview" aria-live="polite">
              <span>{REALM_LABELS[realm]}入场有效属性</span>
              <strong>攻击 {effectiveStats.attack} · 生命 {effectiveStats.maxHealth}</strong>
            </p>
          </section>

          <section className="form-section">
            <div className="section-heading">
              <span>03</span>
              <div>
                <h2>双技能</h2>
                <p>可选两个主动技能，或一个主动技能加一个被动技能；两个技能不能使用相同类型或名称。群体与被动效果仅在团队战斗中生效。</p>
              </div>
            </div>
            <div className="skill-editor-grid">
              <SkillEditor
                label="技能一"
                position={1}
                draft={firstSkill}
                otherType={secondSkill.type}
                onChange={setFirstSkill}
              />
              <SkillEditor
                label="技能二"
                position={2}
                draft={secondSkill}
                otherType={firstSkill.type}
                onChange={setSecondSkill}
              />
            </div>
          </section>

          {error ? <p className="form-error" role="alert">{error}</p> : null}

          <footer className="creator-actions">
            <p>保存后可在角色库中设为红方或蓝方。</p>
            <button type="submit">保存角色卡</button>
          </footer>
        </form>
      </div>
    </main>
  );
}
