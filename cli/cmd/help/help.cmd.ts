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
console.info('  alt-opinion       Get alternative opinions from AI models with optional synthesis');
console.info(
  '  sync              Synchronize ai/directives/ from npm package into current project'
);
console.info('  sync-skills       Synchronize SDD skills from ai/skills/ to .claude/skills/');
console.info(
  '  agent-mon         Interactive terminal dashboard for monitoring active AI agent sessions'
);
console.info(
  '  orient            Navigate file headers and DBC contracts — project map, search, dependency graph'
);
console.info(
  '  agents-rules      Print usage instructions for AI agents (navigate public entities, DBC contracts, file headers)'
);
console.info('  run               Run a task via an AI agent engine (opencode)');
console.info(
  '  testcov           Visual test coverage tree (vitest/jest/node:test auto-detection)'
);
console.info('');
console.info('Examples:');
console.info('  npx gennady');
console.info('  npx gennady commit');
console.info('  npx gennady cat "./src/**/*.js" --output=md');
console.info('  npx gennady <command> --help  (per-command help)');
