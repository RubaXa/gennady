// @file: Black-box read-only and cross-surface parity proof for gennady rules.
// @spec: CLI-RULES-CLI
// @consumers: CI

import { execFileSync, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { BUILTIN_RULE_SOURCES } from '../../../shared/rules/builtin-rule-sources.ts';
import { resolveSddRuleSnapshot } from '../../../shared/rules/sdd-rule-snapshot.ts';
import { runVerifyCommand } from '../../cmd/verify/verify.cmd.ts';
import { cleanTestChildEnv } from './run-cli.ts';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const GENNADY_ENTRY = path.join(REPO_ROOT, 'cli', 'gennady.ts');
const TSX_LOADER = path.join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'loader.mjs');

type CliResult = {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
};

function git(root: string, ...args: string[]): string {
  return execFileSync(
    'git',
    ['-C', root, '-c', 'user.email=rules@test', '-c', 'user.name=rules', ...args],
    { encoding: 'utf8' }
  ).trim();
}

function run(root: string, args: readonly string[]): CliResult {
  const result = spawnSync(
    process.execPath,
    ['--import', TSX_LOADER, GENNADY_ENTRY, 'rules', ...args],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...cleanTestChildEnv(process.env), HOME: path.join(root, '.home') },
      timeout: 20_000,
    }
  );
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function fixture(): {
  readonly root: string;
  readonly ticket: string;
  readonly cleanup: () => void;
} {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'rules-cli-')));
  fs.mkdirSync(path.join(root, '.home'));
  fs.mkdirSync(path.join(root, 'src'));
  fs.mkdirSync(path.join(root, 'specs', 'app'), { recursive: true });
  fs.writeFileSync(path.join(root, '.gitignore'), '.home\n');
  fs.writeFileSync(
    path.join(root, 'package.json'),
    `${JSON.stringify({
      name: 'rules-cli-fixture',
      private: true,
      devDependencies: { vitest: '1.0.0' },
      scripts: { test: 'vitest run', 'type-check': 'tsc --noEmit' },
    })}\n`
  );
  fs.writeFileSync(path.join(root, 'src', 'app.ts'), 'export const app = true;\n');
  fs.writeFileSync(path.join(root, 'src', 'app.test.ts'), 'export const tested = true;\n');
  fs.writeFileSync(path.join(root, 'sentinel.txt'), 'must remain byte-identical\n');
  for (const source of BUILTIN_RULE_SOURCES) {
    fs.mkdirSync(path.dirname(path.join(root, source)), { recursive: true });
    fs.copyFileSync(path.join(REPO_ROOT, source), path.join(root, source));
  }
  const ticket = path.join(root, 'specs', 'app', 'app.task.APP-rules.md');
  fs.writeFileSync(
    ticket,
    [
      '# Task: APP-rules',
      '<!--SECTION:META-->',
      '- **Task-ID:** APP-rules',
      '- **Status:** [ ] TODO',
      '- **Scope:** app',
      '- **Dependencies:** None',
      '<!--/SECTION:META-->',
      '<!--SECTION:PHASES_OVERVIEW-->',
      '| ID | Kind | Deps | Status |',
      '|---|---|---|---|',
      '| P1 | implementation | — | [ ] |',
      '<!--/SECTION:PHASES_OVERVIEW-->',
      '<!--SECTION:PHASE_P1-->',
      '- **Objective:** resolve exact rules',
      '- **Rules:**',
      '  - [TypeScript](../../ai/directives/coding/typescript-rules.xml)',
      '- **Target Files:**',
      '  - src/app.ts',
      '- **Deleted Files:**',
      '  - none',
      '- **Inputs:** none',
      '- **Exit:** snapshot resolves',
      '<!--/SECTION:PHASE_P1-->',
      '<!--SECTION:VERIFICATION-->',
      '| Command | Required by | Role |',
      '|---|---|---|',
      '<!--/SECTION:VERIFICATION-->',
      '<!--SECTION:EXECUTION_LOG-->',
      'empty',
      '<!--/SECTION:EXECUTION_LOG-->',
      '',
    ].join('\n')
  );
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'add', '.');
  git(root, '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'fixture');
  return { root, ticket, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

describe('gennady rules', () => {
  it('lists the complete deterministic inventory and rejects stale stack/phase filters', () => {
    const built = fixture();
    try {
      const help = run(built.root, ['--help']);
      assert.equal(help.status, 0, help.stderr);
      assert.match(help.stdout, /rules list \[--format text\|json\]/);
      assert.match(help.stdout, /separate from `gennady agents-rules`/);

      const first = run(built.root, ['list', '--format', 'json']);
      const second = run(built.root, ['list', '--format', 'json']);
      assert.equal(first.status, 0, first.stderr);
      assert.equal(first.stdout, second.stdout);
      const report = JSON.parse(first.stdout) as {
        schema: string;
        rules: Array<{ id: string; source: string; availability: string }>;
      };
      assert.equal(report.schema, 'gennady.rules-list.v1');
      assert.equal(report.rules.length, BUILTIN_RULE_SOURCES.length);
      assert.deepEqual(
        report.rules.map(({ id }) => id),
        report.rules.map(({ id }) => id).sort()
      );
      assert.ok(report.rules.every(({ source }) => !path.isAbsolute(source)));
      assert.ok(report.rules.every(({ availability }) => availability === 'available'));

      const stack = run(built.root, ['list', '--stack', 'node']);
      assert.equal(stack.status, 4);
      assert.match(stack.stderr, /Unknown flag.*stack/);
      const phase = run(built.root, ['list', '--phase', 'code']);
      assert.equal(phase.status, 4);
      assert.match(phase.stderr, /inventory-only.*--phase/);
    } finally {
      built.cleanup();
    }
  });

  it('shows one exact prompt body and fails closed for an unknown id', () => {
    const built = fixture();
    try {
      const showSource = fs.readFileSync(
        path.join(REPO_ROOT, 'cli', 'cmd', 'rules', 'rules-show.ts'),
        'utf8'
      );
      assert.equal(showSource.match(/loadBuiltinRuleRegistry\(root\)/g)?.length, 1);
      assert.doesNotMatch(showSource, /\blistRules\s*\(/);

      const shown = run(built.root, ['show', 'typescript-rules', '--format', 'json']);
      assert.equal(shown.status, 0, shown.stderr);
      const report = JSON.parse(shown.stdout) as {
        schema: string;
        rule: { id: string; body: string; source: string };
      };
      assert.equal(report.schema, 'gennady.rules-show.v1');
      assert.equal(report.rule.id, 'typescript-rules');
      assert.match(report.rule.body, /TypeScript/);
      assert.equal(report.rule.source, 'ai/directives/coding/typescript-rules.xml');

      const unknown = run(built.root, ['show', 'not-a-rule']);
      assert.equal(unknown.status, 1);
      assert.match(unknown.stderr, /RULES_UNKNOWN_RULE: not-a-rule/);

      for (const ruleId of [' typescript-rules', 'typescript-rules ', 'TypeScript', 'bad\nid']) {
        const invalid = run(built.root, ['show', ruleId]);
        assert.equal(invalid.status, 4);
        assert.match(invalid.stderr, /normalized rule-id token/);
        assert.doesNotMatch(invalid.stderr, /bad\nid/);
      }
    } finally {
      built.cleanup();
    }
  });

  it('resolves exact/glob files with the same real snapshot digest as SDD dispatch and Verify', async () => {
    const built = fixture();
    try {
      const result = run(built.root, [
        'resolve',
        '--phase',
        'test',
        '--files',
        'src/*.test.ts',
        '--format',
        'json',
      ]);
      assert.equal(result.status, 0, result.stderr);
      const report = JSON.parse(result.stdout) as {
        digest: string;
        facts: { frameworks: never; artifacts: Array<{ frameworks: string[] }> };
        selected: { required: Array<{ id: string }>; suggested: Array<{ id: string }> };
        dependencyClosure: string[];
      };
      const dispatch = resolveSddRuleSnapshot({
        root: built.root,
        targetFiles: ['src/app.test.ts'],
        plannedFiles: ['src/app.test.ts'],
        intents: ['test'],
      });
      assert.equal(report.digest, dispatch.snapshot.digest);
      assert.ok(report.facts.artifacts[0]?.frameworks.includes('vitest'));
      assert.ok(
        [...report.selected.required, ...report.selected.suggested].some(
          ({ id }) => id === 'vitest-rules'
        )
      );
      assert.ok(report.dependencyClosure.includes('testing-common'));
      const verify = await runVerifyCommand(
        built.root,
        { phase: 'unit', planOnly: true, format: 'json' },
        {
          request: {
            scope: { mode: 'files', files: ['src/app.test.ts'] },
            rules: dispatch.snapshot,
          },
          homeDirectory: path.join(built.root, '.home'),
        }
      );
      assert.ok(verify.report !== undefined, verify.stderr);
      assert.equal(verify.report.context.rules.digest, report.digest);
      assert.strictEqual(verify.report.context.rules, dispatch.snapshot);
      assert.ok(!result.stdout.includes(built.root));
    } finally {
      built.cleanup();
    }
  });

  it('uses one selector-matched ticket phase and leaves dirty files, ticket and sentinel unchanged', () => {
    const built = fixture();
    try {
      fs.appendFileSync(path.join(built.root, 'src', 'app.ts'), '// dirty\n');
      const ticketBefore = fs.readFileSync(built.ticket, 'utf8');
      const sentinelBefore = fs.readFileSync(path.join(built.root, 'sentinel.txt'), 'utf8');
      const statusBefore = git(built.root, 'status', '--short');
      const result = run(built.root, [
        'resolve',
        '--phase',
        'code',
        '--task',
        'specs/app/app.task.APP-rules.md',
        '--format',
        'json',
      ]);
      assert.equal(result.status, 0, result.stderr);
      const report = JSON.parse(result.stdout) as {
        scope: { source: string; ticket: string; sddPhase: string; files: string[] };
      };
      assert.deepEqual(report.scope, {
        source: 'task',
        files: ['src/app.ts'],
        tombstones: [],
        ticket: 'specs/app/app.task.APP-rules.md',
        sddPhase: 'P1',
      });
      assert.equal(fs.readFileSync(built.ticket, 'utf8'), ticketBefore);
      assert.equal(fs.readFileSync(path.join(built.root, 'sentinel.txt'), 'utf8'), sentinelBefore);
      assert.equal(git(built.root, 'status', '--short'), statusBefore);
    } finally {
      built.cleanup();
    }
  });

  it('materializes changed-from existing files and tombstones deterministically', () => {
    const built = fixture();
    try {
      const base = git(built.root, 'rev-parse', 'HEAD');
      fs.appendFileSync(path.join(built.root, 'src', 'app.ts'), '// changed\n');
      fs.rmSync(path.join(built.root, 'src', 'app.test.ts'));
      fs.writeFileSync(path.join(built.root, 'src', 'new.ts'), 'export const fresh = true;\n');
      const result = run(built.root, [
        'resolve',
        '--phase',
        'code',
        '--changed-from',
        base,
        '--format',
        'json',
      ]);
      assert.equal(result.status, 0, result.stderr);
      const report = JSON.parse(result.stdout) as {
        scope: { files: string[]; tombstones: string[]; changedFrom: string };
        facts: { tombstoneFiles: string[] };
      };
      assert.deepEqual(report.scope.files, ['src/app.test.ts', 'src/app.ts', 'src/new.ts']);
      assert.deepEqual(report.scope.tombstones, ['src/app.test.ts']);
      assert.deepEqual(report.facts.tombstoneFiles, ['src/app.test.ts']);
      assert.equal(report.scope.changedFrom, base);

      const injected = run(built.root, ['resolve', '--phase', 'code', '--changed-from=--help']);
      assert.equal(injected.status, 1);
      assert.match(injected.stderr, /RULES_SCOPE_INVALID_REF: --help/);
    } finally {
      built.cleanup();
    }
  });

  it('fails closed for ambiguous/missing scope, escape, symlink and malformed embedded source', () => {
    const built = fixture();
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'rules-outside-'));
    try {
      const missing = run(built.root, ['resolve', '--phase', 'code']);
      assert.equal(missing.status, 4);
      assert.match(missing.stderr, /exactly one scope/);
      const ambiguous = run(built.root, [
        'resolve',
        '--phase',
        'code',
        '--files',
        'src/app.ts',
        '--task',
        'APP-rules',
      ]);
      assert.equal(ambiguous.status, 4);
      assert.match(ambiguous.stderr, /exactly one scope/);
      const escaped = run(built.root, ['resolve', '--phase', 'code', '--files', '../outside.ts']);
      assert.equal(escaped.status, 1);
      assert.match(escaped.stderr, /RULES_SCOPE_UNSAFE/);
      fs.writeFileSync(path.join(outside, 'secret.ts'), 'secret\n');
      fs.symlinkSync(outside, path.join(built.root, 'linked'));
      const linked = run(built.root, ['resolve', '--phase', 'code', '--files', 'linked/secret.ts']);
      assert.equal(linked.status, 1);
      assert.match(linked.stderr, /RULES_SCOPE_UNSAFE.*symlink/);

      fs.writeFileSync(
        path.join(built.root, BUILTIN_RULE_SOURCES[0]),
        '<Rule>malformed header remains prompt text</Rule>\n'
      );
      const malformed = run(built.root, ['list']);
      assert.equal(malformed.status, 1);
      assert.match(malformed.stderr, /RULE_HEADER_MALFORMED/);
      assert.match(malformed.stderr, new RegExp(BUILTIN_RULE_SOURCES[0].replaceAll('/', '\\/')));
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
      built.cleanup();
    }
  });
});
