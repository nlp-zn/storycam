import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const hookScript = resolve(repoRoot, ".codex/hooks/storycam_pr_gate_reminder.py");

function gitOutput(args: string[]): string {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
}

function resolveGitPath(filename: string): string {
  const gitDir = gitOutput(["rev-parse", "--git-dir"]);
  return resolve(repoRoot, gitDir, filename);
}

function runHook(payload: unknown): string {
  return execFileSync("python3", [hookScript], {
    cwd: repoRoot,
    encoding: "utf8",
    input: JSON.stringify(payload)
  });
}

describe("StoryCam PR gate Codex hook", () => {
  const markerPath = resolveGitPath("storycam-pr-gate-reminder-head");
  const pendingPath = resolveGitPath("storycam-pr-gate-pending.json");
  let backupDir: string;
  let markerBackup: string | null;
  let pendingBackup: string | null;

  beforeEach(() => {
    backupDir = mkdtempSync(join(tmpdir(), "storycam-pr-gate-hook-"));
    markerBackup = existsSync(markerPath) ? readFileSync(markerPath, "utf8") : null;
    pendingBackup = existsSync(pendingPath) ? readFileSync(pendingPath, "utf8") : null;
    rmSync(markerPath, { force: true });
    rmSync(pendingPath, { force: true });
  });

  afterEach(() => {
    if (markerBackup === null) {
      rmSync(markerPath, { force: true });
    } else {
      writeFileSync(markerPath, markerBackup, "utf8");
    }

    if (pendingBackup === null) {
      rmSync(pendingPath, { force: true });
    } else {
      writeFileSync(pendingPath, pendingBackup, "utf8");
    }

    rmSync(backupDir, { recursive: true, force: true });
  });

  it("emits a three-reviewer PR gate reminder after a successful Codex git push", () => {
    const output = runHook({
      hook_event_name: "PostToolUse",
      cwd: repoRoot,
      tool_use_id: "push-ok",
      tool_input: { cmd: "git push origin docs/pr-gate-three-reviewers" },
      tool_response: { exit_code: 0, output: "Everything up-to-date" }
    });

    const reminder = JSON.parse(output);
    const context = reminder.hookSpecificOutput.additionalContext;

    expect(reminder.systemMessage).toContain("StoryCam PR gate reminder");
    expect(context).toContain("three independent reports");
    expect(context).toContain("code-reviewer");
    expect(context).toContain("security-auditor");
    expect(context).toContain("test-engineer");
    expect(context).toContain("Do not run the AI review without confirmation");
  });

  it("supports the legacy pre/post pending handshake for Codex clients without post tool input", () => {
    runHook({
      hook_event_name: "PreToolUse",
      cwd: repoRoot,
      tool_use_id: "push-ok",
      tool_input: { cmd: "git push origin docs/pr-gate-three-reviewers" }
    });

    const output = runHook({
      hook_event_name: "PostToolUse",
      cwd: repoRoot,
      tool_use_id: "push-ok",
      tool_response: { exit_code: 0, output: "Everything up-to-date" }
    });

    const reminder = JSON.parse(output);
    const context = reminder.hookSpecificOutput.additionalContext;

    expect(reminder.systemMessage).toContain("StoryCam PR gate reminder");
    expect(context).toContain("three independent reports");
    expect(context).toContain("code-reviewer");
    expect(context).toContain("security-auditor");
    expect(context).toContain("test-engineer");
    expect(context).toContain("Do not run the AI review without confirmation");
  });

  it("does not remind after a failed Codex git push", () => {
    const output = runHook({
      hook_event_name: "PostToolUse",
      cwd: repoRoot,
      tool_use_id: "push-failed",
      tool_input: { cmd: "git push origin docs/pr-gate-three-reviewers" },
      tool_response: { exit_code: 1, output: "failed to push some refs" }
    });

    expect(output).toBe("");
  });

  it("does not emit output for non-push commands", () => {
    const output = runHook({
      hook_event_name: "PostToolUse",
      cwd: repoRoot,
      tool_use_id: "fetch",
      tool_input: { cmd: "git fetch origin --prune" },
      tool_response: { exit_code: 0, output: "" }
    });

    expect(output).toBe("");
  });

  it("ignores post-tool responses that do not match the pending git push", () => {
    runHook({
      hook_event_name: "PreToolUse",
      cwd: repoRoot,
      tool_use_id: "pending-push",
      tool_input: { cmd: "git push origin docs/pr-gate-three-reviewers" }
    });

    const output = runHook({
      hook_event_name: "PostToolUse",
      cwd: repoRoot,
      tool_use_id: "different-tool",
      tool_response: { exit_code: 0, output: "Everything up-to-date" }
    });

    expect(output).toBe("");
  });

  it("suppresses duplicate reminders for the same HEAD", () => {
    runHook({
      hook_event_name: "PreToolUse",
      cwd: repoRoot,
      tool_use_id: "first-push",
      tool_input: { cmd: "git push origin docs/pr-gate-three-reviewers" }
    });
    expect(
      runHook({
        hook_event_name: "PostToolUse",
        cwd: repoRoot,
        tool_use_id: "first-push",
        tool_response: { exit_code: 0, output: "Everything up-to-date" }
      })
    ).toContain("StoryCam PR gate reminder");

    runHook({
      hook_event_name: "PreToolUse",
      cwd: repoRoot,
      tool_use_id: "second-push",
      tool_input: { cmd: "git push origin docs/pr-gate-three-reviewers" }
    });

    const duplicateOutput = runHook({
      hook_event_name: "PostToolUse",
      cwd: repoRoot,
      tool_use_id: "second-push",
      tool_response: { exit_code: 0, output: "Everything up-to-date" }
    });

    expect(duplicateOutput).toBe("");
  });
});
