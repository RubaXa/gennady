#!/usr/bin/env node
// @file: CLI command: vcs-worktree — prepare/cleanup a read-only worktree for MR review.
// @consumers: N/A
// @tasks: N/A

import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { style } from '../../../shared/common/style.ts';
import { getGitRemote } from '../../../shared/backend/git/git-core.ts';
import { buildInboxClient } from '../inbox/_core/logic/build-inbox-context.logic.ts';
import {
  prepareMrWorktree,
  resolveBaseSha,
  removeWorktreeAt,
} from './_core/logic/worktree-ops.logic.ts';
import { ensureClone } from './_core/logic/locate-clone.logic.ts';

function parseValue(argv: string[], flag: string): string | undefined {
  const inline = argv.find((a) => a.startsWith(`${flag}=`));
  if (inline) return inline.slice(flag.length + 1);
  const idx = argv.indexOf(flag);
  return idx !== -1 ? argv[idx + 1] : undefined;
}

async function run(): Promise<number> {
  try {
    const argv = process.argv.slice(2);

    const cleanup = parseValue(argv, '--cleanup');
    if (cleanup) {
      removeWorktreeAt(cleanup);
      console.info(style.gray(`worktree removed: ${cleanup}`));
      return 0;
    }

    const ref = parseValue(argv, '--ref');
    if (!ref || !ref.includes('!')) {
      console.error(style.redBright.bold('✖ Ошибка:'), 'Укажите --ref group/project!iid');
      return 1;
    }
    const sep = ref.lastIndexOf('!');
    const project = ref.slice(0, sep);
    const iid = ref.slice(sep + 1);

    const vcsSource = parseValue(argv, '--vcs-source');
    const token = process.env.GITLAB_PERSONAL_TOKEN ?? '';
    const host = vcsSource ?? getGitRemote()?.host ?? '';

    const client = buildInboxClient(vcsSource);
    const mr = (await client.MergeRequests.getByIid({ project, iid })) as {
      target_branch?: string;
      diff_refs?: { base_sha?: string; start_sha?: string; head_sha?: string };
    } | null;
    const targetBranch = mr?.target_branch ?? '';
    const diffRefs = mr?.diff_refs;

    const clonePath = ensureClone(project, host, token);

    const root = join(homedir(), '.gennady', 'worktrees');
    mkdirSync(root, { recursive: true });
    const worktreePath = join(root, `${project.replace(/\//g, '__')}-${iid}`);

    const prepared = prepareMrWorktree(clonePath, iid, worktreePath);
    const baseSha = targetBranch
      ? resolveBaseSha(clonePath, targetBranch, prepared.headSha)
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
