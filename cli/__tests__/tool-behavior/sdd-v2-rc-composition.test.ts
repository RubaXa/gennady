// @file: Release-candidate composition proof across decomposition, critic, scaffold, phase evidence, and audit gates.
// @consumers: N/A
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  checkCriticReadinessForTargetSet,
  formatCriticChangedState,
  formatCriticTargetSet,
} from '../../../shared/sdd/critic-readiness.ts';
import {
  resolveScopeDecomposition,
  resolveTaskOwnership,
} from '../../../shared/sdd/module-specs.ts';
import { buildRepoFixture } from './fixture.ts';
import { runCli } from './run-cli.ts';

function executable(root: string, name: string, body = 'process.exit(0)'): void {
  const dir = join(root, 'node_modules', '.bin');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, name);
  writeFileSync(path, `#!/usr/bin/env node\n${body}\n`, 'utf-8');
  chmodSync(path, 0o755);
}

function criticRounds(targetSet: string, writeSet: string): string {
  const rounds: string[] = ['## Critic Rounds'];
  for (let round = 1; round <= 5; round++) {
    rounds.push(
      `### Round ${round} — 2026-08-${String(20 + round).padStart(2, '0')}`,
      `- Verdict: ${round === 5 ? 'CLEAN' : 'NEEDS_WORK'}`,
      `- Target-set: ${targetSet}`,
      `- Write-set: ${writeSet}`,
      `- Changed-state: sha256:${String(round).repeat(64)}`,
      `- Dispatch: ${round === 1 ? 'fresh — initial target-set' : 'continued'}`,
      `- Changes: ${round === 5 ? 'module contract corrected' : `integrated edit ${round}`}`,
      ...(round === 5 ? ['- Operator-decision: CLEAN'] : [])
    );
  }
  return rounds.join('\n');
}

describe('SDD v2 release-candidate composition', () => {
  it('fails closed at standalone read boundaries instead of treating symlink/outside evidence as empty-clean', () => {
    const { root } = buildRepoFixture({
      scripts: {},
      files: {
        'src/safe.ts': '// @file: Safe source.\n// @consumers: N/A\nexport const safe = 1;\n',
        'coverage/coverage-final.json': JSON.stringify({
          'src/safe.ts': { s: { '0': 1 }, b: {}, f: {} },
        }),
      },
    });
    const { root: victimRoot } = buildRepoFixture({
      scripts: {},
      files: { 'victim.ts': 'export const victim = "unchanged";\n' },
    });
    try {
      const victim = join(victimRoot, 'victim.ts');
      const before = readFileSync(victim, 'utf-8');
      mkdirSync(join(root, 'specs'), { recursive: true });
      symlinkSync(victim, join(root, 'specs', 'linked.spec.md'), 'file');
      symlinkSync(victim, join(root, 'linked.task.TSK-boundary.md'), 'file');
      symlinkSync('.', join(root, 'repo-alias'), 'dir');
      symlinkSync(victim, join(root, 'src', 'linked.ts'), 'file');
      symlinkSync(join(root, 'src'), join(root, 'src-alias'), 'dir');

      for (const invocation of [
        ['sdd-check', '--all'],
        ['sdd-check', '--task', 'linked.task.TSK-boundary.md'],
        ['sdd-check', '--changed', 'repo-alias'],
      ]) {
        const result = runCli(invocation, root);
        assert.strictEqual(result.exitCode, 1, result.stdout + result.stderr);
        assert.match(result.stdout + result.stderr, /ERR_CLI_SDD_CHECK_READ_FAILED/);
        assert.doesNotMatch(result.stdout + result.stderr, /✅ clean/);
      }

      for (const target of ['src/linked.ts', 'src-alias', 'src']) {
        const result = runCli(['lint', target], root);
        assert.strictEqual(result.exitCode, 1, result.stdout + result.stderr);
        assert.match(result.stdout + result.stderr, /ERR_CLI_LINT_READ_FAILED/);
        assert.doesNotMatch(result.stdout + result.stderr, /linting → clean/);
      }

      for (const target of ['src/linked.ts', victim]) {
        const result = runCli(['testcov', '--min=0', target], root);
        assert.strictEqual(result.exitCode, 1, result.stdout + result.stderr);
        assert.match(result.stdout + result.stderr, /ERR_CLI_TESTCOV_TARGET_PATH/);
      }

      const validFile = runCli(['testcov', '--min=0', 'src/safe.ts'], root);
      assert.strictEqual(validFile.exitCode, 0, validFile.stdout + validFile.stderr);
      assert.strictEqual(
        readFileSync(victim, 'utf-8'),
        before,
        'external victim must stay untouched'
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(victimRoot, { recursive: true, force: true });
    }
  });

  it('closes the route from decomposition through integrated review, exact scaffold, receipts, stale recovery, and read-only full', () => {
    const { root } = buildRepoFixture({
      gennadyInstalled: true,
      directives: true,
      scripts: {
        'format:fix': 'node tools/fake-formatter.cjs --write',
        'lint:fix': 'gennady lint --autofix',
        fix: 'npm run format:fix -- . && npm run lint:fix -- .',
        'type-check': 'node tools/type-check.cjs',
        test: 'node tools/test.cjs',
        'test:coverage': 'node tools/coverage.cjs',
        lint: 'gennady lint src/',
        format: 'node tools/fake-formatter.cjs',
      },
      files: {
        'src/feature.ts': 'export const feature = 1;\n',
        'src/feature.test.ts': 'test\n',
        'tools/fake-formatter.cjs': 'process.exit(0);\n',
        'tools/type-check.cjs': 'require("fs").readFileSync("src/feature.ts"); process.exit(0);\n',
        'tools/test.cjs': 'require("fs").readFileSync("src/feature.test.ts"); process.exit(0);\n',
        'tools/coverage.cjs':
          'require("fs").mkdirSync("coverage", { recursive: true }); require("fs").writeFileSync("coverage/coverage-final.json", "{}"); process.exit(0);\n',
        'tools/read-json.cjs':
          'JSON.parse(require("fs").readFileSync(process.argv[2], "utf8")); process.exit(0);\n',
      },
    });
    try {
      executable(root, 'gennady');
      const scopeDir = join(root, 'specs', 'app');
      const moduleDir = join(scopeDir, 'mod');
      mkdirSync(moduleDir, { recursive: true });
      const scopePath = join(scopeDir, 'app.spec.md');
      const modulePath = join(moduleDir, 'mod.spec.md');
      const scopeBase = [
        '# App',
        '<!--SECTION:SCOPE_TYPE-->',
        'product',
        '<!--/SECTION:SCOPE_TYPE-->',
        '<!--SECTION:MODULE_MAP-->',
        '## Module Map',
        '- [Mod](mod/mod.spec.md)',
        '<!--/SECTION:MODULE_MAP-->',
        '<!--SECTION:CHANGE_MANIFEST-->',
        '## Change Manifest',
        'ТИП ИЗМЕНЕНИЯ: refine',
        '<!--/SECTION:CHANGE_MANIFEST-->',
      ].join('\n');
      writeFileSync(scopePath, scopeBase.replace('- [Mod](mod/mod.spec.md)', ''), 'utf-8');
      assert.strictEqual(resolveScopeDecomposition(scopePath).status, 'invalid');

      const moduleContent = [
        '# Mod',
        '<!--SECTION:MODULE_VISION-->',
        '## Module Vision',
        'Own feature behavior.',
        '<!--/SECTION:MODULE_VISION-->',
        '<!--SECTION:CHANGE_MANIFEST-->',
        '## Change Manifest',
        'ТИП ИЗМЕНЕНИЯ: refine',
        '<!--/SECTION:CHANGE_MANIFEST-->',
      ].join('\n');
      writeFileSync(scopePath, scopeBase, 'utf-8');
      writeFileSync(modulePath, moduleContent, 'utf-8');
      const decomposition = resolveScopeDecomposition(scopePath);
      assert.strictEqual(decomposition.status, 'complete');
      assert.strictEqual(resolveTaskOwnership(scopePath, 'mod').status, 'owned');

      const targets = [relative(root, scopePath), relative(root, modulePath)].sort();
      const targetSet = formatCriticTargetSet(targets);
      const writeSet = targetSet;
      const state = formatCriticChangedState([
        {
          path: targets[0] as string,
          content: readFileSync(join(root, targets[0] as string), 'utf-8'),
          primary: targets[0] === relative(root, scopePath),
        },
        {
          path: targets[1] as string,
          content: readFileSync(join(root, targets[1] as string), 'utf-8'),
          primary: targets[1] === relative(root, scopePath),
        },
      ]);
      const capped = `${scopeBase}\n${criticRounds(targetSet, writeSet)}`;
      assert.match(
        checkCriticReadinessForTargetSet(
          relative(root, scopePath),
          capped,
          targets,
          state,
          targets
        )[0]?.code ?? '',
        /SDD_CRITIC_OPERATOR_DECISION_INVALID/
      );
      const continued = capped
        .replace('- Operator-decision: CLEAN', '- Operator-decision: CONTINUE THROUGH ROUND 6')
        .concat(
          `\n### Round 6 — 2026-08-26\n- Verdict: CLEAN\n- Target-set: ${targetSet}\n- Write-set: ${writeSet}\n- Changed-state: ${state}\n- Dispatch: continued\n- Changes: none\n- Operator-decision: CLEAN`
        );
      assert.deepStrictEqual(
        checkCriticReadinessForTargetSet(
          relative(root, scopePath),
          continued,
          targets,
          state,
          targets
        ),
        []
      );

      const scaffold = runCli(
        ['sdd-new', 'task', '--scope', 'app', '--module', 'mod', '--id', 'APP-feature'],
        root
      );
      assert.strictEqual(scaffold.exitCode, 0, scaffold.stdout + scaffold.stderr);
      const ticketRel = 'specs/app/mod/mod.task.APP-feature.md';
      const ticketPath = join(root, ticketRel);
      assert.ok(readFileSync(ticketPath, 'utf-8').includes('Task-ID'));
      const reader = 'node tools/read-json.cjs coverage/coverage-final.json';
      writeFileSync(
        ticketPath,
        [
          '<!--SECTION:META-->',
          '- **Task-ID:** APP-feature',
          '- **Status:** [ ] TODO',
          '- **Scope:** app',
          '- **Module:** mod',
          '<!--/SECTION:META-->',
          '<!--SECTION:PHASES_OVERVIEW-->',
          '| ID | Kind | Deps | Status |',
          '|---|---|---|---|',
          '| P1 | test | — | [ ] |',
          '| P2 | test | P1 | [ ] |',
          '<!--/SECTION:PHASES_OVERVIEW-->',
          '<!--SECTION:PHASE_P1-->',
          '- **Target Files:**',
          '  - src/feature.test.ts',
          '<!--/SECTION:PHASE_P1-->',
          '<!--SECTION:PHASE_P2-->',
          '- **Rules:**',
          '  - COVERAGE-RULE',
          '- **Target Files:**',
          '  - src/feature.ts',
          '<!--/SECTION:PHASE_P2-->',
          '<!--SECTION:VERIFICATION-->',
          '<!--PHASE_RECEIPTS:v1-->',
          '<!--COVERAGE_POLICY:v1-->',
          '- **Coverage Policy:** required',
          '- **Coverage Owner Phase:** P2',
          '| Command | Required by | Role |',
          '|---|---|---|',
          `| ${reader} | COVERAGE-RULE | coverage |`,
          '<!--/SECTION:VERIFICATION-->',
          '<!--SECTION:EXECUTION_LOG-->',
          '## Execution Log',
          '<!--/SECTION:EXECUTION_LOG-->',
        ].join('\n'),
        'utf-8'
      );
      const readiness = runCli(['sdd-state'], root);
      assert.match(readiness.stdout, /READINESS=ready/, readiness.stdout + readiness.stderr);
      const verifyP1 = runCli(['sdd-verify', '--task', ticketRel, '--phase', 'P1'], root);
      assert.strictEqual(verifyP1.exitCode, 0, verifyP1.stdout + verifyP1.stderr);
      let ticket = readFileSync(ticketPath, 'utf-8').replace(
        '| P1 | test | — | [ ] |',
        '| P1 | test | — | [x] |'
      );
      writeFileSync(ticketPath, ticket, 'utf-8');
      const verifyP2 = runCli(['sdd-verify', '--task', ticketRel, '--phase', 'P2'], root);
      assert.strictEqual(verifyP2.exitCode, 0, verifyP2.stdout + verifyP2.stderr);
      ticket = readFileSync(ticketPath, 'utf-8').replace(
        '| P2 | test | P1 | [ ] |',
        '| P2 | test | P1 | [x] |'
      );
      writeFileSync(ticketPath, ticket, 'utf-8');
      assert.strictEqual(runCli(['sdd-check', '--task', ticketRel], root).exitCode, 0);
      writeFileSync(join(root, 'src/feature.ts'), 'export const feature = 2;\n');
      assert.match(
        runCli(['sdd-check', '--task', ticketRel], root).stdout,
        /SDD_PHASE_RECEIPT_STALE_TARGETS/
      );
      assert.strictEqual(
        runCli(['sdd-verify', '--task', ticketRel, '--phase', 'P2'], root).exitCode,
        0
      );
      ticket = readFileSync(ticketPath, 'utf-8');
      assert.strictEqual(runCli(['sdd-check', '--task', ticketRel], root).exitCode, 0);
      const beforeFull = readFileSync(join(root, 'src/feature.ts'), 'utf-8');
      assert.strictEqual(runCli(['sdd-verify', '--profile', 'full'], root).exitCode, 0);
      assert.strictEqual(readFileSync(join(root, 'src/feature.ts'), 'utf-8'), beforeFull);
      const auditContext = runCli(['sdd-task', '--group-scope', 'APP-feature'], root);
      assert.strictEqual(auditContext.exitCode, 0, auditContext.stdout + auditContext.stderr);
      assert.match(auditContext.stdout, /coverage-gates:/);
      assert.match(auditContext.stdout, /owner P2/);
      assert.match(auditContext.stdout, /coverage-final\.json/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
