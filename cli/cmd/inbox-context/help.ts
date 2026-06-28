// @file: inbox-context command help output
// @consumers: help command
import { style } from '../../../shared/common/style.ts';

/**
 * @purpose Print CLI help for the inbox-context command.
 */
export function printHelp(): void {
  console.info(style.bold('gennady inbox-context — атомарный сбор контекста MR'));
  console.info('');
  console.info('  gennady inbox-context --ref <group/project!iid> [флаги]');
  console.info('');
  console.info(style.bold('Флаги:'));
  console.info('  --ref <ref>              MR ref (обязателен)');
  console.info('  --vcs-source=<host>      GitLab host (автодетект из origin)');
  console.info('  --skip-worktree          Без клона — changeset и worktree пусты');
  console.info('  --skip-threads           Без обсуждений — threads/stage пусты');
  console.info('  --repos-base=<dir>       База поиска клонов (default ~/Developer)');
  console.info('  --state-dir=<dir>        Директория состояния (default ~/.gennady)');
  console.info('  --json                   Вывод в JSON (по умолчанию)');
  console.info('');
  console.info(style.bold('Вывод (JSON):'));
  console.info('  ref, title, webUrl — идентификация MR');
  console.info('  worktree — path, base, diffRefs, repoLayout');
  console.info('  changeset — files [{path, status, plus, minus}], totals, byCategory');
  console.info('  stage — review_needed | reply_needed | awaiting_reply | idle');
  console.info('  openQuestions, lastAuthor — из обсуждений');
  console.info('  threads — { all, drafts } — полные треды и черновики');
  console.info('  package — role, author, reviewers, description, approvedBy');
}
