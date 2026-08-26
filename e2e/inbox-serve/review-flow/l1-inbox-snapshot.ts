// @file: L1 — live read-only inbox snapshot on a real GitLab token (LIVE-FLOW-EVAL.md §5.A).
//   No Playwright, no server/opencode boot — direct VcsInboxReal calls only, no writes.
//   Dynamic: not bound to a specific MR; prints current live state for the active token.
// @consumers: operator manual run; future L1 Playwright test reuses this logic
// @tasks: agent-inbox live-flow-eval

import { StateStore } from '../../../services/agent-inbox/modules/inbox-core/state-store.ts';
import { VcsInboxReal } from '../../../services/agent-inbox/modules/inbox-core/vcs-inbox.real.ts';
import type { VcsActionableMr } from '../../../services/vcs-client/entities/vcs-actionable-mr.type.ts';
import { resolveVcsContext } from '../../../cli/cmd/_shared/vcs-context-resolver.ts';
import { createVcsClient } from '../../../cli/cmd/_shared/create-vcs-client.ts';
import {
  flattenNotes,
  classifyMrStage,
  type RawNote,
} from '../../../cli/cmd/inbox/_core/logic/classify-mr-stage.logic.ts';
import { logger } from '#logger';

/**
 * @purpose Fetch raw discussions for one MR — port drops system flag and
 *   updated_at; classifyMrStage requires the raw path.
 * @param webUrl MR web URL to fetch raw discussions for.
 * @returns Raw note array from the MR's discussions.
 */
async function getRawNotes(webUrl: string): Promise<RawNote[]> {
  const context = await resolveVcsContext({ url: webUrl });
  const client = createVcsClient(context);
  const raw = (await client.MergeDiscussions!.getAll({
    project: context.project,
    iid: context.iid!,
  })) as unknown[];
  return flattenNotes(raw);
}

async function main() {
  const store = new StateStore();
  const configResult = await store.loadConfig();
  if (!configResult.configured) {
    throw new Error(
      `agent-inbox не настроен (~/.gennady/config.json): missing ${JSON.stringify((configResult as { missing?: string[] }).missing)}`
    );
  }
  const host = configResult.vcsHost;
  const token = process.env.GITLAB_PERSONAL_TOKEN;
  if (!token) throw new Error('GITLAB_PERSONAL_TOKEN не задан в окружении');

  const vcs = new VcsInboxReal({ host, token });
  const myLogin = await vcs.getMyLogin();

  logger.info(`[l1] host=${host} myLogin=${myLogin || '(unknown)'}`);
  logger.info('[l1] запрашиваю getActionable()...');
  const all = await vcs.getActionable();
  const actionable = all.filter((mr) => mr.state === 'opened');

  logger.info(
    `[l1] getActionable() total=${all.length} (opened=${actionable.length}, ` +
      `остальные state: ${
        all
          .filter((mr) => mr.state !== 'opened')
          .map((mr) => mr.state)
          .join(',') || 'нет'
      })`
  );

  const byRole: Record<string, VcsActionableMr[]> = { author: [], reviewer: [], mentioned: [] };
  for (const mr of actionable) {
    if (mr.role) byRole[mr.role]?.push(mr);
  }
  logger.info(
    `[l1] по ролям: author=${byRole.author.length} reviewer=${byRole.reviewer.length} ` +
      `mentioned=${byRole.mentioned.length} (role=null отброшены: ${
        actionable.filter((mr) => !mr.role).length
      })`
  );

  type MrStat = {
    ref: string;
    role: string | null;
    title: string;
    unresolvedThreads: number;
    unreadToMe: number;
    stage: string;
  };
  const stats: MrStat[] = [];

  for (const mr of actionable) {
    const ref = `${mr.project}!${mr.iid}`;
    try {
      const discAll = await vcs.getDiscussions(mr.webUrl, { all: true });
      const unresolved = discAll.filter((d) => d.resolved === false).length;

      // "непрочитанный ответ мне" = в треде есть заметка НЕ от меня, которая идёт ПОСЛЕ последней
      // моей заметки в этом же треде (или я вообще не участвовал, но тред мне адресован — здесь,
      // без directlyAddressed-детализации на уровне ноты, консервативно считаем только случай
      // "я уже отвечал, потом ответили ещё раз" — это read-only приближение для L1).
      let unreadToMe = 0;
      if (myLogin) {
        for (const d of discAll) {
          const notes = d.notes;
          const lastMineIdx = [...notes].map((n) => n.username).lastIndexOf(myLogin);
          if (lastMineIdx === -1) continue;
          const after = notes.slice(lastMineIdx + 1);
          if (after.some((n) => n.username !== myLogin)) unreadToMe++;
        }
      }

      // Stage needs RAW discussions (system-note flag) — the normalized port type above can't
      // carry it (GAP, see file header comment).
      let stage = 'unknown';
      try {
        const rawNotes = await getRawNotes(mr.webUrl);
        stage = classifyMrStage(rawNotes, myLogin, mr.role);
      } catch (stageCause) {
        stage = `error(${(stageCause as Error).message.slice(0, 60)})`;
      }

      stats.push({
        ref,
        role: mr.role,
        title: mr.title,
        unresolvedThreads: unresolved,
        unreadToMe,
        stage,
      });
    } catch (cause) {
      logger.error(`[l1] getDiscussions FAILED для ${ref}: ${(cause as Error).message}`);
      stats.push({
        ref,
        role: mr.role,
        title: mr.title,
        unresolvedThreads: -1,
        unreadToMe: -1,
        stage: 'error',
      });
    }
  }

  logger.info('\n[l1] === Снимок по MR ===');
  for (const s of stats) {
    logger.info(
      `  [${s.role ?? '?'}] [${s.stage}] ${s.ref} — "${s.title}" — открытых тредов: ${s.unresolvedThreads}, ` +
        `непрочитанных мне: ${s.unreadToMe}`
    );
  }

  const totalUnresolved = stats.reduce((a, s) => a + Math.max(0, s.unresolvedThreads), 0);
  const totalUnread = stats.reduce((a, s) => a + Math.max(0, s.unreadToMe), 0);
  const failed = stats.filter((s) => s.unresolvedThreads === -1).length;
  const stageCounts: Record<string, number> = {};
  for (const s of stats) stageCounts[s.stage] = (stageCounts[s.stage] ?? 0) + 1;
  logger.info(
    `\n[l1] ИТОГО: actionable=${actionable.length} открытых тредов(sum)=${totalUnresolved} ` +
      `непрочитанных-мне(sum)=${totalUnread} ошибок-getDiscussions=${failed}`
  );
  logger.info(`[l1] по стадиям: ${JSON.stringify(stageCounts)}`);
}

main().catch((err) => {
  logger.error('[l1] FATAL', err);
  process.exitCode = 1;
});
