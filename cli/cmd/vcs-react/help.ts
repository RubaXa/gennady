// @file: vcs-react command help output.
// @consumers: help command
// @tasks: TSK-98

/**
 * @purpose Print CLI help for the vcs-react command.
 * @sideEffect Console: writes help text to stdout.
 */
export function printHelp(): void {
  console.info('gennady vcs-react — Add/remove emoji reactions on MR/PR comments');
  console.info('');
  console.info('Usage:');
  console.info('  npx gennady vcs-react --url <mr-url> --comment <noteId> --emoji <name>');
  console.info('  npx gennady vcs-react --url <mr-url> --comment <noteId> --emoji <name> --remove');
  console.info('');
  console.info('Options:');
  console.info('  --url <mr-url>           MR/PR URL — host inferred, no guessing (preferred)');
  console.info(
    '  --comment <id>           Note ID to react to (from `vcs-discussions --json` notes[].id)'
  );
  console.info(
    '  --emoji <name>           Emoji: 👍 👎 😄 🎉 😕 ❤️ 🚀 👀 🤡 or word: thumbsup, rocket, heart'
  );
  console.info('  --remove                 Remove own reaction (instead of adding)');
  console.info('  --ref <group/repo!iid>   MR ref (override; then also pass --host)');
  console.info('  --host <hostname>        VCS host (only with --ref)');
  console.info('  --vcs-host <hostname>    Alias for --host');
  console.info('  --dry-run                Print without calling API');
  console.info('');
  console.info('Examples:');
  console.info(
    '  npx gennady vcs-react --url https://gitlab.com/group/repo/-/merge_requests/42 --comment 123 --emoji 👍'
  );
  console.info(
    '  npx gennady vcs-react --url https://gitlab.com/group/repo/-/merge_requests/42 --comment 123 --emoji rocket --remove'
  );
}
