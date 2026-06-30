// @file: SddMigrateCommand — v1→v2 migration; `anchors` mode injects <!--SECTION:--> markers into v1 tickets.
// @consumers: gennady.ts
// @tasks: N/A

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { logger } from '#logger';
import { parseArgs } from '../../../shared/common/parse-args.ts';
import { injectAnchors } from '../../../shared/sdd/anchor-inject.ts';
import { badInvocation, type MigrateOutcome } from './sdd-migrate.types.ts';

/** @purpose Recursively collect v1 ticket files (`*.task-*.md`) under `<root>/tasks/`. | @param root Project root. | @returns Absolute ticket paths. */
function findV1Tickets(root: string): string[] {
  const acc: string[] = [];
  const walk = (dir: string): void => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith('.') || e.isSymbolicLink()) continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && /\.task-[0-9]+\.md$/.test(e.name)) acc.push(full);
    }
  };
  try {
    if (statSync(join(root, 'tasks')).isDirectory()) walk(join(root, 'tasks'));
  } catch {
    // no tasks/ — nothing to migrate
  }
  return acc;
}

/**
 * @purpose Execute gennady sdd-migrate — `anchors` mode injects canonical section anchors into v1 tickets.
 * @invariant Dry-run by default (reports what it would change); only `--write` mutates files.
 * @param rawArgs Raw command-line arguments (process.argv).
 * @returns MigrateOutcome — a per-file report on success, else an actionable failure.
 */
export async function run(rawArgs: string[]): Promise<MigrateOutcome> {
  const args = parseArgs(rawArgs, { all: ['all'], write: ['write'] });
  const positional = (args._ as string[]).filter(
    (a: string) => typeof a === 'string' && a !== 'sdd-migrate'
  );
  const mode = positional[0];
  if (mode !== 'anchors')
    return badInvocation(`unknown mode "${mode ?? ''}" — only "anchors" is supported`);

  const write = args.write === true || args.write === 'true';
  const all = args.all === true || args.all === 'true';

  let targets: string[];
  if (all) {
    targets = findV1Tickets(resolve(positional[1] ?? '.'));
  } else {
    const file = positional[1];
    if (!file) return badInvocation('need a <ticket> path or --all');
    targets = [resolve(file)];
  }

  // #region START_APPLY — dry-run reports; --write mutates; injection is idempotent
  const report: string[] = [];
  let changed = 0;
  for (const t of targets) {
    const rel = relative(process.cwd(), t);
    let content: string;
    try {
      content = readFileSync(t, 'utf-8');
    } catch {
      report.push(`  ERR   ${rel} — cannot read`);
      continue;
    }
    const { text, injected } = injectAnchors(content);
    if (injected.length === 0) {
      report.push(`  skip  ${rel} — already anchored / no canonical sections`);
      continue;
    }
    if (write) {
      writeFileSync(t, text, 'utf-8');
      changed++;
      report.push(`  +     ${rel} — ${injected.join(', ')}`);
    } else {
      report.push(`  would ${rel} — ${injected.join(', ')}`);
    }
  }
  // #endregion END_APPLY

  logger.debug(
    `[SddMigrateCommand#run] anchors ${write ? 'write' : 'dry-run'} over ${targets.length} ticket(s)`
  );
  const header = `[sdd-migrate anchors] ${write ? 'WRITE' : 'DRY-RUN'} · ${targets.length} ticket(s)`;
  const footer = write
    ? `\n${changed} written. Verify: gennady sdd-check --all`
    : '\n(dry-run — re-run with --write to apply)';
  return { ok: true, text: [header, ...report, footer].join('\n') };
}

// Self-executing for CLI: gennady sdd-migrate anchors (<ticket> | --all) [--write]
const outcome = await run(process.argv);
console.log(outcome.ok ? outcome.text : outcome.message);
process.exit(outcome.ok ? 0 : outcome.exitCode);
