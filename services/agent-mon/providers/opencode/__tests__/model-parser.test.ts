// @file: Unit tests for parseModelJson — model id extraction from OpenCode JSON
// @consumers: OpenCodeProvider
// @tasks: TSK-40

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseModelJson } from '../model-parser.ts';

describe('parseModelJson', () => {
  it('extracts id from model json', () => {
    // #region START_EXTRACT_ID_SETUP_INPUT
    const raw = '{"id":"deepseek-v4-pro","providerID":"llm-proxy"}';
    // #endregion END_EXTRACT_ID_SETUP_INPUT

    // #region START_EXTRACT_ID_TRIGGER_AND_ASSERT
    const result = parseModelJson(raw);
    assert.strictEqual(result, 'deepseek-v4-pro');
    // #endregion END_EXTRACT_ID_TRIGGER_AND_ASSERT
  });

  it('returns unknown for invalid json', () => {
    // #region START_INVALID_JSON_SETUP_INPUT
    const raw = 'not-json';
    // #endregion END_INVALID_JSON_SETUP_INPUT

    // #region START_INVALID_JSON_TRIGGER_AND_ASSERT
    const result = parseModelJson(raw);
    assert.strictEqual(result, 'unknown');
    // #endregion END_INVALID_JSON_TRIGGER_AND_ASSERT
  });

  it('returns undefined for null input', () => {
    // contract: null raw input must yield undefined without throwing
    const result = parseModelJson(null);
    assert.strictEqual(result, undefined);
  });

  it('falls back to raw when id field is missing', () => {
    // contract: valid JSON without id field returns the raw string as fallback per @see parseModelJson
    // failure mode: do not assert on internal JSON.parse details — only the public contract surface

    // #region START_MISSING_ID_SETUP_INPUT
    const raw = '{"providerID":"llm-proxy"}';
    // #endregion END_MISSING_ID_SETUP_INPUT

    // #region START_MISSING_ID_TRIGGER_AND_ASSERT
    const result = parseModelJson(raw);
    assert.strictEqual(result, raw);
    // #endregion END_MISSING_ID_TRIGGER_AND_ASSERT
  });
});
