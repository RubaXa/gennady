// @file: Safe reader for one-shot SDD CLI payloads written under project-local .claude/tmp/.
// @consumers: sdd-log, sdd-session
// @tasks: N/A

import { closeSync, constants, fstatSync, openSync, readFileSync } from 'node:fs';
import { inspectRepoPath } from './repo-path.ts';
import {
  proveRepoFile,
  removeProvenRepoFile,
  type RepoFileIdentity,
} from './repo-file-identity.ts';

/** @purpose Default upper bound for one free-form CLI payload. */
const SCRATCH_PAYLOAD_MAX_BYTES = 32 * 1024;

/** @purpose A validated payload plus its one-shot cleanup operation. */
export type ScratchPayload = {
  /** @purpose Exact decoded UTF-8 bytes, treated only as data. */
  content: string;
  /** @purpose Canonical repository-relative scratch path. */
  relativePath: string;
  /** @purpose Unlink the exact inode read, never a later replacement at the same path. | @returns Null on success, else an actionable path/error. */
  consume: () => string | null;
};

/** @purpose Result of reading one repository-local scratch payload. */
type ScratchPayloadResult = { ok: true; payload: ScratchPayload } | { ok: false; detail: string };

const DISALLOWED_CONTROL = /[\0-\x08\x0b\x0c\x0e-\x1f\x7f]/;
const SAFE_SCRATCH_NAME = /^\.claude\/tmp\/[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * @purpose Read literal free-form text without placing it in a shell argument.
 * @invariant The path is an exact regular non-symlink file below `.claude/tmp/`; UTF-8 decoding is
 *   fatal, content is non-empty and bounded, and no byte is ever interpreted as a command.
 * @param root Repository root (normally cwd).
 * @param rawPath Exact repository-relative payload path supplied to the CLI.
 * @param [maxBytes] Maximum accepted byte length.
 * @returns Validated literal content and an identity-bound one-shot consume callback, or a reason.
 */
export function readScratchPayloadFile(
  root: string,
  rawPath: string,
  maxBytes = SCRATCH_PAYLOAD_MAX_BYTES
): ScratchPayloadResult {
  const inspected = inspectRepoPath(root, rawPath, 'file');
  if (!inspected.ok) return { ok: false, detail: inspected.detail };
  if (!inspected.relative.startsWith('.claude/tmp/')) {
    return {
      ok: false,
      detail: 'payload must be below the project-local `.claude/tmp/` directory',
    };
  }
  if (!SAFE_SCRATCH_NAME.test(inspected.relative)) {
    return {
      ok: false,
      detail: 'payload filename must use only letters, digits, dot, underscore, or hyphen',
    };
  }

  let fd: number | undefined;
  let bytes: Buffer;
  let identity: RepoFileIdentity;
  try {
    fd = openSync(inspected.absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = fstatSync(fd);
    if (!stat.isFile()) return { ok: false, detail: 'payload is not a regular file' };
    if (stat.size === 0) return { ok: false, detail: 'payload is empty' };
    if (stat.size > maxBytes) {
      return { ok: false, detail: `payload exceeds the ${maxBytes}-byte limit` };
    }
    bytes = readFileSync(fd);
    if (bytes.length > maxBytes) {
      return { ok: false, detail: `payload exceeds the ${maxBytes}-byte limit` };
    }
    const proven = proveRepoFile(root, inspected.relative);
    if (!proven.ok) {
      return { ok: false, detail: `payload identity cannot be proven: ${proven.detail}` };
    }
    if (proven.identity.dev !== stat.dev || proven.identity.ino !== stat.ino) {
      return { ok: false, detail: 'payload identity changed while it was read' };
    }
    identity = proven.identity;
  } catch (cause) {
    return {
      ok: false,
      detail: `payload cannot be read safely: ${(cause as NodeJS.ErrnoException).code ?? 'I/O error'}`,
    };
  } finally {
    if (fd !== undefined) closeSync(fd);
  }

  let content: string;
  try {
    content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return { ok: false, detail: 'payload is not valid UTF-8' };
  }
  if (content.trim() === '') return { ok: false, detail: 'payload is blank' };
  if (DISALLOWED_CONTROL.test(content)) {
    return { ok: false, detail: 'payload contains a disallowed control byte' };
  }

  return {
    ok: true,
    payload: {
      content,
      relativePath: inspected.relative,
      consume: () => {
        const removed = removeProvenRepoFile(identity);
        return removed.ok ? null : `${inspected.relative} (${removed.detail})`;
      },
    },
  };
}
