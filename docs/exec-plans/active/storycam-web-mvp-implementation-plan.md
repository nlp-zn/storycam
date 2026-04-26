# StoryCam Web MVP 详细实施计划

日期：2026-04-26
状态：PLAN v0.1，基于 `docs/product-specs/storycam-film-machine-design.md` v0.2
适用范围：从当前“文档 + 静态设计稿”仓库，实施 Phase 1 Web MVP

## 规划边界

本计划使用 `planning-and-task-breakdown` 方法，把产品规格拆成可执行任务。它不直接实现代码，而是定义实施顺序、依赖关系、验收标准和验证方式。

本计划以最新产品规格为准。如果旧工程计划中出现以下说法，以本计划修正为准：

- 第一版不支持分享链接，只支持保存到用户账号和预览。
- 第一版必须真实合成 `final_work`，即使只有一个 clip。
- Phase 1 允许照片上传。
- 核心分镜组数量由计划视频长度自动判断。
- Provider-send confirmation 使用一句话确认即可，不展示完整字段摘要。
- Shanyin-style shot data 不允许导出给用户。
- 第一版需要账号登录，首选 Google 登录，使用 Supabase Auth。
- 数据库使用 Supabase Postgres，不使用 SQLite 作为 MVP 主数据库。
- 上传图片、生成视频片段和最终作品使用 Supabase Storage。
- 后端 AI 编排使用 Vercel AI SDK。
- 文生、照片理解和生图模型优先从 OpenRouter 模型中选择。

## 总览

StoryCam Phase 1 要实现一条 Web-first 私人记忆预告片路径：

```text
输入文本/照片 + 轻导演选择
  -> 生成故事世界：短剧本、人物资产、场景资产
  -> 用户确认故事世界
  -> 根据计划视频长度生成 1-3 个核心分镜组
  -> 可选展开某个核心分镜组
  -> 一句话确认发送视频生成
  -> 异步生成 Seedance 2.0 clip
  -> 用户确认/重拍
  -> 真实合成 final work
  -> 保存到账号并预览
```

Phase 1 的核心不是做完整工作台，而是证明用户能从私人想法走到真实视频作品，并保留 mock mode 让没有 AI provider credentials 的开发者也能跑通全流程。MVP 主路径需要登录，未登录用户可以看到输入体验和样例，但保存、上传照片、真实视频生成和 final work 预览都应绑定 Supabase 用户。

## 架构决策

- **前端框架：Next.js App Router + TypeScript。** 适合单仓库快速实现 Web UI、route handlers、server-only provider adapter 和本地 prototype。
- **样式：Tailwind CSS。** 方便从现有 Stitch 结构参考中提炼真实产品界面，不照搬 cyber workstation 语气。
- **Auth：Supabase Auth，首选 Google 登录。** StoryCam session、media、job、final work 都必须归属 `auth.users.id`。
- **后端形态：Next.js Route Handlers + server-only service layer。** Phase 1 不单独部署独立后端服务，但必须把 API route、业务 service、repository、provider adapter 分层，避免 UI 直接操作数据库或模型。
- **数据库：Supabase Postgres。** 存储 users 关联 session、artifact、job、provider request、final work metadata；通过 repository interface 隔离，方便本地 Supabase 和 hosted Supabase 切换。
- **媒体存储：Supabase Storage。** 上传照片、mock media、generated clips、final work、thumbnail 存入私有 bucket；数据库只保存 storage bucket/key 和 media metadata，不提供分享链接。
- **生成提供方：provider boundary。** UI 不直接调用模型；所有生成经过 `TextGenerationProvider`、`MultimodalUnderstandingProvider`、`ImageGenerationProvider`、`VideoGenerationProvider`、`FinalWorkComposer`。
- **AI 编排：Vercel AI SDK。** 文本、结构化输出、多模态理解和图像生成通过 server-only AI service 调用；具体 provider 优先接 OpenRouter。
- **模型选择：先 mock，后 real。** 默认 mock mode 全流程；real mode 第一优先打通 OpenRouter 文生/图生和 Seedance 2.0 视频生成。具体模型名用环境变量配置。
- **图像策略：Phase 1 需要考虑真实生图。** 核心分镜代表图优先真实生成；扩展卡图片可先 mock/placeholder，若 OpenRouter 图像模型稳定再接入。
- **视频生成：异步 job。** 所有真实视频生成必须 enqueue job，支持 idempotency、polling、timeout、cancel/tombstone、late-result discard。
- **最终合成：云端可运行 composer。** Phase 1 可以用 FFmpeg behind `FinalWorkComposer`，但必须能在部署环境运行，并把输出写回 Supabase Storage。
- **隐私：脱敏默认开启。** logs/errors/support payload 不能包含原始私人输入、完整 prompt packet、provider keys、signed URL 或未脱敏 provider error。

## 模型与生成编排

| 阶段 | 默认 mode | Real provider 边界 | Phase 1 说明 |
| --- | --- | --- | --- |
| 故事世界生成 | mock | Vercel AI SDK + OpenRouter text/multimodal model | 文本输入生成短剧本/人物/场景；照片上传时先提取稳定视觉描述。 |
| 分镜脚本 + 核心分镜组 | mock | Vercel AI SDK + OpenRouter text model | 根据计划视频长度自动判断 1-3 组，并输出用户可理解的核心方案。 |
| 核心分镜代表图 | mock/placeholder | Vercel AI SDK + OpenRouter image model | Phase 1 优先真实生成核心分镜代表图。 |
| 扩展分镜卡 | mock | Vercel AI SDK + OpenRouter text/image model | 默认 3 张，最多 8 张；不触发视频 job。 |
| Clip prompt packet | deterministic code | 不需要 AI | 组装和校验 artifact versions，生成一句话 provider-send confirmation。 |
| 视频片段生成 | mock | `VideoGenerationProvider=seedance_2_0` | Phase 1 真实魔法路径。 |
| Stitch suggestion | mock/text | `TextGenerationProvider` 或 deterministic rules | Phase 1 可先用规则生成建议。 |
| Final work 合成 | deterministic code | `FinalWorkComposer=ffmpeg` 或部署可运行 composer | 必须生成真实 final video，并写入 Supabase Storage。 |

## 后端服务设计

Phase 1 的后端不是独立微服务，而是 Next.js 应用内的 server-only 后端层。后端代码必须按以下边界组织：

```text
src/app/api/**/route.ts
  -> HTTP 输入输出、auth/session placeholder、request validation、redacted response

src/server/storycam/*Service.ts
  -> 业务流程编排、artifact version 检查、provider 调用、job 状态流转

src/server/storycam/*Repository.ts
  -> Supabase Postgres 读写、事务、查询、RLS-aware access、soft delete/tombstone

src/lib/providers/**
  -> mock/real provider adapters，不接触 UI state；AI 文生/图生通过 Vercel AI SDK + OpenRouter

src/lib/jobs/**
  -> GenerationJob 状态机、idempotency、timeout、cancel、late-result discard

src/lib/privacy/**
  -> redaction、hash、safe logging
```

### API 层

API route 只做四件事：

- 校验请求、文件类型、大小、枚举值和 idempotency key。
- 调用 server-only service。
- 把 service result 映射成前端需要的 response shape。
- 返回脱敏错误，不泄露原始输入、完整 prompt packet、provider error body、Supabase service role key 或长期有效 media URL。

API route 不允许：

- 直接调用 provider。
- 直接拼 prompt packet。
- 绕过 repository 直接操作 Supabase。
- 直接把 provider response 原样透传给客户端。

### Service 层

Phase 1 需要以下服务：

| Service | 职责 |
| --- | --- |
| `AuthService` | 读取 Supabase user、保护 API、处理未登录/未授权错误。 |
| `SessionService` | 创建/读取/删除 session，管理 session lifecycle，所有 session 归属 user。 |
| `MediaService` | 上传照片、校验 media、生成 Supabase Storage refs、删除关联文件。 |
| `StoryWorldService` | 调用 story world provider，保存 script/character/scene artifacts。 |
| `StoryboardService` | 根据已确认故事世界和计划时长生成 storyboard script 与核心分镜组。 |
| `ExpansionService` | 为核心分镜组生成扩展分镜卡。 |
| `ClipPromptPacketService` | 组装 packet、校验上游 artifact versions、生成一句话 confirmation。 |
| `GenerationJobService` | 创建/查询/取消 job，执行 idempotency、timeout、tombstone、late-result discard。 |
| `VideoGenerationService` | 通过 `VideoGenerationProvider` 执行 mock 或 Seedance 2.0 生成。 |
| `FinalWorkService` | 生成 stitch suggestion，调用 composer 合成 final work。 |
| `PrivacyLogService` | 统一输出安全日志和 redacted errors。 |

### Worker / Job 执行

Phase 1 可以先使用 in-process job runner 或 Vercel/Supabase 兼容的轻量 runner，但必须按可替换 worker 的方式设计：

- API 创建 `GenerationJob` 后立即返回 `jobId`。
- Job runner 根据 `job.type` 调用对应 service/provider。
- 前端通过 polling 查询 job。
- 进程重启后，`queued/running` job 可从 Supabase Postgres 恢复，或进入 `expired` / `recoverable` 状态，不能静默丢失。
- 后续可把 runner 替换为 Supabase Edge Function、Vercel Cron/Queue 或独立 worker，而不改 UI/API contract。

## 数据库设计

Phase 1 使用 Supabase Postgres 作为 metadata database。所有用户数据都必须通过 `user_id` 归属 Supabase Auth 用户，并配套 RLS policy。数据库不存二进制媒体文件，只保存 Supabase Storage bucket/key、media metadata 和访问策略。长期有效公开 URL 不进入数据库。

Supabase 项目需要启用：

- Supabase Auth，Google OAuth provider。
- Supabase Postgres。
- Supabase Storage 私有 bucket。
- RLS policies。
- Server-side service role key 只存在服务端环境变量中。

### 核心表

#### `storycam_sessions`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid primary key | session id |
| `user_id` | uuid indexed | `auth.users.id` |
| `status` | text | 派生 UI 状态：draft/generating/ready/deleted 等 |
| `generation_mode` | text | mock/real |
| `planned_duration_seconds` | integer | 用户计划视频长度 |
| `core_group_target_count` | integer | 根据计划时长自动判断的 1-3 |
| `created_at` | timestamptz | 创建时间 |
| `updated_at` | timestamptz | 更新时间 |
| `deleted_at` | timestamptz nullable | soft delete/tombstone |

#### `storycam_artifacts`

统一保存版本化 artifact，避免 Phase 1 过早拆出大量表。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid primary key | artifact id |
| `user_id` | uuid indexed | `auth.users.id`，便于 RLS |
| `session_id` | uuid indexed | 关联 session |
| `type` | text indexed | input/script/character_asset/scene_asset/storyboard_script/core_storyboard_group/expanded_storyboard_card/clip_prompt_packet/generated_clip/stitch_suggestion/final_work/quality_check |
| `state` | text | idle/generating/ready/failed/skipped/stale |
| `version` | integer | artifact version |
| `parent_artifact_id` | uuid nullable | expanded card -> core group 等父子关系 |
| `data_json` | jsonb | artifact payload JSON |
| `depends_on_json` | jsonb | 上游 artifact ids + versions |
| `created_at` | timestamptz | 创建时间 |
| `updated_at` | timestamptz | 更新时间 |
| `stale_at` | timestamptz nullable | stale timestamp |
| `deleted_at` | timestamptz nullable | soft delete |

约束：

- `(session_id, type, version)` 应可查询。
- `clip_prompt_packet` 必须有 `depends_on_json`。
- 写入新版本 artifact 时，不覆盖旧版本；旧版本可标记 stale。

#### `generation_jobs`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid primary key | job id |
| `user_id` | uuid indexed | `auth.users.id` |
| `session_id` | uuid indexed | 关联 session |
| `type` | text indexed | story_world/storyboard/video_clip/final_work |
| `status` | text indexed | queued/running/succeeded/failed/cancel_requested/canceled/expired |
| `idempotency_key_hash` | text indexed | 只存 hash |
| `generation_mode` | text | mock/real |
| `provider_kind` | text | text/image/video/stitch |
| `provider_name` | text | mock/seedance_2_0/etc |
| `provider_request_id` | text nullable | 不得是 secret-bearing token |
| `attempts` | integer | 当前尝试次数 |
| `max_attempts` | integer | 最大尝试次数 |
| `input_artifact_versions_json` | jsonb | 上游 artifact versions |
| `output_artifact_id` | uuid nullable | 生成成功后的 artifact |
| `error_code` | text nullable | 内部标准错误码 |
| `redacted_error` | text nullable | 脱敏错误 |
| `started_at` | timestamptz nullable | 开始时间 |
| `ended_at` | timestamptz nullable | 结束时间 |
| `created_at` | timestamptz | 创建时间 |
| `updated_at` | timestamptz | 更新时间 |
| `tombstoned_at` | timestamptz nullable | 删除/取消 tombstone |

约束：

- 同一个 `idempotency_key_hash` 重复提交必须返回已有 active job。
- `tombstoned_at` 存在时，late provider result 不能写入 output artifact。
- `generated_clips.length <= core_storyboard_groups.length` 由 service 层和测试保证。

#### `media_assets`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid primary key | media id |
| `user_id` | uuid indexed | `auth.users.id` |
| `session_id` | uuid indexed | 关联 session |
| `kind` | text indexed | uploaded_photo/mock_clip/generated_clip/final_work/thumbnail |
| `mime_type` | text | media MIME |
| `byte_size` | integer | 文件大小 |
| `storage_bucket` | text | Supabase Storage bucket |
| `storage_path` | text | Supabase Storage object key |
| `source` | text | upload/mock/provider/composer |
| `linked_artifact_id` | uuid nullable | 关联 artifact |
| `created_at` | timestamptz | 创建时间 |
| `deleted_at` | timestamptz nullable | soft delete |

约束：

- 客户端 response 使用短期 signed URL 或 authenticated proxy，不返回长期公开 URL。
- 删除 session 必须删除或 tombstone 关联 media，并删除 Supabase Storage object。

#### `provider_requests`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid primary key | internal request id |
| `user_id` | uuid indexed | `auth.users.id` |
| `job_id` | uuid indexed | 关联 job |
| `provider_kind` | text | text/image/video/stitch |
| `provider_name` | text | provider name |
| `provider_request_id` | text nullable | provider 返回 id |
| `request_summary_json` | jsonb | 脱敏摘要，不含完整 prompt |
| `response_summary_json` | jsonb nullable | 脱敏摘要 |
| `status` | text | submitted/succeeded/failed/canceled |
| `created_at` | timestamptz | 创建时间 |
| `updated_at` | timestamptz | 更新时间 |

### Supabase Storage buckets

| Bucket | 访问 | 内容 |
| --- | --- | --- |
| `storycam-uploads` | private | 用户上传照片。 |
| `storycam-generated` | private | 生成 clips、final works、thumbnails。 |
| `storycam-mock` | private 或 dev-only | mock media fixtures。 |

Storage path 建议：

```text
users/{user_id}/sessions/{session_id}/uploads/{media_id}.{ext}
users/{user_id}/sessions/{session_id}/clips/{clip_id}.{ext}
users/{user_id}/sessions/{session_id}/final/{final_work_id}.{ext}
users/{user_id}/sessions/{session_id}/thumbs/{thumbnail_id}.{ext}
```

### RLS policy 基线

- 用户只能读取/更新/删除自己的 `storycam_sessions`。
- 用户只能读取/更新/删除自己的 `storycam_artifacts`、`generation_jobs`、`media_assets`。
- Provider/job runner 使用 server service role 执行受控写入。
- 客户端不直接访问完整 prompt packet artifact；需要通过 API 返回 redacted shape。
- Storage bucket 使用私有访问；预览通过短期 signed URL 或 server proxy。

### 事务边界

- 创建 story world：一个事务写 session + artifacts + quality checks。
- 确认 story world 后生成 storyboard：一个事务写 storyboard_script + core groups，并更新 session。
- 创建 video job：一个事务校验 packet versions + 写 clip_prompt_packet + 写 generation_job。
- Job 成功：一个事务检查 tombstone + 写 generated_clip artifact + 写 media_asset + 更新 job。
- 删除 session：一个事务 soft delete session/artifacts/jobs/media metadata，然后删除 Supabase Storage objects。

### 本地开发与 hosted 演进

- 本地开发优先使用 Supabase local dev 或一个独立 Supabase project，不使用 SQLite fallback 作为主路径。
- CI 默认 mock AI provider，但仍可使用 Supabase local/test project 跑 DB/RLS tests。
- 后续如果引入独立 worker，不改变 `generation_jobs` 状态机。

## 依赖图

```text
工程文档契约
  -> app scaffold / env validation / test commands
      -> Supabase schema/RLS/storage + domain schemas + repository + media service
          -> provider interfaces + mock providers + redaction
              -> story-world route + UI slice
                  -> storyboard route + UI slice
                      -> expansion route + UI slice
                          -> clip packet + job model + job API
                              -> mock video job + clip review UI
                                  -> Seedance adapter + real video smoke path
                                      -> stitch suggestion + FFmpeg final work
                                          -> save/preview UI
                                              -> E2E, visual QA, docs sync
```

必须串行：

- Schema/repository 必须早于 API 和 UI。
- Provider contract 必须早于 mock/real provider。
- Job model 必须早于视频生成 UI。
- Final work composer 必须早于保存/预览验收。

可并行：

- 工程文档契约和 UI 视觉细化可以并行。
- Mock provider fixtures 和 UI loading/error states 可以并行。
- Unit/API tests 可以在对应 route 完成后并行补齐。
- Seedance adapter 与 FFmpeg composer 可在 provider contracts 稳定后并行。

## Phase 0：工程契约和脚手架

### Task 1：同步工程文档基线

**Description:** 更新现有工程文档，移除旧的分享链路和“单 clip 可直接 final work”说法，让 `docs/exec-plans/active/` 与最新产品规格一致。

**Acceptance criteria:**

- [x] `storycam-web-mvp-implementation-plan.md` 明确第一版不支持分享链接。
- [x] `storycam-web-mvp-implementation-plan.md` 明确 final work 必须真实合成。
- [x] `test-plan.md` 的关键路径从 save/share 改为 account save/preview。

**Verification:**

- [x] `rg -n "私密分享|分享链接|share|一个 clip 也可以是 final work" docs` 不再出现旧决策，或只出现在“未来范围/不做”上下文。

**Dependencies:** None

**Files likely touched:**

- `docs/exec-plans/active/storycam-web-mvp-implementation-plan.md`
- `docs/exec-plans/active/test-plan.md`

**Estimated scope:** S

### Task 2：补齐开发者契约文档

**Description:** 创建 Phase 0 必需的工程契约文档，使后续实现有明确边界。

**Acceptance criteria:**

- [x] 新增或更新 local dev、API contract、provider contract、job lifecycle、privacy logging 相关文档。
- [x] 文档包含 mock/real mode、env vars、route contract、job lifecycle、隐私日志规则。
- [x] 文档明确第一版 hosted Supabase，不提供分享链接。

**Verification:**

- [x] `rg -n "STORYCAM_GENERATION_MODE|GenerationJob|redaction|/api/story-world|/api/final-work" docs`

**Dependencies:** Task 1

**Files likely touched:**

- `docs/references/local-dev.md`
- `docs/generated/api-contract.md`
- `docs/generated/provider-contract.md`
- `docs/generated/job-lifecycle.md`
- `docs/generated/privacy-logging.md`
- `docs/RELIABILITY.md`
- `docs/SECURITY.md`

**Estimated scope:** M

### Task 3：Scaffold Web app

**Description:** 创建 Next.js App Router + TypeScript + Tailwind 项目骨架，并接入基本脚本。

**Acceptance criteria:**

- [x] `pnpm install` 可安装依赖。
- [x] `pnpm dev` 可启动Web app。
- [x] `pnpm lint`、`pnpm typecheck`、`pnpm test` 有脚本入口。
- [x] 首页显示 StoryCam Phase 1 shell，而不是营销页。

**Verification:**

- [x] `pnpm lint`
- [x] `pnpm typecheck`
- [x] `pnpm test`
- [x] 手动打开 `http://localhost:3000`

**Dependencies:** Task 2

**Files likely touched:**

- `package.json`
- `pnpm-lock.yaml`
- `next.config.ts`
- `tsconfig.json`
- `src/app/page.tsx`

**Estimated scope:** M

### Task 4：环境变量和启动校验

**Description:** 添加 `.env.example` 和 server-only 配置校验，确保 mock mode 默认安全，real mode 缺 secret 时 fail fast。

**Acceptance criteria:**

- [x] `.env.example` 默认 `STORYCAM_GENERATION_MODE=mock`。
- [x] mock mode 拒绝非 mock provider。
- [x] `STORYCAM_VIDEO_PROVIDER=seedance_2_0` 时必须存在 `SEEDANCE_API_KEY`。
- [x] Supabase 必需 env 包含 `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`。
- [x] OpenRouter/Vercel AI SDK 必需 env 包含 `OPENROUTER_API_KEY` 和具体模型名配置。
- [x] 配置错误输出脱敏错误，不打印 secret。

**Verification:**

- [x] `pnpm test -- --run config`
- [x] 手动设置非法 env 后 `pnpm dev` fail fast。

**Dependencies:** Task 3

**Files likely touched:**

- `.env.example`
- `src/server/config.ts`
- `src/server/config.test.ts`

**Estimated scope:** S

### Task 4A：Supabase Auth 和 Google 登录

**Description:** 接入 Supabase Auth，首选 Google 登录，并在 server route 中提供 user guard。

**Acceptance criteria:**

- [x] UI 提供 Google 登录入口。
- [x] Server route 能读取当前 Supabase user。
- [ ] 上传照片、创建 session、真实生成视频、生成 final work 必须登录。
- [ ] 未登录用户只能看样例/输入前导，不能创建真实资源。

**Verification:**

- [x] `pnpm test -- --run auth`
- [x] `pnpm test:e2e -- --grep "auth"`
- [ ] 手动用 Google OAuth 登录并刷新保持 session。

**Dependencies:** Task 3, Task 4

**Files likely touched:**

- `src/lib/supabase/client.ts`
- `src/lib/supabase/server.ts`
- `src/server/auth/requireUser.ts`
- `src/components/auth/GoogleSignInButton.tsx`
- `src/app/auth/callback/route.ts`
- `e2e/auth.spec.ts`

**Estimated scope:** M

### Checkpoint：Foundation 0

- [ ] 工程文档与产品规格一致。
- [ ] App 能启动。
- [ ] 基本 lint/typecheck/test 入口存在。
- [ ] 默认 mock mode 不会调用外部服务。
- [ ] Supabase Auth 配置完成，Google 登录可用。

## Phase 1：领域模型、持久化和隐私基础

### Task 5：定义 artifact schemas

**Description:** 用 TypeScript + schema validation 定义 StoryCam 核心 artifact 类型。

**Acceptance criteria:**

- [x] 定义 `DirectorPacket`、`ArtifactState`、`CharacterAsset`、`SceneAsset`、`CoreStoryboardGroup`、`ExpandedStoryboardCard`、`ClipPromptPacket`、`GeneratedClip`、`FinalWork`。
- [x] 每个 artifact 有 `state` 和 `version`。
- [x] schemas 能拒绝 malformed provider output。

**Verification:**

- [x] `pnpm test -- --run artifacts`
- [x] `pnpm typecheck`

**Dependencies:** Task 3

**Files likely touched:**

- `src/features/storycam/domain/artifacts.ts`
- `src/features/storycam/domain/artifactSchemas.ts`
- `src/features/storycam/domain/artifactSchemas.test.ts`

**Estimated scope:** M

### Task 6：实现时长和分组规则

**Description:** 实现计划视频长度到核心分镜组数量和 clip 时长的 deterministic rules。

**Acceptance criteria:**

- [x] 8-12 秒默认 1 组。
- [x] 10-14 秒默认 2 组。
- [x] 12-15 秒默认 3 组。
- [x] 支持根据故事密度下调数量，但不超过 3。

**Verification:**

- [x] `pnpm test -- --run duration`

**Dependencies:** Task 5

**Files likely touched:**

- `src/features/storycam/domain/durationRules.ts`
- `src/features/storycam/domain/durationRules.test.ts`

**Estimated scope:** S

### Task 7：实现 artifact version 和 stale 传播

**Description:** 当用户编辑上游 artifact 时，把下游 packet/job/final work 标记为 stale，阻止继续发送旧内容。

**Acceptance criteria:**

- [x] 编辑 `script` 会 stale storyboard、expanded cards、clip packets、clips、final work。
- [x] 编辑 character/scene asset 会 stale 下游生成物。
- [x] stale clip prompt packet 不能生成视频 job。

**Verification:**

- [x] `pnpm test -- --run stale`

**Dependencies:** Task 5

**Files likely touched:**

- `src/features/storycam/domain/stalePropagation.ts`
- `src/features/storycam/domain/stalePropagation.test.ts`

**Estimated scope:** S

### Task 8：Supabase schema、RLS 和 Storage setup

**Description:** 建立 Phase 1 Supabase schema、RLS policies 和私有 Storage buckets。

**Acceptance criteria:**

- [x] 建表：`storycam_sessions`、`storycam_artifacts`、`generation_jobs`、`media_assets`、`provider_requests`。
- [x] 每张表包含 `user_id` 并启用 RLS。
- [x] 创建私有 buckets：`storycam-uploads`、`storycam-generated`、`storycam-mock`。
- [ ] migration 可重复运行且幂等，可在 Supabase local/test project 执行。

**Verification:**

- [x] `pnpm test -- --run supabase-db`
- [ ] `pnpm storycam:seed` 能在 Supabase 中创建当前用户的 sample session。
- [ ] RLS 测试证明用户不能读取其他用户 session/artifacts/media metadata。

**Dependencies:** Task 4A, Task 5, Task 7

**Files likely touched:**

- `supabase/migrations/*.sql`
- `src/server/db/supabase.ts`
- `src/server/db/supabase.test.ts`
- `src/server/db/rls.test.ts`
- `.gitignore`
- `package.json`

**Estimated scope:** M

### Task 8A：Supabase repository layer

**Description:** 基于 Supabase Postgres 实现 session、artifact、job、media、provider request repositories，所有写操作通过显式 service 事务或受控 RPC/transaction helper 保护。

**Acceptance criteria:**

- [x] 可创建、读取、更新、soft delete session。
- [ ] Artifact 写入保留 version，不覆盖旧版本。
- [x] 删除 session 会 tombstone 关联 in-flight jobs，并 soft delete artifacts/media metadata。
- [x] Repository scope 默认按 `user_id` 查询。
- [x] Repository 不返回 service role key、长期公开 media URL 或其他敏感信息给上层 API。

**Verification:**

- [x] `pnpm test -- --run repository`
- [ ] 手动运行 `pnpm storycam:seed` 后能在 Supabase 中看到 session/artifact/job/media metadata。

**Dependencies:** Task 8

**Files likely touched:**

- `src/server/storycam/sessionRepository.ts`
- `src/server/storycam/artifactRepository.ts`
- `src/server/storycam/generationJobRepository.ts`
- `src/server/storycam/mediaAssetRepository.ts`
- `src/server/storycam/providerRequestRepository.ts`
- `src/server/storycam/*Repository.test.ts`

**Estimated scope:** M

### Task 9：Supabase Storage 和照片上传约束

**Description:** 实现上传照片和媒体文件的 Supabase Storage 存储、文件类型校验、大小限制、signed URL 和删除语义。

**Acceptance criteria:**

- [ ] 支持 Phase 1 上传人物、宠物、场景或记忆照片。
- [ ] 只允许安全图片类型和有限大小。
- [ ] 上传文件写入 `storycam-uploads` 私有 bucket。
- [ ] 生成 clip/final work 写入 `storycam-generated` 私有 bucket。
- [ ] 预览使用短期 signed URL 或 authenticated proxy。
- [ ] 删除 session 会删除关联 Supabase Storage objects。

**Verification:**

- [ ] `pnpm test -- --run media-store`
- [ ] `pnpm test -- --run storage-policy`

**Dependencies:** Task 8A

**Files likely touched:**

- `src/server/storycam/mediaStore.ts`
- `src/server/storycam/mediaStore.test.ts`
- `src/server/storycam/storageService.ts`
- `src/server/storycam/storageService.test.ts`
- `src/features/storycam/domain/uploadedPhoto.ts`

**Estimated scope:** M

### Task 10：隐私脱敏和结构化日志

**Description:** 实现 redaction utilities 和安全日志 wrapper，保证私人输入、完整 prompt、secret 不进入 logs/errors。

**Acceptance criteria:**

- [ ] 原始 input/script/prompt packet 被 redacted。
- [ ] provider error 只输出 `errorCode` 和 `redactedError`。
- [ ] session/idempotency 只允许 hash。

**Verification:**

- [ ] `pnpm test -- --run redaction`
- [ ] `pnpm test -- --run privacy`

**Dependencies:** Task 5

**Files likely touched:**

- `src/lib/privacy/redact.ts`
- `src/lib/privacy/redact.test.ts`
- `src/server/logging/storycamLogger.ts`

**Estimated scope:** S

### Checkpoint：Domain Foundation

- [ ] Artifact schemas、version、stale propagation 全部有 unit tests。
- [ ] Supabase session/media store 能增删改查。
- [ ] RLS 和 Storage policy 测试通过。
- [ ] 隐私脱敏测试通过。
- [ ] 不存在真实 provider 调用。

## Phase 2：Provider contract 和 mock 全链路

### Task 11：定义 provider interfaces

**Description:** 定义文本、多模态、图像、视频和 final work composer 的窄接口。

**Acceptance criteria:**

- [ ] UI 不直接 import provider implementation。
- [ ] Provider result 有统一 success/error shape。
- [ ] Provider error 进入 redaction pipeline。

**Verification:**

- [ ] `pnpm test -- --run providers`
- [ ] `pnpm typecheck`

**Dependencies:** Task 5, Task 10

**Files likely touched:**

- `src/lib/providers/types.ts`
- `src/lib/providers/providerErrors.ts`
- `src/lib/providers/providerErrors.test.ts`

**Estimated scope:** S

### Task 12：Mock story world provider

**Description:** 实现 deterministic mock provider，根据输入和照片引用生成短剧本、人物资产、场景资产。

**Acceptance criteria:**

- [ ] `暗恋韩剧雨夜` 返回稳定样例。
- [ ] 上传照片引用会出现在资产 reference 中，但不泄露原始路径到 logs。
- [ ] malformed mock fixture 会被 schema 拒绝。

**Verification:**

- [ ] `pnpm test -- --run mock-story-world`

**Dependencies:** Task 11

**Files likely touched:**

- `src/lib/providers/mock/storyWorldProvider.ts`
- `src/lib/providers/mock/fixtures/storyWorld.ts`
- `src/lib/providers/mock/storyWorldProvider.test.ts`

**Estimated scope:** S

### Task 13：Mock storyboard 和 expansion providers

**Description:** 实现分镜脚本、核心分镜组和扩展分镜卡 mock provider。

**Acceptance criteria:**

- [ ] 根据计划视频长度输出 1-3 组。
- [ ] 每组包含 title、story purpose、duration、scene、characters。
- [ ] 扩展默认生成 3 张卡，最多 8 张。

**Verification:**

- [ ] `pnpm test -- --run mock-storyboard`

**Dependencies:** Task 6, Task 11, Task 12

**Files likely touched:**

- `src/lib/providers/mock/storyboardProvider.ts`
- `src/lib/providers/mock/fixtures/storyboards.ts`
- `src/lib/providers/mock/storyboardProvider.test.ts`

**Estimated scope:** M

### Task 14：Mock video provider

**Description:** 实现 mock video generation，把 sample clip 写入 Supabase Storage 或 dev mock bucket，并模拟 queued/running/succeeded/failed。

**Acceptance criteria:**

- [ ] mock mode 不调用外部服务。
- [ ] 可配置 success、timeout、policy refusal、provider error。
- [ ] 返回 playable Supabase Storage media URL。
- [ ] mock media metadata 写入 `media_assets`。

**Verification:**

- [ ] `pnpm test -- --run mock-video`

**Dependencies:** Task 9, Task 11

**Files likely touched:**

- `src/lib/providers/mock/videoProvider.ts`
- `src/lib/providers/mock/videoProvider.test.ts`
- `src/lib/providers/mock/fixtures/media/`

**Estimated scope:** M

### Task 15：FFmpeg final work composer

**Description:** 实现 `FinalWorkComposer`，把 1-3 个 clips 合成为 final video，并上传到 Supabase Storage。

**Acceptance criteria:**

- [ ] 1 个 clip 也生成新的 `final_work` 文件。
- [ ] 2-3 个 clips 可按顺序 concat。
- [ ] 输出文件写入 `storycam-generated` bucket。
- [ ] final work metadata 写入 `storycam_artifacts` 和 `media_assets`。
- [ ] 缺 FFmpeg 时返回可读、脱敏的配置错误。

**Verification:**

- [ ] `pnpm test -- --run final-work`
- [ ] 手动用 mock clip 生成 final work，通过 signed URL 播放。

**Dependencies:** Task 9, Task 11, Task 14

**Files likely touched:**

- `src/lib/providers/finalWork/ffmpegComposer.ts`
- `src/lib/providers/finalWork/ffmpegComposer.test.ts`
- `src/server/storycam/finalWorkService.ts`

**Estimated scope:** M

### Checkpoint：Mock Generation

- [ ] mock mode 能生成 story world、storyboard、expansion、mock clip、final work。
- [ ] final work 是真实视频文件并已上传 Supabase Storage，不是文案。
- [ ] 无外部 provider 调用。

## Phase 3：API routes 和 job lifecycle

### Task 16：Story world route

**Description:** 实现 `/api/story-world`，接收文本、轻导演选择和照片引用，返回 story world artifacts。

**Acceptance criteria:**

- [ ] 空输入/过长输入返回 redacted validation error。
- [ ] mock mode 生成 script/person/scene。
- [ ] 返回 artifact versions。

**Verification:**

- [ ] `pnpm test:api -- --run story-world`

**Dependencies:** Task 8A, Task 9, Task 12

**Files likely touched:**

- `src/app/api/story-world/route.ts`
- `src/server/storycam/storyWorldService.ts`
- `tests/api/storyWorld.test.ts`

**Estimated scope:** M

### Task 17：Photo upload route

**Description:** 实现照片上传 route，把文件保存到 Supabase Storage media store 并返回 `uploaded_photo_refs[]`。

**Acceptance criteria:**

- [ ] 支持安全图片类型。
- [ ] 拒绝超大文件和非图片文件。
- [ ] 返回的 ref 可被 story-world route 使用。

**Verification:**

- [ ] `pnpm test:api -- --run upload`

**Dependencies:** Task 9

**Files likely touched:**

- `src/app/api/uploads/route.ts`
- `src/server/storycam/uploadService.ts`
- `tests/api/upload.test.ts`

**Estimated scope:** S

### Task 18：Storyboard route

**Description:** 实现 `/api/storyboard`，要求已确认 story world，再生成 storyboard script 和 core groups。

**Acceptance criteria:**

- [ ] 未确认 story world 不能生成 storyboard。
- [ ] 根据计划视频长度自动生成 1-3 组。
- [ ] 返回 core groups 和 duration plan。

**Verification:**

- [ ] `pnpm test:api -- --run storyboard`

**Dependencies:** Task 13, Task 16

**Files likely touched:**

- `src/app/api/storyboard/route.ts`
- `src/server/storycam/storyboardService.ts`
- `tests/api/storyboard.test.ts`

**Estimated scope:** M

### Task 19：Expansion route

**Description:** 实现 `/api/storyboard-groups/:id/expand`，为选中核心组生成或更新扩展卡。

**Acceptance criteria:**

- [ ] 默认 3 张扩展卡。
- [ ] 最多 8 张。
- [ ] 扩展卡不会创建 video job。

**Verification:**

- [ ] `pnpm test:api -- --run expansion`

**Dependencies:** Task 13, Task 18

**Files likely touched:**

- `src/app/api/storyboard-groups/[id]/expand/route.ts`
- `src/server/storycam/expansionService.ts`
- `tests/api/expansion.test.ts`

**Estimated scope:** M

### Task 20：Clip prompt packet service

**Description:** 实现 packet 组装和版本校验；只生成一句话 provider-send confirmation 给前台。

**Acceptance criteria:**

- [ ] packet 记录 input artifact versions。
- [ ] stale packet 不能提交视频 job。
- [ ] response 不包含完整 prompt packet。

**Verification:**

- [ ] `pnpm test -- --run clip-packet`

**Dependencies:** Task 7, Task 18, Task 19

**Files likely touched:**

- `src/server/storycam/clipPromptPacketService.ts`
- `src/server/storycam/clipPromptPacketService.test.ts`
- `src/features/storycam/domain/clipPromptPacket.ts`

**Estimated scope:** S

### Task 21：GenerationJob model 和 repository

**Description:** 实现独立 job model，支持状态流转、attempts、idempotency、timeout、cancel/tombstone。

**Acceptance criteria:**

- [ ] duplicate idempotency key 返回已有 job。
- [ ] cancel_requested 可进入 canceled 或 tombstone。
- [ ] late result 不会覆盖 tombstoned job。

**Verification:**

- [ ] `pnpm test -- --run generation-job`

**Dependencies:** Task 8A, Task 10

**Files likely touched:**

- `src/lib/jobs/generationJob.ts`
- `src/server/storycam/generationJobRepository.ts`
- `src/lib/jobs/generationJob.test.ts`

**Estimated scope:** M

### Task 22：Generate clip route 和 job polling routes

**Description:** 实现视频 job 创建、查询、取消 API。

**Acceptance criteria:**

- [ ] `/api/storyboard-groups/:id/generate-clip` 创建 job。
- [ ] `/api/generation-jobs/:id` 返回状态。
- [ ] `/api/generation-jobs/:id/cancel` tombstone/cancel job。

**Verification:**

- [ ] `pnpm test:api -- --run generation-jobs`

**Dependencies:** Task 14, Task 20, Task 21

**Files likely touched:**

- `src/app/api/storyboard-groups/[id]/generate-clip/route.ts`
- `src/app/api/generation-jobs/[id]/route.ts`
- `src/app/api/generation-jobs/[id]/cancel/route.ts`
- `tests/api/generationJobs.test.ts`

**Estimated scope:** M

### Task 23：Stitch suggestion 和 final work routes

**Description:** 实现 stitch suggestion 和 `/api/final-work`，用 FFmpeg composer 生成 final work。

**Acceptance criteria:**

- [ ] 没有 confirmed clip 时不能生成 final work。
- [ ] 1 个 clip 也生成新的 final work 文件。
- [ ] final work 只支持账号内预览/保存，不生成分享链接。

**Verification:**

- [ ] `pnpm test:api -- --run final-work`
- [ ] 手动播放 final work。

**Dependencies:** Task 15, Task 22

**Files likely touched:**

- `src/app/api/stitch-suggestion/route.ts`
- `src/app/api/final-work/route.ts`
- `src/server/storycam/finalWorkService.ts`
- `tests/api/finalWork.test.ts`

**Estimated scope:** M

### Checkpoint：API Mock E2E

- [ ] API happy path 可从 story-world 跑到 final-work。
- [ ] Duplicate submit、cancel、timeout、stale packet 有测试。
- [ ] final work 是云端可预览视频文件。

## Phase 4：UI 纵向切片

### Task 24：StoryCam app shell

**Description:** 实现 Web-first StoryCam UI shell，包含输入区、主画布、状态侧栏、底部片段/作品区。

**Acceptance criteria:**

- [ ] 首屏是可用创作界面，不是 landing page。
- [ ] 保留宠物、小说角色、情绪短片入口，但标注暂不完整支持。
- [ ] 桌面 Web 体验优先，移动端可用但不是 mobile-only。

**Verification:**

- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] 手动检查 `http://localhost:3000`

**Dependencies:** Task 3

**Files likely touched:**

- `src/app/page.tsx`
- `src/components/storycam/StoryCamShell.tsx`
- `src/components/storycam/TemplateRail.tsx`
- `src/app/globals.css`

**Estimated scope:** M

### Task 25：Input + photo upload slice

**Description:** 实现想法输入、轻导演 chips、照片上传和 starter example。

**Acceptance criteria:**

- [ ] 用户可输入文本。
- [ ] 用户可上传照片并看到账号内预览。
- [ ] 点击 `生成故事雏形` 调用 story-world route。

**Verification:**

- [ ] `pnpm test:e2e -- --grep "story input"`
- [ ] 手动上传一张图片。

**Dependencies:** Task 16, Task 17, Task 24

**Files likely touched:**

- `src/components/storycam/IdeaInputPanel.tsx`
- `src/components/storycam/PhotoUpload.tsx`
- `src/features/storycam/client/storycamApi.ts`
- `e2e/storycam-input.spec.ts`

**Estimated scope:** M

### Task 26：Story world confirmation slice

**Description:** 展示短剧本、人物资产、场景资产，支持确认、编辑、重新生成、删除。

**Acceptance criteria:**

- [ ] 故事世界默认像短剧本。
- [ ] 用户必须确认后才能生成 storyboard。
- [ ] 编辑 story world 会 stale 下游 artifact。

**Verification:**

- [ ] `pnpm test:e2e -- --grep "story world"`

**Dependencies:** Task 16, Task 25

**Files likely touched:**

- `src/components/storycam/StoryWorldReview.tsx`
- `src/components/storycam/AssetCard.tsx`
- `src/features/storycam/client/storycamState.ts`
- `e2e/storycam-story-world.spec.ts`

**Estimated scope:** M

### Task 27：Core storyboard groups slice

**Description:** 展示 1-3 个核心分镜组，按计划视频长度自动分组，并允许进入扩展或直接生成片段。

**Acceptance criteria:**

- [ ] UI 清楚表达“一个核心分镜组生成一个片段”。
- [ ] 分组数量由计划视频长度自动决定。
- [ ] 不暗示扩展卡会单独生成视频。

**Verification:**

- [ ] `pnpm test:e2e -- --grep "core storyboard"`

**Dependencies:** Task 18, Task 26

**Files likely touched:**

- `src/components/storycam/CoreStoryboardGroups.tsx`
- `src/components/storycam/CoreStoryboardCard.tsx`
- `src/features/storycam/client/storycamState.ts`
- `e2e/storycam-storyboard.spec.ts`

**Estimated scope:** M

### Task 28：Expansion canvas slice

**Description:** 实现中心核心组 + 周边扩展卡的画布视图，支持默认 3 卡和最多 8 卡。

**Acceptance criteria:**

- [ ] 中心保持选中核心组。
- [ ] loading/waiting slots 不造成布局跳动。
- [ ] 用户可跳过扩展直接生成片段。

**Verification:**

- [ ] `pnpm test:e2e -- --grep "expansion"`
- [ ] Visual QA desktop/mobile。

**Dependencies:** Task 19, Task 27

**Files likely touched:**

- `src/components/storycam/ExpansionCanvas.tsx`
- `src/components/storycam/ExpandedStoryboardCard.tsx`
- `src/features/storycam/client/storycamState.ts`
- `e2e/storycam-expansion.spec.ts`

**Estimated scope:** M

### Task 29：Provider-send confirmation + generation UI

**Description:** 实现一句话确认、job 创建、polling、cancel、timeout、failed、policy refusal 状态。

**Acceptance criteria:**

- [ ] 未确认前不创建真实视频 job。
- [ ] 只展示一句话 confirmation，不展示完整 packet。
- [ ] 支持 cancel 和 retry。

**Verification:**

- [ ] `pnpm test:e2e -- --grep "generate clip"`

**Dependencies:** Task 22, Task 28

**Files likely touched:**

- `src/components/storycam/ProviderSendConfirm.tsx`
- `src/components/storycam/ClipGenerationStatus.tsx`
- `src/features/storycam/client/jobPolling.ts`
- `e2e/storycam-generate-clip.spec.ts`

**Estimated scope:** M

### Task 30：Clip review + final work UI

**Description:** 展示 generated clips、重拍路径、stitch suggestion、final work 生成和账号内预览/保存。

**Acceptance criteria:**

- [ ] 用户能重拍不满意片段。
- [ ] 点击生成最终作品会调用 final-work route。
- [ ] 结果页只提供账号内预览/保存，不出现分享入口。

**Verification:**

- [ ] `pnpm test:e2e -- --grep "final work"`
- [ ] 手动播放 final work。

**Dependencies:** Task 23, Task 29

**Files likely touched:**

- `src/components/storycam/ClipReview.tsx`
- `src/components/storycam/FinalWorkPanel.tsx`
- `src/features/storycam/client/storycamApi.ts`
- `e2e/storycam-final-work.spec.ts`

**Estimated scope:** M

### Checkpoint：UI Mock E2E

- [ ] mock mode 下，从输入/照片到 final work 账号内预览完整跑通。
- [ ] 不出现分享入口。
- [ ] 不出现 Shanyin-style、prompt packet、模型参数等用户不该看到的术语。
- [ ] UI 在桌面 Web 下可读、无明显重叠。

## Phase 5：Real provider spike

### Task 31：Vercel AI SDK + OpenRouter text/multimodal adapter

**Description:** 使用 Vercel AI SDK 接入 OpenRouter text/multimodal models，用于故事世界、分镜和照片理解真实生成。具体模型名通过 env 配置，不写死在 UI。

**Acceptance criteria:**

- [ ] `STORYCAM_TEXT_PROVIDER=openrouter` 和 `STORYCAM_MULTIMODAL_PROVIDER=openrouter` 可配置。
- [ ] `OPENROUTER_API_KEY` 只存在服务端。
- [ ] 模型名通过 `OPENROUTER_TEXT_MODEL`、`OPENROUTER_MULTIMODAL_MODEL` 配置。
- [ ] 通过 Vercel AI SDK 进行 structured output 或 schema-validated output。
- [ ] Provider 输出经过 schema validation。
- [ ] malformed JSON 有重试/错误归一化。

**Verification:**

- [ ] `pnpm test -- --run openrouter-text-provider`
- [ ] secret-gated manual smoke test。

**Dependencies:** Task 11, Task 16, Task 18

**Files likely touched:**

- `src/lib/providers/openrouter/textProvider.ts`
- `src/lib/providers/openrouter/multimodalProvider.ts`
- `src/lib/providers/openrouter/textProvider.test.ts`
- `src/server/ai/vercelAiClient.ts`
- `docs/generated/provider-contract.md`

**Estimated scope:** M

### Task 31A：OpenRouter image provider adapter

**Description:** 使用 Vercel AI SDK + OpenRouter 中可用的图像模型生成核心分镜代表图，并将图片写入 Supabase Storage。

**Acceptance criteria:**

- [ ] `STORYCAM_IMAGE_PROVIDER=openrouter` 可配置。
- [ ] 模型名通过 `OPENROUTER_IMAGE_MODEL` 配置。
- [ ] 核心分镜代表图真实生成并存入 `storycam-generated` bucket。
- [ ] 生成失败时可降级为 placeholder，不阻塞视频生成。

**Verification:**

- [ ] `pnpm test -- --run openrouter-image-provider`
- [ ] secret-gated smoke：生成一张核心分镜代表图并生成 signed preview URL。

**Dependencies:** Task 11, Task 9, Task 18, Task 31

**Files likely touched:**

- `src/lib/providers/openrouter/imageProvider.ts`
- `src/lib/providers/openrouter/imageProvider.test.ts`
- `src/server/storycam/storyboardImageService.ts`
- `docs/generated/provider-contract.md`

**Estimated scope:** M

### Task 32：Seedance 2.0 video provider adapter

**Description:** 实现 `VideoGenerationProvider=seedance_2_0`，把 clip prompt packet 转为真实视频 provider 请求。

**Acceptance criteria:**

- [ ] 只在 `STORYCAM_GENERATION_MODE=real` 且 provider 配置正确时启用。
- [ ] 支持 provider request id、polling 或回调结果归一化。
- [ ] 支持 timeout、quota、policy refusal、provider error 的 redacted mapping。

**Verification:**

- [ ] `pnpm test -- --run seedance`
- [ ] secret-gated smoke：生成一个短 clip。

**Dependencies:** Task 20, Task 21, Task 22, Task 9

**Files likely touched:**

- `src/lib/providers/seedance/videoProvider.ts`
- `src/lib/providers/seedance/videoProvider.test.ts`
- `src/server/storycam/videoGenerationService.ts`
- `docs/generated/provider-contract.md`

**Estimated scope:** M

### Task 33：Real clip to final work smoke path

**Description:** 把真实 Seedance clip 接入 final work composer，验证真实媒体文件能合成、上传 Supabase Storage，并通过账号内 signed URL 预览。

**Acceptance criteria:**

- [ ] 一个真实 clip 能生成 final work 并写入 `storycam-generated` bucket。
- [ ] final work metadata 写入 Supabase Postgres。
- [ ] 登录用户可以通过短期 signed URL 预览自己的 final work。
- [ ] 失败时第一救援路径是重拍。
- [ ] 不生成分享链接。

**Verification:**

- [ ] secret-gated smoke：real clip -> final work。
- [ ] `pnpm test:e2e -- --grep "mock final work"` 仍在 mock mode 通过。

**Dependencies:** Task 15, Task 30, Task 32

**Files likely touched:**

- `src/server/storycam/finalWorkService.ts`
- `src/server/storycam/videoGenerationService.ts`
- `docs/exec-plans/active/test-plan.md`

**Estimated scope:** S

### Checkpoint：Real Magic

- [ ] mock mode 默认全通过。
- [ ] secret-gated real video smoke 能生成 clip。
- [ ] real clip 能合成 final work。
- [ ] provider errors/logs 脱敏。

## Phase 6：测试、QA 和收口

### Task 34：补齐 API 和 unit coverage

**Description:** 覆盖核心 domain、provider、API、privacy、job lifecycle。

**Acceptance criteria:**

- [ ] duration/group count 有 unit tests。
- [ ] stale artifact、idempotency、late-result discard 有 tests。
- [ ] privacy redaction 有 regression tests。

**Verification:**

- [ ] `pnpm test`
- [ ] `pnpm test:api`

**Dependencies:** Task 23, Task 32

**Files likely touched:**

- `tests/api/*.test.ts`
- `src/**/*.test.ts`
- `docs/exec-plans/active/test-plan.md`

**Estimated scope:** M

### Task 35：E2E happy path 和救援路径

**Description:** 实现 Playwright E2E，覆盖 mock happy path、重拍、删除、stale artifact、照片上传。

**Acceptance criteria:**

- [ ] happy path：input/photo -> story world -> storyboard -> expansion -> clip -> final work。
- [ ] retry path：mock video failure -> 重拍 -> success。
- [ ] deletion path：running job -> delete -> late result discarded。

**Verification:**

- [ ] `pnpm test:e2e`

**Dependencies:** Task 30, Task 34

**Files likely touched:**

- `e2e/storycam-happy-path.spec.ts`
- `e2e/storycam-retry.spec.ts`
- `e2e/storycam-deletion.spec.ts`
- `e2e/storycam-stale.spec.ts`

**Estimated scope:** M

### Task 36：Visual QA 和可用性修正

**Description:** 对桌面和平板/移动窄屏做视觉 QA，修正文本溢出、层级不清、按钮状态和 loading/error UI。

**Acceptance criteria:**

- [ ] 桌面 Web 主路径无重叠、无文本溢出。
- [ ] 上传、生成、取消、失败、重拍、final work 状态都可见。
- [ ] 视觉语气符合私人小剧场，不像工业生产后台。

**Verification:**

- [ ] `pnpm qa:visual`
- [ ] 手动截图对照 `docs/design-docs/storycam-ui-design.md`

**Dependencies:** Task 35

**Files likely touched:**

- `src/components/storycam/*.tsx`
- `src/app/globals.css`
- `docs/exec-plans/active/test-plan.md`

**Estimated scope:** M

### Task 37：文档和 README 收口

**Description:** 将实现后的命令、provider mode、测试结果、已知限制同步回 `docs/`。

**Acceptance criteria:**

- [ ] `docs/README.md` 索引包含本详细计划和新增工程文档。
- [ ] `local-dev.md` 可让新开发者 10 分钟内跑 mock flow。
- [ ] `providers.md` 明确 real provider smoke test 是 opt-in。

**Verification:**

- [ ] 按 `docs/references/local-dev.md` 从 clean env 跑通 mock flow。
- [ ] `rg -n "分享链接|私密分享|Shanyin-style shot data" docs` 不出现错误产品承诺。

**Dependencies:** Task 36

**Files likely touched:**

- `docs/README.md`
- `docs/references/local-dev.md`
- `docs/generated/provider-contract.md`
- `docs/exec-plans/active/test-plan.md`

**Estimated scope:** S

### Checkpoint：MVP Ready

- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm test:api`
- [ ] `pnpm test:e2e`
- [ ] `pnpm qa:visual`
- [ ] mock mode 全流程可跑。
- [ ] real Seedance smoke test opt-in 可跑。
- [ ] final work 是真实视频文件并存入 Supabase Storage。
- [ ] 第一版没有分享入口。
- [ ] 文档和产品规格一致。

## 风险与缓解

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| Seedance 2.0 接口、参数或返回格式不稳定 | 高 | 先用 provider adapter 和 mock contract 锁住内部形态；真实 smoke test secret-gated；provider error 归一化。 |
| 文本/多模态模型输出 JSON 不稳定 | 中 | 使用 schema validation、repair/retry、mock fixtures；真实 provider 输出不直接进入 UI。 |
| OpenRouter 模型能力或价格波动 | 中 | 模型名通过 env 配置；provider adapter 支持替换模型；mock/fixtures 保证开发可运行。 |
| Supabase RLS 或 Storage policy 配错导致越权 | 高 | RLS tests、跨用户访问 tests、Storage signed URL tests 必须进入默认测试。 |
| 部署环境 FFmpeg 或 composer 不可用 | 中 | 启动校验明确提示；文档写部署依赖；composer behind interface，未来可替换 Remotion/云服务。 |
| 照片上传引入隐私和文件安全风险 | 高 | 限制类型/大小；Supabase Storage 私有 bucket；删除 cascade；不记录照片路径到 logs；不做分享链接。 |
| Job late result 覆盖删除/取消状态 | 高 | GenerationJob tombstone 和 late-result discard 必须有 unit/API tests。 |
| UI 变成专业工作台 | 中 | 文案和组件验收禁止 Shanyin-style、prompt packet、模型参数；对照设计 brief 做 visual QA。 |
| 任务范围膨胀到完整平台 | 高 | 保留入口但不支持完整宠物/小说/情绪生成；支付/分享/公共 feed 全部 ask first 或 out of scope。 |

## 开放问题

- OpenRouter 中具体选择哪些 text/multimodal/image 模型，分别用于故事世界、照片理解、分镜和核心分镜图？
- 扩展分镜卡图片是否 Phase 1 真实生成，还是只生成文本卡 + placeholder？
- 计划视频长度在 UI 中如何选择：默认 8-12 秒，还是给“短一点/完整一点”的轻量选择？
- FFmpeg 是否作为项目依赖安装，还是要求本机预装并在 local-dev 中说明？
- final work 的账号内预览体验使用 signed URL、authenticated proxy，还是二者都支持？

## 人工评审清单

- [ ] 每个任务都有验收标准。
- [ ] 每个任务都有验证步骤。
- [ ] 任务依赖顺序清楚。
- [ ] 单个任务没有刻意跨越太多子系统。
- [ ] 每 2-4 个任务有 checkpoint。
- [ ] 产品最新决策已覆盖：照片上传、不分享、真实 final work、长度自动分组、重拍优先。
