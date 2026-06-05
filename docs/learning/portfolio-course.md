# Portfolio Course Chapters

The portfolio course is the long-form StoryCam session narrative. It records product decisions, implementation pivots, quality gates, deployment work, and launch storytelling in chapter form.

Course index: [StoryCam 项目学习课件目录](https://portfolio.znbuild.com/tutorial/storycam/index.html)

## Chapter Map

| Chapter | Title | Why It Matters |
| --- | --- | --- |
| 0 | 产品方向、生成链路与设计交接 | Establishes StoryCam's private mini-theater positioning and the story-world confirmation loop. |
| 1 | 设计到计划：Autoplan 与实施定稿 | Shows how a broad product idea was reduced into implementable phases. |
| 2.0 | Agent Skills 与 PR Gate 工作流 | Explains why StoryCam separates deterministic gates from explicit AI review. |
| 2.1 | 文档基线、架构决策与实现计划 | Shows the move from product spec to architecture, generated snapshots, and references. |
| 3 | 真实 Provider 接入与 Mock 排查 | Covers the first shift from fixed mock behavior to structured provider-backed generation. |
| 3.1 | 剧本结构化、资产生成与异步生图 | Explains strict output, visual asset boundaries, async image jobs, and restore behavior. |
| 3.2 | 核心分镜依赖链与视频闭环 | Details script -> asset image -> storyboard -> Seedance clip dependency ordering. |
| 3.3 | 漫画化视频链路与私有媒体流 | Records private storage, comic-film style, and media persistence decisions. |
| 3.4 | 生成链路修复与工作台 UI 迭代 | Covers UI state, polling, audio prompt direction, and flow simplification. |
| 4.0 | GitHub、PR Gate 与 Hooks 配置 | Documents branch, CI, hook, and review-governance tradeoffs. |
| 4.1 | 工作台视觉升级与片段生成发布 | Shows UI consolidation and publication workflow around clip generation. |
| 5.0 | 手绘旅行 VLOG 模式 | Adds a new user-facing mode while preserving the main StoryCam workflow. |
| 5.1 | 新功能后的生成链路打磨 | Covers restore, ratio propagation, continuity quality, provider setup, and pre-ship gates. |
| 6.0 | 部署上线、监控接线与发布治理 | Explains Render, Supabase, Cloudflare, worker, uptime, and production-smoke choices. |
| 6.1 | 投资人 BP 与融资叙事 | Shows how product evidence was turned into an investor-facing narrative. |
| 6.2 | 发布推广视频与预览环境 | Records launch-video generation and preview-environment thinking. |

## Repository Boundary

The course is a teaching artifact. The repository remains the source of truth for:

- current product behavior,
- implemented API and data contracts,
- provider and storage boundaries,
- quality gates,
- deployment and observability state.

When the course and repository disagree, update the repository docs or note that the course chapter is historical.
