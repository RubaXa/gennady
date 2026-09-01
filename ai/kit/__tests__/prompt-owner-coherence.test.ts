// @file: Semantic guards for prompt ownership, lazy reads, and decision-only operator gates.
// @consumers: SDD-v2 directive templates and shared process axioms
// @tasks: N/A

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const read = (...parts: string[]): string => readFileSync(join(ROOT, ...parts), 'utf8');
const template = (name: string): string =>
  read('ai', 'kit', 'templates', 'sdd-v2', `${name}.directive.hbs`);
const step = (text: string, id: string): string =>
  text.match(new RegExp(`<Step id="${id}">([\\s\\S]*?)<\\/Step>`))?.[1] ?? '';

describe('SDD prompt owner coherence', () => {
  it('keeps audit verbose, compact, and persistent finding records on one taxonomy and route vocabulary', () => {
    const taxonomy = read('ai', 'kit', 'axiom', 'audit', 'ax-drift-taxonomy.xml');
    const verbose = read('ai', 'kit', 'contract', 'audit', 'finding-format.xml');
    const compact = read('ai', 'kit', 'contract', 'audit', 'audit-session-summary-format.xml');
    const persistent = read('ai', 'kit', 'contract', 'audit', 'ticket-audit-round-format.xml');
    const activeTypes = [
      'CLOSED_WORLD_DRIFT',
      'COMPLETENESS_GAP',
      'RUNTIME_BACKING_VIOLATION',
      'RULES_COMPLIANCE_VIOLATION',
      'RULES_CASCADE_MISMATCH',
      'TASK_ID_DRIFT',
      'BDD_COVERAGE_MISMATCH',
      'EXECUTION_LOG_INCOMPLETE',
      'STALE_AFTER_PIVOT',
      'INSIGHT_BACKFLOW',
      'RULE_FILE_INCOMPLETE',
      'LANGUAGE_QUALITY',
      'YAGNI_WAIVER_INCOMPLETE',
      'ENVIRONMENT_GATE_UNAVAILABLE',
      'DEAD_CODE_SUSPECT',
    ];
    const routes = [
      'spec-edit',
      'ticket-reopen',
      'ticket-update',
      'decision-log',
      'code-fix',
      'operator-escalation',
      'new-task',
    ];

    for (const token of activeTypes) {
      assert.match(taxonomy, new RegExp('\\| `' + token + '` \\|'));
      assert.match(verbose, new RegExp(`\\b${token}\\b`));
      assert.match(compact, new RegExp(`\\b${token}\\b`));
    }
    for (const route of routes) {
      assert.match(verbose, new RegExp(`\\b${route}\\b`));
      assert.match(compact, new RegExp(`\\b${route}\\b`));
    }
    assert.match(persistent, /same compact grammar as `AUDIT_SESSION_SUMMARY_FORMAT`/);
    assert.match(persistent, /phase=…/);
    assert.match(persistent, /phases_to_fix=/);
    assert.match(persistent, /@glossary suggestions=/);
    assert.doesNotMatch([verbose, compact, persistent].join('\n'), /~applied|payments\.spec\.md2/);
  });

  it('keeps code-review on its own read-only CLEAN-or-FINDINGS protocol consumed by execute', () => {
    const review = template('code-review');
    const execute = template('execute');
    assert.match(review, /<Contract id="CODE_REVIEW_OUTPUT_FORMAT">/);
    assert.match(review, /verdict=<CLEAN\|FINDINGS>/);
    assert.match(review, /no preamble and no edits\/applied-lines/);
    assert.doesNotMatch(review, /AUDIT_SESSION_SUMMARY_FORMAT|~applied/);
    assert.match(execute, /WHEN `CLEAN` -> STEP_8_SUMMARY/);
    assert.match(execute, /WHEN a bug `BLOCKER` has a bounded technical repair.+STEP_7_RESOLVE/);
  });

  it('leaves infra publication state and untracked-file detection to review lifecycle', () => {
    const infra = template('infra');
    const final = step(infra, 'STEP_7_FINAL_SPEC');
    assert.match(final, /Publication context and VCS cleanliness are owned entirely by the review lifecycle/);
    assert.doesNotMatch(final, /git status --porcelain -uno|git --no-pager diff --stat/);
  });

  it('keeps audit and code-review read-only after approval and routes accepted fixes to owners', () => {
    const noAutoFix = read('ai', 'kit', 'axiom', 'audit', 'ax-no-auto-fix.xml');
    const audit = template('audit');
    const review = template('code-review');
    const route = read('ai', 'directives', 'sdd-v2', 'audit', 'steps', 'STEP_3_ROUTE.xml');
    assert.match(noAutoFix, /workers are read-only/);
    assert.match(noAutoFix, /orchestrator routes the proposal\s+to the artifact owner/s);
    assert.doesNotMatch(noAutoFix, /audit agent may apply/);
    assert.match(audit, /worker stays\s+read-only throughout/s);
    assert.match(audit, /proposed Audit Rounds record routed to the execute orchestrator/);
    assert.match(review, /findings are proposals only/);
    assert.match(route, /read-only\s+worker does not append it/s);
    const executeSurfaces = [
      ['source', template('execute')],
      ['generated', read('ai', 'directives', 'sdd-v2', 'execute.directive.xml')],
    ] as const;
    for (const [label, execute] of executeSurfaces) {
      assert.match(execute, /Phase workers write code\/config and phase blocks/, label);
      assert.match(execute, /Audit\/code-review workers are read-only/, label);
      assert.match(execute, /orchestrator never writes production\/config targets/, label);
      assert.match(execute, /findings remain -> STEP_8_SUMMARY with routed proposals/, label);
    }
  });

  it('asks SCALE only for root, scope, module, infra, and interface authoring owners', () => {
    const router = step(template('router'), 'STEP_1_CLASSIFY');
    assert.match(router, /`project-setup`, `new-scope`, `evolve-scope`,\s+`module-decomposition`, and `multi-scope`/s);
    assert.match(router, /destination is root, scope, module, infra,\s+or interface/s);
    assert.match(router, /forced `scaffold` \/ `reconcile` \/ `critic` do not consume\s+SCALE/s);
    for (const skill of ['sdd-scaffold', 'sdd-reconcile', 'sdd-critic']) {
      assert.match(
        read('ai', 'skills', skill, 'SKILL.md'),
        /without a redundant SCALE question/,
        skill
      );
    }
  });

  it('names STEP_1 reviewState as the sole critic Changed-state producer', () => {
    const critic = template('critic');
    assert.match(critic, /Changed-state: <exact sha256 value from STEP_1 reviewState\.Changed-state>/);
    assert.match(critic, /STEP_1 `reviewState\.Changed-state` must differ/);
    assert.doesNotMatch(critic, /STEP_0 Changed-state|retained from STEP_0/);
  });

  it('binds audit-group to the exact planned ticket and reuses its result', () => {
    const audit = step(template('execute'), 'STEP_5_AUDIT');
    assert.match(audit, /sdd-task --audit-group <ticket>/);
    assert.match(audit, /exact selected ticket path or Task-ID retained from STEP_1 ticketPlan/);
    assert.match(audit, /Use auditGroup `spec:` and verdict/);
    assert.match(audit, /group selector = the exact `<ticket>` this step\s+passed to auditGroup/s);
    assert.doesNotMatch(audit, /--audit-group <id>/);
  });

  it('keeps module boundary and final hierarchy approvals while making intermediate gates delta-only', () => {
    const module = template('module');
    assert.match(module, /AX_MODULE_DELTA_APPROVAL/);
    assert.match(step(module, 'STEP_1_MODULE_MAP'), /Approval Check\. STOP/);
    for (const id of [
      'STEP_2_ENTITY_INVENTORY',
      'STEP_3_ENTITY_SURFACE',
      'STEP_4_CONTRACTS_DBC',
      'STEP_5_FILE_STRUCTURE',
    ]) {
      const body = step(module, id);
      assert.match(body, /AX_MODULE_DELTA_APPROVAL/, id);
      assert.doesNotMatch(body, /This step's Approval Check is its own/, id);
    }
    assert.match(
      step(module, 'STEP_6_FINAL_HIERARCHY'),
      /final\s+hierarchy and only its unsettled delta → Approval Check/
    );
  });

  it('runs parent-directory ls only for an absent or newly declared target parent', () => {
    const recon = read('ai', 'kit', 'axiom', 'process', 'ax-narrow-recon.xml');
    assert.match(recon, /Do not list every Target File parent/);
    assert.match(recon, /only when a Target File declares a new parent directory.+parent\s+is absent/s);
    assert.match(recon, /Never use `ls` to discover targets or widen the manifest/);
    assert.doesNotMatch(recon, /^1\. `ls <Target Files parent dirs>`/m);
  });

  it('computes scaffold target dependency closure before opening bounded specs', () => {
    const intake = step(template('scaffold'), 'STEP_0_INTAKE');
    assert.match(intake, /bounded target set comes from `routerState`/);
    assert.match(intake, /portal edge\s+graph's transitive `depends-on` closure/s);
    assert.match(intake, /declared module links of those scopes/s);
    assert.match(intake, /use every ✅ scope in the same snapshot as the\s+explicit bounded fallback/s);
    assert.match(intake, /Typed `sdd-state` diagnostics.+next owning action/s);
    assert.doesNotMatch(intake, /filesystem discovery, glob\/ls/);
    assert.doesNotMatch(intake, /Read each\s+✅ scope spec/);
  });
});
