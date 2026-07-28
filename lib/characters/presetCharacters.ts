import type { Character } from "@/types/character";

const PRESET_TIMESTAMP = "2026-07-23T00:00:00.000Z";

export const PRESET_CHARACTERS: readonly Character[] = [
  {
    id: "preset-tank-guardian",
    name: "护卫",
    originalPrompt: "坚守阵线的护卫，以厚重盾牌保护自己与同伴。",
    profession: "tank",
    attack: 10,
    maxHealth: 170,
    skills: [
      { id: "preset-guardian-shield-bash", name: "盾击", description: "以盾牌发动稳定的近身打击。", type: "damage", cooldown: 2, damageMultiplier: 1.1 },
      { id: "preset-guardian-bulwark", name: "壁垒", description: "竖起护盾吸收接下来的伤害。", type: "shield", cooldown: 3, shieldAmount: 38 },
    ],
    createdAt: PRESET_TIMESTAMP,
    updatedAt: PRESET_TIMESTAMP,
  },
  {
    id: "preset-tank-swordsman",
    name: "剑客",
    originalPrompt: "身披重甲的剑客，攻守之间始终保持沉着。",
    profession: "tank",
    attack: 14,
    maxHealth: 152,
    skills: [
      { id: "preset-swordsman-heavy-slash", name: "重斩", description: "用沉稳的一剑压制对手。", type: "damage", cooldown: 3, damageMultiplier: 1.4 },
      { id: "preset-swordsman-iron-guard", name: "铁卫", description: "让铠甲承受更多冲击。", type: "shield", cooldown: 3, shieldAmount: 28 },
    ],
    createdAt: PRESET_TIMESTAMP,
    updatedAt: PRESET_TIMESTAMP,
  },
  {
    id: "preset-warrior-vampire",
    name: "吸血鬼",
    originalPrompt: "在月光下作战的吸血鬼，会从战斗间隙恢复精力。",
    profession: "warrior",
    attack: 20,
    maxHealth: 140,
    skills: [
      { id: "preset-vampire-night-strike", name: "夜袭", description: "趁对手不备发动凌厉攻击。", type: "damage", cooldown: 2, damageMultiplier: 1.5 },
      { id: "preset-vampire-blood-ritual", name: "血之仪式", description: "恢复自身生命以维持战线。", type: "heal", cooldown: 4, healAmount: 28 },
    ],
    createdAt: PRESET_TIMESTAMP,
    updatedAt: PRESET_TIMESTAMP,
  },
  {
    id: "preset-warrior-spearman",
    name: "长矛手",
    originalPrompt: "训练有素的长矛手，擅长用距离与时机控制战场。",
    profession: "warrior",
    attack: 19,
    maxHealth: 136,
    skills: [
      { id: "preset-spearman-pierce", name: "穿刺", description: "向前突刺，造成可靠伤害。", type: "damage", cooldown: 2, damageMultiplier: 1.4 },
      { id: "preset-spearman-formation-break", name: "破阵", description: "扰乱对手节奏，使其可能错过行动。", type: "control", cooldown: 4, stunChance: 0.35 },
    ],
    createdAt: PRESET_TIMESTAMP,
    updatedAt: PRESET_TIMESTAMP,
  },
  {
    id: "preset-mage-warlock",
    name: "术士",
    originalPrompt: "掌握奥术与诅咒的术士，能以冰霜束缚敌人。",
    profession: "mage",
    attack: 20,
    maxHealth: 112,
    skills: [
      { id: "preset-warlock-arcane-burst", name: "奥术爆发", description: "释放聚集的奥术能量。", type: "damage", cooldown: 3, damageMultiplier: 1.6 },
      { id: "preset-warlock-frost-bind", name: "冰霜束缚", description: "冰霜可能冻结对手下一次行动。", type: "control", cooldown: 4, stunChance: 0.4 },
    ],
    createdAt: PRESET_TIMESTAMP,
    updatedAt: PRESET_TIMESTAMP,
  },
  {
    id: "preset-mage-healer",
    name: "治疗师",
    originalPrompt: "专注治疗魔法的治疗师，也会以光束进行自保。",
    profession: "mage",
    attack: 15,
    maxHealth: 122,
    skills: [
      { id: "preset-healer-radiant-bolt", name: "圣光箭", description: "释放一道用于自保的光能攻击。", type: "damage", cooldown: 2, damageMultiplier: 1.1 },
      { id: "preset-healer-restoration", name: "复苏", description: "以治疗魔法恢复自身生命。", type: "heal", cooldown: 4, healAmount: 38 },
    ],
    createdAt: PRESET_TIMESTAMP,
    updatedAt: PRESET_TIMESTAMP,
  },
  {
    id: "preset-assassin-samurai",
    name: "武士",
    originalPrompt: "追求一击制胜的武士，凭精准拔刀压迫敌人。",
    profession: "assassin",
    attack: 24,
    maxHealth: 118,
    skills: [
      { id: "preset-samurai-iaido", name: "居合", description: "以瞬间拔刀造成高额伤害。", type: "damage", cooldown: 3, damageMultiplier: 1.7 },
      { id: "preset-samurai-intimidation", name: "威压", description: "凌厉气势可能令对手迟疑。", type: "control", cooldown: 4, stunChance: 0.3 },
    ],
    createdAt: PRESET_TIMESTAMP,
    updatedAt: PRESET_TIMESTAMP,
  },
  {
    id: "preset-assassin-winged-beast",
    name: "有翼兽",
    originalPrompt: "自高空俯冲的有翼兽，以速度和爪击解决战斗。",
    profession: "assassin",
    attack: 23,
    maxHealth: 112,
    skills: [
      { id: "preset-winged-beast-dive", name: "俯冲", description: "从高空猛然俯冲撕裂目标。", type: "damage", cooldown: 2, damageMultiplier: 1.6 },
      { id: "preset-winged-beast-wing-guard", name: "翼幕", description: "用双翼形成短暂的保护层。", type: "shield", cooldown: 3, shieldAmount: 22 },
    ],
    createdAt: PRESET_TIMESTAMP,
    updatedAt: PRESET_TIMESTAMP,
  },
  {
    id: "preset-ranger-witch",
    name: "女巫",
    originalPrompt: "携带咒术与魔药的女巫，擅长从远处限制敌人。",
    profession: "ranger",
    attack: 26,
    maxHealth: 106,
    skills: [
      { id: "preset-witch-hex-bolt", name: "咒能弹", description: "射出带有咒力的远程攻击。", type: "damage", cooldown: 2, damageMultiplier: 1.4 },
      { id: "preset-witch-binding-hex", name: "束缚咒", description: "诅咒可能令对手下一次行动落空。", type: "control", cooldown: 4, stunChance: 0.35 },
    ],
    createdAt: PRESET_TIMESTAMP,
    updatedAt: PRESET_TIMESTAMP,
  },
  {
    id: "preset-ranger-princess",
    name: "公主",
    originalPrompt: "带领远征队的公主，既会远程作战也懂得照顾自己。",
    profession: "ranger",
    attack: 22,
    maxHealth: 116,
    skills: [
      { id: "preset-princess-royal-arrow", name: "王室箭", description: "以训练有素的射术攻击对手。", type: "damage", cooldown: 2, damageMultiplier: 1.2 },
      { id: "preset-princess-recovery-song", name: "复苏之歌", description: "用鼓舞人心的歌声恢复生命。", type: "heal", cooldown: 4, healAmount: 30 },
    ],
    createdAt: PRESET_TIMESTAMP,
    updatedAt: PRESET_TIMESTAMP,
  },
];

export function getPresetCharacters(): Character[] {
  return PRESET_CHARACTERS.map((character) => ({
    ...character,
    skills: character.skills.map((skill) => ({ ...skill })) as Character["skills"],
  }));
}
