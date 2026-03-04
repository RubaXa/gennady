#!/usr/bin/env node

const helpFlags = new Set(['help', '--help', '-h']);
const command = process.argv[2];

if (helpFlags.has(command ?? '')) {
  console.info('Gennady CLI');
  console.info('');
  console.info('Usage:');
  console.info('  npx gennady [command] [options]');
  console.info('');
  console.info('Commands:');
  console.info('  commit (default)  Generate commit message from staged changes');
  console.info('  review            Review staged changes for critical issues');
  console.info('  cat               Display file contents as XML or Markdown');
  console.info('  agent             Run AI agent request');
  console.info('  vcs-reply         Post replies to GitLab MR discussions from stdin');
  console.info('  review-verify     Build verification prompt from open GitLab MR');
  console.info('  review-issues     Build XML issues artifact from GitLab MR discussions');
  console.info('');
  console.info('Examples:');
  console.info('  npx gennady');
  console.info('  npx gennady review --branch=develop');
  console.info('  npx gennady cat "./src/**/*.js" --output=md');
  process.exit(0);
}

switch (command) {
  case 'agent':
    await import('./cmd/agent/index.ts');
    break;
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
  default:
    await import('./cmd/commit/index.ts');
    break;
}
