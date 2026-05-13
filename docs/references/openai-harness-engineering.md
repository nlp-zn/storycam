# Reference: OpenAI Harness Engineering

Source: https://openai.com/zh-Hans-CN/index/harness-engineering/

This reference summarizes the ideas StoryCam is adopting from OpenAI's harness engineering article.

## Ideas We Adopt

1. **AGENTS.md is a map, not an encyclopedia.** Keep root instructions short and point agents to indexed docs.
2. **The repo is the record system.** Product decisions, architecture, plans, security rules, generated schemas, and references live in versioned files.
3. **Progressive disclosure.** Start with `AGENTS.md`, then `docs/README.md`, then the relevant product spec, plan, or architecture document.
4. **Agent readability is a design goal.** Structure code and docs so agents can inspect, verify, and modify them without hidden context.
5. **Plans are first-class artifacts.** Active plans, completed plans, and tech debt are tracked under `docs/exec-plans/`.
6. **Architecture and taste should be codified.** Boundaries, reliability, security, frontend patterns, and product sense should be written as small durable docs.
7. **Doc drift is a bug.** When implementation changes a decision, update the corresponding doc in the same change.

## StoryCam Structure

```text
AGENTS.md
README.md
docs/ARCHITECTURE.md
docs/design-docs/
docs/exec-plans/
docs/generated/
docs/product-specs/
docs/references/
docs/DESIGN.md
docs/FRONTEND.md
docs/PLANS.md
docs/PRODUCT_SENSE.md
docs/QUALITY_SCORE.md
docs/RELIABILITY.md
docs/SECURITY.md
```

## Practical Consequences

- Agents should not search randomly through old folders. They should start from indexes.
- Product specs and execution plans are separate.
- Generated schema summaries are allowed, but must say what generated or sourced them.
- Long references belong in `docs/references/`, not in `AGENTS.md`.
