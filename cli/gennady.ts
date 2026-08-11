#!/usr/bin/env node
// @file: CLI entry point — dispatches commands, runs update check on startup.
// @consumers: GennadyCli
// @tasks: TSK-33, TSK-47, TSK-55, TSK-57, TSK-59, TSK-65, TSK-69, TSK-76, TSK-81, TSK-83, TSK-85, TSK-87, TSK-91, TSK-92, TSK-138

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
      if (process.argv[3] === 'config') {
        await import('./cmd/inbox/config-help.ts').then((m) => m.printHelp());
      } else if (process.argv[3] === 'serve') {
        await import('./cmd/inbox/serve/help.ts').then((m) => m.printHelp());
      } else if (process.argv[3] === 'stats') {
        await import('./cmd/inbox/stats-help.ts').then((m) => m.printHelp());
      } else if (process.argv[3] === 'eval') {
        console.info(
          'gennady inbox eval — харнесс приёмки: 10 сценарных прогонов + метрики автономии'
        );
        console.info('  gennady inbox eval --mr <url> [--runs <list>] [--report <path>]');
        console.info('  --mr <url>     GitLab MR URL (обязателен)');
        console.info(
          '  --runs <list>  список прогонов через запятую (boot,role_pickup,pipeline,...)'
        );
        console.info(
          '  --report <path> путь к eval-report.json (default: ~/.gennady/agent-inbox/eval-reports/<ts>.json)'
        );
        console.info('  exit 0 = все прогоны PASS; exit 1 = хотя бы один FAIL');
      } else {
        await import('./cmd/inbox/help.ts').then((m) => m.printHelp());
      }
      helpLoaded = true;
      break;
    case 'inbox-context':
      await import('./cmd/inbox-context/help.ts').then((m) => m.printHelp());
      helpLoaded = true;
      break;
    case 'inbox-review-plan':
      console.info('gennady inbox-review-plan — детерминированный план ревью MR');
      console.info(
        '  npx tsx ~/Developer/gennady/cli/gennady.ts inbox-review-plan --path <worktree> --base <sha>'
      );
      console.info(
        '  Возвращает ReviewPlan { mode, tracks[] } с готовым планом диспетчеризации сабагентов.'
      );
      helpLoaded = true;
      break;
    case 'inbox-eval':
      console.info('gennady inbox-eval — детерминированный эвал reviewer-пайплайна (S0..S11)');
      console.info('  npx tsx ~/Developer/gennady/cli/gennady.ts inbox-eval --url <mr>');
      console.info(
        '  Флаги: --reports-dir <dir>, --waf <bytes>, --no-dry-run (default dry-run: true, ничего не пишет в GitLab)'
      );
      console.info(
        '  Пишет eval-report.json + .md; exit=0 при status=PASS (все стадии/гейты зелёные), иначе exit=1.'
      );
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
    case 'sdd-state':
      await import('./cmd/sdd-state/help.ts').then((m) => m.printHelp());
      helpLoaded = true;
      break;
    case 'sdd-check':
      await import('./cmd/sdd-check/help.ts').then((m) => m.printHelp());
      helpLoaded = true;
      break;
    case 'sdd-extract':
      await import('./cmd/sdd-extract/help.ts').then((m) => m.printHelp());
      helpLoaded = true;
      break;
    case 'sdd-verify':
      await import('./cmd/sdd-verify/help.ts').then((m) => m.printHelp());
      helpLoaded = true;
      break;
    case 'sdd-log':
      await import('./cmd/sdd-log/help.ts').then((m) => m.printHelp());
      helpLoaded = true;
      break;
    case 'sdd-sync':
      await import('./cmd/sdd-sync/help.ts').then((m) => m.printHelp());
      helpLoaded = true;
      break;
    case 'sdd-task':
      await import('./cmd/sdd-task/help.ts').then((m) => m.printHelp());
      helpLoaded = true;
      break;
    case 'sdd-migrate':
      await import('./cmd/sdd-migrate/help.ts').then((m) => m.printHelp());
      helpLoaded = true;
      break;
    case 'mr-stats':
      await import('./cmd/mr-stats/help.ts').then((m) => m.printHelp());
      helpLoaded = true;
      break;
    case 'yagni':
      await import('./cmd/yagni/help.ts').then((m) => m.printHelp());
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
    if (process.argv[3] === 'config') {
      await import('./cmd/inbox/config-index.ts');
    } else if (process.argv[3] === 'serve') {
      await import('./cmd/inbox/serve.cmd.ts');
    } else if (process.argv[3] === 'stats') {
      await import('./cmd/inbox/stats-index.ts');
    } else if (process.argv[3] === 'eval') {
      await import('./cmd/inbox/eval.cmd.ts');
    } else {
      await import('./cmd/inbox/index.ts');
    }
    break;

  case 'inbox-context':
    await import('./cmd/inbox-context/index.ts');
    break;

  case 'inbox-review-plan':
    await import('./cmd/inbox-review-plan/index.ts');
    break;

  case 'inbox-eval':
    await import('./cmd/inbox-eval/index.ts');
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

  case 'sdd-state':
    await import('./cmd/sdd-state/index.ts');
    break;

  case 'sdd-check':
    await import('./cmd/sdd-check/index.ts');
    break;

  case 'sdd-extract':
    await import('./cmd/sdd-extract/index.ts');
    break;

  case 'sdd-verify':
    await import('./cmd/sdd-verify/index.ts');
    break;

  case 'sdd-log':
    await import('./cmd/sdd-log/index.ts');
    break;

  case 'sdd-sync':
    await import('./cmd/sdd-sync/index.ts');
    break;

  case 'sdd-task':
    await import('./cmd/sdd-task/index.ts');
    break;

  case 'sdd-migrate':
    await import('./cmd/sdd-migrate/index.ts');
    break;

  case 'mr-stats':
    await import('./cmd/mr-stats/index.ts');
    break;

  case 'yagni':
    await import('./cmd/yagni/index.ts');
    break;

  default:
    await import('./cmd/help/help.cmd.ts');
    process.exit(0);
}
