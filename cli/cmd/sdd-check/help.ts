// @file: sdd-check command help output.
// @consumers: help command
// @tasks: N/A

/**
 * @purpose Print CLI help for the sdd-check command.
 */
export function printHelp(): void {
  console.info(
    'gennady sdd-check — Mechanical audit of SDD artifacts (the deterministic half of audit)'
  );
  console.info('');
  console.info('Usage:');
  console.info('  npx gennady sdd-check --task <ticket>        # check one ticket');
  console.info(
    '  npx gennady sdd-check --all [project-root]   # check every ticket + spec under specs/'
  );
  console.info('');
  console.info('Mechanical checks (per ticket):');
  console.info('  - anchor balance · required sections (META, EXECUTION_LOG)');
  console.info('  - Task-ID present · Status parseable');
  console.info('  - fabricated DONE: a [x] line with an unreplaced <…> placeholder');
  console.info('  - DONE with an unresolved BLOCKED · DONE with leftover placeholders');
  console.info('  --all also: broken `](…spec.md)` links that do not resolve on disk');
  console.info('');
  console.info(
    '  Deferred to the audit agent (semantic): closed-world symbol-diff, BDD↔test mapping,'
  );
  console.info('  rules-cascade resolution, stale-after-pivot.');
  console.info('');
  console.info('Output: ESLint-style `file: severity: code  message` + summary.');
  console.info('Exit codes: 0 clean (warnings allowed)   1 error(s) found   4 bad invocation');
}
