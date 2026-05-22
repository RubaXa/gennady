// @file: Unit tests for session-json.ts — readSessionJson and readSessionTitle functions
// @consumers: ClaudeProvider, monitor
// @tasks: TSK-39

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readSessionJson, readSessionTitle } from '../session-json.ts';
import type { SessionJsonData } from '../session-json.ts';

/**
 * Test Graph
 *
 * readSessionJson
 *   ├── parses valid session json (happy-path, fixture)
 *   ├── returns null for non-object JSON (failure-path)
 *   └── returns null for missing fields (boundary)
 *
 * readSessionTitle
 *   └── returns 'Unknown' for missing JSONL (boundary, real FS call)
 */

const FIXTURES = join(import.meta.dirname!, 'fixtures');

describe('readSessionJson', () => {
  it('parses valid session json', () => {
    // purpose: verify contract — readSessionJson returns correctly parsed SessionJsonData from a valid session file
    // contract: all four required fields (pid, sessionId, cwd, startedAt) are extracted with correct types
    // failure mode: do not assert file read internals — only the returned object shape matters

    // #region START_PARSE_VALID_SETUP
    const filePath = join(FIXTURES, 'valid-session.json');
    // #endregion END_PARSE_VALID_SETUP

    // #region START_PARSE_VALID_TRIGGER
    const result = readSessionJson(filePath);
    // #endregion END_PARSE_VALID_TRIGGER

    // #region START_PARSE_VALID_ASSERT
    assert.ok(result !== null, 'expected non-null result for valid JSON');
    const expected: SessionJsonData = { pid: 4506, sessionId: 'abc', cwd: '/tmp', startedAt: 1000 };
    assert.deepStrictEqual(result, expected);
    // #endregion END_PARSE_VALID_ASSERT
  });

  it('returns null for non-object JSON', () => {
    // purpose: verify error contract — non-object JSON (array) returns null without throwing
    // contract: readSessionJson must not throw; must return null for invalid JSON shape

    // #region START_NON_OBJECT_SETUP
    const filePath = join(FIXTURES, 'invalid-not-object.json');
    // #endregion END_NON_OBJECT_SETUP

    // #region START_NON_OBJECT_TRIGGER
    const result = readSessionJson(filePath);
    // #endregion END_NON_OBJECT_TRIGGER

    // #region START_NON_OBJECT_ASSERT
    assert.strictEqual(result, null);
    // #endregion END_NON_OBJECT_ASSERT
  });

  it('returns null for missing fields', () => {
    // purpose: verify validation contract — JSON object missing required fields returns null
    // contract: all four fields (pid, sessionId, cwd, startedAt) must be present and of correct type

    // #region START_MISSING_FIELDS_SETUP
    const filePath = join(FIXTURES, 'missing-fields.json');
    // #endregion END_MISSING_FIELDS_SETUP

    // #region START_MISSING_FIELDS_TRIGGER
    const result = readSessionJson(filePath);
    // #endregion END_MISSING_FIELDS_TRIGGER

    // #region START_MISSING_FIELDS_ASSERT
    assert.strictEqual(result, null);
    // #endregion END_MISSING_FIELDS_ASSERT
  });
});

describe('readSessionTitle', () => {
  it('returns Unknown for missing JSONL file', () => {
    // purpose: verify graceful degradation — non-existent JSONL file returns 'Unknown' without throwing
    // contract: readSessionTitle must not throw; missing file must produce the 'Unknown' sentinel
    // failure mode: do not assert logger calls — only the returned string matters

    // #region START_MISSING_JSONL_SETUP
    const cwd = '/nonexistent/path';
    const sessionId = 'nonexistent-session';
    // #endregion END_MISSING_JSONL_SETUP

    // #region START_MISSING_JSONL_TRIGGER
    const title = readSessionTitle(cwd, sessionId);
    // #endregion END_MISSING_JSONL_TRIGGER

    // #region START_MISSING_JSONL_ASSERT
    assert.strictEqual(title, 'Unknown');
    // #endregion END_MISSING_JSONL_ASSERT
  });
});
