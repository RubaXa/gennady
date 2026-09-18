// @file: Deterministic isolated-copy config preparation for the cloud-ios Swift round-trip.
// @consumers: prepare-swift-roundtrip.ts, swift-fixture-prep.test.ts
// @tasks: E-10, E-18

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

type GateRecord = Record<string, unknown> & { id?: unknown };
type PluginRecord = {
  extraGates?: GateRecord[];
  overrideGates?: Record<string, GateRecord>;
  [key: string]: unknown;
};
type RootConfig = {
  stack?: {
    use?: unknown;
    anystack?: PluginRecord;
    swift?: PluginRecord;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

const MOVE = {
  swiftlint: 'format',
  build: 'build',
  'unit-tests': 'test',
} as const;

function gateWithoutId(gate: GateRecord): GateRecord {
  const { id: _id, ...spec } = gate;
  return structuredClone(spec);
}

/**
 * @purpose Move the three real legacy cloud-ios gates under Swift without changing their literals.
 * @invariant `anystack` remains a detected secondary stack; absent/misnamed gates fail closed.
 * @param source Existing gennady.yaml bytes from an isolated fixture copy.
 * @returns Deterministic prepared YAML with Swift as explicit primary.
 */
function prepareSwiftRoundtripConfig(source: string): string {
  const config = parseYaml(source) as RootConfig;
  if (!config || typeof config !== 'object') throw new Error('gennady.yaml must be a mapping');
  const stack = config.stack;
  if (!stack || typeof stack !== 'object') throw new Error('gennady.yaml has no stack mapping');
  const anystack = stack.anystack;
  if (!anystack || typeof anystack !== 'object') {
    throw new Error('gennady.yaml has no stack.anystack mapping');
  }
  const extras = Array.isArray(anystack.extraGates) ? anystack.extraGates : [];
  const byId = new Map(
    extras
      .filter((gate): gate is GateRecord & { id: string } => typeof gate.id === 'string')
      .map((gate) => [gate.id, gate])
  );
  const swift = stack.swift && typeof stack.swift === 'object' ? stack.swift : {};
  const overrideGates = { ...(swift.overrideGates ?? {}) };
  const legacyIds = Object.keys(MOVE) as Array<keyof typeof MOVE>;
  const legacyPresent = legacyIds.filter((id) => byId.has(id));
  const overridesPresent = legacyIds.filter((id) => overrideGates[MOVE[id]] !== undefined);

  if (legacyPresent.length === 0 && overridesPresent.length === legacyIds.length) {
    if (!isDeepStrictEqual(stack.use, ['swift', 'anystack'])) {
      throw new Error('prepared Swift fixture must use exactly [swift, anystack]');
    }
    return stringifyYaml(config, { lineWidth: 0 });
  }
  if (legacyPresent.length !== legacyIds.length) {
    throw new Error(
      `legacy cloud-ios gates are partial: expected ${legacyIds.join(', ')}, found ${legacyPresent.join(', ') || 'none'}`
    );
  }
  if (overridesPresent.length > 0 && overridesPresent.length !== legacyIds.length) {
    throw new Error(
      `Swift overrides are partial: expected ${legacyIds.map((id) => MOVE[id]).join(', ')}, found ${overridesPresent
        .map((id) => MOVE[id])
        .join(', ')}`
    );
  }
  for (const [legacyId, swiftId] of Object.entries(MOVE)) {
    const literal = gateWithoutId(byId.get(legacyId)!);
    const existing = overrideGates[swiftId];
    if (existing !== undefined && !isDeepStrictEqual(existing, literal)) {
      throw new Error(`Swift override '${swiftId}' conflicts with legacy gate '${legacyId}'`);
    }
    overrideGates[swiftId] = literal;
  }
  swift.overrideGates = overrideGates;
  stack.swift = swift;
  anystack.extraGates = extras.filter((gate) => !Object.hasOwn(MOVE, String(gate.id)));
  stack.use = ['swift', 'anystack'];
  return stringifyYaml(config, { lineWidth: 0 });
}

/**
 * @purpose Apply Swift prep only inside the caller-provided isolated fixture root.
 * @param root Isolated cloud-ios copy/worktree, never the immutable source checkout.
 * @returns Whether deterministic serialized bytes changed.
 */
export function prepareSwiftRoundtripFixture(root: string): { changed: boolean; path: string } {
  const path = join(root, 'gennady.yaml');
  const before = readFileSync(path, 'utf-8');
  const after = prepareSwiftRoundtripConfig(before);
  if (after !== before) writeFileSync(path, after, 'utf-8');
  return { changed: after !== before, path };
}
