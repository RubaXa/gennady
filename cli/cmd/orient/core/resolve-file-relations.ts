// @file: Read-only orient adapter from source header and canonical SDD corpus to the shared file-relations core.
// @consumers: OrientCommand
// @tasks: N/A

import { readdirSync, readFileSync, type Dirent } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import {
  fileRelationTicketFromContent,
  resolveFileRelations,
} from '../../../../shared/sdd/file-relations.ts';
import { collectSpecIdEntries } from '../../../../shared/sdd/spec-id.ts';
import { ticketFlowVersion } from '../../../../shared/sdd/flow.ts';
import type {
  FileRelationsResult,
  FileRelationTicketInput,
  FileSpecResolution,
} from '../../../../shared/sdd/file-relations.types.ts';
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

function ownerResolution(
  id: string,
  entries: ReturnType<typeof collectSpecIdEntries>
): FileSpecResolution {
  if (!id) return { status: 'unresolved', id: null };
  const matches = entries.filter((entry) => entry.id === id);
  if (matches.length === 1) return { status: 'resolved', id, path: matches[0]?.path ?? '' };
  if (matches.length === 0) return { status: 'unresolved', id };
  return { status: 'ambiguous', id, candidates: matches.map((entry) => entry.path) };
}

function ticketCorpus(
  root: string,
  entries: ReturnType<typeof collectSpecIdEntries>
): FileRelationTicketInput[] {
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

/**
 * @purpose Resolve one orient file query through the shared FO-2 model and on-demand Spec-ID index.
 * @param root Absolute project root.
 * @param file Absolute source file path.
 * @param header Parsed source header.
 * @returns Deterministic relations; legacy headers stay V1-lenient.
 */
export function resolveOrientFileRelations(
  root: string,
  file: string,
  header: FileHeader
): FileRelationsResult {
  const specId = header.spec ?? '';
  const flow = specId || (header.specCount ?? 0) > 0 ? 'v2' : 'v1';
  const entries = collectSpecIdEntries(resolve(root, 'specs'));
  return resolveFileRelations({
    repoRoot: root,
    file: relative(root, file).split(sep).join('/'),
    flow,
    spec: ownerResolution(specId, entries),
    hasLegacyTasks: header.tasks.length > 0,
    tickets: flow === 'v2' ? ticketCorpus(root, entries) : [],
  });
}
