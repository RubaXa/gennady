// @file: Agent Inbox OpenCode model policy tests.
// @consumers: node:test runner

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_AGENT_INBOX_MODEL, parseOpenCodeModel } from '../model-selection.ts';

describe('Agent Inbox OpenCode model selection', () => {
  it('pins the corporate LLM proxy instead of inheriting the global OpenCode default', () => {
    assert.strictEqual(DEFAULT_AGENT_INBOX_MODEL, 'llm-proxy/deepseek-v4-pro');
    assert.deepStrictEqual(parseOpenCodeModel(DEFAULT_AGENT_INBOX_MODEL), {
      providerID: 'llm-proxy',
      modelID: 'deepseek-v4-pro',
    });
  });

  it('preserves path-like model identifiers after the provider separator', () => {
    assert.deepStrictEqual(parseOpenCodeModel('provod/deepseek/deepseek-v4-flash'), {
      providerID: 'provod',
      modelID: 'deepseek/deepseek-v4-flash',
    });
  });

  it('rejects selectors without both provider and model', () => {
    assert.strictEqual(parseOpenCodeModel(undefined), null);
    assert.strictEqual(parseOpenCodeModel('deepseek-v4-pro'), null);
    assert.strictEqual(parseOpenCodeModel('/deepseek-v4-pro'), null);
    assert.strictEqual(parseOpenCodeModel('llm-proxy/'), null);
  });
});
