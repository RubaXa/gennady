#!/usr/bin/env node
// @file: CLI command: inbox — list merge requests awaiting your reaction.
// @consumers: N/A
// @tasks: TSK-93, TSK-91, TSK-103

import { style } from '../../../shared/common/style.ts';
import { buildInboxClient } from './_core/logic/build-inbox-context.logic.ts';
import { buildInboxView, type InboxOptions } from './_core/logic/build-inbox-view.logic.ts';
import { planTodoCleanup, markTodosDone } from './_core/logic/cleanup-todos.logic.ts';
import { renderInboxView, renderWorkPacket } from './_core/logic/render-inbox-view.logic.ts';
import { classifyInbox } from './_core/logic/classify-inbox.logic.ts';
import {
  classifyMrStage,
  buildWorkPacket,
  flattenNotes,
  lastNoteAuthor,
  type MrStage,
} from './_core/logic/classify-mr-stage.logic.ts';
import { parseMrActivity, type MrActivityEvent } from './_core/logic/parse-mr-activity.logic.ts';
import { loadRegistry, saveRegistry, resetInboxState } from './_core/logic/inbox-registry.logic.ts';
import {
  resolveStateDir,
  registryPath,
  outDir,
  mrsRoot,
  gcStaleReports,
  REPORTS_TTL_MS,
  configPath,
} from './_core/logic/state-paths.logic.ts';
import { loadConfig, validateConfig } from './_core/logic/inbox-config.logic.ts';
import {
  removeAllWorktrees,
  gcStaleWorktrees,
  WORKTREE_TTL_MS,
} from '../vcs-worktree/_core/logic/worktree-ops.logic.ts';
import {
  gcStalePhaseTimings,
  PHASE_TIMINGS_TTL_MS,
} from '../../../services/agent-inbox/modules/inbox-roles/phase-telemetry.ts';
import {
  selectDirective,
  DirectiveSelectionError,
  type SessionType,
  type Track,
} from '../../../services/ai-kit/selector.ts';
import type { MrShape } from '../../../services/agent-inbox/modules/inbox-core/context-builder.ts';

function parseOptions(argv: string[]): InboxOptions {
  const has = (flag: string) => argv.includes(flag);
  const staleArg = argv.find((a) => a.startsWith('--stale-days='));
  const staleDays = staleArg ? Number(staleArg.slice('--stale-days='.length)) : 14;

  return {
    drafts: has('--drafts'),
    includeStale: has('--include-stale'),
    staleDays: Number.isFinite(staleDays) && staleDays > 0 ? staleDays : 14,
    ciAll: has('--ci-all'),
    all: has('--all'),
  };
}

function parseValue(argv: string[], flag: string): string | undefined {
  const inline = argv.find((a) => a.startsWith(`${flag}=`));
  if (inline) return inline.slice(flag.length + 1);
  const idx = argv.indexOf(flag);
  return idx !== -1 ? argv[idx + 1] : undefined;
}

/**
 * @purpose Parse `--mr-shape=<flag1,flag2,...>` into a fully-populated `MrShape` (D-124/AI-46
 *   debug dump) — an unlisted flag reads `false`, never `undefined`, matching `computeMrShape`'s
 *   own invariant.
 * @param argv Raw CLI arguments.
 * @returns MrShape with every listed flag name set `true`, the rest `false`.
 */
function parseMrShapeFlag(argv: string[]): MrShape {
  const raw = parseValue(argv, '--mr-shape') ?? '';
  const flags = new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
  return {
    newSymbols: flags.has('newSymbols'),
    nestedLoops: flags.has('nestedLoops'),
    filterMapChain: flags.has('filterMapChain'),
    isTiny: flags.has('isTiny'),
    securityHits: flags.has('securityHits'),
    depManifest: flags.has('depManifest'),
  };
}

/**
 * @purpose Debug-dump entry (D-124/AI-46): print the assembled `(sessionType, track, mrShape)`
 *   directive without running a review session — proof of correct composition, eyeball + snapshot.
 * @param argv Raw CLI arguments (`--session-type`, `--track`, `--mr-shape`).
 * @returns Process exit code.
 */
function runDumpDirective(argv: string[]): number {
  const sessionType = (parseValue(argv, '--session-type') ?? 'session') as SessionType;
  const track = parseValue(argv, '--track') as Track | undefined;
  const mrShape = parseMrShapeFlag(argv);

  try {
    console.info(selectDirective(sessionType, track, mrShape));
    return 0;
  } catch (error) {
    if (error instanceof DirectiveSelectionError) {
      console.error(style.redBright.bold('✖ Ошибка:'), error.message);
      return 1;
    }
    console.error(style.redBright.bold('✖ Ошибка:'), (error as Error).message ?? String(error));
    return 1;
  }
}

async function runPick(ref: string, vcsSource?: string, configVcsHost?: string): Promise<number> {
  const sep = ref.lastIndexOf('!');
  if (sep === -1) {
    console.error(style.redBright.bold('✖ Ошибка:'), 'Ожидался ref вида group/project!iid');
    return 1;
  }
  const project = ref.slice(0, sep);
  const iid = ref.slice(sep + 1);

  const client = buildInboxClient(vcsSource, configVcsHost);
  const [items, me] = await Promise.all([client.Inbox.getActionable(), client.getCurrentUser()]);
  const mr = items.find((m) => m.project === project && m.iid === iid);
  const discussions = await client.MergeDiscussions.getAll({ project, iid });
  const packet = buildWorkPacket(flattenNotes(discussions), me.login, mr?.role ?? null);

  console.info(
    renderWorkPacket(ref, mr?.title ?? '', packet, {
      author: mr?.author,
      reviewers: mr?.reviewers,
      description: mr?.description,
      approvedBy: mr?.approvedBy,
    })
  );
  return 0;
}

/**
 * @purpose Clear ghost todos — pending GitLab to-dos on already merged/closed MRs that
 *   GitLab never auto-clears. Dry-run by default; only `--apply` mutates.
 * @param vcsSource Explicit GitLab host override, if any.
 * @param configVcsHost Host from inbox config.
 * @param opts `apply` performs the mutation; `json` emits a machine-readable summary.
 * @returns Process exit code (1 only when an apply run had failed mutations).
 * @sideEffect Network reads (paginated todos); GitLab `todoMarkDone` mutations when `apply`.
 */
async function runCleanup(
  vcsSource: string | undefined,
  configVcsHost: string | undefined,
  opts: { apply: boolean; json: boolean }
): Promise<number> {
  const client = buildInboxClient(vcsSource, configVcsHost);
  const plan = planTodoCleanup(await client.Inbox.listPendingTodos());

  if (!opts.apply) {
    if (opts.json) {
      console.info(
        JSON.stringify({
          mode: 'dry-run',
          total: plan.total,
          ghosts: plan.ghosts.length,
          opened: plan.openedCount,
        })
      );
    } else {
      console.info(
        style.bold(
          `Pending MR todos: ${plan.total} — ${style.yellow(String(plan.ghosts.length))} ghost (merged/closed), ${plan.openedCount} on open MRs`
        )
      );
      console.info(
        style.gray(
          `Dry run — nothing changed. Re-run with --apply to mark the ${plan.ghosts.length} ghost todos done.`
        )
      );
    }
    return 0;
  }

  const { marked, failed } = await markTodosDone(
    (todoId) => client.Inbox.markTodoDone({ todoId }),
    plan.ghosts.map((g) => g.todoId)
  );
  // Reconcile: re-count the live pending list so the reported after-count is observed, not assumed.
  const afterTotal = marked > 0 ? (await client.Inbox.listPendingTodos()).length : plan.total;

  if (opts.json) {
    console.info(
      JSON.stringify({
        mode: 'apply',
        before: plan.total,
        ghosts: plan.ghosts.length,
        marked,
        failed,
        after: afterTotal,
      })
    );
  } else {
    console.info(
      style.bold(
        `Marked ${style.green(String(marked))} ghost todos done${failed ? style.red(` (${failed} failed)`) : ''}.`
      )
    );
    console.info(`  pending MR todos: ${plan.total} → ${afterTotal}`);
  }
  return failed > 0 ? 1 : 0;
}

async function run(): Promise<number> {
  try {
    const argv = process.argv.slice(2);

    // D-124/AI-46: debug directive dump — no VCS/state-dir I/O, no review session, pure assembly.
    if (argv.includes('--dump-directive')) return runDumpDirective(argv);

    const stateDir = resolveStateDir(argv);

    // #region START_GC_STALE_WORKTREES — best-effort: remove worktrees older than TTL;
    // failure mode: GC errors do not block inbox — stale worktrees accumulate harmlessly until next run
    try {
      await gcStaleWorktrees(mrsRoot(stateDir), WORKTREE_TTL_MS, Date.now());
      gcStaleReports(mrsRoot(stateDir), REPORTS_TTL_MS, Date.now());
      gcStalePhaseTimings(stateDir, PHASE_TIMINGS_TTL_MS, Date.now());
    } catch {
      /* gc failures are non-blocking */
    }
    // #endregion END_GC_STALE_WORKTREES

    if (argv.includes('--reset') || argv.includes('reset')) {
      const { registryRemoved, outRemoved } = resetInboxState(
        registryPath(stateDir),
        outDir(stateDir)
      );
      const worktrees = await removeAllWorktrees(mrsRoot(stateDir));

      // #region START_RESET_REVIEW_REPORTS — clears the document-pipeline tree (PLAN.md/tasks/
      // README/HISTORY under every MR); ttlMs=0 makes gcStaleReports remove every `report/`
      // subdir unconditionally, leaving sibling `worktree/` dirs untouched (TSK-131)
      const removedReports = gcStaleReports(mrsRoot(stateDir), 0, Date.now());
      const reportsRemoved = removedReports.length > 0;
      // #endregion END_RESET_REVIEW_REPORTS

      console.info(style.bold('Inbox reset — чистый лист.'));
      console.info(
        `  registry:  ${registryRemoved ? style.green('очищен') : style.gray('не было')}`
      );
      console.info(`  drafts:    ${outRemoved ? style.green('очищены') : style.gray('не было')}`);
      console.info(
        `  worktrees: ${worktrees.length > 0 ? style.green(`снесено ${worktrees.length}`) : style.gray('не было')}`
      );
      console.info(
        `  reports:   ${reportsRemoved ? style.green('очищены') : style.gray('не было')}`
      );
      return 0;
    }

    const vcsSource = parseValue(argv, '--vcs-host') ?? parseValue(argv, '--vcs-source');
    const reposBaseFlag = parseValue(argv, '--repos-base');

    // #region START_CONFIG_SIGNAL — check inbox config before any network I/O;
    // flag overrides cover the corresponding config keys; corrupt config → absent
    let config: import('./_core/logic/inbox-config.logic.ts').InboxConfig | null = null;
    try {
      config = await loadConfig(configPath(stateDir));
    } catch {
      /* corrupt config treated as absent */
    }
    const cfg = config ?? { version: 1 as const, reposBase: undefined, vcsHost: undefined };
    const checkResult = validateConfig(cfg);

    const covered = new Set<string>();
    if (vcsSource) covered.add('vcsHost');
    if (reposBaseFlag) covered.add('reposBase');

    const missing = checkResult.missing.filter((k) => !covered.has(k));
    if (missing.length > 0) {
      if (argv.includes('--json')) {
        console.info(JSON.stringify({ configured: false, missing }));
      } else {
        console.info(
          style.yellow('ℹ agent-inbox не настроен. Запустите gennady inbox config --init')
        );
      }
      return 0;
    }
    // #endregion END_CONFIG_SIGNAL

    const pick = parseValue(argv, '--pick');
    if (pick) return await runPick(pick, vcsSource, cfg.vcsHost);

    if (argv.includes('cleanup') || argv.includes('--cleanup')) {
      return await runCleanup(vcsSource, cfg.vcsHost, {
        apply: argv.includes('--apply'),
        json: argv.includes('--json'),
      });
    }

    const options = parseOptions(argv);
    const persist = !argv.includes('--no-save');

    const client = buildInboxClient(vcsSource, cfg.vcsHost);
    // Bound discovery by MR recency (like the staleness view): fetch only what could be
    // shown. Under --all/--include-stale the view keeps stale MRs, so fetch unbounded.
    // Floor the window at 90d so it always covers the (default 14d) staleness cutoff.
    const updatedAfter =
      options.all || options.includeStale
        ? undefined
        : new Date(Date.now() - Math.max(options.staleDays, 90) * 86_400_000).toISOString();
    const items = await client.Inbox.getActionable({ updatedAfter });

    const now = new Date().toISOString();
    const regPath = registryPath(stateDir);
    const registry = loadRegistry(regPath);
    const { deltas, next } = classifyInbox(items, registry, now);

    const me = await client.getCurrentUser();

    // Stage scan only for visible MRs; for unchanged ones reuse the cached stage.
    // Pre-scan pass: no stages yet, but drop approved-by-me so we never scan them.
    const visible = buildInboxView(items, options, now, deltas, new Map(), me.login);
    const visibleUrls = new Set(visible.groups.flatMap((g) => g.items.map((i) => i.webUrl)));
    const itemByUrl = new Map(items.map((m) => [m.webUrl, m]));

    const stages = new Map<string, MrStage>();
    const details = new Map<string, { openQuestions: number; lastAuthor: string }>();
    const changeReasons = new Map<string, MrActivityEvent[]>();
    await Promise.all(
      [...visibleUrls].map(async (url) => {
        const mr = itemByUrl.get(url);
        if (!mr) return;
        if (deltas.get(url) === 'idle') {
          stages.set(url, (registry.entries[url]?.stage as MrStage) ?? 'idle');
          return;
        }
        const rawDiscussions = await client.MergeDiscussions.getAll({
          project: mr.project,
          iid: mr.iid,
        });
        const notes = flattenNotes(rawDiscussions);
        stages.set(url, classifyMrStage(notes, me.login, mr.role));
        details.set(url, {
          openQuestions: buildWorkPacket(notes, me.login, mr.role).openNotes.length,
          lastAuthor: lastNoteAuthor(notes),
        });
        const entry = registry.entries[url];
        changeReasons.set(
          url,
          parseMrActivity(notes, entry?.lastClassifiedAt ?? '', {
            current:
              (rawDiscussions as Array<{ notes?: Array<{ commit_id?: string }> }>)[0]?.notes?.[0]
                ?.commit_id ?? '',
          })
        );
      })
    );
    for (const [url, stage] of stages) {
      if (next.entries[url]) next.entries[url].stage = stage;
    }

    const view = buildInboxView(items, options, now, deltas, stages, me.login, changeReasons);

    if (argv.includes('--json')) {
      const out = {
        configured: true,
        total: view.total,
        hidden: view.hidden,
        delta: view.delta,
        groups: view.groups.map((g) => ({
          role: g.role,
          items: g.items.map((i) => ({
            ref: i.project ? `${i.project}!${i.iid}` : `!${i.iid}`,
            project: i.project,
            iid: i.iid,
            webUrl: i.webUrl,
            title: i.title,
            description: i.description,
            author: i.author,
            reviewers: i.reviewers,
            role: i.role,
            stage: i.stage,
            delta: i.delta,
            age: i.ageLabel,
            draft: i.draft,
            events: i.shownEvents,
            openQuestions: details.get(i.webUrl)?.openQuestions ?? null,
            lastAuthor: details.get(i.webUrl)?.lastAuthor ?? null,
            reasons: (i.reasons ?? []).map((r) => r.summary),
          })),
        })),
      };
      console.info(JSON.stringify(out, null, 2));
    } else if (view.total === 0) {
      console.info(style.yellow('ℹ Входящих MR, требующих реакции, нет.'));
    } else {
      console.info(renderInboxView(view));
    }

    if (persist) saveRegistry(regPath, next);
    return 0;
  } catch (error) {
    console.error(style.redBright.bold('✖ Ошибка:'), (error as Error).message ?? String(error));
    return 1;
  }
}

process.exit(await run());
