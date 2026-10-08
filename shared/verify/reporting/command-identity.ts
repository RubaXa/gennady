// @file: Canonical secret-safe identity for one planned local Verify command.
// @consumers: Verify report projection, SDD attempt journal, exact E-18 evidence checker
// @spec: CLI-VERIFY

import { createHash } from 'node:crypto';
import path from 'node:path';
import type { LocalCommand } from '../model/verify-step.type.ts';

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function commandCwd(root: string, cwd: string): string {
  if (!path.isAbsolute(root) || !path.isAbsolute(cwd)) {
    throw new Error('VERIFY_COMMAND_IDENTITY_INVALID: root and cwd must be absolute');
  }
  const relative = path.relative(root, cwd).split(path.sep).join('/');
  if (relative === '') return '.';
  return relative;
}

function identityFor(
  command: Pick<LocalCommand, 'argv' | 'env' | 'timeoutMs'>,
  cwd: string
): string {
  const projection = {
    schema: 'gennady.verify-command-identity.v1',
    argv: [...command.argv],
    cwd,
    environment: Object.entries(command.env ?? {}).sort(([left], [right]) =>
      compareText(left, right)
    ),
    timeoutMs: command.timeoutMs,
  };
  return `sha256:${createHash('sha256').update(JSON.stringify(projection)).digest('hex')}`;
}

/**
 * @purpose Bind a process-safe digest to the exact planned argv, cwd, env overrides and timeout.
 * @param command Exact local command materialized by the validated Verify plan.
 * @param root Canonical repository root used to remove machine-specific absolute cwd bytes.
 * @returns Versioned sha256 identity; argv and environment values never leave the digest.
 */
export function createVerifyCommandIdentity(command: LocalCommand, root: string): string {
  return identityFor(command, commandCwd(root, command.cwd));
}

/**
 * @purpose Build the same identity for a reviewed command whose cwd is exactly repository root.
 * @param command Safe argv/env/timeout contract owned by reviewed project configuration.
 * @returns The same versioned digest produced for an equivalent materialized LocalCommand.
 */
export function createRepositoryRootCommandIdentity(
  command: Pick<LocalCommand, 'argv' | 'env' | 'timeoutMs'>
): string {
  return identityFor(command, '.');
}
