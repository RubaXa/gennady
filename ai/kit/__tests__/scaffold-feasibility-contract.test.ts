// @file: Directive contract for the deterministic scaffold feasibility barrier.
// @consumers: sdd-scaffold
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const read = (...parts: string[]): string => readFileSync(join(ROOT, ...parts), 'utf-8');

describe('scaffold deterministic feasibility contract', () => {
  const scaffold = read('ai', 'kit', 'templates', 'sdd-v2', 'scaffold.directive.hbs');
  const bootstrap = read('ai', 'kit', 'axiom', 'scaffold', 'ax-bootstrap-ticket-derivation.xml');
  const ticket = read('shared', 'sdd', 'templates.ts');

  it('runs the parser-backed graph gate before the semantic feasibility critic', () => {
    assert.match(scaffold, /sdd-check --scaffold-feasibility/);
    assert.match(
      scaffold,
      /sdd-check --scaffold-feasibility[\s\S]+STEP_3B_FEASIBILITY_CRITIC/
    );
    assert.match(scaffold, /named causal diagnostics/);
  });

  it('authors explicit package provider/consumer facts and exact command probes', () => {
    assert.match(bootstrap, /Bootstrap Action.+dependency-install/s);
    assert.match(bootstrap, /Provides Packages/);
    assert.match(bootstrap, /Requires Packages/);
    assert.match(ticket, /:: command.+npm run/s);
    assert.match(bootstrap, /manifest plus future\/active lockfile/);
    assert.match(bootstrap, /DAG strictly serializes them/);
    assert.match(bootstrap, /no global single-owner rule exists/);
  });

  it('derives one executable bootstrap workstream without forcing one monolithic ticket', () => {
    assert.match(bootstrap, /one DAG-connected ordered.+serialized tickets or phases/is);
    assert.doesNotMatch(bootstrap, /workstream is one ticket/);
    assert.match(bootstrap, /Project-wide.+wrappers.+readiness\/full audit/is);
    assert.match(bootstrap, /Role=`probe`.+unique test phase.+mapped test file/is);
  });

  it('dispatches the gate-produced mechanical context instead of reconstructing tool semantics', () => {
    const criticStep = scaffold.match(
      /<Step id="STEP_3B_FEASIBILITY_CRITIC">([\s\S]*?)<\/Step>/
    )?.[1];
    assert.ok(criticStep);
    assert.match(scaffold, /<Contract id="FEASIBILITY_CRITIC_CONTEXT">/);
    assert.match(scaffold, /sdd-scaffold-critic-context\/v1/);
    assert.match(scaffold, /authoritative mechanical input/);
    assert.match(scaffold, /external\s+generator's real output contract/s);
    assert.match(criticStep, /exact `critic-context:` JSON value from\s+feasibilityGate unchanged/);
    assert.match(criticStep, /answers only residual causal\/semantic questions/);
    assert.match(criticStep, /TOOL_CONTRACT_MISSING: <fact> — <needed-for>/);
    assert.match(criticStep, /result="contextRefresh">npx gennady sdd-check --scaffold-feasibility/);
    assert.match(criticStep, /changed ticket bytes plus refreshed critic-context/);
    assert.doesNotMatch(criticStep, /For every phase, simulate/);
  });
});
