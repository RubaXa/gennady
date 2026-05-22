// @file: Unit tests for ps.ts — psInfo batch process inspection and parseClaudeArgs
// @consumers: ClaudeProvider, monitor
// @tasks: TSK-39

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { psInfo, parseClaudeArgs } from '../ps.ts';
import type { PsInfoEntry } from '../ps.ts';

/**
 * Test Graph
 *
 * psInfo — uses real ps command (integration-level); mock.method on built-in modules unsupported
 *   ├── returns empty Map for dead pid (PID 99999 — non-existent)
 *   ├── returns cpu and memory for live pid (PID 1 — launchd/systemd, always present)
 *   ├── batch ps: dead PIDs excluded, alive PIDs present (mixed [1, 99999])
 *   └── returns empty Map for empty PID array (boundary)
 *
 * parseClaudeArgs — pure function, fully unit-testable
 *   ├── extracts --model and --effort from args
 *   └── returns empty object when no flags present
 */

describe('psInfo', () => {
  it('returns empty Map for dead pid', () => {
    // purpose: verify error contract — non-existent PID produces empty Map, never throws
    // contract: psInfo must return empty Map when ps command returns no output for the PID
    // failure mode: do not assert on logger — only the returned Map matters

    // #region START_DEAD_PID_TRIGGER
    const result = psInfo([99999]);
    // #endregion END_DEAD_PID_TRIGGER

    // #region START_DEAD_PID_ASSERT
    assert.ok(result instanceof Map);
    assert.strictEqual(result.size, 0);
    // #endregion END_DEAD_PID_ASSERT
  });

  it('returns cpu and memory for live pid', () => {
    // purpose: verify happy-path contract — alive process returns PsInfoEntry with numeric cpuPercent and memoryMb
    // contract: entry must have pid, cpuPercent (number), memoryMb (number > 0), args (non-empty string)
    // invariant: memoryMb is converted from RSS KB to MB (rss / 1024)

    // #region START_LIVE_PID_TRIGGER
    // PID 1 is launchd on macOS, systemd on Linux — always present
    const result = psInfo([1]);
    // #endregion END_LIVE_PID_TRIGGER

    // #region START_LIVE_PID_OBSERVE
    const entry = result.get(1);
    // #endregion END_LIVE_PID_OBSERVE

    // #region START_LIVE_PID_ASSERT
    assert.ok(entry !== undefined, 'expected entry for pid 1');
    const actual: PsInfoEntry = entry;
    assert.strictEqual(actual.pid, 1);
    assert.strictEqual(typeof actual.cpuPercent, 'number');
    assert.strictEqual(typeof actual.memoryMb, 'number');
    assert.ok(actual.memoryMb > 0, `expected memoryMb > 0, got ${actual.memoryMb}`);
    assert.ok(actual.args.length > 0, 'expected non-empty args');
    // #endregion END_LIVE_PID_ASSERT
  });

  it('batch ps: dead PIDs excluded, alive PIDs present', () => {
    // purpose: verify batch contract — mixed alive/dead PIDs: alive appear, dead excluded
    // contract: single psInfo call processes all PIDs; dead PIDs are absent from result Map
    // invariant: the result Map contains only entries for alive PIDs

    // #region START_BATCH_PS_TRIGGER
    const result = psInfo([1, 99999]);
    // #endregion END_BATCH_PS_TRIGGER

    // #region START_BATCH_PS_ASSERT
    assert.strictEqual(result.size, 1, 'expected only PID 1 alive');
    assert.ok(result.has(1), 'expected PID 1 in result');
    assert.ok(!result.has(99999), 'expected dead PID absent');
    // #endregion END_BATCH_PS_ASSERT
  });

  it('returns empty Map for empty PID array', () => {
    // purpose: verify boundary contract — empty input short-circuits without spawning ps
    // contract: psInfo([]) returns empty Map

    // #region START_EMPTY_PIDS_TRIGGER
    const result = psInfo([]);
    // #endregion END_EMPTY_PIDS_TRIGGER

    // #region START_EMPTY_PIDS_ASSERT
    assert.ok(result instanceof Map);
    assert.strictEqual(result.size, 0);
    // #endregion END_EMPTY_PIDS_ASSERT
  });
});

describe('parseClaudeArgs', () => {
  it('extracts model and effort from args', () => {
    // purpose: verify parsing contract — --model and --effort flags extracted from process args
    // contract: model and effort are extracted as strings; absent flags produce undefined

    // #region START_PARSE_ARGS_SETUP
    const args = '/usr/bin/claude --model claude-sonnet-4-20250514 --effort high --other-flag';
    // #endregion END_PARSE_ARGS_SETUP

    // #region START_PARSE_ARGS_TRIGGER
    const result = parseClaudeArgs(args);
    // #endregion END_PARSE_ARGS_TRIGGER

    // #region START_PARSE_ARGS_ASSERT
    assert.deepStrictEqual(result, {
      model: 'claude-sonnet-4-20250514',
      effort: 'high',
    });
    // #endregion END_PARSE_ARGS_ASSERT
  });

  it('returns empty object when no flags present', () => {
    // purpose: verify boundary — args without --model or --effort return empty object
    const args = '/usr/bin/claude';
    const result = parseClaudeArgs(args);
    assert.deepStrictEqual(result, {});
  });
});
