#!/usr/bin/env node
// @file: CLI command: inbox — list merge requests awaiting your reaction.
// @consumers: N/A
// @tasks: TSK-93, TSK-91, TSK-103

import { existsSync, rmSync } from 'node:fs';
import { style } from '../../../shared/common/style.ts';
import { buildInboxClient } from './_core/logic/build-inbox-context.logic.ts';
import { buildInboxView, type InboxOptions } from './_core/logic/build-inbox-view.logic.ts';
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
  worktreesRoot,
  reportsRoot,
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

async function run(): Promise<number> {
  try {
    const argv = process.argv.slice(2);
    const stateDir = resolveStateDir(argv);

    // #region START_GC_STALE_WORKTREES — best-effort: remove worktrees older than TTL;
    // failure mode: GC errors do not block inbox — stale worktrees accumulate harmlessly until next run
    try {
      gcStaleWorktrees(worktreesRoot(stateDir), WORKTREE_TTL_MS, Date.now());
      gcStaleReports(reportsRoot(stateDir), REPORTS_TTL_MS, Date.now());
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
      const worktrees = removeAllWorktrees(worktreesRoot(stateDir));

      // #region START_RESET_REVIEW_REPORTS — clears the document-pipeline tree (PLAN.md/tasks/
      // README/HISTORY under every MR); no promotion logic needed, plain recursive delete
      const reports = reportsRoot(stateDir);
      const reportsRemoved = existsSync(reports);
      if (reportsRemoved) rmSync(reports, { recursive: true, force: true });
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

    const options = parseOptions(argv);
    const persist = !argv.includes('--no-save');

    const client = buildInboxClient(vcsSource, cfg.vcsHost);
    const items = await client.Inbox.getActionable();

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
