// @file: sdd-verify command help output.
// @consumers: help command
// @tasks: N/A

/**
 * @purpose Print CLI help for the sdd-verify command.
 */
export function printHelp(): void {
  console.info(
    'gennady sdd-verify — Run the project verification ladder (cheapest & most important first)'
  );
  console.info('');
  console.info('Usage:');
  console.info('  npx gennady sdd-verify [--profile <setup|code|test|full>]');
  console.info('');
  console.info(
    '  Always checks the WHOLE project — no path arguments, no flag besides --profile. An extra'
  );
  console.info(
    '  positional argument or an unrecognized flag is a hard error, never a silently narrower run.'
  );
  console.info('  To check only specific files: npx gennady lint --spec=<module-spec> <paths>');
  console.info('');
  console.info('Profiles (fixed ladders, chosen by explicit flag — no detection):');
  console.info('  setup → type-check · test · format:fix · lint:fix · lint · format');
  console.info(
    '  code  → type-check · test · format:fix · lint:fix · lint · format   (same ladder as setup)'
  );
  console.info(
    '  test  → type-check · test:coverage · format:fix · format            (coverage measured, threshold not checked here — that is'
  );
  console.info('          audit’s job)');
  console.info(
    '  full  → type-check · test:coverage · lint · format · yagni          (read-only, no fix steps — a verdict must not mutate what'
  );
  console.info('          it is judging; group close / default)');
  console.info('');
  console.info('The ladder, in order:');
  console.info(
    '  1. type-check, then test/test:coverage — the foundation. A failure here STOPS the ladder;'
  );
  console.info(
    '     nothing later runs (no point polishing code that does not build or breaks tests).'
  );
  console.info(
    '  2. format:fix, then lint:fix — mutating repair rungs. A nonzero exit is recorded as a'
  );
  console.info('     finding, never halts the ladder.');
  console.info('  3. lint, then format — read-only quality checks. Both run; failures accumulate.');
  console.info(
    '  4. yagni (full only) — a spec-level diff gate, run once per group close, never per phase.'
  );
  console.info('');
  console.info(
    'A step whose npm script is not declared in package.json is skipped with an honest ⏭ line —'
  );
  console.info('that is not an error.');
  console.info('');
  console.info('Output:');
  console.info(
    '  success → [sdd-verify] ✅ ALL PASS (N/M), then one line per step: ✅ check, 🔧 mutating, ⏭ skipped'
  );
  console.info(
    '  failure → only failed steps dump exit code + captured output; if the ladder stopped early,'
  );
  console.info('  the last line names where and why');
  console.info('');
  console.info(
    'Exit codes: 0 all ran steps pass · 1 a step failed · 4 bad invocation (path/unknown flag)'
  );
  console.info('');
  console.info(
    'Required scripts are verified by gennady sdd-state (readiness); sdd-verify assumes they exist, and skips honestly when they do not.'
  );
}
