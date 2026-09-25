// @file: UV-11 invocation, report, no-spawn planning and real Node repair contracts.
// @spec: CLI-VERIFY
// @consumers: CI

import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import type { PhaseReceipt } from '../../../../shared/sdd/phase-receipt.ts';
import {
  adaptSddVerifyContext,
  type SddVerifyContext,
} from '../../../../shared/sdd/verify/sdd-verify-context.ts';
import type { VerifyRunReport } from '../../../../shared/verify/model/verify-report.type.ts';
import { renderVerifyJson } from '../../../../shared/verify/reporting/json-reporter.ts';
import { renderVerifyText } from '../../../../shared/verify/reporting/text-reporter.ts';
import { runVerifyCommand } from '../verify.cmd.ts';
import { parseVerifyInvocation } from '../verify.types.ts';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..', '..');

function argv(...rest: string[]): string[] {
  return ['node', 'gennady.ts', 'verify', ...rest];
}

function git(root: string, ...args: string[]): string {
  return execFileSync(
    'git',
    ['-C', root, '-c', 'user.email=verify@test', '-c', 'user.name=verify', ...args],
    { encoding: 'utf8' }
  ).trim();
}

function createNodeRepo(options: { readonly sentinelTypecheck?: boolean } = {}): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-command-'));
  const gennady = path.join(REPO_ROOT, 'cli', 'gennady.ts');
  fs.symlinkSync(path.join(REPO_ROOT, 'node_modules'), path.join(root, 'node_modules'));
  fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules\n');
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({
      name: 'verify-fixture',
      private: true,
      scripts: {
        'type-check': options.sentinelTypecheck
          ? "node -e \"require('node:fs').writeFileSync('spawned','yes')\""
          : 'node -e ""',
        'lint:fix': `node ${gennady} lint --autofix`,
        lint: `node ${gennady} lint`,
        'format:fix': 'prettier --write',
        format: 'prettier --check src.ts',
      },
    })
  );
  fs.writeFileSync(
    path.join(root, 'src.ts'),
    [
      '// @file: Deliberately unformatted target used by the verify repair integration.',
      '// @consumers: N/A',
      '',
      '/** @purpose Exercise bounded formatter repair. */',
      'export const verifyFixture={value:1}',
      '',
    ].join('\n')
  );
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'add', '.gitignore', 'package.json', 'src.ts');
  git(root, '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'fixture');
  return fs.realpathSync(root);
}

function sddContext(
  root: string,
  targets: readonly string[] = ['src.ts'],
  deletedFiles: readonly string[] = []
): SddVerifyContext {
  const adapted = adaptSddVerifyContext(root, {
    profile: 'code',
    profileBasis: 'phase-kind',
    targets,
    deletedFiles,
    taskPath: 'specs/app/app.task.UV-12.md',
    phaseId: 'P1',
    verification: [],
    producesCoverage: false,
    stack: 'node',
    gatePlan: {
      ticket: 'UV-12',
      phase: 'P1',
      profile: 'code',
      producesCoverage: false,
      gates: [
        {
          name: 'format',
          state: 'CONFIGURED',
          required: true,
          command: 'npm run format',
          prerequisites: [],
          provider: null,
          next: 'run npm run format',
        },
      ],
    },
  });
  if (!adapted.ok) throw new Error(adapted.diagnostic.message);
  return adapted.context;
}

function manualReport(root: string): VerifyRunReport {
  const rules = {
    digest: 'sha256:empty',
    required: [],
    suggested: [],
    skipped: [],
  } as const;
  return {
    context: {
      request: { root, phase: 'code', scope: { mode: 'all', files: [] } },
      plugins: ['node'],
      frameworks: [],
      headSha: 'a'.repeat(40),
      rules,
    },
    readiness: {
      status: 'BLOCKED',
      entries: [
        {
          plugin: 'node',
          phase: 'code',
          requirementId: 'ready',
          status: 'READY',
          message: 'ready',
        },
        {
          plugin: 'node',
          phase: 'code',
          requirementId: 'degraded',
          status: 'DEGRADED',
          message: 'optional tool missing',
          fix: 'install optional tool',
        },
        {
          plugin: 'node',
          phase: 'code',
          requirementId: 'waiver',
          stepId: 'node:lint',
          disposition: 'waived',
          status: 'WAIVED',
          message: 'disabled for migration',
          fix: 'restore lint',
        },
        {
          plugin: 'node',
          phase: 'code',
          requirementId: 'blocked',
          status: 'BLOCKED',
          message: 'token=not-public',
          fix: 'set token=not-public',
          policySource: `${root}/gennady.yaml`,
          policyReason: 'password=not-public',
          policyReasonSource: `${root}/gennady.yaml`,
        },
      ],
    },
    plan: {
      phase: 'code',
      steps: [
        {
          id: 'node:lint',
          plugin: 'node',
          tags: ['code'],
          needs: [],
          executor: 'local',
          effect: 'observe',
          command: {
            argv: ['tool', '--token', 'not-public'],
            cwd: root,
            env: { API_KEY: 'not-public' },
            timeoutMs: 1000,
          },
          requires: [],
          envFail: [
            {
              outputMatches: `${root}/cache token=not-public`,
              hint: `remove password=not-public from ${root}/gennady.yaml`,
              source: `${root}/gennady.yaml`,
            },
          ],
          timeoutMs: 1000,
          onFailure: 'stop-phase',
        },
      ],
    },
    results: [
      {
        stepId: 'node:lint',
        plugin: 'node',
        status: 'fail',
        exitCode: 1,
        durationMs: 2,
        output: `${root}/src.ts token=not-public`,
      },
    ],
    mutations: [{ path: 'src.ts', stepId: 'node:lint', kind: 'modified', allowed: true }],
    evidence: [
      {
        kind: 'diff',
        identity: `diff:${root}/src.ts`,
        summary: `${root}/src.ts password=not-public`,
      },
    ],
    rules,
    verdict: 'blocked',
  };
}

describe('parseVerifyInvocation', () => {
  it('accepts target execution with text default and explicit JSON', () => {
    assert.deepStrictEqual(parseVerifyInvocation(argv('--phase=code')), {
      ok: true,
      invocation: { phase: 'code', planOnly: false, format: 'text' },
    });
    assert.deepStrictEqual(parseVerifyInvocation(argv('--phase', 'unit', '--json')), {
      ok: true,
      invocation: { phase: 'unit', planOnly: false, format: 'json' },
    });
    assert.deepStrictEqual(
      parseVerifyInvocation(
        argv('--phase=release-check', '--task=specs/app space/app.task.APP-1.md', '--sdd-phase=P1')
      ),
      {
        ok: true,
        invocation: {
          phase: 'release-check',
          planOnly: false,
          format: 'text',
          sdd: { task: 'specs/app space/app.task.APP-1.md', phase: 'P1' },
        },
      }
    );
  });

  it('keeps --plan --json compatibility read-only and defaults only it to full', () => {
    assert.deepStrictEqual(parseVerifyInvocation(argv('--plan', '--json')), {
      ok: true,
      invocation: { phase: 'full', planOnly: true, format: 'json' },
    });
  });

  it('rejects missing phase, plan without JSON, duplicates, paths and unknown flags', () => {
    for (const args of [
      [],
      ['--json'],
      ['--plan'],
      ['--phase=code', '--phase=unit'],
      ['--phase=code', 'src.ts'],
      ['--phase=code', '--fix'],
      ['--phase=code', '--task=ticket.md'],
      ['--phase=code', '--sdd-phase=P1'],
    ]) {
      const parsed = parseVerifyInvocation(argv(...args));
      assert.strictEqual(parsed.ok, false, args.join(' '));
      if (!parsed.ok) assert.match(parsed.message, /ERR_CLI_VERIFY_BAD_INVOCATION/);
    }
  });
});

describe('Verify report projection', () => {
  it('is deterministic, versioned and strips absolute paths, argv/env values and common secrets', () => {
    const root = '/private/tmp/private-repo';
    const report = manualReport(root);
    const first = renderVerifyJson(report, root);
    const second = renderVerifyJson(report, root);
    assert.strictEqual(first, second);
    const document = JSON.parse(first);
    assert.strictEqual(document.schemaVersion, 1);
    assert.strictEqual(document.kind, 'verify-run-report');
    assert.strictEqual(document.context.request.root, '.');
    assert.ok(Array.isArray(document.evidence));
    assert.strictEqual(document.evidence[0].kind, 'diff');
    assert.match(document.plan.steps[0].command.identity, /^sha256:/);
    assert.deepStrictEqual(document.plan.steps[0].command.environmentKeys, ['API_KEY']);
    assert.doesNotMatch(first, new RegExp(root));
    assert.doesNotMatch(first, /not-public/);
    assert.doesNotMatch(first, /--token/);
  });

  it('text shows all non-ready instructions, step outcome, mutation, evidence and final verdict', () => {
    const root = '/private/tmp/private-repo';
    const text = renderVerifyText(manualReport(root), root);
    assert.match(text, /readiness=BLOCKED/);
    assert.match(text, /DEGRADED node: optional tool missing/);
    assert.match(text, /WAIVED node node:lint: disabled for migration/);
    assert.match(text, /BLOCKED node: token=\[redacted\]/);
    assert.match(text, /fix: install optional tool/);
    assert.match(text, /FAIL node:lint/);
    assert.match(text, /MODIFIED src\.ts by=node:lint allowed=true/);
    assert.match(text, /diff diff:\.\/src\.ts/);
    assert.match(text, /VERDICT BLOCKED/);
  });
});

describe('runVerifyCommand target integration', () => {
  it('--plan builds a full target report but never spawns or mutates', async () => {
    const root = createNodeRepo({ sentinelTypecheck: true });
    try {
      const before = fs.readFileSync(path.join(root, 'src.ts'), 'utf8');
      fs.writeFileSync(path.join(root, 'notes.txt'), 'not a Node repair target\n');
      fs.writeFileSync(path.join(root, 'deleted.ts'), 'export const deleted = true;\n');
      git(root, 'add', 'deleted.ts');
      git(root, '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'add deleted source');
      fs.rmSync(path.join(root, 'deleted.ts'));
      fs.symlinkSync('src.ts', path.join(root, 'linked.ts'));
      const result = await runVerifyCommand(
        root,
        { phase: 'code', planOnly: true, format: 'json' },
        { homeDirectory: root }
      );
      assert.strictEqual(result.exitCode, 0, result.stderr);
      const document = JSON.parse(result.stdout);
      assert.strictEqual(document.kind, 'plan');
      assert.strictEqual(document.evidence, false);
      assert.ok(document.plan.steps.some((step: { id: string }) => step.id === 'node:lint-fix'));
      for (const step of result.report?.plan.steps.filter(
        (candidate) => candidate.effect === 'repair'
      ) ?? []) {
        assert.deepStrictEqual(step.command?.argv.slice(-2), ['--', 'src.ts']);
      }
      assert.deepStrictEqual(document.results, []);
      assert.strictEqual(fs.existsSync(path.join(root, 'spawned')), false);
      assert.strictEqual(fs.readFileSync(path.join(root, 'src.ts'), 'utf8'), before);
      assert.strictEqual(
        fs.readFileSync(path.join(root, 'notes.txt'), 'utf8'),
        'not a Node repair target\n'
      );
      assert.strictEqual(fs.readlinkSync(path.join(root, 'linked.ts')), 'src.ts');
      assert.deepStrictEqual(
        fs.readdirSync(path.join(root, '.git')).filter((name) => name.startsWith('gennady-')),
        []
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('runs a real Node code slice, applies bounded repair and reports it in text', async () => {
    const root = createNodeRepo();
    try {
      const result = await runVerifyCommand(
        root,
        { phase: 'code', planOnly: false, format: 'text' },
        { homeDirectory: root }
      );
      assert.strictEqual(result.exitCode, 0, result.stderr || result.stdout);
      assert.strictEqual(result.report?.verdict, 'pass');
      assert.match(result.stdout, /VERIFY phase=code/);
      assert.match(result.stdout, /PASS node:lint-fix/);
      assert.match(result.stdout, /MODIFIED src\.ts by=node:(?:lint|format)-fix allowed=true/);
      assert.match(result.stdout, /VERDICT PASS/);
      assert.match(fs.readFileSync(path.join(root, 'src.ts'), 'utf8'), /@file:/);
      assert.ok(result.report?.mutations.some((mutation) => mutation.path === 'src.ts'));
      assert.strictEqual(Object.isFrozen(result.report), true);
      assert.strictEqual(Object.isFrozen(result.report?.context), true);
      assert.strictEqual(result.report?.context.frameworks.length, 0);
      assert.strictEqual(result.report?.context.headSha, git(root, 'rev-parse', 'HEAD'));
      assert.match(result.report?.rules.digest ?? '', /^sha256:/);
      assert.strictEqual(result.report?.context.rules, result.report?.rules);
      for (const repair of result.report?.plan.steps.filter((step) => step.effect === 'repair') ??
        []) {
        assert.deepStrictEqual(repair.command?.argv.slice(-2), ['--', 'src.ts']);
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('feeds the exact terminal report to the optional SDD receipt sink', async () => {
    const root = createNodeRepo();
    try {
      const context = sddContext(root);
      let persistedReceipt: PhaseReceipt | undefined;
      let persistedReport: VerifyRunReport | undefined;
      const result = await runVerifyCommand(
        root,
        { phase: 'code', planOnly: false, format: 'json' },
        {
          homeDirectory: root,
          sdd: {
            context,
            bindings: [{ stepId: 'node:format', source: 'gate', gate: 'format' }],
            persist: (receipt, source) => {
              persistedReceipt = receipt;
              persistedReport = source;
            },
          },
        }
      );

      assert.strictEqual(result.exitCode, 0, result.stderr || result.stdout);
      assert.strictEqual(result.receiptSink?.ok, true);
      assert.strictEqual(result.receiptSink?.status, 'written');
      assert.strictEqual(persistedReport, result.report);
      assert.strictEqual(persistedReceipt, result.receiptSink?.receipt);
      assert.strictEqual(result.report?.context.request.task, context.request.task);
      assert.strictEqual(result.report?.context.request.sddPhase, context.request.sddPhase);
      assert.deepStrictEqual(result.report?.context.request.scope.files, ['src.ts']);
      assert.deepStrictEqual(result.report?.context.request.deletedFiles, []);
      assert.deepStrictEqual(JSON.parse(result.stdout).context.request, {
        root: '.',
        phase: 'code',
        scope: { mode: 'files', files: ['src.ts'] },
        task: 'specs/app/app.task.UV-12.md',
        sddPhase: 'P1',
        deletedFiles: [],
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects a configured receipt sink in plan-only mode before spawning or writing', async () => {
    const root = createNodeRepo({ sentinelTypecheck: true });
    try {
      let persistenceCalls = 0;
      const result = await runVerifyCommand(
        root,
        { phase: 'code', planOnly: true, format: 'json' },
        {
          homeDirectory: root,
          sdd: {
            context: sddContext(root),
            bindings: [{ stepId: 'node:format', source: 'gate', gate: 'format' }],
            persist: () => {
              persistenceCalls += 1;
            },
          },
        }
      );
      assert.strictEqual(result.exitCode, 4);
      assert.match(result.stderr, /receipt sink cannot be enabled.*--plan/);
      assert.strictEqual(persistenceCalls, 0);
      assert.strictEqual(fs.existsSync(path.join(root, 'spawned')), false);
      assert.deepStrictEqual(
        fs.readdirSync(path.join(root, '.git')).filter((name) => name.startsWith('gennady-')),
        []
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('uses existing targets plus deleted tombstones for exact affected-stack planning', async () => {
    const root = createNodeRepo();
    try {
      fs.writeFileSync(path.join(root, 'go.mod'), 'module example.com/uv12\n\ngo 1.22\n');
      const mixed = await runVerifyCommand(
        root,
        { phase: 'code', planOnly: true, format: 'json' },
        {
          homeDirectory: root,
          sdd: {
            context: sddContext(root, ['src.ts'], ['pkg/removed.go']),
            bindings: [],
          },
        }
      );
      assert.strictEqual(mixed.exitCode, 0, mixed.stderr);
      assert.deepStrictEqual(mixed.report?.context.request.scope.files, [
        'pkg/removed.go',
        'src.ts',
      ]);
      assert.deepStrictEqual(mixed.report?.context.request.deletedFiles, ['pkg/removed.go']);
      assert.deepStrictEqual(mixed.report?.context.plugins, ['golang', 'node']);

      const deletedOnly = await runVerifyCommand(
        root,
        { phase: 'code', planOnly: true, format: 'json' },
        {
          homeDirectory: root,
          sdd: {
            context: sddContext(root, [], ['pkg/removed.go']),
            bindings: [],
          },
        }
      );
      assert.strictEqual(deletedOnly.exitCode, 0, deletedOnly.stderr);
      assert.deepStrictEqual(deletedOnly.report?.context.request.scope.files, ['pkg/removed.go']);
      assert.deepStrictEqual(deletedOnly.report?.context.plugins, ['golang']);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('maps a product failure to deterministic report verdict and exit 1', async () => {
    const root = createNodeRepo();
    try {
      const document = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
      document.scripts['type-check'] = 'node -e "process.exit(7)"';
      fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(document));
      const result = await runVerifyCommand(
        root,
        { phase: 'code', planOnly: false, format: 'json' },
        { homeDirectory: root }
      );
      assert.strictEqual(result.exitCode, 1);
      assert.strictEqual(result.report?.verdict, 'fail');
      assert.strictEqual(JSON.parse(result.stdout).verdict, 'fail');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('keeps explicit waivers visible as DEGRADED and never spawns waived nodes', async () => {
    const root = createNodeRepo({ sentinelTypecheck: true });
    try {
      const steps = Object.fromEntries(
        ['type-check', 'lint-fix', 'lint', 'format-fix', 'format'].map((step) => [
          step,
          { enabled: false, reason: `migration waiver for ${step}` },
        ])
      );
      fs.writeFileSync(
        path.join(root, 'gennady.yaml'),
        JSON.stringify({ verify: { presets: { node: { steps } } } })
      );
      const result = await runVerifyCommand(
        root,
        { phase: 'code', planOnly: false, format: 'text' },
        { homeDirectory: root }
      );
      assert.strictEqual(result.exitCode, 0, result.stderr || result.stdout);
      assert.strictEqual(result.report?.readiness.status, 'DEGRADED');
      assert.strictEqual(
        result.report?.readiness.entries.filter((entry) => entry.status === 'WAIVED').length,
        5
      );
      assert.ok(result.report?.results.every((entry) => entry.status === 'waived'));
      assert.match(result.stdout, /WAIVED node node:type-check/);
      assert.match(result.stdout, /VERDICT PASS \(DEGRADED\)/);
      assert.strictEqual(fs.existsSync(path.join(root, 'spawned')), false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('maps cooperative SIGTERM to exit 143 after restoration and a non-pass report', async () => {
    const root = createNodeRepo();
    try {
      const abort = new AbortController();
      abort.abort('SIGTERM');
      const result = await runVerifyCommand(
        root,
        { phase: 'code', planOnly: false, format: 'json' },
        { homeDirectory: root, signal: abort.signal }
      );
      assert.strictEqual(result.exitCode, 143);
      assert.strictEqual(result.report?.results[0]?.status, 'cancelled');
      assert.strictEqual(result.report?.verdict, 'violation');
      assert.strictEqual(
        fs.existsSync(path.join(root, '.git', 'gennady-workspace-guard.lock')),
        false
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
