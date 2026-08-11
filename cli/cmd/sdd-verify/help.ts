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
  console.info('Profiles (fixed gate sets, chosen by explicit flag — no detection):');
  console.info(
    '  code  → format · lint · typecheck · yagni            (code phases; no tests yet)'
  );
  console.info('  test  → format · typecheck · test:coverage           (test phase)');
  console.info('  full  → format · lint · typecheck · test:coverage · yagni  (final / default)');
  console.info('');
  console.info('Order is normative (mutating gates first so autofix never races a reader).');
  console.info('');
  console.info('Output:');
  console.info('  success → [verify] ✅ ALL PASS (N/N), then ✅ <gate> (<duration>) per gate');
  console.info(
    '  failure → only failed gates dump exit code + captured output; passed gates stay ✅'
  );
  console.info('');
  console.info('Exit codes: 0 all gates pass · 1 a gate failed');
  console.info('');
  console.info(
    'Required scripts are verified by gennady sdd-state (readiness); sdd-verify assumes they exist.'
  );
}
