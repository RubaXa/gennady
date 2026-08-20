// @file: Resolve a ticket's audit group — every ticket co-located with its owning spec — for `sdd-task --audit-group` / `--group-scope`.
// @consumers: sdd-task.cmd
// @tasks: N/A

import { existsSync, realpathSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { extractSection } from './section.ts';
import { parsePhasesOverview, parsePhaseDetail } from './ticket.ts';
import { parsePhaseHandoffs, parseHandoffArtifacts, type TicketRef } from './check.ts';
import { collectTicketRefs, resolveTicketArg } from './ticket-resolve.ts';

// A v2 ticket filename: `<name>.task.<ID>.md` — `<name>` is the scope or module name that also
// names the owning spec file (`<name>.spec.md`), same directory (AX_TASK_RESOLUTION's own convention).
const V2_TASK_TICKET_NAME = /^(.+)\.task\.[^/\\]+\.md$/;

/**
 * @purpose Outcome of resolving a ticket's owning spec from its filename convention.
 * @invariant `spec-missing` still carries `specPath` — the path the caller should have created.
 */
export type SpecResolution =
  | { ok: true; specPath: string }
  | { ok: false; reason: 'not-v2-ticket-name' }
  | { ok: false; reason: 'spec-missing'; specPath: string };

/**
 * @purpose Derive a ticket's owning spec path from its filename (`<name>.task.<ID>.md` → `<name>.spec.md`, same dir).
 * @param ticketPath Absolute or relative ticket file path.
 * @returns The resolved spec path, or why it could not be resolved.
 */
export function resolveOwningSpec(ticketPath: string): SpecResolution {
  const m = V2_TASK_TICKET_NAME.exec(basename(ticketPath));
  if (!m?.[1]) return { ok: false, reason: 'not-v2-ticket-name' };
  const specPath = join(dirname(ticketPath), `${m[1]}.spec.md`);
  if (!existsSync(specPath)) return { ok: false, reason: 'spec-missing', specPath };
  return { ok: true, specPath };
}

/**
 * @purpose Canonical directory of a path — resolves symlinks (macOS `/var` → `/private/var`) so two
 *   paths to the same directory compare equal.
 * @param p A file path (absolute or relative).
 * @returns The realpath'd containing directory, or the plain resolved one when realpath fails.
 */
function canonicalDir(p: string): string {
  const abs = resolve(p);
  try {
    return dirname(realpathSync(abs));
  } catch {
    return dirname(abs);
  }
}

/**
 * @purpose Select every ticket that shares its owning spec's directory — the audit-group boundary.
 * @invariant Group = tickets in the spec's exact directory — a module ticket in a subdirectory
 *   belongs to its own spec, never the parent's.
 * @param specPath The owning spec's path.
 * @param refs Every ticket ref in the project (e.g. from `collectTicketRefs`).
 * @returns The group's tickets, sorted by file path for a stable, deterministic listing.
 */
export function collectGroupRefs(specPath: string, refs: TicketRef[]): TicketRef[] {
  const dir = canonicalDir(specPath);
  return refs
    .filter((r) => canonicalDir(r.file) === dir)
    .sort((a, b) => resolve(a.file).localeCompare(resolve(b.file)));
}

/**
 * @purpose Full resolution of a CLI ticket argument to its audit group (AX_TASK_RESOLUTION + the spec-directory boundary).
 * @invariant `allRefs` is the one project-wide scan reused for both grouping and any dependent pickable-check — never re-scanned.
 */
export type AuditGroupResolution =
  | { ok: true; ticketPath: string; specPath: string; group: TicketRef[]; allRefs: TicketRef[] }
  | { ok: false; reason: 'unreadable' }
  | { ok: false; reason: 'unknown-id'; id: string; refs: TicketRef[] }
  | { ok: false; reason: 'ambiguous-id'; id: string; matches: TicketRef[] }
  | { ok: false; reason: 'not-v2-ticket-name'; ticketPath: string }
  | { ok: false; reason: 'spec-missing'; ticketPath: string; specPath: string };

/**
 * @purpose Resolve a CLI ticket argument (path or Task-ID) to its full audit group.
 * @param ticketArg Raw CLI argument — a ticket path or a bare Task-ID.
 * @param root Absolute project root (scanned once for both Task-ID resolution and grouping).
 * @returns The group + the spec it belongs to, or a typed failure reason.
 */
export function resolveAuditGroup(ticketArg: string, root: string): AuditGroupResolution {
  const resolved = resolveTicketArg(ticketArg, root);
  if (!resolved.ok) return resolved;

  const specRes = resolveOwningSpec(resolved.path);
  if (!specRes.ok) {
    return specRes.reason === 'not-v2-ticket-name'
      ? { ok: false, reason: 'not-v2-ticket-name', ticketPath: resolved.path }
      : {
          ok: false,
          reason: 'spec-missing',
          ticketPath: resolved.path,
          specPath: specRes.specPath,
        };
  }

  const allRefs = collectTicketRefs(root);
  return {
    ok: true,
    ticketPath: resolved.path,
    specPath: specRes.specPath,
    group: collectGroupRefs(specRes.specPath, allRefs),
    allRefs,
  };
}

/**
 * @purpose Union every phase's `Target Files` across a ticket's whole Phases Overview — the ticket's own review-scope contribution.
 * @param content Full ticket markdown.
 * @returns Target file paths, first-seen order, deduplicated.
 */
export function ticketTargetFiles(content: string): string[] {
  const ovSec = extractSection(content, 'PHASES_OVERVIEW');
  const phases = ovSec.status === 'ok' ? parsePhasesOverview(ovSec.content) : [];
  const seen = new Set<string>();
  const files: string[] = [];
  for (const p of phases) {
    const sec = extractSection(content, `PHASE_${p.id}`);
    if (sec.status !== 'ok') continue;
    for (const f of parsePhaseDetail(sec.content).targetFiles) {
      if (seen.has(f)) continue;
      seen.add(f);
      files.push(f);
    }
  }
  return files;
}

/**
 * @purpose Union every phase's Handoff `artifacts:` list from a ticket's Execution Log.
 * @param content Full ticket markdown.
 * @returns Artifact paths, first-seen order, deduplicated.
 */
export function ticketHandoffArtifacts(content: string): string[] {
  const logSec = extractSection(content, 'EXECUTION_LOG');
  if (logSec.status !== 'ok') return [];
  const seen = new Set<string>();
  const files: string[] = [];
  for (const line of Object.values(parsePhaseHandoffs(logSec.content))) {
    for (const a of parseHandoffArtifacts(line)) {
      if (seen.has(a)) continue;
      seen.add(a);
      files.push(a);
    }
  }
  return files;
}
