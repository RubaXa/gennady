// @file: Integration tests for SddCheckCommand#run — per-ticket + project-wide checks, exit codes.
// @consumers: gennady.ts
// @tasks: N/A

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, relative, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';

type CheckModule = typeof import('../sdd-check.cmd.ts');

let mod: CheckModule;
let origExit: typeof process.exit;
let origArgv: string[];
let dir: string;

const CLEAN_TICKET = [
  '<!--SECTION:META-->',
  '- **Task-ID:** cli-foo',
  '- **Status:** [x] DONE',
  '<!--/SECTION:META-->',
  '<!--SECTION:EXECUTION_LOG-->',
  '- [x] `2026-06-21T10:00:00Z` DONE',
  '<!--/SECTION:EXECUTION_LOG-->',
].join('\n');

const FABRICATED = CLEAN_TICKET.replace(
  '- [x] `2026-06-21T10:00:00Z` DONE',
  '- [x] `2026-06-21T10:00:00Z` ver `<cmd>` → pass'
);

const TICKET_BROKEN_RULE = [
  '<!--SECTION:META-->',
  '- **Task-ID:** cli-foo',
  '- **Status:** [ ] TODO',
  '<!--/SECTION:META-->',
  '- **Rules:**',
  '  - [ai/directives/coding/x.xml](./missing-rule.xml)',
  '<!--SECTION:EXECUTION_LOG-->',
  '- pending',
  '<!--/SECTION:EXECUTION_LOG-->',
].join('\n');

function argv(...rest: string[]): string[] {
  return ['node', 'gennady', 'sdd-check', ...rest];
}

describe('SddCheckCommand', () => {
  before(async () => {
    origExit = process.exit;
    origArgv = process.argv;
    process.exit = ((_code?: number) => undefined) as typeof process.exit;
    process.argv = ['node', 'gennady', 'sdd-check'];
    dir = mkdtempSync(join(tmpdir(), 'sdd-check-'));
    mod = await import('../sdd-check.cmd.ts');
  });

  after(() => {
    process.exit = origExit;
    process.argv = origArgv;
    rmSync(dir, { recursive: true, force: true });
  });

  it('--task on a clean ticket → exit 0', async () => {
    const t = join(dir, 'clean.md');
    writeFileSync(t, CLEAN_TICKET, 'utf-8');
    const r = await mod.run(argv(`--task=${t}`));
    assert.strictEqual(r.exitCode, 0);
    assert.match(r.text, /✅ clean/);
  });

  it('accepts --task <path> (space form) as well as --task=<path>', async () => {
    const t = join(dir, 'clean-space.md');
    writeFileSync(t, CLEAN_TICKET, 'utf-8');
    const r = await mod.run(argv('--task', t));
    assert.strictEqual(r.exitCode, 0);
    assert.match(r.text, /✅ clean/);
  });

  it('--task on a fabricated DONE → exit 1 with the finding', async () => {
    const t = join(dir, 'fab.md');
    writeFileSync(t, FABRICATED, 'utf-8');
    const r = await mod.run(argv(`--task=${t}`));
    assert.strictEqual(r.exitCode, 1);
    assert.match(r.text, /SDD_FABRICATED_DONE/);
  });

  it('--task flags a phase rule link that does not resolve (SDD_BROKEN_RULE_LINK)', async () => {
    const t = join(dir, 'broken-rule.md');
    writeFileSync(t, TICKET_BROKEN_RULE, 'utf-8');
    const r = await mod.run(argv(`--task=${t}`));
    assert.strictEqual(r.exitCode, 1);
    assert.match(r.text, /SDD_BROKEN_RULE_LINK/);
  });

  it('--task: a resolvable rule link is not flagged', async () => {
    writeFileSync(join(dir, 'real-rule.xml'), '<Rule/>', 'utf-8');
    const t = join(dir, 'ok-rule.md');
    writeFileSync(t, TICKET_BROKEN_RULE.replace('./missing-rule.xml', './real-rule.xml'), 'utf-8');
    const r = await mod.run(argv(`--task=${t}`));
    assert.doesNotMatch(r.text, /SDD_BROKEN_RULE_LINK/);
  });

  const specRefTicket = (anchorLink: string): string =>
    [
      '<!--SECTION:META-->',
      '- **Task-ID:** cli-foo',
      '- **Status:** [ ] TODO',
      '<!--/SECTION:META-->',
      `- Contract: [X](${anchorLink})`,
      '<!--SECTION:EXECUTION_LOG-->',
      '- pending',
      '<!--/SECTION:EXECUTION_LOG-->',
    ].join('\n');

  it('--task flags a spec reference whose file is missing (SDD_BROKEN_SPEC_REF)', async () => {
    const t = join(dir, 'broken-specref.md');
    writeFileSync(t, specRefTicket('./gone.spec.md#foo'), 'utf-8');
    const r = await mod.run(argv(`--task=${t}`));
    assert.match(r.text, /SDD_BROKEN_SPEC_REF/);
  });

  it('--task: spec anchor resolving to a heading is clean; a missing one warns', async () => {
    writeFileSync(join(dir, 'ref.spec.md'), '# Ref\n\n### RealEntity\nbody', 'utf-8');
    const ok = join(dir, 'good-anchor.md');
    writeFileSync(ok, specRefTicket('./ref.spec.md#realentity'), 'utf-8');
    assert.doesNotMatch((await mod.run(argv(`--task=${ok}`))).text, /SDD_BROKEN_SPEC_ANCHOR/);

    const bad = join(dir, 'bad-anchor.md');
    writeFileSync(bad, specRefTicket('./ref.spec.md#ghostentity'), 'utf-8');
    assert.match((await mod.run(argv(`--task=${bad}`))).text, /SDD_BROKEN_SPEC_ANCHOR/);
  });

  const ticketWithCoverage = (taskId: string, coverageBody: string): string =>
    [
      '<!--SECTION:META-->',
      `- **Task-ID:** ${taskId}`,
      '- **Status:** [ ] TODO',
      '<!--/SECTION:META-->',
      '<!--SECTION:TEST_COVERAGE-->',
      '## Test Scenario Coverage',
      coverageBody,
      '<!--/SECTION:TEST_COVERAGE-->',
      '<!--SECTION:EXECUTION_LOG-->',
      '- pending',
      '<!--/SECTION:EXECUTION_LOG-->',
    ].join('\n');

  it('--task flags a scenario deferred to its own Task-ID (SDD_BDD_DEFERRED_TO_SELF)', async () => {
    const t = join(dir, 'deferred-to-self.md');
    writeFileSync(
      t,
      ticketWithCoverage(
        'cli-foo',
        '- Deferred Test Ownership: cli-foo scenario → `f.test.ts` :: `case`'
      ),
      'utf-8'
    );
    const r = await mod.run(argv(`--task=${t}`));
    assert.match(r.text, /SDD_BDD_DEFERRED_TO_SELF/);
  });

  it('--task does not flag a scenario deferred to a different Task-ID', async () => {
    const t = join(dir, 'deferred-to-other.md');
    writeFileSync(
      t,
      ticketWithCoverage(
        'cli-foo',
        '- Deferred Test Ownership: cli-bar scenario → `f.test.ts` :: `case`'
      ),
      'utf-8'
    );
    const r = await mod.run(argv(`--task=${t}`));
    assert.doesNotMatch(r.text, /SDD_BDD_DEFERRED_TO_SELF/);
  });

  it('--task flags a Test Scenario Coverage row that fails to parse (SDD_BDD_COVERAGE_ROW_UNPARSED)', async () => {
    const t = join(dir, 'unparsed-row.md');
    writeFileSync(
      t,
      ticketWithCoverage('cli-foo', '- All scenarios → Deferred Test Ownership: TSK-34'),
      'utf-8'
    );
    const r = await mod.run(argv(`--task=${t}`));
    assert.match(r.text, /SDD_BDD_COVERAGE_ROW_UNPARSED/);
  });

  it('--task does not flag a well-formed Test Scenario Coverage row', async () => {
    const t = join(dir, 'parsed-row.md');
    writeFileSync(
      t,
      ticketWithCoverage(
        'cli-foo',
        '- Deferred Test Ownership: cli-bar scenario → `f.test.ts` :: `case`'
      ),
      'utf-8'
    );
    const r = await mod.run(argv(`--task=${t}`));
    assert.doesNotMatch(r.text, /SDD_BDD_COVERAGE_ROW_UNPARSED/);
  });

  it('--task matches a declared test-file by full path suffix, not just basename', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'sdd-check-cwd-'));
    const prevCwd = process.cwd();
    try {
      writeFileSync(join(cwd, 'package.json'), '{}', 'utf-8');
      mkdirSync(join(cwd, 'src', 'app'), { recursive: true });
      writeFileSync(
        join(cwd, 'src', 'app', 'x.test.ts'),
        "it('does the thing', () => {});",
        'utf-8'
      );
      process.chdir(cwd);
      const t = join(cwd, 'ticket.md');
      writeFileSync(
        t,
        ticketWithCoverage('cli-foo', '- scenario → `src/app/x.test.ts` :: `does the thing`'),
        'utf-8'
      );
      const r = await mod.run(argv(`--task=${t}`));
      assert.doesNotMatch(r.text, /SDD_BDD_SCENARIO_UNTESTED/);
    } finally {
      process.chdir(prevCwd);
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('--task matches a declared test-file by bare basename', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'sdd-check-cwd-'));
    const prevCwd = process.cwd();
    try {
      writeFileSync(join(cwd, 'package.json'), '{}', 'utf-8');
      mkdirSync(join(cwd, 'src', 'app'), { recursive: true });
      writeFileSync(
        join(cwd, 'src', 'app', 'x.test.ts'),
        "it('does the thing', () => {});",
        'utf-8'
      );
      process.chdir(cwd);
      const t = join(cwd, 'ticket.md');
      writeFileSync(
        t,
        ticketWithCoverage('cli-foo', '- scenario → `x.test.ts` :: `does the thing`'),
        'utf-8'
      );
      const r = await mod.run(argv(`--task=${t}`));
      assert.doesNotMatch(r.text, /SDD_BDD_SCENARIO_UNTESTED/);
    } finally {
      process.chdir(prevCwd);
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('--task warns SDD_BDD_TESTFILE_AMBIGUOUS when a declared basename matches >1 file', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'sdd-check-cwd-'));
    const prevCwd = process.cwd();
    try {
      writeFileSync(join(cwd, 'package.json'), '{}', 'utf-8');
      mkdirSync(join(cwd, 'src', 'app'), { recursive: true });
      mkdirSync(join(cwd, 'src', 'other'), { recursive: true });
      writeFileSync(
        join(cwd, 'src', 'app', 'x.test.ts'),
        "it('does the thing', () => {});",
        'utf-8'
      );
      writeFileSync(
        join(cwd, 'src', 'other', 'x.test.ts'),
        "it('does the thing', () => {});",
        'utf-8'
      );
      process.chdir(cwd);
      const t = join(cwd, 'ticket.md');
      writeFileSync(
        t,
        ticketWithCoverage('cli-foo', '- scenario → `x.test.ts` :: `does the thing`'),
        'utf-8'
      );
      const r = await mod.run(argv(`--task=${t}`));
      assert.match(r.text, /SDD_BDD_TESTFILE_AMBIGUOUS/);
    } finally {
      process.chdir(prevCwd);
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('--all scans tickets and broken spec links under specs/', async () => {
    const root = join(dir, 'proj');
    const scopeDir = join(root, 'specs', 'cli');
    mkdirSync(scopeDir, { recursive: true });
    writeFileSync(join(scopeDir, 'cli.task-foo.md'), CLEAN_TICKET, 'utf-8');
    // a spec that links to a non-existent sibling spec
    writeFileSync(
      join(scopeDir, 'cli.spec.md'),
      '# cli\n\nSee [core](./core/core.spec.md) for details.\n',
      'utf-8'
    );

    const r = await mod.run(argv('--all', root));
    assert.strictEqual(r.exitCode, 1);
    assert.match(r.text, /SDD_BROKEN_SPEC_LINK/);
    assert.match(r.text, /core\.spec\.md/);
  });

  it('--all on a clean tree → exit 0', async () => {
    const root = join(dir, 'clean-proj');
    const scopeDir = join(root, 'specs', 'cli');
    mkdirSync(scopeDir, { recursive: true });
    writeFileSync(join(scopeDir, 'cli.task-foo.md'), CLEAN_TICKET, 'utf-8');
    // a complete tree carries the matching Tracker Index row (else SDD_TRACKER_MISSING_ROW)
    writeFileSync(
      join(scopeDir, 'cli.3-tasks.md'),
      [
        '# cli — Tasks',
        '## 1. Tracker Index',
        '| Task-ID | Title | Dependencies | Status | Reopens |',
        '|---------|-------|--------------|--------|---------|',
        '| cli-foo | Foo | — | [x] DONE | — |',
      ].join('\n'),
      'utf-8'
    );
    const r = await mod.run(argv('--all', root));
    assert.strictEqual(r.exitCode, 0);
  });

  it('--all: a legacy tracker embedded in tasks/<scope>/README.md (no *.3-tasks.md file) is still cross-checked — the TSK-58 gap: tracker says DONE, ticket itself is still TODO', async () => {
    const root = join(dir, 'legacy-tracker-proj');
    const scopeDir = join(root, 'tasks', 'cli');
    mkdirSync(scopeDir, { recursive: true });
    // ticket on disk is still TODO
    writeFileSync(
      join(scopeDir, 'cli.task-foo.md'),
      CLEAN_TICKET.replace('[x] DONE', '[ ] TODO'),
      'utf-8'
    );
    // legacy tracker lives inside README.md, not a *.3-tasks.md index — and it (wrongly) says DONE
    writeFileSync(
      join(scopeDir, 'README.md'),
      [
        '# cli — Tasks',
        '## Tracker',
        '| Task-ID | Title | Dependencies | Status | Reopens |',
        '|---------|-------|--------------|--------|---------|',
        '| [cli-foo](cli.task-foo.md) | Foo | — | `[x]` DONE | 1 |',
      ].join('\n'),
      'utf-8'
    );

    const r = await mod.run(argv('--all', root));
    assert.match(r.text, /SDD_TRACKER_STATUS_DRIFT/);
    assert.match(r.text, /README\.md/);
  });

  it('--all на смешанном репо: строгие v2-проверки бьют только по мигрированному scope', async () => {
    const root = join(dir, 'mixed-proj');
    const MODULE_SPEC = [
      '# mod',
      '<!--SECTION:MODULE_VISION-->',
      '## Module Vision',
      'x',
      '<!--/SECTION:MODULE_VISION-->',
    ].join('\n');
    mkdirSync(join(root, 'tasks', 'old-scope'), { recursive: true });
    mkdirSync(join(root, 'specs', 'old-scope', 'mod'), { recursive: true });
    mkdirSync(join(root, 'specs', 'new-scope', 'mod'), { recursive: true });
    writeFileSync(join(root, 'specs', 'old-scope', 'mod', 'mod.spec.md'), MODULE_SPEC, 'utf-8');
    writeFileSync(join(root, 'specs', 'new-scope', 'mod', 'mod.spec.md'), MODULE_SPEC, 'utf-8');
    // мигрированность scope позитивна: tasks/<scope>/ снесён И co-located индекс существует
    writeFileSync(
      join(root, 'specs', 'new-scope', 'new-scope.3-tasks.md'),
      '# Tasks: new-scope\n',
      'utf-8'
    );

    const r = await mod.run(argv('--all', root));
    assert.strictEqual(r.exitCode, 1);
    assert.match(r.text, /new-scope[\\/]mod[\\/]mod\.spec\.md[\s\S]*SDD_NO_DIAGRAM_BLOCK/);
    assert.doesNotMatch(r.text, /old-scope[\\/]mod[\\/]mod\.spec\.md/);
  });

  it('--all reports Finding.file relative to process.cwd(), not the absolute worktree path', async () => {
    const root = join(dir, 'relpath-proj');
    const scopeDir = join(root, 'specs', 'cli');
    mkdirSync(scopeDir, { recursive: true });
    writeFileSync(
      join(scopeDir, 'cli.spec.md'),
      '# cli\n\nSee [core](./core/core.spec.md) for details.\n',
      'utf-8'
    );

    const r = await mod.run(argv('--all', root));
    assert.match(r.text, /SDD_BROKEN_SPEC_LINK/);
    const expectedRel = relative(process.cwd(), join(scopeDir, 'cli.spec.md'));
    assert.ok(r.text.includes(expectedRel), `expected relative path ${expectedRel} in:\n${r.text}`);
    const findingLine = r.text.split('\n').find((l) => l.includes('SDD_BROKEN_SPEC_LINK')) ?? '';
    const reportedPath = findingLine.split(':')[0] ?? '';
    assert.ok(!isAbsolute(reportedPath), `expected a relative path, got: ${reportedPath}`);
  });

  it('--task keeps the caller-supplied path verbatim (not rewritten to relative)', async () => {
    const t = join(dir, 'fab-path.md');
    writeFileSync(t, FABRICATED, 'utf-8');
    const r = await mod.run(argv(`--task=${t}`));
    assert.ok(isAbsolute(t));
    assert.ok(r.text.includes(t), `expected verbatim path ${t} in:\n${r.text}`);
  });

  it('exits 4 with neither --task nor --all, 1 on missing --task file', async () => {
    const none = await mod.run(argv());
    assert.strictEqual(none.exitCode, 4);
    const missing = await mod.run(argv(`--task=${join(dir, 'nope.md')}`));
    assert.strictEqual(missing.exitCode, 1);
  });
});
