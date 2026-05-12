## Summary

-

## Verification

- [ ] Local fast gate: `scripts/check-local.sh`
- [ ] PR fast gate, if run locally: `scripts/check-pr.sh`
- [ ] Browser/visual check, if UI flow changed: `scripts/check-dev.sh` or targeted Playwright command

## CI Expectations

- PR CI runs the fast gate: lint, typecheck, unit tests, and build.
- Merge to `dev` runs the integration gate: PR fast gate plus E2E and visual QA.
- Promotion to `main` runs the release gate: dev integration gate plus mock verification and dependency audit.

## Codex PR Gate

- [ ] Produced three independent reviewer reports: `code-reviewer`, `security-auditor`, and `test-engineer`
- [ ] Merged reviewer verdicts into final `GO` / `NO-GO`
- [ ] No Critical/High blockers remain, or accepted risks are listed below
- [ ] Test coverage gaps are addressed or explicitly tracked
- [ ] Deterministic evidence is listed in this PR
- [ ] Rollback plan is clear for production-bound changes

## StoryCam Risk Areas

- [ ] Preserves the private mini-theater loop and story-world confirmation stage
- [ ] Does not expose raw private input, full prompts, signed URLs, provider secrets, or unredacted provider errors
- [ ] Auth, Supabase RLS, private storage, provider boundaries, and logs are unchanged or reviewed
- [ ] Async jobs still handle idempotency, timeout, cancellation, late results, and redacted failures
- [ ] Docs were updated when behavior, architecture, commands, or quality rules changed

## Accepted Risks

-
