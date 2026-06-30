// @file: Unit tests for the shared ticket-section parsers.
// @consumers: ticket
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseMetaInfo, parsePhasesOverview, parsePhaseDetail, parseVerification } from '../ticket.ts';

const META = [
  '## 1. Meta',
  '- **Task-ID:** cli-foo',
  '- **Status:** [ ] TODO',
  '- **Purpose:** Build the foo',
  '- **Scope:** cli',
  '- **Module:** core',
  '- **Dependencies:** cli-base, cli-init',
  '- **Spec References:**',
  '  - Contract: [FooPort](specs/cli/core/core.spec.md#fooport)',
  '  - Adapter: [FooAdapter](specs/cli/core/core.spec.md#fooadapter)',
  '- **Runtime Backing:** real-runtime',
].join('\n');

const OVERVIEW = [
  '## 2. Phases Overview',
  '| ID | Kind | Deps | Status |',
  '|----|------|------|--------|',
  '| P1 | impl | — | [ ] |',
  '| P2 | test | P1 | [x] |',
].join('\n');

const PHASE = [
  '### P1 — impl',
  '- **Objective:** implement foo',
  '- **Rules:**',
  '  - [typescript-rules](ai/directives/coding/typescript-rules.xml)',
  '  - [result-conventions](ai/directives/coding/result-conventions.xml)',
  '- **Target Files:**',
  '  - src/foo.ts',
  '  - src/foo.types.ts',
  '- **Inputs:** none',
  '- **Exit:** compiles clean',
].join('\n');

const VERIFICATION = [
  '## 5. Verification',
  '| Command | Required by |',
  '|---------|-------------|',
  '| npm run type-check | typescript-rules, result-conventions |',
  '| npm run test | node-test |',
].join('\n');

describe('parseMetaInfo', () => {
  it('parses the planning fields', () => {
    const m = parseMetaInfo(META);
    assert.strictEqual(m.taskId, 'cli-foo');
    assert.strictEqual(m.status, '[ ] TODO');
    assert.strictEqual(m.purpose, 'Build the foo');
    assert.strictEqual(m.scope, 'cli');
    assert.strictEqual(m.module, 'core');
    assert.deepStrictEqual(m.dependencies, ['cli-base', 'cli-init']);
  });

  it('parses Spec References with role, name, anchor', () => {
    const m = parseMetaInfo(META);
    assert.strictEqual(m.specRefs.length, 2);
    assert.deepStrictEqual(m.specRefs[0], {
      role: 'Contract',
      name: 'FooPort',
      anchor: 'specs/cli/core/core.spec.md#fooport',
    });
    assert.strictEqual(m.specRefs[1]?.name, 'FooAdapter');
  });

  it('treats None dependencies as empty', () => {
    assert.deepStrictEqual(parseMetaInfo('- **Dependencies:** None').dependencies, []);
  });
});

describe('parsePhasesOverview', () => {
  it('parses each phase row with deps and status', () => {
    const phases = parsePhasesOverview(OVERVIEW);
    assert.strictEqual(phases.length, 2);
    assert.deepStrictEqual(phases[0], { id: 'P1', kind: 'impl', deps: [], status: '[ ]' });
    assert.deepStrictEqual(phases[1], { id: 'P2', kind: 'test', deps: ['P1'], status: '[x]' });
  });
});

describe('parsePhaseDetail', () => {
  it('parses objective, rules (links), target files, inputs, exit', () => {
    const d = parsePhaseDetail(PHASE);
    assert.strictEqual(d.objective, 'implement foo');
    assert.deepStrictEqual(d.rules, [
      'ai/directives/coding/typescript-rules.xml',
      'ai/directives/coding/result-conventions.xml',
    ]);
    assert.deepStrictEqual(d.targetFiles, ['src/foo.ts', 'src/foo.types.ts']);
    assert.strictEqual(d.inputs, 'none');
    assert.strictEqual(d.exit, 'compiles clean');
  });
});

describe('parseVerification', () => {
  it('parses gate commands with their required-by rule ids', () => {
    const gates = parseVerification(VERIFICATION);
    assert.strictEqual(gates.length, 2);
    assert.deepStrictEqual(gates[0], {
      command: 'npm run type-check',
      requiredBy: ['typescript-rules', 'result-conventions'],
    });
    assert.deepStrictEqual(gates[1], { command: 'npm run test', requiredBy: ['node-test'] });
  });
});
