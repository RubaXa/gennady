// @file: Live-CLI behavior of the read-only `gennady verify` facade (V-16a, D-13) — real
//   `tsx cli/gennady.ts verify` runs against fixture roots: valid plan, bad invocation, broken
//   `stack:` config. No gate is ever executed by any of these.
// @consumers: N/A
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runCliAsync } from './run-cli.ts';

function withProject<T>(
  files: Record<string, string>,
  fn: (dir: string) => Promise<T>
): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), 'gennady-verify-'));
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content);
  }
  return fn(dir).finally(() => rmSync(dir, { recursive: true, force: true }));
}

describe('gennady verify --plan --json (V-16a)', () => {
  it('prints a valid plan document and exits 0', async () => {
    await withProject(
      {
        'package.json': JSON.stringify({
          name: 'consumer',
          scripts: { 'type-check': 'tsc --noEmit' },
        }),
      },
      async (dir) => {
        const result = await runCliAsync(['verify', '--plan', '--json'], dir);
        assert.strictEqual(result.exitCode, 0, result.stderr);
        const doc = JSON.parse(result.stdout);
        assert.strictEqual(doc.profile, 'full');
        assert.strictEqual(doc.stack, 'node');
        assert.deepStrictEqual(
          doc.gates.map((g: { name: string }) => g.name),
          ['type-check', 'test:coverage', 'lint', 'format', 'yagni']
        );
        assert.strictEqual(
          doc.gates.find((g: { name: string }) => g.name === 'type-check').command,
          'npm run type-check'
        );
      }
    );
  });

  it('bare invocation (no --plan/--json) is a hard exit-4 error, not an implicit plan', async () => {
    await withProject({}, async (dir) => {
      const result = await runCliAsync(['verify'], dir);
      assert.strictEqual(result.exitCode, 4);
      assert.match(result.stderr, /ERR_CLI_VERIFY_BAD_INVOCATION/);
    });
  });

  it('an invalid `stack:` config refuses before any plan is printed — same as sdd-verify', async () => {
    await withProject({ 'gennady.yaml': 'stack:\n  use: [not-a-real-plugin]\n' }, async (dir) => {
      const result = await runCliAsync(['verify', '--plan', '--json'], dir);
      assert.strictEqual(result.exitCode, 4);
      assert.strictEqual(result.stdout, '');
    });
  });

  it('never writes anything to the fixture — read-only end to end', async () => {
    await withProject(
      { 'package.json': JSON.stringify({ name: 'consumer', scripts: {} }) },
      async (dir) => {
        const result = await runCliAsync(['verify', '--plan', '--json'], dir);
        assert.strictEqual(result.exitCode, 0);
        // Only the file this test itself wrote exists — nothing new appeared.
        assert.deepStrictEqual(readdirSync(dir).sort(), ['package.json']);
      }
    );
  });
});
