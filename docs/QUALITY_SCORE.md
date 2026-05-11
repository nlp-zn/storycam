# Quality Score

Use this as a review rubric for major changes.

## Score Areas

| Area | Question |
| --- | --- |
| Product fit | Does this preserve the private mini-theater loop? |
| Agent readability | Can an agent find the relevant spec, plan, and architecture boundary? |
| Security | Are auth, RLS, storage, provider keys, logs, and signed URLs safe? |
| Reliability | Are job retries, cancellation, timeout, and late results handled? |
| UX completeness | Are loading, empty, error, retry, stale, and success states present? |
| Testability | Is there an explicit verification command or manual check? |

## Minimum Bar

A change is not ready if it:

- skips story world confirmation,
- exposes internal prompt/provider/shot-table details,
- bypasses Supabase RLS or server-only provider boundaries,
- stores raw private input in logs,
- creates public sharing in Phase 1,
- lacks tests or a documented verification path.

## PR Gate

Before opening or merging a meaningful PR, follow `docs/PR_REVIEW.md`:

- run the deterministic local or CI gate,
- produce three independent reviewer reports from `code-reviewer`, `security-auditor`, and `test-engineer`,
- merge the three reports into a final `GO` or `NO-GO`,
- resolve Critical and High findings unless the project owner explicitly accepts the risk,
- include deterministic evidence, reviewer summaries, accepted risks, and rollback notes in the PR.
