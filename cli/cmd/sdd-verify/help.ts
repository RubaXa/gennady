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
  console.info('  npx gennady sdd-verify --task <ticket-path> --phase <PhaseID>');
  console.info('  npx gennady sdd-verify --profile full');
  console.info('');
  console.info(
    '  The ticket phase determines profile, exact Target Files, and owning spec; no globs or guessing.'
  );
  console.info(
    '  Infra setup exemption requires this exact phase to own the missing gate through Bootstrap Requirements + Target Files.'
  );
  console.info(
    '  When readiness is provisional/not-ready, unreadable portal or GATE_QUEUE ownership fails closed.'
  );
  console.info(
    '  Target Files must exist; Deleted Files are exact absent paths with a tracked VCS baseline.'
  );
  console.info(
    '  Workspace snapshots intentionally exclude .git metadata and installed node_modules tool state; every other persistent file or directory is observed.'
  );
  console.info(
    '  Receipts bind the actually selected project scripts, forwarded npm/pnpm/yarn argv, and repo-local script inputs; supported run aliases and root-only options are expanded transitively. Quoted/escaped paths are one operand; malformed shell words, another package root, or unsupported local input stop with zero commands.'
  );
  console.info('  To check only specific files: npx gennady lint --spec=<module-spec> <paths>');
  console.info('');
  console.info(
    'Profiles (derived from phase kind + structured coverage owner; only full is direct):'
  );
  console.info('  setup → fix (optional) · type-check (optional) · test (optional)');
  console.info('  code  → fix · type-check · test');
  console.info(
    '  owner test → fix · type-check · test:coverage   (only Coverage Owner Phase produces; threshold is'
  );
  console.info('          the ticket §5 testcov row and audit’s job)');
  console.info('  other test / coverage N-A → fix · type-check · test  (still profile=test)');
  console.info(
    '  full  → type-check · test:coverage · lint · format · yagni          (read-only, no fix steps — a verdict must not mutate what'
  );
  console.info('          it is judging; group close / default)');
  console.info('');
  console.info('Phase ladder, in order:');
  console.info(
    '  1. fix — project format:fix + lint:fix prefixes over parsed phase Target Files; a runtime before/after boundary rejects'
  );
  console.info(
    '     any actual mutation outside their canonical set (changes are reported, never rolled back), then lint proves clean post-state.'
  );
  console.info(
    '     Installed local tools only (no download); failure stops before foundation. setup may skip while bootstrap creates scripts.'
  );
  console.info(
    '  2. type-check, then test/test:coverage once per attempt; only the declared owner runs the producer.'
  );
  console.info(
    '  3. §5 extras are read-only; any persistent workspace mutation fails and no receipt is written.'
  );
  console.info(
    '  The full dependency closure must exist, be acyclic and checked before mutation; receipt-aware tickets require current evidence throughout it, and any legacy receipt that exists is still validated.'
  );
  console.info(
    '  4. only complete success atomically writes a structured receipt through an exclusive random same-directory regular temp, bound to the phase plan, package-script graph and current Target File bytes; ticket path must keep the same regular-file identity.'
  );
  console.info(
    'Full is runtime-enforced read-only: only the test:coverage segment may write its narrow coverage artifact directory; every other project-content mutation is red.'
  );
  console.info('');
  console.info(
    'Only setup may skip an undeclared repair/foundation script with an honest ⏭ line —'
  );
  console.info('that is not an error.');
  console.info('');
  console.info('Output:');
  console.info(
    '  success → [sdd-verify] ✅ ALL PASS (N/M), then one line per step: ✅ check, 🔧 mutating, ⏭ skipped'
  );
  console.info(
    '             phase mode also reports the CLI-owned receipt written to Execution Log'
  );
  console.info(
    '  failure → only failed steps dump exit code + captured output; if the ladder stopped early,'
  );
  console.info('  the last line names where and why');
  console.info('');
  console.info(
    'Exit codes: 0 all ran steps pass · 1 a gate or resolved phase context failed · 4 bad invocation (missing/repeated value, path, unknown/conflicting flag)'
  );
  console.info('');
  console.info(
    'Code/test reject absent/vacuous repair leaves or foundation scripts with ⛔; full requires all read-only gates.'
  );
}
