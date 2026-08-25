// @file: fix command — run mutating fixers (plugin facet + config) in the real tree.
// @consumers: gennady.ts, fix/index.ts
// @tasks: TSK-96

/**
 * npx gennady fix                      run every planned fixer (changed scope)
 * npx gennady fix golang:generate      run one fixer addressably, repo-wide (stack:id or bare id)
 * npx gennady fix --all                widen the scope to the whole repository
 */

import path from 'node:path';
import { parseArgs } from '../../../shared/common/parse-args.ts';
import {
  BUILTIN_GATE_IDS,
  BUILTIN_STACK_PLUGINS,
  detectStacks,
} from '../../../services/stack/stack-registry.ts';
import {
  loadStackConfig,
  applyStackConfig,
  pluginConfigOf,
  unmatchedGateOverrides,
  type StackConfigError,
} from '../../../services/stack/stack-config.ts';
import { runFix, truncateOutput } from '../../../services/stack/gate-runner.ts';
import type { Gate, ScopeRequest } from '../../../services/stack/stack.types.ts';

/** Exit code: a fixer failed. */
const EXIT_FIX_FAILED = 1;
/** Exit code: bad invocation or invalid config. */
const EXIT_BAD_INVOCATION = 4;
/** Exit code: no stack plugin recognized the repository. */
const EXIT_NO_STACK = 5;

/**
 * @purpose Test whether a CLI fixer selector matches: `stack:id` exact, bare `id` any stack.
 * @param selector Selector from the positional arguments.
 * @param fixer Fixer to test.
 * @returns True on match.
 */
function selectorMatches(selector: string, fixer: Gate): boolean {
  return selector.includes(':') ? selector === `${fixer.stack}:${fixer.id}` : selector === fixer.id;
}

/**
 * @purpose Run the fix command end-to-end and return the process exit code.
 * @param argv Full process argv.
 * @returns Exit code: 0 all fixers passed · 1 a fixer failed · 4 bad invocation/config · 5 no stack.
 * @sideEffect Process: runs MUTATING commands in the working tree (that is the point of fix).
 */
export async function run(argv: string[]): Promise<number> {
  const args = parseArgs(argv, {
    all: ['all'],
    changed: ['changed'],
    plan: ['plan', 'dry-run'],
    root: { aliases: ['root'], takesValue: true },
    help: ['help', 'h'],
  });

  if (args.help === true) {
    const { printHelp } = await import('./help.ts');
    printHelp();
    return 0;
  }

  const root = path.resolve(typeof args.root === 'string' ? args.root : process.cwd());
  const positionals = args._ as string[];
  const requested = positionals.slice(positionals[0] === 'fix' ? 1 : 0);

  const configLoad = loadStackConfig(root, BUILTIN_GATE_IDS);
  if (configLoad.errors.length > 0) {
    console.error('[fix] CONFIG_ERROR: stack config is invalid — refusing to run');
    for (const error of configLoad.errors) {
      console.error(`  ${error.path}: ${error.message}`);
    }
    return EXIT_BAD_INVOCATION;
  }

  const active = detectStacks(root, configLoad.config);
  if (active.length === 0) {
    console.error(`[fix] NO_STACK_DETECTED: no stack plugin recognized ${root}`);
    console.error(
      `  known stacks: ${BUILTIN_STACK_PLUGINS.map((plugin) => `${plugin.id} (${plugin.marker})`).join(', ')}`
    );
    return EXIT_NO_STACK;
  }

  // Naming a fixer is an explicit request, so it is scope-independent: `verify` prints
  // `gennady fix <stack>:<id>` without the scope flags it happened to run under, and that hint
  // has to work as printed.
  const request: ScopeRequest = {
    mode: args.all === true || requested.length > 0 ? 'all' : 'changed',
    targets: [],
  };

  // #region START_FIXER_PLAN — the same plan verify builds; a fixer rides on its gate (§4.4)
  const fixers: Gate[] = [];
  const overrideErrors: StackConfigError[] = [];
  for (const { plugin, detection } of active) {
    const scope = plugin.verify.resolveScope(detection, request);
    const pluginConfig = pluginConfigOf(configLoad.config, plugin.id);
    const planned = plugin.verify.planGates(detection, scope, { pluginConfig });
    const configured = applyStackConfig(
      planned,
      pluginConfig,
      plugin.id,
      root,
      configLoad.provenance
    );
    // Reject an override naming no built-in gate here too — `fix` must not run a config `verify` refuses.
    overrideErrors.push(...unmatchedGateOverrides(configured, pluginConfig, plugin.id));
    for (const gate of configured) {
      if (gate.fixer === undefined) {
        continue;
      }
      // Inherits the gate's ENV_FAIL predicates (a missing generator is a broken env either way) but
      // NOT `outputMeansFailure`: a fixer that rewrites and exits 0 with output is success, not a finding.
      fixers.push({
        ...gate,
        argv: gate.fixer.argv,
        cwd: gate.fixer.cwd,
        env: gate.fixer.env ?? gate.env,
        timeoutMs: gate.fixer.timeoutMs,
        label: `${gate.label} → fix`,
        outputMeansFailure: false,
        driftMeansFailure: false,
      });
    }
  }

  if (overrideErrors.length > 0) {
    console.error('[fix] CONFIG_ERROR: stack config is invalid — refusing to run');
    for (const error of overrideErrors) {
      console.error(`  ${error.path}: ${error.message}`);
    }
    return EXIT_BAD_INVOCATION;
  }
  // #endregion END_FIXER_PLAN

  const unknown = requested.filter(
    (selector) => !fixers.some((fixer) => selectorMatches(selector, fixer))
  );
  if (unknown.length > 0) {
    console.error(
      `[fix] BAD_INVOCATION: unknown fixer(s): ${unknown.join(', ')}\n` +
        `  fixers available: ${fixers.map((fixer) => `${fixer.stack}:${fixer.id}`).join(', ') || '(none)'}`
    );
    return EXIT_BAD_INVOCATION;
  }

  const selected =
    requested.length > 0
      ? fixers
          .filter((fixer) => requested.some((selector) => selectorMatches(selector, fixer)))
          // An addressed fixer is an explicit request — a scope-derived skip does not apply.
          .map((fixer) =>
            fixer.skipped !== null && fixer.argv.length > 0 ? { ...fixer, skipped: null } : fixer
          )
      : fixers;

  if (selected.length === 0) {
    console.info('[fix] no fixers declared — nothing to do');
    return 0;
  }

  // `fix --plan`/`--dry-run` shows what WOULD run and mutates nothing — fixers execute in the
  // real tree, so a dry run must be honoured, not silently swallowed into a real mutation.
  if (args.plan === true) {
    console.info(`[fix] plan for ${root} (dry run — nothing is executed)`);
    for (const fixer of selected) {
      const name = `${fixer.stack}:${fixer.id}`;
      console.info(
        fixer.skipped !== null
          ? `  ⏭️  ${name.padEnd(20)} skip — ${fixer.skipped}`
          : `  ▶️  ${name.padEnd(20)} ${fixer.argv.join(' ')}  (cwd: ${fixer.cwd})`
      );
    }
    return 0;
  }

  const results = runFix(selected);
  let failed = false;
  for (const result of results) {
    const name = `${result.gate.stack}:${result.gate.id}`;
    if (result.status === 'skipped') {
      console.info(`[fix] ⏭️  ${name} — ${result.output}`);
    } else if (result.status === 'pass') {
      console.info(
        `[fix] ✅ ${name} (${Math.round(result.durationMs / 1000)}s) — review and commit the changes`
      );
    } else {
      failed = true;
      console.error(`[fix] ❌ ${result.status.toUpperCase().replace('-', '_')} ${name}`);
      console.error(`  command: ${result.gate.argv.join(' ')}`);
      console.error(`  exit:    ${result.exitCode ?? 'killed'}`);
      console.error(truncateOutput(result.output));
      console.error(
        '  fixer chain stopped — the tree may hold partial changes; review with git status'
      );
    }
  }
  return failed ? EXIT_FIX_FAILED : 0;
}
