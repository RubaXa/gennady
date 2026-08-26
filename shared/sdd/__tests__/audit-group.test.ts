// @file: Unit tests for shared/sdd/audit-group.ts — spec resolution, group boundary, target-files/handoff aggregation.
// @consumers: N/A
// @tasks: N/A

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  resolveOwningSpec,
  collectGroupRefs,
  resolveAuditGroup,
  ticketTargetFiles,
  ticketProductionTargetFiles,
  ticketCoverageThreshold,
  ticketOwnsEntity,
  ticketHandoffArtifacts,
} from '../audit-group.ts';
import { ticketRef, type TicketRef } from '../check.ts';

const dirs: string[] = [];
function tmp(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(d);
  return d;
}
after(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

function ticketMd(id: string, status = '[ ] TODO', deps = 'None'): string {
  return [
    `# Task: ${id}`,
    '<!--SECTION:META-->',
    '## 1. Meta',
    `- **Task-ID:** ${id}`,
    `- **Status:** ${status}`,
    `- **Dependencies:** ${deps}`,
    '<!--/SECTION:META-->',
    '<!--SECTION:EXECUTION_LOG-->',
    '<!--/SECTION:EXECUTION_LOG-->',
  ].join('\n');
}

describe('resolveOwningSpec', () => {
  it('resolves <name>.task.<ID>.md to the sibling <name>.spec.md when it exists', () => {
    const dir = tmp('spec-ok-');
    writeFileSync(join(dir, 'core.spec.md'), '# Core spec\n', 'utf-8');
    const ticketPath = join(dir, 'core.task.TSK-x.md');
    writeFileSync(ticketPath, ticketMd('TSK-x'), 'utf-8');
    const res = resolveOwningSpec(ticketPath);
    assert.strictEqual(res.ok, true);
    if (res.ok) assert.strictEqual(res.specPath, join(dir, 'core.spec.md'));
  });

  it('a filename without the `.task.` convention → not-v2-ticket-name', () => {
    const dir = tmp('spec-badname-');
    const ticketPath = join(dir, 'ticket.md');
    writeFileSync(ticketPath, ticketMd('TSK-x'), 'utf-8');
    const res = resolveOwningSpec(ticketPath);
    assert.strictEqual(res.ok, false);
    if (!res.ok) assert.strictEqual(res.reason, 'not-v2-ticket-name');
  });

  it('a well-named ticket whose spec is missing on disk → spec-missing (names the expected path)', () => {
    const dir = tmp('spec-missing-');
    const ticketPath = join(dir, 'core.task.TSK-x.md');
    writeFileSync(ticketPath, ticketMd('TSK-x'), 'utf-8');
    const res = resolveOwningSpec(ticketPath);
    assert.strictEqual(res.ok, false);
    if (!res.ok && res.reason === 'spec-missing') {
      assert.strictEqual(res.specPath, join(dir, 'core.spec.md'));
    } else {
      assert.fail('expected spec-missing');
    }
  });
});

describe('collectGroupRefs', () => {
  it('groups only tickets in the exact same directory as the spec — never a subdirectory module', () => {
    const dir = tmp('group-boundary-');
    mkdirSync(join(dir, 'sub'), { recursive: true });
    const specPath = join(dir, 'core.spec.md');
    writeFileSync(specPath, '# Core spec\n', 'utf-8');
    const siblingA = join(dir, 'core.task.TSK-a.md');
    const siblingB = join(dir, 'core.task.TSK-b.md');
    const nested = join(dir, 'sub', 'sub.task.TSK-c.md');
    writeFileSync(siblingA, ticketMd('TSK-a'), 'utf-8');
    writeFileSync(siblingB, ticketMd('TSK-b'), 'utf-8');
    writeFileSync(nested, ticketMd('TSK-c'), 'utf-8');
    const refs: TicketRef[] = [siblingA, siblingB, nested].map((f) =>
      ticketRef(f, readFileSync(f, 'utf-8'))
    );
    const group = collectGroupRefs(specPath, refs);
    assert.deepStrictEqual(
      group.map((r) => r.taskId),
      ['TSK-a', 'TSK-b']
    );
  });
});

describe('ticketTargetFiles / ticketHandoffArtifacts', () => {
  const CONTENT = [
    '<!--SECTION:META-->',
    '- **Task-ID:** TSK-x',
    '- **Status:** [x] DONE',
    '<!--/SECTION:META-->',
    '<!--SECTION:PHASES_OVERVIEW-->',
    '| ID | Kind | Deps | Status |',
    '|----|------|------|--------|',
    '| P1 | impl | — | [x] |',
    '| P2 | test | P1 | [x] |',
    '<!--/SECTION:PHASES_OVERVIEW-->',
    '<!--SECTION:PHASE_P1-->',
    '- **Target Files:**',
    '  - src/a.ts',
    '  - src/shared.ts',
    '<!--/SECTION:PHASE_P1-->',
    '<!--SECTION:PHASE_P2-->',
    '- **Target Files:**',
    '  - src/a.test.ts',
    '  - src/shared.ts',
    '<!--/SECTION:PHASE_P2-->',
    '<!--SECTION:EXECUTION_LOG-->',
    '#### P1',
    '**Handoff →** artifacts: [src/a.ts, src/shared.ts]; decisions: [none]; open: [none]',
    '#### P2',
    '**Handoff →** artifacts: [src/a.test.ts]; decisions: [none]; open: [none]',
    '<!--/SECTION:EXECUTION_LOG-->',
  ].join('\n');

  it('unions and deduplicates Target Files across every phase', () => {
    assert.deepStrictEqual(ticketTargetFiles(CONTENT), [
      'src/a.ts',
      'src/shared.ts',
      'src/a.test.ts',
    ]);
  });

  it('unions and deduplicates Handoff artifacts across every phase', () => {
    assert.deepStrictEqual(ticketHandoffArtifacts(CONTENT), [
      'src/a.ts',
      'src/shared.ts',
      'src/a.test.ts',
    ]);
  });

  it('a `none` artifacts placeholder contributes nothing', () => {
    const content = [
      '<!--SECTION:EXECUTION_LOG-->',
      '#### P1',
      '**Handoff →** artifacts: [none]; decisions: [none]; open: [none]',
      '<!--/SECTION:EXECUTION_LOG-->',
    ].join('\n');
    assert.deepStrictEqual(ticketHandoffArtifacts(content), []);
  });
});

describe('resolveAuditGroup', () => {
  it('resolves a bare Task-ID to its group, scanning the tree once', () => {
    const dir = tmp('resolve-id-');
    mkdirSync(join(dir, 'specs', 'demo'), { recursive: true });
    writeFileSync(join(dir, 'specs', 'demo', 'demo.spec.md'), '# Demo\n', 'utf-8');
    writeFileSync(join(dir, 'specs', 'demo', 'demo.task.TSK-one.md'), ticketMd('TSK-one'), 'utf-8');
    writeFileSync(
      join(dir, 'specs', 'demo', 'demo.task.TSK-two.md'),
      ticketMd('TSK-two', '[x] DONE'),
      'utf-8'
    );
    const res = resolveAuditGroup('TSK-one', dir);
    assert.strictEqual(res.ok, true);
    if (!res.ok) return;
    assert.deepStrictEqual(res.group.map((r) => r.taskId).sort(), ['TSK-one', 'TSK-two']);
  });

  it('an unresolvable path → unreadable', () => {
    const dir = tmp('resolve-unreadable-');
    const res = resolveAuditGroup(join(dir, 'nope.md'), dir);
    assert.strictEqual(res.ok, false);
    if (!res.ok) assert.strictEqual(res.reason, 'unreadable');
  });

  it('an unknown Task-ID-shaped argument → unknown-id', () => {
    const dir = tmp('resolve-unknown-');
    const res = resolveAuditGroup('NOPE-ghost', dir);
    assert.strictEqual(res.ok, false);
    if (!res.ok) assert.strictEqual(res.reason, 'unknown-id');
  });

  it('a ticket path that does not follow the v2 naming convention → not-v2-ticket-name', () => {
    const dir = tmp('resolve-badname-');
    const p = join(dir, 'plain.md');
    writeFileSync(p, ticketMd('TSK-x'), 'utf-8');
    const res = resolveAuditGroup(p, dir);
    assert.strictEqual(res.ok, false);
    if (!res.ok) assert.strictEqual(res.reason, 'not-v2-ticket-name');
  });

  it('a well-named ticket with no sibling spec on disk → spec-missing', () => {
    const dir = tmp('resolve-specmissing-');
    const p = join(dir, 'core.task.TSK-x.md');
    writeFileSync(p, ticketMd('TSK-x'), 'utf-8');
    const res = resolveAuditGroup(p, dir);
    assert.strictEqual(res.ok, false);
    if (!res.ok) assert.strictEqual(res.reason, 'spec-missing');
  });
});

describe('ticketProductionTargetFiles — production extensions & test exclusion (review C5/C6)', () => {
  const phase = (files: string[]) =>
    [
      '<!--SECTION:PHASES_OVERVIEW-->',
      '| ID | Kind | Deps | Status |',
      '|----|------|------|--------|',
      '| P1 | impl | — | [ ] |',
      '<!--/SECTION:PHASES_OVERVIEW-->',
      '<!--SECTION:PHASE_P1-->',
      '- **Target Files:**',
      ...files.map((f) => `  - ${f}`),
      '<!--/SECTION:PHASE_P1-->',
    ].join('\n');

  it('keeps every supported production extension', () => {
    const exts = [
      'src/a.ts',
      'src/b.tsx',
      'src/c.mts',
      'src/d.cts',
      'src/e.js',
      'src/f.jsx',
      'src/g.mjs',
      'src/h.cjs',
      'src/i.vue',
      'src/j.svelte',
    ];
    assert.deepStrictEqual(ticketProductionTargetFiles(phase(exts)), exts);
  });

  it('drops test files by name and by __tests__ dir', () => {
    const c = phase([
      'src/keep.ts',
      'src/foo.test.ts',
      'src/foo.spec.ts',
      'src/foo.test.mts',
      'src/__tests__/helper.ts',
      'src/nested/__tests__/deep.tsx',
    ]);
    assert.deepStrictEqual(ticketProductionTargetFiles(c), ['src/keep.ts']);
  });

  it('drops non-source files (md, json)', () => {
    assert.deepStrictEqual(
      ticketProductionTargetFiles(phase(['src/a.ts', 'docs/readme.md', 'cfg/data.json'])),
      ['src/a.ts']
    );
  });
});

describe('ticketCoverageThreshold — parsed from §Verification, decimals preserved (review C3/C4)', () => {
  const withVerification = (row: string) =>
    ['<!--SECTION:VERIFICATION-->', '## Verification', row, '<!--/SECTION:VERIFICATION-->'].join(
      '\n'
    );

  it('preserves a decimal threshold verbatim (87.5, not 87)', () => {
    assert.strictEqual(
      ticketCoverageThreshold(withVerification('| npx gennady testcov --min=87.5 src/a.ts | AX |')),
      '87.5'
    );
  });

  it('reads an integer threshold', () => {
    assert.strictEqual(
      ticketCoverageThreshold(withVerification('npx gennady testcov --min=90 src/a.ts')),
      '90'
    );
  });

  it('defaults to 80 when §Verification names no testcov --min', () => {
    assert.strictEqual(
      ticketCoverageThreshold(withVerification('| npx gennady lint src/ | AX |')),
      '80'
    );
  });

  it('ignores a testcov --min mention OUTSIDE §Verification (prose)', () => {
    const c = [
      '<!--SECTION:PHASE_P1-->',
      'We considered `testcov --min=50` earlier but rejected it.',
      '<!--/SECTION:PHASE_P1-->',
      '<!--SECTION:VERIFICATION-->',
      '## Verification',
      '| — | — |',
      '<!--/SECTION:VERIFICATION-->',
    ].join('\n');
    assert.strictEqual(ticketCoverageThreshold(c), '80');
  });
});

describe('ticketOwnsEntity — structural ownership only (review C8/C9/C10)', () => {
  const withPhaseAndBody = (targetFiles: string[], body: string) =>
    [
      '<!--SECTION:PHASES_OVERVIEW-->',
      '| ID | Kind | Deps | Status |',
      '|----|------|------|--------|',
      '| P1 | impl | — | [ ] |',
      '<!--/SECTION:PHASES_OVERVIEW-->',
      '<!--SECTION:PHASE_P1-->',
      '- **Target Files:**',
      ...targetFiles.map((f) => `  - ${f}`),
      '',
      body,
      '<!--/SECTION:PHASE_P1-->',
    ].join('\n');

  it('owns via a Target File that names the entity', () => {
    assert.strictEqual(
      ticketOwnsEntity(withPhaseAndBody(['src/FooService.ts'], ''), 'FooService'),
      true
    );
  });

  it('owns .js / .mts Target Files too (per testcov contract)', () => {
    assert.strictEqual(ticketOwnsEntity(withPhaseAndBody(['src/Bar.mjs'], ''), 'Bar'), true);
    assert.strictEqual(ticketOwnsEntity(withPhaseAndBody(['lib/Baz.cts'], ''), 'Baz'), true);
  });

  it('owns via an explicit Entities/Provides/Implements/Entity field', () => {
    assert.strictEqual(
      ticketOwnsEntity(
        withPhaseAndBody([], '- **Entities:** FooService, BarService'),
        'FooService'
      ),
      true
    );
    assert.strictEqual(
      ticketOwnsEntity(withPhaseAndBody([], '- **Implements:** Foo'), 'Foo'),
      true
    );
    assert.strictEqual(ticketOwnsEntity(withPhaseAndBody([], 'Provides: Widget'), 'Widget'), true);
    assert.strictEqual(ticketOwnsEntity(withPhaseAndBody([], '**Entity:** Gizmo'), 'Gizmo'), true);
  });

  it('owns via the Entities field even when the FILE name differs (FooService → foo-service.ts)', () => {
    const c = withPhaseAndBody(['src/foo-service.ts'], '- **Entities:** FooService');
    assert.strictEqual(ticketOwnsEntity(c, 'FooService'), true);
  });

  it('a differently-named file WITHOUT an Entities field does not own (filename ≠ entity)', () => {
    const c = withPhaseAndBody(['src/foo-service.ts'], '');
    assert.strictEqual(ticketOwnsEntity(c, 'FooService'), false);
  });

  it('PROSE mention is NOT ownership (reviewer C9 case verbatim)', () => {
    const c = withPhaseAndBody(
      ['src/other.ts'],
      'Do not implement Foo; existing Foo.ts is unrelated.'
    );
    assert.strictEqual(ticketOwnsEntity(c, 'Foo'), false);
  });

  it('whole-word — a Target File for FooBar does not own Foo', () => {
    assert.strictEqual(ticketOwnsEntity(withPhaseAndBody(['src/FooBar.ts'], ''), 'Foo'), false);
  });
});
