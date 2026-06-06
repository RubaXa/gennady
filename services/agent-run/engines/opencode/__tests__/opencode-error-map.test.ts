// @file: Unit tests for opencodeErrorMap — pure mapping function, no subprocess needed.
// @consumers: CI test suite
// @tasks: TSK-63

/**
 * Test Graph:
 *   opencodeErrorMap()
 *     - maps spawn ENOENT to AGENT_NOT_INSTALLED
 *     - maps spawn EACCES to AGENT_NOT_INSTALLED
 *     - maps proxy 403 to NETWORK_BLOCKED
 *     - maps schema error to VERSION_MISMATCH
 *     - maps forbidden and missing-key
 *     - maps unknown and agent-create failure to LAUNCH_FAILED
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { opencodeErrorMap } from '../opencode-error-map.ts';

describe('opencodeErrorMap', () => {
  it('maps spawn ENOENT to AGENT_NOT_INSTALLED', () => {
    const result = opencodeErrorMap({ spawnErrorCode: 'ENOENT' });
    assert.strictEqual(result.code, 'AGENT_NOT_INSTALLED');
    assert.match(result.hint, /not found|not executable/i);
  });

  it('maps spawn EACCES to AGENT_NOT_INSTALLED', () => {
    const result = opencodeErrorMap({ spawnErrorCode: 'EACCES' });
    assert.strictEqual(result.code, 'AGENT_NOT_INSTALLED');
    assert.match(result.hint, /not found|not executable/i);
  });

  it('maps proxy 403 to NETWORK_BLOCKED', () => {
    const result = opencodeErrorMap({ exitCode: 1, stderr: 'request failed with status 403' });
    assert.strictEqual(result.code, 'NETWORK_BLOCKED');
    assert.match(result.hint, /proxy/i);
  });

  it('maps schema error to VERSION_MISMATCH', () => {
    const result = opencodeErrorMap({
      exitCode: 1,
      stderr: 'constraint failed: session_message — database schema outdated',
    });
    assert.strictEqual(result.code, 'VERSION_MISMATCH');
    assert.match(result.hint, /schema|mismatch/i);
  });

  it('maps forbidden and missing-key', () => {
    // contract: two distinct stderr patterns → two distinct ErrorCode values
    // non-goal: do not test both in the same assertion — they cover different codes

    const forbidden = opencodeErrorMap({ exitCode: 1, stderr: 'Forbidden access to model' });
    assert.strictEqual(forbidden.code, 'MODEL_FORBIDDEN');
    assert.match(forbidden.hint, /forbidden|model/i);

    const missingKey = opencodeErrorMap({ exitCode: 1, stderr: 'API key missing for provider' });
    assert.strictEqual(missingKey.code, 'CREDENTIAL_MISSING');
    assert.match(missingKey.hint, /API key|missing/i);
  });

  it('maps unknown and agent-create failure to LAUNCH_FAILED', () => {
    // contract: unrecognized stderr falls through to LAUNCH_FAILED with raw hint
    // failure mode: do not assert exact hint text — it includes raw stderr which is dynamic

    const unknown = opencodeErrorMap({ exitCode: 1, stderr: 'some unexpected error output' });
    assert.strictEqual(unknown.code, 'LAUNCH_FAILED');

    const noStderr = opencodeErrorMap({ exitCode: 1, stderr: '' });
    assert.strictEqual(noStderr.code, 'LAUNCH_FAILED');
    assert.match(noStderr.hint, /No stderr/i);
  });
});
