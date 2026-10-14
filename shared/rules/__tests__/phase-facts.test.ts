// @file: Contract tests for deterministic open-vocabulary phase classification.
// @consumers: CI
// @spec: CLI-RULES

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifyPhaseFacts } from '../phase-facts.ts';

describe('PhaseFacts classifier', () => {
  it('distinguishes TypeScript production from a Vitest test artifact without closing vocabulary', () => {
    const facts = classifyPhaseFacts({
      targetFiles: ['src/feature.ts', 'src/feature.test.ts'],
      plannedFiles: [],
      artifacts: [{ path: 'src/feature.test.ts', frameworks: ['Vitest'] }],
      operations: ['Implement'],
      intents: ['Feature'],
      platforms: ['Linux'],
      tools: ['Vite'],
      project: { runtime: ['Node-22'] },
    });

    assert.deepEqual(facts.artifacts, [
      {
        path: 'src/feature.test.ts',
        origins: ['target'],
        languages: ['typescript'],
        roles: ['test'],
        frameworks: ['vitest'],
      },
      {
        path: 'src/feature.ts',
        origins: ['target'],
        languages: ['typescript'],
        roles: ['production'],
        frameworks: [],
      },
    ]);
    assert.deepEqual(facts.providers, ['node']);
    assert.deepEqual(facts.operations, ['implement']);
    assert.deepEqual(facts.project, { runtime: ['node-22'] });
    assert.equal(Object.isFrozen(facts), true);
    assert.equal(Object.isFrozen(facts.artifacts), true);
    assert.equal(Object.isFrozen(facts.artifacts[0]?.frameworks), true);
  });

  it('classifies a mixed TypeScript, Go, CSS and Bash scope as a deterministic provider union', () => {
    const facts = classifyPhaseFacts({
      targetFiles: ['web/theme.css', 'src/main.ts'],
      plannedFiles: ['cmd/main.go', 'scripts/release.sh'],
    });

    assert.deepEqual(
      facts.artifacts.map(({ path, languages }) => [path, languages]),
      [
        ['cmd/main.go', ['go']],
        ['scripts/release.sh', ['bash']],
        ['src/main.ts', ['typescript']],
        ['web/theme.css', ['css']],
      ]
    );
    assert.deepEqual(facts.providers, ['bash', 'css', 'golang', 'node']);
  });

  it('preserves exact target, planned and tombstone membership on merged artifacts', () => {
    const facts = classifyPhaseFacts({
      targetFiles: ['src/current.ts'],
      plannedFiles: ['src/current.ts', 'cmd/new.go'],
      tombstoneFiles: ['legacy/removed.swift'],
    });

    assert.deepEqual(facts.targetFiles, ['src/current.ts']);
    assert.deepEqual(facts.plannedFiles, ['cmd/new.go', 'src/current.ts']);
    assert.deepEqual(facts.tombstoneFiles, ['legacy/removed.swift']);
    assert.deepEqual(
      facts.artifacts.map(({ path, origins }) => [path, origins]),
      [
        ['cmd/new.go', ['planned']],
        ['legacy/removed.swift', ['tombstone']],
        ['src/current.ts', ['planned', 'target']],
      ]
    );
    assert.deepEqual(facts.providers, ['golang', 'node', 'swift']);
  });

  it('is independent of input insertion order', () => {
    const left = classifyPhaseFacts({
      targetFiles: ['b.go', 'a.ts'],
      plannedFiles: ['z.css'],
      operations: ['verify', 'build'],
      project: { package: ['b', 'a'], mode: ['strict'] },
    });
    const right = classifyPhaseFacts({
      targetFiles: ['a.ts', 'b.go'],
      plannedFiles: ['z.css'],
      operations: ['build', 'verify'],
      project: { mode: ['strict'], package: ['a', 'b'] },
    });

    assert.deepEqual(left, right);
  });

  it('fails closed for unsafe scope and unscoped explicit artifact facts', () => {
    assert.throws(
      () => classifyPhaseFacts({ targetFiles: ['../escape.ts'], plannedFiles: [] }),
      /PHASE_FACTS_INVALID: targetFiles/
    );
    assert.throws(
      () =>
        classifyPhaseFacts({
          targetFiles: ['src/current.ts'],
          plannedFiles: [],
          artifacts: [{ path: 'src/other.ts', frameworks: ['vitest'] }],
        }),
      /PHASE_FACTS_UNSCOPED_ARTIFACT: src\/other\.ts/
    );
    assert.throws(
      () =>
        classifyPhaseFacts({
          targetFiles: [],
          plannedFiles: [],
          project: { Runtime: ['node'], runtime: ['bun'] },
        }),
      /PHASE_FACTS_DUPLICATE_PROJECT_KEY: runtime/
    );
  });
});
