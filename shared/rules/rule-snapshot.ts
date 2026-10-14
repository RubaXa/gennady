// @file: Canonical immutable snapshot of one validated rule resolution and all of its inputs.
// @consumers: SDD dispatch, Verify report, rules CLI
// @spec: CLI-RULES

import { createHash } from 'node:crypto';
import type { PhaseFacts } from './phase-facts.type.ts';
import type { RuleDescriptor } from './rule-descriptor.type.ts';
import type { RuleRegistry } from './rule-registry.ts';
import { RuleResolver } from './rule-resolver.ts';

const RULE_SNAPSHOT_SCHEMA = 'gennady.rule-snapshot.v1';

type JsonValue = null | boolean | number | string | readonly JsonValue[] | JsonObject;
type JsonObject = { readonly [key: string]: JsonValue };

/** @purpose Exact selected prompt and explanation supplied to an agent and Verify report. */
type RuleSnapshotSelection = {
  readonly id: string;
  readonly type: 'required' | 'suggested';
  readonly source: string;
  readonly body: string;
  readonly bodyDigest: string;
  readonly dependencies: readonly string[];
  readonly via: 'predicate' | 'dependency' | 'override';
  readonly reason: string;
  readonly provenance: string;
  readonly matchedArtifacts: readonly string[];
};

/** @purpose Exact excluded rule identity retained for an explainable resolution. */
type RuleSnapshotSkip = {
  readonly id: string;
  readonly source: string;
  readonly bodyDigest: string;
  readonly dependencies: readonly string[];
  readonly reason: string;
  readonly provenance: string;
};

/** @purpose Immutable versioned rules product shared without semantic recomputation. */
export type RuleSnapshot = {
  /** @purpose Versioned canonical serialization contract used for digest validation. */
  readonly schema: typeof RULE_SNAPSHOT_SCHEMA;
  /** @purpose SHA-256 identity of every semantic snapshot input and output. */
  readonly digest: string;
  /** @purpose Exact immutable phase facts evaluated by the resolver. */
  readonly facts: PhaseFacts;
  /** @purpose Required selected prompts in deterministic dependency order. */
  readonly required: readonly RuleSnapshotSelection[];
  /** @purpose Suggested selected prompts in deterministic dependency order. */
  readonly suggested: readonly RuleSnapshotSelection[];
  /** @purpose Explicitly skipped prompt identities with reason and provenance. */
  readonly skipped: readonly RuleSnapshotSkip[];
};

type RuleOverride = NonNullable<Parameters<typeof RuleResolver.resolve>[2]>[number];
type RuleResolution = ReturnType<typeof RuleResolver.resolve>;

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  return `{${Object.entries(value)
    .sort(([left], [right]) => compare(left, right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
    .join(',')}}`;
}

function portableIdentity(value: string, field: string): string {
  const normalized = value.trim().replaceAll('\\', '/');
  if (
    normalized === '' ||
    normalized.startsWith('/') ||
    /^[A-Za-z]:\//.test(normalized) ||
    normalized.startsWith('file:') ||
    /\p{Cc}/u.test(normalized)
  ) {
    throw new Error(`RULE_SNAPSHOT_NON_PORTABLE_IDENTITY: ${field}`);
  }
  return normalized;
}

function sorted(values: readonly string[]): readonly string[] {
  return Object.freeze([...values].sort(compare));
}

function predicateClauses(
  clauses: readonly Readonly<Record<string, readonly string[]>>[]
): readonly JsonObject[] {
  return clauses
    .map(
      (clause) =>
        Object.fromEntries(
          Object.entries(clause)
            .sort(([left], [right]) => compare(left, right))
            .map(([key, values]) => [key, [...values].sort(compare)])
        ) as JsonObject
    )
    .sort((left, right) => compare(canonicalJson(left), canonicalJson(right)));
}

function registryRecord(rule: RuleDescriptor): JsonObject {
  return {
    id: rule.ruleId,
    schema: rule.ruleSchema,
    type: rule.type,
    version: rule.version,
    source: portableIdentity(rule.source, `${rule.ruleId}.source`),
    when: predicateClauses(rule.when),
    unless: predicateClauses(rule.unless),
    dependencies: [...rule.dependsOn].sort(compare),
    body: rule.body,
    bodyDigest: rule.bodyDigest,
  };
}

function normalizedOverrides(overrides: readonly RuleOverride[]): readonly JsonObject[] {
  return [...overrides]
    .map((override) => ({
      action: override.action,
      ruleId: override.ruleId,
      reason: override.reason,
      provenance: portableIdentity(override.provenance, `${override.ruleId}.provenance`),
    }))
    .sort((left, right) =>
      compare(`${left.ruleId}\0${left.action}`, `${right.ruleId}\0${right.action}`)
    );
}

function selection(entry: RuleResolution['required'][number]): RuleSnapshotSelection {
  if (entry.rule.type !== 'required' && entry.rule.type !== 'suggested') {
    throw new Error(`RULE_SNAPSHOT_UNSUPPORTED_TYPE: ${entry.rule.ruleId}: ${entry.rule.type}`);
  }
  return deepFreeze({
    id: entry.rule.ruleId,
    type: entry.rule.type,
    source: portableIdentity(entry.rule.source, `${entry.rule.ruleId}.source`),
    body: entry.rule.body,
    bodyDigest: entry.rule.bodyDigest,
    dependencies: sorted(entry.rule.dependsOn),
    via: entry.via,
    reason: entry.reason,
    provenance: portableIdentity(entry.provenance, `${entry.rule.ruleId}.provenance`),
    matchedArtifacts: sorted(entry.matchedArtifacts),
  });
}

function skipped(entry: RuleResolution['skipped'][number]): RuleSnapshotSkip {
  return deepFreeze({
    id: entry.rule.ruleId,
    source: portableIdentity(entry.rule.source, `${entry.rule.ruleId}.source`),
    bodyDigest: entry.rule.bodyDigest,
    dependencies: sorted(entry.rule.dependsOn),
    reason: entry.reason,
    provenance: portableIdentity(entry.provenance, `${entry.rule.ruleId}.provenance`),
  });
}

function resolutionRecord(snapshot: Omit<RuleSnapshot, 'schema' | 'digest' | 'facts'>): JsonObject {
  const selected = (entries: readonly RuleSnapshotSelection[]): readonly JsonObject[] =>
    entries.map((entry) => ({
      id: entry.id,
      type: entry.type,
      source: entry.source,
      body: entry.body,
      bodyDigest: entry.bodyDigest,
      dependencies: entry.dependencies,
      via: entry.via,
      reason: entry.reason,
      provenance: entry.provenance,
      matchedArtifacts: entry.matchedArtifacts,
    }));
  return {
    required: selected(snapshot.required),
    suggested: selected(snapshot.suggested),
    skipped: snapshot.skipped.map((entry) => ({ ...entry })),
  };
}

function factsRecord(facts: PhaseFacts): JsonObject {
  return {
    targetFiles: facts.targetFiles,
    plannedFiles: facts.plannedFiles,
    tombstoneFiles: facts.tombstoneFiles,
    artifacts: facts.artifacts.map((artifact) => ({
      path: artifact.path,
      origins: artifact.origins,
      languages: artifact.languages,
      roles: artifact.roles,
      frameworks: artifact.frameworks,
    })),
    operations: facts.operations,
    intents: facts.intents,
    platforms: facts.platforms,
    tools: facts.tools,
    project: facts.project,
    providers: facts.providers,
  };
}

/**
 * @purpose Freeze one validated resolution into a portable canonical snapshot and digest.
 * @param registry Exact deterministic inventory used by the resolver.
 * @param facts Exact immutable resolver facts.
 * @param [overrides] Explicit add/skip inputs including their provenance.
 * @returns One deeply frozen snapshot whose digest covers registry, facts, overrides and resolution.
 */
export function createRuleSnapshot(
  registry: RuleRegistry,
  facts: PhaseFacts,
  overrides: readonly RuleOverride[] = []
): RuleSnapshot {
  const resolution = RuleResolver.resolve(registry, facts, overrides);
  const required = Object.freeze(resolution.required.map(selection));
  const suggested = Object.freeze(resolution.suggested.map(selection));
  const excluded = Object.freeze(resolution.skipped.map(skipped));
  const projection = { required, suggested, skipped: excluded };
  const canonical = canonicalJson({
    schema: RULE_SNAPSHOT_SCHEMA,
    facts: factsRecord(facts),
    registry: registry
      .list()
      .map(registryRecord)
      .sort((left, right) => compare(String(left.id), String(right.id))),
    overrides: normalizedOverrides(overrides),
    resolution: resolutionRecord(projection),
  });
  return deepFreeze({
    schema: RULE_SNAPSHOT_SCHEMA,
    digest: `sha256:${createHash('sha256').update(canonical).digest('hex')}`,
    facts,
    ...projection,
  });
}
