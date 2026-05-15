// @file: Integration tests for DbcContractCheck — SKIPPED: depends on tree-sitter native module.
// @consumers: LintCommand
// @tasks: TSK-17

import { describe, it } from 'node:test';

/**
 * DbcContractCheck Test Graph:
 * ├── should return no errors for valid content [SKIPPED — tree-sitter]
 * ├── should return LintError[] for content with missing contracts [SKIPPED — tree-sitter]
 * ├── should mutate file on disk when autofix is true [SKIPPED — tree-sitter]
 * └── should preserve original filePath in errors [SKIPPED — tree-sitter]
 *
 * Deferred: tests require tree-sitter runtime initialization and DbcTsLinter
 * instantiation. Run in full integration environment where tree-sitter WASM
 * grammar is available.
 */
describe.skip('DbcContractCheck', () => {
  it('should return no errors for valid content');
  it('should return LintError[] for content with missing contracts');
  it('should mutate file on disk when autofix is true');
  it('should preserve original filePath in errors');
});
