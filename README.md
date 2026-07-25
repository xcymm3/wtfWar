# War AI

一个由自然语言创建角色、使用确定性回合规则进行 1v1 文字战斗的 Web Beta 项目。

Beta 阶段使用浏览器 `localStorage` 保存角色和最近战报，不依赖数据库或账号系统。

角色可由一句自然语言设想自动生成。默认情况下会使用本地规则生成一张合规角色卡；配置模型密钥后，浏览器只请求本站的服务端接口，由服务端代理调用模型，密钥不会暴露到浏览器。

## Prerequisites

- Node.js `22.x`

## Quick Start

```bash
pnpm install
pnpm dev
pnpm build
```

## 可选：配置模型自动创角

复制 `.env.example` 为 `.env.local`，填入服务端模型配置后重启开发服务：

```text
OPENAI_API_KEY=...
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4.1-mini
```

接口使用兼容 Chat Completions 的配置。未配置时，自动创角仍可用，但页面会明确提示使用的是本地规则生成。

## 当前工程结构

- `app/`：页面与全局样式
- `features/`：创角、角色库和战斗功能模块；当前主页为角色库
- `types/`：角色与战斗领域类型
- `lib/schemas/`：数据校验
- `lib/storage/`：本地存储
- `lib/store/`：角色库与对战选择的客户端状态
- `lib/battle/`：战斗规则和引擎
- `docs/architecture.md`：Beta 架构约定

## Useful Commands

- `pnpm dev`: start local development
- `pnpm build`: 验证原生 Next.js 生产构建
- `pnpm test`: 运行规则测试、构建并验证基础页面
- `pnpm simulate:balance`: 对五个职业基准角色进行平衡模拟

项目使用原生 Next.js App Router，可直接导入 Vercel 并使用默认的 Next.js 构建设置部署。
