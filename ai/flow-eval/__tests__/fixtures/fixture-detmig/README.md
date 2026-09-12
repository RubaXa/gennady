# fixture-detmig

Deterministic-migration fixture (E-06/E-07, batch 22). `core.task.DETMIG-1.md` is a ticket that
already carries every v2 `<!--SECTION:NAME-->` anchor (what `sdd-migrate anchors` produces today)
but is otherwise frozen at exactly the state a v1→v2 migration used to leave it in:

- Verification table is 2-column (`| Command | Required by |`) — the v2 schema needs a third `Role`
  column, and `sdd-check` rejects the 2-column shape with `SDD_VERIFICATION_TABLE_INVALID`.
- No `PHASE_RECEIPTS:v1` / `COVERAGE_POLICY:v1` markers — v1 never had them.
- Execution Log is the migrator's placeholder line, not a Round-1 phase-block shape.

Not an LLM eval fixture (no `scenarios.json` entry, no live run) — a plain, offline, both-way unit
fixture for `../fixture-detmig.test.ts`, which:

1. Proves this file is RED on `sdd-check` (`SDD_VERIFICATION_TABLE_INVALID`) before the migrator's
   table-upgrade capability exists — the same bar E-07 made migration-critical.
2. Runs the real migrator (`upgradeVerificationTable` + `scaffoldFirstRound`,
   `shared/sdd/anchor-inject.ts`) over it.
3. Proves the result is GREEN on the same bar, and that `sdd-task`'s own coverage-policy parser
   accepts it — E-06.
4. Feeds both captured `sdd-check` outputs into `computeMigrationGrade` (`migration-grade.ts`) to
   prove the migration verdict itself flips from FAIL to PASS — red-first, then green, per L-15.

Every other finding this fixture carries (`SDD_BDD_MISSING_NEGATIVE`, the sandboxed `..`-path rule
references, `SDD_BROKEN_SPEC_REF` for the intentionally-absent owning spec) is untouched by the
migrator on purpose — pre-existing content/authoring debt is backlog, not something a migration run
should silently paper over (docs/EVAL-SPEC.md's MIGRATION rule dictionary).
