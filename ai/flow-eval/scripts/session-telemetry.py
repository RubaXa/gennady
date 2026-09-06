#!/usr/bin/env python3
"""Extract full worker telemetry from an OpenCode session — the observability layer every flow-eval run
must produce automatically. Given a session id (or a title fragment to resolve one), it reports: every
tool call in order with its input and a head/tail of its output, a breakdown by tool, the files the worker
read, each reasoning/plan step, token usage per step, any crash/error signatures in tool outputs, and
exactly where the worker stopped. Read-only SQLite; never writes.

Usage:
  session-telemetry.py <session_id|title-fragment> [--full] [--grep TEXT] [--tool NAME]
"""
import json
import os
import re
import sqlite3
import sys

DB = os.path.expanduser("~/.local/share/opencode/opencode.db")
CRASH = re.compile(r"Bus error|Segmentation fault|SIGBUS|SIGSEGV|Fatal error|core dumped|"
                   r"command not found|No such file|Traceback|panic:", re.I)


def resolve_session(con, arg):
    if arg.startswith("ses_"):
        return arg
    rows = con.execute(
        "SELECT id,title,time_created FROM session WHERE title LIKE ? ORDER BY time_created DESC LIMIT 5",
        (f"%{arg}%",),
    ).fetchall()
    if not rows:
        sys.exit(f"no session matching '{arg}'")
    if len(rows) > 1:
        print("multiple sessions match — pass an id:")
        for r in rows:
            print(f"  {r[0]}  {r[1]}")
        sys.exit(1)
    return rows[0][0]


def parts_in_order(con, ses):
    # order by the message time, then part rowid, to reconstruct the real timeline
    rows = con.execute(
        "SELECT m.time_created, p.data FROM part p JOIN message m ON p.message_id=m.id "
        "WHERE p.session_id=? ORDER BY m.time_created, p.rowid",
        (ses,),
    ).fetchall()
    for _, data in rows:
        try:
            yield json.loads(data)
        except Exception:
            continue


def clip(s, n):
    s = s or ""
    return s if len(s) <= n else s[:n] + f" …(+{len(s)-n} chars)"


def input_summary(tool, inp):
    if not isinstance(inp, dict):
        return str(inp)[:200]
    if tool == "bash":
        return clip(inp.get("command", ""), 400)
    if tool in ("read", "write", "edit"):
        return inp.get("filePath") or inp.get("path") or json.dumps(inp)[:200]
    if tool in ("grep", "glob"):
        return json.dumps({k: inp[k] for k in inp if k in ("pattern", "path", "query")})[:200]
    return clip(json.dumps(inp), 200)


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    arg = sys.argv[1]
    full = "--full" in sys.argv
    grep = next((sys.argv[i + 1] for i, a in enumerate(sys.argv) if a == "--grep"), None)
    only_tool = next((sys.argv[i + 1] for i, a in enumerate(sys.argv) if a == "--tool"), None)

    con = sqlite3.connect(DB)
    ses = resolve_session(con, arg)
    title = con.execute("SELECT title FROM session WHERE id=?", (ses,)).fetchone()[0]

    tool_calls, reads, reasonings, steps = [], [], [], []
    tokens = {"input": 0, "output": 0, "reasoning": 0}
    for d in parts_in_order(con, ses):
        t = d.get("type")
        if t == "tool":
            st = d.get("state", {})
            tool_calls.append({
                "tool": d.get("tool"),
                "status": st.get("status"),
                "input": input_summary(d.get("tool"), st.get("input")),
                "output": st.get("output", ""),
            })
            if d.get("tool") == "read":
                fp = (st.get("input") or {}).get("filePath")
                if fp:
                    reads.append(fp)
        elif t == "reasoning":
            reasonings.append(d.get("text", ""))
        elif t == "step-finish":
            u = d.get("tokens") or d.get("usage") or {}
            for k in ("input", "output", "reasoning"):
                tokens[k] += (u.get(k) or 0) if isinstance(u, dict) else 0
            steps.append(d)

    # ---- report ----
    print(f"# Session telemetry — {title}\n  id={ses}\n")
    from collections import Counter
    by_tool = Counter(c["tool"] for c in tool_calls)
    print(f"## Summary")
    print(f"  tool calls : {len(tool_calls)}  ({', '.join(f'{k}×{v}' for k,v in by_tool.most_common())})")
    print(f"  steps      : {len(steps)}   reasoning blocks: {len(reasonings)}")
    print(f"  files read : {len(reads)} ({len(set(reads))} unique)")
    if any(tokens.values()):
        print(f"  tokens     : in={tokens['input']} out={tokens['output']} reasoning={tokens['reasoning']}")
    crashes = [(i, c) for i, c in enumerate(tool_calls) if CRASH.search(c["output"] or "")]
    print(f"  crash/error signatures in tool outputs: {len(crashes)}")
    print()

    # crash detail — the crux for 'where did it stall'
    if crashes:
        print("## Crash/error signatures (tool output excerpts)")
        for i, c in crashes:
            m = CRASH.search(c["output"])
            around = c["output"][max(0, m.start() - 120): m.end() + 200]
            print(f"  [#{i} {c['tool']}] input: {c['input']}")
            print(f"      …{clip(around, 400)}…\n")

    # repeated bash commands — the 'stuck' signal
    bash = [c for c in tool_calls if c["tool"] == "bash"]
    norm = Counter(re.sub(r"\s+", " ", c["input"]).strip() for c in bash)
    reps = [(cmd, n) for cmd, n in norm.items() if n >= 2]
    if reps:
        print("## Repeated bash commands (>=2× — stuck signal)")
        for cmd, n in sorted(reps, key=lambda x: -x[1]):
            print(f"  {n}×  {clip(cmd, 300)}")
        print()

    print("## Files read (in order)")
    for f in reads:
        print(f"  {f}")
    print()

    print("## Tool timeline")
    for i, c in enumerate(tool_calls):
        if only_tool and c["tool"] != only_tool:
            continue
        head = clip((c["output"] or "").strip().replace("\n", " ⏎ "), 220 if not full else 4000)
        flag = "  ⟵CRASH" if CRASH.search(c["output"] or "") else ""
        print(f"  [{i:02d}] {c['tool']:6} {c['status']:9} :: {clip(c['input'],140)}{flag}")
        if c["tool"] == "bash" or full or flag:
            print(f"        out: {head}")
    print()

    print("## Reasoning / plan steps (what the worker intended)")
    for i, r in enumerate(reasonings):
        if grep and grep.lower() not in r.lower():
            continue
        print(f"  [{i:02d}] {clip(r.strip(), 500 if not full else 6000)}\n")

    # where it stopped
    print("## Where it stopped (last 3 tool calls)")
    for c in tool_calls[-3:]:
        print(f"  {c['tool']:6} {c['status']:9} :: {clip(c['input'],140)}")
        print(f"      out: {clip((c['output'] or '').strip().replace(chr(10),' ⏎ '), 500)}")


if __name__ == "__main__":
    main()
