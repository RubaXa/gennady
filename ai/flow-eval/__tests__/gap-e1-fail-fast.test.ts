// @file: Both-outcomes proof that a typo in `phase` or `mode` drops the run, never measures a
//   silently different branch (GAP-E-1/H-16).
// @consumers: ai/flow-eval/cli.ts, ai/flow-eval/prompts.ts
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadScenarios } from '../cli.ts';
import { resolveBasePrompt, composeSddPhasePrompt } from '../prompts.ts';

async function scenarioFile(
  entries: unknown[]
): Promise<{ path: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), 'sdd-eval-scenarios-'));
  const path = join(dir, 'scenarios.json');
  await writeFile(path, JSON.stringify(entries), 'utf8');
  return { path, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

describe('GAP-E-1: a typo in `phase` or `mode` fails the load, never a silently different branch', () => {
  it('an unknown `phase` value rejects loadScenarios, naming the field and scenario id', async () => {
    const { path, cleanup } = await scenarioFile([
      {
        id: 'typo-phase',
        phase: 'excute', // typo of 'execute'
        mode: 'canonical-execute',
        intent: 'run it',
      },
    ]);
    try {
      await assert.rejects(loadScenarios(path), /typo-phase has invalid PHASE: "excute"/);
    } finally {
      await cleanup();
    }
  });

  it('an unknown `mode` value rejects loadScenarios, naming the field and scenario id', async () => {
    const { path, cleanup } = await scenarioFile([
      {
        id: 'typo-mode',
        phase: 'execute',
        mode: 'cannonical-execute', // typo of 'canonical-execute'
        intent: 'run it',
      },
    ]);
    try {
      await assert.rejects(loadScenarios(path), /typo-mode has invalid MODE: "cannonical-execute"/);
    } finally {
      await cleanup();
    }
  });

  it('a valid mode from a DIFFERENT phase, misapplied to brownfield, rejects at load time', async () => {
    // 'canonical-execute' is a real member of SDD_EVAL_MODES (so the plain membership check alone
    // would accept it) but brownfield does not support it — before GAP-E-1 this silently fell back to
    // the generic brownfield prompt, i.e. a DIFFERENT valid prompt than any branch actually intended.
    const { path, cleanup } = await scenarioFile([
      {
        id: 'wrong-mode-for-brownfield',
        phase: 'brownfield',
        mode: 'canonical-execute',
        intent: 'change existing code',
      },
    ]);
    try {
      await assert.rejects(
        loadScenarios(path),
        /wrong-mode-for-brownfield.*brownfield.*does not support mode "canonical-execute"/s
      );
    } finally {
      await cleanup();
    }
  });

  it('loadScenarios fails BEFORE any sandbox would be provisioned for later scenarios in the same batch', async () => {
    // A batch of 2: the first scenario is fine, the second has the brownfield/mode mismatch. The whole
    // load must reject — GAP-E-1 requires the run to drop immediately, not run scenario 1 and only
    // discover the mismatch once the runner reaches scenario 2.
    const { path, cleanup } = await scenarioFile([
      { id: 'ok-one', phase: 'execute', mode: 'canonical-execute', intent: 'fine' },
      { id: 'bad-two', phase: 'brownfield', mode: 'fix-to-clean', intent: 'bad' },
    ]);
    try {
      await assert.rejects(loadScenarios(path), /bad-two/);
    } finally {
      await cleanup();
    }
  });

  it('all three spec-facing brownfield modes resolve to their OWN distinct prompt (no accidental sharing)', () => {
    const prompts = new Map<string, string>();
    for (const mode of ['recover-spec', 'delta-to-spec', 'modify-via-spec'] as const) {
      prompts.set(mode, resolveBasePrompt('brownfield', mode));
    }
    const distinct = new Set(prompts.values());
    assert.strictEqual(
      distinct.size,
      3,
      'each spec-facing brownfield mode must have its own prompt'
    );
  });

  it('the two generic delta modes both resolve to the shared generic brownfield prompt, by design', () => {
    const generic = resolveBasePrompt('brownfield', 'modify-code-delta');
    assert.strictEqual(resolveBasePrompt('brownfield', 'fix-code-delta'), generic);
  });

  it('composeSddPhasePrompt (the actual worker-facing entry point) throws for the same bad combination', () => {
    assert.throws(
      () =>
        composeSddPhasePrompt({
          phase: 'brownfield',
          mode: 'brief-to-artifact', // valid mode overall, not a brownfield mode
          intent: 'do the thing',
          directory: '/tmp/some-sandbox',
        }),
      /does not support mode "brief-to-artifact"/
    );
  });
});
