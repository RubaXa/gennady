// @file: Unit tests for alt-opinion runner — DI-based mock ports, exit codes, synthesis, per-model prompts, order, sanitization, telemetry.
// @consumers: Developers, CI
// @tasks: TSK-25, TSK-26

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { runAltOpinion } from '../alt-opinion-runner.ts';
import type {
  AltOpinionModel,
  AltOpinionModelPort,
  AltOpinionParsedArgs,
  AltOpinionProvider,
  AltOpinionTelemetry,
  RunAltOpinionDeps,
} from '../alt-opinion.types.ts';

// #region START_HELPERS — factory functions for test fixtures
function makeModel(
  provider: AltOpinionProvider,
  model: string,
  promptPath?: string
): AltOpinionModel {
  const m: AltOpinionModel = { provider, model };
  if (promptPath !== undefined) {
    m.promptPath = promptPath;
  }
  return m;
}

function modelKey(m: AltOpinionModel): string {
  return `${m.provider}/${m.model}`;
}

function makeArgs(
  models: AltOpinionModel[],
  overrides?: Partial<AltOpinionParsedArgs>
): AltOpinionParsedArgs {
  return {
    models,
    strict: overrides?.strict ?? false,
    artifact: overrides?.artifact ?? 'test artifact content',
    file: overrides?.file,
    modelPromptPath: overrides?.modelPromptPath,
    synthModel: overrides?.synthModel,
    synthPromptPath: overrides?.synthPromptPath,
  };
}

function makeDeps(
  portsMap: Map<string, AltOpinionModelPort>,
  synth?: AltOpinionModelPort,
  readFile?: (path: string) => string
): RunAltOpinionDeps {
  return {
    models: portsMap,
    synth,
    readFile: readFile ?? ((_path: string) => 'default-file-content'),
  };
}
// #endregion END_HELPERS

describe('runAltOpinion', () => {
  it('Happy path: 2 models → 2 opinion blocks with anchors, exitCode 0', async () => {
    // purpose: two successful models produce two results in correct order with exitCode 0 and telemetry
    // observation focus: result count, success flags, content values, generate call count, telemetry fields

    // #region START_HAPPY_PATH_SETUP_MOCKS
    const m1 = makeModel('openrouter', 'gpt');
    const m2 = makeModel('llmproxy', 'claude');
    const gen1 = mock.fn(async (_prompt: string) => ({
      content: 'opinion from gpt',
      usage: { promptTokens: 10, completionTokens: 5 },
      finishReason: 'stop',
    }));
    const gen2 = mock.fn(async (_prompt: string) => ({
      content: 'opinion from claude',
      usage: { promptTokens: 8, completionTokens: 3 },
      finishReason: 'stop',
    }));
    const ports = new Map([
      [modelKey(m1), { generate: gen1 }],
      [modelKey(m2), { generate: gen2 }],
    ]);
    // #endregion END_HAPPY_PATH_SETUP_MOCKS

    // #region START_HAPPY_PATH_TRIGGER
    const report = await runAltOpinion(makeArgs([m1, m2]), makeDeps(ports));
    // #endregion END_HAPPY_PATH_TRIGGER

    // #region START_HAPPY_PATH_ASSERT
    assert.strictEqual(report.exitCode, 0);
    assert.strictEqual(report.results.length, 2);
    assert.strictEqual(report.results[0].success, true);
    assert.strictEqual(report.results[1].success, true);
    if (report.results[0].success)
      assert.strictEqual(report.results[0].content, 'opinion from gpt');
    if (report.results[1].success)
      assert.strictEqual(report.results[1].content, 'opinion from claude');
    assert.strictEqual(report.results[0].model.provider, 'openrouter');
    assert.strictEqual(report.results[1].model.provider, 'llmproxy');
    assert.strictEqual(gen1.mock.callCount(), 1);
    assert.strictEqual(gen2.mock.callCount(), 1);
    // verify telemetry on both results
    assert.ok(report.results[0].telemetry, 'telemetry should be present on success result');
    assert.ok(report.results[1].telemetry, 'telemetry should be present on success result');
    assert.ok(report.results[0].telemetry!.wallMs > 0, 'wallMs should be positive');
    assert.ok(report.results[1].telemetry!.wallMs > 0, 'wallMs should be positive');
    assert.strictEqual(report.results[0].telemetry!.promptTokens, 10);
    assert.strictEqual(report.results[0].telemetry!.completionTokens, 5);
    assert.strictEqual(report.results[0].telemetry!.finishReason, 'stop');
    assert.strictEqual(report.results[1].telemetry!.promptTokens, 8);
    assert.strictEqual(report.results[1].telemetry!.completionTokens, 3);
    assert.strictEqual(report.results[1].telemetry!.finishReason, 'stop');
    // #endregion END_HAPPY_PATH_ASSERT
  });

  it('1 model fails, 1 succeeds (non-strict) → exitCode 0, error block + success block', async () => {
    // purpose: non-strict mode tolerates partial failure — one error does not flip exitCode to 1
    // contract: exitCode 0 when at least one model succeeds in non-strict mode; error result carries telemetry

    // #region START_PARTIAL_FAIL_SETUP_MOCKS
    const m1 = makeModel('openrouter', 'gpt');
    const m2 = makeModel('llmproxy', 'claude');
    const gen1 = mock.fn(async () => {
      throw new Error('network down');
    });
    const gen2 = mock.fn(async (_prompt: string) => ({
      content: 'opinion B',
      usage: { promptTokens: 3, completionTokens: 1 },
      finishReason: 'stop',
    }));
    const ports = new Map([
      [modelKey(m1), { generate: gen1 }],
      [modelKey(m2), { generate: gen2 }],
    ]);
    // #endregion END_PARTIAL_FAIL_SETUP_MOCKS

    // #region START_PARTIAL_FAIL_TRIGGER
    const report = await runAltOpinion(makeArgs([m1, m2]), makeDeps(ports));
    // #endregion END_PARTIAL_FAIL_TRIGGER

    // #region START_PARTIAL_FAIL_ASSERT
    assert.strictEqual(report.exitCode, 0);
    assert.strictEqual(report.results.length, 2);
    assert.strictEqual(report.results[0].success, false);
    assert.strictEqual(report.results[1].success, true);
    if (!report.results[0].success) assert.match(report.results[0].error, /network down/);
    if (report.results[1].success) assert.strictEqual(report.results[1].content, 'opinion B');
    // error result has telemetry with finishReason=error
    assert.ok(report.results[0].telemetry, 'error result should have telemetry');
    assert.strictEqual(report.results[0].telemetry!.finishReason, 'error');
    assert.ok(report.results[0].telemetry!.wallMs > 0);
    assert.strictEqual(report.results[0].telemetry!.promptTokens, undefined);
    assert.strictEqual(report.results[0].telemetry!.completionTokens, undefined);
    // success result has telemetry
    assert.ok(report.results[1].telemetry, 'success result should have telemetry');
    assert.strictEqual(report.results[1].telemetry!.finishReason, 'stop');
    // #endregion END_PARTIAL_FAIL_ASSERT
  });

  it('All models fail (non-strict) → exitCode 1', async () => {
    // purpose: when every model fails in non-strict mode, exitCode must be 1; all carry error telemetry
    // contract: exitCode 1 only when zero models succeed

    // #region START_ALL_FAIL_SETUP_MOCKS
    const m1 = makeModel('openrouter', 'gpt');
    const m2 = makeModel('llmproxy', 'claude');
    const gen1 = mock.fn(async () => {
      throw new Error('e1');
    });
    const gen2 = mock.fn(async () => {
      throw new Error('e2');
    });
    const ports = new Map([
      [modelKey(m1), { generate: gen1 }],
      [modelKey(m2), { generate: gen2 }],
    ]);
    // #endregion END_ALL_FAIL_SETUP_MOCKS

    // #region START_ALL_FAIL_TRIGGER
    const report = await runAltOpinion(makeArgs([m1, m2]), makeDeps(ports));
    // #endregion END_ALL_FAIL_TRIGGER

    // #region START_ALL_FAIL_ASSERT
    assert.strictEqual(report.exitCode, 1);
    assert.strictEqual(report.results.length, 2);
    assert.strictEqual(report.results[0].success, false);
    assert.strictEqual(report.results[1].success, false);
    assert.ok(report.results[0].telemetry, 'error result should have telemetry');
    assert.ok(report.results[1].telemetry, 'error result should have telemetry');
    assert.strictEqual(report.results[0].telemetry!.finishReason, 'error');
    assert.strictEqual(report.results[1].telemetry!.finishReason, 'error');
    // #endregion END_ALL_FAIL_ASSERT
  });

  it('--strict: 1 model fails → exitCode 1', async () => {
    // purpose: strict mode flips exitCode to 1 on any single model failure
    // contract: strict: true → exitCode 1 if ANY model fails

    // #region START_STRICT_FAIL_SETUP_MOCKS
    const m1 = makeModel('openrouter', 'gpt');
    const m2 = makeModel('llmproxy', 'claude');
    const gen1 = mock.fn(async () => {
      throw new Error('fail');
    });
    const gen2 = mock.fn(async (_p: string) => ({
      content: 'ok',
      usage: { promptTokens: 1, completionTokens: 1 },
      finishReason: 'stop',
    }));
    const ports = new Map([
      [modelKey(m1), { generate: gen1 }],
      [modelKey(m2), { generate: gen2 }],
    ]);
    // #endregion END_STRICT_FAIL_SETUP_MOCKS

    // #region START_STRICT_FAIL_TRIGGER
    const report = await runAltOpinion(makeArgs([m1, m2], { strict: true }), makeDeps(ports));
    // #endregion END_STRICT_FAIL_TRIGGER

    // #region START_STRICT_FAIL_ASSERT
    assert.strictEqual(report.exitCode, 1);
    assert.strictEqual(report.results[0].success, false);
    assert.strictEqual(report.results[1].success, true);
    assert.strictEqual(report.results[0].telemetry!.finishReason, 'error');
    assert.strictEqual(report.results[1].telemetry!.finishReason, 'stop');
    // #endregion END_STRICT_FAIL_ASSERT
  });

  it('Synthesis: --synthModel → only synth block, no individual blocks', async () => {
    // purpose: when --synthModel is provided and models succeed, report contains synthContent with anchors wrapping synthesized content
    // observation focus: synthContent anchors, synth content text, synth generate prompt contains aggregated opinions, telemetry on both models and synth

    // #region START_SYNTH_SETUP_MOCKS
    const m1 = makeModel('openrouter', 'gpt');
    const m2 = makeModel('llmproxy', 'claude');
    const synthModel = makeModel('openrouter', 'opus');
    const gen1 = mock.fn(async (_p: string) => ({
      content: 'opinion A',
      usage: { promptTokens: 4, completionTokens: 2 },
      finishReason: 'stop',
    }));
    const gen2 = mock.fn(async (_p: string) => ({
      content: 'opinion B',
      usage: { promptTokens: 5, completionTokens: 1 },
      finishReason: 'stop',
    }));
    const synthGen = mock.fn(async (_p: string) => ({
      content: 'synthesized opinion',
      usage: { promptTokens: 10, completionTokens: 4 },
      finishReason: 'stop',
    }));
    const ports = new Map([
      [modelKey(m1), { generate: gen1 }],
      [modelKey(m2), { generate: gen2 }],
    ]);
    // #endregion END_SYNTH_SETUP_MOCKS

    // #region START_SYNTH_TRIGGER
    const report = await runAltOpinion(
      makeArgs([m1, m2], { synthModel }),
      makeDeps(ports, { generate: synthGen })
    );
    // #endregion END_SYNTH_TRIGGER

    // #region START_SYNTH_ASSERT
    assert.strictEqual(report.exitCode, 0);
    assert.ok(report.synthContent !== undefined, 'synthContent should be present');
    assert.match(report.synthContent!, /<!--START_ALT_OPINION_SYNTH-->/);
    assert.match(report.synthContent!, /<!--END_ALT_OPINION_SYNTH-->/);
    assert.match(report.synthContent!, /synthesized opinion/);
    // synth generate called with prompt containing both opinions
    assert.strictEqual(synthGen.mock.callCount(), 1);
    const synthPrompt = synthGen.mock.calls[0].arguments[0] as string;
    assert.match(synthPrompt, /opinion A/);
    assert.match(synthPrompt, /opinion B/);
    // model ports called exactly once each
    assert.strictEqual(gen1.mock.callCount(), 1);
    assert.strictEqual(gen2.mock.callCount(), 1);
    // synthesis telemetry present
    assert.ok(report.synthTelemetry, 'synthTelemetry should be present');
    assert.ok(report.synthTelemetry!.wallMs > 0);
    assert.strictEqual(report.synthTelemetry!.promptTokens, 10);
    assert.strictEqual(report.synthTelemetry!.completionTokens, 4);
    assert.strictEqual(report.synthTelemetry!.finishReason, 'stop');
    // #endregion END_SYNTH_ASSERT
  });

  it('Synthesis: all models fail → exitCode 1', async () => {
    // purpose: synthesis cannot run when zero models succeed; exitCode must be 1
    // contract: all models fail + synthModel present → exitCode 1, no synthContent

    // #region START_SYNTH_ALL_FAIL_SETUP_MOCKS
    const m1 = makeModel('openrouter', 'gpt');
    const synthModel = makeModel('openrouter', 'opus');
    const gen1 = mock.fn(async () => {
      throw new Error('fail');
    });
    const ports = new Map([[modelKey(m1), { generate: gen1 }]]);
    // #endregion END_SYNTH_ALL_FAIL_SETUP_MOCKS

    // #region START_SYNTH_ALL_FAIL_TRIGGER
    const report = await runAltOpinion(
      makeArgs([m1], { synthModel }),
      makeDeps(ports, { generate: mock.fn(async () => 'should not be called') })
    );
    // #endregion END_SYNTH_ALL_FAIL_TRIGGER

    // #region START_SYNTH_ALL_FAIL_ASSERT
    assert.strictEqual(report.exitCode, 1);
    assert.strictEqual(report.synthContent, undefined);
    assert.strictEqual(report.results[0].telemetry!.finishReason, 'error');
    // #endregion END_SYNTH_ALL_FAIL_ASSERT
  });

  it('Per-model prompt: model with promptPath → custom prompt passed to generate()', async () => {
    // purpose: per-model promptPath takes priority over shared modelPromptPath and default prompt
    // contract: readFile(model.promptPath) is called and its content embedded in generate() prompt

    // #region START_PER_MODEL_PROMPT_SETUP
    const m = makeModel('openrouter', 'gpt', './custom.md');
    const gen = mock.fn(async (_p: string) => ({
      content: 'opinion',
      usage: { promptTokens: 1, completionTokens: 1 },
      finishReason: 'stop',
    }));
    const ports = new Map([[modelKey(m), { generate: gen }]]);
    const readFile = mock.fn((path: string) => {
      if (path === './custom.md') return 'custom prompt text';
      return 'fallback';
    });
    // #endregion END_PER_MODEL_PROMPT_SETUP

    // #region START_PER_MODEL_PROMPT_TRIGGER
    await runAltOpinion(makeArgs([m]), makeDeps(ports, undefined, readFile));
    // #endregion END_PER_MODEL_PROMPT_TRIGGER

    // #region START_PER_MODEL_PROMPT_ASSERT
    assert.strictEqual(gen.mock.callCount(), 1);
    const prompt = gen.mock.calls[0].arguments[0] as string;
    assert.match(prompt, /custom prompt text/);
    assert.strictEqual(readFile.mock.callCount(), 1);
    // #endregion END_PER_MODEL_PROMPT_ASSERT
  });

  it('Order: results preserve --model CLI order', async () => {
    // purpose: verify that Promise.allSettled preserves the insertion order of model arguments
    // contract: results[i].model === args.models[i] for every i

    // #region START_ORDER_SETUP_MOCKS
    const m1 = makeModel('openrouter', 'c');
    const m2 = makeModel('llmproxy', 'a');
    const m3 = makeModel('openrouter', 'b');
    const gen = mock.fn(async (_p: string) => ({
      content: 'opinion',
      usage: { promptTokens: 1, completionTokens: 1 },
      finishReason: 'stop',
    }));
    const port: AltOpinionModelPort = { generate: gen };
    const ports = new Map([
      [modelKey(m1), port],
      [modelKey(m2), port],
      [modelKey(m3), port],
    ]);
    // #endregion END_ORDER_SETUP_MOCKS

    // #region START_ORDER_TRIGGER
    const report = await runAltOpinion(makeArgs([m1, m2, m3]), makeDeps(ports));
    // #endregion END_ORDER_TRIGGER

    // #region START_ORDER_ASSERT
    assert.strictEqual(report.results.length, 3);
    assert.deepStrictEqual(report.results[0].model, m1);
    assert.deepStrictEqual(report.results[1].model, m2);
    assert.deepStrictEqual(report.results[2].model, m3);
    // #endregion END_ORDER_ASSERT
  });

  it('Empty artifact → throws', async () => {
    // purpose: empty artifact is a validation failure before any model call
    // contract: runAltOpinion throws with message containing "Empty artifact"

    const m = makeModel('openrouter', 'gpt');
    const ports = new Map([
      [modelKey(m), { generate: mock.fn(async () => 'should not be called') }],
    ]);

    // #region START_EMPTY_ARTIFACT_TRIGGER_AND_ASSERT
    await assert.rejects(
      () => runAltOpinion(makeArgs([m], { artifact: '' }), makeDeps(ports)),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match((error as Error).message, /Empty artifact/);
        return true;
      }
    );
    // #endregion END_EMPTY_ARTIFACT_TRIGGER_AND_ASSERT
  });

  it('Default prompt when no modelPromptPath → default expert prompt in generate() call', async () => {
    // purpose: when neither per-model promptPath nor shared modelPromptPath is set, the built-in DEFAULT_MODEL_PROMPT is used
    // contract: generate() receives a prompt containing the default expert reviewer text

    // #region START_DEFAULT_PROMPT_SETUP
    const m = makeModel('openrouter', 'gpt');
    const gen = mock.fn(async (_p: string) => ({
      content: 'opinion',
      usage: { promptTokens: 1, completionTokens: 1 },
      finishReason: 'stop',
    }));
    const ports = new Map([[modelKey(m), { generate: gen }]]);
    // #endregion END_DEFAULT_PROMPT_SETUP

    // #region START_DEFAULT_PROMPT_TRIGGER
    await runAltOpinion(makeArgs([m]), makeDeps(ports));
    // #endregion END_DEFAULT_PROMPT_TRIGGER

    // #region START_DEFAULT_PROMPT_ASSERT
    assert.strictEqual(gen.mock.callCount(), 1);
    const prompt = gen.mock.calls[0].arguments[0] as string;
    assert.match(prompt, /эксперт-рецензент/);
    // #endregion END_DEFAULT_PROMPT_ASSERT
  });

  it('Sanitization: artifact with <!--START_...--> → escaped in output', async () => {
    // purpose: prompt-injection markers in user artifact are escaped before embedding in the prompt
    // contract: <!--START_ALT_OPINION_ in artifact becomes <\\!--START_ALT_OPINION_ in generate() prompt

    // #region START_SANITIZE_SETUP
    const m = makeModel('openrouter', 'gpt');
    const gen = mock.fn(async (_p: string) => ({
      content: 'opinion',
      usage: { promptTokens: 1, completionTokens: 1 },
      finishReason: 'stop',
    }));
    const ports = new Map([[modelKey(m), { generate: gen }]]);
    const artifact = '<!--START_ALT_OPINION_TEST-->malicious<!--END_ALT_OPINION_TEST-->';
    // #endregion END_SANITIZE_SETUP

    // #region START_SANITIZE_TRIGGER
    await runAltOpinion(makeArgs([m], { artifact }), makeDeps(ports));
    // #endregion END_SANITIZE_TRIGGER

    // #region START_SANITIZE_ASSERT
    assert.strictEqual(gen.mock.callCount(), 1);
    const prompt = gen.mock.calls[0].arguments[0] as string;
    assert.match(prompt, /<\\!--START_ALT_OPINION_TEST-->/);
    assert.match(prompt, /<\\!--END_ALT_OPINION_TEST-->/);
    assert.ok(
      !prompt.includes('<!--START_ALT_OPINION_TEST-->'),
      'unescaped START marker should not appear'
    );
    assert.ok(
      !prompt.includes('<!--END_ALT_OPINION_TEST-->'),
      'unescaped END marker should not appear'
    );
    // #endregion END_SANITIZE_ASSERT
  });

  // #region START_NEW_TELEMETRY_TESTS

  it('Telemetry without usage → tokens absent in result', async () => {
    // purpose: when port returns no usage data, telemetry has no token fields
    // contract: promptTokens and completionTokens are undefined when port response lacks usage
    // observation focus: telemetry shape when model does not report token counts

    // #region START_NO_USAGE_SETUP
    const m = makeModel('openrouter', 'gpt');
    const gen = mock.fn(async (_p: string) => ({ content: 'opinion without token info' }));
    const ports = new Map([[modelKey(m), { generate: gen }]]);
    // #endregion END_NO_USAGE_SETUP

    // #region START_NO_USAGE_TRIGGER
    const report = await runAltOpinion(makeArgs([m]), makeDeps(ports));
    // #endregion END_NO_USAGE_TRIGGER

    // #region START_NO_USAGE_ASSERT
    assert.strictEqual(report.exitCode, 0);
    assert.ok(report.results[0].telemetry, 'telemetry should be present');
    assert.ok(report.results[0].telemetry!.wallMs > 0, 'wallMs should be measured');
    assert.strictEqual(report.results[0].telemetry!.promptTokens, undefined);
    assert.strictEqual(report.results[0].telemetry!.completionTokens, undefined);
    assert.strictEqual(report.results[0].telemetry!.finishReason, undefined);
    // #endregion END_NO_USAGE_ASSERT
  });

  it('Error model → telemetry with reason=error', async () => {
    // purpose: verify error telemetry shape — finishReason=error, no token data
    // contract: when port throws, telemetry contains wallMs and finishReason='error', no token fields
    // observation focus: error telemetry has reason=error and wallMs > 0

    // #region START_ERROR_TELEMETRY_SETUP
    const m = makeModel('openrouter', 'gpt');
    const gen = mock.fn(async () => {
      throw new Error('model crashed');
    });
    const ports = new Map([[modelKey(m), { generate: gen }]]);
    // #endregion END_ERROR_TELEMETRY_SETUP

    // #region START_ERROR_TELEMETRY_TRIGGER
    const report = await runAltOpinion(makeArgs([m]), makeDeps(ports));
    // #endregion END_ERROR_TELEMETRY_TRIGGER

    // #region START_ERROR_TELEMETRY_ASSERT
    assert.strictEqual(report.exitCode, 1);
    assert.strictEqual(report.results[0].success, false);
    assert.ok(report.results[0].telemetry, 'error result should have telemetry');
    assert.ok(report.results[0].telemetry!.wallMs > 0, 'wallMs should be measured even on error');
    assert.strictEqual(report.results[0].telemetry!.finishReason, 'error');
    assert.strictEqual(report.results[0].telemetry!.promptTokens, undefined);
    assert.strictEqual(report.results[0].telemetry!.completionTokens, undefined);
    // #endregion END_ERROR_TELEMETRY_ASSERT
  });

  it('Wall time measured: wallMs >= delay', async () => {
    // purpose: verify that wallMs measures actual elapsed time including model processing
    // contract: wallMs >= the minimum artificial delay introduced in the mock
    // observation focus: timing accuracy — wallMs should cover at least the simulated delay

    // #region START_WALLMS_SETUP
    const m = makeModel('openrouter', 'gpt');
    const minDelayMs = 30;
    const gen = mock.fn(async (_p: string) => {
      await delay(minDelayMs);
      return {
        content: 'delayed opinion',
        usage: { promptTokens: 1, completionTokens: 1 },
        finishReason: 'stop',
      };
    });
    const ports = new Map([[modelKey(m), { generate: gen }]]);
    // #endregion END_WALLMS_SETUP

    // #region START_WALLMS_TRIGGER
    const report = await runAltOpinion(makeArgs([m]), makeDeps(ports));
    // #endregion END_WALLMS_TRIGGER

    // #region START_WALLMS_ASSERT
    assert.strictEqual(report.exitCode, 0);
    assert.ok(report.results[0].telemetry, 'telemetry should be present');
    assert.ok(
      report.results[0].telemetry!.wallMs >= minDelayMs,
      `wallMs ${report.results[0].telemetry!.wallMs} should be >= ${minDelayMs}`
    );
    assert.strictEqual(report.results[0].telemetry!.finishReason, 'stop');
    // #endregion END_WALLMS_ASSERT
  });

  it('Synthesis block has telemetry present', async () => {
    // purpose: verify that synthesis result carries synthTelemetry with correct shape
    // contract: when --synthModel is used and models succeed, report.synthTelemetry is populated
    // observation focus: synthTelemetry fields match the synthesis model response

    // #region START_SYNTH_TELEMETRY_SETUP
    const m = makeModel('openrouter', 'gpt');
    const synthModel = makeModel('openrouter', 'opus');
    const gen = mock.fn(async (_p: string) => ({
      content: 'base opinion',
      usage: { promptTokens: 2, completionTokens: 1 },
      finishReason: 'stop',
    }));
    const synthGen = mock.fn(async (_p: string) => ({
      content: 'synth result',
      usage: { promptTokens: 6, completionTokens: 3 },
      finishReason: 'stop',
    }));
    const ports = new Map([[modelKey(m), { generate: gen }]]);
    // #endregion END_SYNTH_TELEMETRY_SETUP

    // #region START_SYNTH_TELEMETRY_TRIGGER
    const report = await runAltOpinion(
      makeArgs([m], { synthModel }),
      makeDeps(ports, { generate: synthGen })
    );
    // #endregion END_SYNTH_TELEMETRY_TRIGGER

    // #region START_SYNTH_TELEMETRY_ASSERT
    assert.strictEqual(report.exitCode, 0);
    assert.ok(report.synthTelemetry, 'synthTelemetry must be present');
    assert.ok(report.synthTelemetry!.wallMs > 0, 'synth wallMs must be positive');
    assert.strictEqual(report.synthTelemetry!.promptTokens, 6);
    assert.strictEqual(report.synthTelemetry!.completionTokens, 3);
    assert.strictEqual(report.synthTelemetry!.finishReason, 'stop');
    // #endregion END_SYNTH_TELEMETRY_ASSERT
  });

  // #endregion END_NEW_TELEMETRY_TESTS
});
