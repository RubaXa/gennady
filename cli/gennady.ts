#!/usr/bin/env node
// @file: CLI entry point — dispatches commands, runs update check on startup.
// @consumers: CLI users (gennady <command>)
// @tasks: TSK-33, TSK-47, TSK-55, TSK-57, TSK-59, TSK-65, TSK-69, TSK-76, TSK-81, TSK-83, TSK-85, TSK-87

import { checkForUpdates } from './cmd/_shared/update-check.ts';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

declare const __GENNADY_VERSION__: string;

const _version =
  typeof __GENNADY_VERSION__ !== 'undefined'
    ? __GENNADY_VERSION__
    : JSON.parse(
        readFileSync(
          resolve(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'),
          'utf-8'
        )
      ).version;

const helpFlags = new Set(['help', '--help', '-h']);
const versionFlags = new Set(['--version', '-v']);
const command = process.argv[2];

if (versionFlags.has(command)) {
  console.log(_version);
  process.exit(0);
}

if (!command || helpFlags.has(command)) {
  await import('./cmd/help/help.cmd.ts');
  process.exit(0);
}

// invariant: non-blocking; spawn + unref ensures it never blocks exit
checkForUpdates({ name: 'gennady', version: _version });

// #region START_PER_COMMAND_HELP — if rest args contain --help/-h, dispatch to command help and exit
const restArgs = process.argv.slice(3);
if (restArgs.some((a) => helpFlags.has(a))) {
  let helpLoaded = false;

  switch (command) {
    case 'cat':
      await import('./cmd/cat/help.ts').then((m) => m.printHelp());
      helpLoaded = true;
      break;
    case 'review':
      await import('./cmd/review/help.ts').then((m) => m.printHelp());
      helpLoaded = true;
      break;
    case 'vcs-reply':
      await import('./cmd/vcs-reply/help.ts').then((m) => m.printHelp());
      helpLoaded = true;
      break;
    case 'review-verify':
      await import('./cmd/review-verify/help.ts').then((m) => m.printHelp());
      helpLoaded = true;
      break;
    case 'review-issues':
      await import('./cmd/review-issues/help.ts').then((m) => m.printHelp());
      helpLoaded = true;
      break;
    case 'inbox':
      await import('./cmd/inbox/help.ts').then((m) => m.printHelp());
      helpLoaded = true;
      break;
    case 'vcs-worktree':
      await import('./cmd/vcs-worktree/help.ts').then((m) => m.printHelp());
      helpLoaded = true;
      break;
    case 'resolve-conflicts':
      await import('./cmd/resolve-conflicts/help.ts').then((m) => m.printHelp());
      helpLoaded = true;
      break;
    case 'commit':
      await import('./cmd/commit/help.ts').then((m) => m.printHelp());
      helpLoaded = true;
      break;
    case 'remote-console':
      await import('./cmd/remote-console/help.ts').then((m) => m.printHelp());
      helpLoaded = true;
      break;
    case 'lint':
      await import('./cmd/lint/help.ts').then((m) => m.printHelp());
      helpLoaded = true;
      break;
    case 'alt-opinion':
      await import('./cmd/alt-opinion/help.ts').then((m) => m.printHelp());
      helpLoaded = true;
      break;
    case 'agent-mon':
      await import('./cmd/agent-mon/help.ts').then((m) => m.printHelp());
      helpLoaded = true;
      break;
    case 'sync':
      await import('./cmd/sync/help.ts').then((m) => m.printHelp());
      helpLoaded = true;
      break;
    case 'orient':
      await import('./cmd/orient/help.ts').then((m) => m.printHelp());
      helpLoaded = true;
      break;
    case 'run':
      await import('./cmd/run/help.ts').then((m) => m.printHelp());
      helpLoaded = true;
      break;
    case 'vcs-approve':
      await import('./cmd/vcs-approve/help.ts').then((m) => m.printHelp());
      helpLoaded = true;
      break;
    case 'testcov':
      await import('./cmd/testcov/help.ts').then((m) => m.printHelp());
      helpLoaded = true;
      break;
    case 'vcs-diff':
      await import('./cmd/vcs-diff/help.ts').then((m) => m.printHelp());
      helpLoaded = true;
      break;
    case 'vcs-todo':
      await import('./cmd/vcs-todo/help.ts').then((m) => m.printHelp());
      helpLoaded = true;
      break;
    case 'vcs-pipeline':
      await import('./cmd/vcs-pipeline/help.ts').then((m) => m.printHelp());
      helpLoaded = true;
      break;
    case 'vcs-job':
      await import('./cmd/vcs-job/help.ts').then((m) => m.printHelp());
      helpLoaded = true;
      break;
    case 'vcs-job-log':
      await import('./cmd/vcs-job-log/help.ts').then((m) => m.printHelp());
      helpLoaded = true;
      break;
    case 'vcs-draft-note':
      await import('./cmd/vcs-draft-note/help.ts').then((m) => m.printHelp());
      helpLoaded = true;
      break;
    case 'vcs-mr-create':
      await import('./cmd/vcs-mr-create/help.ts').then((m) => m.printHelp());
      helpLoaded = true;
      break;
    case 'vcs-mr-edit':
      await import('./cmd/vcs-mr-edit/help.ts').then((m) => m.printHelp());
      helpLoaded = true;
      break;
    case 'vcs-discussions':
      await import('./cmd/vcs-discussions/help.ts').then((m) => m.printHelp());
      helpLoaded = true;
      break;
    case 'vcs-react':
      await import('./cmd/vcs-react/help.ts').then((m) => m.printHelp());
      helpLoaded = true;
      break;
  }

  if (!helpLoaded) {
    console.error(`No help available for "${command}".`);
  }

  process.exit(0);
}
// #endregion END_PER_COMMAND_HELP

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

  case 'inbox':
    await import('./cmd/inbox/index.ts');
    break;

  case 'vcs-worktree':
    await import('./cmd/vcs-worktree/index.ts');
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

  case 'agent-mon':
    await import('./cmd/agent-mon/cmd/index.ts');
    break;

  case 'sync':
    await import('./cmd/sync/index.ts');
    break;

  case 'sync-skills':
    await import('./cmd/sync-skills/index.ts');
    break;

  case 'orient':
    await import('./cmd/orient/index.ts');
    break;

  case 'agents-rules':
    await import('./cmd/agents-rules/index.ts');
    break;

  case 'run':
    await import('./cmd/run/index.ts');
    break;

  case 'vcs-approve':
    await import('./cmd/vcs-approve/index.ts');
    break;

  case 'testcov':
    await import('./cmd/testcov/index.ts');
    break;

  case 'vcs-diff':
    await import('./cmd/vcs-diff/index.ts');
    break;

  case 'vcs-pipeline':
    await import('./cmd/vcs-pipeline/index.ts');
    break;

  case 'vcs-todo':
    await import('./cmd/vcs-todo/index.ts');
    break;

  case 'vcs-job':
    await import('./cmd/vcs-job/index.ts');
    break;

  case 'vcs-job-log':
    await import('./cmd/vcs-job-log/index.ts');
    break;

  case 'vcs-draft-note':
    await import('./cmd/vcs-draft-note/index.ts');
    break;

  case 'vcs-mr-create':
    await import('./cmd/vcs-mr-create/index.ts');
    break;

  case 'vcs-mr-edit':
    await import('./cmd/vcs-mr-edit/index.ts');
    break;

  case 'vcs-discussions':
    await import('./cmd/vcs-discussions/index.ts');
    break;

  case 'vcs-react':
    await import('./cmd/vcs-react/index.ts');
    break;

  default:
    await import('./cmd/help/help.cmd.ts');
    process.exit(0);
}
