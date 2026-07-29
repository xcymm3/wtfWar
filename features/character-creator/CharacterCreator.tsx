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
  critical: "暴击",
  area_control: "群体控制",
  invincible: "无敌",
  cleave_passive: "横扫被动",
  charge_strike_passive: "蓄力一击被动",
  lifesteal_passive: "吸血被动",
  growth_passive: "成长被动",
  revive_passive: "复活被动",
  assassin_passive: "刺客被动",
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
      return `治疗己方前排 ${skill.healAmount ?? 0} 点`;
    case "area_heal":
      return `全队治疗 ${skill.healAmount ?? 0} 点`;
    case "control":
      return "眩晕敌方前排";
    case "critical":
      return `双倍伤害并回血`;
    case "area_control":
      return "眩晕敌方全体";
    case "invincible":
      return "本回合免疫伤害";
    case "cleave_passive":
      return "普通攻击命中敌方全体";
    case "charge_strike_passive":
      return `每 ${skill.chargeTurns ?? 0} 次行动释放`;
    case "lifesteal_passive":
      return `造成伤害后回血 ${skill.damageMultiplier ?? 0}×攻击`;
    case "growth_passive":
      return `行动后提高 ${skill.damageMultiplier ?? 0}×攻击`;
    case "revive_passive":
      return "首次阵亡时半血复活";
    case "assassin_passive":
      return "攻击降低并优先切后排";
    case "buff":
      return "持续增益";
    default:
      return "特殊技能效果";
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
  const [isSaving, setIsSaving] = useState(false);
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

  function changeRealm(nextRealm: Realm): void {
    setRealm(nextRealm);
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
          realm,
        }),
      });
      const payload = await response.json() as {
        character?: unknown;
        error?: unknown;
        requestId?: unknown;
      };

      if (!response.ok) {
        const message = typeof payload.error === "string" ? payload.error : "角色生成失败。";
        const requestId = typeof payload.requestId === "string" ? payload.requestId : null;
        throw new Error(
          requestId ? `${message}（请求 ID：${requestId}）` : message,
        );
      }

      const generated = characterSchema.parse(payload.character) as Character;
      setProfession(generated.profession);
      setRealm(generated.realm ?? realm);
      setAttack(generated.attack);
      setMaxHealth(generated.maxHealth);
      setGeneratedSkills(generated.skills);
      setGenerationNotice("AI 已根据角色名称、描述和战斗力生成职业、属性和技能。");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "角色生成失败。",
      );
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
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

    setIsSaving(true);
    try {
      const response = await fetch("/api/characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validation.data),
      });
      const payload = await response.json() as { character?: unknown; error?: unknown };
      if (!response.ok) {
        throw new Error(
          typeof payload.error === "string" ? payload.error : "角色保存失败。",
        );
      }

      addCharacter(characterSchema.parse(payload.character));
      router.push("/");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "角色保存失败，请稍后重试。",
      );
    } finally {
      setIsSaving(false);
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
            <p className="library-kicker">次元竞技场 · 手动创角</p>
            <p>让你想的角色成真！！你只需要输入名称+设定+战斗力，就可以自动生成一个角色！注意：同名角色只能有一个</p>
          </div>
          <Link href="/" className="back-link">返回角色库</Link>
        </header>

        <form className="creator-form" onSubmit={handleSubmit}>
          <section className="form-section">
            <div className="section-heading">
              <h2>角色设定</h2>
            </div>

            <div className="realm-heading">
              <span>战斗力</span>
            </div>
            <div className="realm-picker" aria-label="选择战斗力">
              {REALMS.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={realm === item ? "is-active" : ""}
                  onClick={() => changeRealm(item)}
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
              <span>角色设定</span>
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
              <button type="button" onClick={handleGenerate} disabled={isGenerating || isSaving}>
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
            <button type="submit" disabled={!generatedSkills || !profession || isGenerating || isSaving}>
              {isSaving ? "正在保存到角色库…" : "保存角色卡"}
            </button>
          </footer>
        </form>
      </div>
    </main>
  );
}
