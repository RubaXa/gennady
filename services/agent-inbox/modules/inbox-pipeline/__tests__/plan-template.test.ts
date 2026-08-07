// @file: Tests for PlanTemplate — deterministic DAG plan generation with 3-layer tracks (mandatory/triggered/proposed)
// @consumers: node:test runner
// @tasks: TSK-161

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { PlanTemplate } from '../plan-template.ts';
import type { ChangesetEntry, TrackSource } from '../plan-template.ts';
import type { TriggerRegistry, TriggeredTrack } from '../trigger-registry.ts';

function createTriggerRegistry(
  resolve?: (files: string[]) => TriggeredTrack[]
): TriggerRegistry {
  return {
    resolve: mock.fn(resolve ?? (() => [])),
  } as unknown as TriggerRegistry;
}

function entry(
  path: string,
  action: 'added' | 'modified' | 'deleted' = 'modified'
): ChangesetEntry {
  return { path, action };
}

describe('PlanTemplate', () => {
  it('contract: lens and track specs discriminated', () => {
    const registry = createTriggerRegistry();
    const template = new PlanTemplate(registry);
    const changeset: ChangesetEntry[] = [
      entry('src/index.ts'),
      entry('tests/index.test.ts'),
      entry('README.md'),
    ];

    const result = template.generate('test/project!42', changeset);

    const mandatory = result.tracks.filter((t) => t.source === 'mandatory');
    assert.ok(mandatory.length >= 1);
    for (const track of result.tracks) {
      const s: TrackSource = track.source;
      assert.ok(
        s === 'mandatory' || s.startsWith('triggered:') || s === 'proposed'
      );
    }
  });

  it('deps manifest spawns triggered track and mandatory coverage is full', () => {
    const depsVuln: TriggeredTrack = {
      ruleId: 'trig-deps-vuln',
      trackId: 'deps-vuln',
      trackName: 'deps-vuln',
      focus: 'SUPPLY probe',
      matchedFiles: ['package.json'],
    };
    const registry = createTriggerRegistry(() => [depsVuln]);
    const template = new PlanTemplate(registry);
    const changeset: ChangesetEntry[] = [
      entry('package.json'),
      entry('src/index.ts'),
    ];

    const plan = template.generate('test/project!42', changeset);

    const triggered = plan.tracks.filter(
      (t) => t.source === (`triggered:${depsVuln.ruleId}` as TrackSource)
    );
    assert.strictEqual(triggered.length, 1);
    assert.strictEqual(triggered[0].id, 'deps-vuln');
    assert.deepStrictEqual(triggered[0].files, ['package.json']);

    const covered = new Set(plan.tracks.flatMap((t) => t.files));
    assert.strictEqual(covered.size, 2);
    assert.ok(covered.has('package.json'));
    assert.ok(covered.has('src/index.ts'));
  });

  it('layer 1 mandatory always present covers all core files', () => {
    const registry = createTriggerRegistry();
    const template = new PlanTemplate(registry);
    const changeset: ChangesetEntry[] = [
      entry('src/index.ts'),
      entry('tests/index.test.ts'),
      entry('README.md'),
      entry('docs/intro.md'),
    ];

    const plan = template.generate('test/project!42', changeset);

    const mandatory = plan.tracks.filter((t) => t.source === 'mandatory');
    assert.ok(mandatory.length >= 1);

    const covered = new Set(mandatory.flatMap((t) => t.files));
    assert.strictEqual(covered.size, 4);
    assert.ok(covered.has('src/index.ts'));
    assert.ok(covered.has('tests/index.test.ts'));
    assert.ok(covered.has('README.md'));
    assert.ok(covered.has('docs/intro.md'));
  });

  it('layer 2 triggered spawns from triggers when files match glob patterns', () => {
    const secretsTrack: TriggeredTrack = {
      ruleId: 'trig-secrets',
      trackId: 'secrets',
      trackName: 'secrets',
      focus: 'SEC probe',
      matchedFiles: ['.env.local'],
    };
    const registry = createTriggerRegistry((files) => {
      if (files.some((f) => f.endsWith('.env.local'))) return [secretsTrack];
      return [];
    });
    const template = new PlanTemplate(registry);
    const changeset: ChangesetEntry[] = [
      entry('.env.local', 'added'),
      entry('src/foo.ts'),
    ];

    const plan = template.generate('test/project!42', changeset);

    const triggered = plan.tracks.filter((t) => t.source.startsWith('triggered:'));
    assert.strictEqual(triggered.length, 1);
    assert.strictEqual(triggered[0].id, 'secrets');
    assert.deepStrictEqual(triggered[0].files, ['.env.local']);
  });

  it('layer 3 proposed tracks are allocated as empty placeholder for enrich stage', () => {
    const registry = createTriggerRegistry();
    const template = new PlanTemplate(registry);

    const plan = template.generate('test/project!42', [entry('src/index.ts')]);

    const proposed = plan.tracks.filter((t) => t.source === 'proposed');
    assert.strictEqual(proposed.length, 0);
  });

  it('mandatory plus triggered tracks cover all changed files at 100 percent', () => {
    const depsVuln: TriggeredTrack = {
      ruleId: 'trig-deps-vuln',
      trackId: 'deps-vuln',
      trackName: 'deps-vuln',
      focus: 'SUPPLY probe',
      matchedFiles: ['package.json', 'package-lock.json'],
    };
    const registry = createTriggerRegistry(() => [depsVuln]);
    const template = new PlanTemplate(registry);
    const changeset: ChangesetEntry[] = [
      entry('package.json'),
      entry('package-lock.json'),
      entry('src/index.ts'),
      entry('tests/unit.test.ts'),
      entry('README.md'),
    ];

    const plan = template.generate('test/project!42', changeset);

    const covered = new Set(plan.tracks.flatMap((t) => t.files));
    assert.strictEqual(covered.size, 5);
  });

  it('deterministic output: same changeset produces identical track ordering and stage structure', () => {
    const registry = createTriggerRegistry();
    const template = new PlanTemplate(registry);
    const changeset: ChangesetEntry[] = [
      entry('src/index.ts'),
      entry('tests/index.test.ts'),
      entry('package.json'),
    ];

    const plan1 = template.generate('test/project!42', changeset);
    const plan2 = template.generate('test/project!42', changeset);

    assert.strictEqual(plan1.tracks.length, plan2.tracks.length);
    for (let i = 0; i < plan1.tracks.length; i++) {
      assert.strictEqual(plan1.tracks[i].id, plan2.tracks[i].id);
      assert.strictEqual(plan1.tracks[i].source, plan2.tracks[i].source);
      assert.deepStrictEqual(plan1.tracks[i].files, plan2.tracks[i].files);
    }
    assert.strictEqual(plan1.stages.length, plan2.stages.length);
    for (let i = 0; i < plan1.stages.length; i++) {
      assert.strictEqual(plan1.stages[i].name, plan2.stages[i].name);
      assert.strictEqual(plan1.stages[i].kind, plan2.stages[i].kind);
    }
  });

  it('lens inputs create DAG waves', () => {
    const registry = createTriggerRegistry();
    const template = new PlanTemplate(registry);
    const changeset: ChangesetEntry[] = [
      entry('src/index.ts'),
      entry('tests/index.test.ts'),
    ];

    const plan = template.generate('test/project!42', changeset);

    const fanOut = plan.stages.find((s) => s.name === 'fan_out');
    assert.ok(fanOut);
    assert.strictEqual(fanOut.tracks.length, plan.tracks.length);

    const stageOrder = plan.stages.map((s) => s.name);
    const expected = [
      'prepare_env',
      'plan',
      'enrich',
      'fan_out',
      'gate_coverage',
      'synthesize',
      'gate_verdict',
      'tails',
    ];
    for (let i = 0; i < expected.length; i++) {
      assert.strictEqual(stageOrder[i], expected[i]);
    }
  });
});
