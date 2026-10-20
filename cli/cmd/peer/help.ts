// @file: peer command help output
// @spec: PEER
// @consumers: help command, gennady.ts
/**
 * @purpose Print CLI help for the peer command.
 */
export function printHelp(): void {
  console.info('gennady peer — управление агентскими сессиями (Claude.app, OpenCode, Codex)');
  console.info('');
  console.info('Usage:');
  console.info('  gennady peer list [--json]');
  console.info('  gennady peer read <runtime:target>');
  console.info('  gennady peer ledger [--group <g>] [--limit <n>]');
  console.info('  gennady peer watch [--group <g>] [--seconds <n>]');
  console.info(
    '  gennady peer init <runtime:target> [--name <alias>] [--role subordinate] [--group <g>]'
  );
  console.info('  gennady peer forget <alias>');
  console.info('  gennady peer send <runtime:target> <message...>');
  console.info(
    '  gennady peer ask <runtime:target> <message...> [--timeout <ms>] [--mode auto|transcript|message]'
  );
  console.info('  gennady peer fanout <group> <message...> [--timeout <ms>]');
  console.info('');
  console.info(
    'Адресация: <runtime>:<name> — claude: / oc: / codex: (иначе имя должно быть уникально).'
  );
  console.info(
    'read — сводка активности; ask — задача+ответ (Claude: SendMessage/транскрипт, OpenCode: HTTP, Codex: queue).'
  );
  console.info('');
  console.info('Examples:');
  console.info('  gennady peer ask claude:FableResearch "…"');
  console.info('  gennady peer read opencode:Loading\\ 381');
  console.info('  gennady peer read "Проверить растения для гостиной"');
  console.info('  gennady peer fanout demo "Собери статус"');
}
