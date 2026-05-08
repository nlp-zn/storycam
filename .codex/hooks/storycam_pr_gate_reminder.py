#!/usr/bin/env python3
import json
import re
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]


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


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError:
        return 0

    cwd = payload.get("cwd")
    if not isinstance(cwd, str) or not is_inside_repo(cwd):
        return 0

    command = extract_command(payload.get("tool_input"))
    if not is_git_push(command):
        return 0

    message = (
        "StoryCam git push detected. After deterministic checks pass, ask the user whether "
        "to run the StoryCam PR gate now: code-reviewer + security-auditor + test-engineer, "
        "merged into GO/NO-GO with blockers, verification evidence, coverage gaps, and rollback plan."
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


if __name__ == "__main__":
    raise SystemExit(main())
