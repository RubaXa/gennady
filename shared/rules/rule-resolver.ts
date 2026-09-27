// @file: Deterministic explainable rule selection and dependency closure over immutable PhaseFacts.
// @consumers: RuleSnapshot, rules CLI, SDD dispatch
// @spec: CLI-RULES

import { minimatch } from 'minimatch';
import type { PhaseFacts } from './phase-facts.type.ts';
import type { RuleDescriptor } from './rule-descriptor.type.ts';
import type { RuleRegistry } from './rule-registry.ts';

type RuleOverride = {
  readonly action: 'add' | 'skip';
  readonly ruleId: string;
  readonly reason: string;
  readonly provenance: string;
};

type RuleResolutionEntry = {
  readonly rule: RuleDescriptor;
  readonly via: 'predicate' | 'dependency' | 'override';
  readonly reason: string;
  readonly provenance: string;
  readonly matchedArtifacts: readonly string[];
};

type SkippedRuleEntry = {
  readonly rule: RuleDescriptor;
  readonly reason: string;
  readonly provenance: string;
};

type RuleResolution = {
  readonly required: readonly RuleResolutionEntry[];
  readonly suggested: readonly RuleResolutionEntry[];
  readonly skipped: readonly SkippedRuleEntry[];
};

type MatchResult = {
  readonly matched: boolean;
  readonly artifacts: readonly string[];
};

const ARTIFACT_PREDICATES = new Set(['language', 'role', 'framework', 'pattern']);
const PHASE_PREDICATES = new Set(['operation', 'intent', 'platform', 'tool']);

function fail(code: string, detail: string): never {
  throw new Error(`${code}: ${detail}`);
}

function normalizedEvidence(value: string, ruleId: string, field: string): string {
  const normalized = value.trim();
  if (normalized === '' || /\p{Cc}/u.test(normalized)) {
    fail('RULE_RESOLUTION_INVALID_OVERRIDE', `${ruleId}: ${field}`);
  }
  return normalized;
}

function normalizedOverrides(
  registry: RuleRegistry,
  overrides: readonly RuleOverride[]
): ReadonlyMap<string, Readonly<RuleOverride>> {
  const result = new Map<string, Readonly<RuleOverride>>();
  for (const override of overrides) {
    const ruleId = normalizedEvidence(override.ruleId, override.ruleId, 'ruleId');
    if (override.action !== 'add' && override.action !== 'skip') {
      fail('RULE_RESOLUTION_INVALID_OVERRIDE', `${ruleId}: action`);
    }
    if (registry.get(ruleId) === undefined) fail('RULE_RESOLUTION_UNKNOWN_OVERRIDE', ruleId);
    if (result.has(ruleId)) fail('RULE_RESOLUTION_OVERRIDE_CONFLICT', ruleId);
    result.set(
      ruleId,
      Object.freeze({
        action: override.action,
        ruleId,
        reason: normalizedEvidence(override.reason, ruleId, 'reason'),
        provenance: normalizedEvidence(override.provenance, ruleId, 'provenance'),
      })
    );
  }
  return result;
}

function descriptorsById(registry: RuleRegistry): ReadonlyMap<string, RuleDescriptor> {
  return new Map(registry.list().map((descriptor) => [descriptor.ruleId, descriptor]));
}

function validateGraph(
  descriptors: ReadonlyMap<string, RuleDescriptor>
): readonly RuleDescriptor[] {
  const ordered = [...descriptors.values()].sort((left, right) =>
    left.ruleId.localeCompare(right.ruleId)
  );
  for (const descriptor of ordered) {
    if (descriptor.type !== 'required' && descriptor.type !== 'suggested') {
      fail('RULE_RESOLUTION_UNSUPPORTED_TYPE', `${descriptor.ruleId}: ${descriptor.type}`);
    }
    for (const clause of [...descriptor.when, ...descriptor.unless]) {
      for (const [predicate, values] of Object.entries(clause)) {
        if (!ARTIFACT_PREDICATES.has(predicate) && !PHASE_PREDICATES.has(predicate)) {
          fail('RULE_RESOLUTION_UNSUPPORTED_PREDICATE', `${descriptor.ruleId}: ${predicate}`);
        }
        if (values.length === 0 || values.some((value) => value === '')) {
          fail('RULE_RESOLUTION_MALFORMED_PREDICATE', `${descriptor.ruleId}: ${predicate}`);
        }
      }
    }
    for (const dependency of descriptor.dependsOn) {
      if (!descriptors.has(dependency)) {
        fail('RULE_RESOLUTION_MISSING_DEPENDENCY', `${descriptor.ruleId} -> ${dependency}`);
      }
    }
  }

  const visited = new Set<string>();
  const active = new Set<string>();
  const stack: string[] = [];
  const visit = (ruleId: string): void => {
    if (active.has(ruleId)) {
      const cycleStart = stack.indexOf(ruleId);
      fail('RULE_RESOLUTION_DEPENDENCY_CYCLE', [...stack.slice(cycleStart), ruleId].join(' -> '));
    }
    if (visited.has(ruleId)) return;
    active.add(ruleId);
    stack.push(ruleId);
    const descriptor = descriptors.get(ruleId);
    if (descriptor === undefined) fail('RULE_RESOLUTION_MISSING_DEPENDENCY', ruleId);
    for (const dependency of [...descriptor.dependsOn].sort()) visit(dependency);
    stack.pop();
    active.delete(ruleId);
    visited.add(ruleId);
  };
  for (const descriptor of ordered) visit(descriptor.ruleId);
  return ordered;
}

function phaseValues(facts: PhaseFacts, predicate: string): readonly string[] {
  const direct =
    predicate === 'operation'
      ? facts.operations
      : predicate === 'intent'
        ? facts.intents
        : predicate === 'platform'
          ? facts.platforms
          : predicate === 'tool'
            ? facts.tools
            : undefined;
  if (direct === undefined) fail('RULE_RESOLUTION_UNSUPPORTED_PREDICATE', predicate);
  return [...new Set([...direct, ...(facts.project[predicate] ?? [])])].sort();
}

function anyValueMatches(actual: readonly string[], expected: readonly string[]): boolean {
  return expected.some((candidate) => actual.includes(candidate));
}

function artifactMatches(
  artifact: PhaseFacts['artifacts'][number],
  predicate: string,
  expected: readonly string[]
): boolean {
  if (predicate === 'language') return anyValueMatches(artifact.languages, expected);
  if (predicate === 'role') return anyValueMatches(artifact.roles, expected);
  if (predicate === 'framework') return anyValueMatches(artifact.frameworks, expected);
  if (predicate === 'pattern') {
    return expected.some((pattern) =>
      minimatch(artifact.path, pattern, {
        dot: true,
        nocase: false,
        nocomment: true,
        nonegate: true,
      })
    );
  }
  fail('RULE_RESOLUTION_UNSUPPORTED_PREDICATE', predicate);
}

function clauseMatch(
  ruleId: string,
  clause: Readonly<Record<string, readonly string[]>>,
  facts: PhaseFacts
): MatchResult {
  const entries = Object.entries(clause).sort(([left], [right]) => left.localeCompare(right));
  for (const [predicate] of entries) {
    if (!ARTIFACT_PREDICATES.has(predicate) && !PHASE_PREDICATES.has(predicate)) {
      fail('RULE_RESOLUTION_UNSUPPORTED_PREDICATE', `${ruleId}: ${predicate}`);
    }
  }
  const phaseMatches = entries
    .filter(([predicate]) => PHASE_PREDICATES.has(predicate))
    .every(([predicate, expected]) => anyValueMatches(phaseValues(facts, predicate), expected));
  if (!phaseMatches) return { matched: false, artifacts: [] };

  const artifactEntries = entries.filter(([predicate]) => ARTIFACT_PREDICATES.has(predicate));
  if (artifactEntries.length === 0) return { matched: true, artifacts: [] };
  const artifacts = facts.artifacts
    .filter((artifact) =>
      artifactEntries.every(([predicate, expected]) =>
        artifactMatches(artifact, predicate, expected)
      )
    )
    .map((artifact) => artifact.path);
  return { matched: artifacts.length > 0, artifacts: Object.freeze(artifacts) };
}

function descriptorMatch(
  descriptor: RuleDescriptor,
  facts: PhaseFacts
): {
  readonly selected: boolean;
  readonly artifacts: readonly string[];
  readonly reason: string;
} {
  const vetoes = descriptor.unless.map((clause) => clauseMatch(descriptor.ruleId, clause, facts));
  const matchingVeto = vetoes.find((match) => match.matched);
  if (matchingVeto !== undefined) {
    return {
      selected: false,
      artifacts: matchingVeto.artifacts,
      reason:
        matchingVeto.artifacts.length === 0
          ? 'Unless veto matched phase facts'
          : `Unless veto matched ${matchingVeto.artifacts.join(', ')}`,
    };
  }
  const positives = descriptor.when.map((clause) => clauseMatch(descriptor.ruleId, clause, facts));
  const matched = positives.filter((match) => match.matched);
  if (matched.length === 0) {
    return { selected: false, artifacts: [], reason: 'No When clause matched' };
  }
  const artifacts = Object.freeze(
    [...new Set(matched.flatMap((match) => match.artifacts))].sort((left, right) =>
      left.localeCompare(right)
    )
  );
  return {
    selected: true,
    artifacts,
    reason:
      artifacts.length === 0
        ? 'When clause matched phase facts'
        : `When clause matched ${artifacts.join(', ')}`,
  };
}

function topologicalOrder(
  descriptors: ReadonlyMap<string, RuleDescriptor>,
  selected: ReadonlySet<string>
): readonly string[] {
  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const ruleId of selected) {
    const descriptor = descriptors.get(ruleId);
    if (descriptor === undefined) fail('RULE_RESOLUTION_MISSING_DEPENDENCY', ruleId);
    const dependencies = descriptor.dependsOn.filter((dependency) => selected.has(dependency));
    indegree.set(ruleId, dependencies.length);
    for (const dependency of dependencies) {
      const values = dependents.get(dependency) ?? [];
      values.push(ruleId);
      dependents.set(dependency, values);
    }
  }
  const ready = [...selected].filter((ruleId) => indegree.get(ruleId) === 0).sort();
  const result: string[] = [];
  while (ready.length > 0) {
    const ruleId = ready.shift();
    if (ruleId === undefined) break;
    result.push(ruleId);
    for (const dependent of [...(dependents.get(ruleId) ?? [])].sort()) {
      const next = (indegree.get(dependent) ?? 0) - 1;
      indegree.set(dependent, next);
      if (next === 0) {
        ready.push(dependent);
        ready.sort();
      }
    }
  }
  return Object.freeze(result);
}

function freezeResolutionEntry(entry: RuleResolutionEntry): RuleResolutionEntry {
  return Object.freeze({ ...entry, matchedArtifacts: Object.freeze([...entry.matchedArtifacts]) });
}

/** @purpose Resolve immutable phase facts into explained selections without producing a snapshot digest. */
export const RuleResolver = Object.freeze({
  /**
   * @purpose Evaluate predicates, explicit overrides and deterministic dependency closure.
   * @param registry Valid immutable rule inventory.
   * @param facts Exact immutable phase facts.
   * @param overrides Explicit project/phase additions or skips with reason and provenance.
   * @returns Frozen required, suggested and skipped projections with exact rule identities.
   */
  resolve(
    registry: RuleRegistry,
    facts: PhaseFacts,
    overrides: readonly RuleOverride[] = []
  ): RuleResolution {
    const descriptors = descriptorsById(registry);
    const orderedDescriptors = validateGraph(descriptors);
    const normalized = normalizedOverrides(registry, overrides);
    const selected = new Set<string>();
    const entries = new Map<string, RuleResolutionEntry>();
    const skippedReasons = new Map<string, { reason: string; provenance: string }>();

    for (const descriptor of orderedDescriptors) {
      const override = normalized.get(descriptor.ruleId);
      const match = descriptorMatch(descriptor, facts);
      if (override?.action === 'skip') {
        skippedReasons.set(descriptor.ruleId, override);
        continue;
      }
      if (override?.action === 'add') {
        selected.add(descriptor.ruleId);
        entries.set(
          descriptor.ruleId,
          freezeResolutionEntry({
            rule: descriptor,
            via: 'override',
            reason: override.reason,
            provenance: override.provenance,
            matchedArtifacts: match.selected ? match.artifacts : [],
          })
        );
        continue;
      }
      if (match.selected) {
        selected.add(descriptor.ruleId);
        entries.set(
          descriptor.ruleId,
          freezeResolutionEntry({
            rule: descriptor,
            via: 'predicate',
            reason: match.reason,
            provenance: descriptor.source,
            matchedArtifacts: match.artifacts,
          })
        );
      } else {
        skippedReasons.set(descriptor.ruleId, {
          reason: match.reason,
          provenance: descriptor.source,
        });
      }
    }

    const close = (parentId: string): void => {
      const parent = descriptors.get(parentId);
      if (parent === undefined) fail('RULE_RESOLUTION_MISSING_DEPENDENCY', parentId);
      for (const dependencyId of parent.dependsOn) {
        const override = normalized.get(dependencyId);
        if (override?.action === 'skip') {
          fail('RULE_RESOLUTION_REQUIRED_DEPENDENCY_SKIPPED', `${parentId} -> ${dependencyId}`);
        }
        const dependency = descriptors.get(dependencyId);
        if (dependency === undefined) {
          fail('RULE_RESOLUTION_MISSING_DEPENDENCY', `${parentId} -> ${dependencyId}`);
        }
        if (!selected.has(dependencyId)) {
          selected.add(dependencyId);
          skippedReasons.delete(dependencyId);
          entries.set(
            dependencyId,
            freezeResolutionEntry({
              rule: dependency,
              via: 'dependency',
              reason: `Required by ${parentId}`,
              provenance: `dependency:${parentId}`,
              matchedArtifacts: [],
            })
          );
          close(dependencyId);
        }
      }
    };
    for (const ruleId of [...selected].sort()) close(ruleId);

    const orderedSelected = topologicalOrder(descriptors, selected);
    const required: RuleResolutionEntry[] = [];
    const suggested: RuleResolutionEntry[] = [];
    for (const ruleId of orderedSelected) {
      const entry = entries.get(ruleId);
      if (entry === undefined) fail('RULE_RESOLUTION_INTERNAL', `missing entry for ${ruleId}`);
      if (entry.rule.type === 'required') required.push(entry);
      else suggested.push(entry);
    }
    const skipped = orderedDescriptors
      .filter((descriptor) => !selected.has(descriptor.ruleId))
      .map((descriptor) => {
        const explanation = skippedReasons.get(descriptor.ruleId) ?? {
          reason: 'Not selected',
          provenance: descriptor.source,
        };
        return Object.freeze({ rule: descriptor, ...explanation });
      });
    return Object.freeze({
      required: Object.freeze(required),
      suggested: Object.freeze(suggested),
      skipped: Object.freeze(skipped),
    });
  },
});
