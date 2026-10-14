// @file: Cross-artifact contract for independent critic/audit roles and shared remediation mechanics.
// @consumers: CI, SDD directive and skill maintainers
// @tasks: TSK-97

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf-8');

describe('SDD review lifecycle contract', () => {
  it('keeps critic and audit as separate roles with durable terminal results', () => {
    // #region START_SEPARATE_ROLES_SETUP_REVIEW_ARTIFACTS
    const critic = read('ai/directives/sdd/critic.directive.xml');
    const audit = read('ai/directives/sdd/audit.directive.xml');
    // #endregion END_SEPARATE_ROLES_SETUP_REVIEW_ARTIFACTS

    // #region START_SEPARATE_ROLES_ASSERT_DISTINCT_DURABLE_RESULTS
    assert.match(critic, /Gap-closing critique loop for SDD artifacts/);
    assert.match(critic, /@critic status=CLEAN rounds=<N>/);
    assert.match(audit, /Verify alignment between spec, task ticket, and actual code/);
    assert.match(audit, /Every accepted per-task audit is appended exactly once by its caller/);
    // #endregion END_SEPARATE_ROLES_ASSERT_DISTINCT_DURABLE_RESULTS
  });

  it('lets a dispatched audit reach one terminal result without operator interaction', () => {
    const audit = read('ai/directives/sdd/audit.directive.xml');

    // #region START_AUTONOMOUS_AUDIT_ASSERT_NO_INTERMEDIATE_PAUSE
    assert.match(audit, /execute every audit step without intermediate operator approval/);
    assert.match(audit, /return immediately.*No\s+intermediate approval, persistence/s);
    assert.doesNotMatch(audit, /Approval Check\. STOP|Phase Progress\. STOP/);
    // #endregion END_AUTONOMOUS_AUDIT_ASSERT_NO_INTERMEDIATE_PAUSE
  });

  it('uses confidence without turning uncertainty into an interactive halt', () => {
    // #region START_CONFIDENCE_POLICY_SETUP_AUDIT_AND_EXECUTION
    const audit = read('ai/directives/sdd/audit.directive.xml');
    const execute = read('ai/skills/sdd-execute/SKILL.md');
    // #endregion END_CONFIDENCE_POLICY_SETUP_AUDIT_AND_EXECUTION

    // #region START_CONFIDENCE_POLICY_ASSERT_NON_BLOCKING_LOW
    assert.match(audit, /if it remains `LOW`, emit it only as `INFO`/);
    assert.match(
      audit,
      /A\s+`LOW` finding never causes `FAIL`, opens an Execution Round, or authorizes an artifact change/
    );
    assert.match(execute, /Any `conf=L` finding \(necessarily `INFO`\)/);
    assert.doesNotMatch(audit, /H_LOW_CONFIDENCE/);
    // #endregion END_CONFIDENCE_POLICY_ASSERT_NON_BLOCKING_LOW
  });

  it('persists only a validated audit candidate and never needs supersede semantics', () => {
    // #region START_AUDIT_COMMIT_SETUP_DIRECTIVE_AND_ORCHESTRATOR
    const audit = read('ai/directives/sdd/audit.directive.xml');
    const execute = read('ai/skills/sdd-execute/SKILL.md');
    const standalone = read('ai/skills/sdd-audit/SKILL.md');
    // #endregion END_AUDIT_COMMIT_SETUP_DIRECTIVE_AND_ORCHESTRATOR

    // #region START_AUDIT_COMMIT_ASSERT_SINGLE_VALIDATED_WRITE
    assert.match(audit, /Audit is read-only/);
    assert.match(
      audit,
      /A malformed candidate\s+is never persisted and therefore needs no supersede record/
    );
    assert.match(execute, /Validate the complete candidate before\s+writing any audit history/);
    assert.match(
      audit,
      /Per-task output uses the first header and already carries every field needed by\s+`TICKET_AUDIT_ROUND_FORMAT`/
    );
    assert.match(audit, /appends the\s+candidate record byte-for-byte/);
    assert.match(execute, /append the candidate record\s+byte-for-byte under `## Audit Rounds`/);
    assert.match(execute, /There is no malformed\s+persisted record to supersede/);
    assert.match(standalone, /Commit an accepted per-task result once/);
    assert.match(standalone, /A\s+malformed candidate is corrected in memory.*never appended/s);
    // #endregion END_AUDIT_COMMIT_ASSERT_SINGLE_VALIDATED_WRITE
  });

  it('keeps the existing acknowledged-risk status across audit and execution', () => {
    // #region START_RISK_STATUS_ASSERT_CROSS_ARTIFACT_ALIGNMENT
    const files = ['ai/directives/sdd/audit.directive.xml', 'ai/skills/sdd-execute/SKILL.md'];

    for (const file of files) {
      const content = read(file);
      assert.match(content, /PASS_WITH_ACKNOWLEDGED_RISKS/);
    }
    // #endregion END_RISK_STATUS_ASSERT_CROSS_ARTIFACT_ALIGNMENT
  });

  it('requires every blocking remediation to identify its owner', () => {
    const audit = read('ai/directives/sdd/audit.directive.xml');

    // #region START_FINDING_OWNER_ASSERT_COMPLETE_ROUTING
    assert.match(audit, /`code-fix` and `ticket-reopen` MUST carry `phase=P<N>`/);
    assert.match(audit, /artifact-level route/);
    assert.match(audit, /Mixed results are normal/);
    // #endregion END_FINDING_OWNER_ASSERT_COMPLETE_ROUTING
  });

  it('processes phase and artifact findings from the same FAIL', () => {
    // #region START_MIXED_FINDINGS_ASSERT_ALL_ROUTE_GROUPS
    for (const file of ['ai/skills/sdd-execute/SKILL.md']) {
      const skill = read(file);

      assert.match(skill, /Mixed artifact \+ phase findings|One FAIL may contain both/);
      assert.match(skill, /ticket-update/);
      assert.match(skill, /spec-edit/);
      assert.match(skill, /phase=P<N>/);
      assert.doesNotMatch(skill, /phases_to_fix/);
    }
    // #endregion END_MIXED_FINDINGS_ASSERT_ALL_ROUTE_GROUPS
  });

  it('never closes or audits a fix round whose owned phase blocked', () => {
    // #region START_FIX_PHASE_BLOCKED_SETUP_EXECUTE_SKILL
    const execute = read('ai/skills/sdd-execute/SKILL.md');
    // #endregion END_FIX_PHASE_BLOCKED_SETUP_EXECUTE_SKILL

    // #region START_FIX_PHASE_BLOCKED_ASSERT_DURABLE_PAUSE
    assert.match(execute, /fix phase returning `BLOCKED` or `FAIL` is not a completed correction/);
    assert.match(execute, /leave the Round open, do not dispatch another audit/);
    assert.match(execute, /Only after every owned correction returns\s+DONE/);
    // #endregion END_FIX_PHASE_BLOCKED_ASSERT_DURABLE_PAUSE
  });

  it('accepts readable legacy tickets and blocks only ambiguous structure', () => {
    // #region START_LEGACY_FALLBACK_SETUP_EXECUTION_AND_AUDIT
    const phase = read('ai/directives/sdd/phase-execution-protocol.xml');
    const audit = read('ai/directives/sdd/audit.directive.xml');
    // #endregion END_LEGACY_FALLBACK_SETUP_EXECUTION_AND_AUDIT

    // #region START_LEGACY_FALLBACK_ASSERT_UNAMBIGUOUS_ONLY
    assert.match(
      phase,
      /extract returns\s+`ANCHOR_NOT_FOUND` \(legacy artifact; log a\s+discovery line and proceed\)/
    );
    assert.match(audit, /named section is uniquely readable.*`ticket-update` `MINOR`/s);
    assert.match(audit, /target section cannot be resolved uniquely, emit\s+`BLOCKER`/);
    assert.match(audit, /Exit `5` \(`ANCHOR_EMPTY`\).*`MAJOR`/s);
    // #endregion END_LEGACY_FALLBACK_ASSERT_UNAMBIGUOUS_ONLY
  });

  it('distinguishes an absent legacy anchor from a present empty section at runtime', () => {
    // #region START_ANCHOR_EXIT_CODES_SETUP_FIXTURES
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-extract-'));
    const script = path.join(ROOT, 'ai/skills/sdd-execute/scripts/extract-section.sh');
    const absent = path.join(dir, 'absent.md');
    const empty = path.join(dir, 'empty.md');
    fs.writeFileSync(absent, '## 4. Acceptance Criteria\n');
    fs.writeFileSync(empty, '<!--SECTION:BDD-->\n<!--/SECTION:BDD-->\n');
    // #endregion END_ANCHOR_EXIT_CODES_SETUP_FIXTURES

    try {
      // #region START_ANCHOR_EXIT_CODES_ASSERT_DISTINCT_FAILURES
      const absentResult = spawnSync('bash', [script, absent, 'BDD'], { encoding: 'utf-8' });
      const emptyResult = spawnSync('bash', [script, empty, 'BDD'], { encoding: 'utf-8' });

      assert.equal(absentResult.status, 2);
      assert.match(absentResult.stdout, /ANCHOR_NOT_FOUND/);
      assert.equal(emptyResult.status, 5);
      assert.match(emptyResult.stdout, /ANCHOR_EMPTY/);
      // #endregion END_ANCHOR_EXIT_CODES_ASSERT_DISTINCT_FAILURES
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('exempts only the active task trackers from undeclared phase output', () => {
    const audit = read('ai/directives/sdd/audit.directive.xml');

    // #region START_CONTROL_PLANE_ASSERT_BOUNDED_TO_ACTIVE_TASK
    assert.match(
      audit,
      /active ticket,\s+the one per-scope tracker containing its Task-ID row, and that scope's aggregate row/
    );
    assert.match(audit, /never require them in phase `Target Files` or an `intro` line/);
    assert.match(audit, /Any other modified tracker remains an ordinary undeclared-diff candidate/);
    assert.doesNotMatch(audit, /active ticket and tracker files under `tasks\/\*\*`/);
    // #endregion END_CONTROL_PLANE_ASSERT_BOUNDED_TO_ACTIVE_TASK
  });

  it('inherits the configured model for every fresh reviewer and executor', () => {
    // #region START_MODEL_INHERITANCE_SETUP_DISPATCH_CONTRACTS
    const files = [
      'ai/skills/sdd-execute/SKILL.md',
      'ai/skills/sdd-execute-batch/SKILL.md',
      'ai/directives/sdd/critic.directive.xml',
    ];
    // #endregion END_MODEL_INHERITANCE_SETUP_DISPATCH_CONTRACTS

    // #region START_MODEL_INHERITANCE_ASSERT_NO_STALE_ALIAS
    for (const file of files) {
      const content = read(file);
      assert.match(content, /inherit\s+the\s+caller's configured model/);
      assert.doesNotMatch(content, /model: "(?:haiku|sonnet|opus)"/);
    }
    // #endregion END_MODEL_INHERITANCE_ASSERT_NO_STALE_ALIAS
  });

  it('applies dispatched directives without exposing activation machinery', () => {
    // #region START_SILENT_ACTIVATION_SETUP_SKILLS
    const files = [
      'ai/skills/sdd-execute/SKILL.md',
      'ai/skills/sdd-execute-batch/SKILL.md',
      'ai/skills/sdd-audit/SKILL.md',
    ];
    // #endregion END_SILENT_ACTIVATION_SETUP_SKILLS

    // #region START_SILENT_ACTIVATION_ASSERT_OPERATOR_SURFACE
    for (const file of files) {
      const content = read(file);
      assert.match(content, /Apply the directive silently|Load & apply directive silently/);
      assert.doesNotMatch(content, /DIRECTIVE ACTIVATED/);
    }
    // #endregion END_SILENT_ACTIVATION_ASSERT_OPERATOR_SURFACE
  });

  it('continues improving audit rounds without an operator attempt token', () => {
    // #region START_PROGRESS_CONVERGENCE_SETUP_ORCHESTRATORS
    const files = ['ai/skills/sdd-execute/SKILL.md'];
    // #endregion END_PROGRESS_CONVERGENCE_SETUP_ORCHESTRATORS

    // #region START_PROGRESS_CONVERGENCE_ASSERT_TERMINAL_CONDITIONS
    for (const file of files) {
      const content = read(file);
      assert.match(content, /genuinely new\s+blocking mechanism.*owned in-scope remediation/s);
      assert.match(content, /No-progress means none of those transitions occurred/);
      assert.match(content, /neither new evidence nor a different in-scope remediation/);
      assert.match(content, /no\s+attempt cap/);
      assert.doesNotMatch(
        content,
        /--new-audit-session|audit-cap-exhausted|max one remediation cycle/
      );
    }
    // #endregion END_PROGRESS_CONVERGENCE_ASSERT_TERMINAL_CONDITIONS
  });

  it('treats an execution invocation as authorization instead of requesting it twice', () => {
    // #region START_INVOCATION_AUTHORIZATION_SETUP_ORCHESTRATORS
    const execute = read('ai/skills/sdd-execute/SKILL.md');
    const batch = read('ai/skills/sdd-execute-batch/SKILL.md');
    // #endregion END_INVOCATION_AUTHORIZATION_SETUP_ORCHESTRATORS

    // #region START_INVOCATION_AUTHORIZATION_ASSERT_NO_REDUNDANT_PAUSE
    assert.match(execute, /multiple choices do\s+not require another confirmation/);
    assert.match(batch, /invocation authorizes execution/);
    assert.doesNotMatch(execute, /single match → confirm|multiple → shortlist/);
    assert.doesNotMatch(batch, /Ask: "Start batch\?|Wait for confirmation/);
    // #endregion END_INVOCATION_AUTHORIZATION_ASSERT_NO_REDUNDANT_PAUSE
  });

  it('requires executed evidence and keeps harmless paper drift non-blocking', () => {
    const audit = read('ai/directives/sdd/audit.directive.xml');

    // #region START_EVIDENCE_SEVERITY_ASSERT_RUNTIME_AND_PAPER
    assert.match(audit, /A command printed by a script.*is provenance, not proof that it ran/s);
    assert.match(audit, /Static code\s+reading may prove structure.*never a runtime result/s);
    assert.match(audit, /protocol or documentation mismatch is\s+`MAJOR` only when/s);
    assert.match(audit, /Otherwise it is `MINOR` and cannot force another execution round/);
    // #endregion END_EVIDENCE_SEVERITY_ASSERT_RUNTIME_AND_PAPER
  });

  it('defines Reopens from persisted audit causation in every owner', () => {
    // #region START_REOPEN_CAUSATION_SETUP_OWNERS
    const audit = read('ai/directives/sdd/audit.directive.xml');
    const scaffold = read('ai/directives/sdd/scaffold.directive.xml');
    const check = read('ai/skills/sdd-execute/scripts/check.sh');
    // #endregion END_REOPEN_CAUSATION_SETUP_OWNERS

    // #region START_REOPEN_CAUSATION_ASSERT_ONE_FORMULA
    for (const content of [audit, scaffold]) {
      assert.match(
        content,
        /persisted `@audit` records\s+whose\s+`triggered-reopen` is not `none`/
      );
      assert.doesNotMatch(content, /Round headers count − 1/);
    }
    assert.match(check, /Meta count follows persisted audit causation/);
    assert.match(check, /triggered-reopen=Round-/);
    assert.match(scaffold, /findings with explicit phase owners/);
    assert.doesNotMatch(scaffold, /Target Files contain finding locations/);
    // #endregion END_REOPEN_CAUSATION_ASSERT_ONE_FORMULA
  });

  it('keeps one per-task lifecycle and makes batch a serial adaptive scheduler', () => {
    const batch = read('ai/skills/sdd-execute-batch/SKILL.md');

    // #region START_BATCH_DELEGATION_ASSERT_SINGLE_LIFECYCLE
    assert.match(batch, /canonical\s+`sdd-execute` lifecycle for one task at a time/);
    assert.match(batch, /Include `\[ \] TODO` and `\[~\] IN_PROGRESS`/);
    assert.match(batch, /Parallel task lanes in one working tree/);
    assert.match(batch, /in-memory terminal registry/);
    assert.match(batch, /sdd-audit\/SKILL\.md/);
    assert.match(batch, /ai\/skills\/sdd-execute\/SKILL\.md/);
    assert.doesNotMatch(batch, /max once per task|epic-only|sub-batch|phase=P<N>/);
    // #endregion END_BATCH_DELEGATION_ASSERT_SINGLE_LIFECYCLE
  });

  it('separates audit evidence from autonomous bounded remediation authority', () => {
    const audit = read('ai/directives/sdd/audit.directive.xml');
    const execute = read('ai/skills/sdd-execute/SKILL.md');

    assert.match(audit, /orchestrator autonomously applies exact bounded corrections/);
    assert.match(audit, /operator decides only ambiguous contract choices/);
    assert.match(execute, /INFO `INSIGHT_BACKFLOW`.*not.*auto-applied/s);
  });

  it('reuses scaffolded execution skeletons instead of duplicating Round headers', () => {
    const execute = read('ai/skills/sdd-execute/SKILL.md');
    const phase = read('ai/directives/sdd/phase-execution-protocol.xml');

    assert.match(execute, /Reuse the scaffolded current Round/);
    assert.match(phase, /fill that block in place/);
    assert.match(phase, /Never\s+create a duplicate header/s);
  });

  it('resumes a persisted audit FAIL without re-running completed phases blindly', () => {
    const execute = read('ai/skills/sdd-execute/SKILL.md');

    assert.match(execute, /latest persisted audit is `FAIL`.*resume at step 6/s);
    assert.match(execute, /route its still-current findings before creating any Round/);
    assert.match(execute, /already has a checked unique Round close.*do\s+not write another one/s);
  });

  it('keeps standalone audit and check on the loaded installation and shared mechanics', () => {
    const auditSkill = read('ai/skills/sdd-audit/SKILL.md');
    const checkSkill = read('ai/skills/sdd-check/SKILL.md');

    for (const skill of [auditSkill, checkSkill]) {
      assert.match(skill, /actually loaded|actually loaded skill/);
      assert.doesNotMatch(skill, /~\/Developer\/gennady|~\/\.claude\/skills/);
    }
    assert.match(checkSkill, /fabricated-placeholder/);
    assert.match(checkSkill, /\[REOPENS\]/);
  });

  it('keeps audit numbering independent from execution numbering', () => {
    const execute = read('ai/skills/sdd-execute/SKILL.md');

    assert.match(execute, /Audit Round: <next audit number/);
    assert.match(execute, /After Execution Round: <current closed Execution Round number>/);
  });

  it('requires the operator to own risk acknowledgement and decision-log acceptance', () => {
    const execute = read('ai/skills/sdd-execute/SKILL.md');
    const audit = read('ai/directives/sdd/audit.directive.xml');

    assert.match(execute, /`decision-log` → pause for the operator's explicit acknowledgement/);
    assert.match(execute, /never manufactures an acknowledgement/);
    assert.match(audit, /no `BLOCKER`/);
  });
});
