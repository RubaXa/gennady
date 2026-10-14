// @file: Read-only orient adapter from source header and canonical SDD corpus to the shared file-relations core.
// @spec: CLI-ORIENT
// @consumers: OrientCommand

import { readdirSync, readFileSync, type Dirent } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import {
  fileRelationTicketFromContent,
  resolveFileRelations,
} from '../../../../shared/sdd/file-relations.ts';
import { collectSpecIdEntries, type SpecIdEntry } from '../../../../shared/sdd/spec-id.ts';
import { detectFlowVersion, ticketFlowVersion } from '../../../../shared/sdd/flow.ts';
import type {
  FileRelationsResult,
  FileRelationTicketInput,
  FileSpecResolution,
} from '../../../../shared/sdd/file-relations.types.ts';
import type { FlowVersion } from '../../../../shared/sdd/flow.ts';
import type { FileHeader } from '../orient.types.ts';

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  'coverage',
  '__tests__',
]);

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function ticketFiles(specsRoot: string): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(full);
      } else if (entry.isFile() && /\.task\.[^/\\]+\.md$/.test(entry.name)) {
        files.push(full);
      }
    }
  };
  walk(specsRoot);
  return files.sort(compareText);
}

function ownerResolution(id: string, entries: readonly SpecIdEntry[]): FileSpecResolution {
  if (!id) return { status: 'unresolved', id: null };
  const matches = entries.filter((entry) => entry.id === id);
  if (matches.length === 1) return { status: 'resolved', id, path: matches[0]?.path ?? '' };
  if (matches.length === 0) return { status: 'unresolved', id };
  return { status: 'ambiguous', id, candidates: matches.map((entry) => entry.path) };
}

function ticketCorpus(root: string, entries: readonly SpecIdEntry[]): FileRelationTicketInput[] {
  const byPath = new Map(entries.map((entry) => [entry.path, entry.id]));
  const tickets: FileRelationTicketInput[] = [];
  for (const ticketPath of ticketFiles(resolve(root, 'specs'))) {
    let content: string;
    try {
      content = readFileSync(ticketPath, 'utf8');
    } catch {
      continue;
    }
    const ticketFile = relative(root, ticketPath).split(sep).join('/');
    const parsed = fileRelationTicketFromContent({
      file: ticketFile,
      flow: ticketFlowVersion(ticketPath, root),
      content,
      resolveSpecReference: (reference) => {
        const pathPart = reference.split('#', 1)[0] ?? '';
        if (!pathPart.endsWith('.spec.md')) return null;
        const target = relative(root, resolve(dirname(ticketPath), pathPart))
          .split(sep)
          .join('/');
        return byPath.get(target) ?? null;
      },
    });
    if (parsed.ok) tickets.push(parsed.ticket);
  }
  return tickets;
}

/** @purpose Invocation-local, read-only ownership corpus reused by multi-file CLI adapters. */
export type OrientFileRelationsContext = {
  /** @purpose Repository-level flow detected once for this invocation. */
  readonly repositoryFlow: FlowVersion;
  /** @purpose Canonical Spec-ID index collected once from the V2 spec corpus. */
  readonly specEntries: readonly SpecIdEntry[];
  /** @purpose Structured ticket corpus parsed once through canonical ticket helpers. */
  readonly tickets: readonly FileRelationTicketInput[];
};

/**
 * @purpose Build one read-only ownership corpus for all file queries in a CLI invocation.
 * @param root Absolute project root.
 * @returns Repository flow, canonical Spec-ID index, and structured ticket corpus.
 */
export function prepareOrientFileRelationsContext(root: string): OrientFileRelationsContext {
  const specEntries = collectSpecIdEntries(resolve(root, 'specs'));
  return {
    repositoryFlow: detectFlowVersion(root),
    specEntries,
    tickets: ticketCorpus(root, specEntries),
  };
}

/**
 * @purpose Resolve one orient file query through the shared FO-2 model and on-demand Spec-ID index.
 * @param root Absolute project root.
 * @param file Absolute source file path.
 * @param header Parsed source header.
 * @param [evidence] Optional HEAD-header evidence available only to changed-file adapters.
 * @param [prepared] Optional invocation-local corpus; avoids repeated filesystem scans for `--all`.
 * @returns Deterministic relations; untouched mixed-repo V1 headers stay lenient, while an exact
 *   V2 ticket target or prior @spec keeps the source strict.
 */
export function resolveOrientFileRelations(
  root: string,
  file: string,
  header: FileHeader,
  evidence: { hadSpecInBaseline?: boolean } = {},
  prepared: OrientFileRelationsContext = prepareOrientFileRelationsContext(root)
): FileRelationsResult {
  const specId = header.spec ?? '';
  const entries = prepared.specEntries;
  const corpus = prepared.tickets;
  let flow: FlowVersion =
    prepared.repositoryFlow === 'v2' ||
    specId ||
    (header.specCount ?? 0) > 0 ||
    evidence.hadSpecInBaseline
      ? 'v2'
      : 'v1';
  if (flow === 'v1') {
    const targetProbe = resolveFileRelations({
      repoRoot: root,
      file: relative(root, file).split(sep).join('/'),
      flow: 'v2',
      spec: { status: 'resolved', id: 'TARGET-PROBE', path: 'specs' },
      hasLegacyTasks: false,
      tickets: corpus.filter((ticket) => ticket.flow === 'v2'),
    });
    if (
      [targetProbe.planned, targetProbe.active, targetProbe.blocked, targetProbe.history].some(
        (relations) => relations.length > 0
      )
    ) {
      flow = 'v2';
    }
  }
  return resolveFileRelations({
    repoRoot: root,
    file: relative(root, file).split(sep).join('/'),
    flow,
    spec: ownerResolution(specId, entries),
    hasLegacyTasks: header.tasks.length > 0,
    tickets: flow === 'v2' ? corpus : [],
  });
}
