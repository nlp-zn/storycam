# Completion Note

Status: completed historical test plan.

This plan has been superseded by the current Vitest, API, Playwright E2E, visual QA, and progressive gate scripts. Use `docs/PR_REVIEW.md`, `docs/references/local-dev.md`, and the `scripts/check-*.sh` gates for current verification.

# StoryCam 测试计划

日期：2026-04-25  

## 影响页面与路由

- `/` 或 `/storycam`：Phase 1 引导式私人记忆预告片路径。
- `/auth/callback`：Supabase Google OAuth 回调。
- `/api/uploads`：上传照片并返回 Supabase Storage media refs。
- `/api/story-world`：把用户输入、照片和轻导演选择转为紧凑故事、人物、地点 artifacts。
- `/api/storyboard`：把已确认故事世界转为分镜脚本和按计划视频长度自动判断的核心分镜组；前端可延后第 1 帧代表图提交，让分镜脚本先展示。
- `/api/storyboard-groups/:id/expand`：生成选中核心分镜组的 3-8 张扩展分镜卡。
- `/api/storyboard-groups/:id/generate-clip`：创建视频生成 job，并返回 job id。
- `/api/generation-jobs/:id`：job 轮询和恢复状态。
- `/api/generation-jobs/:id/cancel`：取消和 tombstone 路径。
- `/api/stitch-suggestion`：为用户确认的 clips 生成拼接建议。
- `/api/final-work`：真实合成 final work；即使只有一个 clip，也必须产出最终视频文件并写入 Supabase Storage。

## 必须支持的命令

实现被认为“可测试”前，必须接好这些命令：

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:api
pnpm test:e2e
pnpm qa:visual
```

CI 默认使用 mock mode。真实 provider smoke test 必须 opt-in、secret-gated，并且不进入默认 PR 检查。

## 关键交互验证

- Google 登录、刷新后保持 session、退出登录。
- 私人时刻输入，以及情绪 chips。
- 照片上传、账号内预览、文件类型/大小错误。
- 故事世界确认：inline edit、regenerate、lock。
- 核心分镜确认：脚本先返回时必须先展示脚本，中心主图继续局部等待/生成。
- 视频 provider 边界：直接进入片段生成，不展示完整 prompt packet。
- 视频 job：enqueue、polling、timeout、retry、cancel、success reveal。
- 视频 job queued/running 时删除故事。
- clip reveal 后的账号内保存/预览、继续、重拍。
- final work 真实合成和账号内 signed URL 播放。
- 桌面端 optional expansion canvas，以及移动端 focus-mode stack/carousel。

## 边界情况

- 空输入、太短、太长、policy-sensitive input。
- 用户故事文本中的 prompt injection。
- 模型返回 malformed JSON 或未知字段。
- Supabase migration 重复执行、RLS policy 错误、Storage bucket policy 错误、数据库写入失败。
- 故事生成成功，但图片/分镜失败。
- 双击生成按钮只创建一个付费 provider job，依赖 idempotency。
- 生成中刷新/离开页面，再回到同一个 job。
- 两个 tab 编辑同一个 session，产生 stale artifact versions。
- Provider timeout、quota exceeded、policy refusal、删除后的 late result。
- logs、analytics、error payloads、debug snapshots、provider metadata 不能包含原始私人输入、完整 prompt packets、provider keys、signed media secrets。
- 第一版不应生成分享链接，也不应出现私密分享入口。
- 未登录用户不能上传照片、创建真实 session、发送视频生成或生成 final work。
- 用户不能读取其他用户的 session/artifacts/jobs/media metadata。

## 关键路径

- 单模板 happy path：Google login -> input/photo -> story world -> 1 core group -> optional expansion -> clip generation -> final work -> account save/preview。
- Retry path：video timeout -> 展示 retry -> 复用 prompt packet/idempotency guard -> success。
- Deletion path：running job -> delete -> tombstone -> discard late provider result。
- Stale artifact path：clip packet 创建后编辑 story world -> old packet 被阻止，直到重新确认。

## 测试重点

- Supabase schema/migration/RLS/repository transaction tests。
- Supabase Auth user guard 和 Google login callback tests。
- duration calculation 和 group count rules 的 unit tests。
- photo upload validation、Supabase Storage signed URL 和 deletion tests。
- DirectorPacket / clip prompt packet 构造测试。
- mock provider output 和 error normalization 测试。
- 每个 generation route 在 mock mode 下的 integration tests。
- final work composer 输出真实视频文件并上传 Supabase Storage 的 tests。
- Seedance 成功产物 `content.video_url` 下载、私有存储、generated clip artifact、job succeeded、final work signed preview 的 server tests。
- UI component 的 loading、empty、error、success states。
- E2E happy path 和 short path。
- duplicate submit、resume、deletion、stale artifact 的 E2E/integration tests。
- prompt injection 和隐私日志回归测试。
- desktop/mobile visual QA，对照 Stitch 结构但不照搬 cyber tone；默认 `pnpm qa:visual` 覆盖主页桌面/手机非空、横向溢出检查，以及上传、扩展画布、取消、失败、重试、clip review、final work 的可见状态。
