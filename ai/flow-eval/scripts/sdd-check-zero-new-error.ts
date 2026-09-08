// @file: CI-only zero-new-error gate (GAP-B-1). Runs `sdd-check --all . --format json` against the
//   RC's own built binary, compares error-severity findings against the versioned baseline by
//   (code, file), and fails ONLY when a genuinely new error appears. Warnings — known or new — never
//   fail this gate; sdd-check's own exit code (1 whenever ANY error exists, baseline or not) is
//   deliberately not propagated as-is.
// @consumers: package.json "gate:sdd-check-baseline", run by the pre-push gate (D-54) — see
//   ai/flow-eval/.baseline/README.md: wiring this into the pre-commit-invoked `npm run check` would
//   make every commit pay sdd-check's --all wall-clock cost, which D-38/GAP-B-1 explicitly avoids)
// @tasks: N/A

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  toBaselineFindings,
  zeroNewErrorVerdict,
  type BaselineFinding,
  type SddCheckBaseline,
} from './sdd-check-baseline-compare.ts';
import { runSddCheckJson } from './run-sdd-check-json.ts';

const PROJECT_ROOT = resolve(import.meta.dirname, '../../..');

type CliArgs = { baseline: string; root: string };

/** @purpose Minimal, dependency-free flag parsing for this one-purpose CLI: --baseline (required), --root (optional). */
function parseCliArgs(argv: readonly string[]): CliArgs {
  let baseline: string | undefined;
  let root = '.';
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--baseline') baseline = argv[++i];
    else if (arg.startsWith('--baseline=')) baseline = arg.slice('--baseline='.length);
    else if (arg === '--root') root = argv[++i];
    else if (arg.startsWith('--root=')) root = arg.slice('--root='.length);
    else {
      console.error(`[sdd-check-zero-new-error] unknown argument: ${arg}`);
      process.exit(4);
    }
  }
  if (!baseline) {
    console.error(
      '[sdd-check-zero-new-error] usage: node --import tsx ai/flow-eval/scripts/sdd-check-zero-new-error.ts --baseline <path> [--root <dir>]'
    );
    process.exit(4);
  }
  return { baseline, root };
}

/** @purpose Load and shape-check the versioned baseline; fails closed on anything unexpected. */
function loadBaseline(path: string): SddCheckBaseline {
  const abs = resolve(PROJECT_ROOT, path);
  if (!existsSync(abs)) {
    console.error(`[sdd-check-zero-new-error] baseline not found: ${abs}`);
    process.exit(1);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(abs, 'utf8'));
  } catch (cause) {
    console.error(`[sdd-check-zero-new-error] baseline is not valid JSON: ${abs}`, cause);
    process.exit(1);
  }
  const baseline = parsed as Partial<SddCheckBaseline>;
  if (baseline.schema !== 'gennady.sdd-check.baseline.v1' || !Array.isArray(baseline.findings)) {
    console.error(
      `[sdd-check-zero-new-error] baseline at ${abs} does not match schema gennady.sdd-check.baseline.v1`
    );
    process.exit(1);
  }
  return baseline as SddCheckBaseline;
}

function main(): void {
  const args = parseCliArgs(process.argv.slice(2));
  const baseline = loadBaseline(args.baseline);
  const result = runSddCheckJson(PROJECT_ROOT, args.root);
  if (!result.ok) {
    console.error(`[sdd-check-zero-new-error] ${result.reason}`);
    process.exit(1);
  }
  const fresh: readonly BaselineFinding[] = toBaselineFindings(result.payload.findings);
  const verdict = zeroNewErrorVerdict(baseline, fresh);

  if (verdict.ok) {
    console.log(
      `[sdd-check-zero-new-error] OK — no error outside the baseline (baseline commit ${baseline.commit}${
        baseline.tag ? `, tag ${baseline.tag}` : ''
      }).`
    );
    process.exit(0);
  }

  console.error(
    `[sdd-check-zero-new-error] FAIL — ${verdict.newErrors.length} error(s) not present in the baseline (${args.baseline}):`
  );
  for (const e of verdict.newErrors) console.error(`  NEW ERROR: ${e.code}  ${e.file}`);
  console.error(
    'Fix the regression, or if this error is a deliberate, reviewed baseline change, ask the operator for a rebaseline (D-38) — do not edit the baseline yourself.'
  );
  process.exit(1);
}

main();
