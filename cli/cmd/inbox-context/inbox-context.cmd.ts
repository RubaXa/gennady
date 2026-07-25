#!/usr/bin/env node
// @file: CLI command: inbox-context — atomic context gathering for one MR.
// @consumers: agent-inbox skill
// @tasks: TSK-AI-16, TSK-93, TSK-95, TSK-91, TSK-94

import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { style } from '../../../shared/common/style.ts';
import {
  resolveStateDir,
  registryPath,
  mrsRoot,
  mrWorktreeDir,
  clonesRoot,
  reposMapPath,
  configPath,
  gcStaleReports,
  REPORTS_TTL_MS,
} from '../inbox/_core/logic/state-paths.logic.ts';
import {
  gcStalePhaseTimings,
  PHASE_TIMINGS_TTL_MS,
} from '../../../services/agent-inbox/modules/inbox-roles/phase-telemetry.ts';
import { loadConfig, validateConfig } from '../inbox/_core/logic/inbox-config.logic.ts';
import { buildInboxClient } from '../inbox/_core/logic/build-inbox-context.logic.ts';
import { loadRegistry, saveRegistry } from '../inbox/_core/logic/inbox-registry.logic.ts';
import {
  classifyMrStage,
  buildWorkPacket,
  flattenNotes,
  lastNoteAuthor,
} from '../inbox/_core/logic/classify-mr-stage.logic.ts';
import { resolveVcsContext, type VcsCliArgs } from '../_shared/vcs-context-resolver.ts';
import { createVcsClient } from '../_shared/create-vcs-client.ts';
import {
  prepareMrWorktree,
  resolveBaseSha,
  gcStaleWorktrees,
  WORKTREE_TTL_MS,
} from '../vcs-worktree/_core/logic/worktree-ops.logic.ts';
import { ensureClone } from '../vcs-worktree/_core/logic/locate-clone.logic.ts';

function parseValue(argv: string[], flag: string): string | undefined {
  const inline = argv.find((a) => a.startsWith(`${flag}=`));
  if (inline) return inline.slice(flag.length + 1);
  const idx = argv.indexOf(flag);
  return idx !== -1 ? argv[idx + 1] : undefined;
}

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

type FileChange = {
  path: string;
  status: string;
  plus: number;
  minus: number;
};

type CategoryStats = {
  files: number;
  plus: number;
  minus: number;
  added: number;
};

type Changeset = {
  files: FileChange[];
  totals: { files: number; plus: number; minus: number };
  byCategory: Record<string, CategoryStats>;
};

const CATEGORY_RULES: Record<string, RegExp[]> = {
  deps: [
    /(^|\/)package\.json$/,
    /(^|\/)package-lock\.json$/,
    /(^|\/)yarn\.lock$/,
    /(^|\/)pnpm-lock\.yaml$/,
    /(^|\/)\.npmrc$/,
    /(^|\/)npm-shrinkwrap\.json$/,
    /(^|\/)go\.mod$/,
    /(^|\/)go\.sum$/,
    /(^|\/)requirements\.txt$/,
    /(^|\/)pyproject\.toml$/,
    /(^|\/)Pipfile$/,
    /(^|\/)Pipfile\.lock$/,
    /(^|\/)setup\.py$/,
    /(^|\/)setup\.cfg$/,
    /(^|\/)poetry\.lock$/,
    /(^|\/)Cargo\.toml$/,
    /(^|\/)Cargo\.lock$/,
    /(^|\/)Gemfile$/,
    /(^|\/)Gemfile\.lock$/,
    /(^|\/)composer\.json$/,
    /(^|\/)composer\.lock$/,
    /(^|\/)pom\.xml$/,
    /(^|\/)build\.gradle(\.kts)?$/,
    /(^|\/)gradle\.lockfile$/,
    /(^|\/)settings\.gradle(\.kts)?$/,
    /(^|\/)mix\.exs$/,
    /(^|\/)mix\.lock$/,
    /(^|\/)stack\.yaml$/,
    /(^|\/)cabal\.project$/,
    /(^|\/)Package\.swift$/,
    /(^|\/)Package\.resolved$/,
    /(^|\/)pubspec\.yaml$/,
    /(^|\/)pubspec\.lock$/,
    /(^|\/)build\.zig\.zon$/,
    /(^|\/)deno\.jsonc?$/,
    /(^|\/)deno\.lock$/,
    /(^|\/)Dockerfile$/,
    /(^|\/)docker-compose\.ya?ml$/,
    /\.cabal$/,
    /\.csproj$/,
    /\.fsproj$/,
    /\.vbproj$/,
    /\.nimble$/,
    /\.gemspec$/,
    /(^|\/)packages\.config$/,
    /(^|\/)paket\.(dependencies|lock)$/,
    /(^|\/)Directory\.Packages\.props$/,
    /(^|\/)conanfile\.(txt|py)$/,
    /(^|\/)vcpkg\.json$/,
    /(^|\/)bun\.lockb?$/,
    /\.nuspec$/,
    /(^|\/)Podfile$/,
    /(^|\/)Cartfile$/,
    /\.podspec$/,
    /(^|\/)\.tool-versions$/,
    /(^|\/)\.python-version$/,
  ],
  tests: [/\.(test|spec)\.(ts|tsx|js|jsx)$/, /__tests__\//],
  docs: [/\.(md|mdx)$/, /^docs\//, /^specs\//],
  config: [/\.(json|yaml|yml|toml)$/, /^\./, /Dockerfile/, /Makefile/],
  assets: [
    /\.(png|jpg|jpeg|gif|svg|ico|webp|avif)$/,
    /\.(woff2?|ttf|eot|otf)$/,
    /\.(pdf|xlsx?|docx?)$/,
  ],
};

function classifyFile(path: string): string {
  for (const [cat, rules] of Object.entries(CATEGORY_RULES)) {
    if (rules.some((r) => r.test(path))) return cat;
  }
  return 'code';
}

function parseNumstatLine(line: string): { plus: number; minus: number } | null {
  const parts = line.split('\t');
  if (parts.length < 3) return null;
  const plus = parts[0] === '-' ? 0 : Number(parts[0]) || 0;
  const minus = parts[1] === '-' ? 0 : Number(parts[1]) || 0;
  return { plus, minus };
}

function emptyCategoryStats(): CategoryStats {
  return { files: 0, plus: 0, minus: 0, added: 0 };
}

function computeChangeset(worktreePath: string, baseSha: string): Changeset {
  const nameStatus = git(['diff', '--name-status', baseSha, 'HEAD'], worktreePath)
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [status, ...pathParts] = line.split('\t');
      return { status, path: pathParts.join('\t') };
    });

  const numstat = git(['diff', '--numstat', baseSha, 'HEAD'], worktreePath)
    .split('\n')
    .filter(Boolean);

  const files: FileChange[] = [];
  const cats: Record<string, CategoryStats> = {};

  const addedPaths = new Set(nameStatus.filter((e) => e.status === 'A').map((e) => e.path));

  for (let i = 0; i < Math.min(numstat.length, nameStatus.length); i++) {
    const parsed = parseNumstatLine(numstat[i]);
    if (!parsed) continue;
    const entry = nameStatus[i];
    const path = entry.path;
    const cat = classifyFile(path);
    files.push({ path, status: entry.status, plus: parsed.plus, minus: parsed.minus });

    cats[cat] ??= emptyCategoryStats();
    cats[cat].files++;
    cats[cat].plus += parsed.plus;
    cats[cat].minus += parsed.minus;
    if (addedPaths.has(path)) cats[cat].added++;
  }

  for (const cat of Object.keys(CATEGORY_RULES)) {
    cats[cat] ??= emptyCategoryStats();
  }

  const totals = {
    files: files.length,
    plus: files.reduce((s, f) => s + f.plus, 0),
    minus: files.reduce((s, f) => s + f.minus, 0),
  };
  return { files, totals, byCategory: cats };
}

function getRepoLayout(worktreePath: string): { dirs: string[]; rootFiles: string[] } {
  const entries = readdirSync(worktreePath, { withFileTypes: true });
  const dirs: string[] = [];
  const rootFiles: string[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.git')) continue;
    if (entry.isDirectory()) {
      dirs.push(entry.name + '/');
    } else if (entry.isFile()) {
      rootFiles.push(entry.name);
    }
  }

  dirs.sort();
  rootFiles.sort();
  return { dirs, rootFiles };
}

async function run(): Promise<number> {
  try {
    const argv = process.argv.slice(2);
    const stateDir = resolveStateDir(argv);
    const skipWorktree = argv.includes('--skip-worktree');
    const skipThreads = argv.includes('--skip-threads');

    const url = parseValue(argv, '--url');
    const ref = parseValue(argv, '--ref');

    if (!url && !ref) {
      console.error(
        style.redBright.bold('✖ Ошибка:'),
        'Укажите --url <webUrl> или --ref group/project!iid'
      );
      return 1;
    }

    const vcsSource = parseValue(argv, '--vcs-host') ?? parseValue(argv, '--vcs-source');
    const reposBaseFlag = parseValue(argv, '--repos-base');

    // #region START_CONFIG_SIGNAL — check inbox config before any network I/O;
    // flag overrides cover the corresponding config keys; corrupt config → absent
    let config: import('../inbox/_core/logic/inbox-config.logic.ts').InboxConfig | null = null;
    try {
      config = await loadConfig(configPath(stateDir));
    } catch {
      /* corrupt config treated as absent */
    }
    const cfg = config ?? { version: 1 as const, reposBase: undefined, vcsHost: undefined };
    const checkResult = validateConfig(cfg);

    const covered = new Set<string>();
    if (vcsSource || url) covered.add('vcsHost');
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

    const vcsCliArgs: VcsCliArgs = { url, ref, host: vcsSource };
    const context = await resolveVcsContext(vcsCliArgs);
    const project = context.project;
    const iid = String(context.iid);
    const host = context.host;
    const token = context.token;

    const client = createVcsClient(context);

    const mr = (await client.MergeRequests.getByIid({ project, iid })) as {
      title?: string;
      web_url?: string;
      source_branch?: string;
      target_branch?: string;
      created_at?: string;
      updated_at?: string;
      diff_refs?: { base_sha?: string; start_sha?: string; head_sha?: string };
    } | null;

    const title = mr?.title ?? '';
    const webUrl = mr?.web_url ?? '';
    const sourceBranch = mr?.source_branch ?? '';
    const targetBranch = mr?.target_branch ?? '';
    const createdAt = mr?.created_at ?? '';
    const updatedAt = mr?.updated_at ?? '';
    const diffRefs = mr?.diff_refs;

    // #region START_WORKTREE
    let worktree: {
      path: string;
      base: string;
      diffRefs: typeof diffRefs;
      repoLayout: { dirs: string[]; rootFiles: string[] } | null;
    } | null = null;
    let changeset: Changeset | null = null;
    let currentHeadSha: string | null = null;

    if (!skipWorktree) {
      const reposBase = reposBaseFlag ?? cfg.reposBase ?? join(homedir(), 'Developer');
      const clonePath = await ensureClone(project, host, token, {
        reposBase,
        reposMapPath: reposMapPath(stateDir),
        clonesRoot: clonesRoot(stateDir),
      });

      // --worktree-dir: explicit override (e.g. an existing worktree predating the
      // mrs/<key>/worktree layout, TSK-131) — skips this root's GC, caller owns that path's lifecycle.
      const worktreeDirFlag = parseValue(argv, '--worktree-dir');
      let worktreePath: string;
      if (worktreeDirFlag) {
        worktreePath = worktreeDirFlag;
      } else {
        const root = mrsRoot(stateDir);
        mkdirSync(root, { recursive: true });
        await gcStaleWorktrees(root, WORKTREE_TTL_MS, Date.now());
        gcStaleReports(root, REPORTS_TTL_MS, Date.now());
        gcStalePhaseTimings(stateDir, PHASE_TIMINGS_TTL_MS, Date.now());
        worktreePath = mrWorktreeDir(stateDir, `${project}!${iid}`);
      }

      const prepared = await prepareMrWorktree(clonePath, iid, worktreePath);
      currentHeadSha = prepared.headSha;
      let baseSha = '';
      if (targetBranch) {
        // #region START_ENSURE_FRESH_TARGET — force-refresh target branch so merge-base
        // is computed against the latest master state (avoids stale FETCH_HEAD in reused clones).
        try {
          execFileSync('git', ['-c', 'core.hooksPath=/dev/null', 'fetch', 'origin', targetBranch], {
            cwd: clonePath,
            stdio: 'ignore',
          });
        } catch {}
        // #endregion END_ENSURE_FRESH_TARGET
        try {
          baseSha = await resolveBaseSha(
            clonePath,
            targetBranch,
            prepared.headSha,
            diffRefs?.base_sha
          );
        } catch {
          baseSha = '';
        }
      }

      if (baseSha) {
        changeset = computeChangeset(prepared.worktreePath, baseSha);
      }

      worktree = {
        path: prepared.worktreePath,
        base: baseSha,
        diffRefs,
        repoLayout: getRepoLayout(prepared.worktreePath),
      };
    }
    // #endregion END_WORKTREE

    // #region START_PACKAGE
    const inboxClient = buildInboxClient(vcsSource, cfg.vcsHost);
    const [items, me] = await Promise.all([
      inboxClient.Inbox.getActionable(),
      inboxClient.getCurrentUser(),
    ]);
    const mrItem = items.find((m) => m.project === project && m.iid === iid);

    const myLogin: string = me.login;
    const myRole = mrItem?.role ?? null;
    const author = mrItem?.author ?? '';
    const reviewers = mrItem?.reviewers ?? [];
    const description = mrItem?.description ?? '';
    const approvedBy = mrItem?.approvedBy ?? [];
    let iEverApproved = false;
    // #endregion END_PACKAGE

    // #region START_THREADS
    let stage: string | null = null;
    let openQuestions: number | null = null;
    let lastAuthorStr: string | null = null;
    let threadStats: { total: number; drafts: number } | null = null;

    if (!skipThreads) {
      const [allDiscussions, draftNotes] = await Promise.all([
        client.MergeDiscussions!.getAll({ project, iid }),
        client.MergeDiscussions!.listDraftNotes({ project, iid }),
      ]);
      const notes = flattenNotes(allDiscussions);
      stage = classifyMrStage(notes, myLogin, myRole);
      const packet = buildWorkPacket(notes, myLogin, myRole);
      openQuestions = packet.openNotes.length;
      lastAuthorStr = lastNoteAuthor(notes);

      threadStats = { total: allDiscussions.length, drafts: draftNotes.length };

      iEverApproved = (allDiscussions as Array<Record<string, unknown>>).some((d) =>
        (d.notes as Array<Record<string, unknown>>)?.some(
          (n) =>
            n.system === true &&
            typeof n.body === 'string' &&
            n.body.includes('approved this merge request') &&
            (n.author as { username?: string })?.username === myLogin
        )
      );
    }
    // #endregion END_THREADS

    // #region START_HEAD_CHANGED
    let headChanged: { kind: string; newCommitCount: number } | null = null;
    let newCommits: { sha: string; subject: string; author: string; date: string }[] | null = null;
    let lastReviewedHeadSha: string | undefined;
    let lastApprovedHeadSha: string | undefined;
    let myApprovalReset = false;

    const iApprove = approvedBy.includes(myLogin);

    if (!skipWorktree && currentHeadSha) {
      const registry = loadRegistry(registryPath(stateDir));
      const entry = webUrl ? registry.entries[webUrl] : undefined;
      lastReviewedHeadSha = entry?.lastReviewedHeadSha;
      lastApprovedHeadSha = entry?.lastApprovedHeadSha;

      if (!lastApprovedHeadSha && iEverApproved) {
        lastApprovedHeadSha = entry?.lastReviewedHeadSha ?? currentHeadSha;
      }

      myApprovalReset =
        !!lastApprovedHeadSha && !iApprove && lastApprovedHeadSha !== currentHeadSha;

      // #region START_COMPUTE_HEAD_DELTA
      if (!lastReviewedHeadSha || lastReviewedHeadSha === currentHeadSha) {
        headChanged = { kind: 'none', newCommitCount: 0 };
        newCommits = [];
      } else {
        let isAncestor = false;
        try {
          execFileSync('git', ['merge-base', '--is-ancestor', lastReviewedHeadSha, 'HEAD'], {
            cwd: worktree!.path,
            stdio: 'ignore',
          });
          isAncestor = true;
        } catch {
          // exit non-zero or exec error → not ancestor; fallthrough to rewritten
        }

        if (isAncestor) {
          // #region START_FAST_FORWARD_COMMITS
          try {
            const log = git(
              ['log', `--format=%H%x09%s%x09%an%x09%aI`, `${lastReviewedHeadSha}..HEAD`],
              worktree!.path
            );
            newCommits = log
              .split('\n')
              .filter(Boolean)
              .map((line) => {
                const [sha, subject, author, date] = line.split('\t');
                return { sha, subject, author, date };
              });
          } catch {
            newCommits = [];
          }
          headChanged = { kind: 'fast_forward', newCommitCount: newCommits.length };
          // #endregion END_FAST_FORWARD_COMMITS
        } else {
          // #region START_REWRITTEN_COMMITS
          try {
            const log = git(
              ['log', '--format=%H%x09%s%x09%an%x09%aI', 'HEAD', '--max-count=50'],
              worktree!.path
            );
            newCommits = log
              .split('\n')
              .filter(Boolean)
              .map((line) => {
                const [sha, subject, author, date] = line.split('\t');
                return { sha, subject, author, date };
              });
          } catch {
            newCommits = [];
          }
          headChanged = { kind: 'rewritten', newCommitCount: newCommits.length };
          // #endregion END_REWRITTEN_COMMITS
        }
      }
      // #endregion END_COMPUTE_HEAD_DELTA

      // #region START_UPDATE_CANDIDATE
      if (webUrl) {
        const prevEntry = registry.entries[webUrl];
        registry.entries[webUrl] = {
          project,
          iid,
          role: prevEntry?.role ?? myRole,
          stage: prevEntry?.stage ?? 'idle',
          lastSeenUpdatedAt: prevEntry?.lastSeenUpdatedAt ?? '',
          firstSeenAt: prevEntry?.firstSeenAt ?? new Date().toISOString(),
          lastClassifiedAt: prevEntry?.lastClassifiedAt ?? new Date().toISOString(),
          lastReviewedHeadSha: currentHeadSha,
          lastApprovedHeadSha: iApprove
            ? currentHeadSha
            : (prevEntry?.lastApprovedHeadSha ?? (iEverApproved ? currentHeadSha : undefined)),
        };
        saveRegistry(registryPath(stateDir), registry);
      }
      // #endregion END_UPDATE_CANDIDATE
    }
    // #endregion END_HEAD_CHANGED

    const result: Record<string, unknown> = {
      ref: `${project}!${iid}`,
      title,
      webUrl,
      sourceBranch,
      targetBranch,
      createdAt,
      updatedAt,
      myLogin,
      myRole,
      author,
      reviewers,
      description,
      approvedBy,
      headChanged,
      newCommits,
      lastReviewedHeadSha: lastReviewedHeadSha ?? null,
      lastApprovedHeadSha: lastApprovedHeadSha ?? null,
      myApprovalReset,
      reviewPlanRequired:
        worktree !== null &&
        (stage === 'review_needed' ||
          (stage === null && myRole === 'reviewer') ||
          myRole === 'author' ||
          headChanged?.kind === 'fast_forward'),
      worktree,
      changeset,
      stage,
      openQuestions,
      lastAuthor: lastAuthorStr,
      threadStats,
    };

    console.info(JSON.stringify(result, null, 2));
    return 0;
  } catch (error) {
    console.error(style.redBright.bold('✖ Ошибка:'), (error as Error).message ?? String(error));
    return 1;
  }
}

process.exit(await run());
