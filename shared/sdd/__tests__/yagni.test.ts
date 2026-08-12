// @file: Unit tests for the pure YAGNI usage-check logic (shared/sdd/yagni.ts) — no tree-sitter, no fs, no git; everything is passed in as data.
// @consumers: node:test runner
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  stripBarrelReexports,
  parseUsageWaiver,
  hasDecisionHeading,
  checkYagniUsage,
  ERR_CLI_YAGNI_UNDERUSED,
  ERR_CLI_YAGNI_WAIVER_DECISION_MISSING,
  type ChangedSymbol,
  type UsageWaiver,
} from '../yagni.ts';

describe('stripBarrelReexports', () => {
  it('blanks `export { X } from` and `export * from` lines', () => {
    const content = [
      "export { foo, bar } from './foo.ts';",
      "export * from './bar.ts';",
      'export const real = 1;',
    ].join('\n');
    const stripped = stripBarrelReexports(content);
    assert.doesNotMatch(stripped, /export \{ foo, bar \}/);
    assert.doesNotMatch(stripped, /export \*/);
    assert.match(stripped, /export const real = 1;/);
  });

  it('leaves non-re-export lines untouched', () => {
    const content = 'export function foo() {}\nconst x = 1;';
    assert.strictEqual(stripBarrelReexports(content), content);
  });
});

describe('parseUsageWaiver', () => {
  const spec = [
    '### `alpha`',
    '- **Type:** Utility',
    '- **Usage Waiver:** D-042 — used only by the CLI bootstrap today, kept for the planned plugin API',
    '',
    '### `beta`',
    '- **Type:** Utility',
    '- **Usage Waiver (external: acme-cli):** D-050 — public API for the acme-cli integration',
    '',
    '### `gamma`',
    '- **Type:** Utility',
    '',
    '### `delta2`',
    '- **Type:** Utility',
    '- **Usage Waiver:** isolates the cache boundary from the lookup, no decision behind it',
  ].join('\n');

  it('parses a plain Usage Waiver with a D-NNN citation inside the entity block', () => {
    const w = parseUsageWaiver(spec, 'alpha');
    assert.deepStrictEqual(w, {
      decision: 'D-042',
      reason: 'used only by the CLI bootstrap today, kept for the planned plugin API',
    });
  });

  it('parses the external-consumer variant', () => {
    const w = parseUsageWaiver(spec, 'beta');
    assert.deepStrictEqual(w, {
      decision: 'D-050',
      reason: 'public API for the acme-cli integration',
      external: 'acme-cli',
    });
  });

  it('parses a Usage Waiver with a reason but no D-NNN citation', () => {
    const w = parseUsageWaiver(spec, 'delta2');
    assert.deepStrictEqual(w, {
      reason: 'isolates the cache boundary from the lookup, no decision behind it',
    });
  });

  it('returns null when the entity has no Usage Waiver line', () => {
    assert.strictEqual(parseUsageWaiver(spec, 'gamma'), null);
  });

  it('returns null when the entity heading does not exist', () => {
    assert.strictEqual(parseUsageWaiver(spec, 'nonexistent'), null);
  });

  it('returns null when the reason is empty, even with a D-NNN citation', () => {
    const empty = '### `epsilon`\n- **Usage Waiver:** D-001 — ';
    assert.strictEqual(parseUsageWaiver(empty, 'epsilon'), null);
  });

  it('returns null when the reason is empty and there is no D-NNN citation', () => {
    const empty = '### `zeta`\n- **Usage Waiver:** ';
    assert.strictEqual(parseUsageWaiver(empty, 'zeta'), null);
  });

  it('parses a Usage Waiver under the DbC `#### Port: `Name`` heading convention', () => {
    const dbc = [
      '#### Port: `SymbolIndex`',
      '- **Purpose:** thing',
      '- **Usage Waiver:** D-042 — single real-runtime adapter today, port kept for the grep fallback',
      '',
      '#### Adapter: `TsSymbolIndexAdapter`',
      '- **Implements:** `SymbolIndex`',
    ].join('\n');
    assert.deepStrictEqual(parseUsageWaiver(dbc, 'SymbolIndex'), {
      decision: 'D-042',
      reason: 'single real-runtime adapter today, port kept for the grep fallback',
    });
  });

  it('parses a Usage Waiver under the numbered `### N.N Adapter: `Name`` heading convention', () => {
    const dbc = [
      '### 6.2 Adapter: `GrepSymbolIndexAdapter`',
      '- **Implements:** `SymbolIndex`',
      '- **Usage Waiver:** approximate fallback for extensions without a grammar, kept for coverage',
      '',
      '### 6.3 Adapter: `Other`',
    ].join('\n');
    assert.deepStrictEqual(parseUsageWaiver(dbc, 'GrepSymbolIndexAdapter'), {
      reason: 'approximate fallback for extensions without a grammar, kept for coverage',
    });
  });

  it('stops the DbC block at the next heading of the same or shallower level, not a deeper one', () => {
    const dbc = [
      '#### Service: `SymbolIndex`',
      '##### Side Effects',
      '- none',
      '#### Service: `Other`',
      '- **Usage Waiver:** belongs to Other, not SymbolIndex',
    ].join('\n');
    assert.strictEqual(parseUsageWaiver(dbc, 'SymbolIndex'), null);
  });
});

describe('hasDecisionHeading', () => {
  it('finds a Decision Log heading', () => {
    const content = '### D-TC006 — some title\n\nbody';
    assert.strictEqual(hasDecisionHeading(content, 'D-TC006'), true);
  });

  it('does not match a decision id that is a prefix of another', () => {
    const content = '### D-42A — unrelated\n';
    assert.strictEqual(hasDecisionHeading(content, 'D-42'), false);
  });

  it('returns false when absent', () => {
    assert.strictEqual(hasDecisionHeading('no headings here', 'D-042'), false);
  });
});

describe('checkYagniUsage', () => {
  const sym = (name: string, file = 'cli/cmd/foo/foo.ts'): ChangedSymbol => ({
    name,
    kind: 'function',
    file,
  });

  it('>= 2 usages → no finding', () => {
    const findings = checkYagniUsage(
      [sym('widelyUsed')],
      new Map([['widelyUsed', 2]]),
      new Map(),
      new Set()
    );
    assert.deepStrictEqual(findings, []);
  });

  it('< 2 usages, no waiver → ERR_CLI_YAGNI_UNDERUSED, always error (D-YG003, no legacy carve-out)', () => {
    const findings = checkYagniUsage(
      [sym('orphan')],
      new Map([['orphan', 0]]),
      new Map(),
      new Set()
    );
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0]?.code, ERR_CLI_YAGNI_UNDERUSED);
    assert.strictEqual(findings[0]?.symbol, 'orphan');
    assert.strictEqual(findings[0]?.severity, 'error');
  });

  it('< 2 usages, waiver present, D-NNN live → gated, no finding', () => {
    const waiver: UsageWaiver = { decision: 'D-042', reason: 'kept for the plugin API' };
    const findings = checkYagniUsage(
      [sym('waived')],
      new Map([['waived', 1]]),
      new Map([['waived', waiver]]),
      new Set(['D-042'])
    );
    assert.deepStrictEqual(findings, []);
  });

  it('< 2 usages, waiver present with a reason but no D-NNN citation → gated, no finding', () => {
    const waiver: UsageWaiver = { reason: 'isolates the I/O boundary for testability' };
    const findings = checkYagniUsage(
      [sym('waivedNoDecision')],
      new Map([['waivedNoDecision', 0]]),
      new Map([['waivedNoDecision', waiver]]),
      new Set()
    );
    assert.deepStrictEqual(findings, []);
  });

  it('< 2 usages, waiver present, D-NNN NOT live → ERR_CLI_YAGNI_WAIVER_DECISION_MISSING, always error', () => {
    const waiver: UsageWaiver = { decision: 'D-999', reason: 'made up' };
    const findings = checkYagniUsage(
      [sym('ghostWaiver')],
      new Map([['ghostWaiver', 0]]),
      new Map([['ghostWaiver', waiver]]),
      new Set() // D-999 not live anywhere
    );
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0]?.code, ERR_CLI_YAGNI_WAIVER_DECISION_MISSING);
    assert.strictEqual(findings[0]?.severity, 'error');
  });

  it('symbol absent from usageCounts is treated as 0 usages', () => {
    const findings = checkYagniUsage([sym('never seen')], new Map(), new Map(), new Set());
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0]?.code, ERR_CLI_YAGNI_UNDERUSED);
  });

  it('multiple changed symbols each evaluated independently', () => {
    const findings = checkYagniUsage(
      [sym('a'), sym('b'), sym('c')],
      new Map([
        ['a', 5],
        ['b', 1],
        ['c', 0],
      ]),
      new Map(),
      new Set()
    );
    assert.strictEqual(findings.length, 2);
    assert.deepStrictEqual(findings.map((f) => f.symbol).sort(), ['b', 'c']);
  });
});
