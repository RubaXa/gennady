// @file: Owned Git migration-ledger identity and inert archive acceptance.
// @spec: AI-SKILLS
// @consumers: normal unit gate; release evidence reviewer

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, posix, win32 } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { after, afterEach, before, it } from 'node:test';
import { committedMigrationScopes } from '../release-migration-scopes.ts';
import { sourceScopes } from '../release-evidence-pack-check.ts';
import { releaseEvidenceCommandPlan } from '../release-evidence-contract.ts';
import {
  ARCHIVE_ROOT,
  FROZEN_REFS,
  FROZEN_PROOF_SOURCE,
  MANIFEST_PATH,
  git as frozenGit,
} from '../../../../scripts/main-carry-disposition.ts';

const ROOT = resolve(import.meta.dirname, '../../../..');
const context = { holder: '', roots: [] as string[] };
function git(root: string, args: string[]): string {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', timeout: 30_000 });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function write(root: string, path: string, content: string | Buffer): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}
function commit(root: string): string {
  git(root, ['add', '.']);
  git(root, [
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '--quiet',
    '-m',
    'owned contracts',
  ]);
  return git(root, ['rev-parse', 'HEAD']);
}
function fixture(): string {
  const root = mkdtempSync(join(context.holder, 'case-'));
  context.roots.push(root);
  git(root, ['init', '--quiet']);
  write(root, 'specs/cli/cli.spec.md', '# CLI\n');
  write(
    root,
    'migration/README.md',
    '| `migration/cli/cli.spec.migration.md` | `specs/cli/cli.spec.md` | 0 |\n'
  );
  write(
    root,
    'migration/cli/cli.spec.migration.md',
    '# План миграции: specs/cli/cli.spec.md\n\n- **Status:** APPROVED\n- **Scope:** cli\n' +
      ['INVENTORY', 'SECTION_MAP', 'TICKET_MAP', 'DIAGRAM_PLAN', 'STEPS']
        .map(
          (section) =>
            `<!--SECTION:${section}-->\nowned historical contract\n<!--/SECTION:${section}-->\n`
        )
        .join('\n')
  );
  return root;
}
before(() => {
  context.holder = mkdtempSync(join(tmpdir(), 'uv25-scope-owned-'));
});
afterEach(() => {
  for (const root of context.roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
after(() => {
  rmSync(context.holder, { recursive: true, force: true });
});

it('preserves pre-archive evidence contracts independently of uncommitted filesystem drift', () => {
  const root = fixture();
  const source = commit(root);
  write(root, 'migration/unknown/foreign.txt', 'uncommitted');
  assert.deepEqual(committedMigrationScopes(root, source), ['cli']);
  const failures: string[] = [];
  assert.deepEqual(sourceScopes(root, source, failures), ['cli']);
  assert.deepEqual(failures, []);
});

it('rejects shallow ancestry instead of silently selecting the pre-cutover contract', () => {
  const root = fixture();
  const source = commit(root);
  write(root, '.git/shallow', `${source}\n`);
  assert.throws(() => committedMigrationScopes(root, source), /ancestry is incomplete: shallow/);
});

it('rejects missing parent objects instead of silently selecting the pre-cutover contract', () => {
  const root = fixture();
  const source = commit(root);
  const tree = git(root, ['rev-parse', `${source}^{tree}`]);
  const broken = frozenGit(
    root,
    ['hash-object', '-t', 'commit', '-w', '--stdin'],
    `tree ${tree}\nparent ${'f'.repeat(40)}\nauthor Fixture <fixture@example.invalid> 1 +0000\ncommitter Fixture <fixture@example.invalid> 1 +0000\n\nmissing parent\n`
  )
    .toString('utf8')
    .trim();
  assert.throws(() => committedMigrationScopes(root, broken), /migration source Git failure/);
});

const mutations: Array<[string, (root: string) => void, RegExp]> = [
  [
    'literal backslash in a Git ledger path',
    (root) => {
      const spec = 'specs/cli\\sub/foreign.spec.md';
      const plan = 'migration/cli\\sub/foreign.spec.migration.md';
      write(root, spec, '# owned nonportable unit\n');
      write(
        root,
        plan,
        readFileSync(join(root, 'migration/cli/cli.spec.migration.md'), 'utf8')
          .replaceAll('specs/cli/cli.spec.md', spec)
          .replace('**Scope:** cli', '**Scope:** cli\\sub')
      );
      write(
        root,
        'migration/README.md',
        readFileSync(join(root, 'migration/README.md'), 'utf8') +
          `| \`${plan}\` | \`${spec}\` | 0 |\n`
      );
    },
    /invalid migration unit spec/,
  ],
  [
    'whole archive omitted after canonical checker introduction',
    (root) =>
      write(
        root,
        'scripts/main-carry-disposition.ts',
        readFileSync(join(ROOT, 'scripts/main-carry-disposition.ts'))
      ),
    /source archive required/,
  ],
  [
    'archive disguised as a genuine unit',
    (root) => {
      write(root, 'specs/frozen-main/frozen-main.spec.md', '# inert archive is not a unit\n');
      write(
        root,
        'migration/frozen-main/frozen-main.spec.migration.md',
        readFileSync(join(root, 'migration/cli/cli.spec.migration.md'), 'utf8').replaceAll(
          'cli',
          'frozen-main'
        )
      );
      write(
        root,
        'migration/README.md',
        readFileSync(join(root, 'migration/README.md'), 'utf8') +
          '| `migration/frozen-main/frozen-main.spec.migration.md` | `specs/frozen-main/frozen-main.spec.md` | 0 |\n'
      );
    },
    /inert archive cannot be a migration unit/,
  ],
  [
    'pre-archive source spec scope omitted from migration units',
    (root) => write(root, 'specs/foreign/foreign.spec.md', '# no historical contract\n'),
    /source spec scope has no migration units/,
  ],
  [
    'unknown directory',
    (root) => write(root, 'migration/unknown/foreign.txt', 'unknown'),
    /unknown migration directory/,
  ],
  [
    'missing plan',
    (root) => rmSync(join(root, 'migration/cli/cli.spec.migration.md')),
    /missing\/unsafe migration contract/,
  ],
  [
    'empty plan',
    (root) => write(root, 'migration/cli/cli.spec.migration.md', ''),
    /malformed migration unit/,
  ],
  [
    'missing ledger row',
    (root) => write(root, 'migration/README.md', '# no units'),
    /ledger is empty/,
  ],
  [
    'duplicate row',
    (root) =>
      write(
        root,
        'migration/README.md',
        readFileSync(join(root, 'migration/README.md'), 'utf8').repeat(2)
      ),
    /duplicate migration unit/,
  ],
  [
    'unlisted extra plan',
    (root) => write(root, 'migration/cli/extra.spec.migration.md', 'not listed'),
    /unlisted migration unit/,
  ],
  [
    'false scope',
    (root) =>
      write(
        root,
        'migration/cli/cli.spec.migration.md',
        readFileSync(join(root, 'migration/cli/cli.spec.migration.md'), 'utf8').replace(
          '**Scope:** cli',
          '**Scope:** other'
        )
      ),
    /malformed migration unit/,
  ],
  [
    'missing section',
    (root) =>
      write(
        root,
        'migration/cli/cli.spec.migration.md',
        readFileSync(join(root, 'migration/cli/cli.spec.migration.md'), 'utf8').replace(
          '<!--SECTION:STEPS-->',
          '<!--not-steps-->'
        )
      ),
    /missing migration unit section/,
  ],
  [
    'empty section',
    (root) =>
      write(
        root,
        'migration/cli/cli.spec.migration.md',
        readFileSync(join(root, 'migration/cli/cli.spec.migration.md'), 'utf8').replace(
          /(<!--SECTION:STEPS-->)[\s\S]*?(<!--\/SECTION:STEPS-->)/u,
          '$1\n$2'
        )
      ),
    /empty\/missing migration unit section/,
  ],
  [
    'path escape',
    (root) =>
      write(
        root,
        'migration/README.md',
        '| `migration/cli/cli.spec.migration.md` | `specs/cli/../cli.spec.md` | 0 |\n'
      ),
    /invalid migration unit spec/,
  ],
  [
    'symlink plan',
    (root) => {
      rmSync(join(root, 'migration/cli/cli.spec.migration.md'));
      symlinkSync('../../specs/cli/cli.spec.md', join(root, 'migration/cli/cli.spec.migration.md'));
    },
    /missing\/unsafe migration contract/,
  ],
  [
    'symlink directory',
    (root) => symlinkSync('../specs/cli', join(root, 'migration/foreign')),
    /missing\/unsafe migration contract/,
  ],
  [
    'spec without a scope directory',
    (root) =>
      write(
        root,
        'migration/README.md',
        '| `migration/cli.spec.migration.md` | `specs/cli.spec.md` | 0 |\n'
      ),
    /invalid migration unit spec/,
  ],
];
for (const [label, mutate, finding] of mutations)
  it(`rejects ${label} in the actual committed source`, () => {
    const root = fixture();
    mutate(root);
    const source = commit(root);
    assert.throws(() => committedMigrationScopes(root, source), finding);
    const failures: string[] = [];
    assert.deepEqual(sourceScopes(root, source, failures), []);
    assert.match(failures.join('\n'), finding);
  });

it('adapts the actual existing unit path function through POSIX and Windows native bindings', () => {
  // Execute only these two trusted local declarations, not their modules/imports or any I/O.
  // This is native-path semantics evidence on this host, not an actual Windows runtime run.
  function declaration(path: string, name: string): string {
    const file = ts.createSourceFile(
      path,
      readFileSync(join(ROOT, path), 'utf8'),
      ts.ScriptTarget.ES2022,
      true
    );
    const node = file.statements.find(
      (statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === name
    );
    assert.ok(node, `missing trusted declaration ${name}`);
    return node.getText(file).replace(/^export\s+/u, '');
  }
  const source =
    declaration('shared/sdd/migration-plan.ts', 'unitFilePath') +
    '\n' +
    declaration('ai/flow-eval/scripts/release-migration-scopes.ts', 'migrationUnitGitPath');
  const code = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  for (const native of [posix, win32]) {
    for (const spec of ['specs/cli/cli.spec.md', 'specs/cli/verify/verify.spec.md']) {
      const actual = runInNewContext(
        `${code}\nmigrationUnitGitPath(spec);`,
        {
          spec,
          sep: native.sep,
          join: native.join,
          dirname: native.dirname,
          basename: native.basename,
        },
        { timeout: 1000 }
      );
      assert.equal(
        actual,
        spec.replace(/^specs\//u, 'migration/').replace(/\.md$/u, '.migration.md')
      );
    }
  }
});

it('verifies the real inert archive, excludes no genuine scope and rejects corrupted raw bytes', () => {
  const root = mkdtempSync(join(context.holder, 'archive-'));
  context.roots.push(root);
  git(root, ['init', '--quiet']);
  const baseSource = git(ROOT, ['rev-parse', 'HEAD']);
  const pack = frozenGit(
    ROOT,
    ['pack-objects', '--stdout', '--revs'],
    `${baseSource}\n${FROZEN_PROOF_SOURCE}\n${FROZEN_REFS.main}\n${FROZEN_REFS.releaseAudit}\n`
  );
  frozenGit(root, ['index-pack', '--stdin'], pack);
  git(root, ['update-ref', 'HEAD', baseSource]);
  const manifest = JSON.parse(readFileSync(join(ROOT, MANIFEST_PATH), 'utf8'));
  cpSync(join(ROOT, ARCHIVE_ROOT), join(root, ARCHIVE_ROOT), { recursive: true });
  if (
    !frozenGit(ROOT, ['show', `${baseSource}:${MANIFEST_PATH}`]).equals(
      readFileSync(join(ROOT, MANIFEST_PATH))
    )
  )
    assert.throws(() => committedMigrationScopes(root, baseSource), /source archive drift/);
  const source = baseSource;
  const scopes = committedMigrationScopes(root, source);
  const historicalLedger = frozenGit(ROOT, [
    'show',
    `${FROZEN_PROOF_SOURCE}:migration/README.md`,
  ]).toString('utf8');
  assert.deepEqual(
    scopes,
    [
      ...new Set(
        [...historicalLedger.matchAll(/^\|\s*`migration\/([^/]+)\//gmu)].map((row) => row[1])
      ),
    ].sort()
  );
  assert.equal(scopes.length, 12);
  assert.ok(!scopes.includes('frozen-main'));
  assert.equal(releaseEvidenceCommandPlan(scopes).length, 37);
  assert.equal(releaseEvidenceCommandPlan(scopes).filter((row) => row.migrationScope).length, 24);
  const failures: string[] = [];
  assert.deepEqual(sourceScopes(root, source, failures), scopes);
  assert.deepEqual(failures, []);
  git(root, ['read-tree', source]);
  write(root, 'specs/native-v2/native-v2.spec.md', '# New native V2 scope\n');
  git(root, ['add', '--', 'specs/native-v2/native-v2.spec.md']);
  git(root, [
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '--quiet',
    '-m',
    'owned native V2 scope without historical migration',
  ]);
  const nativeSource = git(root, ['rev-parse', 'HEAD']);
  assert.deepEqual(committedMigrationScopes(root, nativeSource), scopes);
  const nativeFailures: string[] = [];
  assert.deepEqual(sourceScopes(root, nativeSource, nativeFailures), scopes);
  assert.deepEqual(nativeFailures, []);

  // contract: losing a complete historical scope cannot be disguised as a native V2 scope.
  git(root, ['read-tree', source]);
  write(
    root,
    'migration/README.md',
    historicalLedger
      .split('\n')
      .filter((line) => !/^\|\s*`migration\/mr-stats\//u.test(line))
      .join('\n')
  );
  git(root, ['rm', '--cached', '-r', '--', 'migration/mr-stats']);
  git(root, ['add', '--', 'migration/README.md']);
  git(root, [
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '--quiet',
    '-m',
    'owned omitted historical scope',
  ]);
  const omittedSource = git(root, ['rev-parse', 'HEAD']);
  assert.throws(
    () => committedMigrationScopes(root, omittedSource),
    /historical migration ledger drift/
  );
  const omittedFailures: string[] = [];
  assert.deepEqual(sourceScopes(root, omittedSource, omittedFailures), []);
  assert.match(omittedFailures.join('\n'), /historical migration ledger drift/);

  // contract: deleting both archive markers cannot reclassify a cutover descendant as old evidence.
  git(root, ['read-tree', omittedSource]);
  const nativeSpecs = [
    ...new Set(
      git(root, ['ls-tree', '-r', '--name-only', source, '--', 'specs'])
        .split('\n')
        .filter((path) => /\.(?:spec|1-spec)\.md$/u.test(path) && path.split('/').length >= 3)
        .map((path) => path.split('/')[1])
        .filter((scope) => !scopes.includes(scope))
    ),
  ];
  git(root, [
    'rm',
    '--cached',
    '-r',
    '--',
    'scripts/main-carry-disposition.ts',
    ARCHIVE_ROOT,
    'specs/mr-stats',
    ...nativeSpecs.map((scope) => `specs/${scope}`),
  ]);
  git(root, [
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '--quiet',
    '-m',
    'owned deleted checker archive and historical scope',
  ]);
  const disguisedSource = git(root, ['rev-parse', 'HEAD']);
  assert.throws(() => committedMigrationScopes(root, disguisedSource), /source archive required/);
  const disguisedFailures: string[] = [];
  assert.deepEqual(sourceScopes(root, disguisedSource, disguisedFailures), []);
  assert.match(disguisedFailures.join('\n'), /source archive required/);

  git(root, ['read-tree', source]);
  const plan = 'migration/mr-stats/mr-stats.spec.migration.md';
  write(
    root,
    plan,
    `${frozenGit(ROOT, ['show', `${source}:${plan}`]).toString('utf8')}\nchanged historical bytes\n`
  );
  git(root, ['add', '--', plan]);
  git(root, [
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '--quiet',
    '-m',
    'owned corrupted historical unit',
  ]);
  const changedUnitSource = git(root, ['rev-parse', 'HEAD']);
  assert.throws(
    () => committedMigrationScopes(root, changedUnitSource),
    /historical migration unit drift/
  );
  const object = manifest.rows.find((row: { source?: { oid: string } }) => row.source).source.oid;
  git(root, ['read-tree', source]);
  git(root, ['rm', '--cached', `${ARCHIVE_ROOT}/objects/${object}.blob`]);
  git(root, [
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '--quiet',
    '-m',
    'owned missing source archive object',
  ]);
  const incompleteSource = git(root, ['rev-parse', 'HEAD']);
  assert.throws(
    () => committedMigrationScopes(root, incompleteSource),
    /source archive inventory drift/
  );
  const incompleteFailures: string[] = [];
  assert.deepEqual(sourceScopes(root, incompleteSource, incompleteFailures), []);
  assert.match(incompleteFailures.join('\n'), /source archive inventory drift/);
  git(root, ['read-tree', source]);
  const extra = `${ARCHIVE_ROOT}/objects/extra.blob`;
  write(root, extra, 'extra source entry');
  git(root, ['add', extra]);
  git(root, [
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '--quiet',
    '-m',
    'owned extra source archive object',
  ]);
  const extraSource = git(root, ['rev-parse', 'HEAD']);
  rmSync(join(root, extra));
  assert.throws(
    () => committedMigrationScopes(root, extraSource),
    /source archive inventory drift/
  );
  write(root, `${ARCHIVE_ROOT}/objects/${object}.blob`, 'corrupted');
  assert.throws(() => committedMigrationScopes(root, source), /ARCHIVE_CORRUPTION/);
});
