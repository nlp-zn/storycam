# Bilibili Build Series

The Bilibili series is the short-form public build log for StoryCam. It is useful for understanding the project rhythm, but the source of truth remains the repository docs and code.

Channel: [StoryCam / 拜托了楠哥 Bilibili space](https://space.bilibili.com/511795462)

## Episodes

| Episode | Title | Build Lesson | Related Repo Context |
| --- | --- | --- | --- |
| 01 | [别先写代码！我用 AI Agent 先做产品设计](https://www.bilibili.com/video/BV1FKGQ65EdG/) | Product positioning before code; StoryCam as a private story theater. | `docs/product-specs/product-vision.md` |
| 02 | [别急着写 PRD！我用 AI Agent 先看懂设计稿](https://www.bilibili.com/video/BV1wTG96HEEL/) | Turn early UI/design exploration into product and frontend context. | `docs/DESIGN.md`, `docs/design-docs/index.md` |
| 03 | [别让 AI 直接写代码！先把 PRD 拆成研发计划](https://www.bilibili.com/video/BV1DCVp6EEL7/) | Spec-driven development and implementation planning before build. | `docs/product-specs/storycam-film-machine-design.md`, `docs/PLANS.md` |
| 04 | [终于让 AI Agent 写代码了！第一版产品本地跑起来](https://www.bilibili.com/video/BV1gRVb6KEZc/) | Scaffold the app from the plan and get the local product running. | `docs/references/local-dev.md`, `docs/ARCHITECTURE.md` |
| 05 | [跑起来只是开始！AI Agent 打通剧本、资产与分镜](https://www.bilibili.com/video/BV1w8Vb6pEds/) | Connect script, assets, storyboard, and video-generation dependencies. | `docs/generated/provider-contract.md`, `docs/generated/job-lifecycle.md` |
| 06 | [写完代码还没完！我让 AI Agent 重做 UI 和上线工具链](https://www.bilibili.com/video/BV15NVb6zE5z/) | Polish UI, collapse unnecessary flow surfaces, and strengthen release tooling. | `docs/FRONTEND.md`, `docs/PR_REVIEW.md` |
| 07 | [别让 AI 乱合代码！我给项目加上 PR Gate 和 CI/CD](https://www.bilibili.com/video/BV1xkVt6sEp9/) | Turn agent collaboration into explicit deterministic gates and reviewer reports. | `docs/PR_REVIEW.md`, `.github/workflows/ci.yml` |
| 08 | [一张照片变手绘旅行 VLOG！AI Agent 给产品加新玩法](https://www.bilibili.com/video/BV1o2Vh6EEGJ/) | Add a new mode without breaking StoryCam's confirmation chain or privacy boundary. | `docs/exec-plans/completed/handdrawn-travel-vlog-mode.md` |
| 09 | [产品终于上线了！AI Agent 帮我搞定部署、域名和监控](https://www.bilibili.com/video/BV1H9V86REnW/) | Deploy the full-stack app with worker-owned async generation and observability. | `docs/DEPLOYMENT.md`, `docs/OBSERVABILITY.md` |
| 10 | [上线只是开始！我让 AI Agent 做发布视频、增长和 BP](https://www.bilibili.com/video/BV17vVL6rEEw/) | Turn launch output into growth material, investor narrative, and next-product thinking. | `docs/learning/portfolio-course.md` |

## How To Use This Series

- Watch episodes 01-03 before reading the product specs.
- Watch episodes 04-06 before changing the core generation workflow.
- Watch episodes 07-09 before touching PR gates, CI, deployment, or observability.
- Watch episode 10 as a launch-story case study, not as product behavior source of truth.
