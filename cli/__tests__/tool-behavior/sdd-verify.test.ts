// @file: Live-CLI behavior of sdd-verify's gate ladder — real `tsx cli/gennady.ts sdd-verify` runs
//   against fixture repos in every state the ladder must handle: bootstrap skips, repair-first
//   phases, halting failures, coverage freshness, and read-only full.
// @consumers: N/A
// @tasks: N/A

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
    files: { ...FIXTURE_RUNNERS, ...state.files },
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

  it('empty project bootstrap phase: every rung is honestly skipped, exit 0', async () => {
    const { root } = buildRepoFixture({ scripts: {} });
    try {
      const r = await runCliAsync(installPhaseTicket(root, 'bootstrap', ['package.json']), root);
      assert.strictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /ALL PASS \(0\/3\)/);
      for (const gate of ['fix', 'type-check', 'test']) {
        assert.match(
          r.stdout,
          new RegExp(`⏭ ${gate} — скрипта нет в package\\.json, пропущено`),
          `expected a skipped ⏭ line for ${gate}`
        );
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('a phase without Target Files or Deleted Files is rejected before foundation', async () => {
    const { root } = buildRepoFixture({
      scripts: { 'type-check': PASS_SCRIPT, test: PASS_SCRIPT },
    });
    try {
      const r = await runCliAsync(installPhaseTicket(root, 'impl', []), root);
      assert.notStrictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(r.stderr, /neither Target Files nor Deleted Files/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('verifies a tracked deletion-only phase and makes reappearance stale', async () => {
    const { root } = buildRepoFixture({
      scripts: {
        ...REPAIR_BRICKS,
        'type-check': PASS_SCRIPT,
        test: PASS_SCRIPT,
      },
      files: { 'src/obsolete.ts': 'old\n' },
    });
    try {
      installRepairTools(
        root,
        "require('fs').writeFileSync('FORMATTER_MUST_NOT_RUN','x')",
        "require('fs').writeFileSync('LINTER_MUST_NOT_RUN','x')"
      );
      rmSync(join(root, 'src/obsolete.ts'));
      const args = installPhaseTicket(root, 'impl', [], undefined, ['src/obsolete.ts']);
      const result = await runCliAsync(args, root);
      assert.strictEqual(result.exitCode, 0, result.stdout + result.stderr);
      assert.ok(!existsSync(join(root, 'FORMATTER_MUST_NOT_RUN')));
      assert.ok(!existsSync(join(root, 'LINTER_MUST_NOT_RUN')));
      const ticket = join(root, 'specs/app/app.task.TSK-1.md');
      let content = readFileSync(ticket, 'utf-8')
        .replace('| P1 | impl | — | [ ] |', '| P1 | impl | — | [x] |')
        .replace(
          '<!--SECTION:VERIFICATION-->',
          '<!--SECTION:VERIFICATION-->\n<!--PHASE_RECEIPTS:v1-->'
        );
      writeFileSync(ticket, content);
      assert.strictEqual(
        (await runCliAsync(['sdd-check', '--task', 'specs/app/app.task.TSK-1.md'], root)).exitCode,
        0
      );
      symlinkSync('missing-destination.ts', join(root, 'src/obsolete.ts'));
      const stale = await runCliAsync(['sdd-check', '--task', 'specs/app/app.task.TSK-1.md'], root);
      assert.match(stale.stdout, /SDD_PHASE_RECEIPT_STALE_TARGETS/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects a deletion tombstone that has no tracked VCS baseline', async () => {
    const { root } = buildRepoFixture({
      scripts: {
        ...REPAIR_BRICKS,
        'type-check': PASS_SCRIPT,
        test: PASS_SCRIPT,
      },
    });
    try {
      installRepairTools(root);
      const result = await runCliAsync(
        installPhaseTicket(root, 'impl', [], undefined, ['src/never-existed.ts']),
        root
      );
      assert.notStrictEqual(result.exitCode, 0, result.stdout + result.stderr);
      assert.match(result.stderr, /Deleted File has no tracked VCS baseline/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('code phase refuses incomplete readiness before tools or foundation can run', async (t) => {
    const { root } = buildRepoFixture({
      files: { 'src/owned.ts': 'owned' },
    });
    try {
      const typeCheck = externalRunMarker(t, root, 'TYPE_CHECK_RAN');
      const testGate = externalRunMarker(t, root, 'TEST_RAN');
      setPackageScripts(root, { 'type-check': typeCheck.script, test: testGate.script });
      const r = await runCliAsync(installPhaseTicket(root, 'impl', ['src/owned.ts']), root);
      assert.notStrictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(r.stderr, /portal\/GATE_QUEUE cannot be resolved/);
      assert.ok(!existsSync(typeCheck.path));
      assert.ok(!existsSync(testGate.path));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('code phase refuses provisional repair bricks before tools or foundation can run', async (t) => {
    const { root } = buildRepoFixture({
      scripts: {
        'format:fix': "echo 'TODO formatter'",
        'lint:fix': 'gennady lint --autofix',
      },
      files: { 'src/owned.ts': 'owned' },
    });
    try {
      const typeCheck = externalRunMarker(t, root, 'TYPE_CHECK_RAN');
      const testGate = externalRunMarker(t, root, 'TEST_RAN');
      setPackageScripts(root, { 'type-check': typeCheck.script, test: testGate.script });
      installRepairTools(root);
      const r = await runCliAsync(installPhaseTicket(root, 'impl', ['src/owned.ts']), root);
      assert.notStrictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(r.stderr, /portal\/GATE_QUEUE cannot be resolved/);
      assert.ok(!existsSync(typeCheck.path));
      assert.ok(!existsSync(testGate.path));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('exact-target repair touches only the target; unrelated production and negative tests stay untouched', async () => {
    const { root } = buildRepoFixture({
      scripts: {
        ...REPAIR_BRICKS,
        'format:fix': 'node scripts/gates/alternative-formatter.mjs --write',
        'type-check': PASS_SCRIPT,
        test: PASS_SCRIPT,
      },
      files: {
        'src/target.ts': 'export const target=1;\n',
        'src/unrelated.ts': 'export const unrelated=1;\n',
        'src/__tests__/negative.test.ts': 'intentionally invalid fixture',
      },
    });
    try {
      installRepairTools(root, "require('fs').writeFileSync('PRETTIER_RAN','yes')");
      installRepoRunner(
        root,
        'alternative-formatter',
        "require('fs').appendFileSync(process.argv.at(-1),'// repaired\\n')"
      );
      const r = await runCliAsync(installPhaseTicket(root, 'impl', ['src/target.ts']), root);
      assert.strictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(readFileSync(join(root, 'src/target.ts'), 'utf-8'), /repaired/);
      assert.ok(!existsSync(join(root, 'PRETTIER_RAN')), 'hardcoded prettier must not run');
      assert.strictEqual(
        readFileSync(join(root, 'src/unrelated.ts'), 'utf-8'),
        'export const unrelated=1;\n'
      );
      assert.strictEqual(
        readFileSync(join(root, 'src/__tests__/negative.test.ts'), 'utf-8'),
        'intentionally invalid fixture'
      );
      const ticket = join(root, 'specs/app/app.task.TSK-1.md');
      const evidenced = readFileSync(ticket, 'utf-8');
      assert.match(evidenced, /SDD_PHASE_RECEIPT:P1/);
      writeFileSync(
        ticket,
        evidenced
          .replace('| P1 | impl | — | [ ] |', '| P1 | impl | — | [x] |')
          .replace(
            '<!--SECTION:VERIFICATION-->',
            '<!--SECTION:VERIFICATION-->\n<!--PHASE_RECEIPTS:v1-->'
          )
      );
      const current = await runCliAsync(
        ['sdd-check', '--task', 'specs/app/app.task.TSK-1.md'],
        root
      );
      assert.doesNotMatch(current.stdout, /SDD_PHASE_RECEIPT_(?:MISSING|INVALID|STALE|INCOMPLETE)/);
      writeFileSync(join(root, 'src/target.ts'), 'changed after verification\n');
      const staleTask = await runCliAsync(
        ['sdd-check', '--task', 'specs/app/app.task.TSK-1.md'],
        root
      );
      assert.match(staleTask.stdout, /SDD_PHASE_RECEIPT_STALE_TARGETS/);
      const staleAll = await runCliAsync(['sdd-check', '--all', '.'], root);
      assert.match(staleAll.stdout, /SDD_PHASE_RECEIPT_STALE_TARGETS/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('runtime write-zone rejects a baked exact operand outside Target Files and leaves evidence invalidated', async (t) => {
    const { root } = buildRepoFixture({
      scripts: {
        ...REPAIR_BRICKS,
        'format:fix': 'node scripts/gates/alternative-formatter.mjs src/unrelated.ts --write',
      },
      files: {
        'src/target.ts': 'target\n',
        'src/unrelated.ts': 'unrelated\n',
      },
    });
    try {
      const typeCheck = externalRunMarker(t, root, 'TYPE_CHECK_RAN');
      const testGate = externalRunMarker(t, root, 'TEST_RAN');
      setPackageScripts(root, { 'type-check': typeCheck.script, test: testGate.script });
      installRepairTools(root);
      installRepoRunner(
        root,
        'alternative-formatter',
        "require('fs').appendFileSync(process.argv.at(-1),'first repair\\n')"
      );
      const args = installPhaseTicket(root, 'impl', ['src/target.ts']);
      const ticket = join(root, 'specs/app/app.task.TSK-1.md');
      const first = await runCliAsync(args, root);
      assert.strictEqual(first.exitCode, 0, first.stdout + first.stderr);
      assert.match(readFileSync(ticket, 'utf-8'), /SDD_PHASE_RECEIPT:P1/);
      rmSync(typeCheck.path);
      rmSync(testGate.path);

      installRepoRunner(
        root,
        'alternative-formatter',
        [
          "require('fs').appendFileSync('src/unrelated.ts','outside mutation\\n')",
          "require('fs').appendFileSync(process.argv.at(-1),'target repair\\n')",
        ].join(';')
      );

      const rejected = await runCliAsync(args, root);
      assert.notStrictEqual(rejected.exitCode, 0, rejected.stdout + rejected.stderr);
      assert.match(rejected.stdout, /repair mutated paths outside its permitted write-set/);
      assert.match(rejected.stdout, /src\/unrelated\.ts/);
      assert.match(readFileSync(join(root, 'src/unrelated.ts'), 'utf-8'), /outside mutation/);
      assert.ok(!existsSync(typeCheck.path), 'foundation must not run');
      assert.ok(!existsSync(testGate.path), 'foundation must not run');
      assert.deepStrictEqual(parsePhaseReceipts(readFileSync(ticket, 'utf-8')), {
        ok: true,
        receipts: [],
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('runs an applicable ticket Verification command once and records it in the CLI receipt', async () => {
    const { root } = buildRepoFixture({
      scripts: { ...REPAIR_BRICKS, 'type-check': PASS_SCRIPT, test: PASS_SCRIPT },
      files: {
        'src/owned.ts': 'owned',
        'scripts/check.mjs': "process.stdout.write('EXTRA_ONCE')",
      },
    });
    try {
      installRepairTools(root);
      const args = installPhaseTicket(root, 'impl', ['src/owned.ts']);
      const ticket = join(root, 'specs/app/app.task.TSK-1.md');
      const command = 'node scripts/check.mjs';
      const original = readFileSync(ticket, 'utf-8');
      assert.match(original, /- \*\*Target Files:\*\*/);
      writeFileSync(
        ticket,
        original
          .replace(
            '- **Target Files:**',
            '- **Rules:**\n  - [Contract](ai/directives/contract-rule.xml)\n- **Target Files:**'
          )
          .replace(
            '<!--/SECTION:VERIFICATION-->',
            `| ${command} | contract-rule | extra |\n<!--/SECTION:VERIFICATION-->`
          ),
        'utf-8'
      );
      const result = await runCliAsync(args, root);
      assert.strictEqual(result.exitCode, 0, result.stdout + result.stderr);
      const receipt = readFileSync(ticket, 'utf-8');
      assert.match(receipt, /"gate": "verification"/);
      assert.match(receipt, /"role": "extra"/);
      const parsed = parsePhaseReceipts(receipt);
      assert.strictEqual(parsed.ok, true);
      if (parsed.ok) {
        assert.strictEqual(parsed.receipts[0]?.verification[0]?.command, command);
        assert.strictEqual(
          parsed.receipts[0]?.commands.filter((entry) => entry.command === command).length,
          1,
          'the exact ticket command executes once'
        );
      }
      writeFileSync(join(root, 'scripts/check.mjs'), "process.stdout.write('CHANGED')");
      const stale = await runCliAsync(['sdd-check', '--task', 'specs/app/app.task.TSK-1.md'], root);
      assert.notStrictEqual(stale.exitCode, 0, stale.stdout + stale.stderr);
      assert.match(stale.stdout, /SDD_PHASE_RECEIPT_STALE_PLAN/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects an inline §5 command before execution because its local reads cannot be fingerprinted', async () => {
    const { root } = buildRepoFixture({
      scripts: { ...REPAIR_BRICKS, 'type-check': PASS_SCRIPT, test: PASS_SCRIPT },
      files: { 'src/owned.ts': 'owned' },
    });
    try {
      installRepairTools(root);
      const args = installPhaseTicket(root, 'impl', ['src/owned.ts']);
      const ticket = join(root, 'specs/app/app.task.TSK-1.md');
      const original = readFileSync(ticket, 'utf-8');
      writeFileSync(
        ticket,
        original
          .replace(
            '- **Target Files:**',
            '- **Rules:**\n  - [Contract](ai/directives/contract-rule.xml)\n- **Target Files:**'
          )
          .replace(
            '<!--/SECTION:VERIFICATION-->',
            `| node -e "require('fs').writeFileSync('src/owned.ts','changed by extra')" | contract-rule | extra |\n<!--/SECTION:VERIFICATION-->`
          )
      );
      const result = await runCliAsync(args, root);
      const diagnostic = result.stdout + result.stderr;
      assert.notStrictEqual(result.exitCode, 0, result.stdout + result.stderr);
      assert.match(diagnostic, /ERR_CLI_SDD_VERIFY_RECEIPT/);
      assert.match(diagnostic, /node inline\/module execution is unsupported/);
      assert.strictEqual(
        readFileSync(join(root, 'src/owned.ts'), 'utf-8'),
        'owned',
        'unsupported inline code must never execute'
      );
      assert.deepStrictEqual(parsePhaseReceipts(readFileSync(ticket, 'utf-8')), {
        ok: true,
        receipts: [],
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('an exact test Target File is linted, while an unrelated negative test cannot block the phase', async () => {
    const { root } = buildRepoFixture({
      scripts: { ...REPAIR_BRICKS, 'type-check': PASS_SCRIPT, test: PASS_SCRIPT },
      files: {
        'src/owned.test.ts': 'bad owned test',
        'src/__tests__/unrelated-negative.test.ts': 'bad unrelated fixture',
      },
    });
    try {
      installRepairTools(
        root,
        'process.exit(0)',
        "process.exit(process.argv.includes('src/owned.test.ts') ? 9 : 0)"
      );
      const owned = await runCliAsync(
        installPhaseTicket(root, 'impl', ['src/owned.test.ts']),
        root
      );
      assert.notStrictEqual(owned.exitCode, 0, owned.stdout + owned.stderr);
      assert.match(owned.stdout, /лестница остановлена на «fix»/);

      writeFileSync(join(root, 'src/clean.ts'), 'clean', 'utf-8');
      const clean = await runCliAsync(installPhaseTicket(root, 'impl', ['src/clean.ts']), root);
      assert.strictEqual(clean.exitCode, 0, clean.stdout + clean.stderr);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('an explicit N/A test phase runs ordinary tests once and never invents a coverage producer', async (t) => {
    const { root } = buildRepoFixture({
      scripts: { ...REPAIR_BRICKS },
      files: { 'src/assertion.test.ts': 'assertion only' },
    });
    try {
      const typeCheck = externalRunMarker(t, root, 'TYPE_CHECK_RAN');
      const testGate = externalRunMarker(t, root, 'TEST_RAN');
      const coverageGate = externalRunMarker(t, root, 'COVERAGE_RAN');
      setPackageScripts(root, {
        'type-check': typeCheck.script,
        test: testGate.script,
        'test:coverage': coverageGate.script,
      });
      installRepairTools(root);
      const r = await runCliAsync(
        installPhaseTicket(root, 'test', ['src/assertion.test.ts'], 'not-applicable'),
        root
      );
      assert.strictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.ok(existsSync(typeCheck.path));
      assert.ok(existsSync(testGate.path));
      assert.ok(!existsSync(coverageGate.path));
      assert.match(r.stdout, /✅ test\b/);
      assert.doesNotMatch(r.stdout, /test:coverage/);
      const parsed = parsePhaseReceipts(
        readFileSync(join(root, 'specs/app/app.task.TSK-1.md'), 'utf-8')
      );
      assert.strictEqual(parsed.ok, true);
      if (parsed.ok) {
        assert.strictEqual(parsed.receipts[0]?.profile, 'test');
        assert.strictEqual(parsed.receipts[0]?.producesCoverage, false);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('with two test phases only the declared owner produces and reads coverage', async (t) => {
    const { root } = buildRepoFixture({
      scripts: {
        ...REPAIR_BRICKS,
        'type-check': PASS_SCRIPT,
      },
      files: { 'src/one.test.ts': 'one', 'src/two.test.ts': 'two' },
    });
    try {
      const testGate = externalRunMarker(t, root, 'TEST_RAN');
      const coverageGate = externalRunMarker(t, root, 'COVERAGE_RAN');
      setPackageScripts(root, {
        test: testGate.script,
        'test:coverage': `${COVERAGE_SCRIPT} && ${coverageGate.script}`,
      });
      installRepairTools(root);
      installPhaseTicket(root, 'test', ['src/one.test.ts'], 'required');
      const ticket = join(root, 'specs/app/app.task.TSK-1.md');
      const current = readFileSync(ticket, 'utf-8');
      const readerMarker = externalRunMarker(t, root, 'READER_RAN');
      const reader = readerMarker.script;
      writeFileSync(
        ticket,
        current
          .replace('| P1 | test | — | [ ] |', '| P1 | test | — | [ ] |\n| P2 | test | P1 | [ ] |')
          .replace(
            '<!--/SECTION:PHASE_P1-->',
            '<!--/SECTION:PHASE_P1-->\n<!--SECTION:PHASE_P2-->\n- **Rules:**\n  - [Coverage](TEST-RULE)\n- **Target Files:**\n  - src/two.test.ts\n<!--/SECTION:PHASE_P2-->'
          )
          .replace('- **Coverage Owner Phase:** P1', '- **Coverage Owner Phase:** P2')
          .replace('custom coverage reader', reader),
        'utf-8'
      );

      const nonOwner = await runCliAsync(
        ['sdd-verify', '--task', 'specs/app/app.task.TSK-1.md', '--phase', 'P1'],
        root
      );
      assert.strictEqual(nonOwner.exitCode, 0, nonOwner.stdout + nonOwner.stderr);
      assert.ok(existsSync(testGate.path));
      assert.ok(!existsSync(coverageGate.path));
      assert.ok(!existsSync(readerMarker.path));
      const nonOwnerReceipt = parsePhaseReceipts(readFileSync(ticket, 'utf-8'));
      assert.strictEqual(nonOwnerReceipt.ok, true);
      if (nonOwnerReceipt.ok) {
        assert.strictEqual(nonOwnerReceipt.receipts[0]?.profile, 'test');
        assert.strictEqual(nonOwnerReceipt.receipts[0]?.producesCoverage, false);
      }
      rmSync(testGate.path);
      writeFileSync(
        ticket,
        readFileSync(ticket, 'utf-8').replace('| P1 | test | — | [ ] |', '| P1 | test | — | [x] |'),
        'utf-8'
      );

      const owner = await runCliAsync(
        ['sdd-verify', '--task', 'specs/app/app.task.TSK-1.md', '--phase', 'P2'],
        root
      );
      assert.strictEqual(owner.exitCode, 0, owner.stdout + owner.stderr);
      assert.ok(!existsSync(testGate.path));
      assert.ok(existsSync(coverageGate.path));
      assert.ok(existsSync(readerMarker.path));
      const ownerReceipt = parsePhaseReceipts(readFileSync(ticket, 'utf-8'));
      assert.strictEqual(ownerReceipt.ok, true);
      if (ownerReceipt.ok) {
        const p2 = ownerReceipt.receipts.find((receipt) => receipt.phase === 'P2');
        assert.strictEqual(p2?.profile, 'test');
        assert.strictEqual(p2?.producesCoverage, true);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('broken types in a code phase: fix runs first, then ladder halts at type-check', async () => {
    const { root } = buildRepoFixture({
      scripts: {
        ...REPAIR_BRICKS,
        'type-check': FAIL_SCRIPT,
        test: PASS_SCRIPT,
      },
      files: { 'src.ts': 'export const value = 1;\n' },
    });
    try {
      installRepairTools(root);
      const r = await runCliAsync(installPhaseTicket(root, 'impl', ['src.ts']), root);
      assert.notStrictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /⛔ лестница остановлена на «type-check»/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('broken tests in a code phase: repair and types pass, then ladder halts at test', async () => {
    const { root } = buildRepoFixture({
      scripts: {
        ...REPAIR_BRICKS,
        'type-check': PASS_SCRIPT,
        test: FAIL_SCRIPT,
      },
      files: { 'src.ts': 'export const value = 1;\n' },
    });
    try {
      installRepairTools(root);
      const r = await runCliAsync(installPhaseTicket(root, 'impl', ['src.ts']), root);
      assert.notStrictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /✅ type-check/);
      assert.match(r.stdout, /⛔ лестница остановлена на «test»/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('repair gate itself fails in a code phase: foundation never runs', async (t) => {
    const { root } = buildRepoFixture({
      scripts: { ...REPAIR_BRICKS },
      files: { 'src.ts': 'export const value = 1;\n' },
    });
    try {
      const typeCheck = externalRunMarker(t, root, 'TYPE_CHECK_RAN');
      const testGate = externalRunMarker(t, root, 'TEST_RAN');
      setPackageScripts(root, { 'type-check': typeCheck.script, test: testGate.script });
      installRepairTools(root, 'process.exit(1)');
      const r = await runCliAsync(installPhaseTicket(root, 'impl', ['src.ts']), root);
      assert.notStrictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /🔧 fix — exit 1 .* — repair не завершён/);
      assert.match(r.stdout, /лестница остановлена на «fix»/);
      assert.ok(!existsSync(typeCheck.path));
      assert.ok(!existsSync(testGate.path));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('a file-backed failure masked by `|| true` pins the accepted exit-semantics boundary', async () => {
    // Receipt provenance binds the local runner file, but no layer proves that the package script
    // preserves its exit status. Audit and real-toolchain e2e do not close this boundary: the
    // deliberately masked failure exits 0 and remains an explicitly accepted residual risk.
    const { root } = buildRepoFixture({
      scripts: {
        ...REPAIR_BRICKS,
        'type-check': PASS_SCRIPT,
        test: 'node scripts/gates/masked-failure.mjs || true',
      },
      files: { 'src.ts': 'export const value = 1;\n' },
    });
    try {
      installRepairTools(root);
      const r = await runCliAsync(installPhaseTicket(root, 'impl', ['src.ts']), root);
      assert.match(r.stdout, /✅ test\b/);
      assert.doesNotMatch(r.stdout, /⛔ test — обязательная ступень профиля «code»/);
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
      assert.match(r.stdout, /full-profile gate mutated paths outside its permitted write-set/);
      assert.match(r.stdout, /src\.ts/);
      assert.strictEqual(readFileSync(join(root, 'src.ts'), 'utf-8'), 'mutated by lint');
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

  it('CHAIN: an EMPTY-but-fresh report passes sdd-verify freshness but the full chain fails at testcov (C2 division)', async () => {
    // Division of responsibility: sdd-verify proves the report is from THIS run (fresh); testcov
    // proves it is VALID + meets the threshold. An empty `{}` report is fresh (probe passes) yet has
    // no data, so `testcov --min` reds it — neither step alone is the whole guarantee.
    const { root } = buildRepoFixture({
      scripts: {
        ...REPAIR_BRICKS,
        'type-check': PASS_SCRIPT,
        test: PASS_SCRIPT,
        'test:coverage': COVERAGE_SCRIPT, // writes a FRESH but empty `{}` coverage-final.json
      },
      files: { 'src/thing.ts': 'export const x = 1;\n' },
    });
    try {
      installRepairTools(root);
      // sdd-verify: probe sees a fresh report appear → test:coverage passes.
      const verify = await runCliAsync(installPhaseTicket(root, 'test', ['src/thing.ts']), root);
      assert.strictEqual(verify.exitCode, 0, verify.stdout + verify.stderr);
      assert.match(verify.stdout, /✅ test:coverage/);
      // testcov: the `{}` report has no data for the file → threshold gate is RED.
      const cov = await runCliAsync(['testcov', '--min=80', 'src/thing.ts'], root);
      assert.notStrictEqual(cov.exitCode, 0, cov.stdout + cov.stderr);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('repair rewrites a file before foundation; types/tests run only over repaired state', async () => {
    const { root } = buildRepoFixture({
      scripts: {
        ...REPAIR_BRICKS,
        'type-check': 'node scripts/gates/repair-check.mjs',
        test: PASS_SCRIPT,
      },
      files: { 'src.ts': 'unformatted' },
    });
    try {
      installRepairTools(root, "require('fs').writeFileSync(process.argv.at(-1),'fixed')");
      const r = await runCliAsync(installPhaseTicket(root, 'impl', ['src.ts']), root);
      assert.strictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /🔧 fix/);
      assert.match(r.stdout, /✅ type-check/);
      assert.match(r.stdout, /✅ test/);
      assert.doesNotMatch(r.stdout, /re-run после мутаций/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
