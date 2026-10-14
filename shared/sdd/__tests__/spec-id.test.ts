// @file: Canonical V2 Spec ID parser, derivation, and on-demand index tests.
// @spec: SHARED
// @consumers: N/A

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  collectSpecIdEntries,
  deriveInitialSpecId,
  isCanonicalSpecId,
  parseSpecId,
} from '../spec-id.ts';

describe('canonical Spec ID', () => {
  it('accepts canonical literals and rejects malformed lookalikes', () => {
    assert.strictEqual(isCanonicalSpecId('CLI-ORIENT'), true);
    assert.strictEqual(isCanonicalSpecId('DBC'), true);
    for (const value of ['cli-orient', 'CLI_orient', 'CLI--ORIENT', ' CLI-ORIENT', 'CLI/ORIENT']) {
      assert.strictEqual(isCanonicalSpecId(value), false, value);
    }
  });

  it('requires exactly one literal in exactly one SPEC_ID section', () => {
    assert.deepStrictEqual(parseSpecId('# Legacy'), { status: 'absent' });
    assert.deepStrictEqual(
      parseSpecId('<!--SECTION:SPEC_ID-->\nCLI-ORIENT\n<!--/SECTION:SPEC_ID-->'),
      { status: 'valid', id: 'CLI-ORIENT' }
    );
    assert.strictEqual(
      parseSpecId('<!--SECTION:SPEC_ID-->\nCLI-A\nCLI-B\n<!--/SECTION:SPEC_ID-->').status,
      'malformed'
    );
    assert.strictEqual(
      parseSpecId(
        '<!--SECTION:SPEC_ID-->\nCLI-A\n<!--/SECTION:SPEC_ID-->\n<!--SECTION:SPEC_ID-->\nCLI-A\n<!--/SECTION:SPEC_ID-->'
      ).status,
      'malformed'
    );
  });

  it('derives the approved initial ID from canonical scope/module paths', () => {
    assert.strictEqual(
      deriveInitialSpecId('/repo/specs', 'cli/orient/orient.spec.md'),
      'CLI-ORIENT'
    );
    assert.strictEqual(deriveInitialSpecId('/repo/specs', 'cli/cli.spec.md'), 'CLI');
    assert.strictEqual(deriveInitialSpecId('/repo/specs', '../escape.spec.md'), null);
  });

  it('indexes only explicit IDs and preserves duplicate candidates for fail-closed resolution', () => {
    const root = mkdtempSync(join(tmpdir(), 'spec-id-'));
    try {
      const specs = join(root, 'specs');
      mkdirSync(join(specs, 'cli', 'orient'), { recursive: true });
      mkdirSync(join(specs, 'other'), { recursive: true });
      writeFileSync(
        join(specs, 'cli', 'orient', 'orient.spec.md'),
        '<!--SECTION:SPEC_ID-->\nCLI-ORIENT\n<!--/SECTION:SPEC_ID-->'
      );
      writeFileSync(
        join(specs, 'other', 'other.spec.md'),
        '<!--SECTION:SPEC_ID-->\nCLI-ORIENT\n<!--/SECTION:SPEC_ID-->'
      );
      writeFileSync(join(specs, 'legacy.spec.md'), '# legacy');
      assert.deepStrictEqual(collectSpecIdEntries(specs), [
        { id: 'CLI-ORIENT', path: 'specs/cli/orient/orient.spec.md' },
        { id: 'CLI-ORIENT', path: 'specs/other/other.spec.md' },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('keeps the explicit ID stable when its spec path moves', () => {
    const root = mkdtempSync(join(tmpdir(), 'spec-id-move-'));
    try {
      const specs = join(root, 'specs');
      const originalDir = join(specs, 'cli', 'orient');
      const movedDir = join(specs, 'cli', 'navigation');
      const original = join(originalDir, 'orient.spec.md');
      const moved = join(movedDir, 'navigation.spec.md');
      mkdirSync(originalDir, { recursive: true });
      mkdirSync(movedDir, { recursive: true });
      writeFileSync(original, '<!--SECTION:SPEC_ID-->\nCLI-ORIENT\n<!--/SECTION:SPEC_ID-->');
      assert.deepStrictEqual(collectSpecIdEntries(specs), [
        { id: 'CLI-ORIENT', path: 'specs/cli/orient/orient.spec.md' },
      ]);

      renameSync(original, moved);

      assert.deepStrictEqual(collectSpecIdEntries(specs), [
        { id: 'CLI-ORIENT', path: 'specs/cli/navigation/navigation.spec.md' },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
