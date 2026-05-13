#!/usr/bin/env python3
import json
import re
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
PENDING_FILENAME = "storycam-pr-gate-pending.json"
REMINDER_FILENAME = "storycam-pr-gate-reminder-head"


def is_inside_repo(cwd: str) -> bool:
    try:
        Path(cwd).resolve().relative_to(REPO_ROOT)
        return True
    except (ValueError, OSError):
        return False


def extract_command(tool_input: object) -> str:
    if not isinstance(tool_input, dict):
        return ""

    command = tool_input.get("command") or tool_input.get("cmd")
    if isinstance(command, str):
        return command

    for key in ("input", "args"):
        nested = tool_input.get(key)
        if isinstance(nested, dict):
            nested_command = nested.get("command") or nested.get("cmd")
            if isinstance(nested_command, str):
                return nested_command

    return ""


def is_git_push(command: str) -> bool:
    return bool(re.search(r"(^|[;&|()\s])git\s+push(\s|$)", command))


def iter_values(value: object):
    yield value
    if isinstance(value, dict):
        for nested in value.values():
            yield from iter_values(nested)
    elif isinstance(value, list):
        for nested in value:
            yield from iter_values(nested)


def response_clearly_failed(tool_response: object) -> bool:
    for value in iter_values(tool_response):
        if isinstance(value, dict):
            for key in ("exit_code", "return_code", "returncode"):
                code = value.get(key)
                if isinstance(code, int) and code != 0:
                    return True

            status = value.get("status")
            if isinstance(status, str) and status.lower() in {
                "failed",
                "failure",
                "error",
                "cancelled",
                "canceled",
                "timed_out",
                "timeout",
            }:
                return True

        if isinstance(value, str):
            if re.search(r"(process exited with code|exit code|exited with code)\s+[1-9]\d*", value, re.I):
                return True

    return False


def git_output(*args: str) -> str:
    return subprocess.check_output(
        ["git", "-C", str(REPO_ROOT), *args],
        stderr=subprocess.DEVNULL,
        text=True,
    ).strip()


def git_dir() -> Path:
    git_dir = Path(git_output("rev-parse", "--git-dir"))
    if not git_dir.is_absolute():
        git_dir = REPO_ROOT / git_dir
    return git_dir


def marker_path() -> Path:
    return git_dir() / REMINDER_FILENAME


def pending_path() -> Path:
    return git_dir() / PENDING_FILENAME


def current_head() -> str:
    return git_output("rev-parse", "HEAD")


def already_reminded_for_head(head: str) -> bool:
    try:
        path = marker_path()
        return path.exists() and path.read_text(encoding="utf-8").strip() == head
    except (OSError, subprocess.CalledProcessError):
        return False


def mark_reminded(head: str) -> None:
    try:
        path = marker_path()
        path.write_text(f"{head}\n", encoding="utf-8")
    except (OSError, subprocess.CalledProcessError):
        pass


def load_pending() -> dict:
    try:
        path = pending_path()
        if not path.exists():
            return {}
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (json.JSONDecodeError, OSError, subprocess.CalledProcessError):
        return {}


def write_pending(payload: dict) -> None:
    try:
        pending_path().write_text(json.dumps(payload), encoding="utf-8")
    except (OSError, subprocess.CalledProcessError):
        pass


def clear_pending() -> None:
    try:
        pending_path().unlink(missing_ok=True)
    except (OSError, subprocess.CalledProcessError):
        pass


def handle_pre_tool_use(payload: dict) -> int:
    command = extract_command(payload.get("tool_input"))
    if not is_git_push(command):
        return 0

    tool_use_id = payload.get("tool_use_id")
    if not isinstance(tool_use_id, str) or not tool_use_id:
        return 0

    write_pending(
        {
            "tool_use_id": tool_use_id,
            "command": command,
            "turn_id": payload.get("turn_id"),
        }
    )
    return 0


def handle_post_tool_use(payload: dict) -> int:
    tool_input_command = extract_command(payload.get("tool_input"))
    tool_use_id = payload.get("tool_use_id")
    direct_git_push = is_git_push(tool_input_command)

    if not direct_git_push:
        pending = load_pending()
        pending_tool_use_id = pending.get("tool_use_id")
        if not isinstance(pending_tool_use_id, str) or pending_tool_use_id != tool_use_id:
            return 0

    clear_pending()

    if response_clearly_failed(payload.get("tool_response")):
        return 0

    try:
        head = current_head()
    except subprocess.CalledProcessError:
        return 0

    if already_reminded_for_head(head):
        return 0

    mark_reminded(head)

    message = (
        "StoryCam git push appears to have succeeded. Before ending the turn, ask the user: "
        "\"Run the StoryCam PR gate now?\" If they say yes, run the StoryCam PR gate from "
        "docs/PR_REVIEW.md and produce three independent reports from code-reviewer, "
        "security-auditor, and test-engineer, then merge the findings into GO/NO-GO with "
        "deterministic evidence, blockers, verification evidence, coverage gaps, and rollback notes. "
        "Do not run the AI review without confirmation."
    )

    print(
        json.dumps(
            {
                "systemMessage": "StoryCam PR gate reminder: ask whether to run the AI review gate.",
                "hookSpecificOutput": {
                    "hookEventName": "PostToolUse",
                    "additionalContext": message,
                },
            }
        )
    )
    return 0


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError:
        return 0

    cwd = payload.get("cwd")
    if not isinstance(cwd, str) or not is_inside_repo(cwd):
        return 0

    hook_event_name = payload.get("hook_event_name")
    if hook_event_name == "PreToolUse":
        return handle_pre_tool_use(payload)
    if hook_event_name == "PostToolUse":
        return handle_post_tool_use(payload)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
