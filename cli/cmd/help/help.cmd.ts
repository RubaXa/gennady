console.info('Gennady CLI');
console.info('');
console.info('Usage:');
console.info('  npx gennady [command] [options]');
console.info('');
console.info('Commands:');
console.info('  commit            Generate commit message from staged changes');
console.info('  review            Review staged changes for critical issues');
console.info('  cat               Display file contents as XML or Markdown');
console.info('  agent             Run AI agent request');
console.info('  vcs-reply         Post replies to GitLab MR discussions from stdin');
console.info('  review-verify     Build verification prompt from open GitLab MR or GitHub PR');
console.info(
  '  review-issues     Build XML issues artifact from GitLab MR or GitHub PR discussions'
);
console.info(
  '  resolve-conflicts Build confidence-aware merge-conflict resolution prompt from active git merge'
);
console.info('');
console.info('Examples:');
console.info('  npx gennady');
console.info('  npx gennady commit');
console.info('  npx gennady review --branch=develop');
console.info('  npx gennady cat "./src/**/*.js" --output=md');
