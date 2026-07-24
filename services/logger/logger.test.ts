// @file: Unit tests for the logger ring buffer — snapshotServerLog captures every level regardless
//   of the console level filter (the 🐞 button needs post-hoc lines even when the console was quiet).
// @consumers: node:test runner
// @tasks: TSK-debug-log

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { logger, setLogLevel, snapshotServerLog } from './logger.ts';

describe('logger ring buffer', () => {
  it('captures a line at every level even when the console filter suppresses it', () => {
    setLogLevel('silent'); // nothing prints, but the ring must still capture
    const marker = 'RING_TEST_MARKER_' + snapshotServerLog().length;
    logger.debug(`${marker} debug`);
    logger.error(`${marker} error`, { code: 'X' });

    const lines = snapshotServerLog();
    const mine = lines.filter((l) => l.includes(marker));
    assert.strictEqual(mine.length, 2, 'both suppressed lines still captured in the ring');
    assert.ok(
      mine.some((l) => l.includes('[DEBUG]') && l.includes(`${marker} debug`)),
      'debug line tagged and present'
    );
    assert.ok(
      mine.some((l) => l.includes('[ERROR]') && l.includes('"code":"X"')),
      'error line carries its serialized detail'
    );
  });

  it('respects the limit argument (most-recent lines)', () => {
    const before = snapshotServerLog().length;
    logger.info('limit-a');
    logger.info('limit-b');
    logger.info('limit-c');
    const lastTwo = snapshotServerLog(2);
    assert.strictEqual(lastTwo.length, 2);
    assert.ok(lastTwo[1].includes('limit-c'), 'newest line is last');
    assert.ok(snapshotServerLog().length >= before + 3, 'full snapshot keeps all recent lines');
  });
});
