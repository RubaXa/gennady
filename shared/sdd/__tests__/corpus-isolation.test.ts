// @file: Historical embedded tickets cannot contaminate live Task-ID discovery or public execution maps.
// @spec: SHARED
// @consumers: ticket-resolve, task-id, sdd-task

import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { collectTicketCorpus, resolveTicketArg } from '../ticket-resolve.ts';
import { resolvePhaseContext } from '../../../cli/cmd/sdd-verify/phase-context.ts';
import { collectTaskIds } from '../task-id.ts';

const ROOT = resolve(import.meta.dirname, '../../..');
const temporary: string[] = [];

function write(root: string, path: string, text: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

function ticket(id: string): string {
  return `<!--SECTION:META-->\n- **Task-ID:** ${id}\n- **Status:** [ ] TODO\n<!--/SECTION:META-->\n<!--SECTION:EXECUTION_LOG-->\n- pending\n<!--/SECTION:EXECUTION_LOG-->\n`;
}

afterEach(() => {
  for (const root of temporary.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('live SDD corpus isolation', () => {
  it('keeps anchored V1 scopes inspection-only while allowing a migrated V2 sibling', () => {
    const root = mkdtempSync(join(tmpdir(), 'sdd-mixed-boundary-'));
    temporary.push(root);
    write(root, 'tasks/legacy/legacy.task-1.md', ticket('LEG-work'));
    write(root, 'specs/current/current.task.CUR-work.md', ticket('CUR-work'));
    write(root, 'specs/current/current.3-tasks.md', '# Current tracker\n');
    assert.ok(resolveTicketArg('tasks/legacy/legacy.task-1.md', root).ok);
    assert.equal(resolveTicketArg('tasks/legacy/legacy.task-1.md', root, 'execution').ok, false);
    assert.equal(resolveTicketArg('LEG-work', root, 'execution').ok, false);
    assert.ok(resolveTicketArg('CUR-work', root, 'execution').ok);
    assert.equal(resolvePhaseContext('tasks/legacy/legacy.task-1.md', 'P1', root).ok, false);
    const loader = join(ROOT, 'node_modules/tsx/dist/loader.mjs');
    for (const args of [
      ['sdd-task', 'tasks/legacy/legacy.task-1.md', '--phase', 'P1'],
      ['sdd-verify', '--task', 'tasks/legacy/legacy.task-1.md', '--phase', 'P1'],
      ['sdd-log', 'tasks/legacy/legacy.task-1.md', 'line', 'diagnostic'],
      ['sdd-sync', 'tasks/legacy/legacy.task-1.md'],
    ]) {
      const result = spawnSync(
        process.execPath,
        ['--import', loader, join(ROOT, 'cli/gennady.ts'), ...args],
        { cwd: root, encoding: 'utf8' }
      );
      assert.notEqual(result.status, 0, args.join(' '));
      assert.match(result.stdout + result.stderr, /Legacy V1 scope|V1→V2 scope migration/);
    }
    const map = spawnSync(
      process.execPath,
      ['--import', loader, join(ROOT, 'cli/gennady.ts'), 'sdd-task', '.'],
      { cwd: root, encoding: 'utf8' }
    );
    assert.equal(map.status, 0, map.stderr);
    assert.match(map.stdout, /blocked: LEG-work[^\n]*V1→V2 migration required/);
  });
  it('excludes exact evidence roots while retaining project specs with matching scope names', () => {
    const root = mkdtempSync(join(tmpdir(), 'sdd-corpus-isolation-'));
    temporary.push(root);
    for (const path of [
      'ai/flow-sim/scenarios/example.md',
      'ai/flow-eval/example.md',
      'migration/example.md',
    ]) {
      write(root, path, ticket('DEMO-fixture'));
    }
    write(root, 'specs/flow-sim/flow-sim.task.APP-real.md', ticket('APP-real'));
    write(root, 'specs/migration/migration.task.MIG-real.md', ticket('MIG-real'));
    write(root, 'ai/project/project.task.AI-real.md', ticket('AI-real'));
    const corpus = collectTicketCorpus(root);
    assert.ok(corpus.ok);
    assert.deepEqual(corpus.refs.map((ref) => ref.taskId).sort(), [
      'AI-real',
      'APP-real',
      'MIG-real',
    ]);
    assert.deepEqual(collectTaskIds(root).sort(), ['AI-real', 'APP-real', 'MIG-real']);
    assert.ok(
      resolveTicketArg('ai/flow-sim/scenarios/example.md', root).ok,
      'inspection stays available'
    );
    assert.equal(resolveTicketArg('ai/flow-sim/scenarios/example.md', root, 'execution').ok, false);
    assert.equal(resolvePhaseContext('ai/flow-sim/scenarios/example.md', 'P1', root).ok, false);
  });
  it('keeps historical fixtures out of the real public sdd-task execution map', () => {
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', 'cli/gennady.ts', 'sdd-task', '.'],
      {
        cwd: ROOT,
        encoding: 'utf8',
      }
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /execution map/);
    assert.doesNotMatch(
      result.stdout,
      /ai\/flow-sim|APP-greet-greeting|APP-check-quota|REMIND-schedule-scheduler/
    );
    const corpus = collectTicketCorpus(ROOT);
    assert.ok(corpus.ok);
    assert.ok(corpus.refs.length > 0);
    assert.ok(corpus.refs.every((ref) => !ref.file.includes('/ai/flow-sim/')));
  });
  it('rejects direct historical lifecycle/phase entrypoints without modifying evidence', () => {
    for (const args of [
      ['sdd-task', 'ai/flow-sim/scenarios/S7-execute-lifecycle.md'],
      ['sdd-verify', '--task', 'ai/flow-sim/scenarios/S7-execute-lifecycle.md', '--phase', 'P1'],
      ['sdd-log', 'ai/flow-sim/scenarios/S7-execute-lifecycle.md', 'line', 'diagnostic'],
    ]) {
      const result = spawnSync(process.execPath, ['--import', 'tsx', 'cli/gennady.ts', ...args], {
        cwd: ROOT,
        encoding: 'utf8',
      });
      assert.notEqual(result.status, 0, args.join(' '));
      assert.match(
        result.stdout + result.stderr,
        /Historical SDD evidence|read-only migration\/inspection/
      );
    }
  });
});
