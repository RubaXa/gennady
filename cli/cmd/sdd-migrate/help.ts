// @file: sdd-migrate command help output.
// @consumers: help command
// @tasks: N/A

/**
 * @purpose Print CLI help for the sdd-migrate command.
 */
export function printHelp(): void {
  console.info('gennady sdd-migrate — Migrate v1 SDD artifacts to v2 (deterministic steps)');
  console.info('');
  console.info('Usage:');
  console.info('  npx gennady sdd-migrate anchors <ticket>         # one v1 ticket (dry-run)');
  console.info(
    '  npx gennady sdd-migrate anchors --all [root]     # every tasks/**/*.task-*.md (dry-run)'
  );
  console.info('  npx gennady sdd-migrate anchors --all --write    # actually inject the anchors');
  console.info('');
  console.info('anchors mode:');
  console.info('  Wraps each canonical section of a v1 ticket (plain `## N.` headers) in');
  console.info('  <!--SECTION:NAME--> markers that the v2 tools require. Idempotent.');
  console.info('  Header → name: `## 1. Meta`→META, `### P1`→PHASE_P1, `## 4. …(BDD)`→BDD,');
  console.info('  `## 5. Verification`→VERIFICATION, `## 6. …Coverage`→TEST_COVERAGE,');
  console.info('  `## 7. Execution Log`→EXECUTION_LOG, `## 8. Decision Log`→DECISION_LOG.');
  console.info('');
  console.info('  Dry-run by default — reports what it would inject. Pass --write to apply.');
  console.info('  After --write, verify with: gennady sdd-check --all');
  console.info('');
  console.info('Exit codes: 0 report · 4 bad invocation');
}
