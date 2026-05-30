// @file: Unit tests for extractHeader — parsing @file:, @tasks:, @consumers: from source content.
// @consumers: OrientCommand
// @tasks: TSK-55

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractHeader } from '../core/extract-header.ts';

describe('extractHeader', () => {
  it('contract header type: returns FileHeader shape', () => {
    const result = extractHeader('// @file: test file\n// @tasks: TSK-01\n// @consumers: Consumer');
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
    const content = '// @tasks: TSK-01\n\nimport { foo } from "bar";';
    const header = extractHeader(content);
    assert.deepStrictEqual(header.tasks, ['TSK-01']);
  });

  it('parses @tasks: with comma-separated task IDs', () => {
    const content = '// @tasks: TSK-01, TSK-02, TSK-03\n\nimport { foo } from "bar";';
    const header = extractHeader(content);
    assert.deepStrictEqual(header.tasks, ['TSK-01', 'TSK-02', 'TSK-03']);
  });

  it('parses @tasks: with semicolon separators', () => {
    const content = '// @tasks: TSK-01; TSK-02\n\nimport { foo } from "bar";';
    const header = extractHeader(content);
    assert.deepStrictEqual(header.tasks, ['TSK-01', 'TSK-02']);
  });

  it('filters non-TSK task IDs', () => {
    const content = '// @tasks: TSK-01, invalid-id, TSK-02, other\n\nimport { foo } from "bar";';
    const header = extractHeader(content);
    assert.deepStrictEqual(header.tasks, ['TSK-01', 'TSK-02']);
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
