// @file: sdd-verify command help output.
// @consumers: help command
// @tasks: N/A

/**
 * @purpose Print CLI help for the sdd-verify command.
 */
export function printHelp(): void {
  console.info('gennady sdd-verify — Run the project verification gates (strict, exact scripts)');
  console.info('');
  console.info('Usage:');
  console.info('  npx gennady sdd-verify [--profile <code|test|full>]');
  console.info('');
  console.info(
    '  Always checks the WHOLE project — no path arguments, no flag besides --profile. An extra'
  );
  console.info(
    '  positional argument or an unrecognized flag is a hard error, never a silently narrower run.'
  );
  console.info('  To check only specific files: npx gennady lint --spec=<module-spec> <paths>');
  console.info('');
  console.info('Profiles (fixed gate sets, chosen by explicit flag — no detection):');
  console.info(
    '  code  → format · lint · type-check · yagni            (code phases; no tests yet)'
  );
  console.info('  test  → format · type-check · test:coverage           (test phase)');
  console.info('  full  → format · lint · type-check · test:coverage · yagni  (final / default)');
  console.info('');
  console.info('Order is normative (mutating gates first so autofix never races a reader).');
  console.info('');
  console.info('Output:');
  console.info('  success → [sdd-verify] ✅ ALL PASS (N/N), then ✅ <gate> (<duration>) per gate');
  console.info(
    '  failure → only failed gates dump exit code + captured output; passed gates stay ✅'
  );
  console.info('');
  console.info(
    'Exit codes: 0 all gates pass · 1 a gate failed · 4 bad invocation (path/unknown flag)'
  );
  console.info('');
  console.info(
    'Required scripts are verified by gennady sdd-state (readiness); sdd-verify assumes they exist.'
  );
}
