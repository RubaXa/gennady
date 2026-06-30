// @file: sdd-extract command help output.
// @consumers: help command
// @tasks: N/A

/**
 * @purpose Print CLI help for the sdd-extract command.
 */
export function printHelp(): void {
  console.info('gennady sdd-extract — Slice one <!--SECTION:NAME--> block out of an SDD artifact');
  console.info('');
  console.info('Usage:');
  console.info('  npx gennady sdd-extract <file> <NAME>');
  console.info('');
  console.info('Arguments:');
  console.info('  <file>   Path to the SDD ticket / spec markdown file.');
  console.info('  <NAME>   Section anchor name, matching /^[A-Z][A-Z0-9_]*$/.');
  console.info('');
  console.info('Canonical section names:');
  console.info('  META  PHASES_OVERVIEW  PHASE_P<N>  PHASE_P<N>_FIX');
  console.info('  BDD  VERIFICATION  TEST_COVERAGE  EXECUTION_LOG');
  console.info('');
  console.info('Output:');
  console.info('  On success — the section body (between the markers) on stdout, exit 0.');
  console.info(
    '  On failure — an actionable diagnostic on stdout, never empty, with a non-zero exit:'
  );
  console.info('    1 file not found / unreadable   2 anchor absent / empty');
  console.info('    3 markers unbalanced / duplicated   4 bad invocation / invalid name');
  console.info('');
  console.info('Examples:');
  console.info('  npx gennady sdd-extract specs/cli/lint/lint.task-foo.md META');
  console.info('  npx gennady sdd-extract specs/cli/lint/lint.task-foo.md PHASE_P1');
}
