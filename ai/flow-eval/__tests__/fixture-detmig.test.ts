// @file: E-06/E-07 (batch 22) — proves the whole "migrator completeness follows red-first" thesis
//   end to end on `fixtures/fixture-detmig/core.task.DETMIG-1.md`: the real, anchored-but-not-table-
//   upgraded ticket is RED on `sdd-check` (SDD_VERIFICATION_TABLE_INVALID); the real migrator
//   (`upgradeVerificationTable`/`scaffoldFirstRound`, shared/sdd/anchor-inject.ts, wired into
//   `sdd-migrate anchors`) turns it GREEN; the same before/after `sdd-check` output fed through
//   `computeMigrationGrade` (E-07's bar) flips FAIL → PASS. A companion case proves `sdd-state`
//   continues to print the concrete scope type for a migrated project ([SCOPES] `type` column).
// @consumers: N/A (test file)
// @tasks: N/A

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { computeMigrationGrade, parseFindingHistogram } from '../migration-grade.ts';
import { parseTicketCoveragePolicy, parseVerificationTable } from '../../../shared/sdd/ticket.ts';
import { extractSection } from '../../../shared/sdd/section.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, 'fixtures', 'fixture-detmig', 'core.task.DETMIG-1.md');

const KEY_DIRECTIVE_FILES = [
  'router.directive.xml',
  'execute.directive.xml',
  'phase-execution-protocol.directive.xml',
  'preflight-protocol.directive.xml',
  'formats/requirement-entry-format.xml',
];

function installDirectives(root: string): void {
  const at = join(root, 'ai', 'directives', 'sdd-v2');
  for (const f of KEY_DIRECTIVE_FILES) {
    const target = join(at, f);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, '<directive/>\n', 'utf-8');
  }
}

type CheckModule = typeof import('../../../cli/cmd/sdd-check/sdd-check.cmd.ts');
type MigrateModule = typeof import('../../../cli/cmd/sdd-migrate/sdd-migrate.cmd.ts');
type StateModule = typeof import('../../../cli/cmd/sdd-state/sdd-state.cmd.ts');

let checkMod: CheckModule;
let migrateMod: MigrateModule;
let stateMod: StateModule;
let origExit: typeof process.exit;
let origArgv: string[];
let dir: string;
let ticket: string;
/** @purpose The pre-migration `sdd-check` output — the real baseline computeMigrationGrade needs
 *  (an empty `{}` baseline would wrongly count this fixture's PRE-EXISTING content debt — the
 *  missing owning spec, sandboxed rule paths, no negative BDD scenario — as migration-introduced). */
let capturedBefore: string;

describe('E-06/E-07 (batch 22): fixture-detmig — migrator turns the red-first bar green', () => {
  before(async () => {
    origExit = process.exit;
    origArgv = process.argv;
    process.exit = ((_code?: number) => undefined) as typeof process.exit;

    dir = mkdtempSync(join(tmpdir(), 'fixture-detmig-'));
    ticket = join(dir, 'core.task.DETMIG-1.md');
    writeFileSync(ticket, readFileSync(FIXTURE, 'utf-8'), 'utf-8');

    process.argv = ['node', 'gennady', 'sdd-check'];
    checkMod = await import('../../../cli/cmd/sdd-check/sdd-check.cmd.ts');
    process.argv = ['node', 'gennady', 'sdd-migrate'];
    migrateMod = await import('../../../cli/cmd/sdd-migrate/sdd-migrate.cmd.ts');
    process.argv = ['node', 'gennady', 'sdd-state'];
    stateMod = await import('../../../cli/cmd/sdd-state/sdd-state.cmd.ts');
  });

  after(() => {
    process.exit = origExit;
    process.argv = origArgv;
    rmSync(dir, { recursive: true, force: true });
  });

  it('RED — the un-migrated fixture fails sdd-check on SDD_VERIFICATION_TABLE_INVALID (E-07 bar, before E-06)', async () => {
    const before = await checkMod.run(
      ['node', 'gennady', 'sdd-check', '--task', 'core.task.DETMIG-1.md'],
      dir
    );
    assert.equal(before.exitCode, 1);
    assert.match(before.text, /SDD_VERIFICATION_TABLE_INVALID/);
    capturedBefore = before.text;

    // Baseline-diff against an EMPTY pre-migration snapshot (the "first time ever checked" case,
    // e.g. a brand-new migration run with no prior sdd-check history) — SDD_VERIFICATION_TABLE_INVALID
    // is critical regardless of what baseline this run started from.
    const grade = computeMigrationGrade({}, 'FLOW_VERSION=v2', before.text);
    assert.equal(grade.pass, false, grade.detail);
    assert.ok(grade.introduced.some((i) => i.code === 'SDD_VERIFICATION_TABLE_INVALID'));
  });

  it('the real migrator upgrades the table + marker + Round-1 shape (sdd-migrate anchors --write)', async () => {
    const beforeText = readFileSync(ticket, 'utf-8');
    assert.doesNotMatch(beforeText, /PHASE_RECEIPTS:v1/);

    const outcome = await migrateMod.run([
      'node',
      'gennady',
      'sdd-migrate',
      'anchors',
      ticket,
      '--write',
    ]);
    assert.equal(outcome.ok, true, outcome.ok ? '' : outcome.message);
    if (outcome.ok) {
      assert.match(outcome.text, /VERIFICATION table \(2-col → 3-col, Role added\)/);
      assert.match(outcome.text, /PHASE_RECEIPTS:v1 marker/);
      assert.match(outcome.text, /Execution Log Round 1 \(scaffolded, all unchecked\)/);
    }

    const afterText = readFileSync(ticket, 'utf-8');
    assert.match(afterText, /<!--PHASE_RECEIPTS:v1-->/);
    assert.match(afterText, /\| Command \| Required by \| Role \|/);
    assert.match(afterText, /### Round 1/);

    // sdd-task's own acceptance gate (cli/cmd/sdd-task/sdd-task.cmd.ts) parses coverage policy the
    // same way sdd-check does — this fixture declares no coverage command, so it stays legacy
    // (grandfathered, accepted), never invalid.
    const verification = extractSection(afterText, 'VERIFICATION');
    assert.equal(verification.status, 'ok');
    if (verification.status === 'ok') {
      const table = parseVerificationTable(verification.content);
      assert.equal(table.ok, true, table.ok ? '' : table.issues.join('; '));
      const policy = parseTicketCoveragePolicy(verification.content);
      assert.equal(policy.status, 'legacy');
    }
  });

  it('GREEN — the migrated ticket is accepted by sdd-check, and the migration bar itself flips to PASS (E-06 closes the loop L-15 opened)', async () => {
    const after = await checkMod.run(
      ['node', 'gennady', 'sdd-check', '--task', 'core.task.DETMIG-1.md'],
      dir
    );
    assert.doesNotMatch(after.text, /SDD_VERIFICATION_TABLE_INVALID/);
    assert.doesNotMatch(after.text, /SDD_EXECUTION_LOG_ROUND_MISSING/); // the marker's own new requirement, also satisfied
    assert.doesNotMatch(after.text, /SDD_COVERAGE_POLICY_INVALID/);

    // Pre-existing authoring debt (missing owning spec file, sandboxed rule paths, no negative BDD
    // scenario) is untouched on purpose — a migration fixes migration-integrity, not content debt.
    assert.match(after.text, /SDD_BROKEN_SPEC_REF/);
    assert.match(after.text, /SDD_BDD_MISSING_NEGATIVE/);

    // The real baseline: the histogram from the SAME fixture's pre-migration `sdd-check` run
    // (captured above) — this is how migration-grade.ts is actually used (baseline snapshot BEFORE
    // the worker/migrator runs, per docs/EVAL-SPEC.md). Pre-existing debt is backlog either way; the
    // point proven here is that nothing NEW appeared and the one critical code disappeared.
    const baseline = parseFindingHistogram(capturedBefore);
    const grade = computeMigrationGrade(baseline, 'FLOW_VERSION=v2', after.text);
    assert.equal(grade.pass, true, grade.detail);
    assert.deepEqual(grade.introduced, []); // strictly fewer/equal findings — migration only improved things
  });
});

describe('E-06 (batch 22): sdd-state prints the migrated project scope type ([SCOPES] column)', () => {
  let root: string;
  let origExit2: typeof process.exit;
  let origArgv2: string[];
  let stateMod2: StateModule;

  before(async () => {
    origExit2 = process.exit;
    origArgv2 = process.argv;
    process.exit = ((_code?: number) => undefined) as typeof process.exit;

    root = mkdtempSync(join(tmpdir(), 'fixture-detmig-state-'));
    mkdirSync(join(root, 'specs', 'demo'), { recursive: true });
    writeFileSync(
      join(root, 'specs', 'README.md'),
      [
        '# proj',
        '## Scopes',
        '| Scope | Type | Spec | Description |',
        '|---|---|---|---|',
        '| [`demo`](./demo/demo.spec.md) | library | ✅ | demo scope, migrated by fixture-detmig |',
      ].join('\n'),
      'utf-8'
    );
    writeFileSync(
      join(root, 'specs', 'demo', 'demo.spec.md'),
      '# demo\n\n<!--SECTION:SCOPE_TYPE-->\nlibrary\n<!--/SECTION:SCOPE_TYPE-->\n',
      'utf-8'
    );
    installDirectives(root);

    process.argv = ['node', 'gennady', 'sdd-state'];
    stateMod2 = await import('../../../cli/cmd/sdd-state/sdd-state.cmd.ts');
  });

  after(() => {
    process.exit = origExit2;
    process.argv = origArgv2;
    rmSync(root, { recursive: true, force: true });
  });

  it('[SCOPES] carries the concrete type (library) for the migrated scope, per D-4/D-49 scope-type routing', async () => {
    const o = await stateMod2.run(['node', 'gennady', 'sdd-state', root]);
    assert.equal(o.ok, true);
    if (o.ok) {
      assert.match(o.text, /\[SCOPES\]/);
      assert.match(
        o.text,
        /demo\tlibrary\tdone\tdemo scope, migrated by fixture-detmig\tspecs\/demo\/demo\.spec\.md/
      );
    }
  });
});
