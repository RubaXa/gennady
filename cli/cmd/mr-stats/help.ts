// @file: mr-stats command help output
// @consumers: HelpCommand
// @tasks: TSK-138, TSK-139

/**
 * @purpose Print CLI help for the mr-stats command.
 */
export function printHelp(): void {
  process.stdout.write('gennady mr-stats — Получить структурированную статистику по GitLab MR.\n');
  process.stdout.write('\n');
  process.stdout.write('Usage:\n');
  process.stdout.write('  gennady mr-stats <url>\n');
  process.stdout.write('\n');
  process.stdout.write('Аргументы:\n');
  process.stdout.write('  <url>   URL GitLab Merge Request\n');
  process.stdout.write('\n');
  process.stdout.write('Пример:\n');
  process.stdout.write(
    '  gennady mr-stats https://gitlab.corp.mail.ru/mail/messenger/-/merge_requests/14\n'
  );
}
