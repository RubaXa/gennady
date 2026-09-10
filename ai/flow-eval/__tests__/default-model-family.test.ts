// @file: Proof that the eval's default runner/judge models belong to the mandated `llm-proxy` family
//   (D-28/L-14: "only the llm-proxy family"), so an operator who omits `--model`/`--judge-model` still
//   gets that family instead of silently falling back to a different provider (E-21).
// @consumers: ai/flow-eval/runner.ts, ai/flow-eval/cli.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SDD_EVAL_CONFIG } from '../runner.ts';

describe('E-21: the default model config fixes the llm-proxy family (L-14)', () => {
  it('the default runner model is in the llm-proxy family', () => {
    assert.strictEqual(DEFAULT_SDD_EVAL_CONFIG.runnerModel.providerID, 'llm-proxy');
  });

  it('the default judge model is in the llm-proxy family', () => {
    assert.strictEqual(DEFAULT_SDD_EVAL_CONFIG.judgeModel.providerID, 'llm-proxy');
  });
});
