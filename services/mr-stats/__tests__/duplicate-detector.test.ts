// @file: Unit tests for mr-stats duplicate-detector — detectDuplicates.
// @consumers: node:test runner
// @tasks: TSK-139

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectDuplicates } from '../duplicate-detector.ts';

describe('duplicate-detector — detectDuplicates', () => {
  it('zero clones returns zeros for empty file list', async () => {
    // contract: BDD "jscpd — нулевые клоны" — empty files returns zero report
    // note: isToolAvailable check runs first; if jscpd is not installed, empty files
    // still trigger the tool-not-found path (exit 4). Both are valid contract states.
    const result = await detectDuplicates('/tmp/fake', []);

    if (!result.ok) {
      // jscpd not installed — expected exit code 4
      assert.strictEqual(result.exitCode, 4);
      assert.ok(result.message.includes('jscpd: command not found'));
    } else {
      // jscpd installed but no files — zero report
      assert.deepStrictEqual(result.report, { clonesFound: 0, clonedLines: 0, percentage: 0 });
    }
  });
});
