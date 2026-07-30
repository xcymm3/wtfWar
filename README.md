# 次元竞技场

一个由自然语言生成角色、使用确定性规则进行 1–5 人团队文字战斗的 Next.js Web Beta 项目。

## 当前状态

已实现：

- AI 两阶段创角：先选择职业与两个技能类型，再生成属性和技能数值；服务端校验所有输出。
- 五种职业、五个战力阶位、主动/被动技能、双被动组合与十名预设英雄。
- 1–5 人自由编队、队形排序、确定性团队战斗与当前会话内的战报回放。
- Neon 远端共享角色库；首次读取时自动写入预设英雄，新角色通过服务端保存。
- 模型调用超时、重试、请求 ID、结构化日志和内部指标；指标表只保留最新 10,000 条。

尚未实现：

- 用户账号、角色归属、在线匹配、积分排行榜、赛季和正式竞技模式。
- 持久化战报历史、支付与广告变现。

远端角色库当前为全站共享，角色名称全局唯一。浏览器 `localStorage` 仅保存本地缓存、当前会话的队伍选择和声音设置，不能替代远端角色库或账号系统。

## 环境要求

- Node.js `22.x`
- pnpm `11.x`
- Neon Postgres 数据库
- 可选：兼容 Chat Completions 的模型服务

## 本地启动

复制 `.env.example` 为根目录 `.env`，填入 `DATABASE_URL` 后执行：

```bash
pnpm install
pnpm db:push
pnpm dev
```

`pnpm db:push` 会创建或同步 `characters` 与 `model_generation_events` 数据表。部署到 Vercel 时，需要配置同一组服务端环境变量。

## AI 自动创角配置

```text
OPENAI_API_KEY=...
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4.1-mini
MODEL_REQUEST_TIMEOUT_MS=60000
```

接口使用兼容 Chat Completions 的服务端代理，模型密钥不会发送到浏览器。DeepSeek 使用以下配置，接口会自动切换为其 `json_object` 输出模式：

```text
OPENAI_BASE_URL=https://api.deepseek.com
OPENAI_MODEL=deepseek-v4-flash
```

每次模型生成尝试都会生成请求 ID，并在服务端日志和 `model_generation_events` 表记录状态、耗时、上游状态码及 token 用量；这些数据不会返回给前端。单个上游请求默认最多等待 60 秒，指标表超过 10,000 条时会自动删除最旧记录。

## 页面与接口

- `/`：共享角色库、筛选与红蓝双方 1–5 人编队。
- `/create`：AI 自动创角与手动保存角色。
- `/battle`：确定性团队战斗观战与当前会话回放。
- `GET` / `POST /api/characters`：读取共享角色库与保存新角色。
- `POST /api/characters/generate`：服务端代理模型生成角色。

## 工程结构

- `app/`：页面、API 路由与全局样式。
- `features/`：角色库、创角、队伍编排、战斗观战与职业图标。
- `db/`：Neon/Drizzle 数据库连接和表结构。
- `lib/battle/`：纯函数的 1v1 与团队战斗引擎、阶位换算和确定性随机数。
- `lib/characters/`：预设角色、职业规则、名称处理、远端角色仓库与 AI 提示词。
- `lib/observability/`：模型生成日志与指标保留策略。
- `lib/storage/`、`lib/store/`：浏览器本地缓存和当前会话状态。
- `docs/architecture.md`、`docs/battle-rules.md`：当前架构与战斗规则。

## 常用命令

- `pnpm dev`：启动本地开发服务。
- `pnpm build`：执行 Next.js 生产构建。
- `pnpm test`：运行单元测试、生产构建和页面渲染验证。
- `pnpm lint`：运行 ESLint。
- `pnpm simulate:balance`：运行五职业基准角色平衡模拟。
- `pnpm db:push`：同步 Drizzle 表结构到 Neon。

项目使用 Next.js App Router，可部署到 Vercel。正式竞技模式上线前需要补充账号、角色归属、服务端比赛快照、匹配、积分与反作弊边界。
