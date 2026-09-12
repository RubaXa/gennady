// @file: E-15 (D-46 track 50) — deterministic routing lock, both-way, on two branch points that
//   flow-eval's own scope (evaluating whether a repo can enter/pass the flow) depends on but never
//   exercises live: (1) a v1 flow-version must route into migration-v1-v2.directive.xml via
//   router.directive.xml's STEP_2_ROUTE dispatcher — parsed via ai/inspector/core's own directive
//   parser, the same tool used to render the routing graph for humans; (2) a repo carrying `go.mod`
//   must be detected as the `golang` stack by the go plugin used for readiness/verify gating.
//   Directives are read-only here ("директивы как есть" — this task never edits ai/directives/**,
//   ai/kit/**, or plugins/**, only asserts against them).
//   Note: router.directive.xml states the v1→migration rule TWICE — once as advisory prose inside a
//   <Contracts> block (never structurally parsed: the inspector recognizes <LogicSwitch> only as a
//   direct child of the directive root or inside an <Action> body), once as STEP_2_ROUTE's real
//   structural dispatcher. This lock targets the one the parser — and so the actual routing —
//   recognizes; see the first `it` below for the full note.
// @consumers: N/A (test file)
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { parseDirective } from '../../inspector/core/parse-directive.ts';
import type { TraceNode } from '../../inspector/core/model.ts';
import { golangPlugin } from '../../../plugins/golang/golang-plugin.ts';

const PROJECT_ROOT = resolve(import.meta.dirname, '../../..');
const ROUTER_DIRECTIVE = resolve(PROJECT_ROOT, 'ai/directives/sdd-v2/router.directive.xml');
const MIGRATION_REF = 'ai/directives/sdd-v2/migration-v1-v2.directive.xml';

/** @purpose Every node in the tree matching `predicate`, depth-first — the inspector's TraceNode
 *  tree has no parent pointers, so a plain recursive collector is the simplest correct walk. */
function findAll(
  node: TraceNode,
  predicate: (n: TraceNode) => boolean,
  acc: TraceNode[] = []
): TraceNode[] {
  if (predicate(node)) acc.push(node);
  for (const child of node.children ?? []) findAll(child, predicate, acc);
  return acc;
}

/** @purpose True for a `branch` node that routes a v1 flow-version into the migration directive:
 *  its raw condition text names `v1`, AND it actually carries a `run` child whose resolved ref is
 *  the migration directive — matching on text alone (without the parsed `run` ref) would pass even
 *  if READ_AND_USE_DIRECTIVE were deleted from the branch. */
function isV1MigrationBranch(node: TraceNode): boolean {
  if (node.kind !== 'branch') return false;
  if (!/v1/i.test(node.detail ?? '')) return false;
  return (node.children ?? []).some((c) => c.kind === 'run' && c.ref === MIGRATION_REF);
}

describe('E-15: v1-layout routing lock (ai/inspector/core parser, both-way)', () => {
  const routerXml = readFileSync(ROUTER_DIRECTIVE, 'utf8');

  it('router.directive.xml routes a v1 flow-version into migration-v1-v2.directive.xml', () => {
    // Note: router.directive.xml states this v1→migration rule TWICE — once as advisory prose
    // inside a <Contracts> block (never structurally parsed: the inspector only recognizes
    // <LogicSwitch> as a direct child of the directive root or inside an <Action> body, per
    // parse-directive.ts), and once as the REAL structural dispatcher, STEP_2_ROUTE's
    // <LOGIC_SWITCH> ("WHEN flow version is v1 AND operator explicitly requests migration"). This
    // lock targets the one the parser (and so the actual routing) recognizes.
    const tree = parseDirective('ai/directives/sdd-v2/router.directive.xml', routerXml);
    const matches = findAll(tree, isV1MigrationBranch);
    assert.ok(
      matches.length >= 1,
      `expected a LogicSwitch branch naming v1, routing (via READ_AND_USE_DIRECTIVE) into ${MIGRATION_REF}`
    );
  });

  it('both-way: removing the READ_AND_USE_DIRECTIVE call from that one branch makes the lock fail', () => {
    // Target ONLY STEP_2_ROUTE's v1 branch's own arrow-target, by anchoring on its distinguishing
    // condition text — never a line number, which would silently stop testing anything real once
    // the directive is re-templated and re-built with different line breaks.
    const mutated = routerXml.replace(
      /(WHEN flow version is v1 AND operator explicitly requests migration[\s\S]{0,80}?)READ_AND_USE_DIRECTIVE\("ai\/directives\/sdd-v2\/migration-v1-v2\.directive\.xml"\)/,
      '$1STOP("routing-lock test mutation — reference deliberately removed")'
    );
    assert.notEqual(
      mutated,
      routerXml,
      "the anchor text for STEP_2_ROUTE's v1 branch was not found in router.directive.xml — the " +
        'wording changed upstream; update this test to match instead of trusting a vacuous mutation'
    );
    const mutatedTree = parseDirective('ai/directives/sdd-v2/router.directive.xml', mutated);
    const matches = findAll(mutatedTree, isV1MigrationBranch);
    assert.deepEqual(
      matches,
      [],
      'the lock must react to the directive text, not pass regardless of content'
    );
  });
});

describe('E-15: go.mod → golang-stack routing lock (plugins/golang, both-way)', () => {
  it('a repo with go.mod is detected as the golang stack', () => {
    const dir = mkdtempSync(join(tmpdir(), 'routing-lock-go-'));
    try {
      writeFileSync(join(dir, 'go.mod'), 'module example.com/probe\n\ngo 1.21\n');
      const detection = golangPlugin.detect(dir);
      assert.ok(detection, 'expected a non-null StackDetection for a repo with go.mod');
      assert.equal(detection!.stack, 'golang');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('both-way: a repo WITHOUT go.mod is never detected as the golang stack', () => {
    const dir = mkdtempSync(join(tmpdir(), 'routing-lock-go-'));
    try {
      writeFileSync(join(dir, 'package.json'), '{"name":"probe"}\n');
      const detection = golangPlugin.detect(dir);
      assert.equal(detection, null, 'a repo with no go.mod must never detect as golang');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
