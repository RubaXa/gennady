// @file: SddMigrateCommand — v1→v2 migration tool-modes: `anchors` injects <!--SECTION:--> markers
//   into v1 tickets; `plan` generates/verifies the on-disk migration layer (one plan file per spec).
// @consumers: gennady.ts
// @tasks: N/A

import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, relative, dirname } from 'node:path';
import { logger } from '#logger';
import { parseArgs } from '../../../shared/common/parse-args.ts';
import { injectAnchors } from '../../../shared/sdd/anchor-inject.ts';
import {
  scanMigrationUnits,
  scaffoldUnitFile,
  scaffoldPlanReadme,
  unitFilePath,
  verifyMigrationPlan,
} from '../../../shared/sdd/migration-plan.ts';
import {
  parseIdMap,
  idMapFromPlan,
  replaceIds,
  findRemainingOldIds,
} from '../../../shared/sdd/id-replace.ts';
import { executeScopeMove } from '../../../shared/sdd/migration-move.ts';
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
 * @purpose Execute `plan` mode — generate the migration layer (one plan file per spec + README
 * tracker) or verify it (drift, coverage, slug collisions).
 * @invariant Generation is a dry-run by default; only `--write` creates/overwrites plan files.
 * @invariant `--verify` never writes; findings → exit 1.
 * @param root Absolute repo root.
 * @param opts verify / write flags.
 * @returns MigrateOutcome — report text, exit 1 when --verify found problems.
 */
function runPlan(root: string, opts: { verify: boolean; write: boolean }): MigrateOutcome {
  if (opts.verify) {
    const findings = verifyMigrationPlan(root);
    const lines = findings.map((f) => `  ERROR ${f.code} ${f.file} — ${f.message}`);
    const header = `[sdd-migrate plan] VERIFY · ${findings.length} finding(s)`;
    if (findings.length === 0)
      return { ok: true, text: `${header}\n  план полон и не разошёлся с реальностью` };
    return {
      ok: false,
      code: 'ERR_CLI_SDD_MIGRATE_PLAN_VERIFY',
      exitCode: 1,
      message: [header, ...lines].join('\n'),
    };
  }

  const scan = scanMigrationUnits(root);
  const report: string[] = [];
  let written = 0;
  for (const unit of scan.units) {
    const rel = unitFilePath(unit);
    const abs = join(root, rel);
    const text = scaffoldUnitFile(unit);
    const exists = existsSync(abs);
    if (opts.write) {
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, text, 'utf-8');
      written++;
      report.push(`  ${exists ? '~' : '+'}     ${rel} — ${unit.tickets.length} тикет(ов)`);
    } else {
      report.push(
        `  would ${rel} — ${unit.tickets.length} тикет(ов)${exists ? ' (перезапишет)' : ''}`
      );
    }
  }
  if (opts.write)
    writeFileSync(join(root, 'migration', 'README.md'), scaffoldPlanReadme(scan), 'utf-8');
  for (const t of scan.orphanTickets) report.push(`  ⚠ orphan ${t.file} — scope без спеки`);
  const header = `[sdd-migrate plan] ${opts.write ? 'WRITE' : 'DRY-RUN'} · ${scan.units.length} юнит(ов), ${scan.orphanTickets.length} orphan`;
  const footer = opts.write
    ? `\n${written} + README записаны. Дальше: заполнить карты юнитов, затем sdd-migrate plan --verify`
    : '\n(dry-run — повторить с --write, чтобы записать слой migration/)';
  return { ok: true, text: [header, ...report, footer].join('\n') };
}

/**
 * @purpose Execute `ids` mode — apply the approved Task-ID map (TSV or derived from the migration
 * layer) across zones, exact IDs on word boundaries only.
 * @invariant Dry-run by default; `--write` mutates and then gates on zero remaining old IDs.
 * @param root Absolute repo root.
 * @param opts map file path (or fromPlan) + write flag.
 * @returns MigrateOutcome — per-file counts; exit 1 when the map is invalid or old IDs survive a write.
 */
function runIds(
  root: string,
  opts: { mapFile: string | null; fromPlan: boolean; write: boolean }
): MigrateOutcome {
  const tsv = opts.fromPlan
    ? idMapFromPlan(root)
    : opts.mapFile
      ? readFileSync(resolve(opts.mapFile), 'utf-8')
      : null;
  if (tsv === null) return badInvocation('ids needs --map <tsv> or --from-plan');

  const parsed = parseIdMap(tsv);
  if (!parsed.ok) {
    return {
      ok: false,
      code: 'ERR_CLI_SDD_MIGRATE_IDS_MAP',
      exitCode: 1,
      message: [
        `[sdd-migrate ids] карта невалидна — ${parsed.errors.length} проблем(ы):`,
        ...parsed.errors.map((e) => `  ${e}`),
      ].join('\n'),
    };
  }
  if (parsed.map.length === 0)
    return {
      ok: true,
      text: '[sdd-migrate ids] карта пуста — заменять нечего (заполни Ticket Map юнитов)',
    };

  const report = replaceIds(root, parsed.map, opts.write);
  const lines = report.map(
    (r) => `  ${opts.write ? '~' : 'would'} ${r.file} — ${r.count} замен(ы)`
  );
  const total = report.reduce((n, r) => n + r.count, 0);
  const header = `[sdd-migrate ids] ${opts.write ? 'WRITE' : 'DRY-RUN'} · ${parsed.map.length} ID · ${total} вхождений в ${report.length} файл(ах)`;

  if (opts.write) {
    const leftovers = findRemainingOldIds(root, parsed.map);
    if (leftovers.length > 0) {
      return {
        ok: false,
        code: 'ERR_CLI_SDD_MIGRATE_IDS_LEFTOVER',
        exitCode: 1,
        message: [
          header,
          ...lines,
          '  ГЕЙТ ПРОВАЛЕН — старые ID остались:',
          ...leftovers.map((l) => `    ${l.id} в ${l.file}`),
        ].join('\n'),
      };
    }
    return {
      ok: true,
      text: [header, ...lines, '\n  Гейт: ноль старых ID в зонах ✅. Дальше: sdd-check --all'].join(
        '\n'
      ),
    };
  }
  return {
    ok: true,
    text: [header, ...lines, '\n(dry-run — повторить с --write, чтобы применить)'].join('\n'),
  };
}

/**
 * @purpose Execute gennady sdd-migrate — `anchors` injects section anchors into v1 tickets; `plan`
 * generates/verifies the migration layer; `ids` applies the approved Task-ID map.
 * @invariant Dry-run by default (reports what it would change); only `--write` mutates files.
 * @param rawArgs Raw command-line arguments (process.argv).
 * @returns MigrateOutcome — a per-file report on success, else an actionable failure.
 */
export async function run(rawArgs: string[]): Promise<MigrateOutcome> {
  const args = parseArgs(rawArgs, {
    all: ['all'],
    write: ['write'],
    verify: ['verify'],
    map: { aliases: ['map'], takesValue: true },
    scope: { aliases: ['scope'], takesValue: true },
    'from-plan': ['from-plan'],
  });
  const positional = (args._ as string[]).filter(
    (a: string) => typeof a === 'string' && a !== 'sdd-migrate'
  );
  const mode = positional[0];

  if (mode === 'plan') {
    const root = resolve(positional[1] ?? '.');
    return runPlan(root, {
      verify: args.verify === true || args.verify === 'true',
      write: args.write === true || args.write === 'true',
    });
  }

  if (mode === 'ids') {
    const root = resolve(positional[1] ?? '.');
    return runIds(root, {
      mapFile: typeof args.map === 'string' ? args.map : null,
      fromPlan: args['from-plan'] === true || args['from-plan'] === 'true',
      write: args.write === true || args.write === 'true',
    });
  }

  if (mode === 'move') {
    const scope = typeof args.scope === 'string' ? args.scope : null;
    if (!scope) return badInvocation('move needs --scope <scope>');
    const root = resolve(positional[1] ?? '.');
    const write = args.write === true || args.write === 'true';
    const r = executeScopeMove(root, scope, write);
    if (!r.ok) {
      return {
        ok: false,
        code: 'ERR_CLI_SDD_MIGRATE_MOVE_BLOCKED',
        exitCode: 1,
        message: [
          `[sdd-migrate move] scope «${scope}» заблокирован — ${r.errors.length} проблем(ы):`,
          ...r.errors.map((e) => `  ${e}`),
        ].join('\n'),
      };
    }
    const header = `[sdd-migrate move] ${write ? 'WRITE' : 'DRY-RUN'} · scope ${scope}`;
    const footer = write
      ? '\nДальше: sdd-check --all specs/' + scope + ' (строгий v2-гейт scope)'
      : '\n(dry-run — повторить с --write, чтобы применить)';
    return { ok: true, text: [header, ...r.report, footer].join('\n') };
  }

  if (mode !== 'anchors')
    return badInvocation(`unknown mode "${mode ?? ''}" — supported: anchors, plan, ids, move`);

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

// Self-executing for CLI: gennady sdd-migrate (anchors (<ticket> | --all) [--write] | plan [root] [--write | --verify])
const outcome = await run(process.argv);
console.log(outcome.ok ? outcome.text : outcome.message);
process.exit(outcome.ok ? 0 : outcome.exitCode);
