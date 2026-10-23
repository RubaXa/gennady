// @file: Causal persistence/abort/delete/removal failure controls for calibration cleanup.
// @spec: AI-SKILLS
// @consumers: finalizeAuthoringCalibration; live calibration ownership

import assert from 'node:assert/strict';
import { it } from 'node:test';
import { finalizeAuthoringCalibration } from '../authoring-calibration-cleanup.ts';

for (const fail of ['', 'persist', 'abort:one', 'delete:one', 'directory']) {
  it(`attempts every owned cleanup operation when ${fail || 'nothing'} fails`, async () => {
    const calls: string[] = [];
    const action = (name: string) => {
      calls.push(name);
      if (name === fail) throw new Error('Unsafe underlying diagnostic');
    };
    const result = await finalizeAuthoringCalibration({
      sessions: ['one', 'two'],
      persist: () => action('persist'),
      abort: async (id) => action(`abort:${id}`),
      removeSession: async (id) => action(`delete:${id}`),
      removeDirectory: () => action('directory'),
      safeReason: () => 'Sanitized failure',
    });
    assert.deepEqual(calls, [
      'persist',
      'abort:one',
      'delete:one',
      'abort:two',
      'delete:two',
      'directory',
    ]);
    assert.equal(result.temporaryDirectoryRemoved, fail !== 'directory');
    assert.deepEqual(result.sessions, ['one', 'two']);
    assert.equal(result.errors.length, fail ? 1 : 0);
    assert.ok(result.errors.every((entry) => entry.reason === 'Sanitized failure'));
  });
}
