// @file: vcs-draft command help output.
// @consumers: help command
// @tasks: TSK-87

/**
 * @purpose Print CLI help for the vcs-draft command.
 * @sideEffect Console: writes help text to stdout.
 */
export function printHelp(): void {
  console.info('gennady vcs-draft — Управление черновиками (draft notes) GitLab MR');
  console.info('');
  console.info('Usage:');
  console.info('  npx gennady vcs-draft --list  [--ref <ref>]');
  console.info('  npx gennady vcs-draft --create "<text>" [--ref <ref>]');
  console.info('  npx gennady vcs-draft --update <id> --body "<text>" [--ref <ref>]');
  console.info('  npx gennady vcs-draft --delete <id> [--ref <ref>]');
  console.info('  npx gennady vcs-draft --publish <id> [--ref <ref>]');
  console.info('');
  console.info('Options:');
  console.info('  --ref <group/repo!iid>   MR ref (определяет project + iid)');
  console.info('  --project <group/repo>   Путь к проекту (явно)');
  console.info('  --iid <id>               MR internal ID (явно)');
  console.info('  --host <hostname>        GitLab хост (иначе из origin)');
  console.info('  --list                   Показать список черновиков');
  console.info('  --create "<text>"        Создать черновик с указанным текстом');
  console.info('  --update <id>            Обновить черновик (требует --body)');
  console.info('  --body "<text>"          Текст для --update');
  console.info('  --delete <id>            Удалить черновик');
  console.info('  --publish <id>           Опубликовать черновик');
  console.info('  --dry-run, --dry         Показать, что будет выполнено, без API-вызова');
  console.info('');
  console.info('Environment:');
  console.info('  GITLAB_PERSONAL_TOKEN    GitLab access token (required)');
  console.info('');
  console.info('Examples:');
  console.info('  npx gennady vcs-draft --ref group/repo!42 --list');
  console.info('  npx gennady vcs-draft --ref group/repo!42 --create "Надо поправить"');
  console.info(
    '  npx gennady vcs-draft --ref group/repo!42 --update 123 --body "Обновлённый текст"'
  );
  console.info('  npx gennady vcs-draft --ref group/repo!42 --delete 123');
  console.info('  npx gennady vcs-draft --ref group/repo!42 --publish 123');
  console.info('  npx gennady vcs-draft --ref group/repo!42 --list --dry-run');
}
