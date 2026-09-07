// @file: One-shot generator for the versioned sdd-check baseline artifact (D-38/GAP-B-1). Runs
//   `sdd-check --all --format json` against the RC's own built binary and writes a deterministic,
//   sorted, deduplicated baseline to disk. NOT wired into any npm script — rebuilding the baseline is
//   an explicit, separate, operator-approved action (D-38: "самовольная пересборка запрещена"), never
//   a side effect of routine tooling.
// @consumers: operator-invoked only (see ai/flow-eval/.baseline/README.md)
// @tasks: N/A

import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import {
  countsByCode,
  dedupeSortFindings,
  toBaselineFindings,
  type SddCheckBaseline,
} from './sdd-check-baseline-compare.ts';
import { runSddCheckJson } from './run-sdd-check-json.ts';

const PROJECT_ROOT = resolve(import.meta.dirname, '../../..');

type CliArgs = { commit: string; tag: string | null; out: string; root: string };

function parseCliArgs(argv: readonly string[]): CliArgs {
  let commit: string | undefined;
  let tag: string | null = null;
  let out: string | undefined;
  let root = '.';
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--commit') commit = argv[++i];
    else if (arg === '--tag') tag = argv[++i];
    else if (arg === '--out') out = argv[++i];
    else if (arg === '--root') root = argv[++i];
    else {
      console.error(`[generate-sdd-check-baseline] unknown argument: ${arg}`);
      process.exit(4);
    }
  }
  if (!commit || !out) {
    console.error(
      '[generate-sdd-check-baseline] usage: node --import tsx ai/flow-eval/scripts/generate-sdd-check-baseline.ts --commit <sha> --out <path> [--tag <tag>] [--root <dir>]'
    );
    process.exit(4);
  }
  return { commit, tag, out, root };
}

/** @purpose Refuse a silent rebuild against the wrong tree — the baseline commit must be HEAD's exact SHA (D-38). */
function assertHeadMatches(commit: string): void {
  const result = spawnSync('git', ['-C', PROJECT_ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
  const head = result.stdout.trim();
  if (result.status !== 0 || head !== commit) {
    console.error(
      `[generate-sdd-check-baseline] refusing: git HEAD (${head || 'unknown'}) does not match --commit ${commit}.`
    );
    console.error(
      'The baseline must be generated on the exact commit it claims to describe. Check out that commit first (rebuild is an explicit, separate, operator-approved action — D-38).'
    );
    process.exit(1);
  }
}

function main(): void {
  const args = parseCliArgs(process.argv.slice(2));
  assertHeadMatches(args.commit);
  const result = runSddCheckJson(PROJECT_ROOT, args.root);
  if (!result.ok) {
    console.error(`[generate-sdd-check-baseline] ${result.reason}`);
    process.exit(1);
  }
  const raw = result.payload.findings;
  const findings = dedupeSortFindings(toBaselineFindings(raw));
  const errors = raw.filter((f) => f.severity === 'error').length;
  const warnings = raw.length - errors;

  const baseline: SddCheckBaseline = {
    schema: 'gennady.sdd-check.baseline.v1',
    commit: args.commit,
    tag: args.tag,
    generatedBy: 'node dist/gennady.js sdd-check --all . --format json',
    generatedAt: new Date().toISOString(),
    totals: { errors, warnings, files: result.payload.fileCount },
    countsByCode: countsByCode(raw),
    findings,
  };

  const outAbs = resolve(PROJECT_ROOT, args.out);
  writeFileSync(outAbs, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
  console.log(`[generate-sdd-check-baseline] wrote ${outAbs}`);
  console.log(
    `  totals: ${errors} error(s), ${warnings} warning(s) across ${result.payload.fileCount} file(s); ${findings.length} unique (code,file,severity) row(s)`
  );
}

main();
