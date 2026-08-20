// @file: Resolve a CLI ticket argument (path or bare Task-ID) to file content — shared by every SDD command that takes a ticket argument.
// @consumers: sdd-task.cmd, sdd-log.cmd, sdd-check.cmd, sdd-sync.cmd
// @tasks: N/A

import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
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
 * @purpose Recursively collect every ticket's graph ref under a directory — the Task-ID resolution search space.
 * @invariant Skips node_modules/.git/dist/build/out/coverage/__tests__ and symlinks, mirrors sdd-check's own walk.
 * @param root Directory to walk (absolute).
 * @returns Every ticket found, in discovery order.
 */
export function collectTicketRefs(root: string): TicketRef[] {
  const acc: TicketRef[] = [];

  function walk(dir: string): void {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith('.') || SKIP_DIRS.has(e.name) || e.isSymbolicLink()) continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        walk(full);
        continue;
      }
      if (!e.isFile() || !e.name.endsWith('.md')) continue;
      let content: string;
      try {
        content = readFileSync(full, 'utf-8');
      } catch {
        continue;
      }
      if (isTicket(content)) acc.push(ticketRef(full, content));
    }
  }

  walk(root);
  return acc;
}

/**
 * @purpose Outcome of resolving a CLI ticket argument.
 * @invariant `resolvedFrom: 'id'` carries the matched `id` for the resolution line; `'path'` never does.
 */
export type TicketResolution =
  | { ok: true; path: string; content: string; resolvedFrom: 'path' }
  | { ok: true; path: string; content: string; resolvedFrom: 'id'; id: string }
  | { ok: false; reason: 'unreadable' }
  | { ok: false; reason: 'unknown-id'; id: string; refs: TicketRef[] }
  | { ok: false; reason: 'ambiguous-id'; id: string; matches: TicketRef[] };

/**
 * @purpose Resolve a CLI ticket argument — a path (unchanged), or, when unreadable and Task-ID-shaped,
 * a scan-and-match by Meta Task-ID (AX_TASK_RESOLUTION).
 * @invariant Every ticket-taking SDD command resolves through this one function — no duplicate scans.
 * @param ticket Raw CLI argument (a ticket path or a bare Task-ID).
 * @param root Absolute project root — scanned only when the path read fails and the argument looks like an id.
 * @returns The resolved path + content (tagged by how it was found), or a typed failure reason.
 */
export function resolveTicketArg(ticket: string, root: string): TicketResolution {
  const directPath = resolve(ticket);
  try {
    return {
      ok: true,
      path: directPath,
      content: readFileSync(directPath, 'utf-8'),
      resolvedFrom: 'path',
    };
  } catch {
    // Not a readable path — fall through to Task-ID resolution below.
  }

  if (!looksLikeTaskId(ticket)) return { ok: false, reason: 'unreadable' };

  const refs = collectTicketRefs(root);
  const matches = refs.filter((r) => r.taskId === ticket);

  if (matches.length === 0) return { ok: false, reason: 'unknown-id', id: ticket, refs };
  if (matches.length > 1) return { ok: false, reason: 'ambiguous-id', id: ticket, matches };

  const match = matches[0] as TicketRef;
  const matchPath = resolve(match.file);
  try {
    return {
      ok: true,
      path: matchPath,
      content: readFileSync(matchPath, 'utf-8'),
      resolvedFrom: 'id',
      id: ticket,
    };
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
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
