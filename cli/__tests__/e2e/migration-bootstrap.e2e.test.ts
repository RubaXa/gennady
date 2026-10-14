// @file: Packed-package V1 consumer bootstrap → migration → V2 sync proof.
// @spec: CLI-SDD-MIGRATE
// @consumers: e2e.test.ts

import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { getContext } from './setup.ts';

const V1_SPEC = '# core\n## 1. Module Vision\nLegacy module.\n';
const V1_TICKET = [
  '# Task: TSK-1 — Demo',
  '## 1. Meta',
  '- **Task-ID:** TSK-1 | **Status:** [ ] TODO | **Scope:** demo | **Module:** core | **Dependencies:** None',
  '- **Purpose:** migrate one ticket.',
  '## 7. Execution Log',
  '- [ ] TODO',
].join('\n');

function put(root: string, rel: string, content: string): void {
  const path = join(root, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf-8');
}

function cleanup(): void {
  const { cwd } = getContext();
  for (const rel of ['ai', '.claude', 'specs', 'tasks', 'migration']) {
    rmSync(join(cwd, rel), { recursive: true, force: true });
  }
}

export function registerMigrationBootstrapTests(): void {
  describe('packed V1 migration bootstrap', () => {
    afterEach(cleanup);

    it('uses installed tarball assets, preserves migration input, removes tasks on final move, then permits sync', async () => {
      const { cwd, spawn } = getContext();
      cleanup();
      put(cwd, 'specs/demo/core/core.spec.md', V1_SPEC);
      put(cwd, 'tasks/demo/core/core.task-1.md', V1_TICKET);
      const specBefore = readFileSync(join(cwd, 'specs/demo/core/core.spec.md'));
      const ticketBefore = readFileSync(join(cwd, 'tasks/demo/core/core.task-1.md'));

      const dry = await spawn(['sdd-migrate', 'bootstrap', '.']);
      assert.equal(dry.exitCode, 0, dry.stderr || dry.stdout);
      assert.match(dry.stdout, /DRY-RUN/);
      assert.equal(existsSync(join(cwd, 'ai/directives/sdd-v2')), false);
      assert.deepEqual(readFileSync(join(cwd, 'specs/demo/core/core.spec.md')), specBefore);
      assert.deepEqual(readFileSync(join(cwd, 'tasks/demo/core/core.task-1.md')), ticketBefore);

      const bootstrap = await spawn(['sdd-migrate', 'bootstrap', '.', '--write']);
      assert.equal(bootstrap.exitCode, 0, bootstrap.stderr || bootstrap.stdout);
      assert.ok(existsSync(join(cwd, 'ai/directives/sdd-v2/migration-v1-v2.directive.xml')));
      assert.ok(existsSync(join(cwd, '.claude/skills/sdd/SKILL.md')));
      assert.deepEqual(readFileSync(join(cwd, 'specs/demo/core/core.spec.md')), specBefore);
      assert.deepEqual(readFileSync(join(cwd, 'tasks/demo/core/core.task-1.md')), ticketBefore);

      const state = await spawn(['sdd-state', '.']);
      assert.equal(state.exitCode, 0, state.stderr || state.stdout);
      assert.match(state.stdout, /FLOW_VERSION=v1/);

      const plan = await spawn(['sdd-migrate', 'plan', '.', '--write']);
      assert.equal(plan.exitCode, 0, plan.stderr || plan.stdout);
      const unitPath = join(cwd, 'migration/demo/core/core.spec.migration.md');
      const mapped = readFileSync(unitPath, 'utf-8')
        .replace('- **Status:** PLANNED', '- **Status:** APPROVED')
        .replace(
          '| `tasks/demo/core/core.task-1.md` | TSK-1 | ? | ? |',
          '| `tasks/demo/core/core.task-1.md` | TSK-1 | DEMO-alpha | `specs/demo/core/core.task.DEMO-alpha.md` |'
        );
      writeFileSync(unitPath, mapped, 'utf-8');

      const ids = await spawn(['sdd-migrate', 'ids', '.', '--from-plan', '--write']);
      assert.equal(ids.exitCode, 0, ids.stderr || ids.stdout);
      const move = await spawn(['sdd-migrate', 'move', '.', '--scope', 'demo', '--write']);
      assert.equal(move.exitCode, 0, move.stderr || move.stdout);
      assert.equal(existsSync(join(cwd, 'tasks')), false);

      const finalState = await spawn(['sdd-state', '.']);
      assert.equal(finalState.exitCode, 0, finalState.stderr || finalState.stdout);
      assert.match(finalState.stdout, /FLOW_VERSION=v2/);
      const sync = await spawn(['sync', '--dry-run']);
      assert.equal(sync.exitCode, 0, sync.stderr || sync.stdout);
    });
  });
}
