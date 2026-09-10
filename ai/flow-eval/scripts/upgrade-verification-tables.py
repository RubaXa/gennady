#!/usr/bin/env python3
"""Mechanically upgrade a v1 (2-column) SDD Verification table to the current v2 (3-column) schema by
adding the `Role` column. This is the migration-completeness transformation the v1→v2 flow currently
skips: v1 tickets predate the `Role` column, so migrated tickets carry `| Command | Required by |`, which
`sdd-task`/`sdd-execute` reject with SDD_VERIFICATION_TABLE_INVALID — the exact wall a real execute run
hit. Role is assigned mechanically: a coverage reader (`testcov`) → coverage; an explicit test runner
(`npm test`) → probe; everything else → extra (the conservative default the schema prescribes). A
repo-local test-stand owned by the impl phase (e.g. `Tools/tests/probes.sh`) is `extra`, not `probe`:
`probe` requires an owning test phase (sdd-verify enforces it), which impl-only migrated tickets lack.

Usage: upgrade-verification-tables.py <ticket.md | dir> [...]   (edits in place; prints what changed)
"""
import re
import sys
from pathlib import Path

HDR_2COL = re.compile(r"^\|\s*Command\s*\|\s*Required by\s*\|\s*$")
SEP_2COL = re.compile(r"^\|[\s:-]+\|[\s:-]+\|\s*$")
ROW = re.compile(r"^\|(?P<cmd>.+?)\|(?P<req>.+?)\|\s*$")


def role_for(cmd: str) -> str:
    if "testcov" in cmd or "test:coverage" in cmd or "--coverage" in cmd:
        return "coverage"
    # `probe` is valid ONLY when an owning TEST phase maps the command in §6 Test Scenario Coverage
    # (sdd-verify enforces this). This mechanical shim cannot see phases, and its migrated targets are
    # impl-only, so a repo-local test-stand that is the impl phase's own evidence (e.g. Tools/tests/
    # probes.sh, Required-by "этот тикет") must be `extra`, NOT `probe` — mislabelling it `probe`
    # hard-blocks sdd-verify with ERR_CLI_SDD_VERIFY_PHASE_CONTEXT (confirmed on the cloud-ios round-trip,
    # EXPERIMENTS-LOG §H-iOS). Reserve `probe` for an explicit test-runner invocation.
    if re.search(r"\bnpm (run )?test\b", cmd):
        return "probe"
    return "extra"


def upgrade(text: str) -> tuple[str, int]:
    lines = text.splitlines(keepends=False)
    out, i, changed = [], 0, 0
    while i < len(lines):
        line = lines[i]
        if HDR_2COL.match(line) and i + 1 < len(lines) and SEP_2COL.match(lines[i + 1]):
            # rewrite header + separator, then every contiguous 2-col row until a blank/non-row line
            out.append("| Command | Required by | Role |")
            out.append("|---------|-------------|------|")
            i += 2
            while i < len(lines):
                m = ROW.match(lines[i])
                if not m:
                    break
                cmd = m.group("cmd").strip()
                out.append(f"| {cmd} | {m.group('req').strip()} | {role_for(cmd)} |")
                i += 1
            changed += 1
            continue
        out.append(line)
        i += 1
    result = "\n".join(out)
    if text.endswith("\n"):
        result += "\n"
    return result, changed


def iter_tickets(args):
    for a in args:
        p = Path(a)
        if p.is_dir():
            yield from sorted(p.rglob("*.task.*.md"))
        elif p.is_file():
            yield p


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    total = 0
    for t in iter_tickets(sys.argv[1:]):
        text = t.read_text(encoding="utf-8")
        new, n = upgrade(text)
        if n:
            t.write_text(new, encoding="utf-8")
            total += n
            print(f"  upgraded {n} table(s): {t}")
    print(f"done — {total} verification table(s) upgraded to 3-column v2 schema")


if __name__ == "__main__":
    main()
