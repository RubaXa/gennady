// @file: Contract tests for the stateless SDD v2 approval and execution flow.
// @consumers: directive assembly, SDD skills, release regression suite
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../../..');

function read(...parts: string[]): string {
  return readFileSync(resolve(ROOT, ...parts), 'utf8');
}

describe('stateless SDD entry contract', () => {
  it('keeps sdd-state read-only and removes persistent session operations from every public entry', () => {
    for (const skill of ['sdd', 'sdd-scaffold', 'sdd-execute', 'sdd-critic', 'sdd-reconcile']) {
      const source = read('ai', 'skills', skill, 'SKILL.md');
      assert.equal(source.match(/npx gennady sdd-state/g)?.length, 1, skill);
      assert.doesNotMatch(source, /npx gennady sdd-session|session conflict|sessionOpen/);
    }
  });

  it('routes only V1 to V2 migration and returns invalid V2 to authoring', () => {
    const router = read('ai', 'kit', 'templates', 'sdd-v2', 'router.directive.hbs');
    assert.match(router, /V1→V2/);
    assert.match(router, /contract\/process\/readiness-preflight-gate/);
    assert.match(router, /FLOW_VERSION=v2` never routes to migration/);
    assert.match(router, /H_V2_INVALID/);
    assert.doesNotMatch(router, /sdd-session|SESSION_FILE_FORMAT/);
  });
});

describe('two artifact approval boundaries', () => {
  it('stores readable approval markers without hashes or sidecar state', () => {
    const marker = read('ai', 'kit', 'contract', 'process', 'artifact-approval-marker.xml');
    assert.match(marker, /Approval #1 — current specification set/);
    assert.match(marker, /Approval #2 — decomposition and test plan/);
    assert.match(marker, /Mechanical checks own only marker presence/);
    assert.match(marker, /model owns the semantic question/);
    assert.doesNotMatch(marker, /git hash-object|content fingerprint|blob OID|\.json/);
  });

  it('reviews actual specifications independently before operator approval #1', () => {
    const review = read('ai', 'kit', 'templates', 'sdd-v2', 'review-lifecycle.directive.hbs');
    const freezeAt = review.indexOf('STEP_1_FREEZE_TARGET');
    const reviewAt = review.indexOf('STEP_2_INDEPENDENT_REVIEW');
    const approvalAt = review.indexOf('STEP_4_OPERATOR_APPROVAL_1');
    assert.ok(freezeAt >= 0 && freezeAt < reviewAt && reviewAt < approvalAt);
    assert.match(review, /actual spec paths and their current content/);
    assert.match(review, /one fresh reviewer/);
    assert.doesNotMatch(review, /Critic Rounds|five-result|review journal|sdd-session/);
  });

  it('creates and checks actual tickets before independent review and operator approval #2', () => {
    const scaffold = read('ai', 'kit', 'templates', 'sdd-v2', 'scaffold.directive.hbs');
    const materializeAt = scaffold.indexOf('STEP_2_MATERIALIZE');
    const mechanicsAt = scaffold.indexOf('STEP_3_MECHANICAL_CHECK');
    const reviewAt = scaffold.indexOf('STEP_4_INDEPENDENT_TICKET_REVIEW');
    const approvalAt = scaffold.indexOf('STEP_5_OPERATOR_APPROVAL_2');
    assert.ok(materializeAt >= 0 && materializeAt < mechanicsAt);
    assert.ok(mechanicsAt < reviewAt && reviewAt < approvalAt);
    assert.match(scaffold, /sdd-check --task &lt;ticket-path&gt; --authoring/);
    assert.match(scaffold, /Requirement-ID → scenario → planned test/);
    assert.match(scaffold, /Happy-path-only is invalid/);
    assert.match(scaffold, /narrowest owning task index/);
    assert.doesNotMatch(scaffold, /--project-feasibility|--scaffold-feasibility|scaffold-plan\.json/);
  });
});

describe('stateless execution and specification format', () => {
  it('resumes from ticket, Execution Log, Git, and tool output without worker checkpoints', () => {
    const execute = read('ai', 'kit', 'templates', 'sdd-v2', 'execute.directive.hbs');
    assert.match(execute, /ticket, Execution Log, Git, and current tool output/);
    assert.match(execute, /Requirement-ID appears in an implemented\s+test/);
    assert.match(execute, /fresh bounded worker/);
    assert.match(execute, /approval #2 marker in the owning\s+task index/);
    assert.doesNotMatch(execute, /npx gennady sdd-session|--scaffold-feasibility/);
  });

  it('keeps real verification and reconcile ordering without hidden state', () => {
    const phase = read(
      'ai',
      'kit',
      'templates',
      'sdd-v2',
      'phase-execution-protocol.directive.hbs'
    );
    const reconcile = read('ai', 'kit', 'templates', 'sdd-v2', 'reconcile.directive.hbs');
    assert.match(phase, /run the phase's exact declared commands/i);
    assert.match(phase, /Requirement-ID in the test source/);
    assert.match(reconcile, /independent verdict and operator approval #1/);
    assert.ok(
      reconcile.indexOf('review-lifecycle.directive.xml') <
        reconcile.indexOf('scaffold.directive.xml')
    );
  });

  it('keeps one durable V2 spec format and removes temporary review artifacts', () => {
    const lifecycle = read('ai', 'kit', 'axiom', 'spec', 'ax-spec-lifecycle.xml');
    assert.match(lifecycle, /one durable format/);
    assert.match(lifecycle, /Git diff shows changes for semantic judgment/);
    assert.equal(
      existsSync(resolve(ROOT, 'ai/kit/contract/process/session-file-format.xml')),
      false
    );
    assert.equal(
      existsSync(resolve(ROOT, 'ai/kit/contract/scaffold/feasibility-state-format.xml')),
      false
    );
    assert.equal(
      existsSync(resolve(ROOT, 'ai/kit/templates/sdd-v2/formats/change-manifest.hbs')),
      false
    );
  });

  it('records the stateful design as superseded and the stateless decision as active', () => {
    const spec = read('specs', 'ai-skills', 'sdd-skills', 'sdd-skills.spec.md');
    assert.match(spec, /D-M003[\s\S]+Status:\*\* superseded by D-M004/);
    assert.match(spec, /D-M004[\s\S]+Status:\*\* active/);
  });

  it('keeps bootstrap planning semantic and removes capability-adapter fields', () => {
    const bootstrap = read(
      'ai',
      'kit',
      'axiom',
      'scaffold',
      'ax-bootstrap-ticket-derivation.xml'
    );
    assert.match(bootstrap, /Prefer one ticket/);
    assert.match(bootstrap, /runtime\/version[\s\S]+package-manager[\s\S]+dependency\s+installation/);
    assert.match(bootstrap, /ordinary ticket fields only/);
    assert.doesNotMatch(
      bootstrap,
      /Capability Adapter|Provides Capabilities|Requires Capabilities|Provides Packages|Requires Packages|project-feasibility|scaffold-feasibility/
    );
  });
});
