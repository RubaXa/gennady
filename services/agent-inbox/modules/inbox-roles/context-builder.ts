// @file: buildNodeContext — assembles a live NodeContext for one MR (worktree, changeset,
//   base, stage/headChanged) from real VCS + registry state, for RoleScheduler assignment.
// @consumers: RoleScheduler
// @tasks: TSK-121

import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { logger } from '#logger';
import type { NodeContext, RoleArtifacts, Changeset, ChangesetFile } from './role-node.ts';
import type { VcsInboxPort } from '../inbox-core/vcs-inbox.port.ts';
import type { StateStore } from '../inbox-core/state-store.ts';
import { resolveVcsContext } from '../../../../cli/cmd/_shared/vcs-context-resolver.ts';
import { createVcsClient } from '../../../../cli/cmd/_shared/create-vcs-client.ts';
import { ensureClone } from '../../../../cli/cmd/vcs-worktree/_core/logic/locate-clone.logic.ts';
import { prepareMrWorktree } from '../../../../cli/cmd/vcs-worktree/_core/logic/worktree-ops.logic.ts';
import {
  worktreesRoot,
  clonesRoot,
  reposMapPath,
  configPath,
} from '../../../../cli/cmd/inbox/_core/logic/state-paths.logic.ts';
import { loadConfig } from '../../../../cli/cmd/inbox/_core/logic/inbox-config.logic.ts';

/** @purpose GitLab diff_refs — base/start/head SHAs pinned at MR creation/last diff update. */
export type DiffRefs = {
  /** @purpose Merge-base at the time GitLab computed the diff | @invariant The ONLY valid source for `NodeContext.base` — never a locally recomputed merge-base */
  baseSha?: string;
  /** @purpose SHA the diff view starts from (may differ from baseSha after force-push) */
  startSha?: string;
  /** @purpose MR head SHA at diff_refs computation time */
  headSha?: string;
};

/**
 * @purpose Injected dependencies for `buildNodeContext`.
 * @invariant `fetchDiffRefs` is the ONLY source of `base` — callers inject a stub in tests;
 *   production wiring defaults to `fetchDiffRefsLive`.
 */
export type ContextBuilderDeps = {
  /** @purpose VCS port for MR metadata */
  vcs: VcsInboxPort;
  /** @purpose State store for registry (stage/lastReviewedHeadSha) and stateDir (NFC-05) */
  store: StateStore;
  /**
   * @purpose Resolve diff_refs for the MR; injectable, defaults to live GitLab lookup
   * @param mrUrl MR web URL
   * @returns diff_refs or undefined when unavailable
   */
  fetchDiffRefs: (mrUrl: string) => Promise<DiffRefs | undefined>;
};

/**
 * @purpose Run a git command and return trimmed stdout.
 * @param args Git subcommand and arguments.
 * @param cwd Working directory (repo or worktree).
 * @returns Trimmed stdout.
 * @throws When the git process exits non-zero.
 * @sideEffect Spawns a git subprocess.
 */
function git(args: string[], cwd: string): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

/**
 * @purpose Derive an FS-safe workspace slug from an MR web URL.
 * @param mrUrl MR web URL.
 * @returns Slug usable as a directory name segment.
 */
function _slugFromUrl(mrUrl: string): string {
  return mrUrl
    .replace(/^https?:\/\//, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * @purpose Live default for `fetchDiffRefs` — resolves the MR's diff_refs from the VCS API.
 * @invariant Never computes git merge-base; returns exactly the API-provided base_sha (SESSION-REFLECTION.md #1 failure mode avoided).
 * @param mrUrl MR web URL.
 * @returns diff_refs, or undefined when unavailable (non-GitLab host, missing token, network failure).
 * @sideEffect Network: resolves VCS context and fetches the MR by iid.
 */
export async function fetchDiffRefsLive(mrUrl: string): Promise<DiffRefs | undefined> {
  try {
    const context = await resolveVcsContext({ url: mrUrl });
    const client = createVcsClient(context);
    const mr = (await client.MergeRequests.getByIid({
      project: context.project,
      iid: String(context.iid),
    })) as {
      diff_refs?: { base_sha?: string; start_sha?: string; head_sha?: string };
    } | null;

    const refs = mr?.diff_refs;
    if (!refs) return undefined;
    return { baseSha: refs.base_sha, startSha: refs.start_sha, headSha: refs.head_sha };
  } catch (cause) {
    logger.warn('[fetchDiffRefsLive] [resolving → failed]', { mrUrl, error: String(cause) });
    return undefined;
  }
}

/**
 * @purpose Prepare the local worktree and compute the changeset diffed against `base`.
 * @invariant Best-effort: any failure (missing repos-base, offline, unclonable project) degrades
 *   to an absent worktree/changeset rather than blocking context construction (degrade-open,
 *   consistent with RoleScheduler#_filterActionable).
 * @param mrUrl MR web URL.
 * @param base Diff base SHA (diff_refs.base_sha) — diff is computed base..HEAD, never target-branch merge-base.
 * @param stateDir Root state directory (NFC-05) — clones/worktrees live under it.
 * @returns Worktree path, resolved head SHA, and changeset files when available.
 * @sideEffect Network: git fetch/clone. Filesystem: creates/reuses clone and worktree dirs.
 */
async function _prepareWorktreeAndChangeset(
  mrUrl: string,
  base: string | undefined,
  stateDir: string
): Promise<{ worktreePath?: string; headSha?: string; changesetFiles?: ChangesetFile[] }> {
  try {
    const context = await resolveVcsContext({ url: mrUrl });

    let config = null;
    try {
      config = await loadConfig(configPath(stateDir));
    } catch {
      /* corrupt/absent config — fall back to default reposBase */
    }
    const reposBase = config?.reposBase ?? join(homedir(), 'Developer');

    const clonePath = ensureClone(context.project, context.host, context.token, {
      reposBase,
      reposMapPath: reposMapPath(stateDir),
      clonesRoot: clonesRoot(stateDir),
    });

    const worktreePath = join(
      worktreesRoot(stateDir),
      `${context.project.replace(/\//g, '__')}-${context.iid}`
    );
    const prepared = prepareMrWorktree(clonePath, String(context.iid), worktreePath);

    if (!base) {
      return { worktreePath: prepared.worktreePath, headSha: prepared.headSha };
    }

    // #region START_COMPUTE_CHANGESET — invariant: diff is always base..HEAD where base is the
    // injected diff_refs.base_sha; this function never derives base itself (see AX in buildNodeContext)
    const nameStatus = git(['diff', '--name-status', base, 'HEAD'], prepared.worktreePath)
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [status, ...pathParts] = line.split('\t');
        return { status, path: pathParts.join('\t') };
      });
    const numstat = git(['diff', '--numstat', base, 'HEAD'], prepared.worktreePath)
      .split('\n')
      .filter(Boolean);

    const changesetFiles: ChangesetFile[] = nameStatus.map((entry, i) => {
      const [plusRaw, minusRaw] = (numstat[i] ?? '').split('\t');
      return {
        path: entry.path,
        status: entry.status,
        plus: plusRaw === '-' ? 0 : Number(plusRaw) || 0,
        minus: minusRaw === '-' ? 0 : Number(minusRaw) || 0,
      };
    });
    // #endregion END_COMPUTE_CHANGESET

    return { worktreePath: prepared.worktreePath, headSha: prepared.headSha, changesetFiles };
  } catch (cause) {
    logger.warn('[_prepareWorktreeAndChangeset] [preparing → degraded]', {
      mrUrl,
      error: String(cause),
    });
    return {};
  }
}

/**
 * @purpose Classify head movement since the last review: none / fast_forward / rewritten.
 * @invariant Uses `git merge-base --is-ancestor` on the live worktree — a legitimate ancestry
 *   check, distinct from the forbidden merge-base-as-diff-base recompute.
 * @param worktreePath Local worktree to check ancestry in.
 * @param lastReviewedHeadSha Head SHA at the time of the last completed review, if any.
 * @param currentHeadSha Current resolved head SHA.
 * @returns Head-change classification, or undefined when the current head is unknown.
 */
function _classifyHeadChanged(
  worktreePath: string,
  lastReviewedHeadSha: string | undefined,
  currentHeadSha: string | undefined
): string | undefined {
  if (!currentHeadSha) return undefined;
  if (!lastReviewedHeadSha || lastReviewedHeadSha === currentHeadSha) return 'none';

  try {
    git(['merge-base', '--is-ancestor', lastReviewedHeadSha, 'HEAD'], worktreePath);
    return 'fast_forward';
  } catch {
    return 'rewritten';
  }
}

/**
 * @purpose Build a live NodeContext for one MR: MR metadata, worktree, changeset, base
 *   (diff_refs.base_sha only), and stage/headChanged artifacts for the prep node to branch on.
 * @invariant `base` is ALWAYS `diff_refs.base_sha` verbatim — never a locally recomputed merge-base
 *   (the #1 failure mode per SESSION-REFLECTION.md step 3).
 * @invariant Degrades gracefully: worktree/changeset/base absence does not throw — the prep node
 *   falls back to its default branch (review_needed) when live signals are unavailable.
 * @param mrUrl MR web URL to build context for.
 * @param deps VCS port, state store, and diff_refs fetcher (injectable for tests).
 * @returns NodeContext ready to seed a RoleInstance's initial artifacts.
 * @sideEffect Network: MR metadata + diff_refs lookups. Filesystem: clone/worktree under `StateStore.getStateDir()` (NFC-05).
 */
export async function buildNodeContext(
  mrUrl: string,
  deps: ContextBuilderDeps
): Promise<NodeContext> {
  const mrContext = await deps.vcs.getMrContext(mrUrl);
  const diffRefs = await deps.fetchDiffRefs(mrUrl);
  const base = diffRefs?.baseSha;

  const registry = deps.store.loadRegistry();
  const entry = registry.entries[mrUrl];
  const stage = entry?.stage;
  const lastReviewedHeadSha = entry?.lastReviewedHeadSha;

  const stateDir = deps.store.getStateDir();
  const workspace = join(stateDir, 'agent-inbox', 'workspaces', _slugFromUrl(mrUrl));

  const { worktreePath, headSha, changesetFiles } = await _prepareWorktreeAndChangeset(
    mrUrl,
    base,
    stateDir
  );
  const headChanged = worktreePath
    ? _classifyHeadChanged(worktreePath, lastReviewedHeadSha, headSha)
    : undefined;

  const changeset: Changeset | undefined = changesetFiles ? { files: changesetFiles } : undefined;

  const artifacts: RoleArtifacts = {
    stage,
    headChanged,
    lastReviewedHeadSha,
    baseSha: base,
  };

  return {
    mr: mrContext,
    workspace,
    base,
    changeset,
    artifacts,
    vcs: deps.vcs,
    store: deps.store,
  };
}
