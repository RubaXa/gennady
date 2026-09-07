// @file: Resolve a CLI ticket argument (path or bare Task-ID) to file content — shared by every SDD command that takes a ticket argument.
// @consumers: sdd-task.cmd, sdd-log.cmd, sdd-check.cmd, sdd-sync.cmd
// @tasks: N/A

import { readdirSync, realpathSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import {
  proveRepoFile,
  readProvenRepoFile,
  type RepoFileIdentity,
} from '../common/repo-file-identity.ts';
import { isTicket, ticketRef, type TicketRef } from './check.ts';
import { looksLikeTaskId } from './task-id.ts';

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  'coverage',
  '__tests__',
]);

/**
 * @purpose One graph reference paired with the immutable bytes observed by the strict corpus scan.
 */
export type TicketCorpusRef = TicketRef & {
  /** @purpose Immutable content observed by the strict scan, reused by structural queue consumers. */
  content: string;
};

/** @purpose Complete ticket corpus, or the first exact observation that prevents completeness. */
export type TicketCorpusResult =
  | { ok: true; refs: TicketCorpusRef[] }
  | { ok: false; detail: string };

/**
 * @purpose Outcome of resolving a CLI ticket argument.
 * @invariant `resolvedFrom: 'id'` carries the matched `id` for the resolution line; `'path'` never does.
 */
export type TicketResolution =
  | {
      ok: true;
      path: string;
      content: string;
      identity: RepoFileIdentity;
      resolvedFrom: 'path';
    }
  | {
      ok: true;
      path: string;
      content: string;
      identity: RepoFileIdentity;
      resolvedFrom: 'id';
      id: string;
    }
  | { ok: false; reason: 'unreadable' }
  | { ok: false; reason: 'unsafe-path' | 'unsafe-corpus'; detail: string }
  | { ok: false; reason: 'unknown-id'; id: string; refs: TicketRef[] }
  | { ok: false; reason: 'ambiguous-id'; id: string; matches: TicketRef[] };

type StrictTicketCorpus =
  | { ok: true; refs: Array<TicketCorpusRef & { identity: RepoFileIdentity }> }
  | { ok: false; detail: string };

/** @purpose Scan the Task-ID corpus fail-closed: unreadable entries and non-skipped symlinks invalidate the lookup. */
function collectTicketRefsStrict(root: string): StrictTicketCorpus {
  let canonicalRoot: string;
  try {
    canonicalRoot = realpathSync(resolve(root));
  } catch {
    return { ok: false, detail: 'repository root is missing or unreadable' };
  }
  const refs: Array<TicketCorpusRef & { identity: RepoFileIdentity }> = [];

  function walk(relativeDir: string): string | null {
    const absoluteDir = relativeDir ? join(canonicalRoot, relativeDir) : canonicalRoot;
    let entries;
    try {
      entries = readdirSync(absoluteDir, { withFileTypes: true });
    } catch (cause) {
      return `ticket corpus directory is unreadable: ${relativeDir || '.'} (${(cause as NodeJS.ErrnoException).code ?? 'I/O error'})`;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
      const rel = relativeDir ? join(relativeDir, entry.name) : entry.name;
      if (entry.isSymbolicLink()) return `ticket corpus contains a symlink: ${rel}`;
      if (entry.isDirectory()) {
        const issue = walk(rel);
        if (issue) return issue;
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      const proven = proveRepoFile(canonicalRoot, rel);
      if (!proven.ok) return `ticket corpus file is unsafe: ${rel} (${proven.detail})`;
      const read = readProvenRepoFile(proven.identity);
      if (!read.ok) return `ticket corpus file is unreadable: ${rel} (${read.detail})`;
      if (isTicket(read.content)) {
        refs.push({
          ...ticketRef(proven.identity.absolute, read.content),
          content: read.content,
          identity: proven.identity,
        });
      }
    }
    return null;
  }

  const issue = walk('');
  return issue ? { ok: false, detail: issue } : { ok: true, refs };
}

/**
 * @purpose Scan the complete ticket search space without ever returning partial graph evidence.
 * @invariant A failed directory/file observation or non-skipped symlink yields `ok:false`; callers
 * must not print an execution map or derive GATE_QUEUE from an incomplete corpus.
 * @param root Repository root whose non-skipped Markdown tree is the ticket search space.
 * @returns Every ticket plus its exact observed content, or one teaching corpus failure.
 */
export function collectTicketCorpus(root: string): TicketCorpusResult {
  const corpus = collectTicketRefsStrict(root);
  if (!corpus.ok) return corpus;
  return {
    ok: true,
    refs: corpus.refs.map(({ identity: _identity, ...ref }) => ref),
  };
}

/**
 * @purpose Backward-compatible throwing facade for callers that still expect the former array API.
 * @deprecated Prefer `collectTicketCorpus`; it makes incomplete evidence explicit in the type.
 * @invariant A failed corpus observation throws instead of returning a partial ticket graph.
 * @param root Repository root whose ticket corpus must be complete.
 * @returns Every ticket reference, or throws when the corpus cannot be observed completely.
 */
export function collectTicketRefs(root: string): TicketRef[] {
  const corpus = collectTicketCorpus(root);
  if (!corpus.ok) throw new Error(`ticket corpus is incomplete: ${corpus.detail}`);
  return corpus.refs;
}

/**
 * @purpose Resolve a CLI ticket argument — a path (unchanged), or, when unreadable and Task-ID-shaped,
 * a scan-and-match by Meta Task-ID (AX_TASK_RESOLUTION).
 * @invariant Every ticket-taking SDD command resolves through this one function — no duplicate scans.
 * @param ticket Raw CLI argument (a ticket path or a bare Task-ID).
 * @param root Absolute project root — scanned only when the path read fails and the argument looks like an id.
 * @returns The resolved path + content (tagged by how it was found), or a typed failure reason.
 */
export function resolveTicketArg(ticket: string, root: string): TicketResolution {
  const direct = proveRepoFile(root, ticket);
  if (direct.ok) {
    const read = readProvenRepoFile(direct.identity);
    if (!read.ok) return { ok: false, reason: 'unsafe-path', detail: read.detail };
    return {
      ok: true,
      path: direct.identity.absolute,
      content: read.content,
      identity: direct.identity,
      resolvedFrom: 'path',
    };
  }

  if (!looksLikeTaskId(ticket)) {
    return { ok: false, reason: 'unsafe-path', detail: direct.detail };
  }

  const corpus = collectTicketRefsStrict(root);
  if (!corpus.ok) return { ok: false, reason: 'unsafe-corpus', detail: corpus.detail };
  const refs = corpus.refs;
  const matches = refs.filter((r) => r.taskId === ticket);

  if (matches.length === 0) return { ok: false, reason: 'unknown-id', id: ticket, refs };
  if (matches.length > 1) return { ok: false, reason: 'ambiguous-id', id: ticket, matches };

  const match = matches[0] as TicketCorpusRef & { identity: RepoFileIdentity };
  const read = readProvenRepoFile(match.identity);
  if (!read.ok) return { ok: false, reason: 'unsafe-corpus', detail: read.detail };
  return {
    ok: true,
    path: match.identity.absolute,
    content: read.content,
    identity: match.identity,
    resolvedFrom: 'id',
    id: ticket,
  };
}

/**
 * @purpose Build the `[<cmd>] <id> → <relative-path>` banner printed when a ticket resolved via Task-ID.
 * @param cmd Command tag (e.g. `sdd-log`), without brackets.
 * @param id The Task-ID that was resolved.
 * @param path Absolute path of the matched ticket.
 * @param root Absolute project root (the path is printed relative to it).
 * @returns The one-line resolution banner.
 */
export function resolutionLine(cmd: string, id: string, path: string, root: string): string {
  return `[${cmd}] ${id} → ${relative(root, path) || path}`;
}

/**
 * @purpose Shared tool-teaches hint for an unreadable ticket argument — points at `sdd-task`'s map.
 * @param ticket The ticket path or Task-ID that could not be resolved.
 * @returns A one-line, copy-pasteable hint.
 */
export function unreadableTicketHint(ticket: string): string {
  const looksPathy = /[\\/]/.test(ticket) || /\.md$/i.test(ticket);
  return looksPathy
    ? 'Cannot read the ticket at that path — verify it, or run `sdd-task` with no arguments for the execution map (it lists every Task-ID with its path).'
    : 'Cannot read the ticket — verify the path or Task-ID, or run `sdd-task` with no arguments for the execution map.';
}
