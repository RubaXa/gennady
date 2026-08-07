// @file: Tests for Synthesize — multi-model synthesis: consensus/dispute/unique marking, clustering by file:line:summary, source attribution
// @consumers: node:test runner
// @tasks: TSK-161

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Synthesize } from '../synthesize.ts';
import type { ModelResult, RawFinding } from '../synthesize.ts';
import type { FindingsJournal, FindingEntry } from '../findings-journal.ts';

function createFinding(overrides?: Partial<RawFinding>): RawFinding {
  return {
    file: 'src/index.ts',
    line: 10,
    summary: 'unused variable x',
    severity: 'warning',
    ...overrides,
  };
}

function createModelResult(
  model: string,
  track: string,
  findings: RawFinding[],
  runId = 'run-001'
): ModelResult {
  return { track, model, runId, findings };
}

function createMockJournal(): FindingsJournal {
  let counter = 0;
  return {
    append: async (_entry: Omit<FindingEntry, 'id'>) => {
      counter += 1;
      return `F-${counter}`;
    },
  } as unknown as FindingsJournal;
}

describe('Synthesize', () => {
  it('two models same finding marks consensus', async () => {
    const sameFinding = createFinding({
      file: 'src/index.ts',
      line: 10,
      summary: 'unused variable x',
      severity: 'warning',
    });
    const journal = createMockJournal();
    const synth = new Synthesize(journal);
    const results: ModelResult[] = [
      createModelResult('deepseek', 'logic', [sameFinding], 'run-001'),
      createModelResult('kimi', 'logic', [sameFinding], 'run-002'),
    ];

    const findings = await synth.synthesize(results);

    const consensus = findings.filter((f) => f.mark === 'consensus');
    assert.strictEqual(consensus.length, 1);
    assert.strictEqual(consensus[0].file, 'src/index.ts');
    assert.strictEqual(consensus[0].line, 10);
    assert.strictEqual(consensus[0].mark, 'consensus');
    assert.strictEqual(consensus[0].source.length, 2);
  });

  it('two models different findings on same line marks dispute', async () => {
    const journal = createMockJournal();
    const synth = new Synthesize(journal);
    const results: ModelResult[] = [
      createModelResult('deepseek', 'logic', [
        createFinding({
          file: 'src/index.ts',
          line: 10,
          summary: 'unused variable x',
          severity: 'warning',
        }),
      ]),
      createModelResult('kimi', 'logic', [
        createFinding({
          file: 'src/index.ts',
          line: 10,
          summary: 'unused variable x', // same normalized summary
          severity: 'error',
        }),
      ]),
    ];

    const findings = await synth.synthesize(results);

    const disputed = findings.filter((f) => f.mark === 'dispute');
    assert.strictEqual(disputed.length, 1);
    assert.strictEqual(disputed[0].mark, 'dispute');
    assert.strictEqual(disputed[0].source.length, 2);
  });

  it('only one model has finding marks unique', async () => {
    const journal = createMockJournal();
    const synth = new Synthesize(journal);
    const results: ModelResult[] = [
      createModelResult('deepseek', 'logic', [
        createFinding({
          file: 'src/index.ts',
          line: 42,
          summary: 'missing null check',
          severity: 'error',
        }),
      ]),
      createModelResult('kimi', 'logic', [], 'run-002'),
    ];

    const findings = await synth.synthesize(results);

    const unique = findings.filter((f) => f.mark === 'unique');
    assert.strictEqual(unique.length, 1);
    assert.strictEqual(unique[0].mark, 'unique');
    assert.strictEqual(unique[0].source.length, 1);
    assert.strictEqual(unique[0].source[0].model, 'deepseek');
  });

  it('empty model results produce empty synthesized output', async () => {
    const journal = createMockJournal();
    const synth = new Synthesize(journal);

    const findings = await synth.synthesize([]);

    assert.strictEqual(findings.length, 0);
  });

  it('three plus models: majority agreement yields consensus plus unique for outlier', async () => {
    const sharedFinding = createFinding({
      file: 'src/foo.ts',
      line: 15,
      summary: 'potential race condition',
      severity: 'error',
    });
    const uniqueFinding = createFinding({
      file: 'src/bar.ts',
      line: 99,
      summary: 'style: prefer const over let',
      severity: 'info',
    });
    const journal = createMockJournal();
    const synth = new Synthesize(journal);
    const results: ModelResult[] = [
      createModelResult('deepseek', 'logic', [sharedFinding], 'run-001'),
      createModelResult('kimi', 'logic', [sharedFinding], 'run-002'),
      createModelResult('sonnet', 'logic', [uniqueFinding], 'run-003'),
    ];

    const findings = await synth.synthesize(results);

    const consensus = findings.filter((f) => f.mark === 'consensus');
    const unique = findings.filter((f) => f.mark === 'unique');
    assert.strictEqual(consensus.length, 1);
    assert.strictEqual(consensus[0].file, 'src/foo.ts');
    assert.strictEqual(unique.length, 1);
    assert.strictEqual(unique[0].file, 'src/bar.ts');
  });

  it('findings carry source model and runId', async () => {
    const journal = createMockJournal();
    const synth = new Synthesize(journal);
    const results: ModelResult[] = [
      createModelResult('deepseek', 'logic', [
        createFinding({ file: 'a.ts', line: 1, summary: 'bug' }),
      ], 'run-001'),
      createModelResult('kimi', 'logic', [
        createFinding({ file: 'a.ts', line: 1, summary: 'bug' }),
      ], 'run-002'),
    ];

    const findings = await synth.synthesize(results);

    const entry = findings[0];
    assert.ok(entry.source.some((s) => s.model === 'deepseek' && s.runId === 'run-001'));
    assert.ok(entry.source.some((s) => s.model === 'kimi' && s.runId === 'run-002'));
  });
});
