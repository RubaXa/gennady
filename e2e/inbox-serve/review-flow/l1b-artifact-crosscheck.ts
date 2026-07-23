// @file: L1b — сверка живых actionable MR (GitLab, read-only) с уже материализованными артефактами
//   в ~/.gennady/agent-inbox/reports/<mr>/. Готовит почву для группы H (recovery/self-correction,
//   LIVE-FLOW-EVAL.md §3d): показывает РЕАЛЬНОЕ пересечение "что GitLab говорит сейчас" и "что мы
//   уже разобрали на диске" — без записи, без перепроверки (та будет в UC-73).
// @consumers: ручной запуск оператором
// @tasks: agent-inbox live-flow-eval

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { StateStore } from '../../../services/agent-inbox/modules/inbox-core/state-store.ts';
import { VcsInboxReal } from '../../../services/agent-inbox/modules/inbox-core/vcs-inbox.real.ts';
import { mrReportsDir } from '../../../cli/cmd/inbox/_core/logic/state-paths.logic.ts';

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

  console.log(`[l1b] gennadyHome=${gennadyHome}`);
  console.log(`[l1b] actionable(opened)=${actionable.length}`);
  console.log(`[l1b] с материализованным review.json: ${withArtifact}`);
  console.log(
    `[l1b] БЕЗ артефакта (ревью либо не начато, либо не в дефолтном ~/.gennady): ${withoutArtifact}`
  );
  console.log('\n[l1b] === MR с уже существующим артефактом ===');
  for (const r of rows) console.log(r);
}

main().catch((err) => {
  console.error('[l1b] FATAL', err);
  process.exitCode = 1;
});
