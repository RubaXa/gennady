// @file: Project-owned D-60 verification scope without weakening generic consumer full profiles.
// @spec: INFRA-BASE
// @consumers: deterministic release gate, pre-commit

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { it } from 'node:test';
import { resolveNodeVerifyPlan } from '../../plugins/node/node-planner.ts';

const ROOT = resolve(import.meta.dirname, '../..');
const CODE = ['node:type-check', 'node:lint-fix', 'node:lint', 'node:format-fix', 'node:format'];

it('the real project full selector preserves code, unit and coverage while experimental integration stays explicit', () => {
  const project = resolveNodeVerifyPlan(ROOT, 'full', { homeDirectory: ROOT });
  assert.deepEqual(
    project.plan.steps.map((step) => step.id),
    [...CODE, 'node:unit', 'node:coverage']
  );
  assert.equal(
    project.composed.provenance.get('verify.presets.node.phases.full.include'),
    'gennady.yaml'
  );
  assert.deepEqual(project.plan.steps.find((step) => step.id === 'node:unit')?.command?.argv, [
    'npm',
    'run',
    'test',
  ]);
  assert.deepEqual(project.plan.steps.find((step) => step.id === 'node:coverage')?.command?.argv, [
    'npm',
    'run',
    'test:coverage',
  ]);
  const explicit = resolveNodeVerifyPlan(ROOT, 'integration', { homeDirectory: ROOT });
  assert.ok(explicit.plan.steps.some((step) => step.id === 'node:integration'));
});

it('a generic zero-config Node consumer still requires integration in full', () => {
  const root = mkdtempSync(join(tmpdir(), 'gennady-generic-full-'));
  try {
    writeFileSync(
      join(root, 'package.json'),
      readFileSync(join(ROOT, 'plugins/node/__tests__/fixtures/zero-yaml/package.json'))
    );
    const generic = resolveNodeVerifyPlan(root, 'full', { homeDirectory: root });
    assert.deepEqual(
      generic.plan.steps.map((step) => step.id),
      [...CODE, 'node:unit', 'node:coverage', 'node:integration']
    );
    assert.equal(
      generic.composed.provenance.get('verify.presets.node.phases.full.include'),
      'builtin:node'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
