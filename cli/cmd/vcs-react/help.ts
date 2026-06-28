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
  console.info('  npx gennady vcs-react --ref <ref> --comment <id> --emoji <name>');
  console.info('  npx gennady vcs-react --ref <ref> --comment <id> --emoji <name> --remove');
  console.info('');
  console.info('Options:');
  console.info('  --ref <group/repo!iid>   MR ref');
  console.info('  --comment <id>           Comment/note ID to react to');
  console.info('  --emoji <name>           Emoji: 👍 👎 😄 🎉 😕 ❤️ 🚀 👀 🤡 or word: thumbsup, rocket, heart');
  console.info('  --remove                 Remove own reaction (instead of adding)');
  console.info('  --host <hostname>        VCS host');
  console.info('  --dry-run                Print without calling API');
  console.info('');
  console.info('Examples:');
  console.info('  npx gennady vcs-react --ref group/repo!42 --comment 123 --emoji 👍');
  console.info('  npx gennady vcs-react --ref group/repo!42 --comment 123 --emoji rocket');
  console.info('  npx gennady vcs-react --ref group/repo!42 --comment 123 --emoji 👍 --remove');
}
