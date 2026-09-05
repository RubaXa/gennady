// @file: Invariant tests for the must-remember workspace boundary on agent-facing SDD state.
// @consumers: sdd-state, sdd-task, sdd-new

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { join, resolve } from 'node:path';
import { appendSddSessionBoundary } from '../session-boundary.ts';

test('state output ends with the sole working/temp directories and an explicit escape prohibition', () => {
  const workingDir = resolve('/tmp/sdd-session-boundary-case');
  const output = appendSddSessionBoundary('[STATE]\nready=yes', workingDir);

  assert.match(output, /\[!!! SESSION BOUNDARY — MUST REMEMBER !!!\]/);
  assert.match(output, new RegExp(`^WORKING_DIR=${workingDir}$`, 'm'));
  assert.match(output, new RegExp(`^TMP_DIR=${join(workingDir, '.tmp')}$`, 'm'));
  assert.match(output, /обязательные к запоминанию поля: WORKING_DIR, TMP_DIR/);
  assert.ok(
    output.endsWith(
      'ЗАПОМНИ НА ВСЮ СЕССИЮ: работаешь только в WORKING_DIR; читать/писать вне WORKING_DIR и TMP_DIR запрещено; искать примеры вне них запрещено.'
    )
  );
});
