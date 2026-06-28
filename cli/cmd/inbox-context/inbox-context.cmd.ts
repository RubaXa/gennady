#!/usr/bin/env node
// @file: CLI command: inbox-context — atomic context gathering for one MR.
// @consumers: agent-inbox skill
// @tasks: TSK-AI-16

import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { style } from '../../../shared/common/style.ts';
import { VcsGitlabClient } from '../../../services/vcs-client/gitlab/vcs-gitlab-client.ts';
import {
  resolveStateDir,
  worktreesRoot,
  clonesRoot,
  reposMapPath,
} from '../inbox/_core/logic/state-paths.logic.ts';
import { buildInboxClient } from '../inbox/_core/logic/build-inbox-context.logic.ts';
import {
  classifyMrStage,
  buildWorkPacket,
  flattenNotes,
  lastNoteAuthor,
} from '../inbox/_core/logic/classify-mr-stage.logic.ts';
import { resolveVcsContext, type VcsCliArgs } from '../_shared/vcs-context-resolver.ts';
import {
  prepareMrWorktree,
  resolveBaseSha,
  gcStaleWorktrees,
} from '../vcs-worktree/_core/logic/worktree-ops.logic.ts';
import { ensureClone } from '../vcs-worktree/_core/logic/locate-clone.logic.ts';

const WORKTREE_TTL_MS = 3 * 60 * 60 * 1000;

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

    const ref = parseValue(argv, '--ref');
    if (!ref || !ref.includes('!')) {
      console.error(style.redBright.bold('✖ Ошибка:'), 'Укажите --ref group/project!iid');
      return 1;
    }

    const vcsSource = parseValue(argv, '--vcs-source');
    const vcsCliArgs: VcsCliArgs = { ref, host: vcsSource };
    const context = await resolveVcsContext(vcsCliArgs);
    const project = context.project;
    const iid = String(context.iid);
    const host = context.host;
    const token = context.token;
    const baseUrl = `https://${host}/api/v4`;
    const client = new VcsGitlabClient({ token, baseUrl });

    const mr = (await client.MergeRequests.getByIid({ project, iid })) as {
      title?: string;
      web_url?: string;
      target_branch?: string;
      diff_refs?: { base_sha?: string; start_sha?: string; head_sha?: string };
    } | null;

    const title = mr?.title ?? '';
    const webUrl = mr?.web_url ?? '';
    const targetBranch = mr?.target_branch ?? '';
    const diffRefs = mr?.diff_refs;

    // #region START_WORKTREE
    let worktree: {
      path: string;
      base: string;
      diffRefs: typeof diffRefs;
      repoLayout: { dirs: string[]; rootFiles: string[] } | null;
    } | null = null;
    let changeset: Changeset | null = null;

    if (!skipWorktree) {
      const reposBase = parseValue(argv, '--repos-base') ?? join(homedir(), 'Developer');
      const clonePath = ensureClone(project, host, token, {
        reposBase,
        reposMapPath: reposMapPath(stateDir),
        clonesRoot: clonesRoot(stateDir),
      });

      const root = worktreesRoot(stateDir);
      mkdirSync(root, { recursive: true });
      gcStaleWorktrees(root, WORKTREE_TTL_MS, Date.now());
      const worktreePath = join(root, `${project.replace(/\//g, '__')}-${iid}`);

      const prepared = prepareMrWorktree(clonePath, iid, worktreePath);
      let baseSha = '';
      if (targetBranch) {
        try {
          baseSha = resolveBaseSha(clonePath, targetBranch, prepared.headSha);
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
    const inboxClient = buildInboxClient(vcsSource);
    const [items, me] = await Promise.all([
      inboxClient.Inbox.getActionable(),
      inboxClient.getCurrentUser(),
    ]);
    const mrItem = items.find((m) => m.project === project && m.iid === iid);

    const pkg = {
      role: mrItem?.role ?? null,
      author: mrItem?.author ?? '',
      reviewers: mrItem?.reviewers ?? [],
      description: mrItem?.description ?? '',
      approvedBy: mrItem?.approvedBy ?? [],
    };
    // #endregion END_PACKAGE

    // #region START_THREADS
    let stage: string | null = null;
    let openQuestions: number | null = null;
    let lastAuthorStr: string | null = null;
    let threads: { all: unknown[]; drafts: unknown[] } | null = null;

    if (!skipThreads) {
      const [allDiscussions, draftNotes] = await Promise.all([
        client.MergeDiscussions.getAll({ project, iid }),
        client.MergeDiscussions.listDraftNotes({ project, iid }),
      ]);
      const notes = flattenNotes(allDiscussions);
      stage = classifyMrStage(notes, me.login, pkg.role);
      const packet = buildWorkPacket(notes, me.login, pkg.role);
      openQuestions = packet.openNotes.length;
      lastAuthorStr = lastNoteAuthor(notes);

      threads = { all: allDiscussions, drafts: draftNotes };
    }
    // #endregion END_THREADS

    const result: Record<string, unknown> = {
      ref: `${project}!${iid}`,
      title,
      webUrl,
      worktree,
      changeset,
      stage,
      openQuestions,
      lastAuthor: lastAuthorStr,
      threads,
      package: pkg,
    };

    console.info(JSON.stringify(result, null, 2));
    return 0;
  } catch (error) {
    console.error(style.redBright.bold('✖ Ошибка:'), (error as Error).message ?? String(error));
    return 1;
  }
}

process.exit(await run());
