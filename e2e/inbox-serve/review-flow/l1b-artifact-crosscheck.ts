// @file: L1b — cross-check live actionable MRs (GitLab, read-only) with materialized artifacts
//   in ~/.gennady/agent-inbox/reports/<mr>/. Prepares ground for group H (recovery/self-correction,
//   LIVE-FLOW-EVAL.md §3d): shows the real overlap of "what GitLab says now" and "what is on disk".
// @consumers: operator manual run
// @tasks: agent-inbox live-flow-eval

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { StateStore } from '../../../services/agent-inbox/modules/inbox-core/state-store.ts';
import { VcsInboxReal } from '../../../services/agent-inbox/modules/inbox-core/vcs-inbox.real.ts';
import { mrReportsDir } from '../../../cli/cmd/inbox/_core/logic/state-paths.logic.ts';
import { logger } from '#logger';

async function main() {
  const store = new StateStore();
  const configResult = await store.loadConfig();
  if (!configResult.configured) throw new Error('agent-inbox не настроен');
  const host = configResult.vcsHost;
  const token = process.env.GITLAB_PERSONAL_TOKEN;
  if (!token) throw new Error('GITLAB_PERSONAL_TOKEN не задан');

  const vcs = new VcsInboxReal({ host, token });
  const all = await vcs.getActionable();
  const actionable = all.filter((mr) => mr.state === 'opened');

  const gennadyHome = join(homedir(), '.gennady');
  let withArtifact = 0;
  let withoutArtifact = 0;
  const rows: string[] = [];

  for (const mr of actionable) {
    const ref = `${mr.project}!${mr.iid}`;
    const dir = mrReportsDir(gennadyHome, ref);
    const reviewPath = join(dir, 'review.json');
    if (existsSync(reviewPath)) {
      withArtifact++;
      try {
        const review = JSON.parse(readFileSync(reviewPath, 'utf-8')) as {
          revision?: number;
          verdict?: string;
          findings?: unknown[];
        };
        rows.push(
          `  [артефакт есть] [${mr.role}] ${ref} — revision=${review.revision ?? '?'} ` +
            `verdict=${review.verdict ?? '?'} находок=${review.findings?.length ?? '?'}`
        );
      } catch (cause) {
        rows.push(
          `  [артефакт ЕСТЬ, но не парсится] [${mr.role}] ${ref} — ${(cause as Error).message}`
        );
      }
    } else {
      withoutArtifact++;
    }
  }

  logger.info(`[l1b] gennadyHome=${gennadyHome}`);
  logger.info(`[l1b] actionable(opened)=${actionable.length}`);
  logger.info(`[l1b] с материализованным review.json: ${withArtifact}`);
  logger.info(
    `[l1b] БЕЗ артефакта (ревью либо не начато, либо не в дефолтном ~/.gennady): ${withoutArtifact}`
  );
  logger.info('\n[l1b] === MR с уже существующим артефактом ===');
  for (const r of rows) logger.info(r);
}

main().catch((err) => {
  logger.error('[l1b] FATAL', err);
  process.exitCode = 1;
});
