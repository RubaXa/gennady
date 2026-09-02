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

  it('keeps exact tool-result handling active in every authoring owner', () => {
    for (const owner of ['scope', 'module', 'infra', 'interface']) {
      const source = read('ai', 'kit', 'templates', 'sdd-v2', `${owner}.directive.hbs`);
      assert.match(source, /AX_TOOL_INVOCATION/, owner);
      assert.match(source, /axiom\/process\/ax-tool-invocation/, owner);
    }
  });

  it('makes function-scale authoring bounded and greenfield orientation executable', () => {
    const scope = read('ai', 'kit', 'templates', 'sdd-v2', 'scope.directive.hbs');
    const module = read('ai', 'kit', 'templates', 'sdd-v2', 'module.directive.hbs');
    const interview = read(
      'ai',
      'kit',
      'axiom',
      'interview',
      'ax-coverage-map-closure.xml'
    );
    const createAt = scope.indexOf('result="productManifest"');
    const orientAt = scope.indexOf('result="orientation"');
    assert.ok(createAt >= 0 && createAt < orientAt);
    assert.match(scope, /operator-confirmed `scale:` retained by this owner/);
    assert.match(scope, /ScalePath when="scale=function\|fix"/);
    assert.match(scope, /classify the scope type and mode exactly once/i);
    assert.match(scope, /must not reopen the already-settled route/);
    assert.doesNotMatch(scope, /session-file `scale:`|scale `product` \/ `library`/);
    assert.match(scope, /brief that already\s+names the consumer, happy path/);
    assert.match(module, /ScalePath when="scale=function\|fix"/);
    assert.match(module, /one Function\/Service module without invented Port/i);
    assert.match(module, /zero-new-information decision/);
    assert.match(module, /scope owns its requirement IDs/);
    assert.match(module, /No module-specific\s+requirements?/);
    assert.match(
      scope,
      /Do not run `sdd-check --all specs\/<scope>` here:[\s\S]+guaranteed to report broken links/i
    );
    assert.match(scope, /authoring-interactive\.directive\.xml/);
    assert.match(scope, /sdd-log &lt;scope-spec-path&gt; authoring-complete/);
    assert.match(module, /sdd-log &lt;module-spec-path&gt; authoring-complete/);
    assert.ok(scope.indexOf('result="draftReceipt"') < scope.indexOf('result="scopeAuthoringReceipt"'));
    assert.ok(
      module.indexOf('result="moduleReceipt"') <
        module.indexOf('result="moduleAuthoringReceipt"')
    );
    assert.doesNotMatch(scope, /Approval Check\. STOP/);
    assert.match(interview, /Explicit operator input is already\s+an answer/);
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
    assert.match(review, /at most five evidence-backed findings/);
    assert.match(review, /does not read\s+flow directives, examples, repository history/);
    assert.doesNotMatch(review, /Critic Rounds|five-result|review journal|sdd-session/);
  });

  it('keeps product/library decomposition complete without fragmenting a small scope', () => {
    const scope = read('ai', 'kit', 'templates', 'sdd-v2', 'scope.directive.hbs');
    const boundary = read('ai', 'kit', 'axiom', 'spec', 'ax-scope-stays-thin.xml');
    const handoff = read(
      'ai',
      'kit',
      'axiom',
      'spec',
      'ax-handoff-to-module-decomposition.xml'
    );
    assert.match(scope, /small single-purpose scope normally[\s\S]+exactly one cohesive module/i);
    assert.match(boundary, /transient draft is never an approval or scaffold target/);
    assert.match(boundary, /Small size is not a no-module exception/);
    assert.match(handoff, /Decomposition is not fragmentation/);
    assert.match(handoff, /exactly one module/);
    assert.doesNotMatch(boundary, /\*\*monolithic\*\*/);
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
    assert.match(scaffold, /exactly one Bootstrap Requirements row with a named Owner/);
    assert.match(scaffold, /return to STEP_1_DERIVE/);
    assert.match(scaffold, /do not\s+patch the failed ticket locally/i);
    assert.doesNotMatch(scaffold, /Correct only named findings and rerun the same check/);
    assert.doesNotMatch(scaffold, /--project-feasibility|--scaffold-feasibility|scaffold-plan\.json/);
  });
});

describe('stateless execution and specification format', () => {
  it('resumes from ticket, Execution Log, Git, and tool output without worker checkpoints', () => {
    const execute = read('ai', 'kit', 'templates', 'sdd-v2', 'execute.directive.hbs');
    assert.match(execute, /ticket, Execution Log, Git, and current tool output/);
    assert.match(execute, /Requirement-ID appears in an implemented\s+test/);
    assert.match(execute, /fresh bounded worker/);
    assert.match(execute, /sdd-task &lt;ticket&gt; --phase &lt;PhaseID&gt;/);
    assert.match(execute, /complete `phaseContext` output verbatim/);
    assert.match(execute, /Never\s+summarize, retype, or omit/);
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
    assert.match(phase, /worker never closes the phase or edits the ticket/i);
    assert.match(phase, /single `sdd-log complete` transition/i);
    assert.doesNotMatch(phase, /update the\s+phase's durable Execution Log facts/i);
    assert.match(reconcile, /independent verdict and operator approval #1/);
    assert.ok(
      reconcile.indexOf('review-lifecycle.directive.xml') <
        reconcile.indexOf('scaffold.directive.xml')
    );
  });

  it('checks task-visible phase artifacts before persisting DONE and Handoff', () => {
    const execute = read('ai', 'kit', 'templates', 'sdd-v2', 'execute.directive.hbs');
    const recordAt = execute.indexOf('<Step id="STEP_4_RECORD">');
    const preCloseCheckAt = execute.indexOf('result="preCloseTaskGate"', recordAt);
    const completeAt = execute.indexOf('sdd-log &lt;ticket&gt; complete', recordAt);
    const finalCheckAt = execute.indexOf('result="taskGate"', completeAt);
    assert.ok(recordAt >= 0 && recordAt < preCloseCheckAt);
    assert.ok(preCloseCheckAt < completeAt && completeAt < finalCheckAt);
    assert.match(execute, /correct and re-verify while the phase is still unchecked/);
    assert.match(execute, /Exact verification commands were already owned\s+by each phase receipt and MUST NOT be run again/);
  });

  it('closes and synchronizes ticket state before independent audit reads the group', () => {
    const execute = read('ai', 'kit', 'templates', 'sdd-v2', 'execute.directive.hbs');
    const finalGateAt = execute.indexOf('result="taskGate"');
    const roundCloseAt = execute.indexOf('result="roundClose"', finalGateAt);
    const trackerSyncAt = execute.indexOf('result="trackerSync"', roundCloseAt);
    const coherentTreeAt = execute.indexOf('result="coherentTreeGate"', trackerSyncAt);
    const auditAt = execute.indexOf('<Step id="STEP_6_AUDIT_REVIEW">', coherentTreeAt);
    assert.ok(finalGateAt >= 0 && finalGateAt < roundCloseAt);
    assert.ok(roundCloseAt < trackerSyncAt && trackerSyncAt < coherentTreeAt);
    assert.ok(coherentTreeAt < auditAt);
    assert.match(execute, /audit never receives a known\s+ticket\/index status drift/);
    assert.match(execute, /Do not repeat `sdd-log close` or `sdd-sync`/);
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

  it('records deviations in owning logs and reviews them only after the whole batch', () => {
    const format = read(
      'ai',
      'kit',
      'contract',
      'process',
      'deviation-record-format.xml'
    );
    const review = read(
      'ai',
      'kit',
      'templates',
      'sdd-v2',
      'deviation-review.directive.hbs'
    );
    const execute = read('ai', 'kit', 'templates', 'sdd-v2', 'execute.directive.hbs');
    for (const owner of ['scope', 'module', 'scaffold', 'execute']) {
      assert.match(
        read('ai', 'kit', 'templates', 'sdd-v2', `${owner}.directive.hbs`),
        /contract\/process\/deviation-record-format/,
        owner
      );
    }
    assert.match(format, /Decision Log/);
    assert.match(format, /Execution Log/);
    assert.match(format, /what.*why.*where/i);
    assert.match(format, /never.*sidecar/i);
    assert.match(review, /deviations/i);
    assert.match(review, /audit findings/i);
    assert.match(review, /questions/i);
    const refreshAt = execute.indexOf('result="refreshedExecutionMap"');
    const reviewAt = execute.indexOf('deviation-review.directive.xml');
    assert.ok(refreshAt >= 0 && refreshAt < reviewAt);
    assert.match(execute, /batch[\s\S]+queue is complete[\s\S]+deviation-review\.directive\.xml/i);
    assert.doesNotMatch(format + review + execute, /DEVIATIONS\.md/);
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
