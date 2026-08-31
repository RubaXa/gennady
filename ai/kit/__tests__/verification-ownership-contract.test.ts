// @file: Structural contract tests for repair-first phase verification and single-owner group full.
// @consumers: SDD v2 directive authors
// @tasks: N/A

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const read = (path: string): string => readFileSync(path, 'utf-8');

describe('verification ownership contract', () => {
  it('repair bricks forward caller-owned scope; phase repair derives an exact context', () => {
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
    const readOnly = pkg.scripts['lint:contracts'];
    const repair = pkg.scripts['lint:fix'];
    const formatRepair = pkg.scripts['format:fix'];
    const wholeRepair = pkg.scripts.fix;

    assert.match(readOnly, /gennady\.ts lint cli\/ shared\/ services\//);
    assert.match(repair, /gennady\.ts lint --autofix$/);
    assert.match(formatRepair, /--write$/);
    assert.doesNotMatch(repair, /--autofix\s+\S/);
    assert.doesNotMatch(formatRepair, /--write\s+\S/);
    assert.match(wholeRepair, /lint:fix -- cli\/ shared\/ services\//);

    const phase = read('ai/kit/templates/sdd-v2/phase-execution-protocol.directive.hbs');
    assert.match(phase, /sdd-verify --task <ticket-path> --phase <PhaseID>/);
    assert.match(phase, /derives profile, exact\s+Target Files, owning spec/s);
    assert.match(
      phase,
      /performs exact-target\s+repair through ordered formatter\/project-linter\/Gennady-contract adapters,[\s\S]*applicable exact targets,[\s\S]*under a runtime before\/after write-zone/
    );
    assert.doesNotMatch(phase, /--target <each exact Target File/);
  });

  it('phase protocol is repair-first and runs foundation once without public quality duplicates', () => {
    const source = read('ai/kit/templates/sdd-v2/phase-execution-protocol.directive.hbs');
    const step = source.match(/<Step id="STEP_5_VERIFY">([\s\S]*?)<\/Step>/)?.[1] ?? '';

    assert.match(step, /performs exact-target\s+repair[\s\S]*one foundation run/);
    assert.match(step, /one mechanical owner/);
    assert.match(step, /Do not reconstruct arguments/);
    assert.doesNotMatch(step, /fingerprint|re-run после мутаций/);
  });

  it('authorizes only declarative deletion and scopes verification to one invocation per attempt', () => {
    const phase = read('ai/kit/templates/sdd-v2/phase-execution-protocol.directive.hbs');
    const scope = read('ai/kit/axiom/process/ax-phase-scope-lock.xml');
    const bash = read('ai/kit/axiom/process/ax-permitted-bash-commands.xml');
    assert.match(phase, /remove every declared Deleted File/);
    assert.match(phase, /exact `unlink`/);
    assert.match(phase, /Never use a glob\/recursive delete/);
    assert.match(scope, /remove only exact paths declared under `Deleted Files`/);
    assert.match(scope, /tombstones, never repair targets/);
    assert.match(bash, /exactly once per attempt/);
    assert.match(bash, /failed verification has no receipt.*new attempt/s);
  });

  it('execute delegates group full; audit STEP_1 is its sole flow owner', () => {
    const execute = read('ai/kit/templates/sdd-v2/execute.directive.hbs');
    const executeAudit = execute.match(/<Step id="STEP_5_AUDIT">([\s\S]*?)<\/Step>/)?.[1] ?? '';
    const audit = read('ai/kit/templates/sdd-v2/audit.directive.hbs');
    const auditMechanical = audit.match(/<Step id="STEP_1_MECHANICAL">([\s\S]*?)<\/Step>/)?.[1] ?? '';

    assert.match(executeAudit, /do NOT\s+run `sdd-verify --profile full` here first/);
    assert.match(executeAudit, /audit is the SINGLE owner/);
    assert.match(
      auditMechanical,
      /<ToolCall owner="audit-worker" result="verification">npx gennady sdd-verify --profile full<\/ToolCall>/
    );
    assert.match(auditMechanical, /lint --include-tests --spec=.*AuditContext/);
    assert.match(auditMechanical, /named phase owns the ticket-phase producer and full owns its\s+separate audit run/s);
    assert.match(auditMechanical, /required \(owner P<N>\) — <command>.*VERBATIM/s);
  });

  it('pre-commit is separate read-only whole-project production assurance plus directive audits', () => {
    const hook = read('scripts/git-hooks/pre-commit');
    const executable = hook
      .split('\n')
      .filter((line) => line.trim() !== '' && !line.trimStart().startsWith('#'))
      .join('\n');

    assert.match(executable, /npm run check \|\| fail/);
    for (const gate of [
      'check:directives-fresh',
      'audit:axioms',
      'audit:contracts',
      'audit:halts',
      'check:directive-budgets',
    ]) {
      assert.match(executable, new RegExp(`npm run ${gate.replace(':', '\\:')}`));
    }
    assert.doesNotMatch(executable, /^npm run fix\b/m);
  });

  it('pre-commit forces all untracked paths even when user status config hides them', () => {
    const root = mkdtempSync(join(tmpdir(), 'precommit-untracked-'));
    const status = (...args: string[]): string =>
      execFileSync('git', args, { cwd: root, encoding: 'utf8' });
    try {
      status('init');
      status('config', 'status.showUntrackedFiles', 'no');
      writeFileSync(join(root, 'untracked.ts'), 'export const hidden = true;\n');
      assert.strictEqual(status('status', '--porcelain=v1'), '');
      assert.match(status('status', '--porcelain=v1', '--untracked-files=all'), /^\?\? untracked\.ts/m);

      const hook = read('scripts/git-hooks/pre-commit');
      assert.match(hook, /git status --porcelain=v1 --untracked-files=all/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
