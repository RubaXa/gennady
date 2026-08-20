// @file: sdd-orient command help output.
// @consumers: help command
// @tasks: N/A

/**
 * @purpose Print CLI help for the sdd-orient command.
 */
export function printHelp(): void {
  console.info(
    'gennady sdd-orient — Cheap depth-1 design-graph neighbourhood for one spec (navigates specs, not code)'
  );
  console.info('');
  console.info('Usage:');
  console.info(
    '  npx gennady sdd-orient <spec-path>     Neighbourhood of a specific module/scope spec'
  );
  console.info(
    '  npx gennady sdd-orient --scope <name>  Neighbourhood of a scope, resolved by portal name'
  );
  console.info('');
  console.info('Reports (names + IDs only, never full bodies — kept cheap to read):');
  console.info('  portal      — parent scope, its type, and its portal Scope-Graph dependencies');
  console.info(
    '  neighbours  — direct (depth-1) graph neighbours: sibling modules / cross-scope Scope'
  );
  console.info('                Reference for a module target, or all modules for a scope target');
  console.info('  потребители — names of modules/scopes that depend on the target (reverse edge)');
  console.info('');
  console.info('Not a code navigator — that is `gennady orient`. sdd-orient reads .spec.md design');
  console.info(
    'graphs (both v2 <!--SECTION--> and legacy numbered-heading specs); orient reads .ts files.'
  );
  console.info('');
  console.info('Exit codes:');
  console.info('  0 neighbourhood printed   4 bad invocation / target did not resolve');
}
