// @file: Unit tests for legacy (v1, unanchored) ticket recognition + extraction.
// @consumers: check
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isTicket,
  isLegacyTicket,
  legacyTicketRef,
  checkLegacyTicket,
  checkTrackers,
  type TrackerRowRef,
} from '../check.ts';

const LEGACY = [
  '# Task: TSK-12 — Demo',
  '## 1. Meta & Traceability',
  '- **Task-ID:** TSK-12',
  '- **Status:** [x] DONE',
  '- **Dependencies:** TSK-1',
  '## 2. Acceptance Criteria (BDD)',
  '**Scenario:** x',
  '## 4. Execution Log',
  '### Round 1',
  '- [x] DONE',
].join('\n');

const ANCHORED = [
  '<!--SECTION:META-->',
  '- **Task-ID:** cli-foo',
  '<!--/SECTION:META-->',
  '<!--SECTION:EXECUTION_LOG-->',
  'x',
  '<!--/SECTION:EXECUTION_LOG-->',
].join('\n');

describe('isLegacyTicket', () => {
  it('recognizes plain `## N. Meta` + `## N. Execution Log` headers', () => {
    assert.strictEqual(isLegacyTicket(LEGACY), true);
  });

  it('false for a v2 anchored ticket (isTicket already claims it)', () => {
    assert.strictEqual(isTicket(ANCHORED), true);
  });

  it('false when only one of the two canonical headers is present', () => {
    assert.strictEqual(isLegacyTicket('## 1. Meta\n- **Task-ID:** x'), false);
  });

  it('false for a spec or unrelated markdown file', () => {
    assert.strictEqual(isLegacyTicket('# Some Spec\n## Overview\ntext'), false);
  });
});

describe('legacyTicketRef', () => {
  it('extracts Task-ID, Status, Dependencies from the plain Meta header', () => {
    const ref = legacyTicketRef('t.md', LEGACY, 'v1');
    assert.strictEqual(ref.taskId, 'TSK-12');
    assert.strictEqual(ref.status, '[x] DONE');
    assert.deepStrictEqual(ref.dependencies, ['TSK-1']);
    assert.strictEqual(ref.flowVersion, 'v1');
  });

  it('null taskId/status when the Meta header is absent', () => {
    const ref = legacyTicketRef('t.md', '# no meta here');
    assert.strictEqual(ref.taskId, null);
    assert.strictEqual(ref.status, null);
    assert.deepStrictEqual(ref.dependencies, []);
  });
});

describe('checkLegacyTicket', () => {
  it('reports exactly one SDD_LEGACY_TICKET_UNANCHORED warn, not a lavina of format findings', () => {
    const findings = checkLegacyTicket('t.md');
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0]?.severity, 'warn');
    assert.strictEqual(findings[0]?.code, 'SDD_LEGACY_TICKET_UNANCHORED');
  });
});

describe('checkTrackers on a legacy ticket ref', () => {
  it('a legacy ticket with no tracker row is visible as SDD_TRACKER_MISSING_ROW (was silently dropped pre-fix)', () => {
    const ref = legacyTicketRef('t.md', LEGACY, 'v1');
    const findings = checkTrackers([ref], []);
    assert.ok(findings.some((f) => f.code === 'SDD_TRACKER_MISSING_ROW'));
  });

  it('a tracker row for a legacy Task-ID is no longer an orphan once the ticket is in ticketRefs', () => {
    const ref = legacyTicketRef('t.md', LEGACY, 'v1');
    const row: TrackerRowRef = { file: 'tracker.md', taskId: 'TSK-12', status: '[x] DONE' };
    const findings = checkTrackers([ref], [row]);
    assert.strictEqual(findings.length, 0);
  });
});
