// @file: Causal tests for the V1 tooling purge and fresh V2 migration runtime transaction.
// @spec: CLI-SDD-MIGRATE
// @consumers: migration-bootstrap.ts

import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { bootstrapMigrationRuntime } from '../migration-bootstrap.ts';
import { normalize, SYNC_SKILLS_PATH_RULES } from '../../common/sync/path-normalizer.ts';

const roots: string[] = [];
const V1_CRITIC = resolve(import.meta.dirname, 'fixtures/v1-sdd-critic.SKILL.md');
const V1_SETUP = resolve(import.meta.dirname, 'fixtures/v1-sdd-setup.SKILL.md');

function tempRoot(name: string): string {
  const root = mkdtempSync(join(tmpdir(), `${name}-`));
  roots.push(root);
  return root;
}

function put(root: string, rel: string, text: string | Buffer): void {
  const path = join(root, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

function sources(): { root: string; directives: string; skills: string } {
  const root = tempRoot('migration-bootstrap-source');
  const directives = join(root, 'directives');
  const skills = join(root, 'skills');
  put(directives, 'router.directive.xml', '<Router>current</Router>\n');
  put(directives, 'migration-v1-v2.directive.xml', '<Migration>current</Migration>\n');
  put(directives, 'formats/module-spec-structure.xml', '<Format>current</Format>\n');
  put(skills, 'sdd/SKILL.md', 'current router\n');
  put(skills, 'sdd-critic/SKILL.md', 'current critic\n');
  return { root, directives, skills };
}

function v1CriticBytes(): string {
  return normalize(readFileSync(V1_CRITIC, 'utf-8'), SYNC_SKILLS_PATH_RULES);
}

function v1SetupBytes(): string {
  return normalize(readFileSync(V1_SETUP, 'utf-8'), SYNC_SKILLS_PATH_RULES);
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('bootstrapMigrationRuntime', () => {
  it('dry-run plans a full current runtime without changing V1 specs, tasks, or tooling', () => {
    const consumer = tempRoot('migration-bootstrap-consumer');
    const source = sources();
    put(consumer, 'specs/demo/demo.spec.md', 'spec bytes\n');
    put(consumer, 'tasks/demo/demo.task-1.md', 'task bytes\n');
    put(consumer, '.claude/skills/sdd-critic/SKILL.md', v1CriticBytes());
    put(consumer, '.claude/skills/sdd-setup/SKILL.md', v1SetupBytes());
    put(consumer, '.claude/skills/.gennady-synced', 'sdd-critic\nsdd-critic/SKILL.md\n');
    mkdirSync(join(consumer, 'ai/directives/sdd'), { recursive: true });

    const beforeSpec = readFileSync(join(consumer, 'specs/demo/demo.spec.md'));
    const beforeTask = readFileSync(join(consumer, 'tasks/demo/demo.task-1.md'));
    const beforeCritic = readFileSync(join(consumer, '.claude/skills/sdd-critic/SKILL.md'));
    const result = bootstrapMigrationRuntime(consumer, source.directives, source.skills, false);

    assert.equal(result.ok, true);
    assert.ok(
      result.ok && result.actions.some((action) => action.path.includes('router.directive'))
    );
    assert.deepEqual(readFileSync(join(consumer, 'specs/demo/demo.spec.md')), beforeSpec);
    assert.deepEqual(readFileSync(join(consumer, 'tasks/demo/demo.task-1.md')), beforeTask);
    assert.deepEqual(
      readFileSync(join(consumer, '.claude/skills/sdd-critic/SKILL.md')),
      beforeCritic
    );
    assert.equal(existsSync(join(consumer, 'ai/directives/sdd-v2')), false);
  });

  it('replaces same-name V1 bytes, installs the full source surface, and is idempotent', () => {
    const consumer = tempRoot('migration-bootstrap-consumer');
    const source = sources();
    put(consumer, 'specs/demo/demo.spec.md', 'spec bytes\n');
    put(consumer, 'tasks/demo/demo.task-1.md', 'task bytes\n');
    put(consumer, '.claude/skills/sdd-critic/SKILL.md', v1CriticBytes());
    put(consumer, '.claude/skills/.gennady-synced', 'sdd-critic\nsdd-critic/SKILL.md\n');

    const result = bootstrapMigrationRuntime(consumer, source.directives, source.skills, true);

    assert.equal(result.ok, true);
    assert.equal(
      readFileSync(join(consumer, '.claude/skills/sdd-critic/SKILL.md'), 'utf-8'),
      'current critic\n'
    );
    assert.equal(
      readFileSync(join(consumer, '.claude/skills/sdd/SKILL.md'), 'utf-8'),
      'current router\n'
    );
    assert.equal(
      readFileSync(
        join(consumer, 'ai/directives/sdd-v2/formats/module-spec-structure.xml'),
        'utf-8'
      ),
      '<Format>current</Format>\n'
    );
    assert.equal(readFileSync(join(consumer, 'specs/demo/demo.spec.md'), 'utf-8'), 'spec bytes\n');
    assert.equal(
      readFileSync(join(consumer, 'tasks/demo/demo.task-1.md'), 'utf-8'),
      'task bytes\n'
    );
    assert.equal(existsSync(join(consumer, '.claude/skills/sdd-setup')), false);
    assert.equal(existsSync(join(consumer, 'ai/directives/sdd')), false);
    const second = bootstrapMigrationRuntime(consumer, source.directives, source.skills, true);
    assert.deepEqual(second, { ok: true, actions: [] });
  });

  it('blocks modified package-owned V1 bytes before every write', () => {
    const consumer = tempRoot('migration-bootstrap-consumer');
    const source = sources();
    put(consumer, '.claude/skills/sdd-critic/SKILL.md', `${v1CriticBytes()}\nlocal edit\n`);
    put(consumer, '.claude/skills/.gennady-synced', 'sdd-critic\nsdd-critic/SKILL.md\n');

    const result = bootstrapMigrationRuntime(consumer, source.directives, source.skills, true);

    assert.equal(result.ok, false);
    assert.ok(!result.ok && result.errors.some((error) => error.includes('sdd-critic/SKILL.md')));
    assert.equal(existsSync(join(consumer, 'ai/directives/sdd-v2')), false);
    assert.match(
      readFileSync(join(consumer, '.claude/skills/sdd-critic/SKILL.md'), 'utf-8'),
      /local edit/
    );
  });

  it('blocks an unknown file inside a manifested V1 skill instead of sweeping it', () => {
    const consumer = tempRoot('migration-bootstrap-consumer');
    const source = sources();
    put(consumer, '.claude/skills/sdd-critic/SKILL.md', v1CriticBytes());
    put(consumer, '.claude/skills/sdd-critic/local.md', 'project-owned note\n');
    put(consumer, '.claude/skills/.gennady-synced', 'sdd-critic\nsdd-critic/SKILL.md\n');

    const result = bootstrapMigrationRuntime(consumer, source.directives, source.skills, true);

    assert.equal(result.ok, false);
    assert.ok(!result.ok && result.errors.some((error) => error.includes('local.md')));
    assert.equal(
      readFileSync(join(consumer, '.claude/skills/sdd-critic/local.md'), 'utf-8'),
      'project-owned note\n'
    );
  });

  it('blocks an unknown historical manifest entry even when its old directory is absent', () => {
    const consumer = tempRoot('migration-bootstrap-consumer');
    const source = sources();
    put(consumer, '.claude/skills/.gennady-synced', 'retired-from-unknown-v1\n');

    const result = bootstrapMigrationRuntime(consumer, source.directives, source.skills, true);

    assert.equal(result.ok, false);
    assert.ok(
      !result.ok && result.errors.some((error) => error.includes('retired-from-unknown-v1'))
    );
    assert.equal(existsSync(join(consumer, 'ai/directives/sdd-v2')), false);
  });

  it('blocks an unknown file anywhere under the legacy directive root', () => {
    const consumer = tempRoot('migration-bootstrap-consumer');
    const source = sources();
    put(consumer, 'ai/directives/sdd/project-rule.xml', '<ProjectRule/>\n');

    const result = bootstrapMigrationRuntime(consumer, source.directives, source.skills, true);

    assert.equal(result.ok, false);
    assert.ok(!result.ok && result.errors.some((error) => error.includes('project-rule.xml')));
    assert.equal(
      readFileSync(join(consumer, 'ai/directives/sdd/project-rule.xml'), 'utf-8'),
      '<ProjectRule/>\n'
    );
    assert.equal(existsSync(join(consumer, 'ai/directives/sdd-v2')), false);
  });

  it('blocks a symlink at a managed legacy or fresh-runtime path without following it', () => {
    const consumer = tempRoot('migration-bootstrap-consumer');
    const source = sources();
    put(consumer, 'outside.txt', 'must survive\n');
    mkdirSync(join(consumer, 'ai/directives'), { recursive: true });
    symlinkSync(join(consumer, 'outside.txt'), join(consumer, 'ai/directives/sdd'));

    const result = bootstrapMigrationRuntime(consumer, source.directives, source.skills, true);

    assert.equal(result.ok, false);
    assert.ok(!result.ok && result.errors.some((error) => error.includes('symlink')));
    assert.equal(readFileSync(join(consumer, 'outside.txt'), 'utf-8'), 'must survive\n');
    assert.equal(existsSync(join(consumer, 'ai/directives/sdd-v2')), false);
  });
});
