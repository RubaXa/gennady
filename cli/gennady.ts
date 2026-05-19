#!/usr/bin/env node

const helpFlags = new Set(['help', '--help', '-h']);
const command = process.argv[2];

if (!command || helpFlags.has(command)) {
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

  case 'resolve-conflicts':
    await import('./cmd/resolve-conflicts/index.ts');
    break;

  case 'commit':
    await import('./cmd/commit/index.ts');
    break;

  case 'remote-console':
    await import('./cmd/remote-console/index.ts');
    break;

  case 'lint':
    await import('./cmd/lint/index.ts');
    break;

  case 'alt-opinion':
    await import('./cmd/alt-opinion/index.ts');
    break;

  default:
    await import('./cmd/help/help.cmd.ts');
    process.exit(0);
}
