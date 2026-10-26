// @file: Integrity and mechanical/semantic separation of known-label authoring controls.
// @spec: AI-SKILLS
// @consumers: semantic calibration corpus; source-owned authoring judge

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { it } from 'node:test';
import { buildAuthoringSemanticControls } from '../authoring-semantic-controls.ts';
import {
  buildAuthoringFixture,
  getAuthoringCase,
  checkAuthoringBenchmark,
} from '../authoring-benchmark.ts';
import { captureAuthoringJudgeEvidence } from '../authoring-judge-evidence.ts';

it('returns seven distinct hash-bound controls without sharing mutable truth with callers', () => {
  const controls = buildAuthoringSemanticControls();
  assert.equal(controls.length, 7);
  assert.equal(new Set(controls.map((row) => row.id)).size, 7);
  assert.equal(controls.filter((row) => row.expected === 'pass').length, 2);
  assert.equal(controls.filter((row) => row.expected === 'fail').length, 5);
  for (const row of controls) {
    assert.equal(row.artifactSha256, createHash('sha256').update(row.artifact).digest('hex'));
    assert.ok(row.labelEvidence.length > 40);
  }
  controls[0]!.expected = 'fail';
  controls[0]!.artifact = 'Injected answer';
  assert.equal(buildAuthoringSemanticControls()[0]!.expected, 'pass');
  assert.notEqual(buildAuthoringSemanticControls()[0]!.artifact, 'Injected answer');
});

it('positive controls satisfy the real source-owned oracle and all controls have complete bounded evidence', () => {
  for (const control of buildAuthoringSemanticControls()) {
    const root = mkdtempSync(join(tmpdir(), 'gennady-semantic-control-'));
    try {
      const definition = getAuthoringCase(control.caseId);
      const files = {
        ...buildAuthoringFixture(control.caseId),
        [definition.target]: control.artifact,
      };
      for (const [path, content] of Object.entries(files)) {
        mkdirSync(dirname(join(root, path)), { recursive: true });
        writeFileSync(join(root, path), content);
      }
      const evidence = captureAuthoringJudgeEvidence(root, control.caseId);
      assert.equal(evidence.complete, true, `${control.id}: ${evidence.reason}`);
      assert.equal(evidence.sha256, control.artifactSha256);
      if (control.expected === 'pass')
        assert.equal(checkAuthoringBenchmark(root, control.caseId).pass, true, control.id);
      // Expected labels are host scoring data, never a solution or verdict leaked to the model.
      assert.equal('expected' in evidence, false);
      assert.equal('labelEvidence' in evidence, false);
      if (control.caseId !== 'portal')
        assert.ok(evidence.references?.some((row) => row.path === 'specs/README.md'));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

it('domain controls change only the positive precondition and keep the original rejection clause', () => {
  const controls = buildAuthoringSemanticControls();
  const positive = controls.find((row) => row.id === 'library-tooling-dependency-valid')!;
  const disjoint =
    'передана ASCII-строка, которая содержит хотя бы один символ, отличный от пробела, underscore и hyphen';
  for (const [id, replacement] of [
    ['library-ascii-overlap', 'передана ASCII-строка'],
    ['library-nonempty-overlap', 'передана непустая ASCII-строка'],
  ]) {
    const negative = controls.find((row) => row.id === id)!;
    assert.equal(positive.artifact.replace(disjoint, replacement!), negative.artifact);
    assert.match(negative.artifact, /строка пустая, состоит из разделителей или содержит не-ASCII/);
    assert.match(negative.artifact, /вернуть полученный токен/);
    assert.match(negative.labelEvidence, /separator-only/);
  }
});
