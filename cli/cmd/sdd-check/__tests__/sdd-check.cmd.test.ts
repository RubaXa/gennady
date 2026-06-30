// @file: Integration tests for SddCheckCommand#run — per-ticket + project-wide checks, exit codes.
// @consumers: gennady.ts
// @tasks: N/A

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
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

  it('exits 4 with neither --task nor --all, 1 on missing --task file', async () => {
    const none = await mod.run(argv());
    assert.strictEqual(none.exitCode, 4);
    const missing = await mod.run(argv(`--task=${join(dir, 'nope.md')}`));
    assert.strictEqual(missing.exitCode, 1);
  });
});
