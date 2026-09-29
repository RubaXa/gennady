// @file: Live-CLI behavior of the sdd-verify facade and its explicit read-only compatibility mode.
// @spec: CLI
// @consumers: N/A

import { describe, it, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  chmodSync,
  statSync,
  readFileSync,
  symlinkSync,
  mkdtempSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildRepoFixture as buildBaseRepoFixture, type RepoFixtureState } from './fixture.ts';
import { cleanTestChildEnv, runCliAsync } from './run-cli.ts';
import { parsePhaseReceipts } from '../../../shared/sdd/phase-receipt.ts';
import { installCapabilityProviderFixtures } from './capability-provider-fixture.ts';

function installExecutable(root: string, name: string, body: string): void {
  const binDir = join(root, 'node_modules', '.bin');
  mkdirSync(binDir, { recursive: true });
  const path = join(binDir, name);
  writeFileSync(path, `#!/usr/bin/env node\n${body}\n`, 'utf-8');
  chmodSync(path, 0o755);
}

function installRepoRunner(root: string, name: string, body: string): string {
  const relative = `scripts/gates/${name}.mjs`;
  const path = join(root, relative);
  mkdirSync(join(root, 'scripts', 'gates'), { recursive: true });
  writeFileSync(
    path,
    `import { createRequire } from 'node:module'; const require = createRequire(import.meta.url); ${body}\n`,
    'utf-8'
  );
  return `node ${relative}`;
}

const FIXTURE_RUNNERS = {
  'scripts/gates/pass.mjs': "import { readFileSync } from 'node:fs'; readFileSync('package.json');",
  'scripts/gates/fail.mjs': 'process.exit(1);',
  'scripts/gates/coverage.mjs':
    "import { mkdirSync, writeFileSync } from 'node:fs'; mkdirSync('coverage',{recursive:true}); writeFileSync('coverage/coverage-final.json','{}');",
  'scripts/gates/no-coverage.mjs': 'process.exit(0);',
  'scripts/gates/masked-failure.mjs': 'process.exit(1);',
  'scripts/gates/repair-check.mjs':
    "import { readFileSync } from 'node:fs'; process.exit(readFileSync('src.ts','utf8')==='fixed'?0:1);",
  'scripts/gates/format-fix-marker.mjs':
    "import { writeFileSync } from 'node:fs'; writeFileSync('FORMAT_FIX_RAN','x');",
  'scripts/gates/mutating-lint.mjs':
    "import { writeFileSync } from 'node:fs'; writeFileSync('src.ts','mutated by lint');",
} satisfies Record<string, string>;

function buildRepoFixture(state: RepoFixtureState = {}): { root: string } {
  return buildBaseRepoFixture({
    ...state,
    // Coverage is a generated adapter artifact. D-STACK-017 permits ignored output to survive;
    // non-ignored project content remains an exact gate mutation and is rolled back.
    files: { '.gitignore': 'coverage\n', ...FIXTURE_RUNNERS, ...state.files },
  });
}

const PASS_SCRIPT = 'node scripts/gates/pass.mjs';
const FAIL_SCRIPT = 'node scripts/gates/fail.mjs';
const COVERAGE_SCRIPT = 'node scripts/gates/coverage.mjs';
const NO_COVERAGE_SCRIPT = 'node scripts/gates/no-coverage.mjs';

function setPackageScripts(root: string, next: Record<string, string>): void {
  const packagePath = join(root, 'package.json');
  const pkg = JSON.parse(readFileSync(packagePath, 'utf-8')) as {
    scripts?: Record<string, string>;
  };
  pkg.scripts = { ...(pkg.scripts ?? {}), ...next };
  writeFileSync(packagePath, JSON.stringify(pkg, null, 2), 'utf-8');
}

function installRepairTools(
  root: string,
  formatterBody = 'process.exit(0)',
  linterBody = 'process.exit(0)'
): void {
  for (const [name, body] of [
    ['prettier', formatterBody],
    ['gennady', linterBody],
  ]) {
    installExecutable(root, name, body);
  }
}

function installPhaseTicket(
  root: string,
  kind: string,
  targets: string[],
  coveragePolicy?: 'required' | 'not-applicable',
  deletedFiles: string[] = []
): string[] {
  const packagePath = join(root, 'package.json');
  if (existsSync(packagePath)) {
    const pkg = JSON.parse(readFileSync(packagePath, 'utf-8')) as {
      scripts?: Record<string, string>;
    };
    const scripts = (pkg.scripts ??= {});
    scripts['test:coverage'] ??= COVERAGE_SCRIPT;
    scripts.format ??= PASS_SCRIPT;
    scripts.lint ??= 'gennady lint';
    if (scripts['format:fix'] && scripts['lint:fix'])
      scripts.fix ??= 'npm run format:fix -- . && npm run lint:fix -- .';
    writeFileSync(packagePath, JSON.stringify(pkg, null, 2));
  }
  const dir = join(root, 'specs', 'app');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'app.spec.md'), '# App\n', 'utf-8');
  const ticket = join(dir, 'app.task.TSK-1.md');
  writeFileSync(
    ticket,
    [
      '<!--SECTION:META-->',
      '- **Task-ID:** TSK-1',
      '- **Status:** [ ] TODO',
      '<!--/SECTION:META-->',
      '<!--SECTION:PHASES_OVERVIEW-->',
      '| ID | Kind | Deps | Status |',
      '|---|---|---|---|',
      `| P1 | ${kind} | — | [ ] |`,
      '<!--/SECTION:PHASES_OVERVIEW-->',
      '<!--SECTION:PHASE_P1-->',
      ...(coveragePolicy === 'required' ? ['- **Rules:**', '  - [Coverage](TEST-RULE)'] : []),
      '- **Target Files:**',
      ...targets.map((target) => `  - ${target}`),
      '- **Deleted Files:**',
      ...(deletedFiles.length > 0 ? deletedFiles.map((target) => `  - ${target}`) : ['  - none']),
      '<!--/SECTION:PHASE_P1-->',
      '<!--SECTION:VERIFICATION-->',
      ...(coveragePolicy
        ? [
            '<!--COVERAGE_POLICY:v1-->',
            `- **Coverage Policy:** ${coveragePolicy}`,
            ...(coveragePolicy === 'not-applicable'
              ? ['- **Coverage Reason:** assertion-only test; coverage is not meaningful']
              : ['- **Coverage Owner Phase:** P1']),
          ]
        : []),
      '| Command | Required by | Role |',
      '|---|---|---|',
      ...(coveragePolicy === 'required'
        ? ['| custom coverage reader | TEST-RULE | coverage |']
        : []),
      '<!--/SECTION:VERIFICATION-->',
      '<!--SECTION:EXECUTION_LOG-->',
      '## Execution Log',
      '<!--/SECTION:EXECUTION_LOG-->',
    ].join('\n'),
    'utf-8'
  );
  return ['sdd-verify', '--task', 'specs/app/app.task.TSK-1.md', '--phase', 'P1'];
}

/** @purpose Install a runnable phase ticket backed by the shared canonical compiler fixture. */
function installPhaseTicketWithCompilerProvider(
  root: string,
  kind: string,
  targets: string[],
  coveragePolicy?: 'required' | 'not-applicable',
  deletedFiles: string[] = []
): string[] {
  const args = installPhaseTicket(root, kind, targets, coveragePolicy, deletedFiles);
  installCapabilityProviderFixtures(root, 'specs/app/app.task.TSK-1.md');
  return args;
}

const REPAIR_BRICKS = {
  'format:fix': 'prettier --write',
  'lint:fix': 'gennady lint --autofix',
};
/** @purpose Observe a gate subprocess without mutating the fixture workspace guarded by sdd-verify. */
function externalRunMarker(
  t: TestContext,
  root: string,
  name: string,
  exitCode = 0
): { path: string; script: string } {
  const dir = mkdtempSync(join(tmpdir(), 'gennady-sdd-verify-observer-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, name);
  const runnerRelative = `scripts/gates/observe-${name.toLowerCase()}.mjs`;
  const runner = join(root, runnerRelative);
  mkdirSync(join(root, 'scripts', 'gates'), { recursive: true });
  writeFileSync(
    runner,
    `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(path)},'x'); process.exit(${exitCode});`,
    'utf-8'
  );
  return {
    path,
    script: `node ${runnerRelative}`,
  };
}

// Every scenario owns a distinct buildRepoFixture root; external observation files are likewise
// owned by that test through t.after. Four concurrent scenarios shorten the real-CLI critical path
// without reducing black-box launches. Keep the bound explicit: unbounded subprocess fan-out makes
// timing and coverage I/O unstable on smaller CI hosts.
describe('sdd-verify — live gate ladder', { concurrency: 4 }, () => {
  it('classifies bad argv as exit 4 and an invalid phase context as gate failure exit 1', async () => {
    const { root } = buildRepoFixture({ scripts: {} });
    try {
      const badArgv = await runCliAsync(['sdd-verify', '--profile'], root);
      assert.strictEqual(badArgv.exitCode, 4, badArgv.stdout + badArgv.stderr);
      assert.match(badArgv.stderr, /ERR_CLI_SDD_VERIFY_BAD_INVOCATION/);
      assert.match(badArgv.stderr, /usage: npx gennady sdd-verify/);

      const badContext = await runCliAsync(
        ['sdd-verify', '--task', 'missing.task.md', '--phase', 'P1'],
        root
      );
      assert.strictEqual(badContext.exitCode, 1, badContext.stdout + badContext.stderr);
      assert.match(badContext.stderr, /ERR_CLI_SDD_VERIFY_PHASE_CONTEXT/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('keeps root c8 ownership local with the explicit empty child sentinel', () => {
    const source = {
      NODE_V8_COVERAGE: '/tmp/root-c8-owner',
      NODE_TEST_CONTEXT: 'child-v8',
      GIT_DIR: '/tmp/real-repo/.git',
      PATH: '/usr/bin',
    };

    const child = cleanTestChildEnv(source);

    assert.strictEqual(child.NODE_V8_COVERAGE, '');
    assert.strictEqual(child.NODE_TEST_CONTEXT, undefined);
    assert.strictEqual(child.GIT_DIR, undefined);
    assert.strictEqual(child.PATH, '/usr/bin');
    assert.strictEqual(child.GENNADY_NO_UPDATE_CHECK, '1');
    assert.strictEqual(source.NODE_V8_COVERAGE, '/tmp/root-c8-owner', 'parent env stays untouched');
  });

  it('routes task/phase through the universal Verify engine and persists facade evidence', async () => {
    const { root } = buildRepoFixture({
      embeddedRules: true,
      scripts: {
        ...REPAIR_BRICKS,
        'type-check': PASS_SCRIPT,
        lint: 'gennady lint',
        format: PASS_SCRIPT,
      },
      files: { 'src.ts': 'export const value = 1;\n' },
    });
    try {
      installRepairTools(root);
      const result = await runCliAsync(
        installPhaseTicketWithCompilerProvider(root, 'impl', ['src.ts']),
        root
      );
      assert.strictEqual(result.exitCode, 0, result.stdout + result.stderr);
      const ticket = readFileSync(join(root, 'specs/app/app.task.TSK-1.md'), 'utf8');
      assert.match(ticket, /SDD_VERIFY_EVIDENCE:/);
      assert.match(ticket, /\*\*PASS\*\*/);
      assert.doesNotMatch(ticket, /SDD_PHASE_RECEIPT:P1/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('--profile full never mutates: format:fix is not in the ladder, marker absent, exit 0 when the rest is green', async () => {
    const { root } = buildRepoFixture({
      scripts: {
        ...REPAIR_BRICKS,
        'type-check': PASS_SCRIPT,
        'test:coverage': COVERAGE_SCRIPT,
        lint: PASS_SCRIPT,
        format: PASS_SCRIPT,
        'format:fix': 'node scripts/gates/format-fix-marker.mjs',
      },
      gennadyInstalled: true,
    });
    try {
      const r = await runCliAsync(['sdd-verify', '--profile', 'full'], root);
      assert.strictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /ALL PASS/);
      assert.ok(
        !existsSync(join(root, 'FORMAT_FIX_RAN')),
        'full profile must never run a mutating gate, even one declared in package.json'
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('--profile full fails when a nominally read-only lint script mutates project source', async () => {
    const { root } = buildRepoFixture({
      scripts: {
        'type-check': PASS_SCRIPT,
        'test:coverage': COVERAGE_SCRIPT,
        lint: 'node scripts/gates/mutating-lint.mjs',
        format: PASS_SCRIPT,
      },
      files: { 'src.ts': 'original\n' },
      gennadyInstalled: true,
    });
    try {
      const r = await runCliAsync(['sdd-verify', '--profile', 'full'], root);
      assert.notStrictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /gate mutated the tree/);
      assert.match(r.stdout, /src\.ts/);
      assert.strictEqual(
        readFileSync(join(root, 'src.ts'), 'utf-8'),
        'original\n',
        'guard restores the committed baseline before returning the violation'
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('--profile full, test:coverage exit 0 that writes a FRESH report passes (% threshold is testcov/audit territory)', async () => {
    const { root } = buildRepoFixture({
      scripts: {
        ...REPAIR_BRICKS,
        'type-check': PASS_SCRIPT,
        'test:coverage': COVERAGE_SCRIPT, // exits 0 AND writes coverage/coverage-final.json
        lint: PASS_SCRIPT,
        format: PASS_SCRIPT,
      },
      gennadyInstalled: true,
    });
    try {
      const r = await runCliAsync(['sdd-verify', '--profile', 'full'], root);
      assert.strictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /ALL PASS/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('--profile full, test:coverage exit 0 but writes NO report is RED — single-producer freshness (reviewer C2)', async () => {
    const { root } = buildRepoFixture({
      scripts: {
        'type-check': PASS_SCRIPT,
        'test:coverage': NO_COVERAGE_SCRIPT, // exits 0 without writing coverage/ — measured nothing
        lint: PASS_SCRIPT,
        format: PASS_SCRIPT,
      },
      gennadyInstalled: true,
    });
    try {
      const r = await runCliAsync(['sdd-verify', '--profile', 'full'], root);
      assert.notStrictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /❌ test:coverage/);
      assert.match(r.stdout, /не появился|не записал/);
      assert.match(r.stdout, /adapter=istanbul-js/);
      assert.match(r.stdout, /expected=coverage\/coverage-final\.json/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('coverage probe rejects a symlinked artifact tree without deleting the external report', async () => {
    const { root } = buildRepoFixture({
      scripts: {
        'type-check': PASS_SCRIPT,
        'test:coverage': NO_COVERAGE_SCRIPT,
        lint: PASS_SCRIPT,
        format: PASS_SCRIPT,
      },
      gennadyInstalled: true,
    });
    const outside = mkdtempSync(join(tmpdir(), 'sdd-verify-coverage-victim-'));
    const victim = join(outside, 'coverage-final.json');
    writeFileSync(victim, 'external-victim');
    symlinkSync(outside, join(root, 'coverage'), 'dir');
    try {
      const result = await runCliAsync(['sdd-verify', '--profile', 'full'], root);
      assert.notStrictEqual(result.exitCode, 0, result.stdout + result.stderr);
      assert.match(result.stdout, /coverage producer не запущен/);
      assert.match(result.stdout, /symlink component/);
      assert.strictEqual(readFileSync(victim, 'utf8'), 'external-victim');
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('FAIL-CLOSED: a stale report that cannot be deleted + a producer that writes nothing → RED (reviewer C2)', async (t) => {
    if (typeof process.getuid === 'function' && process.getuid() === 0) {
      t.skip('root bypasses directory permissions — read-only guard is unobservable');
      return;
    }
    const { root } = buildRepoFixture({
      scripts: {
        'type-check': PASS_SCRIPT,
        'test:coverage': NO_COVERAGE_SCRIPT, // exits 0, writes nothing
        lint: PASS_SCRIPT,
        format: PASS_SCRIPT,
      },
      gennadyInstalled: true,
    });
    const covDir = join(root, 'coverage');
    mkdirSync(covDir, { recursive: true });
    const covFile = join(covDir, 'coverage-final.json');
    writeFileSync(covFile, '{"stale":true}', 'utf-8');
    const staleMtime = statSync(covFile).mtimeMs;
    chmodSync(covDir, 0o555); // read-only dir → the probe's rm of the file inside FAILS
    try {
      const r = await runCliAsync(['sdd-verify', '--profile', 'full'], root);
      // The stale report survives clear, but its mtime is unchanged → not fresh → gate is RED.
      assert.notStrictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /❌ test:coverage/);
      assert.strictEqual(statSync(covFile).mtimeMs, staleMtime, 'stale report must be untouched');
    } finally {
      chmodSync(covDir, 0o755);
      rmSync(root, { recursive: true, force: true });
    }
  });
});
