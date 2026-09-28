// @file: Strict composition boundary from one SDD phase into one complete RuleSnapshot.
// @consumers: sdd-task dispatch, sdd-verify facade
// @spec: CLI-RULES

import { BUILTIN_RULE_SOURCES, loadRuleRegistry } from './builtin-rule-sources.ts';
import { classifyPhaseFacts } from './phase-facts.ts';
import { detectProjectRuleFacts } from './project-rule-facts.ts';
import { createRuleSnapshot, type RuleSnapshot } from './rule-snapshot.ts';
import { posix } from 'node:path';

type SddRuleArtifactFact = {
  readonly path: string;
  readonly languages?: readonly string[];
  readonly roles?: readonly string[];
  readonly frameworks?: readonly string[];
};

/** @purpose Exact SDD-owned source and fact inputs used before agent dispatch. */
type RuleOverride = NonNullable<Parameters<typeof createRuleSnapshot>[2]>[number];

type SddRuleSnapshotInput = {
  readonly root: string;
  /** @purpose Ticket-declared prompt sources applied as explicit phase additions. */
  readonly declaredSources?: readonly string[];
  /** @purpose Repository-relative ticket path used to resolve Markdown href sources. */
  readonly declarationFile?: string;
  /** @purpose Exact ticket/phase identity explaining every explicit declared addition. */
  readonly declarationProvenance?: string;
  readonly targetFiles: readonly string[];
  readonly plannedFiles: readonly string[];
  readonly tombstoneFiles?: readonly string[];
  readonly artifacts?: readonly SddRuleArtifactFact[];
  readonly operations?: readonly string[];
  readonly intents?: readonly string[];
  readonly platforms?: readonly string[];
  readonly tools?: readonly string[];
  readonly project?: Readonly<Record<string, readonly string[]>>;
  readonly overrides?: readonly RuleOverride[];
};

/** @purpose Facts and exact frozen snapshot created together before any phase worker starts. */
type SddRuleDispatch = {
  readonly facts: ReturnType<typeof classifyPhaseFacts>;
  readonly snapshot: RuleSnapshot;
};

function fail(code: string, detail: string): never {
  throw new Error(`${code}: ${detail}`);
}

function declaredSourcePath(source: string, declarationFile: string | undefined): string {
  const lexical = source.replaceAll('\\', '/').replace(/^\.\//, '');
  if (BUILTIN_RULE_SOURCES.includes(lexical as (typeof BUILTIN_RULE_SOURCES)[number])) {
    return lexical;
  }
  const resolved =
    declarationFile === undefined
      ? posix.normalize(lexical)
      : posix.normalize(posix.join(posix.dirname(declarationFile), lexical));
  if (
    resolved === '.' ||
    resolved.startsWith('../') ||
    posix.isAbsolute(resolved) ||
    resolved.split('/').some((segment) => segment === '' || segment === '..')
  ) {
    fail('SDD_RULE_SOURCE_UNSAFE', source);
  }
  return resolved;
}

function mergedProjectFacts(
  detected: Readonly<Record<string, readonly string[]>>,
  supplied: Readonly<Record<string, readonly string[]>>
): Readonly<Record<string, readonly string[]>> {
  const keys = [...new Set([...Object.keys(detected), ...Object.keys(supplied)])].sort();
  return Object.fromEntries(
    keys.map((key) => [
      key,
      [...new Set([...(detected[key] ?? []), ...(supplied[key] ?? [])])].sort(),
    ])
  );
}

/**
 * @purpose Load the complete embedded registry and freeze one phase's facts and explicit declarations.
 * @invariant This loader uses only the complete embedded-source manifest and never scans directive trees or parses prompt bodies as XML.
 * @param input Exact phase-owned declarations, facts and reasoned overrides.
 * @returns Frozen PhaseFacts and RuleSnapshot suitable for dispatch and Verify passthrough.
 */
export function resolveSddRuleSnapshot(input: SddRuleSnapshotInput): SddRuleDispatch {
  const declaredSources = (input.declaredSources ?? []).filter(
    (source) => source.trim() !== '' && source !== 'none' && source !== '—'
  );
  const normalizedSources = [...new Set(declaredSources)].sort();
  if (normalizedSources.length !== declaredSources.length) {
    fail('SDD_RULE_SOURCE_DUPLICATE', normalizedSources.join(', '));
  }
  const resolvedSources = normalizedSources.map((source) => ({
    declared: source,
    resolved: declaredSourcePath(source, input.declarationFile),
  }));
  if (new Set(resolvedSources.map(({ resolved }) => resolved)).size !== resolvedSources.length) {
    fail(
      'SDD_RULE_SOURCE_DUPLICATE',
      resolvedSources
        .map(({ resolved }) => resolved)
        .sort()
        .join(', ')
    );
  }
  const builtins = new Set<string>(BUILTIN_RULE_SOURCES);
  const registry = loadRuleRegistry(
    input.root,
    resolvedSources.map(({ resolved }) => resolved).filter((source) => !builtins.has(source))
  );
  const bySource = new Map(registry.list().map((descriptor) => [descriptor.source, descriptor]));
  const declarationOverrides: RuleOverride[] = resolvedSources.map(({ declared, resolved }) => {
    const descriptor = bySource.get(resolved);
    if (descriptor === undefined) fail('SDD_RULE_SOURCE_UNDECLARED', declared);
    const provenance = input.declarationProvenance?.trim() ?? '';
    if (provenance === '') {
      fail('SDD_RULE_DECLARATION_PROVENANCE_REQUIRED', declared);
    }
    return {
      action: 'add' as const,
      ruleId: descriptor.ruleId,
      reason: `Declared by SDD phase: ${declared}`,
      provenance,
    };
  });
  const artifactPaths = [
    ...input.targetFiles,
    ...input.plannedFiles,
    ...(input.tombstoneFiles ?? []),
  ];
  const detected = detectProjectRuleFacts(input.root, artifactPaths);
  const suppliedArtifacts = new Map(
    (input.artifacts ?? []).map((artifact) => [artifact.path, artifact])
  );
  if (suppliedArtifacts.size !== (input.artifacts ?? []).length) {
    fail('PHASE_FACTS_DUPLICATE_ARTIFACT', 'duplicate explicit artifact path');
  }
  const detectedPaths = new Set(detected.artifacts.map(({ path }) => path));
  for (const path of suppliedArtifacts.keys()) {
    if (!detectedPaths.has(path)) fail('PHASE_FACTS_UNSCOPED_ARTIFACT', path);
  }
  const artifacts = detected.artifacts.map((artifact) => {
    const supplied = suppliedArtifacts.get(artifact.path);
    return {
      path: artifact.path,
      ...(supplied?.languages === undefined ? {} : { languages: supplied.languages }),
      ...(supplied?.roles === undefined ? {} : { roles: supplied.roles }),
      frameworks: [...new Set([...artifact.frameworks, ...(supplied?.frameworks ?? [])])].sort(),
    };
  });
  const facts = classifyPhaseFacts({
    targetFiles: input.targetFiles,
    plannedFiles: input.plannedFiles,
    tombstoneFiles: input.tombstoneFiles ?? [],
    artifacts,
    operations: input.operations ?? [],
    intents: input.intents ?? [],
    platforms: input.platforms ?? [],
    tools: [...new Set([...detected.tools, ...(input.tools ?? [])])].sort(),
    project: mergedProjectFacts(detected.project, input.project ?? {}),
  });
  const overrides = [...(input.overrides ?? []), ...declarationOverrides];
  const overrideIds = overrides.map(({ ruleId }) => ruleId);
  if (new Set(overrideIds).size !== overrideIds.length) {
    fail('SDD_RULE_OVERRIDE_CONFLICT', overrideIds.sort().join(', '));
  }
  return Object.freeze({
    facts,
    snapshot: createRuleSnapshot(registry, facts, overrides),
  });
}
