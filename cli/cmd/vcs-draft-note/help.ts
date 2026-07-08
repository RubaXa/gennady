// @file: vcs-draft-note command help output.
// @consumers: help command
// @tasks: TSK-87, TSK-97

/**
 * @purpose Print CLI help for the vcs-draft-note command.
 * @sideEffect Console: writes help text to stdout.
 */
export function printHelp(): void {
  console.info('gennady vcs-draft-note — Управление черновиками (draft notes) GitLab MR');
  console.info('');
  console.info('Usage:');
  console.info('  npx gennady vcs-draft-note --list  --url <mr-url>');
  console.info('  npx gennady vcs-draft-note --create "<text>" --url <mr-url>');
  console.info('  npx gennady vcs-draft-note --update <id> --body "<text>" --url <mr-url>');
  console.info('  npx gennady vcs-draft-note --delete <id> --url <mr-url>');
  console.info('  npx gennady vcs-draft-note --publish <id> --url <mr-url>');
  console.info('  npx gennady vcs-draft-note --delete-all --url <mr-url>');
  console.info('');
  console.info('Options:');
  console.info('  --url <mr-url>           MR/PR URL — host inferred, no guessing (preferred)');
  console.info('  --ref <group/repo!iid>   MR ref (override; needs --host)');
  console.info('  --project <group/repo>   Путь к проекту (явно)');
  console.info('  --iid <id>               MR internal ID (явно)');
  console.info('  --host <hostname>        GitLab хост (иначе из origin)');
  console.info('  --vcs-host <hostname>    Alias for --host');
  console.info('  --list                   Показать список черновиков');
  console.info('  --create "<text>"        Создать черновик с указанным текстом');
  console.info('  --update <id>            Обновить черновик (требует --body)');
  console.info('  --body "<text>"          Текст для --update');
  console.info('  --delete <id>            Удалить черновик');
  console.info('  --publish <id>           Опубликовать черновик');
  console.info('  --delete-all             Удалить все черновики (best-effort)');
  console.info('  --dry-run, --dry         Показать, что будет выполнено, без API-вызова');
  console.info('');
  console.info('Environment:');
  console.info('  GITLAB_PERSONAL_TOKEN    GitLab access token (required)');
  console.info('');
  console.info('Examples:');
  console.info(
    '  npx gennady vcs-draft-note --url https://gitlab.example.com/group/repo/-/merge_requests/42 --list'
  );
  console.info(
    '  npx gennady vcs-draft-note --url https://gitlab.example.com/group/repo/-/merge_requests/42 --create "Надо поправить"'
  );
  console.info(
    '  npx gennady vcs-draft-note --url https://gitlab.example.com/group/repo/-/merge_requests/42 --delete-all'
  );
}
