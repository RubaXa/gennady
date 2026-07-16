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
  console.info('  npx gennady sdd-migrate plan [root]              # migration layer (dry-run)');
  console.info('  npx gennady sdd-migrate plan [root] --write      # write migration/ plan files');
  console.info(
    '  npx gennady sdd-migrate plan [root] --verify     # verify the layer (exit 1 on findings)'
  );
  console.info('  npx gennady sdd-migrate ids [root] --map <tsv>   # Task-ID replace (dry-run)');
  console.info('  npx gennady sdd-migrate ids [root] --from-plan   # map derived from Ticket Maps');
  console.info(
    '  npx gennady sdd-migrate move [root] --scope <s>  # relocate tickets + indexes (dry-run)'
  );
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
  console.info('plan mode:');
  console.info('  Scans specs/ + tasks/ into migration units (one per spec) and scaffolds');
  console.info('  migration/<mirrored-path>/<spec>.migration.md: generated Inventory (facts),');
  console.info('  agent-filled Section Map / Ticket Map / Diagram Plan, per-unit step checklist,');
  console.info('  plus migration/README.md (global order + unit table). --verify re-scans and');
  console.info('  checks inventory drift, map coverage, action vocabulary, slug grammar and');
  console.info('  repo-wide slug collisions — the deterministic gate before any migration step.');
  console.info('');
  console.info('ids mode:');
  console.info('  Applies the approved Task-ID map (TSV `<old>\\t<new>` or --from-plan) across');
  console.info('  specs/tasks/cli/shared/services/ai/e2e — exact IDs on word boundaries only');
  console.info(
    '  (UTF-8 / partial matches never touched). After --write it gates on zero old IDs.'
  );
  console.info('');
  console.info('move mode:');
  console.info(
    "  Relocates one scope's tickets to their co-located destinations from the approved"
  );
  console.info('  Ticket Maps (git mv), scaffolds <module>.3-tasks.md + <scope>.3-tasks.md from');
  console.info('  ticket Meta, and removes the emptied tasks/<scope>/ — flipping the scope to v2.');
  console.info('');
  console.info(
    'Exit codes: 0 report · 1 verify findings / invalid map / blocked move · 4 bad invocation'
  );
}
