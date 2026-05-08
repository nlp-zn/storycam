## Summary

-

## Verification

- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] E2E or visual check, if UI flow changed:

## Codex PR Gate

- [ ] Ran Codex PR gate with `code-reviewer`, `security-auditor`, and `test-engineer`
- [ ] No Critical/High blockers remain, or accepted risks are listed below
- [ ] Test coverage gaps are addressed or explicitly tracked
- [ ] Rollback plan is clear for production-bound changes

## StoryCam Risk Areas

- [ ] Preserves the private mini-theater loop and story-world confirmation stage
- [ ] Does not expose raw private input, full prompts, signed URLs, provider secrets, or unredacted provider errors
- [ ] Auth, Supabase RLS, private storage, provider boundaries, and logs are unchanged or reviewed
- [ ] Async jobs still handle idempotency, timeout, cancellation, late results, and redacted failures
- [ ] Docs were updated when behavior, architecture, commands, or quality rules changed

## Accepted Risks

-
