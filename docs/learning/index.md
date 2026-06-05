# StoryCam Learning Index

StoryCam's codebase is the product implementation. The learning material explains how the product was shaped, reviewed, built, deployed, and turned into a public case study.

Keep this material separate from the product UI. Ordinary users should see StoryCam as a private story-theater tool; contributors can use these resources to understand how the project was made.

## Learning Paths

### Product And Design

- Why StoryCam is a private story theater instead of an industrial short-drama backend.
- How the flow moved from a loose idea to story-world confirmation, storyboard groups, and generated clips.
- How visual references were translated into a usable web workspace.

Start with:

- `docs/product-specs/product-vision.md`
- `docs/product-specs/storycam-film-machine-design.md`
- `docs/DESIGN.md`
- `docs/learning/bilibili-series.md` episodes 01-03
- `docs/learning/portfolio-course.md` chapters 0-2.1

### Engineering And Provider Workflow

- How mock mode, real provider smoke tests, and server-only provider boundaries work.
- Why real generation uses durable jobs instead of browser-owned requests.
- How StoryCam keeps prompt packets, signed URLs, private media, and provider failures redacted.

Start with:

- `docs/ARCHITECTURE.md`
- `docs/RELIABILITY.md`
- `docs/references/providers.md`
- `docs/generated/job-lifecycle.md`
- `docs/learning/bilibili-series.md` episodes 04-08
- `docs/learning/portfolio-course.md` chapters 3-5.1

### Launch, Governance, And Growth

- How PR Gate, CI, deployment, uptime, and production smoke checks were added.
- How StoryCam's launch materials, investor narrative, and growth assets were produced without changing the core product boundary.

Start with:

- `docs/PR_REVIEW.md`
- `docs/DEPLOYMENT.md`
- `docs/OBSERVABILITY.md`
- `docs/learning/bilibili-series.md` episodes 07-10
- `docs/learning/portfolio-course.md` chapters 6.0-6.2

## Public Case-Study Sources

- [Bilibili StoryCam build series](https://space.bilibili.com/511795462)
- [StoryCam long-form course index](https://portfolio.znbuild.com/tutorial/storycam/index.html)

## Repository Policy

- Do not paste raw session logs, cookies, JWTs, signed URLs, provider payloads, screenshots with private data, or real user material into learning docs.
- Do not add generated course HTML exports directly to tracked source unless they are intentionally curated, reviewed, and linked from this index.
- Keep durable project knowledge in `docs/`; keep external course artifacts as links or concise summaries.
