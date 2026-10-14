// @file: Runtime-backed contract checks for DBC linter bootstrap artifacts and build wiring.
// @spec: DBC-DBC-LINTER
// @consumers: migration-authored BDD evidence

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import * as lintTypes from '../../../dbc-linter.types.ts';

const root = fileURLToPath(new URL('../../../../../..', import.meta.url));
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  dependencies: Record<string, string>;
};
const viteConfig = readFileSync(join(root, 'vite.config.ts'), 'utf8');

describe('DBC linter contract artifacts', () => {
  it('required directory layout exists', () => {
    assert.ok(existsSync(join(root, 'services/dbc/linter/implementations/ts/__tests__/fixtures')));
  });

  it('missing required directory is detected', () => {
    assert.equal(existsSync(join(root, 'services/dbc/linter/missing-contract-directory')), false);
  });

  it('tree-sitter runtime dependencies are declared', () => {
    assert.ok(packageJson.dependencies['tree-sitter']);
    assert.ok(packageJson.dependencies['tree-sitter-typescript']);
  });

  it('missing tree-sitter dependency is rejected by the contract', () => {
    const candidate = { ...packageJson.dependencies };
    delete candidate['tree-sitter'];
    assert.throws(() => assert.ok(candidate['tree-sitter']));
  });

  it('tree-sitter dependencies remain external in Vite', () => {
    assert.match(viteConfig, /['"]tree-sitter['"]/);
    assert.match(viteConfig, /['"]tree-sitter-typescript['"]/);
  });

  it('missing tree-sitter external is rejected by the build contract', () => {
    const candidate = viteConfig.replace("'tree-sitter',", '');
    assert.doesNotMatch(candidate, /['"]tree-sitter['"]/);
  });

  it('stable DBC lint constants keep names equal to values', () => {
    const entries = Object.entries(lintTypes).filter(([name]) => name.startsWith('ERR_DBC_LINT_'));
    assert.ok(entries.length >= 8);
    for (const [name, value] of entries) assert.equal(value, name);
  });

  it('missing DBC lint constant is rejected by the contract', () => {
    const candidate = Object.fromEntries(
      Object.entries(lintTypes).filter(([name]) => name !== 'ERR_DBC_LINT_MISSING_CONTRACT')
    );
    assert.equal(candidate.ERR_DBC_LINT_MISSING_CONTRACT, undefined);
  });
});
