// @file: SddNewCommand — CLI entry for gennady sdd-new: scaffold one SDD v2 artifact from the shared/sdd/templates.ts registry.
// @consumers: gennady.ts
// @tasks: N/A

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { logger } from '#logger';
import { parseArgs } from '../../../shared/common/parse-args.ts';
import {
  TEMPLATES,
  ARTIFACT_KINDS,
  resolveNextSteps,
  type ArtifactKind,
} from '../../../shared/sdd/templates.ts';
import {
  validateTaskId,
  collectTaskIds,
  checkIdConflicts,
  describeIdConflict,
  suggestTaskId,
} from '../../../shared/sdd/task-id.ts';
import {
  badInvocation,
  unknownKind,
  fileExists,
  writeFailed,
  badTaskId,
  renderCreated,
  renderManifestReport,
  type NewOutcome,
} from './sdd-new.types.ts';

/**
 * @purpose Render `gennady sdd-new --list` — every kind with its path pattern.
 * @returns Listing text for stdout.
 */
export function renderList(): string {
  const rows = ARTIFACT_KINDS.map((k) => `  ${k.padEnd(14)} ${TEMPLATES[k].pathPattern}`);
  return ['[sdd-new] known kinds:', ...rows].join('\n');
}

/**
 * @purpose Last path segment of a (possibly nested) --module value — the module's own name, used as
 * directory leaf and file basename.
 * @invariant Callers validate the module path first (validateModulePath) — this does no checking of its own.
 * @param module Raw --module value, e.g. `foo/bar/qux`.
 * @returns The final segment, e.g. `qux`.
 */
function moduleName(module: string): string {
  const segments = module.split('/').filter((s) => s.length > 0);
  return segments[segments.length - 1] ?? module;
}

/**
 * @purpose Compute the target path for a kind from --scope/--module/--id, honoring an explicit --out.
 * @invariant Pure — no I/O or wall-clock read; `research`'s date is caller-supplied via
 *   `opts.date`, computed once by `run()`.
 * @invariant Callers validate required options are present AND well-formed (validateModulePath /
 *   validateSlug) before calling.
 * @invariant `task`/`module-index` accept an ABSENT --module: path stays flat
 *   (`specs/<scope>/<scope>.task.<ID>.md` / `.3-tasks.md`), not a doubled scope segment.
 * @param kind Artifact kind.
 * @param opts scope/module/id/out/slug/date as parsed from argv (or computed). `--module` may be any depth (`foo/bar/qux`) per AX_HIERARCHICAL_SPECS.
 * @returns The resolved relative path.
 */
export function resolvePath(
  kind: ArtifactKind,
  opts: { scope?: string; module?: string; id?: string; out?: string; slug?: string; date?: string }
): string {
  if (opts.out) return opts.out;
  switch (kind) {
    case 'product':
    case 'library':
    case 'infrastructure':
    case 'interface':
      return `specs/${opts.scope}/${opts.scope}.spec.md`;
    case 'module':
      return `specs/${opts.scope}/${opts.module}/${moduleName(opts.module as string)}.spec.md`;
    case 'task':
      return opts.module
        ? `specs/${opts.scope}/${opts.module}/${moduleName(opts.module as string)}.task.${opts.id}.md`
        : `specs/${opts.scope}/${opts.scope}.task.${opts.id}.md`;
    case 'module-index':
      return opts.module
        ? `specs/${opts.scope}/${opts.module}/${moduleName(opts.module as string)}.3-tasks.md`
        : `specs/${opts.scope}/${opts.scope}.3-tasks.md`;
    case 'scope-index':
      return `specs/${opts.scope}/${opts.scope}.3-tasks.md`;
    case 'project-index':
      return 'specs/3-tasks.md';
    case 'portal':
      return 'specs/README.md';
    case 'research':
      return `specs/${opts.scope}/research/${opts.date}-${opts.slug}.research.md`;
  }
}

/**
 * @purpose Which options are required for a kind, beyond --out (which always short-circuits path computation).
 * @invariant `task`/`module-index` skip --module (flat path via `resolvePath`); `module` always
 *   needs it. `research` needs --slug (kebab-case) — the tool, never the operator, supplies the date.
 * @param kind Artifact kind.
 * @returns Names of missing required options given what was supplied, empty when satisfied.
 */
function missingOptions(
  kind: ArtifactKind,
  opts: { scope?: string; module?: string; id?: string; out?: string; slug?: string }
): string[] {
  if (opts.out) return [];
  const missing: string[] = [];
  if (kind !== 'portal' && kind !== 'project-index' && !opts.scope) missing.push('--scope');
  if (kind === 'module' && !opts.module) missing.push('--module');
  if (kind === 'task' && !opts.id) missing.push('--id');
  if (kind === 'research' && !opts.slug) missing.push('--slug');
  return missing;
}

// One kebab-case segment: lowercase letters/digits, hyphen-separated words — the same grammar a
// `--scope` name follows. `--module` may nest to any depth (AX_HIERARCHICAL_SPECS); every segment
// must satisfy this on its own.
const SEGMENT_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * @purpose Validate a `research` --slug: same grammar as one `--module` segment (kebab-case,
 *   lowercase letters/digits, hyphen-separated) — no path nesting allowed (a slug is one segment).
 * @param slug Raw --slug value.
 * @returns null when valid, else a human-readable reason.
 */
export function validateSlug(slug: string): string | null {
  if (slug.length === 0) return '--slug must not be empty';
  if (!SEGMENT_RE.test(slug))
    return `--slug "${slug}" is not kebab-case (lowercase letters/digits, hyphen-separated)`;
  return null;
}

/**
 * @purpose Today's date as `yyyy-mm-dd` — substituted into a `research` doc's path; the operator
 *   supplies only --slug, never the date.
 * @param [now] Clock reading; defaults to `new Date()` — overridable so callers/tests stay deterministic.
 * @returns Zero-padded `yyyy-mm-dd`.
 */
export function todayDateStamp(now: Date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * @purpose Validate a (possibly nested) --module path: no empty/absolute/`..` segments, each segment kebab-case.
 * @invariant Pure. Called before `resolvePath` so a malformed --module never reaches path computation.
 * @param module Raw --module value.
 * @returns null when valid, else a human-readable reason.
 */
export function validateModulePath(module: string): string | null {
  if (module.startsWith('/')) return `--module must be a relative path, got "${module}"`;
  const segments = module.split('/');
  for (const seg of segments) {
    if (seg.length === 0) return `--module has an empty path segment: "${module}"`;
    if (seg === '.' || seg === '..')
      return `--module must not contain "." or ".." segments: "${module}"`;
    if (!SEGMENT_RE.test(seg))
      return `--module segment "${seg}" is not kebab-case (lowercase, hyphen-separated): "${module}"`;
  }
  return null;
}

/**
 * @purpose Execute gennady sdd-new — resolve the target path, refuse to overwrite, write the skeleton, report the section manifest.
 * @param rawArgs Raw command-line arguments (process.argv).
 * @returns NewOutcome — created path + report on success, else an actionable failure.
 */
export async function run(rawArgs: string[]): Promise<NewOutcome> {
  const args = parseArgs(rawArgs, {
    scope: { aliases: ['scope'], takesValue: true },
    module: { aliases: ['module'], takesValue: true },
    id: { aliases: ['id'], takesValue: true },
    out: { aliases: ['out'], takesValue: true },
    slug: { aliases: ['slug'], takesValue: true },
    list: { aliases: ['list'] },
    manifest: { aliases: ['manifest'] },
  });

  if (args.list) {
    return { ok: true, text: renderList(), path: '' };
  }

  const positional = (args._ as string[]).filter(
    (a: string) => typeof a === 'string' && a !== 'sdd-new'
  );
  const kindArg = positional[0];
  if (!kindArg) {
    logger.warn('[SddNewCommand#run] bad invocation — missing <kind>');
    return badInvocation('missing <kind>');
  }
  if (!(ARTIFACT_KINDS as string[]).includes(kindArg)) {
    logger.warn(`[SddNewCommand#run] unknown kind: ${kindArg}`);
    return unknownKind(kindArg);
  }
  const kind = kindArg as ArtifactKind;

  if (args.manifest) {
    logger.debug(`[SddNewCommand#run] manifest for ${kind}`);
    return { ok: true, text: renderManifestReport(kind, TEMPLATES[kind].sections), path: '' };
  }

  const opts: {
    scope?: string;
    module?: string;
    id?: string;
    out?: string;
    slug?: string;
    date?: string;
  } = {
    scope: typeof args.scope === 'string' ? args.scope : undefined,
    module: typeof args.module === 'string' ? args.module : undefined,
    id: typeof args.id === 'string' ? args.id : undefined,
    out: typeof args.out === 'string' ? args.out : undefined,
    slug: typeof args.slug === 'string' ? args.slug : undefined,
  };

  const missing = missingOptions(kind, opts);
  if (missing.length > 0) {
    return badInvocation(`${kind} requires ${missing.join(', ')}`);
  }

  if (opts.module) {
    const reason = validateModulePath(opts.module);
    if (reason) {
      logger.warn(`[SddNewCommand#run] bad --module: ${reason}`);
      return badInvocation(reason);
    }
  }

  // #region START_RESEARCH_SLUG — invariant: the tool substitutes today's date; the operator supplies only --slug, never a date
  if (kind === 'research' && opts.slug) {
    const reason = validateSlug(opts.slug);
    if (reason) {
      logger.warn(`[SddNewCommand#run] bad --slug: ${reason}`);
      return badInvocation(reason);
    }
    opts.date = todayDateStamp();
  }
  // #endregion END_RESEARCH_SLUG

  // #region START_TASK_ID — invariant: a bad --id is refused with a concrete fix, never silently repaired
  if (kind === 'task' && opts.id) {
    const grammarReason = validateTaskId(opts.id);
    if (grammarReason) {
      const existing = collectTaskIds(process.cwd());
      logger.warn(`[SddNewCommand#run] bad --id (grammar): ${opts.id}`);
      return badTaskId(opts.id, grammarReason, suggestTaskId(opts.id, existing));
    }
    const existing = collectTaskIds(process.cwd());
    const conflicts = checkIdConflicts(opts.id, existing);
    if (conflicts.length > 0) {
      logger.warn(`[SddNewCommand#run] --id conflict: ${opts.id}`);
      return badTaskId(
        opts.id,
        conflicts.map((c) => describeIdConflict(opts.id as string, c)).join(' '),
        suggestTaskId(opts.id, existing)
      );
    }
  }
  // #endregion END_TASK_ID

  const path = resolvePath(kind, opts);
  const abs = resolve(path);

  if (existsSync(abs)) {
    logger.warn(`[SddNewCommand#run] target already exists: ${path}`);
    return fileExists(path);
  }

  try {
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, TEMPLATES[kind].skeleton, 'utf-8');
  } catch (cause) {
    logger.warn(`[SddNewCommand#run] write failed: ${path}`);
    return writeFailed(path, cause);
  }

  logger.debug(`[SddNewCommand#run] created ${kind} skeleton at ${path}`);
  const nextSteps = resolveNextSteps(kind, {
    path,
    scope: opts.scope,
    module: opts.module,
    id: opts.id,
  });
  return { ok: true, text: renderCreated(kind, path, TEMPLATES[kind].sections, nextSteps), path };
}

// Self-executing for CLI: gennady sdd-new <kind> --scope <s> [--module <m>] [--id <ACR-slug>] [--out <path>] | gennady sdd-new --list
const outcome = await run(process.argv);
console.log(outcome.ok ? outcome.text : outcome.message);
process.exit(outcome.ok ? 0 : outcome.exitCode);
