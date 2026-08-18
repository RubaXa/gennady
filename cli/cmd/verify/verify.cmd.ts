// @file: verify command — run the repo's declared verification gates from gennady.yaml.
// @consumers: gennady.ts, verify/index.ts
// @tasks: SPIKE-yaml-verify

/**
 * npx gennady verify                 run every gate declared in gennady.yaml
 * npx gennady verify --plan          print the plan, run nothing
 * npx gennady verify --only=lint     run a subset
 * npx gennady verify --skip=test     drop gates from the plan
 * npx gennady verify --json          machine-readable plan + results
 */

import path from 'node:path';
import { parseArgs } from '../../../shared/common/parse-args.ts';
import { loadVerifyConfig, type VerifyGate } from './verify-config.logic.ts';
import { formatVerifyReport, runVerify } from './gate-runner.logic.ts';

/** Exit code: one or more gates failed. */
const EXIT_GATES_FAILED = 1;
/** Exit code: bad invocation or invalid config — no gate was executed. */
const EXIT_BAD_INVOCATION = 4;
/** Exit code: no verify config, or the plan executed zero gates — nothing was verified. */
const EXIT_NOTHING_VERIFIED = 5;

/**
 * @purpose Parse a comma-separated list option into trimmed entries.
 * @param raw Raw option value, or undefined when the flag was absent.
 * @returns Entries, empty when the flag was absent.
 */
function parseList(raw: unknown): string[] {
  if (typeof raw !== 'string' || raw.length === 0) {
    return [];
  }
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * @purpose Run the verify command end-to-end and return the process exit code.
 * @param argv Full process argv.
 * @returns Exit: 0 pass · 1 gate failed · 4 bad invocation/config · 5 nothing verified.
 * @sideEffect Process: executes gates; IO: reads gennady.yaml; Logs: report to stdout/stderr.
 */
export async function run(argv: string[]): Promise<number> {
  const args = parseArgs(argv, {
    plan: ['plan', 'dry-run'],
    json: ['json'],
    only: { aliases: ['only'], takesValue: true },
    skip: { aliases: ['skip'], takesValue: true },
    root: { aliases: ['root'], takesValue: true },
    help: ['help', 'h'],
  });

  if (args.help === true) {
    const { printHelp } = await import('./help.ts');
    printHelp();
    return 0;
  }

  const root = path.resolve(typeof args.root === 'string' ? args.root : process.cwd());
  const only = parseList(args.only);
  const skip = parseList(args.skip);

  // #region START_CONFIG — strict: any config error stops the command before any gate
  const load = loadVerifyConfig(root);
  if (load.errors.length > 0) {
    console.error(
      `[verify] CONFIG_ERROR: ${load.source ?? 'gennady.yaml'} is invalid — refusing to run`
    );
    for (const error of load.errors) {
      console.error(`  ${error.path}: ${error.message}`);
    }
    return EXIT_BAD_INVOCATION;
  }
  if (load.gates === null) {
    console.error(`[verify] NO_VERIFY_CONFIG: ${root} declares no gates`);
    console.error('  fix: add to gennady.yaml:');
    console.error('    verify:');
    console.error('      gates:');
    console.error('        - { id: test, argv: [npm, test], timeout: 10m }');
    return EXIT_NOTHING_VERIFIED;
  }
  // #endregion END_CONFIG

  const known = new Set(load.gates.map((gate) => gate.id));
  const unknown = [...only, ...skip].filter((id) => !known.has(id));
  if (unknown.length > 0) {
    console.error(
      `[verify] BAD_INVOCATION: --only/--skip name unknown gate(s): ${unknown.join(', ')}\n` +
        `  gates in this config: ${[...known].join(', ')}`
    );
    return EXIT_BAD_INVOCATION;
  }

  const planned: VerifyGate[] = load.gates
    .filter((gate) => only.length === 0 || only.includes(gate.id))
    .map((gate) => (skip.includes(gate.id) ? { ...gate, argv: [] } : gate));

  if (args.plan === true) {
    if (args.json === true) {
      console.log(JSON.stringify({ root, source: load.source, gates: planned }, null, 2));
      return 0;
    }
    console.info(`[verify] plan for ${root} (${load.source})`);
    for (const gate of planned) {
      console.info(
        gate.argv.length === 0
          ? `  ⏭️  ${gate.id.padEnd(16)} skip — --skip`
          : `  ▶️  ${gate.id.padEnd(16)} [${Math.round(gate.timeoutMs / 60_000)}m] ${gate.argv.join(' ')}`
      );
    }
    return 0;
  }

  const report = runVerify(planned);

  if (args.json === true) {
    console.log(
      JSON.stringify(
        {
          ok: report.ok,
          passed: report.passed,
          total: report.total,
          results: report.results.map((result) => ({
            id: result.gate.id,
            command: result.gate.argv.join(' '),
            status: result.status,
            exitCode: result.exitCode,
            durationMs: result.durationMs,
          })),
        },
        null,
        2
      )
    );
  } else {
    console.log(formatVerifyReport(report));
  }

  if (report.total === 0) {
    return EXIT_NOTHING_VERIFIED;
  }
  return report.ok ? 0 : EXIT_GATES_FAILED;
}
