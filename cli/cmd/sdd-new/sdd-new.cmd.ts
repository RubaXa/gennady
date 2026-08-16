// @file: SddNewCommand — CLI entry for gennady sdd-new: scaffold one SDD v2 artifact from the shared/sdd/templates.ts registry.
// @consumers: gennady.ts
// @tasks: N/A

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { logger } from '#logger';
import { parseArgs } from '../../../shared/common/parse-args.ts';
import { TEMPLATES, ARTIFACT_KINDS, type ArtifactKind } from '../../../shared/sdd/templates.ts';
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
 * @invariant Pure — no I/O. Callers validate required options are present AND well-formed (validateModulePath) before calling.
 * @param kind Artifact kind.
 * @param opts scope/module/id/out as parsed from argv. `--module` may be any depth (`foo/bar/qux`) per AX_HIERARCHICAL_SPECS.
 * @returns The resolved relative path.
 */
export function resolvePath(
  kind: ArtifactKind,
  opts: { scope?: string; module?: string; id?: string; out?: string }
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
      return `specs/${opts.scope}/${opts.module}/${moduleName(opts.module as string)}.task.${opts.id}.md`;
    case 'module-index':
      return `specs/${opts.scope}/${opts.module}/${moduleName(opts.module as string)}.3-tasks.md`;
    case 'scope-index':
      return `specs/${opts.scope}/${opts.scope}.3-tasks.md`;
    case 'project-index':
      return 'specs/3-tasks.md';
    case 'portal':
      return 'specs/README.md';
  }
}

/**
 * @purpose Which options are required for a kind, beyond --out (which always short-circuits path computation).
 * @param kind Artifact kind.
 * @returns Names of missing required options given what was supplied, empty when satisfied.
 */
function missingOptions(
  kind: ArtifactKind,
  opts: { scope?: string; module?: string; id?: string; out?: string }
): string[] {
  if (opts.out) return [];
  const missing: string[] = [];
  if (kind !== 'portal' && kind !== 'project-index' && !opts.scope) missing.push('--scope');
  if ((kind === 'module' || kind === 'task' || kind === 'module-index') && !opts.module)
    missing.push('--module');
  if (kind === 'task' && !opts.id) missing.push('--id');
  return missing;
}

// One kebab-case segment: lowercase letters/digits, hyphen-separated words — the same grammar a
// `--scope` name follows. `--module` may nest to any depth (AX_HIERARCHICAL_SPECS); every segment
// must satisfy this on its own.
const SEGMENT_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

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

  const opts = {
    scope: typeof args.scope === 'string' ? args.scope : undefined,
    module: typeof args.module === 'string' ? args.module : undefined,
    id: typeof args.id === 'string' ? args.id : undefined,
    out: typeof args.out === 'string' ? args.out : undefined,
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
  return { ok: true, text: renderCreated(kind, path, TEMPLATES[kind].sections), path };
}

// Self-executing for CLI: gennady sdd-new <kind> --scope <s> [--module <m>] [--id <ACR-slug>] [--out <path>] | gennady sdd-new --list
const outcome = await run(process.argv);
console.log(outcome.ok ? outcome.text : outcome.message);
process.exit(outcome.ok ? 0 : outcome.exitCode);
