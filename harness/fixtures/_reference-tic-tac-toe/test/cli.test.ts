import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('CLI plays a sequence and prints the outcome', () => {
  const out = execFileSync(
    'node',
    ['--import', 'tsx', join(root, 'src/cli.ts'), '0', '3', '1', '4', '2'],
    { encoding: 'utf8' }
  );
  assert.match(out, /X \| X \| X/);
  assert.match(out, /Winner: X/);
});
