// @file: Test-only helper for isolated temp directories that stay inside the agent-inbox state boundary (~/.gennady).
// @consumers: agent-inbox test suites (cli/cmd/inbox*, services/agent-inbox/**)
// @tasks: TSK-125

import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { StateStore } from '../state-store.ts';

/**
 * @purpose Root directory under which every isolated test temp dir is created.
 * @invariant Lives inside `StateStore.getStateDir()` (defaults to `~/.gennady`) — never `os.tmpdir()`, per NFC-05.
 * @sideEffect Creates the root directory (recursive) if absent.
 */
function resolveTestTmpRoot(): string {
  const scratchTestRoot = join(new StateStore().getStateDir(), 'scratch', 'test');
  mkdirSync(scratchTestRoot, { recursive: true });
  return scratchTestRoot;
}

/**
 * @purpose Create an isolated temp directory for one test (or test suite), scoped under the agent-inbox state boundary.
 * @invariant Directory is created under `<StateStore.getStateDir()>/scratch/test/`, never `os.tmpdir()`.
 * @param prefix Directory name prefix (test-identifying); a random suffix is appended by `mkdtempSync`.
 * @returns Absolute path to the freshly created, empty temp directory.
 * @sideEffect Creates the scratch/test root (if absent) and one new directory inside it.
 */
export function makeTestTmpDir(prefix: string): string {
  return mkdtempSync(join(resolveTestTmpRoot(), prefix));
}

/**
 * @purpose Remove a temp directory produced by `makeTestTmpDir`, recursively and idempotently.
 * @param dir Absolute path returned by `makeTestTmpDir`.
 * @sideEffect Deletes `dir` and its contents from disk; no-op if already absent.
 */
export function cleanupTestTmp(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}
