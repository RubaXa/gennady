// @file: Owned real-Git frozen MAIN archive, disposition, lifecycle and isolation acceptance.
// @spec: INFRA-BASE
// @consumers: normal unit gate, R4/R5 independent review

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { after, afterEach, before, it } from 'node:test';
import { pathToFileURL } from 'node:url';
import { collectTicketCorpus } from '../../shared/sdd/ticket-resolve.ts';
import { cleanTestChildEnv } from '../../cli/__tests__/tool-behavior/run-cli.ts';
import {
  ARCHIVE_ROOT,
  DECISIONS_PATH,
  FROZEN_REFS,
  MANIFEST_PATH,
  checkFrozenMain,
  createFrozenManifest,
  git,
  sha256,
  type Decisions,
  type FrozenManifest,
} from '../main-carry-disposition.ts';

const ROOT = resolve(import.meta.dirname, '../..');
const context = { holder: '', seed: '', roots: [] as string[] };
function write(root: string, path: string, bytes: Buffer | string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), bytes);
}
function manifest(root: string): FrozenManifest {
  return JSON.parse(readFileSync(join(root, MANIFEST_PATH), 'utf8'));
}
function save(root: string, value: FrozenManifest): void {
  write(root, MANIFEST_PATH, `${JSON.stringify(value, null, 2)}\n`);
}
function fixture(): string {
  const root = mkdtempSync(join(context.holder, 'case-'));
  context.roots.push(root);
  cpSync(context.seed, root, { recursive: true });
  return root;
}
function newCommit(root: string, parent: string): string {
  const tree = git(root, ['rev-parse', `${parent}^{tree}`])
    .toString()
    .trim();
  return git(
    root,
    [
      '-c',
      'user.name=R4 Fixture',
      '-c',
      'user.email=r4@example.invalid',
      'commit-tree',
      tree,
      '-p',
      parent,
    ],
    'owned fixture commit\n'
  )
    .toString()
    .trim();
}

before(() => {
  context.holder = mkdtempSync(join(tmpdir(), 'gennady-r4-owned-'));
  context.seed = join(context.holder, 'seed');
  mkdirSync(context.seed);
  git(context.seed, ['init', '--quiet']);
  // Import the complete frozen reachable object graph once. No alternates, old worktree,
  // home fixture, ancestor node_modules or mutation of source refs is used by the checker.
  const pack = git(
    ROOT,
    ['pack-objects', '--stdout', '--revs'],
    `${FROZEN_REFS.main}\n${FROZEN_REFS.releaseAudit}\n${FROZEN_REFS.releaseBase}\n`
  );
  git(context.seed, ['index-pack', '--stdin'], pack);
  git(context.seed, ['update-ref', 'HEAD', FROZEN_REFS.releaseBase]);
  git(context.seed, ['update-ref', 'refs/remotes/origin/main', FROZEN_REFS.main]);
  git(context.seed, [
    'update-ref',
    'refs/remotes/origin/codex/sdd-v2-rc52-followup',
    FROZEN_REFS.releaseBase,
  ]);
  const frozen = manifest(ROOT);
  for (const proof of frozen.currentProof)
    write(context.seed, proof.path, readFileSync(join(ROOT, proof.path)));
  cpSync(join(ROOT, ARCHIVE_ROOT), join(context.seed, ARCHIVE_ROOT), { recursive: true });
});
afterEach(() => {
  for (const root of context.roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
after(() => {
  if (context.holder) rmSync(context.holder, { recursive: true, force: true });
});

it('reconstructs real 520 records, 521 rename identities and 117 commits in owned Git', () => {
  const root = fixture();
  const result = checkFrozenMain(root, { preReconciliation: true });
  assert.equal(result.rows, 520);
  assert.equal(result.commits, 117);
  const frozen = manifest(root);
  assert.equal(new Set(frozen.rows.flatMap(({ oldPath, path }) => [oldPath, path])).size, 521);
  const renamed = frozen.rows.find(({ status }) => status.startsWith('R'))!;
  assert.equal(renamed.oldPath, 'cli/cmd/orient/core/damerau-levenshtein.ts');
  assert.equal(renamed.path, 'shared/common/damerau-levenshtein.ts');
});

const mutations: Array<[string, (value: FrozenManifest) => void, RegExp]> = [
  [
    'omitted row',
    (value) => {
      value.rows.pop();
    },
    /COUNT/,
  ],
  [
    'extra row',
    (value) => {
      value.rows.push(value.rows[0]);
    },
    /COUNT/,
  ],
  [
    'duplicate row',
    (value) => {
      value.rows[1] = value.rows[0];
    },
    /DUPLICATE/,
  ],
  [
    'wrong frozen ref',
    (value) => {
      value.refs.main = '0'.repeat(40) as typeof value.refs.main;
    },
    /REF/,
  ],
  [
    'wrong source blob',
    (value) => {
      value.rows.find((row) => row.source)!.source!.oid = '0'.repeat(40);
    },
    /ROWS/,
  ],
  [
    'wrong source path',
    (value) => {
      value.rows[0].path = 'not-reviewed.ts';
    },
    /ROWS/,
  ],
  [
    'wrong original commit',
    (value) => {
      value.commits[0] = '0'.repeat(40);
    },
    /COMMITS/,
  ],
  [
    'false current mapping',
    (value) => {
      value.rows[0].decision.target = 'package.json';
    },
    /ROWS/,
  ],
  [
    'changed current hash',
    (value) => {
      value.currentProof[0].sha256 = '0'.repeat(64);
    },
    /CURRENT_DRIFT/,
  ],
];
for (const [name, mutate, error] of mutations)
  it(`rejects ${name}`, () => {
    const root = fixture();
    const value = manifest(root);
    mutate(value);
    save(root, value);
    assert.throws(() => checkFrozenMain(root), error);
  });

it('rejects corrupt, missing and undeclared archive bytes', () => {
  const root = fixture();
  const object = manifest(root).rows.find((row) => row.source)!.source!;
  const path = `${ARCHIVE_ROOT}/objects/${object.oid}.blob`;
  write(root, path, 'tampered');
  assert.throws(() => checkFrozenMain(root), /ARCHIVE_CORRUPTION/);
  rmSync(join(root, path));
  assert.throws(() => checkFrozenMain(root), /ARCHIVE_INVENTORY/);
  write(root, path, git(root, ['cat-file', 'blob', object.oid]));
  write(root, `${ARCHIVE_ROOT}/objects/undeclared.blob`, 'extra');
  assert.throws(() => checkFrozenMain(root), /ARCHIVE_INVENTORY/);
});

it('rejects executable archive and symlink paths', () => {
  const root = fixture();
  const path = join(
    root,
    ARCHIVE_ROOT,
    'objects',
    `${manifest(root).rows.find((row) => row.source)!.source!.oid}.blob`
  );
  chmodSync(path, 0o755);
  assert.throws(() => checkFrozenMain(root), /ARCHIVE_INVENTORY/);
  chmodSync(path, 0o644);
  const bytes = readFileSync(path);
  rmSync(path);
  write(root, 'outside.blob', bytes);
  symlinkSync(join(root, 'outside.blob'), path);
  assert.throws(() => checkFrozenMain(root), /ARCHIVE_INVENTORY/);
});

it('rejects unknown root Markdown and altered README before archive activation', () => {
  const root = fixture();
  const journal = git(root, [
    'show',
    `${FROZEN_REFS.main}:tasks/ai-skills/sdd-skills/sdd-skills.task-97.md`,
  ]);
  write(root, `${ARCHIVE_ROOT}/unexpected.task.historical.md`, journal);
  assert.throws(() => checkFrozenMain(root), /ARCHIVE_INVENTORY/);
  rmSync(join(root, ARCHIVE_ROOT, 'unexpected.task.historical.md'));
  write(root, `${ARCHIVE_ROOT}/README.md`, journal);
  assert.throws(() => checkFrozenMain(root), /CURRENT_DRIFT/);
});

it('rejects traversal and duplicate authoring paths even after manifest regeneration', () => {
  const root = fixture();
  const decisions: Decisions = JSON.parse(readFileSync(join(root, DECISIONS_PATH), 'utf8'));
  decisions.groups[0].target = '../outside';
  write(root, DECISIONS_PATH, JSON.stringify(decisions));
  assert.throws(() => createFrozenManifest(root), /UNSAFE_PATH/);
  decisions.groups[0].target = '.gitignore';
  decisions.groups[0].paths.push(decisions.groups[0].paths[0]);
  write(root, DECISIONS_PATH, JSON.stringify(decisions));
  assert.throws(() => createFrozenManifest(root), /DUPLICATE/);
});

it('rejects false retain and mismatched declared adapt owner after rehash', () => {
  const root = fixture();
  const original = readFileSync(join(root, DECISIONS_PATH));
  const decisions: Decisions = JSON.parse(original.toString());
  const adapted = decisions.groups.find(
    (group) =>
      group.disposition === 'adapt' &&
      group.target?.endsWith('.ts') &&
      group.paths.length === 1 &&
      group.paths[0] === group.target
  )!;
  assert.ok(adapted);
  adapted.owner = 'specs/infra-base/infra-base.spec.md';
  write(root, DECISIONS_PATH, JSON.stringify(decisions));
  save(root, createFrozenManifest(root));
  assert.throws(() => checkFrozenMain(root), /OWNER/);
  write(root, DECISIONS_PATH, original);
  const falseRetain: Decisions = JSON.parse(original.toString());
  falseRetain.groups.find((group) => group.target === '.gitignore')!.disposition = 'retain';
  write(root, DECISIONS_PATH, JSON.stringify(falseRetain));
  save(root, createFrozenManifest(root));
  assert.throws(() => checkFrozenMain(root), /FALSE_RETAIN/);
});

it('binds current actual bytes, not only an old release snapshot or eventual self SHA', () => {
  const root = fixture();
  write(root, 'package.json', `${readFileSync(join(root, 'package.json'))}\n`);
  assert.throws(() => checkFrozenMain(root), /CURRENT_DRIFT/);
});

it('preserves post-main historical integrity but rejects changed live main before reconciliation', () => {
  const root = fixture();
  git(root, ['update-ref', 'refs/remotes/origin/main', newCommit(root, FROZEN_REFS.main)]);
  assert.equal(checkFrozenMain(root).rows, 520);
  assert.throws(() => checkFrozenMain(root, { preReconciliation: true }), /REF_DRIFT/);
});

it('strict boundary rejects moved-ahead and divergent release refs', () => {
  const root = fixture();
  const ahead = newCommit(root, FROZEN_REFS.releaseBase);
  git(root, ['update-ref', 'refs/remotes/origin/codex/sdd-v2-rc52-followup', ahead]);
  assert.throws(() => checkFrozenMain(root, { preReconciliation: true }), /LINEAGE/);
  git(root, ['update-ref', 'HEAD', newCommit(root, FROZEN_REFS.releaseBase)]);
  // Commit bodies must differ to obtain a true divergent identity.
  const tree = git(root, ['rev-parse', `${FROZEN_REFS.releaseBase}^{tree}`])
    .toString()
    .trim();
  const divergent = git(
    root,
    [
      '-c',
      'user.name=R4 Fixture',
      '-c',
      'user.email=r4@example.invalid',
      'commit-tree',
      tree,
      '-p',
      FROZEN_REFS.releaseBase,
    ],
    'other branch\n'
  )
    .toString()
    .trim();
  git(root, ['update-ref', 'HEAD', divergent]);
  assert.throws(() => checkFrozenMain(root, { preReconciliation: true }), /LINEAGE/);
});

it('retains exact raw journal bytes without activating them in the real collector', () => {
  const root = mkdtempSync(join(context.holder, 'scanner-'));
  context.roots.push(root);
  const actual = collectTicketCorpus(ROOT);
  assert.equal(actual.ok, true);
  if (!actual.ok) throw new Error(actual.detail);
  const ticket = actual.refs[0];
  write(root, relative(ROOT, ticket.file), ticket.content);
  const before = collectTicketCorpus(root);
  cpSync(join(ROOT, ARCHIVE_ROOT), join(root, ARCHIVE_ROOT), { recursive: true });
  assert.deepEqual(collectTicketCorpus(root), before);
  const frozen = manifest(ROOT);
  for (const [path, expected] of [
    [
      'tasks/ai-skills/sdd-skills/sdd-skills.task-97.md',
      'e8deed5be0d0ad32d9fb8e9c021ea9c960c2709384133d4139bf36a5fc6b55fb',
    ],
    [
      'tasks/stack/stack-library.task-95.md',
      '247e9fe6e6bab255fb292267d3c9767bc5678e32265dd3e9923c4be09dc5ded6',
    ],
    [
      'tasks/stack/verify-command.task-96.md',
      'd65e4bb182a6b4e859676dcec7ea610fa77dda9b606cd0a191442cddd9ff63c6',
    ],
  ]) {
    const source = frozen.rows.find((row) => row.path === path)!.source!;
    const bytes = readFileSync(join(root, ARCHIVE_ROOT, 'objects', `${source.oid}.blob`));
    assert.equal(sha256(bytes), expected);
    assert.deepEqual(bytes, git(ROOT, ['show', `${FROZEN_REFS.main}:${path}`]));
  }
});

it('actual local npm pack applies unchanged package/ignore policy and excludes all frozen evidence', () => {
  const root = mkdtempSync(join(context.holder, 'pack-'));
  context.roots.push(root);
  for (const path of ['package.json', '.npmignore', 'README.md'])
    write(root, path, readFileSync(join(ROOT, path)));
  cpSync(join(ROOT, ARCHIVE_ROOT), join(root, ARCHIVE_ROOT), { recursive: true });
  mkdirSync(join(root, '.home'));
  write(root, '.npmrc-empty', '');
  write(root, '.npmrc-global-empty', '');
  const result = spawnSync('npm', ['pack', '--ignore-scripts', '--json', '--offline'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 20_000,
    env: {
      ...cleanTestChildEnv(process.env),
      HOME: join(root, '.home'),
      NODE_ENV: 'production',
      npm_config_cache: join(root, '.cache'),
      npm_config_userconfig: join(root, '.npmrc-empty'),
      npm_config_globalconfig: join(root, '.npmrc-global-empty'),
    },
  });
  assert.equal(result.status, 0, `${result.error?.message ?? ''}\n${result.stderr}`);
  const files = (JSON.parse(result.stdout) as Array<{ files: Array<{ path: string }> }>)[0].files;
  assert.ok(files.some(({ path }) => path === 'package.json'));
  assert.equal(
    files.some(({ path }) => path.startsWith('migration/') || path.endsWith('.blob')),
    false
  );
});

it('the actual checker CLI derives a whitespace repository root from its file URL', () => {
  const root = join(fixture(), 'repository with spaces');
  cpSync(context.seed, root, { recursive: true });
  for (const path of [
    'shared/sdd/source-ownership-header.ts',
    'shared/sdd/spec-id.ts',
    'shared/sdd/section.ts',
    'shared/sdd/markdown-fence.ts',
  ])
    write(root, path, readFileSync(join(ROOT, path)));
  // Explicit test-loader dependency only; no source refs or Git alternates are borrowed.
  mkdirSync(join(root, 'node_modules'));
  symlinkSync(join(ROOT, 'node_modules/tsx'), join(root, 'node_modules/tsx'));
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      join(ROOT, 'node_modules/tsx/dist/loader.mjs'),
      join(root, 'scripts/main-carry-disposition.ts'),
      '--pre-reconciliation',
    ],
    { cwd: context.holder, encoding: 'utf8', env: cleanTestChildEnv(process.env), timeout: 20_000 }
  );
  assert.equal(result.status, 0, `${result.error?.message ?? ''}\n${result.stderr}`);
  assert.equal(JSON.parse(result.stdout).rows, 520);
});

it('stdin library import does not mistake argv minus for a CLI file or perform writes', () => {
  const root = mkdtempSync(join(context.holder, 'stdin-import-'));
  context.roots.push(root);
  const result = spawnSync(
    process.execPath,
    ['--import', join(ROOT, 'node_modules/tsx/dist/loader.mjs'), '--input-type=module', '-'],
    {
      cwd: root,
      input: `import ${JSON.stringify(pathToFileURL(join(ROOT, 'scripts/main-carry-disposition.ts')).href)}; process.stdout.write('import-only\\n');`,
      encoding: 'utf8',
      env: cleanTestChildEnv(process.env),
      timeout: 20_000,
    }
  );
  assert.equal(result.status, 0, `${result.error?.message ?? ''}\n${result.stderr}`);
  assert.equal(result.stdout, 'import-only\n');
  assert.deepEqual(readdirSync(root), []);
});
