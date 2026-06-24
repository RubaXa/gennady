#!/usr/bin/env node
// @file: CLI command: inbox — list merge requests awaiting your reaction.
// @consumers: N/A
// @tasks: N/A

import { style } from '../../../shared/common/style.ts';
import { buildInboxClient } from './_core/logic/build-inbox-context.logic.ts';
import { buildInboxView, type InboxOptions } from './_core/logic/build-inbox-view.logic.ts';
import { renderInboxView, renderWorkPacket } from './_core/logic/render-inbox-view.logic.ts';
import { classifyInbox } from './_core/logic/classify-inbox.logic.ts';
import {
  classifyMrStage,
  buildWorkPacket,
  flattenNotes,
  type MrStage,
} from './_core/logic/classify-mr-stage.logic.ts';
import {
  loadRegistry,
  saveRegistry,
  resolveRegistryPath,
} from './_core/logic/inbox-registry.logic.ts';

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

function parsePick(argv: string[]): string | undefined {
  const inline = argv.find((a) => a.startsWith('--pick='));
  if (inline) return inline.slice('--pick='.length);
  const idx = argv.indexOf('--pick');
  return idx !== -1 ? argv[idx + 1] : undefined;
}

async function runPick(ref: string): Promise<number> {
  const sep = ref.lastIndexOf('!');
  if (sep === -1) {
    console.error(style.redBright.bold('✖ Ошибка:'), 'Ожидался ref вида group/project!iid');
    return 1;
  }
  const project = ref.slice(0, sep);
  const iid = ref.slice(sep + 1);

  const client = buildInboxClient();
  const [items, me] = await Promise.all([client.Inbox.getActionable(), client.getCurrentUser()]);
  const mr = items.find((m) => m.project === project && m.iid === iid);
  const discussions = await client.MergeDiscussions.getAll({ project, iid });
  const packet = buildWorkPacket(flattenNotes(discussions), me.login, mr?.role ?? null);

  console.info(renderWorkPacket(ref, mr?.title ?? '', packet));
  return 0;
}

async function run(): Promise<number> {
  try {
    const argv = process.argv.slice(2);
    const pick = parsePick(argv);
    if (pick) return await runPick(pick);

    const options = parseOptions(argv);
    const persist = !argv.includes('--no-save');

    const client = buildInboxClient();
    const items = await client.Inbox.getActionable();

    const now = new Date().toISOString();
    const registryPath = resolveRegistryPath();
    const registry = loadRegistry(registryPath);
    const { deltas, next } = classifyInbox(items, registry, now);

    // Stage scan only for visible MRs; for unchanged ones reuse the cached stage.
    const visible = buildInboxView(items, options, now, deltas);
    const visibleUrls = new Set(visible.groups.flatMap((g) => g.items.map((i) => i.webUrl)));
    const itemByUrl = new Map(items.map((m) => [m.webUrl, m]));
    const me = await client.getCurrentUser();

    const stages = new Map<string, MrStage>();
    await Promise.all(
      [...visibleUrls].map(async (url) => {
        const mr = itemByUrl.get(url);
        if (!mr) return;
        if (deltas.get(url) === 'idle') {
          stages.set(url, (registry.entries[url]?.stage as MrStage) ?? 'idle');
          return;
        }
        const discussions = await client.MergeDiscussions.getAll({
          project: mr.project,
          iid: mr.iid,
        });
        stages.set(url, classifyMrStage(flattenNotes(discussions), me.login, mr.role));
      })
    );
    for (const [url, stage] of stages) {
      if (next.entries[url]) next.entries[url].stage = stage;
    }

    const view = buildInboxView(items, options, now, deltas, stages);

    if (view.total === 0) {
      console.info(style.yellow('ℹ Входящих MR, требующих реакции, нет.'));
    } else {
      console.info(renderInboxView(view));
    }

    if (persist) saveRegistry(registryPath, next);
    return 0;
  } catch (error) {
    console.error(style.redBright.bold('✖ Ошибка:'), (error as Error).message ?? String(error));
    return 1;
  }
}

process.exit(await run());
