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
import { readSddCoverage } from '../sdd-coverage-repository.ts';
import { runSddCoverageQuery } from '../sdd-coverage-query.ts';
import { inspectRepoPath } from '../../../../shared/common/repo-path.ts';
import type { CoverageDocument } from '../sdd-coverage-repository.ts';

const ownRoot = resolve(import.meta.dirname, '../../../..');
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

test('non-commentable artifacts are explicit unsupported evidence, never corrupted with comments', () =>
  fixture((root, put) => {
    put('specs/core/core.spec.md', spec('CORE', ['config.json']));
    put('config.json', '{"value":7}\n');
    const result = readSddCoverage(root, { kind: 'project' }, 'audit');
    assert.equal(result.coverage.canProceed, false);
    assert.ok(
      result.coverage.findings.some((finding) => finding.code === 'UNSUPPORTED_HEADER_FORMAT')
    );
    assert.equal(readFileSync(join(root, 'config.json'), 'utf8'), '{"value":7}\n');
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
