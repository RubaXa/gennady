// @file: AgentsRulesCommand — prints orient usage instructions for AI agents.
// @consumers: gennady.ts
// @tasks: TSK-59

import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * @purpose Prints agent-facing orient documentation from the gennady package README.md.
 * @invariant Never modifies the filesystem.
 * @param _argv CLI arguments (ignored).
 * @returns Promise<void> — ends with process.exit(0) on success, process.exit(1) on error.
 * @sideEffect stdout: README.md content on success; stderr: error message on failure.
 */
export async function run(_argv: string[]): Promise<void> {
  const cwd = resolve('.');

  if (!existsSync(resolve(cwd, 'node_modules/gennady'))) {
    console.error('gennady package not found. Install it locally: npm i -D gennady');
    process.exit(1);
  }

  const gennadyUrl = import.meta.resolve('gennady');
  const gennadyFile = fileURLToPath(gennadyUrl);

  let packageDir = dirname(gennadyFile);
  while (!existsSync(resolve(packageDir, 'package.json'))) {
    packageDir = dirname(packageDir);
  }

  const readmePath = resolve(packageDir, 'cli/cmd/orient/README.md');

  if (!existsSync(readmePath)) {
    console.error(`README.md not found at ${readmePath}`);
    process.exit(1);
  }

  try {
    const content = readFileSync(readmePath, 'utf-8');
    console.log(content);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    console.error(`Cannot read README.md: ${message}`);
    process.exit(1);
  }
}
