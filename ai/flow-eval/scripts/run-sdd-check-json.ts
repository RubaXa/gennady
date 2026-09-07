// @file: Shared child-process runner for `sdd-check --all --format json`, used by both the
//   zero-new-error gate and the baseline generator (GAP-B-1).
// @invariant Captures the child's stdout via a real temp FILE, never a pipe: `sdd-check`'s ~62KB+
//   JSON payload is written with `console.log` immediately followed by `process.exit(exitCode)`, and
//   on this platform a large synchronous write to a PIPE stdout is silently truncated before the
//   event loop flushes it (a long-standing Node.js quirk — non-blocking pipes vs. `process.exit`).
//   A regular file descriptor is written to synchronously by the OS, so this is not exposed to it.
//   Verified empirically while building this gate: piped capture truncated at exactly the same byte
//   offset on every run; file-redirected capture never did.
// @consumers: ai/flow-eval/scripts/sdd-check-zero-new-error.ts, ai/flow-eval/scripts/generate-sdd-check-baseline.ts
// @tasks: N/A

import { existsSync, mkdtempSync, openSync, closeSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { RawFinding } from './sdd-check-baseline-compare.ts';

export type SddCheckJsonPayload = {
  readonly schema: 'gennady.sdd-check.findings.v1';
  readonly fileCount: number;
  readonly findings: readonly RawFinding[];
};

type SddCheckRunResult =
  | { readonly ok: true; readonly payload: SddCheckJsonPayload }
  | { readonly ok: false; readonly reason: string };

/**
 * @purpose Run `sdd-check --all <root> --format json` against the RC's own binary and parse its
 *   findings payload.
 * @invariant Prefers the built `dist/gennady.js` (the exact binary GAP-B-1's baseline was measured
 *   against); falls back to `npx tsx cli/gennady.ts` (the local devDependency, never the registry
 *   `npx gennady`) only when dist is absent.
 * @param projectRoot Absolute path to the project root (cwd for the child process).
 * @param root Path argument passed to `sdd-check --all` (relative to projectRoot).
 * @returns The parsed findings payload, or a failure reason (never throws).
 */
export function runSddCheckJson(projectRoot: string, root: string): SddCheckRunResult {
  const distEntry = resolve(projectRoot, 'dist/gennady.js');
  const useBuilt = existsSync(distEntry);
  const command = useBuilt
    ? { bin: 'node', args: [distEntry, 'sdd-check', '--all', root, '--format', 'json'] }
    : {
        bin: 'npx',
        args: ['tsx', 'cli/gennady.ts', 'sdd-check', '--all', root, '--format', 'json'],
      };

  const tmpDir = mkdtempSync(join(tmpdir(), 'sdd-check-json-'));
  const stdoutPath = join(tmpDir, 'stdout.json');
  const stdoutFd = openSync(stdoutPath, 'w');
  let result;
  try {
    result = spawnSync(command.bin, command.args, {
      cwd: projectRoot,
      stdio: ['ignore', stdoutFd, 'pipe'],
      encoding: 'utf8',
    });
  } finally {
    closeSync(stdoutFd);
  }

  if (result.error) {
    rmSync(tmpDir, { recursive: true, force: true });
    return { ok: false, reason: `failed to spawn sdd-check: ${result.error.message}` };
  }

  const stdout = readFileSync(stdoutPath, 'utf8');
  rmSync(tmpDir, { recursive: true, force: true });

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    return {
      ok: false,
      reason: [
        `sdd-check did not produce parseable JSON on stdout (${detail}).`,
        `invocation: ${command.bin} ${command.args.join(' ')}`,
        `exit code: ${result.status}`,
        result.stderr ? `stderr: ${result.stderr}` : '',
        stdout ? `stdout (first 2000 chars): ${stdout.slice(0, 2000)}` : '(empty stdout)',
      ]
        .filter(Boolean)
        .join('\n'),
    };
  }

  const payload = parsed as Partial<SddCheckJsonPayload>;
  if (
    payload.schema !== 'gennady.sdd-check.findings.v1' ||
    !Array.isArray(payload.findings) ||
    typeof payload.fileCount !== 'number'
  ) {
    return {
      ok: false,
      reason: 'sdd-check JSON output does not match schema gennady.sdd-check.findings.v1',
    };
  }
  return { ok: true, payload: payload as SddCheckJsonPayload };
}
