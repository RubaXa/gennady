// @file: Unit tests for extractHeader — parsing @file:, @tasks:, @consumers: from source content.
// @spec: CLI-ORIENT
// @consumers: OrientCommand

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractHeader } from '../core/extract-header.ts';

describe('extractHeader', () => {
  it('parses Python/Ruby-style # headers after a shebang', () => {
    const result = extractHeader(
      '#!/usr/bin/env python3\n# @file: worker\n# @spec: CLI-ORIENT\n# @tasks: DP-fields\n# @consumers: Worker\nprint("ok")\n'
    );
    assert.strictEqual(result.file, 'worker');
    assert.strictEqual(result.spec, 'CLI-ORIENT');
    assert.deepStrictEqual(result.tasks, ['DP-fields']);
    assert.deepStrictEqual(result.consumers, ['Worker']);
  });

  it('contract header type: returns FileHeader shape', () => {
    const result = extractHeader(
      '// @file: test file\n// @tasks: DP-fields\n// @consumers: Consumer'
    );
    assert.strictEqual(typeof result.file, 'string');
    assert.ok(Array.isArray(result.tasks));
    assert.ok(Array.isArray(result.consumers));
  });

  it('parses @file: tag', () => {
    const content = '// @file: Project scanner utility\n\nimport { foo } from "bar";';
    const header = extractHeader(content);
    assert.strictEqual(header.file, 'Project scanner utility');
  });

  it('parses @tasks: with single task ID', () => {
    const content = '// @tasks: DP-fields\n\nimport { foo } from "bar";';
    const header = extractHeader(content);
    assert.deepStrictEqual(header.tasks, ['DP-fields']);
  });

  it('parses @tasks: with comma-separated task IDs', () => {
    const content = '// @tasks: DP-fields, DP-jsdoc, DP-snaps\n\nimport { foo } from "bar";';
    const header = extractHeader(content);
    assert.deepStrictEqual(header.tasks, ['DP-fields', 'DP-jsdoc', 'DP-snaps']);
  });

  it('parses @tasks: with semicolon separators', () => {
    const content = '// @tasks: DP-fields; DP-jsdoc\n\nimport { foo } from "bar";';
    const header = extractHeader(content);
    assert.deepStrictEqual(header.tasks, ['DP-fields', 'DP-jsdoc']);
  });

  it('accepts canonical semantic IDs plus legacy TSK-NN and rejects malformed lookalikes', () => {
    const content =
      '// @tasks: DP-fields, ORIENT-nav, invalid-id, DP-jsdoc, ORIENT_Nav, other\n\nimport { foo } from "bar";';
    const header = extractHeader(content);
    assert.deepStrictEqual(header.tasks, ['DP-fields', 'ORIENT-nav', 'DP-jsdoc']);
  });

  it('parses one canonical @spec ID without accepting a path or malformed literal', () => {
    assert.strictEqual(extractHeader('// @spec: CLI-ORIENT').spec, 'CLI-ORIENT');
    assert.strictEqual(extractHeader('// @spec: specs/cli/orient/orient.spec.md').spec, '');
    assert.strictEqual(extractHeader('// @spec: cli-orient').spec, '');
    assert.strictEqual(extractHeader('// @spec: CLI-ORIENT\n// @spec: CLI-OTHER').spec, '');
  });

  it('parses @consumers: with multiple names', () => {
    const content = '// @consumers: DbcTsLinter, DbcLinter\n\nimport { foo } from "bar";';
    const header = extractHeader(content);
    assert.deepStrictEqual(header.consumers, ['DbcTsLinter', 'DbcLinter']);
  });

  it('stops scanning after first import statement', () => {
    const content = '// @file: Visible header\nimport { foo } from "bar";\n// @file: Invisible tag';
    const header = extractHeader(content);
    assert.strictEqual(header.file, 'Visible header');
  });

  it('returns empty fields for missing tags', () => {
    const content = 'import { foo } from "bar";';
    const header = extractHeader(content);
    assert.strictEqual(header.file, '');
    assert.strictEqual(header.spec, '');
    assert.deepStrictEqual(header.tasks, []);
    assert.deepStrictEqual(header.consumers, []);
  });

  it('handles empty content', () => {
    const header = extractHeader('');
    assert.strictEqual(header.file, '');
    assert.deepStrictEqual(header.tasks, []);
    assert.deepStrictEqual(header.consumers, []);
  });
});
