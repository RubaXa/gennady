// @file: L1c — why are 26 of 27 materialized reports/<mr>/ not in the current actionable set?
//   Checks live-state (merged/closed/dropped-role) for each on-disk MR directly via
//   MergeRequests.getByIid — not relying on getActionable() which returns only actionable MRs.
// @consumers: operator manual run
// @tasks: agent-inbox live-flow-eval

import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { StateStore } from '../../../services/agent-inbox/modules/inbox-core/state-store.ts';
import { resolveVcsContext } from '../../../cli/cmd/_shared/vcs-context-resolver.ts';
import { createVcsClient } from '../../../cli/cmd/_shared/create-vcs-client.ts';
import { logger } from '#logger';

/** @purpose Decode a `mrReportsDir` folder name back to `project!iid` (best-effort, single `-<iid>` suffix). */
function decodeDirName(name: string): { project: string; iid: string } | null {
  const m = name.match(/^(.+)-(\d+)$/);
  if (!m) return null;
  return { project: m[1].replace(/__/g, '/'), iid: m[2] };
}

async function main() {
  const store = new StateStore();
  const configResult = await store.loadConfig();
  if (!configResult.configured) throw new Error('agent-inbox не настроен');
  const host = configResult.vcsHost;
  const token = process.env.GITLAB_PERSONAL_TOKEN;
  if (!token) throw new Error('GITLAB_PERSONAL_TOKEN не задан');

  const reportsRoot = join(homedir(), '.gennady', 'agent-inbox', 'reports');
  const dirs = readdirSync(reportsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  logger.info(`[l1c] директорий в reports/: ${dirs.length}`);

  for (const dirName of dirs) {
    const decoded = decodeDirName(dirName);
    if (!decoded) {
      logger.info(`  [не распознано] ${dirName}`);
      continue;
    }
    const { project, iid } = decoded;
    const webUrl = `https://${host}/${project}/-/merge_requests/${iid}`;
    const reviewPath = join(reportsRoot, dirName, 'review.json');
    const hasReview = existsSync(reviewPath);
    let revision = '?';
    if (hasReview) {
      try {
        const j = JSON.parse(readFileSync(reviewPath, 'utf-8'));
        revision = String(j.revision ?? '?');
      } catch {
        /* ignore parse errors for this diagnostic */
      }
    }

    try {
      const context = await resolveVcsContext({ url: webUrl });
      const client = createVcsClient(context);
      const mr = (await client.MergeRequests.getByIid({
        project: context.project,
        iid: String(context.iid),
      })) as Record<string, unknown> | null;

      if (!mr) {
        logger.info(
          `  [${dirName}] ${project}!${iid} — NOT FOUND (review.json=${hasReview}, rev=${revision})`
        );
        continue;
      }
      const state = mr.state as string;
      const author = (mr.author as { username?: string } | null)?.username ?? '?';
      const reviewers = ((mr.reviewers as Array<{ username?: string }> | null) ?? [])
        .map((r) => r.username)
        .join(',');
      logger.info(
        `  [${dirName}] ${project}!${iid} — state=${state} author=${author} reviewers=[${reviewers}] ` +
          `review.json=${hasReview} rev=${revision}`
      );
    } catch (cause) {
      logger.info(
        `  [${dirName}] ${project}!${iid} — FETCH ERROR: ${(cause as Error).message.slice(0, 100)} ` +
          `(review.json=${hasReview}, rev=${revision})`
      );
    }
  }
}

main().catch((err) => {
  logger.error('[l1c] FATAL', err);
  process.exitCode = 1;
});
