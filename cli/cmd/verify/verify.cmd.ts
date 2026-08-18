// @file: verify command — stack-agnostic verification: detect stacks, plan gates, run, report.
// @consumers: gennady.ts, verify/index.ts
// @tasks: TSK-96

/**
 * npx gennady verify                       gates for changes vs the base branch, all detected stacks
 * npx gennady verify ./internal/foo        gates for explicit files or directories
 * npx gennady verify --all                 whole-repo gates
 * npx gennady verify --plan                show detection + plan + config provenance, run nothing
 * npx gennady verify --json                machine-readable detection + plan + results
 * npx gennady verify --only=golang:lint    run a subset (stack:gate, or bare gate = all stacks)
 * npx gennady verify --skip=test           drop gates from the plan
 * npx gennady verify --stack=golang        one-shot stack.use
 */

import path from 'node:path';
import { parseArgs } from '../../../shared/common/parse-args.ts';
import {
  BUILTIN_GATE_IDS,
  BUILTIN_STACK_PLUGINS,
  detectStacks,
} from '../../../services/stack/stack-registry.ts';
import {
  applyStackConfig,
  formatDuration,
  loadStackConfig,
  pluginConfigOf,
} from '../../../services/stack/stack-config.ts';
import { formatVerifyReport, runVerify } from '../../../services/stack/gate-runner.ts';
import type { Gate, ScopeRequest, StackRun } from '../../../services/stack/stack.types.ts';

/** Exit code: one or more gates failed. */
const EXIT_GATES_FAILED = 1;
/** Exit code: bad invocation or invalid config (FR-STACK-12) — no gate was executed. */
const EXIT_BAD_INVOCATION = 4;
/** Exit code: no stack plugin recognized the repository. */
const EXIT_NO_STACK = 5;

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
 * @purpose Test whether a CLI gate selector matches a gate: `stack:gate` exact, bare `gate` any stack.
 * @param selector Selector from --only/--skip.
 * @param gate Gate to test.
 * @returns True on match.
 */
function selectorMatches(selector: string, gate: Gate): boolean {
  return selector.includes(':') ? selector === `${gate.stack}:${gate.id}` : selector === gate.id;
}

/**
 * @purpose Run the verify command end-to-end and return the process exit code.
 * @param argv Full process argv.
 * @returns Exit code: 0 pass · 1 gate failed · 4 bad invocation/config · 5 no stack.
 * @sideEffect Process: executes verification gates; IO: reads config files; Logs: report to stdout/stderr.
 */
export async function run(argv: string[]): Promise<number> {
  const args = parseArgs(argv, {
    all: ['all'],
    changed: ['changed'],
    plan: ['plan', 'dry-run'],
    json: ['json'],
    only: { aliases: ['only'], takesValue: true },
    skip: { aliases: ['skip'], takesValue: true },
    stack: { aliases: ['stack'], takesValue: true },
    root: { aliases: ['root'], takesValue: true },
    help: ['help', 'h'],
  });

  if (args.help === true) {
    const { printHelp } = await import('./help.ts');
    printHelp();
    return 0;
  }

  const only = parseList(args.only);
  const skip = parseList(args.skip);
  const root = path.resolve(typeof args.root === 'string' ? args.root : process.cwd());
  const positional = (args._ as string[]).filter((arg) => arg !== 'verify');

  // #region START_CONFIG — strict: any config error stops the command before any gate (FR-STACK-12)
  const configLoad = loadStackConfig(root, BUILTIN_GATE_IDS);
  if (configLoad.errors.length > 0) {
    console.error(
      `[verify] CONFIG_ERROR: stack config is invalid — refusing to run (${configLoad.sources.join(', ') || 'config files'})`
    );
    for (const error of configLoad.errors) {
      console.error(`  ${error.path}: ${error.message}`);
    }
    return EXIT_BAD_INVOCATION;
  }

  const cliStackFilter = parseList(args.stack);
  if (cliStackFilter.some((id) => !BUILTIN_STACK_PLUGINS.some((plugin) => plugin.id === id))) {
    console.error(
      `[verify] BAD_INVOCATION: --stack names unknown plugin(s): ${cliStackFilter.join(', ')}\n` +
        `  known stacks: ${BUILTIN_STACK_PLUGINS.map((plugin) => plugin.id).join(', ')}`
    );
    return EXIT_BAD_INVOCATION;
  }

  // --stack acts as a one-shot stack.use (config.spec §3.5).
  const effectiveConfig =
    cliStackFilter.length > 0
      ? { ...(configLoad.config ?? {}), use: cliStackFilter }
      : configLoad.config;
  // #endregion END_CONFIG

  const active = detectStacks(root, effectiveConfig);
  const diagnostics = active.flatMap((entry) => entry.detection.diagnostics);

  if (active.length === 0) {
    console.error(`[verify] NO_STACK_DETECTED: no stack plugin recognized ${root}`);
    console.error(`  known stacks: node (package.json), golang (go.mod)`);
    console.error(
      '  fix: run from a project root, pass --root=<path>, or declare stack.use in gennady.yaml'
    );
    return EXIT_NO_STACK;
  }

  const request: ScopeRequest = {
    mode: positional.length > 0 ? 'files' : args.all === true ? 'all' : 'changed',
    targets: positional,
  };

  // #region START_PLAN — plugin plans built-ins, config overrides/extends, CLI only/skip filters last
  const runs: StackRun[] = active.map(({ plugin, detection }) => {
    const scope = plugin.verify.resolveScope(detection, request);
    const pluginConfig = pluginConfigOf(effectiveConfig, plugin.id);
    const planned = plugin.verify.planGates(detection, scope, { pluginConfig });
    const gates = applyStackConfig(planned, pluginConfig, plugin.id, root, configLoad.provenance);
    return { detection, scope, gates };
  });

  const allGates = runs.flatMap((run) => run.gates);
  const unknown = [...only, ...skip].filter(
    (selector) => !allGates.some((gate) => selectorMatches(selector, gate))
  );
  if (unknown.length > 0) {
    console.error(
      `[verify] BAD_INVOCATION: --only/--skip name unknown gate(s): ${unknown.join(', ')}\n` +
        `  gates in this plan: ${allGates.map((gate) => `${gate.stack}:${gate.id}`).join(', ')}`
    );
    return EXIT_BAD_INVOCATION;
  }

  const filteredRuns: StackRun[] = runs.map((run) => ({
    ...run,
    gates: run.gates
      .filter(
        (gate) => only.length === 0 || only.some((selector) => selectorMatches(selector, gate))
      )
      .map((gate) =>
        skip.some((selector) => selectorMatches(selector, gate))
          ? { ...gate, argv: [], skipped: '--skip' }
          : gate
      ),
  }));
  // #endregion END_PLAN

  if (args.plan === true) {
    if (args.json === true) {
      console.log(
        JSON.stringify(
          {
            root,
            config: {
              sources: configLoad.sources,
              provenance: Object.fromEntries(configLoad.provenance),
            },
            diagnostics,
            runs: filteredRuns,
          },
          null,
          2
        )
      );
      return 0;
    }

    console.info(
      `[verify] plan for ${root} (stacks: ${filteredRuns.map((run) => run.detection.stack).join(', ')})`
    );
    if (configLoad.sources.length > 0) {
      console.info(
        `  config:    ${configLoad.sources.join(' + ')} (per-key winner in gate labels)`
      );
    }
    for (const stackRun of filteredRuns) {
      for (const line of stackRun.detection.summary) {
        console.info(`  ${line}`);
      }
      console.info(`  scope:     ${stackRun.scope.mode} — ${stackRun.scope.note}`);
    }
    for (const diagnostic of diagnostics) {
      console.info('');
      console.info(`  ⚠️  ${diagnostic.code}: ${diagnostic.message}`);
      console.info(`      fix: ${diagnostic.fix}`);
    }
    console.info('');
    for (const stackRun of filteredRuns) {
      for (const gate of stackRun.gates) {
        const name = `${gate.stack}:${gate.id}`;
        // Per-key config provenance: applyStackConfig stamps the winner file into the label.
        const provenanceNote = /\((overridden by [^)]+|from [^)]+)\)$/.exec(gate.label)?.[0] ?? '';
        console.info(
          gate.skipped !== null
            ? `  ⏭️  ${name.padEnd(16)} skip — ${gate.skipped}`
            : `  ▶️  ${name.padEnd(16)} [${formatDuration(gate.timeoutMs)}] ${gate.argv.join(' ')}${provenanceNote.length > 0 ? `  ${provenanceNote}` : ''}`
        );
      }
    }
    return 0;
  }

  const report = runVerify(filteredRuns, diagnostics);

  if (args.json === true) {
    console.log(
      JSON.stringify(
        {
          ok: report.ok,
          passed: report.passed,
          total: report.total,
          config: { sources: configLoad.sources },
          diagnostics: report.diagnostics,
          runs: report.runs.map((run) => ({
            stack: run.detection.stack,
            summary: run.detection.summary,
            scope: { mode: run.scope.mode, note: run.scope.note },
          })),
          results: report.results.map((result) => ({
            stack: result.gate.stack,
            id: result.gate.id,
            command: result.gate.argv.join(' '),
            timeoutMs: result.gate.timeoutMs,
            status: result.status,
            exitCode: result.exitCode,
            durationMs: result.durationMs,
            output: result.output,
          })),
        },
        null,
        2
      )
    );
    return report.ok ? 0 : EXIT_GATES_FAILED;
  }

  console.log(formatVerifyReport(report));
  return report.ok ? 0 : EXIT_GATES_FAILED;
}
