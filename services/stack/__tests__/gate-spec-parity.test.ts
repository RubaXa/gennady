// @file: Parity test — every runner-visible Gate field must be authorable in GateSpec (FR-STACK-15).
// @consumers: CI
// @tasks: TSK-95

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Gate } from '../stack.types.ts';

const { GATE_SPEC_KEYS } = await import('../stack-config.ts');
const { golangPlugin } = await import('../plugins/golang/golang-plugin.ts');
const { nodePlugin } = await import('../plugins/node/node-plugin.ts');

/**
 * Fields the runner acts on that config must NOT be able to author:
 * `stack` comes from the config section the gate is declared in, `skipped` is computed by
 * the planner (its authored form is `skipGates`), and `label` is synthesized so provenance
 * cannot be hidden behind a hand-written name.
 */
const DERIVED_FIELDS = ['stack', 'skipped', 'label'] as const;

/**
 * Fields whose config key is deliberately named differently: a gate carries milliseconds,
 * config authors a duration string (`"90s"`, `"5m"`) per config.spec D-CFG-003. An alias must
 * be listed here, so a silent rename cannot masquerade as parity.
 */
const FIELD_ALIASES: Readonly<Record<string, string>> = { timeoutMs: 'timeout' };

/** @purpose Plan real gates from both plugins so the key set comes from runtime, not a literal. */
function planEveryBuiltinGate(): Gate[] {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'parity-'));
  fs.writeFileSync(path.join(dir, 'go.mod'), 'module example.com/p\n\ngo 1.21\n');
  fs.writeFileSync(
    path.join(dir, 'main.go'),
    'package main\n\n//go:generate true\n\nfunc main() {}\n'
  );
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'p', scripts: { 'type-check': 'tsc --noEmit', test: 'node --test' } })
  );
  try {
    const gates: Gate[] = [];
    for (const plugin of [golangPlugin, nodePlugin]) {
      const detection = plugin.detect(dir);
      assert.notEqual(detection, null, `${plugin.id} must detect the parity fixture`);
      const scope = plugin.verify.resolveScope(detection!, { mode: 'all', targets: [] });
      gates.push(...plugin.verify.planGates(detection!, scope, { pluginConfig: null }));
    }
    return gates;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('GateSpec parity with built-in gates (FR-STACK-15)', () => {
  it('exposes every runner-visible gate field in the config schema', () => {
    const gates = planEveryBuiltinGate();
    assert.ok(gates.length > 0, 'the fixture must yield gates from both plugins');

    const emitted = new Set<string>();
    for (const gate of gates) {
      for (const key of Object.keys(gate)) {
        emitted.add(key);
      }
    }
    for (const derived of DERIVED_FIELDS) {
      emitted.delete(derived);
    }

    const missing = [...emitted]
      .map((key) => FIELD_ALIASES[key] ?? key)
      .filter((key) => !(GATE_SPEC_KEYS as readonly string[]).includes(key));
    assert.deepEqual(
      missing,
      [],
      `built-in gates emit field(s) config cannot author: ${missing.join(', ')} — ` +
        'add a GateSpec row (FR-STACK-15) or justify it as derived'
    );
  });

  it('keeps the derived list honest: no derived field is authorable', () => {
    const authorable = DERIVED_FIELDS.filter((key) =>
      (GATE_SPEC_KEYS as readonly string[]).includes(key)
    );
    assert.deepEqual(authorable, [], 'a derived field must not be config-authorable');
  });
});
