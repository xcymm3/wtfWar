# 次元竞技场

次元竞技场是一个基于 Next.js 构建的 AI 角色生成与确定性团队战斗 Web 应用。玩家可以通过自然语言生成角色，将角色编入红蓝双方队伍，并在可复现的回合制战斗中查看完整战报。

## 功能特性

- AI 两阶段角色生成：先规划职业与技能类型，再生成合法属性与技能数值。
- 五种职业、五个战力阶位、主动技能、被动技能与双被动技能组合。
- 支持双方各 1–5 名角色的队伍编排、顺序调整与确定性回合制战斗。
- 团队战报回放，展示生命、护盾、眩晕、冷却、蓄力和被动效果。
- 竞技模式：双方必须各选满五人，角色原始阶位不变，但生命、攻击和技能数值统一按菜鸟阶位结算。
- 全站战斗统计：仅记录竞技模式的完整五人对局，展示总场次、最近对局和队伍排行榜。
- 队伍排行榜：按胜场或胜率查看前十名完整阵容，阵容成员与站位共同决定队伍身份。
- Neon Postgres 共享角色库，内置十名预设英雄并支持保存 AI 生成角色。
- 模型调用具备请求 ID、超时、重试、结构化日志与内部指标保留机制。

## 技术栈

| 类别 | 技术 |
| --- | --- |
| Web 框架 | Next.js 16、React 19、TypeScript 5 |
| 客户端状态 | Zustand |
| 数据校验 | Zod |
| 数据库 | Neon Postgres、Drizzle ORM |
| AI 接口 | 兼容 OpenAI Chat Completions 的服务端 API |
| 测试 | Node.js Test Runner、TSX |
| 代码检查 | ESLint |

## 环境要求

- Node.js `22.x`
- pnpm `11.x`
- Neon Postgres 数据库
- 可选：兼容 Chat Completions 的模型服务

## 环境配置

复制 `.env.example` 为根目录 `.env`：

```powershell
Copy-Item .env.example .env
```

配置数据库连接：

```text
DATABASE_URL=postgresql://...
```

启用 AI 自动创角时，补充以下配置：

```text
OPENAI_API_KEY=...
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4.1-mini
MODEL_REQUEST_TIMEOUT_MS=60000
```

DeepSeek 配置示例：

```text
OPENAI_BASE_URL=https://api.deepseek.com
OPENAI_MODEL=deepseek-v4-flash
```

应用会识别 DeepSeek 官方域名，并自动使用其支持的 `json_object` 输出格式；其他兼容服务使用严格 JSON Schema 输出格式。

## 本地运行

安装依赖并同步数据库表结构：

```bash
pnpm install
pnpm db:push
```

启动开发服务：

```bash
pnpm dev
```

浏览器访问 [http://localhost:3000](http://localhost:3000)。首次读取角色库时，服务端会自动写入预设英雄。

## 生产构建

```bash
pnpm build
pnpm start
```

部署到 Vercel 时，在项目环境变量中配置 `DATABASE_URL` 以及可选的模型环境变量。首次部署前或数据库结构变更后，执行一次 `pnpm db:push`。

## 数据与可观测性

- `characters`：共享角色库，角色名称经过规范化后全局唯一。
- `model_generation_events`：模型生成尝试的状态、耗时、上游状态码与 token 用量。
- `battle_records`：仅保存竞技模式下双方各五人的有序阵容名册、种子、胜负和时间；不保存逐回合事件，不提供回放。
- 指标表只保留最新 10,000 条记录，超过上限时自动清理最旧数据。
- 浏览器 `localStorage` 保存角色缓存、当前会话队伍选择和声音设置。
- 模型密钥、数据库连接串和内部指标不会暴露到浏览器。

## HTTP 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/characters` | 读取共享角色库 |
| `POST` | `/api/characters` | 校验并保存角色 |
| `POST` | `/api/characters/generate` | 根据名称、描述和战力阶位生成角色 |
| `GET` | `/api/battles` | 读取全站战斗汇总与最近对局摘要 |
| `POST` | `/api/battles` | 服务端复算并记录一场队伍对战 |
| `GET` | `/api/battles/leaderboard` | 读取完整队伍前十排行榜，支持按胜场或胜率排序 |

## 项目结构

```text
app/                  Next.js 页面、API 路由与全局样式
db/                   Neon/Drizzle 数据库连接和表结构
features/             角色库、创角、队伍编排、战斗观战 UI
lib/battle/           确定性战斗引擎、阶位换算与随机数工具
lib/characters/       角色规则、预设、远端仓库与 AI 提示词
lib/observability/    模型调用日志与指标保留策略
lib/storage/          浏览器本地存储
lib/store/            Zustand 状态管理
tests/                单元测试与页面渲染测试
docs/                 架构与战斗规则文档
```

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 启动本地开发服务 |
| `pnpm build` | 执行生产构建 |
| `pnpm start` | 启动生产服务 |
| `pnpm test` | 运行单元测试、生产构建和页面渲染验证 |
| `pnpm lint` | 运行 ESLint |
| `pnpm simulate:balance` | 执行五职业基准角色平衡模拟 |
| `pnpm db:push` | 同步 Drizzle 表结构到 Neon |

## 文档

- [架构说明](./docs/architecture.md)
- [战斗规则](./docs/battle-rules.md)
