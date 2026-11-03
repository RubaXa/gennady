// @file: Owned lint probes use canonical headers and bounded IO without guessing after truncation.
// @spec: CLI-LINT
// @consumers: owned selection qualification

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { selectOwnedLintFiles } from '../lint-scope.ts';

test('shebang and license are valid ownership preludes; body lookalikes do not acquire ownership', () => {
  const root = mkdtempSync(join(tmpdir(), 'owned-prefix-'));
  try {
    writeFileSync(
      join(root, 'shebang.ts'),
      '#!/usr/bin/env node\n// @spec: CORE\nexport const x=1;'
    );
    writeFileSync(join(root, 'license.ts'), '/* License */\n// @spec: CORE\nexport const x=1;');
    writeFileSync(join(root, 'body.ts'), 'export const x=1;\n// @spec: CORE\n');
    const result = selectOwnedLintFiles(root, ['shebang.ts', 'license.ts', 'body.ts']);
    assert.deepEqual(result.files, ['shebang.ts', 'license.ts']);
    assert.equal(result.skipped, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('large prelude is uncertain and kept; large unowned body does not require reading the full file', () => {
  const root = mkdtempSync(join(tmpdir(), 'owned-prefix-large-'));
  try {
    writeFileSync(
      join(root, 'prelude.ts'),
      '/*' + 'x'.repeat(8000) + '*/\n// @spec: CORE\nexport const x=1;'
    );
    writeFileSync(join(root, 'large.ts'), 'export const x=1;\n' + '// body\n'.repeat(200_000));
    const result = selectOwnedLintFiles(root, ['prelude.ts', 'large.ts']);
    assert.deepEqual(result.files, ['prelude.ts']);
    assert.equal(result.prefixReadBytes, 8192);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
