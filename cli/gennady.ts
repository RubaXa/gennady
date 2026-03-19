#!/usr/bin/env node

const helpFlags = new Set(['help', '--help', '-h']);
const command = process.argv[2];

if (helpFlags.has(command ?? '') || command === 'help') {
  await import('./cmd/help/help.cmd.ts');
  process.exit(0);
}

switch (command) {
  case 'cat':
    await import('./cmd/cat/index.ts');
    break;

  case 'review':
    await import('./cmd/review/index.ts');
    break;

  case 'vcs-reply':
    await import('./cmd/vcs-reply/index.ts');
    break;

  case 'review-verify':
    await import('./cmd/review-verify/index.ts');
    break;

  case 'review-issues':
    await import('./cmd/review-issues/index.ts');
    break;

  case 'commit':
  default:
    await import('./cmd/commit/index.ts');
    break;
}
