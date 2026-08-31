// @file: Regression tests for two DA-lazy-asm P3 findings on build-directives.ts's own wiring —
//   F-02 (audit, MAJOR): a blanket `--assembly=lazy` flag resolves for every directive with no
//   manifest override (DA-REQ-1), including one with zero <Step> blocks, and
//   `LazyDirectiveAssembler.assemble` rejects a Step-less directive outright (DA-REQ-3) — so the
//   flag alone must never force such a directive into lazy mode, or the ticket's own Exit
//   criterion ("`build:directives -- --assembly=lazy` runs end-to-end … without throwing") breaks
//   on the real template set (reproduced on sdd-v2/agent-inbox/code-lens.directive.xml, which has
//   no manifest override and zero Steps). An EXPLICIT per-directive override of 'lazy' on such a
//   directive stays a real configuration error — that is a deliberate signal about one directive,
//   not a blanket default sweeping it in by accident.
//   F-03 (code-review, MAJOR): `writeLazyDirective` wrote the skeleton BEFORE its step packages —
//   an interruption (crash, disk full, an exception on package N) between the skeleton write and
//   the packages loop finishing leaves a skeleton on disk whose printed paths are not all real,
//   breaking DA-REQ-12 in fact. The existsSync check right after each writeFileSync does not guard
//   against this: a synchronous write already guarantees the file exists or throws — it says
//   nothing about an interruption between loop iterations.
// @consumers: node:test runner
// @tasks: DA-lazy-asm

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { parseDirective } from '../../inspector/core/parse-directive.ts';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const BUILD_SCRIPT = join(ROOT, 'ai/kit/build-directives.ts');

function runBuild(args: string[]): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, ['--experimental-strip-types', BUILD_SCRIPT, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
  });
}

function runBuildAsync(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--experimental-strip-types', BUILD_SCRIPT, ...args], {
      cwd: ROOT,
      stdio: 'pipe',
    });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    child.once('error', reject);
    child.once('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`build exited ${code}:\n${output}`))
    );
  });
}

it('keeps simultaneous lazy and monolith builds isolated and the lazy scaffold inspector chain complete', async () => {
  const lazyRoot = mkdtempSync(join(tmpdir(), 'gennady-concurrent-lazy-'));
  const monolithRoot = mkdtempSync(join(tmpdir(), 'gennady-concurrent-monolith-'));
  try {
    await Promise.all([
      runBuildAsync([`--out=${lazyRoot}`, '--assembly=lazy']),
      runBuildAsync([`--out=${monolithRoot}`, '--assembly=monolith']),
    ]);
    const rel = 'ai/directives/sdd-v2/scaffold.directive.xml';
    const xml = readFileSync(join(lazyRoot, 'sdd-v2/scaffold.directive.xml'), 'utf8');
    const tree = parseDirective(rel, xml, (ref) => {
      const prefix = 'ai/directives/';
      if (!ref.startsWith(prefix)) return null;
      const path = join(lazyRoot, ref.slice(prefix.length));
      return existsSync(path) ? readFileSync(path, 'utf8') : null;
    });
    const plan = tree.children?.find((child) => child.label === '<ExecutionPlan>');
    assert.deepEqual(
      plan?.children?.map((step) => step.attrs?.id),
      [
        'STEP_0_INTAKE',
        'STEP_0B_PREFLIGHT',
        'STEP_1_CASCADE',
        'STEP_2_DAG',
        'STEP_3_TASK_GENERATION',
        'STEP_3_TICKET_LOOP',
        'STEP_3B_FEASIBILITY_CRITIC',
        'STEP_4_TEST_PLAN_REVIEW',
        'STEP_5_FINALIZE',
      ]
    );
  } finally {
    rmSync(lazyRoot, { recursive: true, force: true });
    rmSync(monolithRoot, { recursive: true, force: true });
  }
});

describe('build-directives — assembly-mode flag scope (F-02)', () => {
  let outDir: string;
  let monolithDir: string;
  let lazyRun: SpawnSyncReturns<string>;

  before(() => {
    outDir = mkdtempSync(join(tmpdir(), 'gennady-build-lazy-flag-'));
    monolithDir = mkdtempSync(join(tmpdir(), 'gennady-build-lazy-flag-mono-'));
    lazyRun = runBuild([`--out=${outDir}`, '--assembly=lazy']);
    const monolithRun = runBuild([`--out=${monolithDir}`]);
    assert.equal(monolithRun.status, 0, `monolith baseline build failed:\n${monolithRun.stdout}\n${monolithRun.stderr}`);
  });

  after(() => {
    rmSync(outDir, { recursive: true, force: true });
    rmSync(monolithDir, { recursive: true, force: true });
  });

  it('runs --assembly=lazy end-to-end over the real template set without failing on a Step-less directive', () => {
    assert.equal(
      lazyRun.status,
      0,
      `expected a clean exit (ticket Exit criterion: "runs end-to-end … without throwing"); got status=${lazyRun.status}\nstdout:\n${lazyRun.stdout}\nstderr:\n${lazyRun.stderr}`,
    );
  });

  it('keeps a Step-less, non-overridden directive monolith under the blanket flag, byte-identical to a plain build', () => {
    const rel = 'sdd-v2/agent-inbox/code-lens.directive.xml';
    const lazyFlagOutput = join(outDir, rel);
    assert.equal(existsSync(lazyFlagOutput), true, 'code-lens.directive.xml must still be written (as monolith)');
    assert.equal(
      readFileSync(lazyFlagOutput, 'utf8'),
      readFileSync(join(monolithDir, rel), 'utf8'),
      'a Step-less directive must render byte-identical whether or not --assembly=lazy was passed',
    );
  });

  it('names the skipped Step-less directive in an operator-visible skip summary', () => {
    assert.match(
      lazyRun.stdout,
      /code-lens\.directive\.xml/,
      `expected the skip summary to name code-lens.directive.xml so an operator/agent can see what happened and why:\n${lazyRun.stdout}`,
    );
  });

  it('still forces a Step-HAVING, non-overridden directive into lazy mode under the blanket flag (the gate is scoped to Step-less directives only, not to the 3 manifest pilots)', () => {
    assert.equal(
      existsSync(join(outDir, 'sdd-v2/router/steps/STEP_0_STATE.xml')),
      true,
      'router.directive.xml has 3 Steps and no manifest override — the blanket flag must still split it lazy',
    );
  });
});

describe('build-directives — packages written before the skeleton that references them (F-03)', () => {
  let outDir: string;

  before(() => {
    outDir = mkdtempSync(join(tmpdir(), 'gennady-build-lazy-order-'));
    // Fault injection: pre-create the destination path of phase-execution-protocol's SECOND step
    // package as a directory, so that specific writeFileSync throws EISDIR partway through the
    // packages loop — simulating a real interruption between package 1 and package 2 of the same
    // lazy directive, the exact gap F-03 flagged. phase-execution-protocol carries a manifest
    // override to 'lazy' already, so no --assembly flag is needed to reach this code path.
    mkdirSync(join(outDir, 'sdd-v2/phase-execution-protocol/steps/STEP_1B_RESUME_OR_START.xml'), {
      recursive: true,
    });
  });

  after(() => {
    rmSync(outDir, { recursive: true, force: true });
  });

  it('never leaves a skeleton on disk unless every package it prints paths for was already confirmed present', () => {
    const result = runBuild([`--out=${outDir}`]);
    assert.notEqual(result.status, 0, 'the injected EISDIR fault must still surface as a build failure, not be swallowed');

    const skeleton = join(outDir, 'sdd-v2/phase-execution-protocol.directive.xml');
    const packageBeforeFault = join(outDir, 'sdd-v2/phase-execution-protocol/steps/STEP_1_GET_PHASE_CONTEXT.xml');
    const packageAfterFault = join(outDir, 'sdd-v2/phase-execution-protocol/steps/STEP_2_NARROW_RECON.xml');

    assert.equal(
      existsSync(packageBeforeFault),
      true,
      'the package written before the fault should exist — proves this is a genuine mid-loop interruption, not an upfront failure',
    );
    assert.equal(existsSync(packageAfterFault), false, 'a package after the fault was never reached, as expected');
    assert.equal(
      existsSync(skeleton),
      false,
      'F-03: the skeleton must never exist unless every package path it would print was confirmed present first — writing every package before the skeleton is what this test guards',
    );
  });
});
