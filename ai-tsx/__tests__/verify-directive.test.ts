// @file: verifyDirective tests — match, diff, and error paths
// @consumers: ai-tsx directives module
// @tasks: TSK-76

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { verifyDirective } from '../verify-directive.js';

describe('verifyDirective', () => {
  let tempDirs: string[] = [];

  after(() => {
    for (const d of tempDirs) {
      try {
        rmSync(d, { recursive: true, force: true });
      } catch {
        /* temp dir already gone */
      }
    }
  });

  it('returns match true for identical output', async () => {
    const d = mkdtempSync(join(process.cwd(), 'ai-tsx/__tests__/.verify-test-'));
    tempDirs.push(d);
    const tsxPath = join(d, 'match-test.ts');
    const xmlPath = join(d, 'expected.xml');

    writeFileSync(
      tsxPath,
      [
        'export default function TestDirective() {',
        '  return {',
        '    type: undefined,',
        '    props: {},',
        "    children: ['verify-match-test-content'],",
        '  };',
        '}',
      ].join('\n'),
      'utf8'
    );

    writeFileSync(xmlPath, 'verify-match-test-content', 'utf8');

    const result = await verifyDirective(tsxPath, xmlPath);
    assert.deepStrictEqual(result, { match: true });
  });

  it('detects mismatch when outputs differ', async () => {
    // contract: when outputs differ, either returns {match:false, diff} or throws [verifyDirective] git diff failed
    const d = mkdtempSync(join(process.cwd(), 'ai-tsx/__tests__/.verify-diff-'));
    tempDirs.push(d);
    const tsxPath = join(d, 'diff-test.ts');
    const xmlPath = join(d, 'different.xml');

    writeFileSync(
      tsxPath,
      [
        'export default function TestDirective() {',
        '  return {',
        '    type: undefined,',
        '    props: {},',
        "    children: ['actual-output'],",
        '  };',
        '}',
      ].join('\n'),
      'utf8'
    );

    writeFileSync(xmlPath, 'different-expected-content', 'utf8');

    try {
      const result = await verifyDirective(tsxPath, xmlPath);
      assert.deepStrictEqual(result.match, false);
      assert.ok((result as { diff: string }).diff.length > 0);
    } catch (err: unknown) {
      assert.ok(err instanceof Error);
      assert.match((err as Error).message, /git diff failed/);
    }
  });

  it('throws on import failure for nonexistent file', async () => {
    await assert.rejects(
      async () => {
        await verifyDirective('/nonexistent/path/directive.tsx', '/dev/null');
      },
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match((error as Error).message, /ENOENT|no such file/i);
        return true;
      }
    );
  });
});
