// @file: Filesystem and real CLI controls for bounded declared SDD coverage, with owned cleanup.
// @spec: CLI
// @consumers: SDD coverage qualification

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { readSddCoverage } from '../../../../shared/sdd/coverage-repository.ts';
import { runSddCoverageQuery } from '../sdd-coverage-query.ts';
import { inspectRepoPath } from '../../../../shared/common/repo-path.ts';
import type { CoverageDocument } from '../../../../shared/sdd/coverage-repository.ts';
import { printHelp as printSddCheckHelp } from '../../sdd-check/help.ts';
import { extractSection } from '../../../../shared/sdd/section.ts';

const ownRoot = resolve(import.meta.dirname, '../../../..');

test('sdd-check help explicitly distinguishes the coverage query from a gate', (context) => {
  const lines: string[] = [];
  context.mock.method(console, 'info', (line: string) => lines.push(line));
  printSddCheckHelp();
  assert.match(lines.join('\n'), /Query, not a gate/);
});
const section = (name: string, content: string) =>
  `<!--SECTION:${name}-->\n${content}\n<!--/SECTION:${name}-->\n`;
const spec = (id: string, files: string[] = [], children: string[] = []) =>
  section('SPEC_ID', id) +
  section('MODULE_MAP', children.map((path) => `- [child](${path})`).join('\n')) +
  section(
    'FILE_STRUCTURE',
    '**File Mapping:**\n' + files.map((path) => `- \`${path}\`: implementation`).join('\n')
  );
const ticket = (
  phases: { id: string; writes?: string[]; deletes?: string[]; deps?: string }[] = [
    { id: 'P1', writes: ['src/value.ts'] },
  ]
) =>
  section(
    'META',
    '**Task-ID:** CORE-work\n**Status:** [ ] TODO\n**Owning Spec:** [owner](./core.spec.md)'
  ) +
  section(
    'PHASES_OVERVIEW',
    '| Phase | Kind | Deps | Status |\n|---|---|---|---|\n' +
      phases.map((phase) => `| ${phase.id} | impl | ${phase.deps ?? '—'} | [ ] |`).join('\n')
  ) +
  phases
    .map((phase) =>
      section(
        `PHASE_${phase.id}`,
        '- **Target Files:**\n' +
          (phase.writes ?? []).map((path) => `  - \`${path}\``).join('\n') +
          '\n- **Deleted Files:**\n' +
          (phase.deletes ?? []).map((path) => `  - \`${path}\``).join('\n')
      )
    )
    .join('');

function fixture(run: (root: string, put: (path: string, content: string) => void) => void): void {
  const root = mkdtempSync(join(tmpdir(), 'sdd-coverage-adapter-'));
  const put = (path: string, content: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  };
  try {
    run(root, put);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  assert.equal(existsSync(root), false);
}

test('no SDD and portal-only projects do not read or require ownership of ordinary sources', () =>
  fixture((root, put) => {
    put('src/unowned.ts', 'export const value = 1;');
    const empty = readSddCoverage(root, { kind: 'project' }, 'audit');
    assert.equal(empty.coverage.complete, true);
    assert.equal(empty.coverage.rows.length, 0);
    assert.equal(empty.reads.sourceReads, 0);
    put(
      'specs/README.md',
      '# Project\n## Scopes\n\n## Decision Log\n[not a child](./missing/missing.spec.md)\n'
    );
    const portal = readSddCoverage(root, { kind: 'spec', id: 'specs/README.md' }, 'audit');
    assert.equal(portal.coverage.complete, true);
    assert.equal(portal.reads.metadataReads, 1);
    assert.equal(portal.reads.sourceReads, 0);
  }));

test('portal/scope/module projections use membership sections, not dependency prose', () =>
  fixture((root, put) => {
    put(
      'specs/README.md',
      '# Project\n## Scopes\n| Scope | Type |\n|---|---|\n| [scope](./core/core.spec.md) | library |\n'
    );
    put(
      'specs/core/core.spec.md',
      spec('CORE', [], ['./child/child.spec.md']) +
        section('REQUIREMENTS', '[reference](../unrelated/unrelated.spec.md)')
    );
    put('specs/core/child/child.spec.md', spec('CORE-CHILD', ['src/value.ts']));
    put('src/value.ts', '// @spec: CORE-CHILD\nexport const value = 7;');
    const portal = readSddCoverage(root, { kind: 'spec', id: 'specs/README.md' }, 'audit');
    assert.equal(portal.coverage.complete, true, JSON.stringify(portal.coverage.findings));
    for (const id of ['CORE', 'CORE-CHILD', 'specs/core/child/child.spec.md']) {
      const result = readSddCoverage(root, { kind: 'spec', id }, 'audit');
      assert.deepEqual(result.coverage.rows, portal.coverage.rows);
      assert.equal(result.reads.sourceReads, 1);
      assert.equal(result.reads.metadataReads, 3);
    }
  }));

test('large mapping/small phase reads one selected source and each metadata file once', () =>
  fixture((root, put) => {
    put(
      'specs/core/core.spec.md',
      spec('CORE', [
        'src/value.ts',
        ...Array.from({ length: 10000 }, (_, i) => `src/unrelated-${i}.ts`),
      ])
    );
    put('specs/core/core.task.work.md', ticket());
    put('src/value.ts', 'export const value = 7;');
    const result = readSddCoverage(
      root,
      { kind: 'phase', task: 'CORE-work', phase: 'P1' },
      'preflight'
    );
    assert.equal(result.coverage.canProceed, true, JSON.stringify(result.coverage.findings));
    assert.equal(result.coverage.complete, false);
    assert.deepEqual(
      result.coverage.rows.map((row) => row.path),
      ['src/value.ts']
    );
    assert.equal(result.reads.metadataReads, 2);
    assert.equal(result.reads.sourceReads, 1);
    assert.deepEqual(
      result.coverage.findings.map((finding) => finding.code),
      ['MISSING_HEADER']
    );
  }));

test('explicit File Mapping outside FILE_STRUCTURE is retained; examples and comments are not declarations', () =>
  fixture((root, put) => {
    put(
      'specs/core/core.spec.md',
      section('SPEC_ID', 'CORE') +
        section(
          'MODULE_MAP',
          '```md\n- [example](./missing/missing.spec.md)\n```\n<!--\n- [comment](./missing/missing.spec.md)\n-->'
        ) +
        '## Contract\n**File Mapping:**\n- `src/value.ts`: implementation\n\n## Another section\n- `unrelated.ts`: not a mapping\n'
    );
    put('src/value.ts', '// @spec: CORE\nexport const value = 7;');
    const result = readSddCoverage(root, { kind: 'project' }, 'audit');
    assert.equal(result.coverage.complete, true, JSON.stringify(result.coverage.findings));
    assert.deepEqual(
      result.coverage.rows.map((row) => row.path),
      ['src/value.ts']
    );
  }));

test('missing/wrong/duplicate headers fail audit; preparation is pending, never claimed complete', () =>
  fixture((root, put) => {
    put('specs/core/core.spec.md', spec('CORE', ['src/value.ts']));
    put('specs/other/other.spec.md', spec('OTHER'));
    for (const [source, code] of [
      ['export const value = 7;', 'MISSING_HEADER'],
      ['// @spec: OTHER\n', 'HEADER_OWNER_CONFLICT'],
      ['// @spec: CORE\n// @spec: CORE\n', 'AMBIGUOUS_HEADER'],
      ['// @spec: MISSING\n', 'UNRESOLVED_HEADER'],
    ]) {
      put('src/value.ts', source!);
      const result = readSddCoverage(root, { kind: 'spec', id: 'CORE' }, 'audit');
      assert.equal(result.coverage.canProceed, false);
      assert.ok(result.coverage.findings.some((finding) => finding.code === code));
    }
  }));

test('ownership-shaped comments inside a declaration body cannot stand in for a leading header', () =>
  fixture((root, put) => {
    put('specs/core/core.spec.md', spec('CORE', ['src/value.ts']));
    put('src/value.ts', 'export const value = 7;\n// @spec: CORE\n');
    const result = readSddCoverage(root, { kind: 'project' }, 'audit');
    assert.equal(result.coverage.canProceed, false);
    assert.ok(result.coverage.findings.some((finding) => finding.code === 'MISSING_HEADER'));
  }));

test('literal route brackets are read exactly, never expanded; existing default path policy remains strict', () =>
  fixture((root, put) => {
    put('specs/core/core.spec.md', spec('CORE', ['pages/[...slug].tsx']));
    put('pages/[...slug].tsx', '// @spec: CORE\nexport const value = 7;');
    put('pages/s.tsx', '// @spec: WRONG');
    assert.equal(inspectRepoPath(root, 'pages/[...slug].tsx', 'file').ok, false);
    const result = readSddCoverage(root, { kind: 'project' }, 'audit');
    assert.equal(result.coverage.complete, true, JSON.stringify(result.coverage.findings));
    assert.equal(result.reads.sourceReads, 1);
    assert.equal(result.coverage.rows[0]?.path, 'pages/[...slug].tsx');
    for (const path of [
      'pages/*.tsx',
      'pages/?.tsx',
      '../escape.ts',
      '/tmp/escape.ts',
      'pages/{a,b}.tsx',
    ]) {
      put('specs/core/core.spec.md', spec('CORE', [path]));
      const invalid = readSddCoverage(root, { kind: 'project' }, 'audit');
      assert.equal(invalid.coverage.canProceed, false);
      assert.equal(invalid.reads.sourceReads, 0);
    }
  }));

test('symlinked metadata/source and special files fail closed without following them', () =>
  fixture((root, put) => {
    put('specs/core/core.spec.md', spec('CORE', ['src/link.ts']));
    put('outside.ts', '// @spec: CORE');
    mkdirSync(join(root, 'src'));
    symlinkSync(join(root, 'outside.ts'), join(root, 'src/link.ts'));
    const result = readSddCoverage(root, { kind: 'project' }, 'audit');
    assert.equal(result.coverage.canProceed, false);
    assert.equal(result.reads.sourceReads, 0);
    symlinkSync(join(root, 'specs/core'), join(root, 'specs/alias'));
    assert.ok(
      readSddCoverage(root, { kind: 'project' }, 'audit').coverage.findings.some(
        (finding) => finding.code === 'UNSAFE_METADATA'
      )
    );
  }));

test('broken child/duplicate IDs/malformed mapping never become empty-success', () =>
  fixture((root, put) => {
    put('specs/core/core.spec.md', spec('CORE', [], ['./missing/missing.spec.md']));
    assert.ok(
      readSddCoverage(root, { kind: 'project' }, 'audit').coverage.findings.some(
        (finding) => finding.code === 'UNRESOLVED_CHILD'
      )
    );
    put('specs/core/core.spec.md', spec('CORE'));
    put('specs/other/other.spec.md', spec('CORE'));
    assert.ok(
      readSddCoverage(root, { kind: 'project' }, 'audit').coverage.findings.some(
        (finding) => finding.code === 'DUPLICATE_SPEC_ID'
      )
    );
    put(
      'specs/other/other.spec.md',
      spec('OTHER') + section('FILE_STRUCTURE', '**File Mapping:**\n- undecodable declaration')
    );
    assert.equal(readSddCoverage(root, { kind: 'project' }, 'audit').coverage.canProceed, false);
  }));

test('real no-write phase is empty-consistent; absent phase remains an error, no fake targets', () =>
  fixture((root, put) => {
    put('specs/core/core.spec.md', spec('CORE'));
    put('specs/core/core.task.work.md', ticket([{ id: 'P1' }]));
    const result = readSddCoverage(
      root,
      { kind: 'phase', task: 'CORE-work', phase: 'P1' },
      'phase-exit'
    );
    assert.equal(result.coverage.complete, true);
    assert.equal(result.coverage.rows.length, 0);
    assert.equal(result.reads.sourceReads, 0);
    assert.equal(
      readSddCoverage(root, { kind: 'phase', task: 'CORE-work', phase: 'P9' }, 'phase-exit')
        .coverage.canProceed,
      false
    );
  }));

test('ordered write/delete lifecycle is projected to final obligation, not simultaneous history', () =>
  fixture((root, put) => {
    put('specs/core/core.spec.md', spec('CORE', ['src/value.ts']));
    put(
      'specs/core/core.task.work.md',
      ticket([
        { id: 'P1', writes: ['src/value.ts'] },
        { id: 'P2', deletes: ['src/value.ts'], deps: 'P1' },
      ])
    );
    const result = readSddCoverage(root, { kind: 'project' }, 'audit');
    assert.equal(result.coverage.complete, true, JSON.stringify(result.coverage.findings));
    assert.equal(result.coverage.rows[0]?.state, 'deleted');
    put(
      'specs/core/core.task.work.md',
      ticket([
        { id: 'P1', writes: ['src/value.ts'] },
        { id: 'P2', deletes: ['src/value.ts'] },
      ])
    );
    assert.equal(readSddCoverage(root, { kind: 'project' }, 'audit').coverage.canProceed, false);
  }));

test('Git prior headers catch removal and unexplained disappearance, not a persistent snapshot', () =>
  fixture((root, put) => {
    put('specs/core/core.spec.md', spec('CORE', ['src/value.ts']));
    put('src/value.ts', '// @spec: CORE\nexport const value = 7;');
    const git = (...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
    git('init', '-q');
    git('add', '.');
    git(
      '-c',
      'user.name=Coverage Control',
      '-c',
      'user.email=coverage@example.invalid',
      '-c',
      'core.hooksPath=/dev/null',
      'commit',
      '-qm',
      'control input'
    );
    put('src/value.ts', 'export const value = 8;');
    const removed = readSddCoverage(root, { kind: 'project' }, 'preflight');
    assert.ok(removed.coverage.findings.some((finding) => finding.code === 'REMOVED_OWNERSHIP'));
    assert.equal(removed.coverage.canProceed, false);
    rmSync(join(root, 'src/value.ts'));
    assert.ok(
      readSddCoverage(root, { kind: 'project' }, 'audit').coverage.findings.some(
        (finding) => finding.code === 'UNEXPECTED_MISSING'
      )
    );
  }));

test('JSON ownership is exact declaration-backed and syntax-checked, never corrupted with comments', () =>
  fixture((root, put) => {
    put('specs/core/core.spec.md', spec('CORE', ['config.json']));
    put('config.json', '{"value":7}\n');
    const result = readSddCoverage(root, { kind: 'project' }, 'audit');
    assert.equal(result.coverage.complete, true, JSON.stringify(result.coverage.findings));
    assert.equal(readFileSync(join(root, 'config.json'), 'utf8'), '{"value":7}\n');
    put('config.json', '// @spec: CORE\n{"value":7}');
    assert.ok(
      readSddCoverage(root, { kind: 'project' }, 'audit').coverage.findings.some(
        (finding) => finding.code === 'INVALID_JSON_ARTIFACT'
      )
    );
    put('config.json', '{"value":7}');
    put('specs/core/core.spec.md', spec('CORE'));
    put('specs/core/core.task.work.md', ticket([{ id: 'P1', writes: ['config.json'] }]));
    assert.equal(
      readSddCoverage(root, { kind: 'phase', task: 'CORE-work', phase: 'P1' }, 'phase-exit')
        .coverage.complete,
      true
    );
    assert.ok(
      readSddCoverage(root, { kind: 'project' }, 'audit').coverage.findings.some(
        (finding) => finding.code === 'MAPPING_REQUIRED'
      )
    );
  }));

test('strict argument failures precede filesystem reads and reject mixed query modes', () => {
  for (const args of [
    ['--stage', 'wrong'],
    ['--task', 'CORE-work'],
    ['--phase', 'P1'],
    ['--spec', 'CORE', '--task', 'CORE-work', '--phase', 'P1'],
    ['--all'],
    ['--json', '--format', 'json'],
  ]) {
    assert.equal(
      runSddCoverageQuery(
        ['node', 'gennady', 'orient', '--coverage', ...args],
        '/nonexistent/no-read'
      ).exitCode,
      2
    );
  }
});

test('existing V2 filename ownership works without Owning Spec; context references do not assign it', () =>
  fixture((root, put) => {
    put('specs/core/core.spec.md', spec('CORE', ['src/value.ts']));
    put('specs/other/other.spec.md', spec('OTHER'));
    put(
      'specs/core/core.task.work.md',
      ticket().replace(
        '**Owning Spec:** [owner](./core.spec.md)',
        '**Scope:** other\n**Spec References:** [other](../other/other.spec.md)'
      )
    );
    put('src/value.ts', '// @spec: CORE\nexport const value = 7;');
    const result = readSddCoverage(
      root,
      { kind: 'phase', task: 'CORE-work', phase: 'P1' },
      'phase-exit'
    );
    assert.equal(result.coverage.complete, true, JSON.stringify(result.coverage.findings));
    assert.deepEqual(result.coverage.rows[0]?.owners, ['CORE']);
  }));

test('explicit owner conflicts, broken links and duplicates never fall back silently', () =>
  fixture((root, put) => {
    put('specs/core/core.spec.md', spec('CORE', ['src/value.ts']));
    put('specs/other/other.spec.md', spec('OTHER'));
    put('src/value.ts', '// @spec: CORE');
    for (const declaration of [
      '**Owning Spec:** [owner](../other/other.spec.md)',
      '**Owning Spec:** [owner](./missing.spec.md)',
      '**Owning Spec:** not a link',
      '**Owning Spec:** [owner](./core.spec.md)\n**Owning Spec:** [owner](./core.spec.md)',
    ]) {
      put(
        'specs/core/core.task.work.md',
        ticket().replace('**Owning Spec:** [owner](./core.spec.md)', declaration)
      );
      const result = readSddCoverage(
        root,
        { kind: 'phase', task: 'CORE-work', phase: 'P1' },
        'preflight'
      );
      assert.equal(result.coverage.canProceed, false, declaration);
      assert.ok(
        result.coverage.findings.some((finding) => finding.code === 'INVALID_TASK'),
        declaration
      );
    }
  }));

test('inline HTML comments cannot conceal a foreign or duplicate explicit owner', () =>
  fixture((root, put) => {
    put('specs/core/core.spec.md', spec('CORE'));
    put('specs/other/other.spec.md', spec('OTHER'));
    for (const declaration of [
      '**Owning Spec:** [foreign](../other/other.spec.md) <!-- explanation -->',
      '**Owning Spec:** [owner](./core.spec.md)\n**Owning Spec:** [foreign](../other/other.spec.md) <!-- explanation -->',
      '<!-- comment --> **Owning Spec:** [foreign](../other/other.spec.md)',
    ]) {
      put(
        'specs/core/core.task.work.md',
        ticket([{ id: 'P1' }]).replace('**Owning Spec:** [owner](./core.spec.md)', declaration)
      );
      const result = readSddCoverage(
        root,
        { kind: 'phase', task: 'CORE-work', phase: 'P1' },
        'preflight'
      );
      assert.equal(result.coverage.canProceed, false, declaration);
      assert.ok(result.coverage.findings.some((finding) => finding.code === 'INVALID_TASK'));
    }
    put(
      'specs/core/core.task.work.md',
      ticket([{ id: 'P1' }]).replace(
        '**Owning Spec:** [owner](./core.spec.md)',
        '<!-- **Owning Spec:** [foreign](../other/other.spec.md) -->\n```md\n**Owning Spec:** [foreign](../other/other.spec.md)\n```\n**Owning Spec:** [owner](./core.spec.md) <!-- explanation -->'
      )
    );
    assert.equal(
      readSddCoverage(root, { kind: 'phase', task: 'CORE-work', phase: 'P1' }, 'phase-exit')
        .coverage.complete,
      true
    );
  }));

test('inline and literal path syntax survives comments without scanning fenced examples', () =>
  fixture((root, put) => {
    const paths = ['src/a,b.ts', 'src/a b.ts', 'pages/[...slug].tsx'];
    put('specs/core/core.spec.md', spec('CORE', paths));
    for (const path of paths) put(path, '// @spec: CORE');
    put(
      'specs/core/core.task.work.md',
      ticket([{ id: 'P1' }]).replace(
        '- **Target Files:**\n',
        '- **Target Files:** `src/a,b.ts`, `src/a b.ts`, `pages/[...slug].tsx` <!-- literal examples -->\n'
      )
    );
    const result = readSddCoverage(
      root,
      { kind: 'phase', task: 'CORE-work', phase: 'P1' },
      'phase-exit'
    );
    assert.equal(result.coverage.complete, true, JSON.stringify(result.coverage.findings));
    assert.deepEqual(
      result.coverage.rows.map((row) => row.path),
      [...paths].sort()
    );
  }));

test('visible File Mapping declarations survive inline comments while commented/fenced examples stay inert', () =>
  fixture((root, put) => {
    put(
      'specs/core/core.spec.md',
      section('SPEC_ID', 'CORE') +
        section(
          'FILE_STRUCTURE',
          [
            '**File Mapping:** <!-- explanation -->',
            '- `src/value.ts`: implementation <!-- explanation -->',
            '<!-- - `src/hidden.ts`: example -->',
            '```md',
            '- `src/example.ts`: example',
            '<!-- unfinished example comment',
            '```',
          ].join('\n')
        )
    );
    put('src/value.ts', '// @spec: CORE');
    const result = readSddCoverage(root, { kind: 'project' }, 'audit');
    assert.equal(result.coverage.complete, true, JSON.stringify(result.coverage.findings));
    assert.deepEqual(
      result.coverage.rows.map((row) => row.path),
      ['src/value.ts']
    );
    assert.equal(result.reads.sourceReads, 1);
  }));

test('unsupported missing artifacts never bypass the worktree format policy through Git prior reads', () =>
  fixture((root, put) => {
    const paths = ['settings.env', 'secret.bin', 'old.md'];
    put('specs/core/core.spec.md', spec('CORE', paths));
    for (const path of paths) put(path, 'synthetic unsupported-format control');
    const git = (...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
    git('init', '-q');
    git('add', '.');
    git(
      '-c',
      'user.name=Coverage Control',
      '-c',
      'user.email=coverage@example.invalid',
      '-c',
      'core.hooksPath=/dev/null',
      'commit',
      '-qm',
      'control input'
    );
    for (const path of paths) rmSync(join(root, path));
    const result = readSddCoverage(root, { kind: 'project' }, 'audit');
    assert.equal(result.coverage.canProceed, false);
    assert.equal(result.reads.sourceReads, 0);
    assert.equal(result.reads.priorBytes, 0);
    assert.equal(
      result.coverage.findings.filter((finding) => finding.code === 'UNSUPPORTED_HEADER_FORMAT')
        .length,
      paths.length
    );
  }));

test('inline and nested exact paths agree; annotations are not paths and a known no-write label is empty', () =>
  fixture((root, put) => {
    put('specs/core/core.spec.md', spec('CORE', ['src/value.ts', 'config.json']));
    put('src/value.ts', '// @spec: CORE\nexport const value = 7;');
    put('config.json', '{}');
    const base = ticket([{ id: 'P1', writes: ['src/value.ts', 'config.json'] }]);
    const field = '- **Target Files:**\n  - `src/value.ts`\n  - `config.json`';
    for (const replacement of [
      '- **Target Files:** `src/value.ts`, `config.json`',
      '- **Target Files:** `src/value.ts`; `config.json` (scripts: test, integration)',
      '- **Target Files:**\n  - `src/value.ts`\n  - `config.json` (scripts: test, integration)',
    ]) {
      put('specs/core/core.task.work.md', base.replace(field, replacement));
      const result = readSddCoverage(
        root,
        { kind: 'phase', task: 'CORE-work', phase: 'P1' },
        'phase-exit'
      );
      assert.equal(result.coverage.complete, true, JSON.stringify(result.coverage.findings));
      assert.deepEqual(
        result.coverage.rows.map((row) => row.path),
        ['config.json', 'src/value.ts']
      );
    }
    put(
      'specs/core/core.task.work.md',
      base.replace(field, '- **Target Files:**\n  - (нет — проверочная фаза)')
    );
    const empty = readSddCoverage(
      root,
      { kind: 'phase', task: 'CORE-work', phase: 'P1' },
      'phase-exit'
    );
    assert.equal(empty.coverage.complete, true, JSON.stringify(empty.coverage.findings));
    assert.deepEqual(empty.coverage.rows, []);
    assert.equal(empty.reads.sourceReads, 0);
  }));

test('ambiguous inline deletion, directories, mixed placeholders and duplicate fields are not empty-success', () =>
  fixture((root, put) => {
    put('specs/core/core.spec.md', spec('CORE'));
    const field = '- **Target Files:**\n  - `src/value.ts`';
    for (const replacement of [
      '- **Target Files:** `src/value.ts`; remove `src/old.ts` only after migration',
      '- **Target Files:** `src/`',
      '- **Target Files:**\n  - (нет — проверочная фаза)\n  - `src/value.ts`',
      '- **Target Files:**\n  - invent some files',
      '- **Target Files:** none\n- **Target Files:** `src/value.ts`',
      '- **Target Files:** `src/value.ts`\n  - `src/second.ts`',
    ]) {
      put('specs/core/core.task.work.md', ticket().replace(field, replacement));
      const result = readSddCoverage(
        root,
        { kind: 'phase', task: 'CORE-work', phase: 'P1' },
        'preflight'
      );
      assert.equal(result.coverage.canProceed, false, replacement);
      assert.ok(
        result.coverage.findings.some((finding) => finding.code === 'INVALID_PHASE'),
        replacement
      );
      assert.equal(result.reads.sourceReads, 0);
    }
  }));

test('declared excluded territory is never read from worktree or Git, including nested and JSON paths', () =>
  fixture((root, put) => {
    execFileSync('git', ['init', '-q'], { cwd: root });
    for (const directory of [
      'node_modules',
      '.git',
      'dist',
      'coverage',
      'build',
      'out',
      'NODE_MODULES',
    ]) {
      for (const path of [`${directory}/probe.ts`, `src/${directory}/probe.json`]) {
        put('specs/core/core.spec.md', spec('CORE', [path]));
        put(path, path.endsWith('.json') ? '{}' : '// @spec: CORE\n');
        const result = readSddCoverage(root, { kind: 'project' }, 'audit');
        assert.equal(result.coverage.canProceed, false, path);
        assert.ok(
          result.coverage.findings.some((finding) => finding.code === 'EXCLUDED_SOURCE_PATH'),
          path
        );
        assert.equal(result.reads.sourceReads, 0, path);
        assert.equal(result.reads.priorBytes, 0, path);
      }
    }
  }));

test('phase queries do not grade an unrelated child subtree; project query still reports it', () =>
  fixture((root, put) => {
    put('specs/core/core.spec.md', spec('CORE', ['src/value.ts'], ['./missing/missing.spec.md']));
    put('specs/core/core.task.work.md', ticket());
    put('src/value.ts', '// @spec: CORE');
    const result = readSddCoverage(
      root,
      { kind: 'phase', task: 'CORE-work', phase: 'P1' },
      'phase-exit'
    );
    assert.equal(result.coverage.complete, true, JSON.stringify(result.coverage.findings));
    assert.equal(readSddCoverage(root, { kind: 'project' }, 'audit').coverage.canProceed, false);
  }));

test('mixed Git observations exclude blocked and unsafe paths but retain safe missing-file evidence', () =>
  fixture((root, put) => {
    const paths = ['node_modules/vendor.ts', 'src/link.ts', 'src/gone.ts', 'src/value.ts'];
    put('specs/core/core.spec.md', spec('CORE', paths));
    for (const path of paths) put(path, '// @spec: CORE\nexport const value = 7;');
    const git = (...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
    git('init', '-q');
    git('add', '.');
    git(
      '-c',
      'user.name=Coverage Control',
      '-c',
      'user.email=coverage@example.invalid',
      '-c',
      'core.hooksPath=/dev/null',
      'commit',
      '-qm',
      'control input'
    );
    put('outside.ts', '// @spec: CORE');
    rmSync(join(root, 'src/link.ts'));
    symlinkSync(join(root, 'outside.ts'), join(root, 'src/link.ts'));
    rmSync(join(root, 'src/gone.ts'));
    const result = readSddCoverage(root, { kind: 'project' }, 'audit');
    const safePrior = execFileSync('git', ['cat-file', '--batch'], {
      cwd: root,
      input: 'HEAD:src/gone.ts\nHEAD:src/value.ts\n',
    });
    assert.equal(result.reads.sourceReads, 1);
    assert.equal(result.reads.priorBytes, safePrior.byteLength);
    for (const code of ['EXCLUDED_SOURCE_PATH', 'UNSAFE_PATH', 'UNEXPECTED_MISSING'])
      assert.ok(
        result.coverage.findings.some((finding) => finding.code === code),
        code
      );
    assert.equal(
      result.coverage.rows.find((row) => row.path === 'src/value.ts')?.state,
      'consistent'
    );
  }));

test('actual V2 no-write and conditional-directory forms are distinguished without altering historical tickets', () =>
  fixture((root, put) => {
    put('specs/core/core.spec.md', spec('CORE'));
    const actual = (file: string, phase: string) => {
      const parsed = extractSection(readFileSync(join(ownRoot, file), 'utf8'), `PHASE_${phase}`);
      assert.equal(parsed.status, 'ok');
      return parsed.status === 'ok' ? parsed.content : '';
    };
    const verification = actual('specs/agent-inbox/agent-inbox.task.AI-fasttest.md', 'P2');
    const base = ticket([{ id: 'P2' }]);
    const original = extractSection(base, 'PHASE_P2');
    assert.equal(original.status, 'ok');
    if (original.status !== 'ok') throw new Error('fixture phase absent');
    put('specs/core/core.task.work.md', base.replace(original.content, verification));
    const noWrite = readSddCoverage(
      root,
      { kind: 'phase', task: 'CORE-work', phase: 'P2' },
      'phase-exit'
    );
    assert.equal(noWrite.coverage.complete, true, JSON.stringify(noWrite.coverage.findings));
    assert.equal(noWrite.reads.sourceReads, 0);
    const ambiguous = actual('specs/agent-inbox/agent-inbox.task.AI-cutover.md', 'P1');
    const other = ticket();
    const old = extractSection(other, 'PHASE_P1');
    assert.equal(old.status, 'ok');
    if (old.status !== 'ok') throw new Error('fixture phase absent');
    put('specs/core/core.task.work.md', other.replace(old.content, ambiguous));
    const rejected = readSddCoverage(
      root,
      { kind: 'phase', task: 'CORE-work', phase: 'P1' },
      'preflight'
    );
    assert.equal(rejected.coverage.canProceed, false);
    assert.ok(rejected.coverage.findings.some((finding) => finding.code === 'INVALID_PHASE'));
    assert.equal(rejected.reads.sourceReads, 0);
  }));

test('header parser preserves conservative JSDoc and interleaved-comment semantics without body spoof', () =>
  fixture((root, put) => {
    put('specs/core/core.spec.md', spec('CORE', ['src/value.ts']));
    for (const [content, complete] of [
      ['/* license */\n// @spec: CORE\nexport const value = 7;', true],
      ['/** declaration docs */\n// @spec: CORE\nexport const value = 7;', false],
      ['/** @license MIT */\n// @spec: CORE\nexport const value = 7;', false],
      ['// @file: value\n// explanatory text\n// @spec: CORE\nexport const value = 7;', true],
      ['// @spec: CORE\n\n/** declaration docs */\nexport const value = 7;', true],
    ] as const) {
      put('src/value.ts', content);
      assert.equal(
        readSddCoverage(root, { kind: 'project' }, 'audit').coverage.complete,
        complete,
        content
      );
    }
  }));

test(
  'both actual CLI entrypoints return the same map without scanning unrelated sources',
  { timeout: 30000 },
  () =>
    fixture((root, put) => {
      put('specs/core/core.spec.md', spec('CORE', ['src/value.ts']));
      put('specs/core/core.task.work.md', ticket());
      put('src/value.ts', 'export const value = 7;');
      put('unrelated.ts', '// @spec: UNKNOWN');
      const invoke = (command: string, stage: string) =>
        spawnSync(
          process.execPath,
          [
            '--import',
            resolve(ownRoot, 'node_modules/tsx/dist/loader.mjs'),
            resolve(ownRoot, `cli/cmd/${command}/${command}.cmd.ts`),
            '--coverage',
            '--task',
            'CORE-work',
            '--phase',
            'P1',
            '--stage',
            stage,
            '--json',
          ],
          { cwd: root, encoding: 'utf8', timeout: 20000 }
        );
      const orient = invoke('orient', 'preflight');
      const check = invoke('sdd-check', 'preflight');
      assert.equal(orient.status, 0, orient.stderr + orient.stdout);
      assert.equal(check.status, 0, check.stderr + check.stdout);
      const result = JSON.parse(orient.stdout) as CoverageDocument;
      for (const command of ['orient', 'sdd-check']) {
        const bad = spawnSync(
          process.execPath,
          [
            '--import',
            resolve(ownRoot, 'node_modules/tsx/dist/loader.mjs'),
            resolve(ownRoot, `cli/cmd/${command}/${command}.cmd.ts`),
            '--coverage=true',
          ],
          { cwd: root, encoding: 'utf8', timeout: 20000 }
        );
        assert.equal(bad.status, 2, bad.stdout + bad.stderr);
        assert.match(bad.stdout, /SDD_COVERAGE_BAD_INVOCATION/);
      }
      assert.deepEqual(JSON.parse(check.stdout), result);
      assert.equal(result.reads.sourceReads, 1);
      assert.equal(result.coverage.complete, false);
      assert.equal(invoke('sdd-check', 'phase-exit').status, 1);
      put('src/value.ts', '// @spec: CORE\nexport const value = 7;');
      assert.equal(invoke('sdd-check', 'phase-exit').status, 0);
    })
);
