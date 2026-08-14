// @file: SddSessionCommand — CLI entry for gennady sdd-session: the CLI-owned specs/.sdd-session.md scratch file.
// @consumers: gennady.ts
// @tasks: N/A

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { logger } from '#logger';
import { parseArgs } from '../../../shared/common/parse-args.ts';
import {
  appendToSection,
  badInvocation,
  buildSkeleton,
  fileError,
  hasPlaceholder,
  noSession,
  placeholderError,
  setField,
  SET_FIELDS,
  type SessionOutcome,
  type SetField,
} from './sdd-session.types.ts';

const MODES = ['open', 'set', 'log', 'workset', 'close'] as const;
const GITIGNORE_LINE = '.sdd-session.md';

/**
 * @purpose Ensure `.sdd-session.md` is git-ignored at the project root — append the line, or create the file.
 * @param root Project root (cwd).
 * @invariant Idempotent — a project already ignoring the line is left byte-identical.
 */
function ensureGitignore(root: string): void {
  const path = join(root, '.gitignore');
  let content = '';
  try {
    content = readFileSync(path, 'utf-8');
  } catch {
    content = '';
  }
  const already = content.split('\n').some((l) => l.trim() === GITIGNORE_LINE);
  if (already) return;

  const withTrailingNewline = content.length > 0 && !content.endsWith('\n') ? `${content}\n` : content;
  writeFileSync(path, `${withTrailingNewline}${GITIGNORE_LINE}\n`, 'utf-8');
}

/**
 * @purpose Execute gennady sdd-session — CLI-owned lifecycle of specs/.sdd-session.md per SESSION_FILE_FORMAT.
 * @param rawArgs Raw command-line arguments (process.argv).
 * @param now Clock injected for deterministic dates (the CLI tail passes the real now).
 * @returns SessionOutcome — a report of what happened, or an actionable failure.
 */
export async function run(rawArgs: string[], now: Date): Promise<SessionOutcome> {
  const args = parseArgs(rawArgs, {
    intent: { aliases: ['intent'], takesValue: true },
    scale: { aliases: ['scale'], takesValue: true },
  });
  const positional = (args._ as string[]).filter(
    (a: string) => typeof a === 'string' && a !== 'sdd-session'
  );

  const mode = positional[0] as (typeof MODES)[number] | undefined;
  if (!mode || !MODES.includes(mode)) {
    return badInvocation(`unknown mode "${mode ?? ''}" — use ${MODES.join(' | ')}`);
  }

  const root = resolve('.');
  const specsDir = join(root, 'specs');
  const sessionPath = join(specsDir, '.sdd-session.md');

  // #region START_OPEN — idempotent: an existing session file is never overwritten
  if (mode === 'open') {
    const intent = args.intent as string | undefined;
    const scale = args.scale as string | undefined;
    if (!intent) return badInvocation('missing --intent <intent>');
    if (hasPlaceholder(intent)) return placeholderError(intent);
    if (scale && hasPlaceholder(scale)) return placeholderError(scale);

    try {
      if (existsSync(sessionPath)) {
        return { ok: true, text: `[sdd-session] already open: ${sessionPath}` };
      }
      mkdirSync(specsDir, { recursive: true });
      const date = now.toISOString().slice(0, 10);
      writeFileSync(sessionPath, buildSkeleton(date, intent, scale), 'utf-8');
      ensureGitignore(root);
    } catch (err) {
      return fileError(`${sessionPath} (${(err as Error).message})`);
    }
    logger.debug(`[SddSessionCommand#run] opened ${sessionPath}`);
    return { ok: true, text: `[sdd-session] opened: ${sessionPath}` };
  }
  // #endregion END_OPEN

  // set/log/workset/close all require an already-open session
  if (!existsSync(sessionPath)) return noSession(sessionPath);

  if (mode === 'close') {
    try {
      rmSync(sessionPath);
    } catch (err) {
      return fileError(`${sessionPath} (${(err as Error).message})`);
    }
    logger.debug(`[SddSessionCommand#run] closed ${sessionPath}`);
    return { ok: true, text: `[sdd-session] closed: ${sessionPath}` };
  }

  const payload = positional.slice(1).join(' ');
  if (payload.trim() === '') return badInvocation(`mode "${mode}" needs content`);

  if (mode === 'set') {
    const field = positional[1] as SetField | undefined;
    const value = positional.slice(2).join(' ');
    if (!field || !SET_FIELDS.includes(field)) {
      return badInvocation(`unknown field "${field ?? ''}" — use ${SET_FIELDS.join(' | ')}`);
    }
    if (value.trim() === '') return badInvocation('set needs a value');
    if (hasPlaceholder(value)) return placeholderError(value);

    let content: string;
    try {
      content = readFileSync(sessionPath, 'utf-8');
    } catch (err) {
      return fileError(`${sessionPath} (${(err as Error).message})`);
    }
    try {
      writeFileSync(sessionPath, setField(content, field, value), 'utf-8');
    } catch (err) {
      return fileError(`${sessionPath} (${(err as Error).message})`);
    }
    return { ok: true, text: `[sdd-session] set ${field}: ${value}` };
  }

  // mode is 'log' or 'workset' — both append a bullet to their section
  if (hasPlaceholder(payload)) return placeholderError(payload);
  const section = mode === 'log' ? 'journal' : 'working set';

  let content: string;
  try {
    content = readFileSync(sessionPath, 'utf-8');
  } catch (err) {
    return fileError(`${sessionPath} (${(err as Error).message})`);
  }
  const updated = appendToSection(content, section, payload);
  if (updated === null) return fileError(`${sessionPath} — no "${section}:" section found`);
  try {
    writeFileSync(sessionPath, updated, 'utf-8');
  } catch (err) {
    return fileError(`${sessionPath} (${(err as Error).message})`);
  }
  logger.debug(`[SddSessionCommand#run] appended to ${section} in ${sessionPath}`);
  return { ok: true, text: `[sdd-session] appended to ${section}: ${payload}` };
}

// Self-executing for CLI: gennady sdd-session <open|set|log|workset|close> [...] — see MODES above.
const outcome = await run(process.argv, new Date());
console.log(outcome.ok ? outcome.text : outcome.message);
process.exit(outcome.ok ? 0 : outcome.exitCode);
