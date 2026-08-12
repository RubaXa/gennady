// @file: SddNewCommand — CLI entry for gennady sdd-new: scaffold one SDD v2 artifact from the shared/sdd/templates.ts registry.
// @consumers: gennady.ts
// @tasks: N/A

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { logger } from '#logger';
import { parseArgs } from '../../../shared/common/parse-args.ts';
import { TEMPLATES, ARTIFACT_KINDS, type ArtifactKind } from '../../../shared/sdd/templates.ts';
import {
  badInvocation,
  unknownKind,
  fileExists,
  writeFailed,
  renderCreated,
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
 * @purpose Compute the target path for a kind from --scope/--module/--id, honoring an explicit --out.
 * @invariant Pure — no I/O. Callers validate required options are present before calling.
 * @param kind Artifact kind.
 * @param opts scope/module/id/out as parsed from argv.
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
      return `specs/${opts.scope}/${opts.module}/${opts.module}.spec.md`;
    case 'task':
      return `specs/${opts.scope}/${opts.module}/${opts.module}.task.${opts.id}.md`;
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
  if (kind !== 'portal' && !opts.scope) missing.push('--scope');
  if ((kind === 'module' || kind === 'task') && !opts.module) missing.push('--module');
  if (kind === 'task' && !opts.id) missing.push('--id');
  return missing;
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
