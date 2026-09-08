#!/usr/bin/env python3
"""Deterministic per-session metrics for the SDD execute flow — the improvement/non-regression proof the
operator requires at the end of every session. Given a run id, the OpenCode session, and the fixture dir,
it emits ONE machine-readable JSON record and appends it to .results/metrics-ledger.jsonl. Purely
deterministic (no LLM): session-side counts come from the OpenCode SQLite DB; state-side signals come from
reading the fixture on disk. Compare two runs with `--compare <runA> <runB>` to assert non-regression.

Usage:
  session-metrics.py record --run <id> --session <ses_...|title-frag> --fixture <dir> [--bench-out <file>]
  session-metrics.py compare <runA> <runB>      # non-regression verdict: steps/tool_calls ≤, completion ≥
"""
import json
import os
import re
import sqlite3
import sys
from collections import Counter

# GAP-E-4: all three used to be (or resolve to) a specific author's absolute path — DB via a fixed
# XDG-style guess, GEN as a literal worktree name that does not exist on a clean clone, and LEDGER
# derived from it. Each is now overridable via env var, with a default computed relative to this
# script's own location (three levels up: ai/flow-eval/scripts/ -> repo root) rather than hardcoded.
DB = os.environ.get("OPENCODE_DB", os.path.expanduser("~/.local/share/opencode/opencode.db"))
GEN = os.environ.get(
    "GEN_ROOT",
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))),
)
LEDGER = os.environ.get("METRICS_LEDGER", f"{GEN}/ai/flow-eval/.results/metrics-ledger.jsonl")


def resolve_session(con, arg):
    if arg.startswith("ses_"):
        return arg
    row = con.execute(
        "SELECT id FROM session WHERE title LIKE ? ORDER BY time_created DESC LIMIT 1", (f"%{arg}%",)
    ).fetchone()
    if not row:
        sys.exit(f"no session matching '{arg}'")
    return row[0]


def session_metrics(ses):
    con = sqlite3.connect(DB)
    ses = resolve_session(con, ses)
    rows = con.execute(
        "SELECT p.data FROM part p JOIN message m ON p.message_id=m.id "
        "WHERE p.session_id=? ORDER BY m.time_created, p.rowid",
        (ses,),
    ).fetchall()
    by_tool = Counter()
    steps = reasoning_tok = output_tok = 0
    for (data,) in rows:
        try:
            d = json.loads(data)
        except Exception:
            continue
        t = d.get("type")
        if t == "tool":
            by_tool[d.get("tool")] += 1
        elif t == "step-finish":
            steps += 1
            u = d.get("tokens") or d.get("usage") or {}
            if isinstance(u, dict):
                reasoning_tok += u.get("reasoning") or 0
                output_tok += u.get("output") or 0
    return {
        "session": ses,
        "tool_calls_total": sum(by_tool.values()),
        "by_tool": dict(by_tool),
        "writes": by_tool.get("write", 0) + by_tool.get("edit", 0),
        "steps": steps,
        "reasoning_tokens": reasoning_tok,
        "output_tokens": output_tok,
    }


def _has(path):
    return os.path.isfile(path)


def _read(path):
    try:
        return open(path, encoding="utf-8").read()
    except Exception:
        return ""


def state_metrics(fixture):
    guard = f"{fixture}/Tools/check-swiftlint-exceptions.sh"
    ticket = f"{fixture}/specs/infra-base/infra-base.task.IB-script.md"
    spec = f"{fixture}/specs/infra-base/infra-base.spec.md"
    tx = _read(ticket)
    sx = _read(spec)  # group audit/review receipts live on the OWNING SPEC (group-scoped)
    log = re.search(r"<!--SECTION:EXECUTION_LOG-->(.*?)<!--/SECTION:EXECUTION_LOG-->", tx, re.S)
    log_body = log.group(1) if log else ""
    status = re.search(r"\*\*Status:\*\*\s*\[[ xX]\]\s*\w+", tx)
    return {
        "guard_written": _has(guard),
        "guard_lines": len(_read(guard).splitlines()) if _has(guard) else 0,
        "ticket_status": (status.group(0).split("**Status:**")[1].strip() if status else "?"),
        # a closed round has a checked DONE line inside the execution log
        "round_closed": bool(re.search(r"- \[x\]\s*`[^`]*`\s*DONE", log_body)),
        "impl_receipt": "SDD_PHASE_RECEIPT" in tx,
        "audit_receipt": "SDD_AUDIT_RECEIPT" in sx,   # CLI-written group receipt on the spec
        "review_receipt": "SDD_REVIEW_RECEIPT" in sx,
    }


def bench_soft(bench_out):
    """Parse a roundtrip-grade bench output file for the regen soft score (optional)."""
    if not bench_out or not _has(bench_out):
        return None
    txt = _read(bench_out)
    m = re.search(r"Regenerated\s*:\s*(\d+)/(\d+)\s*soft", txt)
    return f"{m.group(1)}/{m.group(2)}" if m else None


def record(args):
    run = args["run"]
    rec = {"run": run}
    rec.update(session_metrics(args["session"]))
    rec.update(state_metrics(args["fixture"]))
    b = bench_soft(args.get("bench_out"))
    if b:
        rec["bench_soft"] = b
    os.makedirs(os.path.dirname(LEDGER), exist_ok=True)
    with open(LEDGER, "a", encoding="utf-8") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    print(json.dumps(rec, ensure_ascii=False, indent=2))


def load_run(run):
    if not _has(LEDGER):
        sys.exit("no metrics ledger yet")
    recs = [json.loads(l) for l in open(LEDGER, encoding="utf-8") if l.strip()]
    matches = [r for r in recs if r.get("run") == run]
    if not matches:
        sys.exit(f"run '{run}' not in ledger")
    return matches[-1]


def compare(a, b):
    ra, rb = load_run(a), load_run(b)
    print(f"# Non-regression: {a} → {b}")
    ok = True

    def cmp(field, better="lower"):
        nonlocal ok
        va, vb = ra.get(field), rb.get(field)
        if isinstance(va, (int, float)) and isinstance(vb, (int, float)):
            regressed = vb > va if better == "lower" else vb < va
            flag = "REGRESSED" if regressed else "ok"
            if regressed:
                ok = False
            print(f"  {field:18} {va} → {vb}  [{better} better] {flag}")

    for f in ("steps", "tool_calls_total", "reasoning_tokens"):
        cmp(f, "lower")
    # completion signals must not regress
    for f in ("guard_written", "round_closed", "impl_receipt", "audit_receipt", "review_receipt"):
        va, vb = ra.get(f), rb.get(f)
        reg = bool(va) and not bool(vb)
        if reg:
            ok = False
        print(f"  {f:18} {va} → {vb}  [completion] {'REGRESSED' if reg else 'ok'}")
    print(f"  ticket_status      {ra.get('ticket_status')} → {rb.get('ticket_status')}")
    print(f"VERDICT: {'PASS — no regression' if ok else 'FAIL — regression detected'}")
    sys.exit(0 if ok else 1)


def gate(fixture):
    """Deterministic completion gate (red-first). If an artifact was built, the ticket MUST have reached
    a real DONE via a closed round; once the receipt mechanism lands, audit+review receipts too. Exits
    non-zero (RED) when the artifact exists but the ticket was abandoned — the exact fc2 defect."""
    s = state_metrics(fixture)
    reasons = []
    if s["guard_written"]:
        if "[x]" not in s["ticket_status"]:
            reasons.append(f"artifact built but ticket_status={s['ticket_status']} (not DONE)")
        if not s["round_closed"]:
            reasons.append("artifact built but no closed execution-log round")
        if not s["audit_receipt"]:
            reasons.append("no group audit receipt (SDD_AUDIT_RECEIPT absent)")
        if not s["review_receipt"]:
            reasons.append("no group code-review receipt (SDD_REVIEW_RECEIPT absent)")
    print(json.dumps({"fixture": fixture, **s}, ensure_ascii=False, indent=2))
    if reasons:
        print("COMPLETION GATE: RED")
        for r in reasons:
            print(f"  - {r}")
        sys.exit(1)
    print("COMPLETION GATE: GREEN")
    sys.exit(0)


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    if sys.argv[1] == "gate":
        fx = next((sys.argv[i + 1] for i, x in enumerate(sys.argv) if x == "--fixture"), None)
        if not fx:
            sys.exit("gate needs --fixture <dir>")
        gate(fx)
    elif sys.argv[1] == "record":
        a = {}
        for i, x in enumerate(sys.argv):
            if x in ("--run", "--session", "--fixture", "--bench-out") and i + 1 < len(sys.argv):
                a[x.lstrip("-").replace("-", "_")] = sys.argv[i + 1]
        for req in ("run", "session", "fixture"):
            if req not in a:
                sys.exit(f"missing --{req}")
        record(a)
    elif sys.argv[1] == "compare" and len(sys.argv) == 4:
        compare(sys.argv[2], sys.argv[3])
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
