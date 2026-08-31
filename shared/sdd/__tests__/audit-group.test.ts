// @file: Unit tests for shared/sdd/audit-group.ts — spec resolution, group boundary, target-files/handoff aggregation.
// @consumers: N/A
// @tasks: N/A

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  boundGroupChangedFiles,
  resolveOwningSpec,
  collectGroupRefs,
  resolveAuditGroup,
  ticketTargetFiles,
  ticketOwnsEntity,
  ticketHandoffArtifacts,
  validateTicketReviewPaths,
  validateTicketTargetClaims,
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
  it('groups only tickets owned by the exact spec — not a co-located spec or subdirectory module', () => {
    const dir = tmp('group-boundary-');
    mkdirSync(join(dir, 'sub'), { recursive: true });
    const specPath = join(dir, 'core.spec.md');
    writeFileSync(specPath, '# Core spec\n', 'utf-8');
    writeFileSync(join(dir, 'other.spec.md'), '# Other spec\n', 'utf-8');
    const siblingA = join(dir, 'core.task.TSK-a.md');
    const siblingB = join(dir, 'core.task.TSK-b.md');
    const coLocatedOther = join(dir, 'other.task.TSK-other.md');
    const nested = join(dir, 'sub', 'sub.task.TSK-c.md');
    writeFileSync(siblingA, ticketMd('TSK-a'), 'utf-8');
    writeFileSync(siblingB, ticketMd('TSK-b'), 'utf-8');
    writeFileSync(coLocatedOther, ticketMd('TSK-other'), 'utf-8');
    writeFileSync(nested, ticketMd('TSK-c'), 'utf-8');
    const refs: TicketRef[] = [siblingA, siblingB, coLocatedOther, nested].map((f) =>
      ticketRef(f, readFileSync(f, 'utf-8'))
    );
    const group = collectGroupRefs(specPath, refs);
    assert.deepStrictEqual(
      group.map((r) => r.taskId),
      ['TSK-a', 'TSK-b']
    );
  });
});

describe('boundGroupChangedFiles', () => {
  it('keeps exact group files and private-root neighbours while excluding another group and ambiguous shared-root files', () => {
    const root = tmp('group-changed-files-');
    const specA = join(root, 'specs', 'a.spec.md');
    const specB = join(root, 'specs', 'b.spec.md');
    const ticketA = join(root, 'specs', 'a.task.TSK-a.md');
    const ticketB = join(root, 'specs', 'b.task.TSK-b.md');
    mkdirSync(join(root, 'specs'), { recursive: true });
    for (const path of [specA, specB, ticketA, ticketB]) writeFileSync(path, '', 'utf-8');
    const refA = ticketRef(ticketA, ticketMd('TSK-a'));
    const refB = ticketRef(ticketB, ticketMd('TSK-b'));
    const targets = new Map<string, string[]>([
      [ticketA, ['packages/a/src/a.ts', 'src/a.ts', 'shared/config.ts']],
      [
        ticketB,
        ['packages/b/src/b.ts', 'packages/b/src/deleted.ts', 'src/b.ts', 'shared/config.ts'],
      ],
    ]);
    const changed = [
      'specs/a.spec.md',
      'specs/a.task.TSK-a.md',
      'specs/b.spec.md',
      'specs/b.task.TSK-b.md',
      'packages/a/src/a.ts',
      'packages/a/src/new-helper.ts',
      'packages/b/src/b.ts',
      'packages/b/src/deleted.ts',
      'packages/b/src/new-helper.ts',
      'src/a.ts',
      'src/b.ts',
      'src/ambiguous-helper.ts',
      'shared/config.ts',
      'unrelated/readme.md',
    ];

    assert.deepStrictEqual(
      boundGroupChangedFiles(root, changed, specB, [refB], targets.get(ticketB) ?? [], targets),
      [
        'specs/b.spec.md',
        'specs/b.task.TSK-b.md',
        'packages/b/src/b.ts',
        'packages/b/src/deleted.ts',
        'packages/b/src/new-helper.ts',
        'src/b.ts',
        'shared/config.ts',
      ]
    );

    assert.deepStrictEqual(
      collectGroupRefs(specB, [refA, refB]).map((ref) => ref.taskId),
      ['TSK-b']
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

  it('fails closed when a v2-named member of the ticket corpus is not readable as a ticket', () => {
    const dir = tmp('resolve-corpus-invalid-');
    writeFileSync(join(dir, 'core.spec.md'), '# Core\n');
    const selected = join(dir, 'core.task.TSK-good.md');
    writeFileSync(selected, ticketMd('TSK-good'));
    writeFileSync(join(dir, 'core.task.TSK-broken.md'), 'truncated, not a ticket\n');
    const result = resolveAuditGroup(selected, dir);
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.reason, 'ticket-corpus-unreadable');
      if (result.reason === 'ticket-corpus-unreadable')
        assert.match(result.detail, /no readable ticket structure/);
    }
  });

  it('fails closed before Task-ID resolution when any v2 corpus ticket is unreadable', () => {
    const dir = tmp('resolve-corpus-unreadable-');
    writeFileSync(join(dir, 'core.spec.md'), '# Core\n');
    writeFileSync(join(dir, 'core.task.TSK-good.md'), ticketMd('TSK-good'));
    const unreadable = join(dir, 'core.task.TSK-hidden.md');
    writeFileSync(unreadable, ticketMd('TSK-hidden'));
    chmodSync(unreadable, 0o000);
    try {
      const result = resolveAuditGroup('TSK-good', dir);
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.reason, 'ticket-corpus-unreadable');
        if (result.reason === 'ticket-corpus-unreadable') {
          assert.match(result.file, /core\.task\.TSK-hidden\.md$/);
          assert.match(result.detail, /unreadable/);
        }
      }
    } finally {
      chmodSync(unreadable, 0o600);
    }
  });
});

function reviewTicket(targets: string[], deleted: string[] = [], handoffs: string[] = []): string {
  return [
    '<!--SECTION:PHASES_OVERVIEW-->',
    '| ID | Kind | Deps | Status |',
    '|---|---|---|---|',
    '| P1 | impl | — | [x] |',
    '<!--/SECTION:PHASES_OVERVIEW-->',
    '<!--SECTION:PHASE_P1-->',
    '- **Target Files:**',
    ...targets.map((path) => `  - ${path}`),
    '- **Deleted Files:**',
    ...(deleted.length ? deleted.map((path) => `  - ${path}`) : ['  - none']),
    '<!--/SECTION:PHASE_P1-->',
    '<!--SECTION:EXECUTION_LOG-->',
    '#### P1',
    `**Handoff →** artifacts: [${handoffs.length ? handoffs.join(', ') : 'none'}]; decisions: [none]; open: [none]`,
    '<!--/SECTION:EXECUTION_LOG-->',
  ].join('\n');
}

describe('validateTicketReviewPaths', () => {
  it('accepts ordinary exact files and a tracked deleted tombstone', () => {
    const root = tmp('audit-path-valid-');
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src', 'live.ts'), 'live\n');
    writeFileSync(join(root, 'src', 'gone.ts'), 'gone\n');
    execFileSync('git', ['init', '-q'], { cwd: root });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
    execFileSync('git', ['config', 'user.name', 'test'], { cwd: root });
    execFileSync('git', ['add', '-A'], { cwd: root });
    execFileSync('git', ['commit', '-q', '-m', 'baseline'], { cwd: root });
    rmSync(join(root, 'src', 'gone.ts'));

    const result = validateTicketReviewPaths(
      root,
      reviewTicket(['src/live.ts'], ['src/gone.ts'], ['src/live.ts', 'src/gone.ts'])
    );
    assert.deepStrictEqual(result, {
      ok: true,
      paths: {
        targets: ['src/live.ts'],
        createTargets: [],
        deleted: ['src/gone.ts'],
        handoffs: ['src/live.ts', 'src/gone.ts'],
      },
    });
  });

  it('rejects traversal, absolute paths, globs, missing files, and every symlink component', () => {
    const root = tmp('audit-path-invalid-');
    const outside = tmp('audit-path-outside-');
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(outside, 'outside.ts'), 'outside\n');
    writeFileSync(join(root, 'src', 'real.ts'), 'inside\n');
    mkdirSync(join(root, 'real-dir'));
    writeFileSync(join(root, 'real-dir', 'inside.ts'), 'inside\n');
    symlinkSync(join(outside, 'outside.ts'), join(root, 'src', 'escape.ts'));
    symlinkSync(join(root, 'src', 'real.ts'), join(root, 'src', 'inside-link.ts'));
    symlinkSync(join(root, 'real-dir'), join(root, 'src', 'link-dir'));
    const cases: Array<[string, RegExp]> = [
      ['../outside.ts', /`\.\.`/],
      ['/tmp/outside.ts', /absolute/],
      ['src/*.ts', /glob/],
      ['src/missing.ts', /missing/],
      ['src/escape.ts', /symlink component/],
      ['src/inside-link.ts', /symlink component/],
      ['src/link-dir/inside.ts', /symlink component/],
    ];
    for (const [path, expected] of cases) {
      const result = validateTicketReviewPaths(root, reviewTicket([path]));
      assert.strictEqual(result.ok, false, path);
      if (!result.ok) assert.match(result.detail, expected, path);
    }
  });

  it('applies the same exact containment rule to Handoff artifacts', () => {
    const root = tmp('audit-handoff-invalid-');
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src', 'live.ts'), 'live\n');
    symlinkSync(join(root, 'src', 'live.ts'), join(root, 'src', 'alias.ts'));
    for (const artifact of ['../outside.ts', '/tmp/outside.ts', 'src/*.ts', 'src/alias.ts']) {
      const result = validateTicketReviewPaths(root, reviewTicket(['src/live.ts'], [], [artifact]));
      assert.strictEqual(result.ok, false, artifact);
    }
  });

  it('foreign ticket claims may name a future missing exact file, but never a glob', () => {
    const root = tmp('audit-foreign-claim-');
    assert.deepStrictEqual(validateTicketTargetClaims(root, reviewTicket(['src/future.ts'])), {
      ok: true,
      targets: ['src/future.ts'],
    });
    const glob = validateTicketTargetClaims(root, reviewTicket(['src/*.ts']));
    assert.strictEqual(glob.ok, false);
    if (!glob.ok) assert.match(glob.detail, /glob/);
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
