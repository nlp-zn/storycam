# StoryCam

[English](README.md) | [简体中文](README.zh-CN.md)

[![CI](https://github.com/nlp-zn/storycam/actions/workflows/ci.yml/badge.svg?branch=dev)](https://github.com/nlp-zn/storycam/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-14b8a6.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-111827.svg)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6-3178c6.svg)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-auth%20%2B%20storage-3fcf8e.svg)](https://supabase.com/)

[![线上应用](https://img.shields.io/badge/线上应用-storycam.znbuild.com-ff4b89.svg)](https://storycam.znbuild.com)
[![B 站系列](https://img.shields.io/badge/B%20站-StoryCam%20实战系列-00a7e0.svg)](https://space.bilibili.com/511795462)
[![长课件](https://img.shields.io/badge/长课件-完整案例复盘-f59e0b.svg)](https://portfolio.znbuild.com/tutorial/storycam/index.html)
[![文档](https://img.shields.io/badge/文档-项目地图-64748b.svg)](docs/README.md)

StoryCam 是一个 Web 优先的 AI 个人小剧场相机：用户输入一个个人想法和可选照片后，系统会生成并确认故事世界、核心分镜、视频片段，最后形成账号内可保存和预览的作品。

它不是工业化短剧生产后台，也不是给专业导演使用的镜头表工具。StoryCam 面向普通用户，把复杂的导演逻辑、提示词包、provider payload、签名 URL 和模型参数都留在服务端边界内。

| 输入故事 | 灵感样片 |
| --- | --- |
| <img src="./docs/design-docs/assets/storycam-home-input-banner.png" alt="StoryCam 输入工作台" width="100%"> | <img src="./docs/design-docs/assets/storycam-home-discovery-banner.png" alt="StoryCam 灵感样片墙" width="100%"> |

## 实战学习资料

StoryCam 也是一个公开记录的 agentic full-stack build case study。学习资料和产品 UI 有意分离：普通用户看到的是个人小剧场工具，贡献者可以通过这些资料理解项目如何被设计、拆解、实现、上线和传播。

- `docs/learning/index.md` 映射产品、工程、上线和增长经验。
- `docs/learning/bilibili-series.md` 关联从产品设计到部署和发布素材的中文 B 站实战系列。
- `docs/learning/portfolio-course.md` 关联 portfolio 站点上的 StoryCam 长课件章节。

外部入口：

- [StoryCam B 站空间](https://space.bilibili.com/511795462)
- [StoryCam 长课件目录](https://portfolio.znbuild.com/tutorial/storycam/index.html)

### B 站实战系列

<img src="./docs/design-docs/assets/storycam-bilibili-episode-10-cover.jpg" alt="StoryCam 第 10 集 B 站封面" width="100%">

_第 10 集代表封面。_

| 集数 | 标题 | 主题 |
| --- | --- | --- |
| 01 | 别先写代码！我用 AI Agent 先做产品设计 | 产品定位、个人小剧场方向、从需求前先定义问题。 |
| 02 | 别急着写 PRD！我用 AI Agent 先看懂设计稿 | 设计稿理解、产品语境提取、UI 到规格的交接。 |
| 03 | 别让 AI 直接写代码！先把 PRD 拆成研发计划 | PRD 拆解、研发计划、让实现路径先被审视。 |
| 04 | 终于让 AI Agent 写代码了！第一版产品本地跑起来 | 应用脚手架、本地运行、第一条可工作的产品路径。 |
| 05 | 跑起来只是开始！AI Agent 打通剧本、资产与分镜 | 剧本、人物资产、场景资产、分镜和生成依赖链。 |
| 06 | 写完代码还没完！我让 AI Agent 重做 UI 和上线工具链 | UI 打磨、流程收敛、发布工具链和可维护性。 |
| 07 | 别让 AI 乱合代码！我给项目加上 PR Gate 和 CI/CD | PR Gate、CI/CD、评审角色和合并纪律。 |
| 08 | 一张照片变手绘旅行 VLOG！AI Agent 给产品加新玩法 | 手绘旅行 VLOG 模式、新玩法接入和边界保持。 |
| 09 | 产品终于上线了！AI Agent 帮我搞定部署、域名和监控 | Render、Supabase、Cloudflare、worker 和观测性。 |
| 10 | 上线只是开始！我让 AI Agent 做发布视频、增长和 BP | 发布视频、增长素材、BP 叙事和下一轮产品思考。 |

完整学习路线见 `docs/learning/index.md`、`docs/learning/bilibili-series.md` 和 `docs/learning/portfolio-course.md`。

## 为什么做

很多 AI 视频工具要么只给一个空白提示词框，要么直接暴露专业生产工作台。StoryCam 选择一个更窄、更适合个人创作的产品闭环：

```text
个人想法 + 可选照片
  -> 剧本 + 人物资产 + 场景资产
  -> 用户确认故事世界
  -> 一个核心分镜组
  -> 可选扩展分镜卡
  -> 一个生成片段
  -> 最终作品拼接
  -> 账号内保存和预览
```

核心判断很简单：个人创作产品的信任来自“先确认，再生成”。用户应该先看到故事、人物和场景是对的，再让系统消耗视频生成成本。

## 当前状态

StoryCam 是一个活跃的 MVP 代码库，已经具备生产 beta 路径。默认本地和 CI 流程使用 mock providers，所以贡献者不需要付费 AI 凭证也能跑起来。DeepSeek、OpenRouter、Inference.sh 和 Seedance 的真实 smoke test 都是显式开启、依赖 secret、并且可能消耗 provider 额度的路径。

公开项目名是 `nlp-zn/storycam`。这个仓库与历史上其他使用 StoryCam 名称的产品无关。

## 项目里有什么

- 基于 Next.js 16、React 19、TypeScript 和 Tailwind CSS 的 StoryCam 创作工作台。
- Supabase Auth、Postgres、RLS 和私有 Storage，用于账号内 session 与媒体资产。
- 服务端 provider adapters：DeepSeek、OpenRouter、Inference.sh、Seedance 2.0，以及 FFmpeg 最终作品拼接。
- `generation_jobs` 持久化任务，覆盖文本、图片、视频和最终作品路径。
- mock-mode fixtures、Vitest、Playwright E2E、visual QA、渐进式 CI gate，以及 StoryCam 专用 PR Gate。
- `docs/` 下的产品、架构、provider、安全、部署和学习文档。

## 快速开始

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

填写 `.env.local` 里的 Supabase 配置。除非你明确要跑真实 provider smoke test，否则保持 mock provider 默认值：

```text
STORYCAM_GENERATION_MODE=mock
STORYCAM_TEXT_PROVIDER=mock
STORYCAM_STORY_WORLD_TEXT_PROVIDER=mock
STORYCAM_STORYBOARD_TEXT_PROVIDER=mock
STORYCAM_MULTIMODAL_PROVIDER=mock
STORYCAM_IMAGE_PROVIDER=mock
STORYCAM_VIDEO_PROVIDER=mock
STORYCAM_FINAL_WORK_PROVIDER=mock
```

打开 `http://localhost:3000`。完整本地配置见 `docs/references/local-dev.md`。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `pnpm dev` | 启动本地 Next.js 应用。 |
| `pnpm lint` | 运行 ESLint。 |
| `pnpm typecheck` | 运行 TypeScript 检查。 |
| `pnpm test` | 运行单元测试。 |
| `pnpm test:api` | 运行 API/service 测试。 |
| `pnpm test:e2e` | 运行主要 Playwright StoryCam 流程测试。 |
| `pnpm qa:visual` | 运行视觉 QA。 |
| `pnpm storycam:verify:mock` | 验证 mock-mode StoryCam 路径。 |
| `pnpm storycam:verify:live` | 验证已配置的 live health endpoints。 |

渐进式 gate：

```bash
scripts/check-local.sh    # lint, typecheck, unit tests
scripts/check-pr.sh       # local gate + production build
scripts/check-dev.sh      # PR gate + E2E + visual QA
scripts/check-release.sh  # dev gate + mock verification + audit
```

## 架构边界

```text
Browser UI
  -> Next.js App Router pages and route handlers
  -> StoryCam React workspace components
  -> server-only StoryCam services
  -> Supabase Auth + Postgres + private Storage
  -> DeepSeek / OpenRouter / Inference.sh / Seedance provider adapters
  -> final work composition boundary
```

关键边界：

- UI 不直接 import 真实 provider，也不从浏览器调用模型或媒体 provider。
- API routes 校验输入，在需要时要求当前用户，并调用 server-only services。
- Repositories 通过 `user_id` 隔离 StoryCam 数据。
- 私有媒体预览使用短期 signed URLs 或认证下载 routes。
- 日志和 Sentry events 必须在边界处脱敏。

完整系统地图见 `docs/ARCHITECTURE.md`。

## 文档

- `AGENTS.md`：agent 和贡献者的项目宪法。
- `docs/README.md`：文档地图。
- `docs/product-specs/index.md`：产品行为事实源。
- `docs/ARCHITECTURE.md`：系统边界和已实现 surface。
- `docs/SECURITY.md`：auth、RLS、storage、provider keys、logs 和 privacy 规则。
- `docs/references/local-dev.md`：本地 mock-mode setup 和 smoke commands。
- `docs/references/providers.md`：provider mode matrix 和真实 smoke policy。
- `docs/PR_REVIEW.md`：deterministic gates、Codex PR Gate 和 Ship Gate。
- `CONTRIBUTING.md`：开源贡献流程。
- `SECURITY.md`：漏洞报告方式。

## 贡献

欢迎贡献，但需要保持 StoryCam 的产品边界：

- 保留故事、剧本、人物、场景和分镜确认；
- provider calls、service-role access、prompt packets 和 raw provider payloads 必须留在服务端；
- 不向普通用户暴露专业镜头表或 Shanyin-style internals；
- 行为、架构、命令或质量规则变化时同步更新文档。

提交有意义的 PR 前，请先读 `CONTRIBUTING.md` 和 `docs/PR_REVIEW.md`。

## 安全

不要提交 provider keys、Supabase service-role secrets、原始私人输入、完整 prompts、prompt packets、signed URLs、cookies、auth headers 或未脱敏 provider errors。安全报告请遵循 `SECURITY.md`。

## 许可证

StoryCam 使用 MIT License，见 `LICENSE`。

`docs/references/shanyin-director-master/` 下保留的 Shanyin Director Master 本地参考快照有自己的 MIT license，仅作为内部导演方法论参考。见 `NOTICE`。
