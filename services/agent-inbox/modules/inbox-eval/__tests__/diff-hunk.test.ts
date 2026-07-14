// @file: Unit tests for inbox-eval diff-hunk parser — line in-hunk vs out-of-hunk membership, and
//   the GitLab C6 edge case (a line added past the old file's end via a pure-insertion hunk still
//   lands in newLines).
// @consumers: node:test runner
// @tasks: TSK-118

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseUnifiedDiff } from '../diff-hunk.ts';

const DIFF_TEXT = `diff --git a/src/foo.ts b/src/foo.ts
index 1111111..2222222 100644
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -5,2 +5,2 @@
-old line 5
-old line 6
+new line 5
+new line 6
@@ -10,0 +11,3 @@
+added line 11
+added line 12
+added line 13
`;

describe('parseUnifiedDiff — line in-hunk', () => {
  it('GIVEN строка внутри обычного hunk (замена) WHEN parseUnifiedDiff THEN newLine входит в newLines', () => {
    const map = parseUnifiedDiff(DIFF_TEXT);
    const hunks = map.get('src/foo.ts');
    assert.ok(hunks);
    assert.ok(hunks.newLines.has(5));
    assert.ok(hunks.newLines.has(6));
  });
});

describe('parseUnifiedDiff — line out-of-hunk', () => {
  it('GIVEN строка не покрыта ни одним hunk-диапазоном WHEN parseUnifiedDiff THEN newLine отсутствует в newLines', () => {
    const map = parseUnifiedDiff(DIFF_TEXT);
    const hunks = map.get('src/foo.ts');
    assert.ok(hunks);
    assert.ok(!hunks.newLines.has(20));
    assert.ok(!hunks.newLines.has(7));
  });
});

describe('parseUnifiedDiff — C6: строка добавлена после конца старого файла', () => {
  it('GIVEN pure-insertion hunk (oldCount=0) в конце файла WHEN parseUnifiedDiff THEN добавленные строки входят в newLines', () => {
    const map = parseUnifiedDiff(DIFF_TEXT);
    const hunks = map.get('src/foo.ts');
    assert.ok(hunks);
    assert.ok(hunks.newLines.has(11));
    assert.ok(hunks.newLines.has(12));
    assert.ok(hunks.newLines.has(13));
    // Evidence: raw hunk ranges are preserved for gates that reject lines outside them.
    assert.deepStrictEqual(hunks.ranges, [
      { newStart: 5, newCount: 2 },
      { newStart: 11, newCount: 3 },
    ]);
  });
});
