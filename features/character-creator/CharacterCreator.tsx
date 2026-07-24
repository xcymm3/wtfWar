"use client";

import { nanoid } from "nanoid";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { getEffectiveCombatStats } from "@/lib/battle/realm";
import { characterSchema } from "@/lib/schemas/character";
import { useGameStore } from "@/lib/store/gameStore";
import { ProfessionIcon } from "@/features/profession/ProfessionIcon";
import {
  PROFESSION_LABELS,
  REALMS,
  REALM_LABELS,
  type Character,
  type Profession,
  type Realm,
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
  charge_strike_passive: "蓄力一击被动",
  buff: "增益",
};

function getSkillEffect(skill: Skill): string {
  switch (skill.type) {
    case "damage":
    case "area_damage":
      return `伤害倍率 ${skill.damageMultiplier ?? 1}×`;
    case "shield":
      return `护盾 ${skill.shieldAmount ?? 0} 点`;
    case "heal":
      return `治疗 ${skill.healAmount ?? 0} 点`;
    case "area_heal":
      return `全队治疗 ${skill.healAmount ?? 0} 点`;
    case "control":
      return `眩晕概率 ${Math.round((skill.stunChance ?? 0) * 100)}%`;
    case "cleave_passive":
      return "普通攻击命中敌方全体";
    case "charge_strike_passive":
      return `每 ${skill.chargeTurns ?? 0} 次行动释放`;
    case "buff":
      return "持续增益";
  }
}

function GeneratedSkillCard({ skill, index }: { skill: Skill; index: number }) {
  return (
    <article className="generated-skill-card">
      <span>技能 {index} · {SKILL_TYPE_LABELS[skill.type]}</span>
      <strong>{skill.name}</strong>
      <p>{skill.description}</p>
      <small>{skill.activation === "passive" ? "被动生效" : `冷却 ${skill.cooldown} 回合`} · {getSkillEffect(skill)}</small>
    </article>
  );
}

export function CharacterCreator() {
  const router = useRouter();
  const hasHydrated = useGameStore((state) => state.hasHydrated);
  const hydrate = useGameStore((state) => state.hydrate);
  const addCharacter = useGameStore((state) => state.addCharacter);
  const [profession, setProfession] = useState<Profession | null>(null);
  const [realm, setRealm] = useState<Realm>("mortal");
  const [name, setName] = useState("");
  const [originalPrompt, setOriginalPrompt] = useState("");
  const [attack, setAttack] = useState<number | null>(null);
  const [maxHealth, setMaxHealth] = useState<number | null>(null);
  const [generatedSkills, setGeneratedSkills] = useState<[Skill, Skill] | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationNotice, setGenerationNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const effectiveStats = attack !== null && maxHealth !== null
    ? getEffectiveCombatStats({ realm, attack, maxHealth })
    : null;

  function clearGeneratedProfile(): void {
    setAttack(null);
    setMaxHealth(null);
    setGeneratedSkills(null);
    setProfession(null);
    setGenerationNotice(null);
  }

  function changeDescription(nextDescription: string): void {
    setOriginalPrompt(nextDescription);
    clearGeneratedProfile();
  }

  function changeName(nextName: string): void {
    setName(nextName);
    clearGeneratedProfile();
  }

  async function handleGenerate(): Promise<void> {
    if (name.trim().length === 0) {
      setError("请先填写角色名称。");
      return;
    }

    if (originalPrompt.trim().length < 8) {
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
          name: name.trim(),
          prompt: originalPrompt.trim(),
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
      setProfession(generated.profession);
      setAttack(generated.attack);
      setMaxHealth(generated.maxHealth);
      setGeneratedSkills(generated.skills);
      setGenerationNotice(
        payload.source === "model"
          ? "AI 已根据角色名称和描述判定职业，并生成属性和技能。"
          : "已按角色名称、描述与战斗规则判定职业，并生成属性和技能。",
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

    if (!generatedSkills || !profession || attack === null || maxHealth === null) {
      setError("请先根据角色描述生成属性和技能，再保存角色卡。");
      return;
    }

    const timestamp = new Date().toISOString();
    const skills: [Skill, Skill] = [
      { ...generatedSkills[0], id: nanoid() },
      { ...generatedSkills[1], id: nanoid() },
    ];
    const character: Character = {
      id: nanoid(),
      name: name.trim(),
      originalPrompt: originalPrompt.trim(),
      profession,
      realm,
      attack,
      maxHealth,
      skills,
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
            <h1>给出设定，其余交给 AI。</h1>
            <p>选择战力阶位，再写下名称和描述；AI 会综合名称与描述判定职业，并生成符合战斗规则的属性与技能。</p>
          </div>
          <Link href="/" className="back-link">返回角色库</Link>
        </header>

        <form className="creator-form" onSubmit={handleSubmit}>
          <section className="form-section">
            <div className="section-heading">
              <span>01</span>
              <div>
                <h2>角色设定</h2>
                <p>以下三项由你决定。</p>
              </div>
            </div>

            <div className="realm-heading">
              <span>战力阶位</span>
              <small>阶位会放大角色进入战斗后的属性。</small>
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

            <label>
              <span>角色名称</span>
              <input
                required
                maxLength={24}
                value={name}
                onChange={(event) => changeName(event.target.value)}
                placeholder="例如：铁壁阿九"
              />
            </label>
            <label>
              <span>角色描述</span>
              <textarea
                required
                maxLength={500}
                rows={4}
                value={originalPrompt}
                onChange={(event) => changeDescription(event.target.value)}
                placeholder="例如：沉默寡言的前线守卫，善于保护同伴。"
              />
            </label>

            <div className="ai-generator-actions creator-generation-action">
              <p>职业、属性和技能将由 AI 根据角色名称与描述生成，生成后不可直接修改。</p>
              <button type="button" onClick={handleGenerate} disabled={isGenerating}>
                {isGenerating ? "正在生成…" : "生成角色属性"}
              </button>
            </div>
            {generationNotice ? <p className="generation-notice" role="status">{generationNotice}</p> : null}
          </section>

          <section className="form-section generated-profile" aria-live="polite">
            <div className="section-heading">
              <span>AI</span>
              <div>
                <h2>自动生成的战斗配置</h2>
                <p>以下内容为只读结果；修改角色名称或描述后需要重新生成。</p>
              </div>
            </div>

            {generatedSkills && profession && attack !== null && maxHealth !== null && effectiveStats ? (
              <>
                <div className="generated-attribute-grid">
                  <div className="generated-profession"><span><ProfessionIcon profession={profession} />职业</span><strong>{PROFESSION_LABELS[profession]}</strong></div>
                  <div><span>攻击</span><strong>{effectiveStats.attack}</strong></div>
                  <div><span>生命</span><strong>{effectiveStats.maxHealth}</strong></div>
                </div>
                <div className="generated-skill-grid">
                  <GeneratedSkillCard skill={generatedSkills[0]} index={1} />
                  <GeneratedSkillCard skill={generatedSkills[1]} index={2} />
                </div>
              </>
            ) : (
              <p className="generated-profile-empty">填写角色描述后点击“生成角色属性”，这里会显示 AI 生成的只读属性与技能。</p>
            )}
          </section>

          {error ? <p className="form-error" role="alert">{error}</p> : null}

          <footer className="creator-actions">
            <p>保存后可在角色库查看，并加入任意一方阵容。</p>
            <button type="submit" disabled={!generatedSkills || !profession || isGenerating}>保存角色卡</button>
          </footer>
        </form>
      </div>
    </main>
  );
}
