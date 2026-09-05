// @file: CLI command: help
// @consumers: N/A
// @tasks: TSK-45, TSK-55, TSK-57, TSK-59, TSK-65, TSK-85

console.info('Gennady CLI');
console.info('');
console.info('Usage:');
console.info('  npx gennady [command] [options]');
console.info('');
console.info('Commands:');
console.info('  commit            Generate commit message from staged changes');
console.info('  cat               Display file contents as XML or Markdown');
console.info('  review            Review staged changes using AI models');
console.info('  vcs-reply         Post replies to GitLab MR discussions from stdin');
console.info('  inbox             List actionable GitLab merge requests with delta tracking');
console.info('  inbox-context     Gather full MR context (worktree, changeset, threads) as JSON');
console.info('  vcs-worktree      Prepare a read-only git worktree for MR review');
console.info('  vcs-approve       Approve GitLab merge request via API');
console.info('  review-verify     Build verification prompt from open GitLab MR or GitHub PR');
console.info(
  '  review-issues     Build XML issues artifact from GitLab MR or GitHub PR discussions'
);
console.info(
  '  resolve-conflicts Build confidence-aware merge-conflict resolution prompt from active git merge'
);
console.info('  remote-console    Mirror browser console output into local stdout');
console.info(
  '  lint              Validate .ts files: headers, anchors, DBC contracts, invariants, disables'
);
console.info(
  '  sync              Synchronize ai/directives/ from npm package into current project'
);
console.info(
  '  sync-skills       Synchronize ai/directives/ (in full), then SDD skills from ai/skills/ to .claude/skills/'
);
console.info(
  '  agent-mon         Interactive terminal dashboard for monitoring active AI agent sessions'
);
console.info(
  '  orient            Navigate file headers and DBC contracts — project map, search, dependency graph'
);
console.info('  sdd-orient        Show one spec or scope neighbourhood in the SDD graph');
console.info('  sdd-state         Report deterministic project SDD state and readiness');
console.info('  sdd-check         Run mechanical integrity checks over SDD artifacts');
console.info('  sdd-extract       Extract one anchored section from an SDD artifact');
console.info('  sdd-new           Scaffold one SDD v2 artifact');
console.info('  sdd-verify        Run the ticket or profile verification ladder');
console.info('  sdd-log           Append an event or atomically complete a verified ticket phase');
console.info('  sdd-sync          Propagate ticket status into task trackers');
console.info('  sdd-task          Show the execution map or one ticket phase context');
console.info('  sdd-migrate       Run deterministic SDD v1-to-v2 migration steps');
console.info(
  '  agents-rules      Print usage instructions for AI agents (navigate public entities, DBC contracts, file headers)'
);
console.info('  run               Run a task via an AI agent engine (opencode)');
console.info(
  '  testcov           Visual test coverage tree (vitest/jest/node:test auto-detection)'
);
console.info(
  '  yagni             Flag added/changed symbols with fewer than 2 production-code usages'
);
console.info('');
console.info('Examples:');
console.info('  npx gennady');
console.info('  npx gennady commit');
console.info('  npx gennady cat "./src/**/*.js" --output=md');
console.info('  npx gennady <command> --help  (per-command help)');
