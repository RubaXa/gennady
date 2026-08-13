// @file: Unit tests for countModuleSpecs — the MODULE_VISION marker walk under specs/.
// @consumers: module-specs
// @tasks: N/A

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { countModuleSpecs } from '../module-specs.ts';

let root: string;

describe('countModuleSpecs', () => {
  before(() => {
    root = mkdtempSync(join(tmpdir(), 'module-specs-'));
    mkdirSync(join(root, 'specs', 'backend', 'api'), { recursive: true });
    mkdirSync(join(root, 'specs', 'node_modules', 'x'), { recursive: true });

    writeFileSync(join(root, 'specs', 'README.md'), '# proj\n');
    writeFileSync(
      join(root, 'specs', 'backend', 'backend.spec.md'),
      '<!--SECTION:SCOPE_TYPE-->\nproduct\n<!--/SECTION:SCOPE_TYPE-->\n'
    );
    writeFileSync(
      join(root, 'specs', 'backend', 'api', 'api.spec.md'),
      '<!--SECTION:MODULE_VISION-->\nvision\n<!--/SECTION:MODULE_VISION-->\n'
    );
    writeFileSync(
      join(root, 'specs', 'backend', 'other.spec.md'),
      '<!--SECTION:MODULE_VISION-->\nvision\n<!--/SECTION:MODULE_VISION-->\n'
    );
    // a node_modules dir under specs/ is never descended into
    writeFileSync(
      join(root, 'specs', 'node_modules', 'x', 'x.spec.md'),
      '<!--SECTION:MODULE_VISION-->\n<!--/SECTION:MODULE_VISION-->\n'
    );
  });

  after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('counts only MODULE_VISION-marked spec files, skipping the portal and scope specs', () => {
    assert.strictEqual(countModuleSpecs(join(root, 'specs')), 2);
  });

  it('returns 0 when specs/ is absent', () => {
    assert.strictEqual(countModuleSpecs(join(root, 'no-such-dir')), 0);
  });
});
