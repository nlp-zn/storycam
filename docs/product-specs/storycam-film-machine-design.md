# 规格：StoryCam Web 小剧场相机

日期：2026-04-26
状态：产品规格 v0.2，进入实现计划前待人工评审
主模型假设：第一轮真实视频生成 spike 使用 Seedance 2.0

## 当前规格假设

以下是本规格默认成立的假设。如果有任何一条不对，需要先修正，再进入实现计划。

1. StoryCam 第一版是 Web 产品，优先适配桌面和平板 Web，不做移动端-only App。
2. StoryCam 面向普通个人表达用户，不面向 MCN、短剧公司或工业化生产团队。
3. MVP 必须至少生成一个真实视频片段。只有剧本、图片或分镜图，不足以证明产品魔法。
4. canonical MVP 创作闭环必须保留：输入想法 -> 生成剧本、人物资产、场景资产 -> 生成角色/场景资产图并由用户确认 story-world -> 基于剧本和资产生成 1 份 9 帧分镜脚本和 1 个核心分镜组 -> 基于资产图和第 1 帧脚本生成核心分镜图 -> 可选点击中心主图扩展 8 帧 -> 基于 9 帧脚本和已生成分镜图组装 Seedance 2.0 clip prompt packet 并生成一个视频片段 -> 用户确认片段 -> 系统建议拼接 -> 最终作品。
5. 核心分镜组是视频生成的产品单位。扩展分镜卡默认只是父分镜组的指导材料，不会每张卡单独触发一次视频调用。
6. Phase 1 可以比完整产品更窄：一条引导式私人记忆预告片路径、一个确认的核心分镜组、一个真实片段，然后保存到账号、预览或继续拍。
7. Shanyin Director Master 是内部导演脑参考，不把专业工作流直接暴露给普通用户。
8. 第一版实现需要同时支持 mock mode 和 real provider mode。mock mode 验证流程跑通，real mode 验证产品魔法。

## 目标

StoryCam 是一个 Web 端私人小剧场相机。它帮助普通用户把一个私人想法、情绪、回忆、关系或角色幻想，变成一段足够个人化、值得保存或分享的电影感短作品。

产品赌注不是“AI 可以生成更多短剧”。真正的赌注是：

> 如果产品能温柔地把普通人的模糊情绪整理成故事、人物、地点、镜头，并最终拍成真实短视频，普通用户会愿意输入私人想法，并觉得“这是我的故事”。

第一版成功体验应该是：

1. 用户输入一个模糊的私人念头。
2. StoryCam 先把它变成可读的故事世界。
3. 用户能认出故事、人和地点。
4. StoryCam 提出少量有电影感的核心时刻。
5. 用户可以展开其中一个时刻，看它会被怎样拍。
6. StoryCam 从确认后的时刻生成一个真实视频片段。
7. 系统建议如何把这个片段或多个片段拼成 10-15 秒最终作品。

## SPEC 与 PLAN 分工

本文件是产品规格，负责定义“要生成什么、用户如何确认、每个 artifact 的边界、哪些行为必须成立”。它应该写清楚生成链路的产品级方法，但不把所有工程实现细节提前固化。

写在本 SPEC 里：

- 剧本、人物资产、场景资产、分镜脚本、核心分镜组、扩展分镜卡、clip prompt packet、generated clip、final work 的定义和验收标准。
- 每个生成阶段的输入、输出、用户确认点和失败救援路径。
- 哪些阶段需要文本理解、多模态理解、图像生成、视频生成或视频合成能力。
- Seedance 2.0 作为第一版真实视频片段生成的主假设。
- 用户可见语言、隐私边界、provider-send confirmation、MVP 单核心分镜组规则。

留到 PLAN / 工程文档里：

- 具体调用哪一个文本模型、图像模型、照片理解模型、视频合成工具或存储服务。
- Prompt 模板、JSON schema、provider API 参数、重试策略、队列实现、回调/轮询实现。
- 前端框架、后端框架、Supabase 数据库/存储/Auth、对象存储、job runner、部署方案的最终选择。
- 文件目录、route handler、server action、provider adapter、测试文件的具体拆分。

当前默认方向是：产品规格先锁定 StoryCam 的生成阶段和体验边界；PLAN 再把它翻译成技术栈、模型编排、任务拆分和验证检查点。

## 目标用户

优先用户：

- 喜欢写脑洞、回忆、CP、同人、小说角色、宠物故事、情绪片段的人。
- 喜欢 AI 写真、AI 相册、AI 语音、AI 头像、短分享内容的泛 AI 娱乐用户。
- 想要“把我的故事拍成一段小电影”的普通用户，而不是专业生产后台用户。

用户动机：

- “我想看我的小说角色动起来。”
- “我想把一段私人关系拍成小短片。”
- “我想把今天的心情变成电影感回忆。”
- “我想做一个宠物冒险、童年回忆或幻想场景，而且要像我的。”

用户焦虑：

- “我不会写剧本。”
- “我不懂镜头语言。”
- “我不会写 prompt。”
- “我不想让私人输入出现在日志、公共空间或不可控的地方。”
- “我不想管理复杂编辑器。”

## 产品定位

StoryCam 是：

- AI 私人小剧场。
- 个人表达工具。
- 为模糊情绪和私人回忆服务的温柔导演。
- 面向不懂电影术语用户的短片相机。

StoryCam 不是：

- 工业化短剧生产流水线。
- 批量内容生成后台。
- 专业时间线编辑器。
- prompt 市场。
- 通用 AI 模型壳。

## MVP 产物结构

进入实现计划前，以下 artifact 是 canonical 产品对象。

| Artifact | 用户可见 | 产品含义 |
| --- | --- | --- |
| `input` | 是 | 用户的私人想法、记忆、情绪、关系、角色幻想或上传上下文。 |
| `script` | 是 | 一段可读短剧本，用来让用户判断 StoryCam 是否理解了自己的想法；其中 `beats` 是剧情节点/故事段落，不是镜头列表、分镜表或拍摄方案。 |
| `character_assets[]` | 是 | 1-3 张主角级/关键对手戏人物卡，包含角色、关系、稳定视觉描述、情绪、服装、道具和一致性说明。 |
| `scene_assets[]` | 是 | 固定 1 张场景卡，包含地点、时间、光线、氛围、关键物件、空间逻辑，以及 4-6 个场景小切图描述，用一张多切图场景资产图覆盖剧本所需环境参考。 |
| `storyboard_script` | 部分可见 | 轻量拍摄计划，用普通用户语言表达；专业分镜表留在内部。 |
| `core_storyboard_groups[]` | 是 | MVP 新建流程固定 1 个确认后的电影感核心时刻，作为一个 15 秒内视频片段。旧数据可能保留多组。 |
| `expanded_storyboard_cards[]` | 是 | 核心组内的 8 张指导卡：进入、动作、反应、氛围、转场、情绪点或续写。 |
| `clip_prompt_packets[]` | 否，仅调试 | 从故事、资产、分镜组、扩展卡、节奏、字幕、声音和质量检查组装出的结构化 provider payload。 |
| `generated_clips[]` | 是 | 每个确认核心分镜组生成一个视频片段。 |
| `stitch_suggestion` | 是 | 推荐顺序、时长、转场、字幕节奏、音乐方向和结尾停留。 |
| `final_work` | 是 | 最终 10-15 秒作品。窄 MVP 中，即使只有一个 generated clip，也需要生成真实 final work artifact。 |
| `quality_checks[]` | 部分可见 | 用户友好的提醒，以及内部 Double Check 结果。 |

## Canonical 创作闭环

```text
私人想法
  -> 剧本 + 人物资产 + 场景资产
  -> 用户确认故事世界
  -> 1 份 9 帧分镜脚本 + 1 个核心分镜组
  -> 用户打开 9 帧画布并可选点击中心图扩展 8 帧
  -> 确认后的组成为 clip prompt packet
  -> 生成一个 Seedance 2.0 视频片段
  -> 用户确认片段
  -> 系统给出拼接建议
  -> 最终 10-15 秒作品
```

MVP 收敛为一个分镜组、一个视频片段。接口和数据层可兼容旧的 1-3 组历史数据，但新建流程必须固定为 1 组、15 秒内。

## 产品级生成方法

StoryCam 的生成不是一次黑盒调用，而是分阶段把用户输入变成可确认的 artifact。每个阶段都要能被 mock，也要能在 real mode 中替换为真实 AI provider。

### 1. 故事世界生成

输入：

- 用户文本想法。
- 轻导演选项。
- Phase 1 允许上传的照片。
- 可选模板入口：暗恋雨夜、宠物、小说角色、情绪短片。

产出：

- `script`
- `character_assets[]`
- `scene_assets[]`
- `quality_checks[]`

约束：

- `script.summary` 和 `script.beats` 只表达短剧本层面的剧情、角色动作、对白/可听声音、关键物件和环境变化；不要提前输出景别、机位、运镜、构图、剪辑、镜头编号或 Shanyin-style 分镜表。
- 人物资产只覆盖主角级/关键对手戏人物，最多 3 个；背景人群、路人、短暂提及人物不单独建资产。
- 场景资产固定只有 1 个。这个唯一场景用 `scenePanels` 描述 4-6 个小切图，包括主场景、关键物件、光线、动作空间或转场角度。
- `script.visualStyle` 作为人物资产图和场景资产图共享的视觉风格锚点，应从用户输入和剧本语境推断，可以是写实电影感、漫画、动画、绘本、胶片等，不固定成某一种风格。
- 场景资产图必须是无人环境资产板，不画人物、人物倒影、剪影、身体局部或人群；角色一致性只由人物资产和后续分镜/视频阶段负责。

需要的 AI 能力：

- 文本理解和改写。
- 如果用户上传照片，需要多模态理解，用来提取人物/宠物/场景的稳定视觉描述。
- 结构化输出能力，能按 StoryCam artifact schema 产出可校验 JSON。

模型选择边界：

- 具体文本/多模态模型在 PLAN 中选择。
- SPEC 只要求模型能稳定输出短剧本、人物资产、场景资产，并能避免把专业术语暴露给用户。

### 2. 分镜脚本和核心分镜组生成

输入：

- 已确认的 `script`
- 已确认的 `character_assets[]`
- 已确认的 `scene_assets[]`
- MVP 固定核心分镜组数量：1 组
- `director_tone`

产出：

- 1 份 `storyboard_script`
- 1 个 `core_storyboard_groups[]`
- 每份 `storyboard_script` 包含固定 9 帧结构化分镜：第 1 帧是核心分镜主图，后 8 帧用于扩展画布。
- 分镜脚本是已确认 `script` 的内部改编，必须继承 `character_assets[]` 和 `scene_assets[]`，不得另造人物、地点、服装、道具或空间逻辑。

核心分镜组数量规则：

- 新建流程不提供 2 组或 3 组选择。
- 固定 1 组，约 15 秒内，总计划时长约 15 秒。
- 服务端即使收到旧客户端传入的 2/3 组请求，也按 MVP 归一为 1 组。

需要的 AI 能力：

- 从短剧本中抽取核心情绪转折。
- 把故事收敛成 1 个可生成 clip 的镜头组。
- 使用内部 Shanyin-style 方法做节奏和动作-反应判断，但只输出用户能理解的核心方案。

模型选择边界：

- 具体文本模型和 prompt 编排在 PLAN 中确定。
- 核心分镜代表图由对应组 `storyboard_script.frames[0].imagePrompt` 指导，但视觉基础必须是已生成的角色资产图和场景资产图。
- 如果角色/场景资产图尚未 ready，核心分镜图保持等待占位，不提交纯文本生图任务。

### 3. 扩展分镜生成

输入：

- 选中的 `core_storyboard_group`
- 已确认的故事世界
- 已有该组 `storyboard_script.frames[]`
- 用户操作：点击中心主图生成 8 张扩展图，或对单帧执行无输入重生成
- 已 ready 的角色资产图和场景资产图

产出：

- 8 个 `expanded_storyboard_cards[]`，对应 `storyboard_script.frames[1..8]`

需要的 AI 能力：

- 根据父核心组的 9 帧脚本生成进入、动作、反应、氛围、转场、情绪点等卡片。
- 保持人物、场景、情绪连续。
- 把 Shanyin 的镜头组逻辑转译为普通用户能看懂的“这一段会这样拍”。

模型选择边界：

- 扩展卡来自已生成的结构化分镜脚本；每张卡的图片使用该帧原始 `imagePrompt`，并必须引用同一组角色/场景资产图作为视觉基础。
- 不支持资产图参考的生图 provider 不允许降级为纯文本分镜图。
- 扩展卡默认不触发视频生成。

### 4. Clip Prompt Packet 组装

输入：

- 已确认的故事世界。
- 选中的核心分镜组。
- 该组的扩展分镜卡。
- 时长目标、字幕计划、声音计划、negative constraints、质量检查规则。

产出：

- `clip_prompt_packet`

需要的能力：

- 结构化组装和校验，不一定需要 AI。
- 必须记录上游 artifact versions。
- 必须生成用户可见的一句话 provider-send confirmation，而不是展示完整 packet。

### 5. 视频片段生成

输入：

- `clip_prompt_packet`

产出：

- `generated_clip`

需要的 AI 能力：

- 文生/图生/多参考视频生成。
- MVP 主假设是 Seedance 2.0。

模型选择边界：

- Seedance 2.0 是 Phase 1 真实视频生成主路径。
- 具体 API 参数、参考图传递方式、超时、重试、回调和错误映射在 PLAN/工程文档中定义。

### 6. 最终视频合成

输入：

- 用户确认的 1 个 `generated_clip`
- `stitch_suggestion`

产出：

- `final_work`

需要的能力：

- 第一版需要真实合成 final video。
- 1 个 clip 时，也应经过 final work 产物生成，可以只是封面、标题、字幕/音乐方向和片尾停留的轻量合成。
- 旧的多 clip 数据恢复后可按建议顺序、时长、转场和字幕节奏合成。

工具选择边界：

- 具体使用 FFmpeg、Remotion、云端媒体服务或其他合成工具，在 PLAN 中确定。

## Phase 1 范围

Phase 1 要做的是最小但真实的产品魔法路径：

1. 固定第一条样例路径：`我想把暗恋拍成韩剧雨夜`。
2. 同时保留宠物、小说角色、情绪短片入口，但可以暂时不支持完整生成。
3. 用户可以输入自己的想法，也可以上传照片；产品可以温和地偏向“私人记忆预告片”格式。
4. 生成并确认一个紧凑故事世界：默认更像短剧本，同时包含人物和地点资产。
5. 固定生成 1 个 15 秒内核心分镜组。
6. 可选打开 9 帧画布，并点击中心主图展开 8 张指导卡/图。
7. 在真实视频生成前展示一句话 provider-send 确认。
8. 通过异步 job 生成真实 Seedance 2.0 clip。
9. 如果 Seedance 2.0 输出质量不稳定，第一救援路径是重拍这一段。
10. 真实合成 final video。
11. 展示 final work，支持登录后保存到账号和预览；第一版不支持私密分享。

Phase 1 不把第一个 clip 直接当作最终完成状态跳过合成；即使只有一个 clip，也需要生成 `final_work` artifact。界面和数据结构可保留旧多段数据兼容，但新建路径不提供“继续拍第二段/第三段”。

## MVP 不做

- 移动端-only 第一版。
- 支付、创作者市场。
- 30 秒到 3 分钟长片生成。
- 批量生产、团队协作或品牌投放工作流。
- 高级时间线编辑器。
- 向普通用户暴露 Shanyin 的九列分镜表。
- 每张扩展分镜卡单独触发一次视频生成。
- 公共 feed 或社交网络。
- 过早抽象成通用 provider marketplace。

## 产品原则

1. 在视频生成前，让用户看见故事正在成形。
2. UI 使用普通用户语言，专业电影术语保留在内部。
3. 让视频生成单位足够清楚：一个核心分镜组生成一个片段。
4. 任何私人故事数据发送给外部视频 provider 前，必须让用户明确确认。
5. 优先做一条窄而有魔法感的路径，而不是宽而未完成的工作台。
6. 失败、重试、取消和救援路径是一等产品状态，不是工程附属品。
7. 不伪造真实视频成功。mock mode 用来跑通本地流程，不代表产品验证成功。

## 详细用户旅程

### 1. 想法输入

用户目标：用最低摩擦说出那个私人念头。

示例输入：

> 我想把暗恋拍成韩剧雨夜

可见控件：

- 想法输入框。
- 照片上传入口，Phase 1 允许上传人物、宠物、场景或记忆照片。
- 轻导演选项：
  - `更遗憾一点`
  - `更甜一点`
  - `像私人回忆`
  - `少说话，多画面`
  - `加一句旁白`
  - `停在没说出口`
  - `给一点希望`
- 主 CTA：`生成故事雏形`
- 信任标记：`默认私密，只有你确认后才会发送生成视频`

输出：

- `input`
- `uploaded_photo_refs[]`
- `intent`
- selected `lightweight_choices`

必须覆盖的状态：

- 空输入
- 草稿输入
- 故事世界生成中
- 故事世界生成失败
- 加载 starter example

验收标准：

- 首次使用者能理解自己只需要输入想法，不需要填写生产表单。
- 上传照片是可选增强，不是开始创作的必要条件。
- 首屏在提交前传达隐私边界。
- 主路径不出现模型/provider 术语。

### 2. 故事世界确认

用户目标：判断 StoryCam 是否理解了感觉、人物和地点。

可见区域：

1. `我的剧本`
   - Phase 1 建议 80-180 个中文字符。
   - 读起来像一个微型电影故事，而不是 prompt。

2. `人物`
   - 1-3 张人物卡。
   - 前台字段使用普通语言：身份、关系、外形、服装/道具、当前情绪。

3. `地点`
   - 1-3 张场景卡。
   - 前台字段使用普通语言：地点、时间、光线、氛围、关键物件。

主 CTA：

- `对，继续拍这一段`

次要动作：

- `改剧本`
- `改人物`
- `改地点`
- `帮我决定`
- `重新生成`
- `删除这个故事`

输出：

- `script`
- `character_assets[]`
- `scene_assets[]`
- `quality_checks[]`

必须覆盖的状态：

- 故事世界 ready
- 用户编辑了剧本
- 用户锁定某个人物或场景资产
- 单独重新生成某一部分
- 存在未保存编辑，并导致下游 artifact stale

验收标准：

- 用户能在看到分镜或视频前回答“像不像我的故事？”。
- 不跳过剧本、人物、场景确认阶段。
- 如果用户在生成下游 artifact 后改剧本、人物或场景，下游 artifact 必须标记为 stale，并要求重新确认。

### 3. 核心分镜组

用户目标：理解哪些电影感时刻可以变成视频片段。

系统生成：

- 1 份 `storyboard_script`
- 1 个 `core_storyboard_groups[]`
- `storyboard_script.frames[]` 固定 9 帧，第 1 帧生成核心图，后 8 帧用于点击中心图后的扩展画布。

分组数量规则：

- MVP 新建流程固定 1 组。
- 该组控制在约 15 秒内。
- 旧的 2/3 组历史数据只在恢复和展示层兼容，不作为新建路径。

核心分镜组卡片字段：

- 标题
- 发生了什么
- 情绪转折
- 涉及人物
- 场景
- 预计片段时长，默认约 15 秒
- 主分镜图或失败占位
- 已生成的 8 张扩展分镜缩略图
- 片段状态

示例分镜组：

1. `未发送短信`
   她站在便利店外，手机屏幕亮起，告白文字停在输入框里。

主动作：

- `打开 9 帧画布`
- `用这一组生成片段`

次要动作：

- `换一个核心时刻`
- `再改一下故事世界`

验收标准：

- 用户理解每个核心分镜组都可以生成一个 clip。
- UI 不暗示每张 storyboard card 都会单独生成视频。
- 系统不为了凑数生成多组；MVP 新建流程始终只生成 1 组。

### 4. 扩展画布

用户目标：在视频生成前，看见并调整这个核心时刻会怎么拍。

画布行为：

- 被选中的核心分镜组固定在中心。
- 初次打开画布只显示中心第 1 帧。
- 用户点击中心主图后，周围 8 个 slot 以动效展开并开始生成扩展分镜图。
- 默认扩展 8 张卡/图。
- 中心主图 + 周围 8 张扩展图，共 9 个固定槽位。
- 未生成 slot 展示稳定 waiting/loading 状态。
- ready 状态的 01-09 帧都可以点击放大查看；生成中或占位帧不可放大。
- 右侧脚本摘要展示整组 9 帧的普通用户摘要，不暴露专业分镜表。

扩展卡角色：

- `进入`
- `动作`
- `反应`
- `氛围`
- `转场`
- `情绪点`
- `续写`
- `空镜`

扩展卡字段：

- 角色
- 画面描述
- 镜头运动
- 动作
- 情绪
- 字幕/对白
- 声音提示
- 时长提示

主 CTA：

- `用这一组生成片段`

次要动作：

- `生成更多分镜`
- `换一个角度`
- `加强情绪`
- `删除这张`
- `回到核心分镜`

验收标准：

- 扩展卡看起来是有用的导演指导，而不是装饰缩略图。
- 扩展卡默认仍是父核心分镜组的子对象。
- 用户可以跳过扩展，直接生成片段。

### 5. 视频服务发送确认

用户目标：在真实视频生成前，知道会发送什么。

必须出现的文案：

> 下一步会把这段故事设定发送给视频生成服务生成片段。发送内容包括故事摘要、人物/地点描述和这一段的分镜说明，不包含隐藏日志。

确认粒度：

- Phase 1 使用一句话确认即可。
- 不需要展示完整字段摘要。
- 不展示完整 prompt packet。
- 不展示 Shanyin-style 内部 shot data。

主 CTA：

- `发送并生成片段`

次要动作：

- `再改一下`
- `取消`
- `删除这个故事`

验收标准：

- 未经明确确认，不启动真实视频 provider 调用。
- 用户能看到普通语言描述的 provider boundary。
- Provider API key 和原始 provider payload 永远不出现在客户端。

### 6. 片段生成

用户目标：等待时有信心，并保留控制权。

可见 loading 文案示例：

> 正在把雨声、便利店灯光和没发出的短信拍成片段。

Job 行为：

- 视频生成永远是异步任务。
- 重复提交复用 idempotency key。
- 用户可以请求取消。
- 如果本地 job 已取消或 tombstone，晚到的 provider 结果必须丢弃。
- 超时进入救援 UI，不出现无限 spinner。

必须覆盖的状态：

- Queued
- Running
- Cancel requested
- Canceled
- Succeeded
- Failed
- Expired/timeout
- Policy refusal

验收标准：

- 没有同步视频生成请求阻塞 app。
- 用户能看到进度，并有救援路径。
- 失败时保留已完成的故事工作，并允许重试或重生成。

### 7. 片段确认

用户目标：判断生成片段是否接近自己的想象。

可见问题：

> 像你想的吗？

主动作：

- `保存`
- `拼成最终作品`

次要动作：

- `重拍这一段`
- `换情绪再拍`
- `调整字幕`
- `删除这一段`

验收标准：

- 被确认的对象是视频片段，不是单张图片。
- 片段动作被限制在父核心分镜组范围内。
- 产品能收集轻量反馈，但不把用户变成 QA 操作员。
- 如果片段质量不稳定或不符合预期，第一救援路径是重拍这一段。

### 8. 拼接建议和最终作品

用户目标：不用打开复杂编辑器，也能让 StoryCam 完成作品。

如果只有 1 个 clip：

- 仍然生成真实 `final_work`。
- 合成可以很轻：封面帧、标题、字幕/音乐方向、片尾停留和导出文件。

如果有 2-3 个 clips：

- 推荐顺序。
- 推荐每段裁剪时长。
- 推荐转场方式。
- 推荐字幕节奏。
- 推荐音乐/声音方向。
- 推荐最终停留或结尾画面。

主 CTA：

- `生成最终作品`

次要动作：

- `更像预告片`
- `更像私人回忆`
- `更快一点`
- `更慢一点`
- `调整顺序`

验收标准：

- 最终目标仍是 10-15 秒。
- 用户不需要时间线编辑器也能完成。
- 拼接建议保持轻量、用户可理解。
- 第一版真实视频生成成功后只支持保存到用户账号和预览，不支持分享链接。

## 时长规则

| 核心分镜组数量 | 单个 clip 目标 | 最终作品目标 |
| --- | --- | --- |
| 1 | 约 15 秒内 | 约 15 秒内 |

UI 不应把它解释成“模型调用次数”，而应解释成“一个核心时刻”。

MVP 新建流程不提供分组数量选择；服务端把旧请求归一为 1 组、15 秒内。

## 内部导演脑

Shanyin Director Master 应转译为 StoryCam 内部产品原语。

| Shanyin 方法 | StoryCam 产品原语 |
| --- | --- |
| 导演定调 | 轻导演选项 + 推断出的 `director_tone`。 |
| 节奏规划 | 单核心分镜组和 15 秒内时长计划。 |
| 剧本微调 | 故事世界确认和重生成。 |
| 镜头组 | 核心分镜组和扩展分镜卡。 |
| 九列分镜 | 内部 `shot_data[]`，对普通用户隐藏。 |
| 动作-反应逻辑 | 扩展卡角色：进入、动作、反应、氛围、转场、情绪点。 |
| Double Check | 生成前和生成后的质量检查。 |
| XLSX 输出 | MVP 不允许用户导出；仅可作为后台内部设计参考。 |

内部 shot data 可以使用 Shanyin 风格字段：

```text
shot_id
time_range
camera_angle
shot_size
visible_content
scene
sound
technical_notes
narrative_purpose
```

前台语言应翻译成：

- `这一段会这样拍`
- `镜头会先看到...`
- `这里会停一下`
- `雨声和门铃会在这里出现`
- `这一段更像私人回忆`

用户需要看到的是核心方案和可确认的故事/分镜/片段，不需要知道 Shanyin-style 专业表格、九列字段或内部 shot data。

## 内部数据形态

### DirectorPacket

```text
DirectorPacket
  id
  version
  session_id
  input
  intent
  director_tone
  script
  character_assets[]
  scene_assets[]
  storyboard_script
  core_storyboard_groups[]
  expanded_storyboard_cards[]
  clip_prompt_packets[]
  generated_clips[]
  stitch_suggestion
  final_work
  quality_checks[]
  created_at
  updated_at
```

### Artifact State

每个 artifact 都需要自己的状态。只靠 session status 不够。

```ts
type ArtifactState = "idle" | "generating" | "ready" | "failed" | "skipped" | "stale";
```

规则：

- 编辑上游 artifact 会让下游 artifact 变成 stale。
- 视频 job 必须记录它使用的上游 artifact versions。
- stale 的 clip prompt packet 不能直接发送，必须重新确认。

### Character Asset

```text
character_asset_id
display_name
role_in_story
relationship_to_user_or_other_characters
appearance
clothing
emotion
signature_prop
stable_visual_description
locked_fields[]
reference_images[]
state
version
```

### Scene Asset

```text
scene_asset_id
display_name
location
time_of_day
lighting
atmosphere
key_objects[]
spatial_notes
stable_visual_description
reference_images[]
state
version
```

### Core Storyboard Group

```text
core_storyboard_group_id
title
story_purpose
emotional_turn
visual_prompt
representative_image
estimated_clip_duration
characters[]
scene
expanded_storyboard_card_ids[]
clip_status
clip_result_id
state
version
```

### Expanded Storyboard Card

```text
expanded_storyboard_card_id
parent_core_storyboard_group_id
shot_role
visual_prompt
camera_motion
action
emotion
dialogue_or_subtitle
sound_hint
duration_hint
state
version
```

### Clip Prompt Packet

```text
clip_prompt_packet_id
parent_core_storyboard_group_id
script_context
character_refs[]
scene_refs[]
core_storyboard_ref
expanded_storyboard_refs[]
duration_target
motion_style
subtitle_plan
audio_plan
negative_constraints
quality_checks
input_artifact_versions
provider_boundary_summary
state
version
```

### Generated Clip

```text
generated_clip_id
parent_core_storyboard_group_id
job_id
duration
media_url
thumbnail_url
provider_name
generation_mode
quality_check_result
user_feedback
confirmed
created_at
```

## 生成逻辑

```text
POST /story-world
  input + lightweight choices
  -> script + character assets + scene assets + quality checks

POST /storyboard
  confirmed script/assets
  -> one 9-frame storyboard script + one core storyboard group + first-frame image job

POST /storyboard-groups/:id/expand
  selected core group
  -> 8 expanded storyboard cards from frames 2-9 + image jobs

POST /storyboard-groups/:id/frames/:frameNumber/regenerate-image
  selected frame, no user prompt
  -> new image job using that frame's stored imagePrompt

POST /storyboard-groups/:id/generate-clip
  director packet + selected group + expansion cards
  -> validate upstream versions
  -> create clip prompt packet
  -> enqueue video GenerationJob

GET /generation-jobs/:id
  -> current job status

POST /generation-jobs/:id/cancel
  -> cancel provider if possible, tombstone locally, discard late result

POST /stitch-suggestion
  confirmed clips
  -> order + durations + transitions + subtitles + music direction

POST /final-work
  confirmed stitch suggestion
  -> final work
```

## Provider 边界

StoryCam UI 不应直接耦合 Seedance 2.0。产品可以把 Seedance 2.0 作为第一轮真实 spike 假设，但实现时应通过一个窄的视频生成边界调用。

Provider 概念：

- `generation_mode`：`mock` 或 `real`
- `provider_kind`：`text`、`image`、`video` 或 `stitch`
- `provider_name`：`mock`、`seedance_2_0` 或未来 provider name

产品规则：

- Mock mode 可以完整跑通流程，不调用外部 AI 生成服务。
- Real video mode 必须先经过一句话 provider-send confirmation。
- MVP 中 Seedance 2.0 调用数等于确认的核心分镜组数量，新建流程固定为 1。
- 扩展分镜卡不会自动创建额外视频调用。
- Provider error 展示给用户或写入日志前必须脱敏。

## 隐私与信任

StoryCam 会处理私人记忆、关系、幻想，以及未来可能出现的照片。信任是产品界面的一部分，不是设置页脚注。

Always：

- 首次提交前展示默认私密文案。
- 第一版使用账号登录，首选 Google 登录。
- 真实视频生成前展示一句话 provider-send confirmation。
- 允许用户删除故事/session。
- 日志、analytics、error payload、debug snapshot、support bundle 中不得出现原始私人输入。
- Provider API key 只存在服务端。
- 第一版不提供分享链接，只支持保存到用户账号和预览。

Never：

- 把原始私人故事文本写入 server logs。
- 在客户端错误中展示完整 prompt packet。
- 未经明确确认就向视频 provider 发送数据。
- 把 mock 生成结果当作用户需求验证。

删除语义：

- 删除 Supabase Postgres 中的 session/artifacts/jobs/media metadata。
- 删除 Supabase Storage 中的上传照片、生成片段和最终作品。
- 第一版如果没有分享链接，则无需分享撤销；未来若加入分享链接，必须支持撤销。
- 如果 provider 支持，尽量取消/删除 provider job 或 media。
- Tombstone in-flight jobs。
- 删除/取消后，丢弃晚到 provider 结果。

## 质量检查

生成前检查：

- 故事有清晰情绪中心。
- 人物描述足够稳定，能支撑视觉生成。
- 场景有具体视觉锚点。
- 核心分镜组有动作-反应或情绪 beat。
- 时长目标符合分组数量。
- Provider packet 不包含隐藏日志和 secrets。

生成后检查：

- Clip 存在且可播放。
- Clip 大致匹配选中的核心分镜组。
- 时长在可接受范围。
- 内容安全/policy 结果被正确处理。
- 用户有明确的重试或保存路径。

用户可见质量文案应保持普通语言：

- `这一段情绪有点散，要不要我帮你收紧？`
- `人物描述还不够稳定，建议先锁定外观。`
- `视频生成超时了，你可以稍后重试，故事已经保留。`

## 技术框架决策

以下是当前进入 PLAN 的技术框架决策。

产品约束：

- Web-first，不做 mobile-only。
- 必须支持 mock mode 全流程。
- 真实视频生成必须是异步 job。
- 必须有 provider boundary，UI 不直接耦合具体模型 API。
- 必须支持账号内保存和预览 final work。
- 必须支持照片上传进入故事世界生成。
- 日志和错误处理必须内置脱敏。

技术选择：

- 前端：Next.js App Router + TypeScript。
- 样式：Tailwind CSS。
- 后端入口：Next.js Route Handlers 或 Server Actions。
- Auth：Supabase Auth，首选 Google 登录。
- 数据库：Supabase Postgres。
- 媒体存储：Supabase Storage，保存上传照片、生成视频片段、最终作品和封面。
- AI SDK：Vercel AI SDK 作为服务端 AI 编排层。
- 文生/图生模型：优先使用 OpenRouter 中可用的文本、多模态和图像模型，通过 provider adapter 接入。
- 视频生成：Seedance 2.0 通过独立 `VideoGenerationProvider` 接入。
- Job：使用数据库 job 状态机 + 可替换 runner，真实 provider path 必须能轮询、取消、超时和丢弃晚到结果。
- 媒体合成：PLAN 中比较 FFmpeg、Remotion 或云端媒体服务。

PLAN 需要明确最终技术栈、目录结构、依赖、API contract、job lifecycle、provider mode、测试命令和部署边界。

## 命令

当前仓库主要是文档和静态设计参考。Web app scaffold 后，实施计划假设支持以下命令：

```bash
pnpm install
pnpm dev
pnpm storycam:seed
pnpm storycam:reset
pnpm lint
pnpm typecheck
pnpm test
pnpm test:api
pnpm test:e2e
pnpm qa:visual
```

在 app 尚未存在前，文档验证以人工 review 为主；后续可加入 markdown/link checks。

## 项目结构

Canonical 文档必须放在 `docs/` 下。

当前和预期文档结构：

```text
AGENTS.md                                  智能体入口地图
ARCHITECTURE.md                            系统架构地图
docs/
  README.md                                  项目文档索引
  product-specs/
    index.md                                产品规格索引
    product-vision.md                       原始定位和产品洞察
    storycam-film-machine-design.md         本产品规格
  design-docs/
    index.md                                设计文档索引
    core-beliefs.md                         设计核心信念
    storycam-ui-design.md                   实用 UI 设计 brief
    assets/                                 UI 图片和参考素材
  exec-plans/
    active/
    storycam-web-mvp-implementation-plan.md 工程实施计划
    test-plan.md                            测试计划
    completed/
    tech-debt-tracker.md                    技术债追踪
  generated/
    db-schema.md                            数据库 schema 摘要
  references/
    shanyin-director-master-source.md       参考来源和集成说明
    shanyin-director-master/                本地导演脑方法论快照
    openai-harness-engineering.md           agent-readable repo 结构参考
  DESIGN.md
  FRONTEND.md
  PLANS.md
  PRODUCT_SENSE.md
  QUALITY_SCORE.md
  RELIABILITY.md
  SECURITY.md
```

Web app scaffold 后的预期结构：

```text
src/
  app/                                      Next.js App Router pages/routes
  components/                               用户可见 UI 组件
  features/storycam/                        StoryCam 领域流程
  lib/providers/                            Mock 和真实 provider 边界
  lib/jobs/                                 异步 job 编排
  lib/privacy/                              脱敏和删除工具
  server/                                   服务端 actions/routes
tests/
  unit/
  api/
e2e/
```

## 代码风格

本文件是产品规格，不是实现代码；但未来 app 应偏向显式领域对象，而不是匿名 blob。示例：

```ts
type CoreStoryboardGroup = {
  id: string;
  title: string;
  storyPurpose: string;
  emotionalTurn: string;
  estimatedClipDurationSeconds: number;
  characterAssetIds: string[];
  sceneAssetId: string;
  expandedCardIds: string[];
  state: ArtifactState;
  version: number;
};

function canGenerateClip(group: CoreStoryboardGroup): boolean {
  return group.state === "ready" && group.estimatedClipDurationSeconds > 0;
}
```

约定：

- 产品术语保持一致：`story world`、`core storyboard group`、`expanded storyboard card`、`clip prompt packet`、`generated clip`、`final work`。
- 避免在 UI 文案中暴露 `prompt packet`、provider payload 或专业分镜表术语。
- Provider-specific 代码必须放在 provider boundary 后面。
- 当下游生成依赖上游内容时，优先使用 versioned artifacts。

## 测试策略

产品层测试预期：

- 用户不能跳过剧本/人物/场景确认直接生成分镜。
- 一个核心分镜组同一时间最多对应一个 active video generation job。
- 扩展卡不会创建视频 job，除非未来显式引入该高级功能。
- 编辑上游 artifact 会让下游 prompt packet 和 job 变为 stale。
- 一句话 provider-send confirmation gate 住所有真实视频调用。
- 删除/取消后，晚到 provider 结果不会重新出现在用户 session 中。
- Mock mode 可以在没有外部 provider credentials 的情况下跑完整流程。
- Real provider smoke tests 必须 opt-in 且 secret-gated。
- 隐私回归测试确保 logs/errors 不包含原始用户输入或完整 prompt packet。
- 第一版不生成分享链接，只验证账号内保存和预览。
- final work 必须是真实合成产物，不能只返回拼接建议文案。

建议测试层级：

- Unit tests：artifact 状态流转、时长规则、stale 传播、脱敏工具。
- API tests：route contract、idempotency、job 创建、取消、provider mode 校验。
- E2E tests：happy path 和关键救援路径。
- Visual QA：前端实现后的 Web flow 视觉检查。

## 边界

Always：

- 在产品、设计、工程工作前，先使用 `docs/README.md` 作为文档索引。
- canonical 决策写入 `docs/`。
- 保留剧本/人物/场景确认阶段。
- 保留核心分镜组 -> 视频片段的生成单位。
- app 存在后，声称实现完成前运行适用测试。
- 日志和错误中脱敏私人用户内容。

Ask first：

- 把 MVP 从 Web-first 改成 mobile-first。
- 移除故事世界确认阶段。
- 默认核心分镜组超过 3 个。
- 让每张扩展卡都触发一次视频生成。
- 把对外分发能力加入第一版范围。
- 加入支付、公共 feed 或 marketplace 范围。
- 增加新的外部 provider。
- 在普通用户 UI 中暴露 Shanyin 完整专业工作流。

Never：

- 把 `~/.gstack/` artifact 当作 canonical 项目文档。
- 把 StoryCam 做成工业化短剧生产后台。
- 提交 secrets 或真实 provider credentials。
- 记录原始私人想法、完整剧本、完整 prompts、signed media URLs 或 provider secrets。
- 未经明确确认启动真实视频生成调用。
- 伪造真实视频结果，并称为 MVP 验证。
- 向用户导出 Shanyin-style shot data 或九列分镜表。

## 指标与成功标准

MVP 成功不等于视频画面完美。MVP 成功是证明用户觉得产品理解并拍出了某种个人表达。

行为指标：

- `story_world_confirmed`：用户确认剧本/资产。
- `core_group_opened`：用户点击核心分镜组。
- `expansion_used`：用户生成或查看扩展卡。
- `clip_generation_confirmed`：用户明确发送某个组去生成视频。
- `clip_generation_succeeded`：provider 返回可播放 clip。
- `felt_like_mine_feedback`：用户表示 clip 接近自己的想法。
- `save_intent`：用户保存或预览最终作品。
- `continue_intent`：用户选择继续拍下一组。
- `retry_intent`：用户愿意重试，说明在意结果。

定性成功：

- 用户能描述 StoryCam 做了什么，而不提 prompt。
- 用户理解故事 -> 人物/地点 -> 核心时刻 -> 片段。
- 用户说结果“像我的故事”，或想把它调得更像。
- 用户不困惑为什么只有 1 个核心分镜组和一个 15 秒内片段。
- 用户信任真实视频生成前会发送什么。

Phase 1 具体验收：

- 给定 `我想把暗恋拍成韩剧雨夜`，StoryCam 产出可读剧本、人物资产、场景资产、固定生成 1 个核心分镜组、1 张主分镜图和可选 8 张扩展分镜图、clip prompt packet、根据 mode 生成真实或 mock clip，并合成 final work。
- Phase 1 允许上传照片，并能把照片转成故事世界中的人物、宠物、场景或记忆参考。
- Phase 1 使用 Supabase Auth + Google 登录；未登录用户可以体验输入前导，但保存/生成真实视频前需要登录。
- Real mode 下，视频生成必须经过明确确认和异步 job state。
- Mock mode 下，不需要 provider credentials 也能跑完整路径。
- 单组最终 clip/work 目标约 15 秒内。
- 第一版 final work 支持保存到账号和预览，不支持分享链接。

## 示例：暗恋韩剧雨夜

输入：

> 我想把暗恋拍成韩剧雨夜

轻导演选项：

- `更遗憾一点`
- `像私人回忆`
- `少说话，多画面`
- `停在没说出口`

剧本：

> 雨夜的便利店外，她反复删改一条告白短信。门铃响起，他从店里出来，两个人隔着玻璃反光短暂重叠，却没有真正看见彼此。擦肩而过后，镜头留在她没有递出去的伞柄和黑掉的手机屏幕。

人物资产：

- 她：二十多岁，湿发，米色风衣，手里握着手机和透明伞，情绪克制。
- 他：二十多岁，深色外套，手里拿着便利店热饮，像是刚结束加班。

场景资产：

- 雨夜便利店门口：冷白灯、湿漉漉街面、玻璃反光、门铃、雨声。
- 小切图：便利店外景、玻璃倒影、未发送短信、灯光反射。

核心分镜组：

1. `未发送短信`
   她站在便利店外，手机屏幕亮起，告白文字停在输入框里。

2. `玻璃反光`
   他从店里出来，两人的脸在玻璃反光里短暂重叠。

3. `擦肩而过`
   两个人错身，伞柄留在画面边缘，字幕出现。

Phase 1 选中的核心组：

- `未发送短信`

默认扩展：

- `进入`：便利店冷白灯照出湿漉漉的街面，透明伞边缘有雨水滑落。
- `动作`：她低头删掉告白短信，拇指停在发送键旁边。
- `反应`：门铃声响起，她抬头但没有迈出那一步。

Clip：

- Phase 1 单组 clip 控制在 15 秒内。

## 已确认产品决策

以下决策来自 2026-04-26 的人工产品 review，已作为进入 PLAN 的输入。

1. MVP 新建流程固定一个核心分镜组、一个 15 秒内视频片段。
2. Phase 1 同时保留宠物、小说角色、情绪短片入口，但可以暂时不支持完整生成。
3. Phase 1 允许用户上传照片。
4. 故事世界确认默认更像短剧本，而不是三张卡片摘要。
5. 第一版真实视频生成成功后不支持分享，只支持保存到账号和预览。
6. Phase 1 需要真实合成 final video。
7. 封面由最强核心分镜图承担，不单独做主视觉海报。
8. Provider-send confirmation 使用一句话确认即可。
9. 如果 Seedance 2.0 输出质量不稳定，第一版救援路径优先是重拍。
10. 不允许导出 Shanyin-style shot data；Shanyin-style 只作为后台设计方法，用户只需要知道核心方案。
11. 第一版需要账号登录，首选 Google 登录，使用 Supabase Auth。
12. 数据库使用 Supabase Postgres。
13. 上传图片、生成视频片段和最终作品需要云端存储，使用 Supabase Storage。
14. 后端 AI 服务编排使用 Vercel AI SDK。
15. 文生和生图模型优先使用 OpenRouter 中的模型，通过 provider adapter 接入。

## PLAN 待定问题

以下问题不阻塞 SPECIFY，但必须在 PLAN 中明确。

1. OpenRouter 模型选择：故事世界、照片理解、分镜脚本、核心分镜组、扩展分镜和图像生成分别使用哪些模型。
2. 图像生成策略：核心分镜代表图和扩展卡图片是否在 Phase 1 都真实生成，还是先只生成核心分镜代表图。
3. Seedance 2.0 具体调用方式：输入字段、参考图、时长参数、回调/轮询、错误码映射、重试上限。
4. Final video 合成工具：FFmpeg、Remotion、云服务或其他方案。
5. Supabase RLS policy、Storage bucket policy、signed URL 有效期和删除级联策略。
6. 保存和预览的文件格式、Supabase Storage 路径、清理策略。

## 下一道 Gate

按照 spec-driven development，下一步是基于这份已更新的 SPECIFY 创建 PLAN 文档或章节，覆盖：

1. 主要组件和依赖关系。
2. 实现顺序。
3. 风险和缓解方案。
4. 可并行工作和必须串行的工作。
5. 阶段间验证检查点。

PLAN 被确认前，不进入实现任务拆分。
