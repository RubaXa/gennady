// @file: Cross-artifact contract tests for autonomous SDD execution.
// @consumers: CI, SDD directive and skill maintainers
// @tasks: TSK-97

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf-8');

describe('adaptive SDD execution contract', () => {
  it('uses the existing Execution Log and Handoff for safe runtime choices', () => {
    // #region START_SAFE_RUNTIME_CHOICES_SETUP_DIRECTIVES
    const phase = read('ai/directives/sdd/phase-execution-protocol.xml');
    const scaffold = read('ai/directives/sdd/scaffold.directive.xml');
    // #endregion END_SAFE_RUNTIME_CHOICES_SETUP_DIRECTIVES

    // #region START_SAFE_RUNTIME_CHOICES_ASSERT_EXISTING_LOG_SURFACE
    assert.match(phase, /decision <key>=<value> ← <reason>/);
    assert.match(phase, /carry the decision in Handoff, and continue through verification/);
    assert.match(scaffold, /`decision` \| `<key>=<value> ← <reason>`/);
    // #endregion END_SAFE_RUNTIME_CHOICES_ASSERT_EXISTING_LOG_SURFACE
  });

  it('blocks when no in-scope choice preserves required behavior', () => {
    // #region START_UNSAFE_CHOICE_SETUP_PHASE_DIRECTIVE
    const phase = read('ai/directives/sdd/phase-execution-protocol.xml');
    // #endregion END_UNSAFE_CHOICE_SETUP_PHASE_DIRECTIVE

    // #region START_UNSAFE_CHOICE_ASSERT_BLOCKER_BOUNDARY
    assert.match(
      phase,
      /When no safe in-scope path preserves the ticket's BDD, functional requirements, and Vision/
    );
    assert.match(phase, /If no such choice\s+exists, use `AX_BLOCKER_ESCALATION`/);
    // #endregion END_UNSAFE_CHOICE_ASSERT_BLOCKER_BOUNDARY
  });

  it('audits choices through the existing finding taxonomy and persists PASS', () => {
    // #region START_AUDITED_CHOICES_SETUP_AUDIT_DIRECTIVE
    const audit = read('ai/directives/sdd/audit.directive.xml');
    // #endregion END_AUDITED_CHOICES_SETUP_AUDIT_DIRECTIVE

    // #region START_AUDITED_CHOICES_ASSERT_PERSISTED_TAXONOMY
    assert.match(
      audit,
      /Walk `decision`, `discovery`, and `insight` lines plus Handoff `decisions`/
    );
    assert.match(audit, /`INSIGHT_BACKFLOW` INFO proposal/);
    assert.match(audit, /Every accepted per-task result is written exactly once by the caller/);
    // #endregion END_AUDITED_CHOICES_ASSERT_PERSISTED_TAXONOMY
  });

  it('routes behavior violations to findings and stale text to backflow', () => {
    // #region START_BACKFLOW_ROUTING_SETUP_AUDIT_DIRECTIVE
    const audit = read('ai/directives/sdd/audit.directive.xml');
    // #endregion END_BACKFLOW_ROUTING_SETUP_AUDIT_DIRECTIVE

    // #region START_BACKFLOW_ROUTING_ASSERT_DISTINCT_OUTCOMES
    assert.match(audit, /A behavior mismatch is routed through the\s+existing finding taxonomy/);
    assert.match(
      audit,
      /canonical text stale is routed as an\s+`INSIGHT_BACKFLOW` INFO proposal while the standard verdict table determines PASS or FAIL/
    );
    // #endregion END_BACKFLOW_ROUTING_ASSERT_DISTINCT_OUTCOMES
  });

  it('reports audited decisions and backflow proposals at the end', () => {
    // #region START_OPERATOR_SUMMARY_SETUP_SKILLS
    const execute = read('ai/skills/sdd-execute/SKILL.md');
    const batch = read('ai/skills/sdd-execute-batch/SKILL.md');
    // #endregion END_OPERATOR_SUMMARY_SETUP_SKILLS

    // #region START_OPERATOR_SUMMARY_ASSERT_EXACT_SURFACES
    assert.match(execute, /🧭 Decisions made during execution:/);
    assert.match(execute, /audit=<verified\|finding F-NN>/);
    assert.match(execute, /INSIGHT_BACKFLOW/);
    assert.match(batch, /Group non-routine execution decisions and\s+`INSIGHT_BACKFLOW` proposals/);
    // #endregion END_OPERATOR_SUMMARY_ASSERT_EXACT_SURFACES
  });

  it('keeps the ai-skills tracker on the canonical scope structure', () => {
    // #region START_SCOPE_TRACKER_SETUP_CONTRACT_AND_ARTIFACT
    const scaffold = read('ai/directives/sdd/scaffold.directive.xml');
    const tracker = read('tasks/ai-skills/README.md');
    // #endregion END_SCOPE_TRACKER_SETUP_CONTRACT_AND_ARTIFACT

    // #region START_SCOPE_TRACKER_ASSERT_REQUIRED_SURFACES
    assert.match(scaffold, /<Contract id="SCOPE_TASKS_README_STRUCTURE">/);
    assert.match(tracker, /^# Tasks: ai-skills$/m);
    assert.match(tracker, /^## Prefix$/m);
    assert.match(tracker, /^## Intra-Scope DAG$/m);
    assert.match(
      tracker,
      /\| Task-ID\s+\| Title\s+\| Module\s+\| Dependencies\s+\| Status\s+\| Reopens\s+\|/
    );
    // #endregion END_SCOPE_TRACKER_ASSERT_REQUIRED_SURFACES
  });
});
