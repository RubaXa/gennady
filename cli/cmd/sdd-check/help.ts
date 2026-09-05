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
    '  npx gennady sdd-check --spec <created-spec-path> --authoring [--format json]  # structural draft receipt + trivial auto-fix; hints never block'
  );
  console.info(
    '  npx gennady sdd-check --task <created-ticket-path> --authoring  # pre-index ticket-only authoring gate'
  );
  console.info(
    '  npx gennady sdd-check --task <created-ticket-path> --authoring --phase P1  # incremental one-phase authoring feedback'
  );
  console.info(
    '  npx gennady sdd-check --all [project-root]   # check every ticket + spec under specs/'
  );
  console.info(
    '  npx gennady sdd-check --changed [project-root]  # check @tasks/@consumers headers of changed files'
  );
  console.info('  Choose exactly one mode: --task, --spec, --all, or --changed.');
  console.info('');
  console.info('Mechanical checks (per ticket):');
  console.info(
    '  --authoring: exact path returned by sdd-new; full ticket structure/owner/phase/BDD feedback before the next ticket; max 12 shown; no receipts, coverage execution, siblings, trackers, or global scan'
  );
  console.info(
    '  --spec --authoring: validates skeleton sections/headings/markers/lists/REQ IDs; auto-fixes only trivial whitespace and indentation; content gaps remain warn-only'
  );
  console.info(
    '  --format json: machine-readable findings with code, file, section, reason, next step, and example; filter directly without a shell pipe'
  );
  console.info(
    '  --authoring --phase P<N>: only that phase plus overview dependency/Inputs, exact existing-READ/future-CREATE Target Files, and readable direct+transitive Rules closure; full --authoring is still required before moving on'
  );
  console.info('  - anchor balance · required sections (META, EXECUTION_LOG)');
  console.info('  - Task-ID present · Status parseable');
  console.info('  - fabricated DONE: a [x] line with an unreplaced <…> placeholder');
  console.info('  - DONE with an unresolved BLOCKED · DONE with leftover placeholders');
  console.info('  - RULES_CASCADE_CLOSURE: each phase Rules: list is the full <DependsOn> closure');
  console.info(
    '    every direct/transitive rule is exact repo-local regular non-symlink evidence: unsafe, missing, special, or unreadable paths fail closed before content is trusted'
  );
  console.info(
    '  - BDD_COVERAGE: Test Scenario Coverage canonical case names exist in the test file'
  );
  console.info(
    '  - BDD_NEGATIVE: every v2 ticket has at least one explicit negative/failure scenario'
  );
  console.info(
    '  - BDD_TRACE: each scenario Requirement-ID appears in its coverage case and the real it()/test() name once that file exists'
  );
  console.info(
    '  - COVERAGE_POLICY: required binds one test owner phase to one Role=coverage reader; N-A has a reason and forbids both'
  );
  console.info(
    '  - PHASE_RECEIPT: every checked schema-aware phase has complete current CLI evidence for its plan, commands, and Target Files'
  );
  console.info('  --all also: broken `](…spec.md)` links that do not resolve on disk');
  console.info(
    '  --changed: TASKS_APPEND_ONLY (@tasks: header never drops an id present at HEAD) ·'
  );
  console.info(
    '             CONSUMERS_RESOLVABLE (@consumers: identifiers resolve elsewhere in the repo, warn-only)'
  );
  console.info(
    '             unborn HEAD checks untracked sources; corrupt/unavailable git fails with preserved status/stderr (never empty-clean)'
  );
  console.info(
    '  --task/--all/--changed: unreadable or symlinked selected files/roots/in-scope SDD evidence fail closed with exact path/reason (ERR_CLI_SDD_CHECK_READ_FAILED)'
  );
  console.info('');
  console.info(
    '  Deferred to the audit agent (semantic): closed-world symbol-diff, runtime backing,'
  );
  console.info('  insight backflow, stale-after-pivot, language quality (comprehension layer).');
  console.info('');
  console.info('Output: ESLint-style finding lines + summary.');
  console.info('  --format json: `gennady.sdd-check.findings.v1` object on stdout.');
  console.info(
    '  --authoring: `repo-relative-file:line: severity: stable-code  [SECTION] Fix: …`.'
  );
  console.info('Exit codes: 0 clean (warnings allowed)   1 error(s) found   4 bad invocation');
}
