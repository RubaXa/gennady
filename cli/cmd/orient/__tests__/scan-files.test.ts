// @file: Unit tests for scanFiles — recursive .ts/.tsx scanner with exclusion and EACCES handling.
// @consumers: OrientCommand
// @tasks: TSK-55

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { scanFiles } from '../core/scan-files.ts';

function createTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'orient-test-'));
}

describe('scanFiles', () => {
  it('excluded dirs: skips node_modules, .git, dist, coverage, build, out', () => {
    const tmpDir = createTmpDir();
    mkdirSync(join(tmpDir, 'node_modules'));
    mkdirSync(join(tmpDir, '.git'));
    mkdirSync(join(tmpDir, 'dist'));
    mkdirSync(join(tmpDir, 'coverage'));
    mkdirSync(join(tmpDir, 'build'));
    mkdirSync(join(tmpDir, 'out'));
    writeFileSync(join(tmpDir, 'node_modules', 'dep.ts'), '');
    writeFileSync(join(tmpDir, '.git', 'config.ts'), '');
    writeFileSync(join(tmpDir, 'dist', 'bundle.ts'), '');
    writeFileSync(join(tmpDir, 'coverage', 'lcov.ts'), '');
    writeFileSync(join(tmpDir, 'build', 'output.ts'), '');
    writeFileSync(join(tmpDir, 'out', 'compiled.ts'), '');
    writeFileSync(join(tmpDir, 'main.ts'), '');

    const files = scanFiles(tmpDir);
    const mainFile = resolve(tmpDir, 'main.ts');
    assert.strictEqual(files.length, 1);
    assert.strictEqual(files[0], mainFile);
  });

  it('excluded dirs: skips hidden directories', () => {
    const tmpDir = createTmpDir();
    mkdirSync(join(tmpDir, '.hidden'));
    writeFileSync(join(tmpDir, '.hidden', 'secret.ts'), '');
    writeFileSync(join(tmpDir, 'visible.ts'), '');

    const files = scanFiles(tmpDir);
    assert.strictEqual(files.length, 1);
    assert.strictEqual(files[0], resolve(tmpDir, 'visible.ts'));
  });

  it('extension filter: returns only .ts and .tsx files', () => {
    const tmpDir = createTmpDir();
    writeFileSync(join(tmpDir, 'a.ts'), '');
    writeFileSync(join(tmpDir, 'b.tsx'), '');
    writeFileSync(join(tmpDir, 'c.js'), '');
    writeFileSync(join(tmpDir, 'd.json'), '');
    writeFileSync(join(tmpDir, 'e.md'), '');

    const files = scanFiles(tmpDir);
    const names = files.map((f) => f).sort();
    assert.strictEqual(files.length, 2);
  });

  it('permission error: EACCES does not crash scanning', () => {
    const tmpDir = createTmpDir();
    const nestedDir = join(tmpDir, 'locked');
    mkdirSync(nestedDir);
    try {
      chmodSync(nestedDir, 0o000);
    } catch {
      /* skip on platforms where this fails */
    }

    // #region START_PERMISSION_ASSERT
    // contract: scanFiles must not throw on inaccessible directory
    const files = scanFiles(tmpDir);
    assert.ok(Array.isArray(files));
    // #endregion END_PERMISSION_ASSERT

    try {
      chmodSync(nestedDir, 0o755);
    } catch {
      /* best effort */
    }
  });

  it('empty project: returns empty array', () => {
    const tmpDir = createTmpDir();
    const files = scanFiles(tmpDir);
    assert.deepStrictEqual(files, []);
  });

  it('scan results are sorted', () => {
    const tmpDir = createTmpDir();
    writeFileSync(join(tmpDir, 'z.ts'), '');
    writeFileSync(join(tmpDir, 'a.ts'), '');
    writeFileSync(join(tmpDir, 'm.ts'), '');

    const files = scanFiles(tmpDir);
    const names = files.map((f) => f).sort();
    assert.deepStrictEqual(files, names);
  });

  it('scans nested directories inline', () => {
    const tmpDir = createTmpDir();
    const subDir = join(tmpDir, 'src', 'utils');
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    mkdirSync(subDir, { recursive: true });
    writeFileSync(join(tmpDir, 'root.ts'), '');
    writeFileSync(join(subDir, 'helper.ts'), '');

    const files = scanFiles(tmpDir);
    assert.strictEqual(files.length, 2);
  });

  it('dir not found: normally resolves to empty or existing path', () => {
    const nonExistent = join(tmpdir(), 'definitely-does-not-exist-' + Date.now());
    // contract: scanFiles calls resolve on the input, reads the directory.
    // If the directory does not exist, readdirSync throws. The walkDir function
    // catches the error and returns, so scanFiles returns an empty array.
    const files = scanFiles(nonExistent);
    assert.deepStrictEqual(files, []);
  });
});
