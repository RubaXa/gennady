// @file: Unit tests for the repo code/infra probe heuristics.
// @consumers: probe
// @tasks: N/A

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { probeRepo } from '../probe.ts';

let empty: string;
let withCode: string;
let onlyPkg: string;

describe('probeRepo', () => {
  before(() => {
    empty = mkdtempSync(join(tmpdir(), 'probe-empty-'));

    withCode = mkdtempSync(join(tmpdir(), 'probe-code-'));
    mkdirSync(join(withCode, 'src'), { recursive: true });
    mkdirSync(join(withCode, 'cli'), { recursive: true });
    mkdirSync(join(withCode, 'node_modules', 'dep'), { recursive: true });
    writeFileSync(join(withCode, 'src', 'a.ts'), 'export const a = 1;\n');
    writeFileSync(join(withCode, 'cli', 'b.js'), 'module.exports = {};\n');
    writeFileSync(join(withCode, 'index.tsx'), 'export default null;\n'); // root-level
    writeFileSync(join(withCode, 'node_modules', 'dep', 'x.ts'), 'export {};\n'); // excluded
    writeFileSync(join(withCode, 'tsconfig.json'), '{}\n');
    writeFileSync(join(withCode, 'README.md'), '# x\n'); // not code

    onlyPkg = mkdtempSync(join(tmpdir(), 'probe-pkg-'));
    writeFileSync(join(onlyPkg, 'package.json'), '{}\n');
  });

  after(() => {
    rmSync(empty, { recursive: true, force: true });
    rmSync(withCode, { recursive: true, force: true });
    rmSync(onlyPkg, { recursive: true, force: true });
  });

  it('empty repo → no code, no infra', () => {
    const p = probeRepo(empty);
    assert.strictEqual(p.codePresent, false);
    assert.strictEqual(p.codeFileCount, 0);
    assert.deepStrictEqual(p.codeDirs, []);
    assert.strictEqual(p.infraPresent, false);
    assert.deepStrictEqual(p.configFiles, []);
  });

  it('repo with code → counts source, excludes node_modules, lists top dirs + root', () => {
    const p = probeRepo(withCode);
    assert.strictEqual(p.codePresent, true);
    assert.strictEqual(p.codeFileCount, 3); // src/a.ts, cli/b.js, index.tsx — node_modules excluded
    assert.deepStrictEqual(p.codeDirs, ['.', 'cli', 'src']);
    assert.strictEqual(p.infraPresent, true);
    assert.deepStrictEqual(p.configFiles, ['tsconfig.json']);
  });

  it('only package.json (no code) → greenfield: no code, no infra-config', () => {
    const p = probeRepo(onlyPkg);
    assert.strictEqual(p.codePresent, false);
    assert.strictEqual(p.infraPresent, false); // package.json alone is not a tool-config
  });
});
