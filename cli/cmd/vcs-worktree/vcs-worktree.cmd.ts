#!/usr/bin/env node
// @file: CLI command: vcs-worktree — prepare/cleanup a read-only worktree for MR review.
// @consumers: N/A
// @tasks: N/A, TSK-70, TSK-168, TSK-169

import { mkdirSync, existsSync, readdirSync, readFileSync, symlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { style } from '../../../shared/common/style.ts';
import {
  resolveStateDir,
  mrsRoot,
  mrWorktreeDir,
  clonesRoot,
  reposMapPath,
} from '../inbox/_core/logic/state-paths.logic.ts';
import {
  prepareMrWorktree,
  resolveBaseSha,
  removeWorktreeAt,
  gcStaleWorktrees,
  removeAllWorktrees,
  WORKTREE_TTL_MS,
} from './_core/logic/worktree-ops.logic.ts';
import type { WorktreeLinkFsDeps } from './_core/logic/worktree-links.logic.ts';
import { ensureClone } from './_core/logic/locate-clone.logic.ts';
import { resolveVcsContext } from '../_shared/vcs-context-resolver.ts';
import type { VcsCliArgs } from '../_shared/vcs-context-resolver.ts';
import { createVcsClient } from '../_shared/create-vcs-client.ts';

function parseValue(argv: string[], flag: string): string | undefined {
  const inline = argv.find((a) => a.startsWith(`${flag}=`));
  if (inline) return inline.slice(flag.length + 1);
  const idx = argv.indexOf(flag);
  return idx !== -1 ? argv[idx + 1] : undefined;
}

async function run(): Promise<number> {
  try {
    const argv = process.argv.slice(2);
    const stateDir = resolveStateDir(argv);

    if (argv.includes('--cleanup-all')) {
      const removed = await removeAllWorktrees(mrsRoot(stateDir));
      console.info(style.gray(`worktrees removed: ${removed.length}`));
      return 0;
    }

    const cleanup = parseValue(argv, '--cleanup');
    if (cleanup) {
      await removeWorktreeAt(cleanup);
      console.info(style.gray(`worktree removed: ${cleanup}`));
      return 0;
    }

    const ref = parseValue(argv, '--ref');
    const url = parseValue(argv, '--url');
    // --url is the preferred form (host inferred). --ref is an override; require one of them.
    if (!url && (!ref || !ref.includes('!'))) {
      console.error(
        style.redBright.bold('✖ Ошибка:'),
        'Укажите --url <mr-url> (предпочтительно) или --ref group/project!iid'
      );
      return 1;
    }

    const vcsSource = parseValue(argv, '--vcs-host') ?? parseValue(argv, '--vcs-source');
    const reposBase = parseValue(argv, '--repos-base') ?? join(homedir(), 'Developer');

    // #region START_RESOLVE_VCS_CONTEXT
    const vcsCliArgs: VcsCliArgs = {
      ref,
      host: vcsSource,
      url,
    };

    const context = await resolveVcsContext(vcsCliArgs);
    const project = context.project;
    const iid = String(context.iid);
    const host = context.host;
    const token = context.token;

    const client = createVcsClient(context);
    // #endregion END_RESOLVE_VCS_CONTEXT

    const mr = (await client.MergeRequests.getByIid({ project, iid })) as {
      target_branch?: string;
      diff_refs?: { base_sha?: string; start_sha?: string; head_sha?: string };
    } | null;
    const targetBranch = mr?.target_branch ?? '';
    const diffRefs = mr?.diff_refs;

    const clonePath = await ensureClone(project, host, token, {
      reposBase,
      reposMapPath: reposMapPath(stateDir),
      clonesRoot: clonesRoot(stateDir),
    });

    // --worktree-dir: explicit override for where the worktree is created/reused (e.g. an existing
    // worktree from before the mrs/<key>/worktree layout, TSK-131) — bypasses the default root's GC
    // entirely, since a caller-managed path has its own lifecycle, not this command's.
    const worktreeDirFlag = parseValue(argv, '--worktree-dir');
    let worktreePath: string;
    if (worktreeDirFlag) {
      worktreePath = worktreeDirFlag;
    } else {
      const root = mrsRoot(stateDir);
      mkdirSync(root, { recursive: true });
      // GC safety net: prune leaked worktrees older than TTL on every prepare,
      // so they cannot grow unbounded even if --cleanup is never called.
      const gced = await gcStaleWorktrees(root, WORKTREE_TTL_MS, Date.now());
      if (gced.length > 0) console.info(style.gray(`gc: removed ${gced.length} stale worktree(s)`));
      worktreePath = mrWorktreeDir(stateDir, `${project}!${iid}`);
    }

    // FR-WT-07: composition root for real fs deps — the only call site that links
    // dependency directories into the prepared worktree (best-effort, secrets excluded).
    const linkFsDeps: WorktreeLinkFsDeps = { existsSync, readdirSync, readFileSync, symlinkSync };
    // FR-WT-08: this command reviews MR code directly in the worktree, so submodules must be
    // present too (best-effort) — unlike other prepareMrWorktree callers, which don't opt in.
    const prepared = await prepareMrWorktree(clonePath, iid, worktreePath, linkFsDeps, true);
    const baseSha = targetBranch
      ? await resolveBaseSha(clonePath, targetBranch, prepared.headSha, diffRefs?.base_sha)
      : '';

    console.info(style.bold(`worktree ready — ${ref}`));
    console.info(`path:   ${prepared.worktreePath}`);
    console.info(`head:   ${prepared.headSha}`);
    if (baseSha) {
      console.info(`base:   ${baseSha} (${targetBranch})`);
      console.info(style.gray(`review: git -C ${prepared.worktreePath} diff ${baseSha}..HEAD`));
    }
    // diff_refs из MR — нужны для line-комментов через vcs-reply (position[*_sha]).
    if (diffRefs?.base_sha && diffRefs.start_sha && diffRefs.head_sha) {
      console.info(
        `diff_refs: base=${diffRefs.base_sha} start=${diffRefs.start_sha} head=${diffRefs.head_sha}`
      );
      console.info(
        style.gray('   ↑ для line-комментов: position.{baseSha,startSha,headSha} = эти значения')
      );
    }
    console.info(style.gray(`cleanup: gennady vcs-worktree --cleanup ${prepared.worktreePath}`));
    return 0;
  } catch (error) {
    console.error(style.redBright.bold('✖ Ошибка:'), (error as Error).message ?? String(error));
    return 1;
  }
}

process.exit(await run());
