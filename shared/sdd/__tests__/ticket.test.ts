// @file: Unit tests for the shared ticket-section parsers.
// @consumers: ticket
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseMetaInfo,
  parsePhasesOverview,
  parsePhaseDetail,
  parseVerification,
  parseVerificationTable,
  parseTicketCoveragePolicy,
} from '../ticket.ts';
import { resolveTicketArg } from '../ticket-resolve.ts';

const COVERAGE_POLICY_SCHEMA_MARKER = '<!--COVERAGE_POLICY:v1-->';

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

describe('resolveTicketArg repository identity', () => {
  const resolvableTicket = (id: string): string =>
    [
      '<!--SECTION:META-->',
      `- **Task-ID:** ${id}`,
      '<!--/SECTION:META-->',
      '<!--SECTION:EXECUTION_LOG-->',
      '<!--/SECTION:EXECUTION_LOG-->',
    ].join('\n');

  it('accepts an exact relative regular ticket and a unique bare Task-ID', () => {
    const root = mkdtempSync(join(tmpdir(), 'ticket-resolve-valid-'));
    try {
      writeFileSync(join(root, 'ticket.md'), resolvableTicket('TSK-safe'), 'utf-8');
      const byPath = resolveTicketArg('ticket.md', root);
      const byId = resolveTicketArg('TSK-safe', root);
      assert.strictEqual(byPath.ok, true);
      assert.strictEqual(byId.ok, true);
      if (byPath.ok) assert.strictEqual(byPath.identity.relative, 'ticket.md');
      if (byId.ok) assert.strictEqual(byId.resolvedFrom, 'id');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects absolute, traversal, and symlink ticket arguments without touching the victim', () => {
    const root = mkdtempSync(join(tmpdir(), 'ticket-resolve-root-'));
    const outside = mkdtempSync(join(tmpdir(), 'ticket-resolve-victim-'));
    const victim = join(outside, 'victim.md');
    try {
      const content = resolvableTicket('TSK-victim');
      writeFileSync(victim, content, 'utf-8');
      symlinkSync(victim, join(root, 'linked.md'));
      const absolute = resolveTicketArg(victim, root);
      const traversal = resolveTicketArg('../victim.md', root);
      const linked = resolveTicketArg('linked.md', root);
      assert.ok([absolute, traversal, linked].every((result) => !result.ok));
      assert.strictEqual(readFileSync(victim, 'utf-8'), content);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('fails a bare-ID search closed when its non-skipped corpus contains a symlink', () => {
    const root = mkdtempSync(join(tmpdir(), 'ticket-resolve-corpus-'));
    const outside = mkdtempSync(join(tmpdir(), 'ticket-resolve-corpus-victim-'));
    try {
      writeFileSync(join(root, 'ticket.md'), resolvableTicket('TSK-safe'), 'utf-8');
      writeFileSync(join(outside, 'other.md'), resolvableTicket('TSK-other'), 'utf-8');
      symlinkSync(join(outside, 'other.md'), join(root, 'possible-ticket.md'));
      const resolved = resolveTicketArg('TSK-safe', root);
      assert.strictEqual(resolved.ok, false);
      if (!resolved.ok) assert.strictEqual(resolved.reason, 'unsafe-corpus');
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
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

  it('specRefs is empty when the phase declares no Spec Refs bullets', () => {
    assert.deepStrictEqual(parsePhaseDetail(PHASE).specRefs, []);
  });

  it('parses an explicit per-phase Spec Refs subset (link anchors)', () => {
    const withRefs = [
      PHASE,
      '- **Spec Refs:**',
      '  - [FooPort](specs/cli/core/core.spec.md#fooport)',
    ].join('\n');
    assert.deepStrictEqual(parsePhaseDetail(withRefs).specRefs, [
      'specs/cli/core/core.spec.md#fooport',
    ]);
  });

  it('parses exact readiness-gate claims only from their structured phase field', () => {
    const withGates = [PHASE, '- **Readiness Gates:**', '  - lint', '  - test:coverage'].join('\n');
    assert.deepStrictEqual(parsePhaseDetail(withGates).readinessGates, ['lint', 'test:coverage']);
    assert.deepStrictEqual(parsePhaseDetail(`${PHASE}\nMention lint in prose.`).readinessGates, []);
  });

  it('parses adapter and capability ids only from their structured phase fields', () => {
    const capabilityPhase = [
      PHASE,
      '- **Capability Adapter:** node',
      '- **Provides Capabilities:** typescript.compiler, node.dependencies',
      '- **Requires Capabilities:** node.package-manager',
      'Mention fake.capability in prose.',
    ].join('\n');
    const detail = parsePhaseDetail(capabilityPhase);
    assert.strictEqual(detail.capabilityAdapter, 'node');
    assert.deepStrictEqual(detail.providesCapabilities, [
      'typescript.compiler',
      'node.dependencies',
    ]);
    assert.deepStrictEqual(detail.requiresCapabilities, ['node.package-manager']);
  });

  it('keeps an empty capability field empty instead of consuming the next structured field', () => {
    const detail = parsePhaseDetail(
      [
        '- **Capability Adapter:**',
        '- **Requires Capabilities:**',
        '- **Rules:**',
        '  - none',
      ].join('\n')
    );
    assert.strictEqual(detail.capabilityAdapter, null);
    assert.deepStrictEqual(detail.requiresCapabilities, []);
  });
});

describe('parseVerification', () => {
  it('parses gate commands with their required-by rule ids', () => {
    const gates = parseVerification(VERIFICATION);
    assert.strictEqual(gates.length, 2);
    assert.deepStrictEqual(gates[0], {
      command: 'npm run type-check',
      requiredBy: ['typescript-rules', 'result-conventions'],
      role: null,
    });
    assert.deepStrictEqual(gates[1], {
      command: 'npm run test',
      requiredBy: ['node-test'],
      role: null,
    });
  });

  it('lexes escaped pipes and pipes inside code spans without rewriting the command', () => {
    const escaped = parseVerificationTable(
      '| Command | Required by | Role |\n|---|---|---|\n| printf x \\| grep x | RULE | extra |'
    );
    const codeSpan = parseVerificationTable(
      '| Command | Required by | Role |\n|---|---|---|\n| `printf x | grep x` | RULE | extra |'
    );
    assert.deepStrictEqual(escaped, {
      ok: true,
      gates: [{ command: 'printf x | grep x', requiredBy: ['RULE'], role: 'extra' }],
    });
    assert.deepStrictEqual(codeSpan, escaped);
  });

  it('accepts the same canonical table without optional leading or trailing pipes', () => {
    const parsed = parseVerificationTable(
      'Command | Required by | Role\n---|---|---\n`printf x | grep x` | RULE | extra'
    );
    assert.deepStrictEqual(parsed, {
      ok: true,
      gates: [{ command: 'printf x | grep x', requiredBy: ['RULE'], role: 'extra' }],
    });
  });

  it('unwraps the exact multi-backtick delimiter while preserving shorter backticks inside', () => {
    const parsed = parseVerificationTable(
      '| Command | Required by | Role |\n|---|---|---|\n| ``printf `x` \\| grep x`` | RULE | extra |'
    );
    assert.deepStrictEqual(parsed, {
      ok: true,
      gates: [{ command: 'printf `x` \\| grep x', requiredBy: ['RULE'], role: 'extra' }],
    });
  });

  it('treats a pipe after an even backslash run as a separator, not an escape', () => {
    const parsed = parseVerificationTable(
      '| Command | Required by | Role |\n|---|---|---|\n| printf x \\\\| grep x | RULE | extra |'
    );
    assert.strictEqual(parsed.ok, false);
    if (!parsed.ok) assert.match(parsed.issues.join('; '), /found 4/);
  });

  it('rejects raw command pipes plus extra, missing, and unterminated-code cells teachingly', () => {
    const cases = [
      '| Command | Required by | Role |\n|---|---|---|\n| printf x | grep x | RULE | extra |',
      '| Command | Required by | Role |\n|---|---|---|\n| npm test | RULE | extra | unexpected |',
      '| Command | Required by | Role |\n|---|---|---|\n| npm test | RULE |',
      '| Command | Required by | Role |\n|---|---|---|\n| `npm test | RULE | extra |',
    ];
    for (const body of cases) {
      const parsed = parseVerificationTable(body);
      assert.strictEqual(parsed.ok, false);
      if (!parsed.ok) assert.match(parsed.issues.join('; '), /Verification table line/);
    }
  });

  it('fails closed on a missing table or malformed header, separator, and data', () => {
    const cases = [
      'The command is discussed here: `npm test | tee result`.',
      '| Command | Required by |\n|---|---|\n| npm test | RULE |',
      '| Command | Required by | Role |\n|---|---|\n| npm test | RULE | extra |',
      '| Command | Required by | Role |\nnot a separator\n| npm test | RULE | extra |',
      'Command | Required by | Role\n---|---|---\nnpm test | RULE',
    ];
    for (const body of cases) {
      const parsed = parseVerificationTable(body);
      assert.strictEqual(parsed.ok, false, body);
      if (!parsed.ok) assert.match(parsed.issues.join('; '), /Verification table line/);
    }
  });

  it('does not parse arbitrary prose or shell pipes outside the canonical table', () => {
    const parsed = parseVerificationTable(
      [
        'Prose mentions alpha | beta before the table.',
        'An old note mentions Command | Required by, but is not the canonical table.',
        '| Command | Required by | Role |',
        '|---|---|---|',
        '| `npm test` | RULE | extra |',
        '',
        'Afterward, docs say cat file | grep x.',
      ].join('\n')
    );
    assert.deepStrictEqual(parsed, {
      ok: true,
      gates: [{ command: 'npm test', requiredBy: ['RULE'], role: 'extra' }],
    });
  });
});

describe('parseTicketCoveragePolicy', () => {
  const section = (lines: string[]) =>
    [
      COVERAGE_POLICY_SCHEMA_MARKER,
      ...lines,
      '| Command | Required by | Role |',
      '|---|---|---|',
    ].join('\n');

  it('preserves a custom required reader command verbatim, including spaces', () => {
    const command = `go tool cover -func='coverage reports/profile one.out'`;
    const parsed = parseTicketCoveragePolicy(
      [
        section(['- **Coverage Policy:** required', '- **Coverage Owner Phase:** P2']),
        `| ${command} | GO-COVER | coverage |`,
      ].join('\n')
    );
    assert.deepStrictEqual(parsed, { status: 'required', command, ownerPhase: 'P2' });
  });

  it('accepts an explicit not-applicable reason and no coverage row', () => {
    assert.deepStrictEqual(
      parseTicketCoveragePolicy(
        section([
          '- **Coverage Policy:** not-applicable',
          '- **Coverage Reason:** package metadata only; no executable behavior',
        ])
      ),
      {
        status: 'not-applicable',
        reason: 'package metadata only; no executable behavior',
      }
    );
  });

  it('reports missing, duplicate/conflicting, missing-command, N/A-command, and N/A-reason states', () => {
    const cases = [
      section([]),
      [
        section([
          '- **Coverage Policy:** required',
          '- **Coverage Policy:** not-applicable',
          '- **Coverage Reason:** conflict',
        ]),
      ].join('\n'),
      section(['- **Coverage Policy:** required']),
      [
        section([
          '- **Coverage Policy:** required',
          '- **Coverage Reason:** contradictory N/A metadata',
        ]),
        '| custom reader | RULE | coverage |',
      ].join('\n'),
      [
        section([
          '- **Coverage Policy:** not-applicable',
          '- **Coverage Reason:** no runtime behavior',
          '- **Coverage Owner Phase:** P1',
        ]),
      ].join('\n'),
      [
        section([
          '- **Coverage Policy:** required',
          '- **Coverage Owner Phase:** P1',
          '- **Coverage Owner Phase:** P2',
        ]),
        '| custom coverage read | RULE | coverage |',
      ].join('\n'),
      section(['- **Coverage Policy:** not-applicable', '- **Coverage Reason:** <reason>']),
    ];
    for (const body of cases) assert.strictEqual(parseTicketCoveragePolicy(body).status, 'invalid');
  });

  it('grandfathers a pre-schema Verification section without inventing coverage', () => {
    assert.deepStrictEqual(parseTicketCoveragePolicy(VERIFICATION), { status: 'legacy' });
  });
});
