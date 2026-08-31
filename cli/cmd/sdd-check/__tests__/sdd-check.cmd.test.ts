// @file: Integration tests for SddCheckCommand#run — per-ticket + project-wide checks, exit codes.
// @consumers: gennady.ts
// @tasks: N/A

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  symlinkSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import { dirname, join, relative, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  formatCriticChangedState,
  hasCriticRoundsSection,
  latestCriticTargetSet,
  latestCriticWriteSet,
} from '../../../../shared/sdd/critic-readiness.ts';

type CheckModule = typeof import('../sdd-check.cmd.ts');

let mod: CheckModule;
let origExit: typeof process.exit;
let origArgv: string[];
let origCwd: string;
let dir: string;

function replaceFixture(source: string, needle: string, replacement: string): string {
  assert.ok(source.includes(needle), `fixture needle missing: ${needle}`);
  const changed = source.replace(needle, replacement);
  assert.notStrictEqual(changed, source);
  return changed;
}

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

const AUTHORING_CORRECTED_FIXTURE = fileURLToPath(
  new URL('./fixtures/authoring/corrected.task.md', import.meta.url)
);

function normalizeTaskArgs(rawArgs: string[]): { args: string[]; root: string } {
  let taskIndex = rawArgs.findIndex((value) => value === '--task');
  let embedded = false;
  if (taskIndex === -1) {
    taskIndex = rawArgs.findIndex((value) => value.startsWith('--task='));
    embedded = taskIndex !== -1;
  }
  const rawTask =
    taskIndex === -1
      ? null
      : embedded
        ? (rawArgs[taskIndex] ?? '').slice('--task='.length)
        : (rawArgs[taskIndex + 1] ?? null);
  let root = process.cwd() === origCwd ? dir : process.cwd();
  if (rawTask && isAbsolute(rawTask)) {
    if (rawTask === dir || rawTask.startsWith(`${dir}/`)) root = dir;
    else {
      const specsAt = rawTask.indexOf('/specs/');
      root = specsAt === -1 ? dirname(rawTask) : rawTask.slice(0, specsAt);
    }
  }
  if (!rawTask || !isAbsolute(rawTask)) return { args: rawArgs, root };
  const normalized = relative(root, rawTask);
  const args = [...rawArgs];
  if (embedded) args[taskIndex] = `--task=${normalized}`;
  else args[taskIndex + 1] = normalized;
  return { args, root };
}

/** @purpose Make a path unreadable when the host enforces chmod; otherwise skip the platform-sensitive assertion. */
function denyRead(
  context: { skip(message?: string): void },
  path: string,
  kind: 'file' | 'directory'
): boolean {
  chmodSync(path, 0o000);
  try {
    if (kind === 'file') readFileSync(path, 'utf-8');
    else readdirSync(path);
    context.skip('chmod does not deny reads for this test process');
    return false;
  } catch {
    return true;
  }
}

const reviewMember = (name: string): string =>
  [
    `# ${name}`,
    '<!--SECTION:CHANGE_MANIFEST-->',
    '## Change Manifest',
    'ТИП ИЗМЕНЕНИЯ: refine',
    '<!--/SECTION:CHANGE_MANIFEST-->',
  ].join('\n');

const reviewState = (
  name: string,
  verdict: string,
  targetSet: string,
  writeSet = targetSet,
  changes = 'none'
): string =>
  [
    reviewMember(name),
    '## Critic Rounds',
    '### Round 1 — 2026-08-28',
    `- Verdict: ${verdict}`,
    `- Target-set: ${targetSet}`,
    `- Write-set: ${writeSet}`,
    `- Changed-state: sha256:${'0'.repeat(64)}`,
    '- Dispatch: fresh — initial target-set',
    `- Changes: ${changes}`,
  ].join('\n');

const criticHistory = (
  name: string,
  rounds: { verdict: string; decision?: string; changes?: string }[],
  targetSet = 'primary.spec.md',
  writeSet = targetSet,
  primaryWritable = true
): string =>
  [
    primaryWritable ? reviewMember(name) : `# ${name}`,
    '## Critic Rounds',
    ...rounds.flatMap(({ verdict, decision, changes }, index) => {
      const number = index + 1;
      const resolvedChanges =
        changes ?? (index < rounds.length - 1 ? `edited round ${number}` : 'none');
      const changedState =
        index < rounds.length - 1
          ? `sha256:${'0123456789abcdef'[number % 16]?.repeat(64)}`
          : `sha256:${'0'.repeat(64)}`;
      return [
        `### Round ${number} — 2026-08-${String(number).padStart(2, '0')}`,
        `- Verdict: ${verdict}`,
        `- Target-set: ${targetSet}`,
        `- Write-set: ${writeSet}`,
        `- Changed-state: ${changedState}`,
        `- Dispatch: ${number === 1 ? 'fresh — initial target-set' : 'continued'}`,
        `- Changes: ${resolvedChanges}`,
        ...(decision ? [`- Operator-decision: ${decision}`] : []),
      ];
    }),
  ].join('\n');

const roundExample = (): string =>
  ['### Round 1 — 2026-08-28', '- Verdict: CLEAN', '- Target-set: secondary.spec.md'].join('\n');

const publicationResearch = (): string =>
  [
    '# Demo research',
    '<!--SECTION:STATUS-->',
    '**State:** proposed',
    '<!--/SECTION:STATUS-->',
    '<!--SECTION:PROBLEM-->',
    'Bounded problem.',
    '<!--/SECTION:PROBLEM-->',
    '<!--SECTION:CRITERIA-->',
    'Deterministic attribution.',
    '<!--/SECTION:CRITERIA-->',
    '<!--SECTION:OPTIONS-->',
    'One bounded option.',
    '<!--/SECTION:OPTIONS-->',
    '<!--SECTION:DECISION-->',
    'Candidate decision.',
    '<!--/SECTION:DECISION-->',
    '<!--SECTION:FINAL_DISPOSITION-->',
    '**Outcome:** pending',
    '<!--/SECTION:FINAL_DISPOSITION-->',
    '<!--SECTION:CONSEQUENCES-->',
    'Known consequence.',
    '<!--/SECTION:CONSEQUENCES-->',
    '<!--SECTION:EVIDENCE-->',
    'Local evidence.',
    '<!--/SECTION:EVIDENCE-->',
    '<!--SECTION:RELATED-->',
    'No related documents.',
    '<!--/SECTION:RELATED-->',
  ].join('\n');

const publicationSpec = (): string =>
  [
    reviewMember('Demo'),
    '<!--SECTION:SCOPE_TYPE-->',
    'infrastructure',
    '<!--/SECTION:SCOPE_TYPE-->',
    '<!--SECTION:RESEARCH-->',
    '## Research',
    '| Document | Finding | Decision |',
    '| --- | --- | --- |',
    '| [Demo research](./research/2026-08-30-demo.research.md) | bounded | candidate |',
    '<!--/SECTION:RESEARCH-->',
  ].join('\n');

const publicationPortal = (vision = 'Demo project'): string =>
  [
    '# Demo',
    '',
    '## Vision',
    '',
    vision,
    '',
    '## Scope Graph',
    '',
    '```mermaid',
    'graph TD',
    '  demo[demo]',
    '```',
    '',
    '## Scopes',
    '',
    '| Scope | Type | Status | Description |',
    '| --- | --- | --- | --- |',
    '| [`demo`](./demo/demo.spec.md) | infrastructure | 🚧 | Demo scope |',
    '',
  ].join('\n');

const publicationProjectIndex = (): string =>
  [
    '# Project Tasks',
    '## Entry Points',
    '- [Specs Portal](./README.md)',
    '## Project-Wide Conventions (declared once, inherited)',
    '- Deterministic.',
    '## Cross-Scope DAG',
    'No cross-scope edges.',
    '## Scope Tracker',
    '| Scope | Type | Index | Tasks | Done |',
    '| --- | --- | --- | --- | --- |',
    '| demo | infrastructure | [3-tasks](./demo/demo.3-tasks.md) | 1 | 0/1 |',
  ].join('\n');

const publicationScopeIndex = (): string =>
  [
    '# Tasks: demo',
    '## Scope Spec',
    '- [Scope spec](./demo.spec.md)',
    '## Cascade Table',
    '| Tier | coding | testing | infra | docs |',
    '| --- | --- | --- | --- | --- |',
    '| demo | deterministic | deterministic | — | — |',
    '## Inter-Module DAG',
    'No modules.',
    '## Tracker',
    '| Task-ID | Title | Module | Dependencies | Status | Reopens |',
    '| --- | --- | --- | --- | --- | --- |',
    '| DEMO-first | First | — | — | [ ] TODO | — |',
  ].join('\n');

function initPublicationRepo(name: string): {
  repo: string;
  spec: string;
  publicationPaths: string[];
} {
  const repo = join(dir, name);
  const scope = join(repo, 'specs', 'demo');
  mkdirSync(join(scope, 'research'), { recursive: true });
  writeFileSync(join(repo, 'package.json'), '{}\n');
  writeFileSync(join(repo, '.gitignore'), 'dist/\n');
  execFileSync('git', ['init', '-q'], { cwd: repo });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 'test'], { cwd: repo });
  execFileSync('git', ['add', 'package.json', '.gitignore'], { cwd: repo });
  execFileSync('git', ['commit', '-q', '-m', 'baseline'], { cwd: repo });

  const spec = join(scope, 'demo.spec.md');
  writeFileSync(spec, publicationSpec());
  writeFileSync(join(scope, 'research', '2026-08-30-demo.research.md'), publicationResearch());
  writeFileSync(join(repo, 'specs', 'README.md'), publicationPortal());
  writeFileSync(join(repo, 'specs', '3-tasks.md'), publicationProjectIndex());
  writeFileSync(join(scope, 'demo.3-tasks.md'), publicationScopeIndex());
  writeFileSync(join(repo, '.gitignore'), 'dist/\n.sdd-session.md\n');
  return {
    repo,
    spec,
    publicationPaths: [
      '.gitignore',
      'specs/3-tasks.md',
      'specs/README.md',
      'specs/demo/demo.3-tasks.md',
      'specs/demo/demo.spec.md',
      'specs/demo/research/2026-08-30-demo.research.md',
    ],
  };
}

/** @purpose Replace the fixture placeholder with the exact integrated-state fingerprint. */
function stampReviewState(bundle: string): void {
  const files = readdirSync(bundle)
    .filter((name) => name.endsWith('.spec.md'))
    .map((name) => join(bundle, name));
  const primary = files.find((file) => hasCriticRoundsSection(readFileSync(file, 'utf-8')));
  if (!primary) return;
  const primaryContent = readFileSync(primary, 'utf-8');
  const targetSet = latestCriticTargetSet(primaryContent);
  const writeSet = latestCriticWriteSet(primaryContent);
  if (!targetSet || !writeSet) return;
  let members: { path: string; content: string; primary: boolean }[];
  try {
    members = targetSet.map((path) => ({
      path,
      content: readFileSync(join(bundle, path), 'utf-8'),
      primary: join(bundle, path) === primary,
    }));
  } catch {
    return;
  }
  const state = formatCriticChangedState(members);
  assert.ok(primaryContent.includes(`sha256:${'0'.repeat(64)}`));
  writeFileSync(primary, primaryContent.replaceAll(`sha256:${'0'.repeat(64)}`, state), 'utf-8');
}

/** @purpose Give review-ready semantic fixtures genuine clean VCS evidence instead of bypassing git. */
function commitReviewFixture(root: string): void {
  if (!existsSync(join(root, '.git'))) execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'test'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  execFileSync('git', ['commit', '--allow-empty', '-qm', 'review fixture'], { cwd: root });
}

describe('SddCheckCommand', () => {
  before(async () => {
    origExit = process.exit;
    origArgv = process.argv;
    origCwd = process.cwd();
    process.exit = ((_code?: number) => undefined) as typeof process.exit;
    process.argv = ['node', 'gennady', 'sdd-check'];
    dir = mkdtempSync(join(tmpdir(), 'sdd-check-'));
    const loaded = await import('../sdd-check.cmd.ts');
    mod = {
      ...loaded,
      run: (rawArgs, explicitRoot) => {
        if (explicitRoot) return loaded.run(rawArgs, explicitRoot);
        const normalized = normalizeTaskArgs(rawArgs);
        return loaded.run(normalized.args, normalized.root);
      },
    };
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

  it('rejects unknown flags, missing values, illegal extra roots, and conflicting modes', async () => {
    const t = join(dir, 'strict-argv-clean.md');
    writeFileSync(t, CLEAN_TICKET, 'utf-8');
    const invalid = [
      argv('--all', dir, '--typo'),
      argv('--task'),
      argv('--review-ready'),
      argv('--review-publication'),
      argv('--review-state'),
      argv('--task', t, 'extra.md'),
      argv('--task', t, 'sdd-check'),
      argv('--all', dir, 'extra-root'),
      argv('--changed', dir, 'extra-root'),
      argv('--task', t, '--all'),
      argv('--all=true'),
    ];
    for (const rawArgs of invalid) {
      const result = await mod.run(rawArgs);
      assert.strictEqual(result.exitCode, 4);
      assert.match(result.text, /usage: gennady sdd-check/);
    }
  });

  it('--changed fails closed on a corrupt HEAD instead of reporting an empty clean set', async () => {
    const repo = join(dir, 'changed-corrupt-head');
    mkdirSync(repo, { recursive: true });
    writeFileSync(join(repo, 'tracked.ts'), '// @tasks: TSK-one\nexport const value = 1;\n');
    execFileSync('git', ['init', '-q'], { cwd: repo });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repo });
    execFileSync('git', ['config', 'user.name', 'test'], { cwd: repo });
    execFileSync('git', ['add', '-A'], { cwd: repo });
    execFileSync('git', ['commit', '-q', '-m', 'baseline'], { cwd: repo });
    writeFileSync(join(repo, 'tracked.ts'), '// dirty tracked file\nexport const value = 2;\n');
    const branch = execFileSync('git', ['symbolic-ref', 'HEAD'], {
      cwd: repo,
      encoding: 'utf-8',
    }).trim();
    writeFileSync(join(repo, '.git', branch), `${'1'.repeat(40)}\n`);

    const result = await mod.run(argv('--changed', repo));
    assert.strictEqual(result.exitCode, 1);
    assert.match(result.text, /ERR_CLI_SDD_CHECK_GIT_EVIDENCE/);
    assert.match(result.text, /exit \d+/);
    assert.doesNotMatch(result.text, /✅ clean/);
  });

  it('--changed treats a proven unborn repository as staged plus untracked empty-tree changes', async () => {
    const repo = join(dir, 'changed-unborn');
    mkdirSync(repo, { recursive: true });
    execFileSync('git', ['init', '-q'], { cwd: repo });
    writeFileSync(join(repo, 'new.ts'), '// @tasks: N/A\nexport const value = 1;\n');
    execFileSync('git', ['add', 'new.ts'], { cwd: repo });
    writeFileSync(join(repo, 'other.ts'), '// @tasks: N/A\nexport const other = 2;\n');
    const result = await mod.run(argv('--changed', repo));
    assert.strictEqual(result.exitCode, 0);
    assert.match(result.text, /2 file\(s\) checked/);
  });

  it('--changed never evaluates shell syntax embedded in the repository root', async () => {
    const parent = join(dir, 'changed-hostile-parent');
    const repo = join(parent, 'repo-$(touch SHOULD_NOT_EXIST)-`touch SHOULD_NOT_EXIST`');
    const marker = join(parent, 'SHOULD_NOT_EXIST');
    mkdirSync(repo, { recursive: true });
    execFileSync('git', ['init', '-q'], { cwd: repo });
    writeFileSync(
      join(repo, 'new.ts'),
      '// @tasks: N/A\n// @consumers: MissingConsumer\nexport const value = 1;\n'
    );
    const previous = process.cwd();
    try {
      process.chdir(parent);
      const result = await mod.run(argv('--changed', repo));
      assert.strictEqual(result.exitCode, 0, result.text);
      assert.match(result.text, /CONSUMERS_UNRESOLVED/);
      assert.throws(() => readFileSync(marker, 'utf-8'));
    } finally {
      process.chdir(previous);
    }
  });

  it('--changed accepts a legitimately deleted tracked source when append-only metadata is preserved', async () => {
    const repo = join(dir, 'changed-deleted-clean');
    mkdirSync(repo, { recursive: true });
    const source = join(repo, 'retired.ts');
    writeFileSync(source, '// @tasks: N/A\nexport const retired = true;\n');
    execFileSync('git', ['init', '-q'], { cwd: repo });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repo });
    execFileSync('git', ['config', 'user.name', 'test'], { cwd: repo });
    execFileSync('git', ['add', '-A'], { cwd: repo });
    execFileSync('git', ['commit', '-q', '-m', 'baseline'], { cwd: repo });
    rmSync(source);

    const result = await mod.run(argv('--changed', repo));
    assert.strictEqual(result.exitCode, 0, result.text);
    assert.match(result.text, /1 file\(s\) checked/);
  });

  it('--changed checks deleted tracked sources against HEAD instead of silently omitting them', async () => {
    const repo = join(dir, 'changed-deleted-task-id');
    mkdirSync(repo, { recursive: true });
    const source = join(repo, 'retired.ts');
    writeFileSync(source, '// @tasks: TSK-retired\nexport const retired = true;\n');
    execFileSync('git', ['init', '-q'], { cwd: repo });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repo });
    execFileSync('git', ['config', 'user.name', 'test'], { cwd: repo });
    execFileSync('git', ['add', '-A'], { cwd: repo });
    execFileSync('git', ['commit', '-q', '-m', 'baseline'], { cwd: repo });
    rmSync(source);

    const result = await mod.run(argv('--changed', repo));
    assert.strictEqual(result.exitCode, 1, result.text);
    assert.match(result.text, /SDD_TASKS_APPEND_ONLY_REGRESSION/);
    assert.doesNotMatch(result.text, /0 file\(s\) checked/);
  });

  it('--all fails closed when a selected spec file is unreadable', async (context) => {
    const repo = join(dir, 'all-unreadable-spec');
    const spec = join(repo, 'specs', 'demo', 'demo.spec.md');
    mkdirSync(join(repo, 'specs', 'demo'), { recursive: true });
    writeFileSync(join(repo, 'package.json'), '{}\n');
    writeFileSync(spec, '# Demo\n');
    if (!denyRead(context, spec, 'file')) return;
    try {
      const result = await mod.run(argv('--all', repo));
      assert.strictEqual(result.exitCode, 1, result.text);
      assert.match(result.text, /ERR_CLI_SDD_CHECK_READ_FAILED/);
      assert.match(result.text, /demo\.spec\.md/);
      assert.match(result.text, /EACCES|EPERM/);
      assert.doesNotMatch(result.text, /✅ clean/);
    } finally {
      chmodSync(spec, 0o600);
    }
  });

  it('--all fails closed when an in-scope nested directory is unreadable', async (context) => {
    const repo = join(dir, 'all-unreadable-subtree');
    const nested = join(repo, 'specs', 'demo', 'nested');
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(repo, 'package.json'), '{}\n');
    writeFileSync(join(nested, 'hidden.spec.md'), '# Hidden\n');
    if (!denyRead(context, nested, 'directory')) return;
    try {
      const result = await mod.run(argv('--all', repo));
      assert.strictEqual(result.exitCode, 1, result.text);
      assert.match(result.text, /ERR_CLI_SDD_CHECK_READ_FAILED/);
      assert.match(result.text, /nested/);
      assert.match(result.text, /EACCES|EPERM/);
      assert.doesNotMatch(result.text, /✅ clean/);
    } finally {
      chmodSync(nested, 0o700);
    }
  });

  it('--task fails closed when the selected ticket is unreadable', async (context) => {
    const ticket = join(dir, 'unreadable-ticket.md');
    writeFileSync(ticket, CLEAN_TICKET);
    if (!denyRead(context, ticket, 'file')) return;
    try {
      const result = await mod.run(argv('--task', ticket));
      assert.strictEqual(result.exitCode, 1, result.text);
      assert.match(result.text, /ERR_CLI_SDD_CHECK_READ_FAILED/);
      assert.match(result.text, /unreadable-ticket\.md/);
      assert.match(result.text, /EACCES|EPERM/);
      assert.doesNotMatch(result.text, /✅ clean/);
    } finally {
      chmodSync(ticket, 0o600);
    }
  });

  it('--task fails closed when a referenced spec exists but is unreadable', async (context) => {
    const fixture = join(dir, 'unreadable-spec-ref');
    const ticket = join(fixture, 'demo.task.DEMO-1.md');
    const spec = join(fixture, 'demo.spec.md');
    mkdirSync(fixture, { recursive: true });
    writeFileSync(ticket, `${CLEAN_TICKET}\n- [Contract](./demo.spec.md#contract)\n`);
    writeFileSync(spec, '# Contract\n');
    if (!denyRead(context, spec, 'file')) return;
    try {
      const result = await mod.run(argv('--task', ticket));
      assert.strictEqual(result.exitCode, 1, result.text);
      assert.match(result.text, /ERR_CLI_SDD_CHECK_READ_FAILED/);
      assert.match(result.text, /demo\.spec\.md/);
      assert.match(result.text, /EACCES|EPERM/);
      assert.doesNotMatch(result.text, /✅ clean/);
    } finally {
      chmodSync(spec, 0o600);
    }
  });

  it('--changed fails closed when a selected source file is unreadable', async (context) => {
    const repo = join(dir, 'changed-unreadable-source');
    const source = join(repo, 'changed.ts');
    mkdirSync(repo, { recursive: true });
    writeFileSync(source, '// @tasks: N/A\nexport const value = 1;\n');
    execFileSync('git', ['init', '-q'], { cwd: repo });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repo });
    execFileSync('git', ['config', 'user.name', 'test'], { cwd: repo });
    execFileSync('git', ['add', '-A'], { cwd: repo });
    execFileSync('git', ['commit', '-q', '-m', 'baseline'], { cwd: repo });
    writeFileSync(source, '// @tasks: N/A\nexport const value = 2;\n');
    if (!denyRead(context, source, 'file')) return;
    try {
      const result = await mod.run(argv('--changed', repo));
      assert.strictEqual(result.exitCode, 1, result.text);
      assert.match(result.text, /ERR_CLI_SDD_CHECK_READ_FAILED/);
      assert.match(result.text, /changed\.ts/);
      assert.match(result.text, /EACCES|EPERM/);
      assert.doesNotMatch(result.text, /✅ clean/);
    } finally {
      chmodSync(source, 0o600);
    }
  });

  it('--task rejects every inconsistent schema-aware coverage policy shape', async () => {
    const invalidSections = [
      ['<!--COVERAGE_POLICY:v1-->'],
      [
        '<!--COVERAGE_POLICY:v1-->',
        '- **Coverage Policy:** required',
        '- **Coverage Policy:** not-applicable',
        '- **Coverage Reason:** conflicting declarations',
      ],
      ['<!--COVERAGE_POLICY:v1-->', '- **Coverage Policy:** required'],
      [
        '<!--COVERAGE_POLICY:v1-->',
        '- **Coverage Policy:** required',
        '- **Coverage Reason:** contradictory N/A metadata',
        '| Command | Required by | Role |',
        '|---|---|---|',
        '| custom coverage read | RULE | coverage |',
      ],
      [
        '<!--COVERAGE_POLICY:v1-->',
        '- **Coverage Policy:** not-applicable',
        '- **Coverage Reason:** config only',
        '- **Coverage Owner Phase:** P1',
      ],
      [
        '<!--COVERAGE_POLICY:v1-->',
        '- **Coverage Policy:** not-applicable',
        '- **Coverage Reason:** config only',
        '| Command | Required by | Role |',
        '|---|---|---|',
        '| custom coverage read | RULE | coverage |',
      ],
      [
        '<!--COVERAGE_POLICY:v1-->',
        '- **Coverage Policy:** not-applicable',
        '- **Coverage Reason:** <reason>',
      ],
    ];
    for (const [index, section] of invalidSections.entries()) {
      const t = join(dir, `coverage-invalid-${index}.md`);
      writeFileSync(
        t,
        [
          CLEAN_TICKET,
          '<!--SECTION:VERIFICATION-->',
          ...(section ?? []),
          ...((section ?? []).some((line) => line.includes('| Command'))
            ? []
            : ['| Command | Required by | Role |', '|---|---|---|']),
          '<!--/SECTION:VERIFICATION-->',
        ].join('\n'),
        'utf-8'
      );
      const r = await mod.run(argv('--task', t));
      assert.strictEqual(r.exitCode, 1, r.text);
      assert.match(r.text, /SDD_COVERAGE_POLICY_INVALID/);
    }
  });

  it('--task accepts explicit not-applicable with a concise reason and no coverage row', async () => {
    const t = join(dir, 'coverage-na.md');
    writeFileSync(
      t,
      [
        CLEAN_TICKET,
        '<!--SECTION:VERIFICATION-->',
        '<!--COVERAGE_POLICY:v1-->',
        '- **Coverage Policy:** not-applicable',
        '- **Coverage Reason:** configuration metadata only; no executable behavior',
        '| Command | Required by | Role |',
        '|---|---|---|',
        '| — | — | extra |',
        '<!--/SECTION:VERIFICATION-->',
      ].join('\n'),
      'utf-8'
    );
    const r = await mod.run(argv('--task', t));
    assert.doesNotMatch(r.text, /SDD_COVERAGE_POLICY_INVALID/);
  });

  it('--task rejects a malformed Verification row instead of silently omitting it', async () => {
    const t = join(dir, 'verification-malformed.md');
    writeFileSync(
      t,
      [
        CLEAN_TICKET,
        '<!--SECTION:VERIFICATION-->',
        '| Command | Required by | Role |',
        '|---|---|---|',
        '| printf x | grep x | RULE | extra |',
        '<!--/SECTION:VERIFICATION-->',
      ].join('\n'),
      'utf-8'
    );
    const r = await mod.run(argv('--task', t));
    assert.strictEqual(r.exitCode, 1, r.text);
    assert.match(r.text, /SDD_VERIFICATION_TABLE_INVALID/);
    assert.match(r.text, /expected exactly 3 cells/);
  });

  it('--task rejects required coverage when its declared owner phase does not exist', async () => {
    const t = join(dir, 'coverage-required-no-test-phase.md');
    writeFileSync(
      t,
      [
        CLEAN_TICKET,
        '<!--SECTION:VERIFICATION-->',
        '<!--COVERAGE_POLICY:v1-->',
        '- **Coverage Policy:** required',
        '- **Coverage Owner Phase:** P9',
        '| Command | Required by | Role |',
        '|---|---|---|',
        '| go tool cover -func=coverage.out | GO-COVER | coverage |',
        '<!--/SECTION:VERIFICATION-->',
      ].join('\n'),
      'utf-8'
    );
    const r = await mod.run(argv('--task', t));
    assert.strictEqual(r.exitCode, 1, r.text);
    assert.match(r.text, /SDD_COVERAGE_OWNER_INVALID/);
  });

  it('--task rejects a non-test owner and a reader not required by the owner rule', async () => {
    const ticket = (kind: string, requiredBy: string) =>
      [
        CLEAN_TICKET,
        '<!--SECTION:PHASES_OVERVIEW-->',
        '| ID | Kind | Deps | Status |',
        '|---|---|---|---|',
        `| P1 | ${kind} | — | [ ] |`,
        '<!--/SECTION:PHASES_OVERVIEW-->',
        '<!--SECTION:PHASE_P1-->',
        '- **Rules:**',
        '  - [Coverage](RULE-OWNER)',
        '- **Target Files:**',
        '  - src/a.ts',
        '<!--/SECTION:PHASE_P1-->',
        '<!--SECTION:VERIFICATION-->',
        '<!--COVERAGE_POLICY:v1-->',
        '- **Coverage Policy:** required',
        '- **Coverage Owner Phase:** P1',
        '| Command | Required by | Role |',
        '|---|---|---|',
        `| custom coverage read | ${requiredBy} | coverage |`,
        '<!--/SECTION:VERIFICATION-->',
      ].join('\n');
    const cases: Array<[string, string, RegExp]> = [
      ['impl', 'RULE-OWNER', /SDD_COVERAGE_OWNER_INVALID/],
      ['test', 'OTHER-RULE', /SDD_COVERAGE_READER_OWNER_MISMATCH/],
    ];
    for (const [kind, requiredBy, expected] of cases) {
      const t = join(dir, `coverage-owner-${kind}-${requiredBy}.md`);
      writeFileSync(t, ticket(kind, requiredBy), 'utf-8');
      const r = await mod.run(argv('--task', t));
      assert.strictEqual(r.exitCode, 1, r.text);
      assert.match(r.text, expected);
    }
  });

  it('--review-ready checks the one primary record and fails on its non-CLEAN last verdict', async () => {
    const bundle = join(dir, 'review-bundle-fail');
    mkdirSync(bundle, { recursive: true });
    const targetSet = 'blocked.spec.md | clean.spec.md';
    writeFileSync(join(bundle, 'clean.spec.md'), reviewMember('Clean'), 'utf-8');
    writeFileSync(
      join(bundle, 'blocked.spec.md'),
      reviewState('Blocked', 'NEEDS_WORK', targetSet),
      'utf-8'
    );
    writeFileSync(join(bundle, 'master.spec.md'), '# Master\nNo review state.', 'utf-8');
    stampReviewState(bundle);
    commitReviewFixture(bundle);

    const r = await mod.run(argv('--review-ready', bundle));
    assert.strictEqual(r.exitCode, 1);
    assert.match(r.text, /SDD_CRITIC_NOT_CLEAN/);
    assert.match(r.text, /2 file\(s\)/);
  });

  it('--review-ready passes a CLEAN review-state spec and ignores master specs', async () => {
    const bundle = join(dir, 'review-bundle-clean');
    mkdirSync(bundle, { recursive: true });
    writeFileSync(
      join(bundle, 'scope.spec.md'),
      reviewState('Scope', 'CLEAN', 'scope.spec.md'),
      'utf-8'
    );
    writeFileSync(join(bundle, 'master.spec.md'), '# Master', 'utf-8');
    stampReviewState(bundle);
    commitReviewFixture(bundle);

    const r = await mod.run(argv(`--review-ready=${bundle}`));
    assert.strictEqual(r.exitCode, 0);
    assert.match(r.text, /1 file\(s\) checked/);
  });

  it('--review-ready passes one CLEAN primary plus a secondary changed member without Critic Rounds', async () => {
    const bundle = join(dir, 'review-bundle-one-primary');
    mkdirSync(bundle, { recursive: true });
    writeFileSync(
      join(bundle, 'primary.spec.md'),
      reviewState('Primary', 'CLEAN', 'primary.spec.md | secondary.spec.md'),
      'utf-8'
    );
    writeFileSync(
      join(bundle, 'secondary.spec.md'),
      `${reviewMember('Secondary')}\n~~~md\n## Critic Rounds\n${roundExample()}\n~~~`,
      'utf-8'
    );
    stampReviewState(bundle);
    commitReviewFixture(bundle);

    const r = await mod.run(argv('--review-ready', bundle));
    assert.strictEqual(r.exitCode, 0);
    assert.match(r.text, /2 file\(s\) checked/);
  });

  it('--review-ready fails when one bundle member has a malformed CHANGE_MANIFEST', async () => {
    const bundle = join(dir, 'review-bundle-malformed');
    mkdirSync(bundle, { recursive: true });
    writeFileSync(
      join(bundle, 'clean.spec.md'),
      [
        '<!--SECTION:CHANGE_MANIFEST-->',
        'ТИП ИЗМЕНЕНИЯ: refine',
        '<!--/SECTION:CHANGE_MANIFEST-->',
        '## Critic Rounds',
        '### Round 1 — 2026-08-28',
        '- Verdict: CLEAN',
        '- Target-set: broken.spec.md | clean.spec.md',
      ].join('\n'),
      'utf-8'
    );
    writeFileSync(
      join(bundle, 'broken.spec.md'),
      '<!--SECTION:CHANGE_MANIFEST-->\nТИП ИЗМЕНЕНИЯ: refine',
      'utf-8'
    );
    commitReviewFixture(bundle);

    const r = await mod.run(argv('--review-ready', bundle));
    assert.strictEqual(r.exitCode, 1);
    assert.match(r.text, /SDD_REVIEW_READY_MEMBER_MALFORMED/);
  });

  it('rejects multiple modes instead of silently choosing one', async () => {
    const r = await mod.run(argv('--review-ready', dir, '--all'));
    assert.strictEqual(r.exitCode, 4);
    assert.match(r.text, /ERR_CLI_SDD_CHECK_BAD_INVOCATION/);
  });

  it('--review-ready requires every changed review-state member in the integrated target-set', async () => {
    const bundle = join(dir, 'review-bundle-incomplete');
    mkdirSync(bundle, { recursive: true });
    writeFileSync(join(bundle, 'a.spec.md'), reviewState('A', 'CLEAN', 'a.spec.md'), 'utf-8');
    writeFileSync(join(bundle, 'b.spec.md'), reviewMember('B'), 'utf-8');
    stampReviewState(bundle);
    commitReviewFixture(bundle);

    const r = await mod.run(argv('--review-ready', bundle));
    assert.strictEqual(r.exitCode, 1);
    assert.match(r.text, /SDD_CRITIC_TARGET_SET_INCOMPLETE/);
  });

  it('--review-ready rejects more than one primary evidence artifact', async () => {
    const bundle = join(dir, 'review-bundle-divergent');
    mkdirSync(bundle, { recursive: true });
    writeFileSync(
      join(bundle, 'a.spec.md'),
      reviewState('A', 'CLEAN', 'a.spec.md | b.spec.md'),
      'utf-8'
    );
    writeFileSync(join(bundle, 'b.spec.md'), reviewState('B', 'CLEAN', 'b.spec.md'), 'utf-8');
    commitReviewFixture(bundle);

    const r = await mod.run(argv('--review-ready', bundle));
    assert.strictEqual(r.exitCode, 1);
    assert.match(r.text, /SDD_CRITIC_PRIMARY_COUNT_INVALID/);
  });

  it('--review-ready rejects a directory with no primary evidence artifact', async () => {
    const bundle = join(dir, 'review-bundle-no-primary');
    mkdirSync(bundle, { recursive: true });
    writeFileSync(join(bundle, 'a.spec.md'), reviewMember('A'), 'utf-8');
    writeFileSync(join(bundle, 'b.spec.md'), reviewMember('B'), 'utf-8');
    commitReviewFixture(bundle);

    const r = await mod.run(argv('--review-ready', bundle));
    assert.strictEqual(r.exitCode, 1);
    assert.match(r.text, /SDD_CRITIC_PRIMARY_COUNT_INVALID/);
  });

  it('--review-ready allows an unchanged context module in the target-set without a manifest', async () => {
    const bundle = join(dir, 'review-bundle-context');
    mkdirSync(bundle, { recursive: true });
    writeFileSync(join(bundle, 'context.spec.md'), '# Unchanged context', 'utf-8');
    writeFileSync(
      join(bundle, 'scope.spec.md'),
      reviewState('Scope', 'CLEAN', 'context.spec.md | scope.spec.md', 'scope.spec.md'),
      'utf-8'
    );
    stampReviewState(bundle);
    commitReviewFixture(bundle);

    const r = await mod.run(argv('--review-ready', bundle));
    assert.strictEqual(r.exitCode, 0);
    assert.match(r.text, /1 file\(s\) checked/);
  });

  it('--review-ready allows a read-only primary when one secondary owns the write-set', async () => {
    const bundle = join(dir, 'review-bundle-read-only-primary');
    mkdirSync(bundle, { recursive: true });
    writeFileSync(
      join(bundle, 'primary.spec.md'),
      criticHistory(
        'Primary context',
        [{ verdict: 'CLEAN' }],
        'primary.spec.md | secondary.spec.md',
        'secondary.spec.md',
        false
      ),
      'utf-8'
    );
    writeFileSync(join(bundle, 'secondary.spec.md'), reviewMember('Secondary'), 'utf-8');
    stampReviewState(bundle);
    commitReviewFixture(bundle);

    const result = await mod.run(argv('--review-ready', bundle));
    assert.strictEqual(result.exitCode, 0, result.text);
  });

  it('--review-ready does not let a changed spec disappear by omitting its manifest', async () => {
    const repo = join(dir, 'review-bundle-git');
    const specs = join(repo, 'specs');
    mkdirSync(specs, { recursive: true });
    writeFileSync(join(repo, 'package.json'), '{}', 'utf-8');
    const changed = join(specs, 'changed.spec.md');
    writeFileSync(changed, '# Master before', 'utf-8');
    execFileSync('git', ['init', '-q'], { cwd: repo });
    execFileSync('git', ['add', '.'], { cwd: repo });
    execFileSync(
      'git',
      ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'baseline'],
      { cwd: repo }
    );
    writeFileSync(changed, '# Changed without review state', 'utf-8');

    const r = await mod.run(argv('--review-ready', specs));
    assert.strictEqual(r.exitCode, 1);
    assert.match(r.text, /SDD_REVIEW_READY_MEMBER_MALFORMED/);
    assert.match(r.text, /Changed spec has no valid CHANGE_MANIFEST/);
  });

  it('--review-ready fails closed with typed git evidence when HEAD is corrupt', async () => {
    const bundle = join(dir, 'review-ready-corrupt-head');
    mkdirSync(bundle, { recursive: true });
    writeFileSync(
      join(bundle, 'scope.spec.md'),
      reviewState('Scope', 'CLEAN', 'scope.spec.md'),
      'utf-8'
    );
    stampReviewState(bundle);
    commitReviewFixture(bundle);
    const branch = execFileSync('git', ['symbolic-ref', 'HEAD'], {
      cwd: bundle,
      encoding: 'utf-8',
    }).trim();
    writeFileSync(join(bundle, '.git', branch), `${'1'.repeat(40)}\n`, 'utf-8');

    const result = await mod.run(argv('--review-ready', bundle));

    assert.strictEqual(result.exitCode, 1, result.text);
    assert.match(result.text, /ERR_CLI_SDD_CHECK_GIT_EVIDENCE/);
    assert.match(result.text, /git inspect symbolic HEAD branch failed/);
    assert.doesNotMatch(result.text, /\u2705 clean/);
  });

  it('--review-ready supports a proven unborn HEAD when every changed spec has review evidence', async () => {
    const bundle = join(dir, 'review-ready-unborn');
    mkdirSync(bundle, { recursive: true });
    writeFileSync(
      join(bundle, 'scope.spec.md'),
      reviewState('Scope', 'CLEAN', 'scope.spec.md'),
      'utf-8'
    );
    stampReviewState(bundle);
    execFileSync('git', ['init', '-q'], { cwd: bundle });

    const result = await mod.run(argv('--review-ready', bundle));

    assert.strictEqual(result.exitCode, 0, result.text);
    assert.match(result.text, /\u2705 clean/);
  });

  it('--review-ready rejects an unborn changed spec with no manifest or review marker', async () => {
    const bundle = join(dir, 'review-ready-unborn-unmarked');
    mkdirSync(bundle, { recursive: true });
    writeFileSync(join(bundle, 'plain.spec.md'), '# Changed but unmarked\n', 'utf-8');
    execFileSync('git', ['init', '-q'], { cwd: bundle });

    const result = await mod.run(argv('--review-ready', bundle));

    assert.strictEqual(result.exitCode, 1, result.text);
    assert.match(result.text, /SDD_REVIEW_READY_MEMBER_MALFORMED/);
    assert.match(result.text, /Changed spec has no valid CHANGE_MANIFEST/);
    assert.doesNotMatch(result.text, /\u2705 clean/);
  });

  it('--review-ready rejects target-set paths that do not resolve to repo-local specs', async () => {
    const bundle = join(dir, 'review-bundle-invalid-target');
    mkdirSync(bundle, { recursive: true });
    writeFileSync(
      join(bundle, 'scope.spec.md'),
      reviewState('Scope', 'CLEAN', '../outside.spec.md | scope.spec.md'),
      'utf-8'
    );
    commitReviewFixture(bundle);

    const r = await mod.run(argv('--review-ready', bundle));
    assert.strictEqual(r.exitCode, 1);
    assert.match(r.text, /SDD_CRITIC_TARGET_SET_INVALID/);
  });

  it('--review-ready treats a file target itself as primary', async () => {
    const bundle = join(dir, 'review-file-primary');
    mkdirSync(bundle, { recursive: true });
    const primary = join(bundle, 'primary.spec.md');
    writeFileSync(primary, reviewState('Primary', 'CLEAN', 'primary.spec.md'), 'utf-8');
    stampReviewState(bundle);
    commitReviewFixture(bundle);
    assert.strictEqual((await mod.run(argv('--review-ready', primary))).exitCode, 0);

    const missing = join(bundle, 'missing-evidence.spec.md');
    writeFileSync(missing, reviewMember('Missing evidence'), 'utf-8');
    const r = await mod.run(argv('--review-ready', missing));
    assert.strictEqual(r.exitCode, 1);
    assert.match(r.text, /SDD_CRITIC_PRIMARY_COUNT_INVALID/);
  });

  it('--review-ready resolves a secondary file to the one primary integrated history', async () => {
    const bundle = join(dir, 'review-file-secondary');
    mkdirSync(bundle, { recursive: true });
    const primary = join(bundle, 'primary.spec.md');
    const secondary = join(bundle, 'secondary.spec.md');
    writeFileSync(
      primary,
      reviewState('Primary', 'CLEAN', 'primary.spec.md | secondary.spec.md'),
      'utf-8'
    );
    writeFileSync(secondary, reviewMember('Secondary'), 'utf-8');
    writeFileSync(
      join(bundle, 'unrelated.spec.md'),
      '<!--SECTION:CHANGE_MANIFEST-->\nmalformed unrelated bundle',
      'utf-8'
    );
    stampReviewState(bundle);
    commitReviewFixture(bundle);

    const clean = await mod.run(argv('--review-ready', secondary));
    assert.strictEqual(clean.exitCode, 0, clean.text);

    writeFileSync(secondary, `${readFileSync(secondary, 'utf-8')}\npost-review drift`, 'utf-8');
    const stale = await mod.run(argv('--review-ready', secondary));
    assert.strictEqual(stale.exitCode, 1);
    assert.match(stale.text, /SDD_CRITIC_CHANGED_STATE_MISMATCH/);
  });

  it('--review-state prints one canonical primary manifest and exact integrated-state hash', async () => {
    const bundle = join(dir, 'review-state-print');
    mkdirSync(bundle, { recursive: true });
    const primary = join(bundle, 'primary.spec.md');
    const secondary = join(bundle, 'secondary.spec.md');
    writeFileSync(primary, reviewMember('Primary'), 'utf-8');
    writeFileSync(secondary, '# Secondary', 'utf-8');

    const result = await mod.run(argv('--review-state', primary, secondary));
    assert.strictEqual(result.exitCode, 0, result.text);
    assert.match(result.text, /primary: primary\.spec\.md/);
    assert.match(result.text, /target-set: primary\.spec\.md \| secondary\.spec\.md/);
    assert.match(result.text, /changed-state: sha256:[0-9a-f]{64}/);
  });

  it('--review-publication freezes and stages exactly the greenfield durable output set', async () => {
    const { repo, spec, publicationPaths } = initPublicationRepo('review-publication-greenfield');

    const result = await mod.run(argv('--review-publication', spec));
    assert.strictEqual(result.exitCode, 0, result.text);
    assert.match(result.text, /^\[sdd-check\] review-publication/m);
    assert.match(result.text, /^target-set: specs\/demo\/demo\.spec\.md$/m);
    assert.match(result.text, /^write-set: specs\/demo\/demo\.spec\.md$/m);
    assert.match(result.text, /^publication-state: sha256:[0-9a-f]{64}$/m);
    const serialized = /^publication-set: (.+)$/m.exec(result.text)?.[1];
    assert.ok(serialized, result.text);
    const entries = JSON.parse(serialized) as { role: string; path: string }[];
    assert.deepStrictEqual(
      entries.map((entry) => entry.path),
      publicationPaths
    );
    assert.deepStrictEqual(
      entries.map((entry) => entry.role),
      ['session-ignore', 'project-index', 'portal', 'scope-index', 'spec', 'research']
    );

    execFileSync('git', ['add', '--', ...entries.map((entry) => entry.path)], { cwd: repo });
    const staged = execFileSync('git', ['diff', '--cached', '--name-only', '-z'], {
      cwd: repo,
      encoding: 'utf-8',
    })
      .split('\0')
      .filter(Boolean)
      .sort();
    assert.deepStrictEqual(staged, publicationPaths);
  });

  it('--review-publication rejects an unrelated dirty path', async () => {
    const { repo, spec } = initPublicationRepo('review-publication-unrelated');
    writeFileSync(join(repo, 'notes.md'), 'unrelated\n');

    const result = await mod.run(argv('--review-publication', spec));
    assert.strictEqual(result.exitCode, 1);
    assert.match(result.text, /ERR_CLI_SDD_CHECK_REVIEW_PUBLICATION/);
    assert.match(result.text, /dirty path\(s\).*notes\.md/);
  });

  it('--review-publication rejects an unrelated mutation in the same portal file', async () => {
    const { repo, spec } = initPublicationRepo('review-publication-portal-mutation');
    execFileSync('git', ['add', 'specs/README.md'], { cwd: repo });
    execFileSync('git', ['commit', '-q', '-m', 'portal baseline'], { cwd: repo });
    writeFileSync(join(repo, 'specs', 'README.md'), publicationPortal('Unrelated vision mutation'));

    const result = await mod.run(argv('--review-publication', spec));
    assert.strictEqual(result.exitCode, 1);
    assert.match(
      result.text,
      /portal diff changes bytes outside attributable scope rows\/graph lines/
    );
  });

  it('--review-publication rejects any same-file gitignore mutation beyond the exact session ignore line', async () => {
    const { repo, spec } = initPublicationRepo('review-publication-gitignore-mutation');
    writeFileSync(join(repo, '.gitignore'), 'dist/\n.sdd-session.md\ncoverage/\n');

    const result = await mod.run(argv('--review-publication', spec));
    assert.strictEqual(result.exitCode, 1);
    assert.match(result.text, /gitignore.*bytes beyond the exact .*addition/i);
  });

  it('--review-publication rejects a whitespace-lookalike session ignore line', async () => {
    const { repo, spec } = initPublicationRepo('review-publication-gitignore-lookalike');
    writeFileSync(join(repo, '.gitignore'), 'dist/\n .sdd-session.md\n');

    const result = await mod.run(argv('--review-publication', spec));
    assert.strictEqual(result.exitCode, 1);
    assert.match(result.text, /must contain exactly one `.sdd-session\.md` line/);
  });

  it('--review-publication rejects unsafe, missing, invalid, and symlinked linked research', async () => {
    const scenarios: {
      name: string;
      link: string;
      setup?: (repo: string) => void;
      match: RegExp;
    }[] = [
      {
        name: 'traversal',
        link: '../outside.research.md',
        match: /contain no absolute\/URL\/`\.\.` path/,
      },
      {
        name: 'absolute',
        link: '/tmp/outside.research.md',
        match: /contain no absolute\/URL\/`\.\.` path/,
      },
      {
        name: 'missing',
        link: './research/2026-08-30-missing.research.md',
        match: /missing or unreadable/,
      },
      {
        name: 'invalid-content',
        link: './research/2026-08-30-demo.research.md',
        setup: (repo) =>
          writeFileSync(
            join(repo, 'specs', 'demo', 'research', '2026-08-30-demo.research.md'),
            '# invalid research\n'
          ),
        match: /missing canonical section/,
      },
      {
        name: 'symlink',
        link: './research/2026-08-30-link.research.md',
        setup: (repo) =>
          symlinkSync(
            '2026-08-30-demo.research.md',
            join(repo, 'specs', 'demo', 'research', '2026-08-30-link.research.md')
          ),
        match: /traverses a symlink/,
      },
    ];
    for (const scenario of scenarios) {
      const { repo, spec } = initPublicationRepo(`review-publication-${scenario.name}`);
      scenario.setup?.(repo);
      writeFileSync(
        spec,
        publicationSpec().replace('./research/2026-08-30-demo.research.md', scenario.link)
      );
      const result = await mod.run(argv('--review-publication', spec));
      assert.strictEqual(result.exitCode, 1, `${scenario.name}: ${result.text}`);
      assert.match(result.text, scenario.match, scenario.name);
    }
  });

  it('--review-publication rejects an edit to an existing mixed-content index as ambiguous', async () => {
    const { repo, spec } = initPublicationRepo('review-publication-index-ambiguous');
    execFileSync('git', ['add', 'specs/3-tasks.md'], { cwd: repo });
    execFileSync('git', ['commit', '-q', '-m', 'index baseline'], { cwd: repo });
    writeFileSync(
      join(repo, 'specs', '3-tasks.md'),
      publicationProjectIndex().replace('0/1', '1/1')
    );

    const result = await mod.run(argv('--review-publication', spec));
    assert.strictEqual(result.exitCode, 1);
    assert.match(
      result.text,
      /already exists in HEAD; its mixed-content edit is ambiguously attributable/
    );
  });

  it('--review-state blocks product/library review before complete module decomposition', async () => {
    const bundle = join(dir, 'review-state-undecomposed-scope');
    mkdirSync(bundle, { recursive: true });
    const primary = join(bundle, 'primary.spec.md');
    writeFileSync(
      primary,
      [
        reviewMember('Primary'),
        '<!--SECTION:SCOPE_TYPE-->',
        'product',
        '<!--/SECTION:SCOPE_TYPE-->',
        '<!--SECTION:MODULE_MAP-->',
        'Modules not yet decomposed',
        '<!--/SECTION:MODULE_MAP-->',
      ].join('\n'),
      'utf-8'
    );

    const result = await mod.run(argv('--review-state', primary));
    assert.strictEqual(result.exitCode, 1);
    assert.match(result.text, /not completely decomposed/);
    assert.match(result.text, /continue through \/sdd into the module flow/);
  });

  it('--review-ready cannot accept a fabricated CLEAN before product/library decomposition', async () => {
    const bundle = join(dir, 'review-ready-undecomposed-scope');
    mkdirSync(bundle, { recursive: true });
    const primary = join(bundle, 'primary.spec.md');
    writeFileSync(
      primary,
      [
        reviewState('Primary', 'CLEAN', 'primary.spec.md'),
        '<!--SECTION:SCOPE_TYPE-->',
        'product',
        '<!--/SECTION:SCOPE_TYPE-->',
        '<!--SECTION:MODULE_MAP-->',
        'Modules not yet decomposed',
        '<!--/SECTION:MODULE_MAP-->',
      ].join('\n'),
      'utf-8'
    );
    stampReviewState(bundle);
    commitReviewFixture(bundle);

    const result = await mod.run(argv('--review-ready', primary));
    assert.strictEqual(result.exitCode, 1);
    assert.match(result.text, /SDD_SCOPE_DECOMPOSITION_INCOMPLETE/);
    assert.match(result.text, /before module decomposition is complete/);
  });

  it('--review-state requires the structurally complete scope plus every declared module', async () => {
    const bundle = join(dir, 'review-state-complete-scope');
    const moduleDir = join(bundle, 'checkout');
    mkdirSync(moduleDir, { recursive: true });
    const primary = join(bundle, 'primary.spec.md');
    const moduleSpec = join(moduleDir, 'checkout.spec.md');
    writeFileSync(
      primary,
      [
        reviewMember('Primary'),
        '<!--SECTION:SCOPE_TYPE-->',
        'library',
        '<!--/SECTION:SCOPE_TYPE-->',
        '<!--SECTION:MODULE_MAP-->',
        '- [checkout](./checkout/checkout.spec.md)',
        '<!--/SECTION:MODULE_MAP-->',
      ].join('\n'),
      'utf-8'
    );
    writeFileSync(
      moduleSpec,
      [
        reviewMember('Checkout'),
        '<!--SECTION:MODULE_VISION-->',
        'checkout',
        '<!--/SECTION:MODULE_VISION-->',
      ].join('\n'),
      'utf-8'
    );

    const incomplete = await mod.run(argv('--review-state', primary));
    assert.strictEqual(incomplete.exitCode, 1);
    assert.match(incomplete.text, /complete integrated target-set/);
    assert.match(incomplete.text, /checkout\/checkout\.spec\.md \| primary\.spec\.md/);

    const complete = await mod.run(argv('--review-state', primary, moduleSpec));
    assert.strictEqual(complete.exitCode, 0, complete.text);
    assert.match(complete.text, /target-set: checkout\/checkout\.spec\.md \| primary\.spec\.md/);
  });

  it('requires scope-primary review while a module secondary resolves the valid integrated set', async () => {
    const project = join(dir, 'review-module-ownership');
    const scopeDir = join(project, 'specs', 'shop');
    const moduleDir = join(scopeDir, 'core');
    mkdirSync(moduleDir, { recursive: true });
    writeFileSync(join(project, 'package.json'), '{}', 'utf-8');
    const scopeSpec = join(scopeDir, 'shop.spec.md');
    const moduleSpec = join(moduleDir, 'core.spec.md');
    const scopeShape = [
      '<!--SECTION:SCOPE_TYPE-->',
      'product',
      '<!--/SECTION:SCOPE_TYPE-->',
      '<!--SECTION:MODULE_MAP-->',
      '- [core](./core/core.spec.md)',
      '<!--/SECTION:MODULE_MAP-->',
    ].join('\n');
    const moduleShape = [
      '# Core',
      '<!--SECTION:MODULE_VISION-->',
      'core',
      '<!--/SECTION:MODULE_VISION-->',
    ].join('\n');
    writeFileSync(scopeSpec, `${reviewMember('Shop')}\n${scopeShape}`, 'utf-8');
    writeFileSync(moduleSpec, moduleShape, 'utf-8');

    const modulePrimary = await mod.run(argv('--review-state', moduleSpec));
    assert.strictEqual(modulePrimary.exitCode, 1);
    assert.match(
      modulePrimary.text,
      /module `specs\/shop\/core\/core\.spec\.md` cannot own Critic Rounds/
    );
    assert.match(modulePrimary.text, /use owning scope `specs\/shop\/shop\.spec\.md` as primary/);

    writeFileSync(
      moduleSpec,
      `${reviewState('Core', 'CLEAN', 'specs/shop/core/core.spec.md')}\n${moduleShape}`,
      'utf-8'
    );
    commitReviewFixture(project);
    const fabricated = await mod.run(argv('--review-ready', moduleSpec));
    assert.strictEqual(fabricated.exitCode, 1);
    assert.match(fabricated.text, /SDD_CRITIC_PRIMARY_SCOPE_REQUIRED/);

    writeFileSync(moduleSpec, moduleShape, 'utf-8');
    const targetSet = 'specs/shop/core/core.spec.md | specs/shop/shop.spec.md';
    let scopeContent = `${reviewState(
      'Shop',
      'CLEAN',
      targetSet,
      'specs/shop/shop.spec.md'
    )}\n${scopeShape}`;
    const state = formatCriticChangedState([
      { path: 'specs/shop/shop.spec.md', content: scopeContent, primary: true },
      { path: 'specs/shop/core/core.spec.md', content: moduleShape, primary: false },
    ]);
    scopeContent = replaceFixture(scopeContent, `sha256:${'0'.repeat(64)}`, state);
    writeFileSync(scopeSpec, scopeContent, 'utf-8');
    commitReviewFixture(project);
    const secondary = await mod.run(argv('--review-ready', moduleSpec));
    assert.strictEqual(secondary.exitCode, 0, secondary.text);
  });

  it('--review-state rejects module primaries with absent or undeclared ownership', async () => {
    const project = join(dir, 'review-module-invalid-owner');
    const orphanDir = join(project, 'specs', 'orphan');
    const scopeDir = join(project, 'specs', 'shop');
    const extraDir = join(scopeDir, 'extra');
    mkdirSync(orphanDir, { recursive: true });
    mkdirSync(extraDir, { recursive: true });
    writeFileSync(join(project, 'package.json'), '{}', 'utf-8');
    const module = '<!--SECTION:MODULE_VISION-->\nmodule\n<!--/SECTION:MODULE_VISION-->';
    const orphan = join(orphanDir, 'orphan.spec.md');
    writeFileSync(orphan, module, 'utf-8');
    writeFileSync(
      join(scopeDir, 'shop.spec.md'),
      '<!--SECTION:SCOPE_TYPE-->\nproduct\n<!--/SECTION:SCOPE_TYPE-->\n<!--SECTION:MODULE_MAP-->\nModules not yet decomposed\n<!--/SECTION:MODULE_MAP-->',
      'utf-8'
    );
    const extra = join(extraDir, 'extra.spec.md');
    writeFileSync(extra, module, 'utf-8');

    const noOwner = await mod.run(argv('--review-state', orphan));
    assert.strictEqual(noOwner.exitCode, 1);
    assert.match(noOwner.text, /has invalid scope ownership \(module has no canonical/);

    const undeclared = await mod.run(argv('--review-state', extra));
    assert.strictEqual(undeclared.exitCode, 1);
    assert.match(undeclared.text, /owning scope decomposition is not complete/);
  });

  it('--review-state rejects duplicate arguments and aliases resolving to one target', async () => {
    const bundle = join(dir, 'review-state-duplicate');
    mkdirSync(bundle, { recursive: true });
    const primary = join(bundle, 'primary.spec.md');
    writeFileSync(primary, reviewMember('Primary'), 'utf-8');

    for (const duplicate of [primary, `${bundle}/./primary.spec.md`]) {
      const result = await mod.run(argv('--review-state', primary, duplicate));
      assert.strictEqual(result.exitCode, 1);
      assert.match(result.text, /ERR_CLI_SDD_CHECK_REVIEW_STATE: duplicate target arguments/);
    }
  });

  it('--review-state rejects Critic Rounds in a secondary artifact', async () => {
    const bundle = join(dir, 'review-state-secondary-history');
    mkdirSync(bundle, { recursive: true });
    const primary = join(bundle, 'primary.spec.md');
    const secondary = join(bundle, 'secondary.spec.md');
    writeFileSync(primary, reviewMember('Primary'), 'utf-8');
    writeFileSync(secondary, reviewState('Secondary', 'CLEAN', 'secondary.spec.md'), 'utf-8');

    const result = await mod.run(argv('--review-state', primary, secondary));
    assert.strictEqual(result.exitCode, 1);
    assert.match(
      result.text,
      /secondary `secondary\.spec\.md` contains parser-visible Critic Rounds/
    );
  });

  it('--review-state rejects malformed existing primary history', async () => {
    const bundle = join(dir, 'review-state-malformed-primary');
    mkdirSync(bundle, { recursive: true });
    const primary = join(bundle, 'primary.spec.md');
    writeFileSync(
      primary,
      `${reviewMember('Primary')}\n## Critic Rounds\n### Round latest — broken`,
      'utf-8'
    );

    const result = await mod.run(argv('--review-state', primary));
    assert.strictEqual(result.exitCode, 1);
    assert.match(result.text, /primary `primary\.spec\.md` has malformed Critic Rounds/);
  });

  it('--review-state rejects a canonical-looking latest round with missing required evidence', async () => {
    const bundle = join(dir, 'review-state-incomplete-primary');
    mkdirSync(bundle, { recursive: true });
    const primary = join(bundle, 'primary.spec.md');
    writeFileSync(
      primary,
      [
        reviewMember('Primary'),
        '## Critic Rounds',
        '### Round 1 — 2026-08-28',
        '- Verdict: NEEDS_WORK',
        '- Target-set: primary.spec.md',
        '- Write-set: primary.spec.md',
      ].join('\n'),
      'utf-8'
    );

    const result = await mod.run(argv('--review-state', primary));
    assert.strictEqual(result.exitCode, 1);
    assert.match(result.text, /SDD_CRITIC_CHANGED_STATE_MISSING/);
  });

  it('--review-state rejects existing primary history for a different target-set', async () => {
    const bundle = join(dir, 'review-state-target-mismatch');
    mkdirSync(bundle, { recursive: true });
    const primary = join(bundle, 'primary.spec.md');
    const secondary = join(bundle, 'secondary.spec.md');
    writeFileSync(primary, reviewState('Primary', 'NEEDS_WORK', 'primary.spec.md'), 'utf-8');
    writeFileSync(secondary, reviewMember('Secondary'), 'utf-8');

    const result = await mod.run(argv('--review-state', primary, secondary));
    assert.strictEqual(result.exitCode, 1);
    assert.match(result.text, /history targets `primary\.spec\.md`/);
    assert.match(result.text, /start a fresh target-set cycle/);
  });

  it('--review-state accepts an ordinary NEEDS_WORK history for the exact same set', async () => {
    const bundle = join(dir, 'review-state-existing-valid');
    mkdirSync(bundle, { recursive: true });
    const primary = join(bundle, 'primary.spec.md');
    const secondary = join(bundle, 'secondary.spec.md');
    writeFileSync(
      primary,
      reviewState('Primary', 'NEEDS_WORK', 'primary.spec.md | secondary.spec.md'),
      'utf-8'
    );
    writeFileSync(secondary, reviewMember('Secondary'), 'utf-8');

    const result = await mod.run(argv('--review-state', primary, secondary));
    assert.strictEqual(result.exitCode, 0, result.text);
    assert.match(result.text, /target-set: primary\.spec\.md \| secondary\.spec\.md/);
    assert.match(result.text, /write-set: primary\.spec\.md \| secondary\.spec\.md/);
  });

  it('--review-state derives a read-only context member outside the write-set', async () => {
    const bundle = join(dir, 'review-state-read-only-context');
    mkdirSync(bundle, { recursive: true });
    const primary = join(bundle, 'primary.spec.md');
    const secondary = join(bundle, 'secondary.spec.md');
    writeFileSync(primary, reviewMember('Primary'), 'utf-8');
    writeFileSync(secondary, '# Read-only context', 'utf-8');

    const result = await mod.run(argv('--review-state', primary, secondary));
    assert.strictEqual(result.exitCode, 0, result.text);
    assert.match(result.text, /target-set: primary\.spec\.md \| secondary\.spec\.md/);
    assert.match(result.text, /write-set: primary\.spec\.md(?:\n|$)/);
  });

  it('--review-state requires a fresh cycle when a read-only member is promoted', async () => {
    const bundle = join(dir, 'review-state-write-set-promotion');
    mkdirSync(bundle, { recursive: true });
    const primary = join(bundle, 'primary.spec.md');
    const secondary = join(bundle, 'secondary.spec.md');
    writeFileSync(
      primary,
      reviewState(
        'Primary',
        'NEEDS_WORK',
        'primary.spec.md | secondary.spec.md',
        'primary.spec.md'
      ),
      'utf-8'
    );
    writeFileSync(secondary, reviewMember('Promoted secondary'), 'utf-8');

    const result = await mod.run(argv('--review-state', primary, secondary));
    assert.strictEqual(result.exitCode, 1);
    assert.match(result.text, /history writes `primary\.spec\.md`/);
    assert.match(result.text, /promote\/demote members only by restarting at Round 1/);
  });

  it('--review-state rejects a cycle already completed by an early sensor CLEAN', async () => {
    const bundle = join(dir, 'review-state-sensor-clean');
    mkdirSync(bundle, { recursive: true });
    const primary = join(bundle, 'primary.spec.md');
    writeFileSync(primary, reviewState('Primary', 'CLEAN', 'primary.spec.md'), 'utf-8');
    stampReviewState(bundle);

    const result = await mod.run(argv('--review-state', primary));
    assert.strictEqual(result.exitCode, 1);
    assert.match(result.text, /ERR_CLI_SDD_CHECK_REVIEW_STATE/);
    assert.match(result.text, /critic cycle is already complete/);
    assert.match(result.text, /--review-ready primary\.spec\.md/);
    assert.match(result.text, /do not dispatch another critic round/);
  });

  it('--review-state fails closed when bytes changed after a sensor CLEAN', async () => {
    const bundle = join(dir, 'review-state-stale-clean');
    mkdirSync(bundle, { recursive: true });
    const primary = join(bundle, 'primary.spec.md');
    writeFileSync(primary, reviewState('Primary', 'CLEAN', 'primary.spec.md'), 'utf-8');
    stampReviewState(bundle);
    const reviewed = readFileSync(primary, 'utf-8');
    writeFileSync(primary, replaceFixture(reviewed, '# Primary', '# Primary edited'), 'utf-8');

    const result = await mod.run(argv('--review-state', primary));
    assert.strictEqual(result.exitCode, 1);
    assert.match(result.text, /SDD_CRITIC_CHANGED_STATE_MISMATCH/);
    assert.match(result.text, /Re-dispatch critic before readiness/);
  });

  it('--review-state rejects a cycle completed by operator CLEAN at round five', async () => {
    const bundle = join(dir, 'review-state-operator-clean');
    mkdirSync(bundle, { recursive: true });
    const primary = join(bundle, 'primary.spec.md');
    const rounds = [1, 2, 3, 4].map(() => ({ verdict: 'NEEDS_WORK' }));
    rounds.push({ verdict: 'NEEDS_WORK', decision: 'CLEAN' });
    writeFileSync(primary, criticHistory('Primary', rounds), 'utf-8');
    stampReviewState(bundle);

    const result = await mod.run(argv('--review-state', primary));
    assert.strictEqual(result.exitCode, 1);
    assert.match(result.text, /critic cycle is already complete/);
    assert.match(result.text, /--review-ready/);
  });

  it('--review-state rejects operator CLEAN when the cap round edited the bundle', async () => {
    const bundle = join(dir, 'review-state-operator-clean-after-edits');
    mkdirSync(bundle, { recursive: true });
    const primary = join(bundle, 'primary.spec.md');
    const rounds = [1, 2, 3, 4].map(() => ({ verdict: 'NEEDS_WORK' }));
    rounds.push({
      verdict: 'CLEAN',
      decision: 'CLEAN',
      changes: 'updated primary.spec.md',
    });
    writeFileSync(primary, criticHistory('Primary', rounds), 'utf-8');

    const result = await mod.run(argv('--review-state', primary));
    assert.strictEqual(result.exitCode, 1);
    assert.match(result.text, /SDD_CRITIC_OPERATOR_DECISION_INVALID/);
    assert.match(result.text, /CLEAN is allowed only when Changes=none/);
  });

  it('--review-state permits the operator-approved continuation after round-five CLEAN', async () => {
    const bundle = join(dir, 'review-state-continued-clean');
    mkdirSync(bundle, { recursive: true });
    const primary = join(bundle, 'primary.spec.md');
    const rounds = [1, 2, 3, 4].map(() => ({ verdict: 'NEEDS_WORK' }));
    rounds.push({ verdict: 'CLEAN', decision: 'CONTINUE THROUGH ROUND 7' });
    writeFileSync(primary, criticHistory('Primary', rounds), 'utf-8');

    const result = await mod.run(argv('--review-state', primary));
    assert.strictEqual(result.exitCode, 0, result.text);
    assert.match(result.text, /target-set: primary\.spec\.md/);
  });

  it('--review-state rejects an operator RESTART as terminal for the old cycle', async () => {
    const bundle = join(dir, 'review-state-restart');
    mkdirSync(bundle, { recursive: true });
    const primary = join(bundle, 'primary.spec.md');
    const rounds = [1, 2, 3, 4].map(() => ({ verdict: 'NEEDS_WORK' }));
    rounds.push({ verdict: 'NEEDS_WORK', decision: 'RESTART: target changed' });
    writeFileSync(primary, criticHistory('Primary', rounds), 'utf-8');

    const result = await mod.run(argv('--review-state', primary));
    assert.strictEqual(result.exitCode, 1);
    assert.match(result.text, /SDD_CRITIC_RESTART_REQUIRED/);
    assert.match(result.text, /begin a fresh Round 1/);
  });

  it('--review-ready fails closed on an unreadable spec member', async () => {
    const bundle = join(dir, 'review-bundle-unreadable');
    mkdirSync(bundle, { recursive: true });
    const unreadable = join(bundle, 'unreadable.spec.md');
    writeFileSync(unreadable, reviewState('Unreadable', 'CLEAN', 'unreadable.spec.md'), 'utf-8');
    stampReviewState(bundle);
    commitReviewFixture(bundle);
    chmodSync(unreadable, 0o000);
    try {
      const r = await mod.run(argv('--review-ready', bundle));
      assert.strictEqual(r.exitCode, 1);
      assert.match(r.text, /SDD_REVIEW_READY_MEMBER_UNREADABLE/);
    } finally {
      chmodSync(unreadable, 0o600);
    }
  });

  it('--task on a fabricated DONE → exit 1 with the finding', async () => {
    const t = join(dir, 'fab.md');
    writeFileSync(t, FABRICATED, 'utf-8');
    const r = await mod.run(argv(`--task=${t}`));
    assert.strictEqual(r.exitCode, 1);
    assert.match(r.text, /SDD_FABRICATED_DONE/);
    assert.match(r.text, /next: структура\/якоря — правь через `\/sdd-reconcile`\./);
    assert.doesNotMatch(r.text, /next: язык/);
  });

  it('a clean run carries no next: hint at all', async () => {
    const t = join(dir, 'clean-next.md');
    writeFileSync(t, CLEAN_TICKET, 'utf-8');
    const r = await mod.run(argv(`--task=${t}`));
    assert.strictEqual(r.exitCode, 0);
    assert.doesNotMatch(r.text, /next:/);
  });

  it('a calque-only finding carries the language hint, not the reconcile one', async () => {
    const t = join(dir, 'calque.md');
    writeFileSync(t, CLEAN_TICKET.replace('DONE\n', 'DONE — надо аппрувить\n'), 'utf-8');
    const r = await mod.run(argv(`--task=${t}`));
    assert.match(r.text, /SDD_LANGUAGE_CALQUE/);
    assert.match(r.text, /next: язык — калька за калькой/);
    assert.doesNotMatch(r.text, /next: структура\/якоря/);
  });

  it('--task fails closed when a phase rule link does not resolve', async () => {
    const t = join(dir, 'broken-rule.md');
    writeFileSync(t, TICKET_BROKEN_RULE, 'utf-8');
    const r = await mod.run(argv(`--task=${t}`));
    assert.strictEqual(r.exitCode, 1);
    assert.match(r.text, /ERR_CLI_SDD_CHECK_READ_FAILED/);
    assert.match(r.text, /missing-rule\.xml/);
  });

  it('--task: a resolvable rule link is not flagged', async () => {
    writeFileSync(join(dir, 'real-rule.xml'), '<Rule/>', 'utf-8');
    const t = join(dir, 'ok-rule.md');
    writeFileSync(t, TICKET_BROKEN_RULE.replace('./missing-rule.xml', './real-rule.xml'), 'utf-8');
    const r = await mod.run(argv(`--task=${t}`));
    assert.strictEqual(r.exitCode, 0, r.text);
    assert.doesNotMatch(r.text, /ERR_CLI_SDD_CHECK_READ_FAILED/);
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

  const ticketWithCoverage = (taskId: string, coverageBody: string, status = '[ ] TODO'): string =>
    [
      '<!--SECTION:META-->',
      `- **Task-ID:** ${taskId}`,
      `- **Status:** ${status}`,
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

  it('--task --authoring gates one pre-index ticket without runtime files or sibling scans', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sdd-check-authoring-'));
    const scopeDir = join(root, 'specs', 'infra-base');
    mkdirSync(scopeDir, { recursive: true });
    writeFileSync(
      join(scopeDir, 'infra-base.spec.md'),
      '<!--SECTION:SCOPE_TYPE-->\ninfrastructure\n<!--/SECTION:SCOPE_TYPE-->'
    );
    const ticketPath = join(scopeDir, 'infra-base.task.INF-gate.md');
    const ticketArg = 'specs/infra-base/infra-base.task.INF-gate.md';
    const ticket = (row: string): string =>
      [
        '<!--SECTION:META-->',
        '- **Task-ID:** INF-gate',
        '- **Status:** [ ] TODO',
        '- **Purpose:** validate one authored ticket',
        '- **Scope:** infra-base',
        '- **Module:** N/A',
        '- **Structural Owner:** infrastructure-flat',
        '- **Owning Spec:** [Owning spec](./infra-base.spec.md)',
        '- **Dependencies:** None',
        '- **Spec References:**',
        '  - Contract: [infra](infra-base.spec.md#SCOPE_TYPE)',
        '- **Runtime Backing:** not-implemented',
        '- **Verification Levels:** unit',
        '- **Deferred Runtime Scope:** None',
        '<!--/SECTION:META-->',
        '<!--SECTION:PHASES_OVERVIEW-->',
        '| ID | Kind | Deps | Status |',
        '|----|------|------|--------|',
        '| P1 | test | — | [ ] |',
        '<!--/SECTION:PHASES_OVERVIEW-->',
        '<!--SECTION:PHASE_P1-->',
        '- **Objective:** add the authored-ticket test',
        '- **Rules:**',
        '  - [test rule](../../ai/directives/test-rule.xml)',
        '- **Target Files:**',
        '  - test/future.test.ts',
        '- **Deleted Files:**',
        '  - none',
        '- **Inputs:** none',
        '- **Exit:** authoring gate passes',
        '<!--/SECTION:PHASE_P1-->',
        '<!--SECTION:BDD-->',
        '**Scenario:** rejects an invalid ticket [`contract`] `[INF-REQ-1]`',
        '- **Given** an invalid authored ticket',
        '- **When** the authoring gate runs',
        '- **Then** it rejects the ticket',
        '<!--/SECTION:BDD-->',
        '<!--SECTION:VERIFICATION-->',
        '<!--COVERAGE_POLICY:v1-->',
        '- **Coverage Policy:** not-applicable',
        '- **Coverage Reason:** this fixture validates authoring structure only',
        '| Command | Required by | Role |',
        '|---------|-------------|------|',
        '| — | — | extra |',
        '<!--/SECTION:VERIFICATION-->',
        '<!--SECTION:TEST_COVERAGE-->',
        row,
        '<!--/SECTION:TEST_COVERAGE-->',
        '<!--SECTION:EXECUTION_LOG-->',
        '- pending',
        '<!--/SECTION:EXECUTION_LOG-->',
      ].join('\n');
    mkdirSync(join(root, 'ai', 'directives'), { recursive: true });
    writeFileSync(join(root, 'ai', 'directives', 'test-rule.xml'), '<Rule></Rule>');
    writeFileSync(ticketPath, ticket('- broken deferred row'));
    writeFileSync(join(scopeDir, 'infra-base.task.INF-sibling.md'), '<!-- broken sibling -->');
    try {
      const red = await mod.run(argv('--task', ticketArg, '--authoring'), root);
      assert.strictEqual(red.exitCode, 1, red.text);
      assert.match(red.text, /SDD_BDD_COVERAGE_ROW_UNPARSED/);
      assert.doesNotMatch(red.text, /INF-sibling|PHASE_RECEIPT|COVERAGE_POLICY/);
      assert.match(red.text, /fix only this ticket, then rerun the same authoring command/);
      assert.doesNotMatch(red.text, /sdd-reconcile/);

      const idLookup = await mod.run(argv('--task', 'INF-gate', '--authoring'), root);
      assert.strictEqual(idLookup.exitCode, 4, idLookup.text);
      assert.match(idLookup.text, /exact created ticket path returned by sdd-new/);

      const noBdd = ticket('- rejects an invalid ticket → `future.test.ts` :: `rejects`').replace(
        /<!--SECTION:BDD-->[\s\S]*?<!--\/SECTION:BDD-->/,
        ''
      );
      writeFileSync(ticketPath, noBdd);
      const missingBdd = await mod.run(argv('--task', ticketArg, '--authoring'), root);
      assert.match(missingBdd.text, /SDD_AUTHORING_SECTION_REQUIRED.+BDD/);

      writeFileSync(
        ticketPath,
        ticket('- rejects an invalid ticket → `future.test.ts` :: `rejects`').replace(
          '| P1 | test | — | [ ] |',
          '| not-a-phase | unknown | — | pending |'
        )
      );
      const badPhases = await mod.run(argv('--task', ticketArg, '--authoring'), root);
      assert.match(badPhases.text, /SDD_AUTHORING_PHASES_INVALID/);

      writeFileSync(
        ticketPath,
        ticket('- rejects an invalid ticket → `future.test.ts` :: `rejects`').replace(
          'validate one authored ticket',
          '<purpose>'
        )
      );
      const placeholder = await mod.run(argv('--task', ticketArg, '--authoring'), root);
      assert.match(placeholder.text, /SDD_AUTHORING_(?:META_INCOMPLETE|PLACEHOLDER)/);

      writeFileSync(
        ticketPath,
        ticket('- rejects an invalid ticket → `future.test.ts` :: `rejects`')
      );
      const green = await mod.run(argv('--task', ticketArg, '--authoring'), root);
      assert.strictEqual(green.exitCode, 0, green.text);
      assert.match(green.text, /✅ clean — 1 file\(s\) checked/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('--authoring reports line-addressed RED fixtures and the corrected ticket becomes GREEN', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sdd-check-authoring-feedback-'));
    const scopeDir = join(root, 'specs', 'infra-base');
    const ticketArg = 'specs/infra-base/infra-base.task.INF-tool.md';
    const ticketPath = join(root, ticketArg);
    const corrected = readFileSync(AUTHORING_CORRECTED_FIXTURE, 'utf-8');
    const lineOf = (text: string, needle: string): number => {
      const index = text.split('\n').findIndex((line) => line.includes(needle));
      assert.notStrictEqual(index, -1, `fixture line missing: ${needle}`);
      return index + 1;
    };
    mkdirSync(scopeDir, { recursive: true });
    mkdirSync(join(root, 'ai', 'directives'), { recursive: true });
    writeFileSync(
      join(scopeDir, 'infra-base.spec.md'),
      [
        '<!--SECTION:SCOPE_TYPE-->',
        'infrastructure',
        '<!--/SECTION:SCOPE_TYPE-->',
        '#### Service: `Toolchain`',
      ].join('\n')
    );
    writeFileSync(join(root, 'ai', 'directives', 'test-rule.xml'), '<Rule></Rule>');
    try {
      const cases = [
        {
          name: 'placeholder required Meta field',
          ticket: replaceFixture(
            corrected,
            'author one deterministic infrastructure ticket',
            '<purpose>'
          ),
          code: 'SDD_AUTHORING_META_INCOMPLETE',
          lineNeedle: '- **Purpose:**',
          section: 'META',
        },
        {
          name: 'empty required Meta field',
          ticket: replaceFixture(
            corrected,
            '- **Purpose:** author one deterministic infrastructure ticket',
            '- **Purpose:**'
          ),
          code: 'SDD_AUTHORING_META_INCOMPLETE',
          lineNeedle: '- **Purpose:**',
          section: 'META',
        },
        {
          name: 'malformed READ/CREATE Target File',
          ticket: replaceFixture(corrected, 'src/toolchain.ts', 'src/*.ts'),
          code: 'SDD_AUTHORING_TARGET_PATH',
          lineNeedle: 'src/*.ts',
          section: 'PHASE_P1',
        },
        {
          name: 'overview dependency and Inputs disagree',
          ticket: replaceFixture(corrected, '- **Inputs:** P1 handoff', '- **Inputs:** none'),
          code: 'SDD_AUTHORING_PHASE_DEPENDENCY',
          lineNeedle: '| P2 | test | P1 |',
          section: 'PHASES_OVERVIEW',
        },
        {
          name: 'contract has no contract-level BDD scenario',
          ticket: replaceFixture(corrected, '[`contract`]', '[`unit`]'),
          code: 'SDD_AUTHORING_BDD_CONTRACT',
          lineNeedle: '**Scenario:** creates the project toolchain',
          section: 'BDD',
        },
        {
          name: 'BDD test mapping has no owning test phase target',
          ticket: replaceFixture(
            corrected,
            '`test/toolchain.test.ts` ::',
            '`test/unowned.test.ts` ::'
          ),
          code: 'SDD_AUTHORING_BDD_PHASE',
          lineNeedle: 'test/unowned.test.ts',
          section: 'TEST_COVERAGE',
        },
        {
          name: 'structural owner drift',
          ticket: replaceFixture(
            corrected,
            '- **Structural Owner:** infrastructure-flat',
            '- **Structural Owner:** module'
          ),
          code: 'SDD_TASK_OWNER_METADATA',
          lineNeedle: '- **Structural Owner:**',
          section: 'META',
        },
        {
          name: 'owning spec drift',
          ticket: replaceFixture(
            corrected,
            '[Owning spec](./infra-base.spec.md)',
            '[Owning spec](./wrong.spec.md)'
          ),
          code: 'SDD_TASK_OWNER_METADATA',
          lineNeedle: '- **Structural Owner:**',
          section: 'META',
        },
      ];

      for (const fixture of cases) {
        writeFileSync(ticketPath, fixture.ticket);
        const outcome = await mod.run(argv('--task', ticketArg, '--authoring'), root);
        assert.strictEqual(outcome.exitCode, 1, `${fixture.name}\n${outcome.text}`);
        assert.match(
          outcome.text,
          new RegExp(`${ticketArg}:${lineOf(fixture.ticket, fixture.lineNeedle)}:`)
        );
        assert.match(outcome.text, new RegExp(`${fixture.code}  \\[${fixture.section}\\]`));
        assert.match(outcome.text, /Fix:|Example:/);
        assert.doesNotMatch(outcome.text, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      }

      writeFileSync(ticketPath, corrected);
      const green = await mod.run(argv('--task', ticketArg, '--authoring'), root);
      assert.strictEqual(green.exitCode, 0, green.text);
      assert.match(green.text, /✅ clean — 1 file\(s\) checked/);

      mkdirSync(join(root, 'src'), { recursive: true });
      writeFileSync(join(root, 'src', 'existing.ts'), 'export const existing = true;');
      writeFileSync(ticketPath, replaceFixture(corrected, 'src/toolchain.ts', 'src/existing.ts'));
      const existingRead = await mod.run(argv('--task', ticketArg, '--authoring'), root);
      assert.strictEqual(existingRead.exitCode, 0, existingRead.text);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('--authoring --phase validates only that phase plus its overview/dependency boundary', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sdd-check-authoring-phase-'));
    const scopeDir = join(root, 'specs', 'infra-base');
    const ticketArg = 'specs/infra-base/infra-base.task.INF-tool.md';
    const ticketPath = join(root, ticketArg);
    const corrected = readFileSync(AUTHORING_CORRECTED_FIXTURE, 'utf-8');
    const brokenP2 = replaceFixture(corrected, 'test/toolchain.test.ts', 'test/*.test.ts');
    mkdirSync(scopeDir, { recursive: true });
    mkdirSync(join(root, 'ai', 'directives'), { recursive: true });
    writeFileSync(
      join(scopeDir, 'infra-base.spec.md'),
      '<!--SECTION:SCOPE_TYPE-->\ninfrastructure\n<!--/SECTION:SCOPE_TYPE-->\n#### Service: `Toolchain`'
    );
    writeFileSync(join(root, 'ai', 'directives', 'test-rule.xml'), '<Rule></Rule>');
    writeFileSync(ticketPath, brokenP2);
    try {
      const phaseOne = await mod.run(
        argv('--task', ticketArg, '--authoring', '--phase', 'P1'),
        root
      );
      assert.strictEqual(phaseOne.exitCode, 0, phaseOne.text);

      const phaseTwo = await mod.run(
        argv('--task', ticketArg, '--authoring', '--phase', 'P2'),
        root
      );
      assert.strictEqual(phaseTwo.exitCode, 1, phaseTwo.text);
      assert.match(phaseTwo.text, /SDD_AUTHORING_TARGET_PATH  \[PHASE_P2\]/);
      assert.doesNotMatch(phaseTwo.text, /META|BDD|VERIFICATION|TEST_COVERAGE/);

      const full = await mod.run(argv('--task', ticketArg, '--authoring'), root);
      assert.strictEqual(full.exitCode, 1, full.text);
      assert.match(full.text, /SDD_AUTHORING_TARGET_PATH/);

      const phaseWithoutAuthoring = await mod.run(argv('--task', ticketArg, '--phase', 'P1'), root);
      assert.strictEqual(phaseWithoutAuthoring.exitCode, 4, phaseWithoutAuthoring.text);
      assert.match(phaseWithoutAuthoring.text, /--phase requires --authoring/);

      const malformedPhase = await mod.run(
        argv('--task', ticketArg, '--authoring', '--phase', 'phase-1'),
        root
      );
      assert.strictEqual(malformedPhase.exitCode, 4, malformedPhase.text);
      assert.match(malformedPhase.text, /--phase must match P<N>/);

      const absentPhase = await mod.run(
        argv('--task', ticketArg, '--authoring', '--phase', 'P9'),
        root
      );
      assert.strictEqual(absentPhase.exitCode, 1, absentPhase.text);
      assert.match(absentPhase.text, /SDD_AUTHORING_PHASE_NOT_FOUND  \[PHASES_OVERVIEW\]/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('--authoring --phase proves only the selected Rules cascade and addresses failures to the ticket', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sdd-check-authoring-rules-'));
    const scopeDir = join(root, 'specs', 'infra-base');
    const rulesDir = join(root, 'ai', 'directives');
    const ticketArg = 'specs/infra-base/infra-base.task.INF-tool.md';
    const ticketPath = join(root, ticketArg);
    const corrected = readFileSync(AUTHORING_CORRECTED_FIXTURE, 'utf-8');
    const p2Rules = (links: string[]): string =>
      corrected.replace(
        /(<!--SECTION:PHASE_P2-->[\s\S]*?- \*\*Rules:\*\*\n)(?:  - .+\n)+(?=- \*\*Target Files:\*\*)/,
        `$1${links.map((link) => `  - [rule](${link})`).join('\n')}\n`
      );
    const lineOf = (text: string, needle: string): number =>
      text.split('\n').findIndex((line) => line.includes(needle)) + 1;
    const phaseLineOf = (text: string, phaseId: string, needle: string): number => {
      const lines = text.split('\n');
      const start = lines.findIndex((line) => line.includes(`<!--SECTION:PHASE_${phaseId}-->`));
      return lines.findIndex((line, index) => index > start && line.includes(needle)) + 1;
    };
    mkdirSync(scopeDir, { recursive: true });
    mkdirSync(rulesDir, { recursive: true });
    writeFileSync(
      join(scopeDir, 'infra-base.spec.md'),
      '<!--SECTION:SCOPE_TYPE-->\ninfrastructure\n<!--/SECTION:SCOPE_TYPE-->\n#### Service: `Toolchain`'
    );
    writeFileSync(join(rulesDir, 'test-rule.xml'), '<Rule>leaf</Rule>');
    try {
      const missingDirectTicket = p2Rules(['../../ai/directives/missing-direct.xml']);
      writeFileSync(ticketPath, missingDirectTicket);
      const unaffectedP1 = await mod.run(
        argv('--task', ticketArg, '--authoring', '--phase', 'P1'),
        root
      );
      assert.strictEqual(unaffectedP1.exitCode, 0, unaffectedP1.text);

      const missingDirect = await mod.run(
        argv('--task', ticketArg, '--authoring', '--phase', 'P2'),
        root
      );
      assert.strictEqual(missingDirect.exitCode, 1, missingDirect.text);
      assert.match(missingDirect.text, /ERR_CLI_SDD_CHECK_READ_FAILED  \[PHASE_P2\] Fix:/);
      assert.match(missingDirect.text, /ai\/directives\/missing-direct\.xml/);
      assert.match(
        missingDirect.text,
        new RegExp(`${ticketArg}:${lineOf(missingDirectTicket, 'missing-direct.xml')}:`)
      );
      assert.doesNotMatch(missingDirect.text, new RegExp(`^ai/directives/missing-direct`, 'm'));
      const fullMissingDirect = await mod.run(argv('--task', ticketArg, '--authoring'), root);
      assert.strictEqual(fullMissingDirect.exitCode, 1, fullMissingDirect.text);
      assert.match(fullMissingDirect.text, /ERR_CLI_SDD_CHECK_READ_FAILED  \[PHASE_P2\] Fix:/);

      const unsafeDirectTicket = p2Rules(['../../../external.xml']);
      writeFileSync(ticketPath, unsafeDirectTicket);
      const unsafeDirect = await mod.run(
        argv('--task', ticketArg, '--authoring', '--phase', 'P2'),
        root
      );
      assert.strictEqual(unsafeDirect.exitCode, 1, unsafeDirect.text);
      assert.match(unsafeDirect.text, /ERR_CLI_SDD_CHECK_READ_FAILED  \[PHASE_P2\] Fix:/);
      assert.match(unsafeDirect.text, /path segments are forbidden/);
      assert.match(
        unsafeDirect.text,
        new RegExp(`${ticketArg}:${lineOf(unsafeDirectTicket, '../../../external.xml')}:`)
      );

      writeFileSync(
        join(rulesDir, 'root.xml'),
        '<DependsOn>\n  - ai/directives/missing-transitive.xml\n</DependsOn>\n'
      );
      const missingTransitiveTicket = p2Rules(['../../ai/directives/root.xml']);
      writeFileSync(ticketPath, missingTransitiveTicket);
      const missingTransitive = await mod.run(
        argv('--task', ticketArg, '--authoring', '--phase', 'P2'),
        root
      );
      assert.strictEqual(missingTransitive.exitCode, 1, missingTransitive.text);
      assert.match(
        missingTransitive.text,
        /ERR_CLI_SDD_CHECK_READ_FAILED  \[PHASE_P2\] Fix:[\s\S]*ai\/directives\/missing-transitive\.xml/
      );
      assert.match(
        missingTransitive.text,
        new RegExp(`${ticketArg}:${phaseLineOf(missingTransitiveTicket, 'P2', '- **Rules:**')}:`)
      );
      assert.doesNotMatch(missingTransitive.text, /SDD_RULES_CASCADE_UNRESOLVED/);

      writeFileSync(
        join(rulesDir, 'root.xml'),
        '<DependsOn>\n  - ai/directives/leaf.xml\n</DependsOn>\n'
      );
      writeFileSync(join(rulesDir, 'leaf.xml'), '<Rule>leaf</Rule>\n');
      const incompleteClosureTicket = p2Rules(['../../ai/directives/root.xml']);
      writeFileSync(ticketPath, incompleteClosureTicket);
      const incompleteClosure = await mod.run(
        argv('--task', ticketArg, '--authoring', '--phase', 'P2'),
        root
      );
      assert.strictEqual(incompleteClosure.exitCode, 1, incompleteClosure.text);
      assert.match(
        incompleteClosure.text,
        /SDD_RULES_CASCADE_UNRESOLVED  \[PHASE_P2\] Fix:[\s\S]*ai\/directives\/leaf\.xml/
      );
      assert.match(
        incompleteClosure.text,
        new RegExp(`${ticketArg}:${phaseLineOf(incompleteClosureTicket, 'P2', '- **Rules:**')}:`)
      );

      writeFileSync(
        ticketPath,
        p2Rules(['../../ai/directives/root.xml', '../../ai/directives/leaf.xml'])
      );
      const green = await mod.run(argv('--task', ticketArg, '--authoring', '--phase', 'P2'), root);
      assert.strictEqual(green.exitCode, 0, green.text);
      assert.match(green.text, /✅ clean — 1 file\(s\) checked/);
      const fullGreen = await mod.run(argv('--task', ticketArg, '--authoring'), root);
      assert.strictEqual(fullGreen.exitCode, 0, fullGreen.text);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
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
        ticketWithCoverage(
          'cli-foo',
          '- scenario → `src/app/x.test.ts` :: `does the thing`',
          '[x] DONE'
        ),
        'utf-8'
      );
      const r = await mod.run(argv(`--task=${t}`));
      assert.doesNotMatch(r.text, /SDD_BDD_SCENARIO_UNTESTED/);
    } finally {
      process.chdir(prevCwd);
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('--task skips the SDD_BDD_SCENARIO_UNTESTED existence check before Status is DONE — mid-implementation, the test file legitimately does not exist yet', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'sdd-check-cwd-'));
    const prevCwd = process.cwd();
    try {
      writeFileSync(join(cwd, 'package.json'), '{}', 'utf-8');
      process.chdir(cwd);
      const t = join(cwd, 'ticket.md');
      // no test file on disk at all, Status TODO — existence check must not run
      writeFileSync(
        t,
        ticketWithCoverage('cli-foo', '- scenario → `never-written.test.ts` :: `does the thing`'),
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
        ticketWithCoverage('cli-foo', '- scenario → `x.test.ts` :: `does the thing`', '[x] DONE'),
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
        ticketWithCoverage('cli-foo', '- scenario → `x.test.ts` :: `does the thing`', '[x] DONE'),
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
    // this root has no tasks/ dir at all — a genuine v2 tree — so the ticket's Task-ID must satisfy
    // the v2 grammar (SDD_TASK_ID_GRAMMAR), unlike the lowercase "cli-foo" fixture used elsewhere.
    writeFileSync(
      join(scopeDir, 'cli.task-foo.md'),
      CLEAN_TICKET.replace('cli-foo', 'CLI-foo'),
      'utf-8'
    );
    // a complete tree carries the matching Tracker Index row (else SDD_TRACKER_MISSING_ROW)
    writeFileSync(
      join(scopeDir, 'cli.3-tasks.md'),
      [
        '# cli — Tasks',
        '## 1. Tracker Index',
        '| Task-ID | Title | Dependencies | Status | Reopens |',
        '|---------|-------|--------------|--------|---------|',
        '| CLI-foo | Foo | — | [x] DONE | — |',
      ].join('\n'),
      'utf-8'
    );
    const r = await mod.run(argv('--all', root));
    assert.strictEqual(r.exitCode, 0);
  });

  it('--all before authoring ignores unrelated Markdown when specs/ and tasks/ are absent', async () => {
    const root = join(dir, 'empty-pre-authoring-proj');
    mkdirSync(join(root, 'ai', 'directives'), { recursive: true });
    writeFileSync(
      join(root, 'ai', 'directives', 'bundled-example.md'),
      '# Not a product spec\n\n```mermaid\nthis is intentionally invalid\n```\n',
      'utf-8'
    );
    const previousCwd = process.cwd();
    try {
      process.chdir(root);
      const r = await mod.run(argv('--all'));
      assert.strictEqual(r.exitCode, 0);
      assert.match(r.text, /0 file\(s\) checked/);
    } finally {
      process.chdir(previousCwd);
    }
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

  it('--all: SDD_TASK_ID_GRAMMAR fires for a bad Task-ID in a migrated (v2) scope ticket', async () => {
    const root = join(dir, 'grammar-v2-proj');
    mkdirSync(join(root, 'specs', 'new-scope', 'mod'), { recursive: true });
    // migrated marker: tasks/<scope>/ absent + co-located index present (same as the mixed-repo test)
    writeFileSync(
      join(root, 'specs', 'new-scope', 'new-scope.3-tasks.md'),
      '# Tasks: new-scope\n',
      'utf-8'
    );
    writeFileSync(
      join(root, 'specs', 'new-scope', 'mod', 'mod.task.gat-login.md'),
      CLEAN_TICKET.replace('cli-foo', 'gat-login'),
      'utf-8'
    );
    const r = await mod.run(argv('--all', root));
    assert.match(r.text, /SDD_TASK_ID_GRAMMAR/);
  });

  it('--all: SDD_TASK_ID_GRAMMAR does NOT fire for the same bad id in an un-migrated (v1) scope', async () => {
    const root = join(dir, 'grammar-v1-proj');
    mkdirSync(join(root, 'tasks', 'old-scope'), { recursive: true });
    mkdirSync(join(root, 'specs', 'old-scope', 'mod'), { recursive: true });
    writeFileSync(
      join(root, 'specs', 'old-scope', 'mod', 'mod.task.gat-login.md'),
      CLEAN_TICKET.replace('cli-foo', 'gat-login'),
      'utf-8'
    );
    const r = await mod.run(argv('--all', root));
    assert.doesNotMatch(r.text, /SDD_TASK_ID_GRAMMAR/);
  });

  it('--all: SDD_TASK_ID_PREFIX_CLASH fires across two tickets whose ids are a hyphen-prefix of each other', async () => {
    const root = join(dir, 'prefix-clash-proj');
    mkdirSync(join(root, 'specs', 'cli'), { recursive: true });
    writeFileSync(
      join(root, 'specs', 'cli', 'cli.task-a.md'),
      CLEAN_TICKET.replace('cli-foo', 'GAT-gates'),
      'utf-8'
    );
    writeFileSync(
      join(root, 'specs', 'cli', 'cli.task-b.md'),
      CLEAN_TICKET.replace('cli-foo', 'GAT-gates-v2').replace('[x] DONE', '[ ] TODO'),
      'utf-8'
    );
    const r = await mod.run(argv('--all', root));
    assert.match(r.text, /SDD_TASK_ID_PREFIX_CLASH/);
  });

  it('--all: no PREFIX_CLASH for a bare numeric-suffix relationship (TSK-1 vs TSK-10)', async () => {
    const root = join(dir, 'no-prefix-clash-proj');
    mkdirSync(join(root, 'specs', 'cli'), { recursive: true });
    writeFileSync(
      join(root, 'specs', 'cli', 'cli.task-a.md'),
      CLEAN_TICKET.replace('cli-foo', 'TSK-1'),
      'utf-8'
    );
    writeFileSync(
      join(root, 'specs', 'cli', 'cli.task-b.md'),
      CLEAN_TICKET.replace('cli-foo', 'TSK-10').replace('[x] DONE', '[ ] TODO'),
      'utf-8'
    );
    const r = await mod.run(argv('--all', root));
    assert.doesNotMatch(r.text, /SDD_TASK_ID_PREFIX_CLASH/);
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

  it('--task reports the exact validated repository-relative path', async () => {
    const t = join(dir, 'fab-path.md');
    writeFileSync(t, FABRICATED, 'utf-8');
    const r = await mod.run(argv(`--task=${t}`));
    assert.ok(isAbsolute(t));
    assert.match(r.text, /^fab-path\.md:/m);
    assert.ok(!r.text.includes(t), `absolute fixture path leaked into report:\n${r.text}`);
  });

  it('exits 4 with neither --task nor --all, 1 on missing --task file', async () => {
    const none = await mod.run(argv());
    assert.strictEqual(none.exitCode, 4);
    const missing = await mod.run(argv(`--task=${join(dir, 'nope.md')}`));
    assert.strictEqual(missing.exitCode, 1);
  });

  it('--task: unreadable, non-Task-ID-shaped path → tool-teaches hint points at `sdd-task`', async () => {
    const missing = await mod.run(argv(`--task=${join(dir, 'nope.md')}`));
    assert.match(missing.text, /run `sdd-task` with no arguments for the execution map/);
  });

  describe('--task bare Task-ID resolution (AX_TASK_RESOLUTION)', () => {
    // "cli-foo" (the shared fixtures) is lowercase-ACR, not v2-Task-ID-shaped — these tests build
    // their own grammar-conforming ticket in an isolated, chdir'd directory.
    const idClean = (id: string): string => CLEAN_TICKET.replace('cli-foo', id);

    it('resolves to its ticket — banner precedes the report, findings key off the real path', async () => {
      const idDir = mkdtempSync(join(tmpdir(), 'sdd-check-id-'));
      writeFileSync(join(idDir, 'ticket.md'), idClean('TSK-foo'), 'utf-8');
      const origCwd = process.cwd();
      process.chdir(idDir);
      try {
        const r = await mod.run(argv('--task', 'TSK-foo'));
        assert.match(r.text, /^\[sdd-check\] TSK-foo → ticket\.md\n/);
        assert.strictEqual(r.exitCode, 0);
      } finally {
        process.chdir(origCwd);
        rmSync(idDir, { recursive: true, force: true });
      }
    });

    it('an unknown but Task-ID-shaped argument → exit 2 listing known Task-IDs', async () => {
      const idDir = mkdtempSync(join(tmpdir(), 'sdd-check-id-'));
      writeFileSync(join(idDir, 'ticket.md'), idClean('TSK-foo'), 'utf-8');
      const origCwd = process.cwd();
      process.chdir(idDir);
      try {
        const r = await mod.run(argv('--task', 'NOPE-ghost'));
        assert.strictEqual(r.exitCode, 2);
        assert.match(r.text, /ERR_CLI_SDD_CHECK_UNKNOWN_ID: NOPE-ghost/);
        assert.match(r.text, /known Task-IDs:.*TSK-foo/);
      } finally {
        process.chdir(origCwd);
        rmSync(idDir, { recursive: true, force: true });
      }
    });

    it('a Task-ID matching two tickets → exit 2 listing both candidate paths', async () => {
      const dupDir = mkdtempSync(join(tmpdir(), 'sdd-check-dup-'));
      writeFileSync(join(dupDir, 'a.md'), idClean('TSK-dup'), 'utf-8');
      writeFileSync(join(dupDir, 'b.md'), idClean('TSK-dup'), 'utf-8');
      const origCwd = process.cwd();
      process.chdir(dupDir);
      try {
        const r = await mod.run(argv('--task', 'TSK-dup'));
        assert.strictEqual(r.exitCode, 2);
        assert.match(r.text, /ERR_CLI_SDD_CHECK_AMBIGUOUS_ID: TSK-dup matches 2 tickets/);
        assert.match(r.text, /a\.md/);
        assert.match(r.text, /b\.md/);
      } finally {
        process.chdir(origCwd);
        rmSync(dupDir, { recursive: true, force: true });
      }
    });

    it('cannot resolve a bare Task-ID cleanly through an unreadable search subtree', async (context) => {
      const idDir = mkdtempSync(join(tmpdir(), 'sdd-check-id-unreadable-'));
      const hidden = join(idDir, 'hidden');
      mkdirSync(hidden);
      writeFileSync(join(idDir, 'visible.md'), idClean('TSK-safe'), 'utf-8');
      writeFileSync(join(hidden, 'possible-duplicate.md'), idClean('TSK-safe'), 'utf-8');
      if (!denyRead(context, hidden, 'directory')) {
        rmSync(idDir, { recursive: true, force: true });
        return;
      }
      const origCwd = process.cwd();
      process.chdir(idDir);
      try {
        const result = await mod.run(argv('--task', 'TSK-safe'));
        assert.strictEqual(result.exitCode, 1, result.text);
        assert.match(result.text, /ERR_CLI_SDD_CHECK_READ_FAILED/);
        assert.match(result.text, /hidden/);
        assert.match(result.text, /EACCES|EPERM/);
        assert.doesNotMatch(result.text, /✅ clean/);
      } finally {
        process.chdir(origCwd);
        chmodSync(hidden, 0o700);
        rmSync(idDir, { recursive: true, force: true });
      }
    });
  });

  describe('research connectivity gates (SDD_RESEARCH_REF_BROKEN / SDD_RESEARCH_ORPHAN / SDD_RESEARCH_UNREGISTERED)', () => {
    it('--all: a healthy spec ⟷ research pair is clean — no broken ref, no orphan', async () => {
      const root = join(dir, 'research-healthy-proj');
      const scopeDir = join(root, 'specs', 'cli');
      mkdirSync(join(scopeDir, 'research'), { recursive: true });
      writeFileSync(
        join(scopeDir, 'cli.task-foo.md'),
        `${CLEAN_TICKET.replace('cli-foo', 'CLI-foo')}\n\nSee [research](./research/2026-01-01-x.research.md) for rationale.\n`,
        'utf-8'
      );
      writeFileSync(
        join(scopeDir, 'cli.3-tasks.md'),
        [
          '# cli — Tasks',
          '## 1. Tracker Index',
          '| Task-ID | Title | Dependencies | Status | Reopens |',
          '|---------|-------|--------------|--------|---------|',
          '| CLI-foo | Foo | — | [x] DONE | — |',
        ].join('\n'),
        'utf-8'
      );
      writeFileSync(
        join(scopeDir, 'research', '2026-01-01-x.research.md'),
        '# Research: x\n',
        'utf-8'
      );

      const r = await mod.run(argv('--all', root));
      assert.doesNotMatch(r.text, /SDD_RESEARCH_REF_BROKEN/);
      assert.doesNotMatch(r.text, /SDD_RESEARCH_ORPHAN/);
      assert.strictEqual(r.exitCode, 0);
    });

    it('--all flags a research-doc link that does not resolve on disk (SDD_RESEARCH_REF_BROKEN, error)', async () => {
      const root = join(dir, 'research-broken-proj');
      const scopeDir = join(root, 'specs', 'cli');
      mkdirSync(scopeDir, { recursive: true });
      writeFileSync(
        join(scopeDir, 'cli.task-foo.md'),
        `${CLEAN_TICKET.replace('cli-foo', 'CLI-foo')}\n\nSee [research](./research/2026-01-01-gone.research.md) for rationale.\n`,
        'utf-8'
      );
      writeFileSync(
        join(scopeDir, 'cli.3-tasks.md'),
        [
          '# cli — Tasks',
          '## 1. Tracker Index',
          '| Task-ID | Title | Dependencies | Status | Reopens |',
          '|---------|-------|--------------|--------|---------|',
          '| CLI-foo | Foo | — | [x] DONE | — |',
        ].join('\n'),
        'utf-8'
      );

      const r = await mod.run(argv('--all', root));
      assert.strictEqual(r.exitCode, 1);
      assert.match(r.text, /SDD_RESEARCH_REF_BROKEN/);
      assert.match(r.text, /gone\.research\.md/);
    });

    it('--all flags a research doc with zero incoming references (SDD_RESEARCH_ORPHAN, error, exit 1)', async () => {
      const root = join(dir, 'research-orphan-proj');
      const researchDir = join(root, 'specs', 'demo', 'research');
      mkdirSync(researchDir, { recursive: true });
      writeFileSync(
        join(researchDir, '2026-01-01-unlinked.research.md'),
        '# Research: unlinked\n',
        'utf-8'
      );

      const r = await mod.run(argv('--all', root));
      assert.match(r.text, /SDD_RESEARCH_ORPHAN/);
      assert.match(r.text, /unlinked\.research\.md/);
      assert.strictEqual(r.exitCode, 1, 'orphan is an error — lost knowledge fails the check');
    });

    it('--task on a ticket linking a missing research doc also fires SDD_RESEARCH_REF_BROKEN', async () => {
      const t = join(dir, 'ticket-research-broken.md');
      writeFileSync(
        t,
        `${CLEAN_TICKET}\n\nSee [research](./research/2026-01-01-gone.research.md).\n`,
        'utf-8'
      );
      const r = await mod.run(argv(`--task=${t}`));
      assert.match(r.text, /SDD_RESEARCH_REF_BROKEN/);
    });

    it("--all flags a research doc that is referenced but has no row in any spec's ## Research section (SDD_RESEARCH_UNREGISTERED, warn)", async () => {
      const root = join(dir, 'research-unregistered-proj');
      const scopeDir = join(root, 'specs', 'cli');
      mkdirSync(join(scopeDir, 'research'), { recursive: true });
      writeFileSync(
        join(scopeDir, 'cli.task-foo.md'),
        `${CLEAN_TICKET.replace('cli-foo', 'CLI-foo')}\n\nSee [research](./research/2026-01-01-x.research.md) for rationale.\n`,
        'utf-8'
      );
      writeFileSync(
        join(scopeDir, 'cli.3-tasks.md'),
        [
          '# cli — Tasks',
          '## 1. Tracker Index',
          '| Task-ID | Title | Dependencies | Status | Reopens |',
          '|---------|-------|--------------|--------|---------|',
          '| CLI-foo | Foo | — | [x] DONE | — |',
        ].join('\n'),
        'utf-8'
      );
      writeFileSync(
        join(scopeDir, 'research', '2026-01-01-x.research.md'),
        '# Research: x\n',
        'utf-8'
      );

      const r = await mod.run(argv('--all', root));
      assert.doesNotMatch(r.text, /SDD_RESEARCH_ORPHAN/);
      assert.match(r.text, /SDD_RESEARCH_UNREGISTERED/);
      assert.match(r.text, /cli\.spec\.md/);
      assert.strictEqual(r.exitCode, 0, 'unregistered is warn-only — must not fail the gate');
    });

    it("--all does not flag SDD_RESEARCH_UNREGISTERED once the research doc has a row in the scope spec's ## Research section", async () => {
      const root = join(dir, 'research-registered-proj');
      const scopeDir = join(root, 'specs', 'demo');
      mkdirSync(join(scopeDir, 'research'), { recursive: true });
      writeFileSync(
        join(scopeDir, 'demo.spec.md'),
        [
          '# demo: Scope Specification',
          '',
          '<!--SECTION:SCOPE_TYPE-->',
          '## scope-type',
          'product',
          '<!--/SECTION:SCOPE_TYPE-->',
          '',
          '<!--SECTION:RESEARCH-->',
          '## Research',
          '| Документ | Что ресёрчили | Что дал для спеки |',
          '|---|---|---|',
          '| [2026-01-01-x](./research/2026-01-01-x.research.md) | topic | decision |',
          '<!--/SECTION:RESEARCH-->',
        ].join('\n'),
        'utf-8'
      );
      writeFileSync(
        join(scopeDir, 'research', '2026-01-01-x.research.md'),
        '# Research: x\n',
        'utf-8'
      );

      const r = await mod.run(argv('--all', root));
      assert.doesNotMatch(r.text, /SDD_RESEARCH_ORPHAN/);
      assert.doesNotMatch(r.text, /SDD_RESEARCH_UNREGISTERED/);
    });
  });

  describe('RULES_CASCADE dependency evidence is fail-closed', () => {
    const cascadeTicket = (rulePaths: string | string[]): string =>
      [
        '<!--SECTION:META-->',
        '- **Task-ID:** RULE-evidence',
        '- **Status:** [ ] TODO',
        '<!--/SECTION:META-->',
        '<!--SECTION:PHASES_OVERVIEW-->',
        '| ID | Kind | Deps | Status |',
        '|---|---|---|---|',
        '| P1 | impl | — | [ ] |',
        '<!--/SECTION:PHASES_OVERVIEW-->',
        '<!--SECTION:PHASE_P1-->',
        '- **Rules:**',
        ...(Array.isArray(rulePaths) ? rulePaths : [rulePaths]).map(
          (rulePath) => `  - [rule](${rulePath})`
        ),
        '<!--/SECTION:PHASE_P1-->',
        '<!--SECTION:EXECUTION_LOG-->',
        '- pending',
        '<!--/SECTION:EXECUTION_LOG-->',
      ].join('\n');

    const unsafeRuleFixture = (
      name: string
    ): { parent: string; root: string; external: string } => {
      const parent = mkdtempSync(join(tmpdir(), `sdd-check-rule-${name}-`));
      const root = join(parent, 'repo');
      const external = join(parent, 'external.xml');
      mkdirSync(join(root, 'rules'), { recursive: true });
      writeFileSync(external, '<DependsOn>\n  - external-was-read.xml\n</DependsOn>\n');
      return { parent, root, external };
    };

    it('a readable rule with no DependsOn is a genuine leaf, not a read failure', async () => {
      const root = mkdtempSync(join(tmpdir(), 'sdd-check-rule-leaf-'));
      mkdirSync(join(root, 'rules'));
      writeFileSync(join(root, 'rules', 'leaf.xml'), '<Rule>leaf</Rule>\n');
      writeFileSync(join(root, 'ticket.md'), cascadeTicket('rules/leaf.xml'));
      try {
        const result = await mod.run(argv('--task', 'ticket.md'), root);
        assert.doesNotMatch(result.text, /ERR_CLI_SDD_CHECK_READ_FAILED/);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

    it('ordinary local direct and transitive rules remain valid evidence', async () => {
      const root = mkdtempSync(join(tmpdir(), 'sdd-check-rule-local-'));
      mkdirSync(join(root, 'rules'));
      writeFileSync(
        join(root, 'rules', 'root.xml'),
        '<DependsOn>\n  - rules/leaf.xml\n</DependsOn>\n'
      );
      writeFileSync(join(root, 'rules', 'leaf.xml'), '<Rule>leaf</Rule>\n');
      writeFileSync(join(root, 'ticket.md'), cascadeTicket(['rules/root.xml', 'rules/leaf.xml']));
      try {
        const result = await mod.run(argv('--task', 'ticket.md'), root);
        assert.strictEqual(result.exitCode, 0, result.text);
        assert.doesNotMatch(result.text, /ERR_CLI_SDD_CHECK_READ_FAILED/);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

    it('does not reuse a trusted rule identity across separate command invocations', async () => {
      const { parent, root, external } = unsafeRuleFixture('identity-replaced');
      const rule = join(root, 'rules', 'replaceable.xml');
      writeFileSync(rule, '<Rule>local</Rule>\n');
      writeFileSync(join(root, 'ticket.md'), cascadeTicket('rules/replaceable.xml'));
      try {
        const first = await mod.run(argv('--task', 'ticket.md'), root);
        assert.strictEqual(first.exitCode, 0, first.text);
        rmSync(rule);
        symlinkSync(external, rule);
        const second = await mod.run(argv('--task', 'ticket.md'), root);
        assert.strictEqual(second.exitCode, 1, second.text);
        assert.match(second.text, /ERR_CLI_SDD_CHECK_READ_FAILED/);
        assert.match(second.text, /symlink component/);
        assert.doesNotMatch(second.text, /external-was-read/);
      } finally {
        rmSync(parent, { recursive: true, force: true });
      }
    });

    for (const scenario of ['symlink', 'absolute', 'traversal'] as const) {
      it(`rejects a direct ${scenario} rule before its bytes are trusted`, async () => {
        const { parent, root, external } = unsafeRuleFixture(`direct-${scenario}`);
        const link =
          scenario === 'symlink'
            ? 'rules/link.xml'
            : scenario === 'absolute'
              ? external
              : '../external.xml';
        if (scenario === 'symlink') symlinkSync(external, join(root, link));
        writeFileSync(join(root, 'ticket.md'), cascadeTicket(link));
        try {
          const result = await mod.run(argv('--task', 'ticket.md'), root);
          assert.strictEqual(result.exitCode, 1, result.text);
          assert.match(result.text, /ERR_CLI_SDD_CHECK_READ_FAILED/);
          assert.match(
            result.text,
            scenario === 'symlink'
              ? /symlink component/
              : scenario === 'absolute'
                ? /absolute paths are forbidden/
                : /`\.\.` path segments are forbidden/
          );
          assert.doesNotMatch(result.text, /external-was-read/);
          assert.doesNotMatch(result.text, /✅ clean/);
        } finally {
          rmSync(parent, { recursive: true, force: true });
        }
      });

      it(`rejects a transitive ${scenario} rule before its bytes are trusted`, async () => {
        const { parent, root, external } = unsafeRuleFixture(`transitive-${scenario}`);
        const dependency =
          scenario === 'symlink'
            ? 'rules/link.xml'
            : scenario === 'absolute'
              ? external
              : '../external.xml';
        if (scenario === 'symlink') symlinkSync(external, join(root, dependency));
        writeFileSync(
          join(root, 'rules', 'root.xml'),
          `<DependsOn>\n  - ${dependency}\n</DependsOn>\n`
        );
        writeFileSync(join(root, 'ticket.md'), cascadeTicket('rules/root.xml'));
        try {
          const result = await mod.run(argv('--task', 'ticket.md'), root);
          assert.strictEqual(result.exitCode, 1, result.text);
          assert.match(result.text, /ERR_CLI_SDD_CHECK_READ_FAILED/);
          assert.match(
            result.text,
            scenario === 'symlink'
              ? /symlink component/
              : scenario === 'absolute'
                ? /absolute paths are forbidden/
                : /`\.\.` path segments are forbidden/
          );
          assert.doesNotMatch(result.text, /external-was-read/);
          assert.doesNotMatch(result.text, /✅ clean/);
        } finally {
          rmSync(parent, { recursive: true, force: true });
        }
      });
    }

    it('an unreadable exact rule remains nonzero and names the failed rule', async (context) => {
      const root = mkdtempSync(join(tmpdir(), 'sdd-check-rule-unreadable-'));
      mkdirSync(join(root, 'rules'));
      const rule = join(root, 'rules', 'blocked.xml');
      writeFileSync(rule, '<Rule>blocked</Rule>\n');
      writeFileSync(join(root, 'ticket.md'), cascadeTicket('rules/blocked.xml'));
      if (!denyRead(context, rule, 'file')) {
        rmSync(root, { recursive: true, force: true });
        return;
      }
      try {
        const result = await mod.run(argv('--task', 'ticket.md'), root);
        assert.strictEqual(result.exitCode, 1, result.text);
        assert.match(result.text, /ERR_CLI_SDD_CHECK_READ_FAILED/);
        assert.match(result.text, /rules\/blocked\.xml/);
        assert.match(result.text, /rule 'rules\/blocked\.xml' dependency evidence is unreadable/);
        assert.doesNotMatch(result.text, /✅ clean/);
      } finally {
        chmodSync(rule, 0o600);
        rmSync(root, { recursive: true, force: true });
      }
    });
  });
});
