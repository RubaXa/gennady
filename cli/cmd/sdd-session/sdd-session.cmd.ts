// @file: SddSessionCommand — CLI entry for gennady sdd-session: the CLI-owned specs/.sdd-session.md scratch file.
// @consumers: gennady.ts
// @tasks: N/A

import { existsSync, lstatSync, mkdirSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { logger } from '#logger';
import { parseArgs } from '../../../shared/common/parse-args.ts';
import {
  readScratchPayloadFile,
  type ScratchPayload,
} from '../../../shared/common/scratch-payload-file.ts';
import {
  createRepoFileExclusive,
  proveRepoDestination,
  proveRepoFile,
  readProvenRepoFile,
  removeProvenRepoFile,
  writeProvenRepoFile,
  type RepoFileIdentity,
} from '../../../shared/common/repo-file-identity.ts';
import {
  appendToSection,
  badInvocation,
  buildSkeleton,
  fileError,
  hasPlaceholder,
  isValidTermEntry,
  noSession,
  payloadFileError,
  placeholderError,
  setField,
  setGlossaryTerm,
  SET_FIELDS,
  type SessionOutcome,
  type SetField,
} from './sdd-session.types.ts';

const MODES = ['open', 'set', 'log', 'workset', 'term', 'close'] as const;
const GITIGNORE_LINE = '.sdd-session.md';

function oneFlag(value: unknown, name: string): string | undefined | SessionOutcome {
  if (Array.isArray(value)) return badInvocation(`--${name} must appear exactly once`);
  if (value === undefined) return undefined;
  if (typeof value !== 'string') return badInvocation(`--${name} needs a value`);
  return value;
}

function consumed(text: string, scratch?: ScratchPayload): SessionOutcome {
  const cleanupFailure = scratch?.consume() ?? null;
  return {
    ok: true,
    text: cleanupFailure
      ? `${text}\n[sdd-session] payload was applied but cleanup failed: ${cleanupFailure}\n  next: remove that exact scratch file before continuing.`
      : text,
  };
}

/**
 * @purpose Ensure `.sdd-session.md` is git-ignored at the project root — append the line, or create the file.
 * @param root Project root (cwd).
 * @invariant Idempotent — a project already ignoring the line is left byte-identical.
 */
function ensureGitignore(root: string): void {
  const destination = proveRepoDestination(root, '.gitignore', 'potential');
  if (!destination.ok) throw new Error(destination.detail);
  let content = '';
  let identity: RepoFileIdentity | null = null;
  if (existsSync(destination.absolute)) {
    const proven = proveRepoFile(root, '.gitignore');
    if (!proven.ok) throw new Error(proven.detail);
    identity = proven.identity;
    const read = readProvenRepoFile(identity);
    if (!read.ok) throw new Error(read.detail);
    content = read.content;
  }
  const already = content.split('\n').some((l) => l.trim() === GITIGNORE_LINE);
  if (already) return;

  const withTrailingNewline =
    content.length > 0 && !content.endsWith('\n') ? `${content}\n` : content;
  const updated = `${withTrailingNewline}${GITIGNORE_LINE}\n`;
  const written = identity
    ? writeProvenRepoFile(identity, updated)
    : createRepoFileExclusive(root, '.gitignore', updated);
  if (!written.ok) throw new Error(written.detail);
}

/** @purpose Create and prove the project-local payload boundary before any SDD phase is dispatched. */
function ensureScratchBoundary(root: string): void {
  for (const relativePath of ['.claude', '.claude/tmp']) {
    const inspected = proveRepoDestination(root, relativePath, 'potential');
    if (!inspected.ok) throw new Error(`${relativePath}: ${inspected.detail}`);
    if (!existsSync(inspected.absolute)) {
      mkdirSync(inspected.absolute);
      continue;
    }
    const stat = lstatSync(inspected.absolute);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new Error(`${relativePath} must be a regular directory, never a symlink`);
    }
  }
}

/** @purpose Prove/create the canonical specs directory without traversing a symlink. */
function ensureSpecsDirectory(root: string): void {
  const inspected = proveRepoDestination(root, 'specs', 'potential');
  if (!inspected.ok) throw new Error(`specs: ${inspected.detail}`);
  if (!existsSync(inspected.absolute)) mkdirSync(inspected.absolute);
  const stat = lstatSync(inspected.absolute);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error('specs must be a regular directory, never a symlink');
  }
}

/**
 * @purpose Execute gennady sdd-session — CLI-owned lifecycle of specs/.sdd-session.md per SESSION_FILE_FORMAT.
 * @param rawArgs Raw command-line arguments (process.argv).
 * @param now Clock injected for deterministic dates (the CLI tail passes the real now).
 * @returns SessionOutcome — a report of what happened, or an actionable failure.
 */
export async function run(rawArgs: string[], now: Date): Promise<SessionOutcome> {
  let args;
  try {
    args = parseArgs(
      rawArgs,
      {
        intent: { aliases: ['intent'], takesValue: true },
        scale: { aliases: ['scale'], takesValue: true },
        contentFile: { aliases: ['content-file'], takesValue: true },
      },
      { strict: true }
    );
  } catch (cause) {
    return badInvocation((cause as Error).message);
  }
  const positional = (args._ as string[]).filter(
    (a: string) => typeof a === 'string' && a !== 'sdd-session'
  );

  const mode = positional[0] as (typeof MODES)[number] | undefined;
  if (!mode || !MODES.includes(mode)) {
    return badInvocation(`unknown mode "${mode ?? ''}" — use ${MODES.join(' | ')}`);
  }

  const root = realpathSync(resolve('.'));
  const specsDir = join(root, 'specs');
  const sessionPath = join(specsDir, '.sdd-session.md');
  const sessionRelative = 'specs/.sdd-session.md';
  const contentFile = oneFlag(args.contentFile, 'content-file');
  if (typeof contentFile === 'object') return contentFile;

  // #region START_OPEN — idempotent: an existing session file is never overwritten
  if (mode === 'open') {
    if (contentFile) return badInvocation('--content-file does not apply to open mode');
    if (positional.length !== 1)
      return badInvocation('open mode takes only --intent/--scale flags');
    const intent = oneFlag(args.intent, 'intent');
    if (typeof intent === 'object') return intent;
    const scale = oneFlag(args.scale, 'scale');
    if (typeof scale === 'object') return scale;
    if (!intent) return badInvocation('missing --intent <intent>');
    if (hasPlaceholder(intent)) return placeholderError(intent);
    if (scale && hasPlaceholder(scale)) return placeholderError(scale);

    try {
      const destination = proveRepoDestination(root, sessionRelative, 'potential');
      if (!destination.ok) throw new Error(destination.detail);
      if (existsSync(destination.absolute)) {
        const existing = proveRepoFile(root, sessionRelative);
        if (!existing.ok) throw new Error(existing.detail);
        ensureScratchBoundary(root);
        return { ok: true, text: `[sdd-session] already open: ${sessionPath}` };
      }
      ensureScratchBoundary(root);
      ensureSpecsDirectory(root);
      ensureGitignore(root);
      const date = now.toISOString().slice(0, 10);
      const created = createRepoFileExclusive(
        root,
        sessionRelative,
        buildSkeleton(date, intent, scale)
      );
      if (!created.ok) throw new Error(created.detail);
    } catch (err) {
      return fileError(`${sessionPath} (${(err as Error).message})`);
    }
    logger.debug(`[SddSessionCommand#run] opened ${sessionPath}`);
    return {
      ok: true,
      text: [
        `[sdd-session] opened: ${sessionPath}`,
        'next: заполни working set по ходу работы (`sdd-session workset`), фиксируй каждый шаг',
        '  через `sdd-session log`, новые термины — через `sdd-session term`.',
      ].join('\n'),
    };
  }
  // #endregion END_OPEN

  if (args.intent !== undefined || args.scale !== undefined) {
    return badInvocation('--intent and --scale apply only to open mode');
  }

  // set/log/workset/close all require an already-open, exact regular session file.
  const destination = proveRepoDestination(root, sessionRelative, 'potential');
  if (!destination.ok) return fileError(`${sessionPath} (${destination.detail})`);
  if (!existsSync(destination.absolute)) return noSession(sessionPath);
  const session = proveRepoFile(root, sessionRelative);
  if (!session.ok) return fileError(`${sessionPath} (${session.detail})`);

  if (mode === 'close') {
    if (contentFile) return badInvocation('--content-file does not apply to close mode');
    if (positional.length !== 1) return badInvocation('close mode takes no content');
    const removed = removeProvenRepoFile(session.identity);
    if (!removed.ok) return fileError(`${sessionPath} (${removed.detail})`);
    logger.debug(`[SddSessionCommand#run] closed ${sessionPath}`);
    return {
      ok: true,
      text: [
        `[sdd-session] closed: ${sessionPath}`,
        'next: если по ходу сессии остались незакрытые решения — проверь, что каждое уже есть',
        '  в Decision Log артефакта, а не только в этом журнале.',
      ].join('\n'),
    };
  }

  const inlinePayload = positional.slice(mode === 'set' ? 2 : 1).join(' ');
  if (contentFile && inlinePayload.trim() !== '') {
    return badInvocation('inline content and --content-file are mutually exclusive');
  }
  let scratch: ScratchPayload | undefined;
  let payload = inlinePayload;
  if (contentFile) {
    const read = readScratchPayloadFile(root, contentFile);
    if (!read.ok) return payloadFileError(read.detail);
    scratch = read.payload;
    payload = scratch.content;
  }
  if (payload.trim() === '') return badInvocation(`mode "${mode}" needs content`);

  if (mode === 'set') {
    const field = positional[1] as SetField | undefined;
    const value = payload;
    if (!field || !SET_FIELDS.includes(field)) {
      return badInvocation(`unknown field "${field ?? ''}" — use ${SET_FIELDS.join(' | ')}`);
    }
    if (value.trim() === '') return badInvocation('set needs a value');
    if (hasPlaceholder(value)) return placeholderError(value);

    const read = readProvenRepoFile(session.identity);
    if (!read.ok) return fileError(`${sessionPath} (${read.detail})`);
    const written = writeProvenRepoFile(session.identity, setField(read.content, field, value));
    if (!written.ok) return fileError(`${sessionPath} (${written.detail})`);
    return consumed(`[sdd-session] set ${field}: ${value}`, scratch);
  }

  if (mode === 'term') {
    if (hasPlaceholder(payload)) return placeholderError(payload);
    if (!isValidTermEntry(payload)) {
      return badInvocation(`term needs "<term> — <phrasing>" (got "${payload}")`);
    }
    const read = readProvenRepoFile(session.identity);
    if (!read.ok) return fileError(`${sessionPath} (${read.detail})`);
    const written = writeProvenRepoFile(session.identity, setGlossaryTerm(read.content, payload));
    if (!written.ok) return fileError(`${sessionPath} (${written.detail})`);
    logger.debug(`[SddSessionCommand#run] set glossary term in ${sessionPath}`);
    return consumed(`[sdd-session] glossary term: ${payload}`, scratch);
  }

  // mode is 'log' or 'workset' — both append a bullet to their section
  if (hasPlaceholder(payload)) return placeholderError(payload);
  const section = mode === 'log' ? 'journal' : 'working set';

  const read = readProvenRepoFile(session.identity);
  if (!read.ok) return fileError(`${sessionPath} (${read.detail})`);
  const entries =
    mode === 'workset' ? payload.split(/\r?\n/).filter((line) => line.length > 0) : [payload];
  let updated: string | null = read.content;
  for (const entry of entries) {
    updated = updated === null ? null : appendToSection(updated, section, entry);
  }
  if (updated === null) return fileError(`${sessionPath} — no "${section}:" section found`);
  const written = writeProvenRepoFile(session.identity, updated);
  if (!written.ok) return fileError(`${sessionPath} (${written.detail})`);
  logger.debug(`[SddSessionCommand#run] appended to ${section} in ${sessionPath}`);
  return consumed(`[sdd-session] appended to ${section}: ${payload}`, scratch);
}

// Self-executing for CLI: gennady sdd-session <open|set|log|workset|close> [...] — see MODES above.
const outcome = await run(process.argv, new Date());
console.log(outcome.ok ? outcome.text : outcome.message);
process.exit(outcome.ok ? 0 : outcome.exitCode);
