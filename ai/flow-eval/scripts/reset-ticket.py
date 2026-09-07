#!/usr/bin/env python3
"""Reopen an SDD v2 ticket for a round-trip regeneration.

Given the path to a `*.task.<ID>.md` file it: flips the Meta Status and every Phases-Overview row to
TODO/unchecked, clears the Execution Log section back to its fresh header (the log is a per-run journal,
not part of the forward spec — a fresh execute writes it anew), and flips the matching Tracker row in the
sibling `*.3-tasks.md`. Sections 1-6 (Meta refs, Phases, BDD, Verification, Test Coverage) are the forward
spec and are left intact — that is exactly what sdd-execute is meant to rebuild the code from.
"""
import re
import sys
from pathlib import Path

EXEC_LOG_FRESH = (
    "<!--SECTION:EXECUTION_LOG-->\n"
    "## 7. Execution Log\n"
    "*(Round = одна попытка «выполнить и проверить». Событийные строки появляются только когда "
    "событие произошло. Словарь токенов — [tasks/README.md](../../tasks/README.md#execution-log-template).)*\n"
    "<!--/SECTION:EXECUTION_LOG-->"
)


def reopen_ticket(path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    task_id = re.search(r"\*\*Task-ID:\*\*\s*(\S+)", text)
    if not task_id:
        raise SystemExit(f"no Task-ID found in {path}")
    # Meta status → TODO
    text = re.sub(r"(\*\*Status:\*\*\s*)\[[ xX]\]\s*\w+", r"\1[ ] TODO", text, count=1)
    # Phases Overview + Phase headers: every checked box → unchecked
    text = re.sub(r"\|\s*\[[xX]\]\s*\|", "| [ ] |", text)
    # Execution log → fresh
    text = re.sub(
        r"<!--SECTION:EXECUTION_LOG-->.*?<!--/SECTION:EXECUTION_LOG-->",
        EXEC_LOG_FRESH,
        text,
        flags=re.DOTALL,
    )
    path.write_text(text, encoding="utf-8")
    return task_id.group(1)


def reopen_tracker(tasks_file: Path, task_id: str) -> bool:
    if not tasks_file.exists():
        return False
    text = tasks_file.read_text(encoding="utf-8")
    # A tracker row `| IB-script | ... | [x] DONE | ... |` → reset its status cell to TODO.
    pattern = re.compile(r"(\|\s*" + re.escape(task_id) + r"\s*\|.*?\|\s*)\[[ xX]\]\s*\w+(\s*\|)")
    new_text, n = pattern.subn(r"\1[ ] TODO\2", text)
    if n:
        tasks_file.write_text(new_text, encoding="utf-8")
    return bool(n)


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: reset-ticket.py <path/to/*.task.<ID>.md>")
    ticket = Path(sys.argv[1])
    task_id = reopen_ticket(ticket)
    # sibling tracker: <scope>.3-tasks.md in the same dir
    scope = ticket.name.split(".task.")[0]
    tracker_hit = reopen_tracker(ticket.with_name(f"{scope}.3-tasks.md"), task_id)
    print(f"reopened {task_id}: ticket=Status→TODO, tracker={'reset' if tracker_hit else 'row-not-found'}")


if __name__ == "__main__":
    main()
