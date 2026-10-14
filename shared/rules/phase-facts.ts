// @file: Deterministic PhaseFacts classifier for exact target, planned and tombstone paths.
// @consumers: RuleResolver, VerifyPlanner, SDD dispatch
// @spec: CLI-RULES

import { extname } from 'node:path';
import { isSddTestFile } from '../sdd/source-extensions.ts';
import type { PhaseFacts } from './phase-facts.type.ts';

type PhaseArtifactOrigin = 'target' | 'planned' | 'tombstone';
type PhaseArtifactFact = {
  readonly path: string;
  readonly languages?: readonly string[];
  readonly roles?: readonly string[];
  readonly frameworks?: readonly string[];
};
type PhaseFactsInput = {
  readonly targetFiles: readonly string[];
  readonly plannedFiles: readonly string[];
  readonly tombstoneFiles?: readonly string[];
  readonly artifacts?: readonly PhaseArtifactFact[];
  readonly operations?: readonly string[];
  readonly intents?: readonly string[];
  readonly platforms?: readonly string[];
  readonly tools?: readonly string[];
  readonly project?: Readonly<Record<string, readonly string[]>>;
};

const LANGUAGE_BY_EXTENSION: Readonly<Record<string, string>> = Object.freeze({
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.go': 'go',
  '.py': 'python',
  '.pyi': 'python',
  '.swift': 'swift',
  '.css': 'css',
  '.scss': 'scss',
  '.sass': 'sass',
  '.less': 'less',
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'shell',
});

const PROVIDER_BY_LANGUAGE: Readonly<Record<string, string>> = Object.freeze({
  javascript: 'node',
  typescript: 'node',
  go: 'golang',
  swift: 'swift',
  css: 'css',
  scss: 'css',
  sass: 'css',
  less: 'css',
  bash: 'bash',
  shell: 'bash',
});

function normalizedToken(value: string, context: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === '' || /\p{Cc}/u.test(normalized)) {
    throw new Error(`PHASE_FACTS_INVALID: ${context} must be a non-empty control-free token`);
  }
  return normalized;
}

function normalizedValues(
  values: readonly string[] | undefined,
  context: string
): readonly string[] {
  return Object.freeze(
    [...new Set((values ?? []).map((value) => normalizedToken(value, context)))].sort()
  );
}

function normalizedPath(path: string, context: string): string {
  const normalized = path.replaceAll('\\', '/').replace(/^\.\//, '');
  if (
    normalized === '' ||
    normalized.startsWith('/') ||
    /^[A-Za-z]:\//.test(normalized) ||
    normalized
      .split('/')
      .some((segment) => segment === '' || segment === '.' || segment === '..') ||
    /\p{Cc}/u.test(normalized)
  ) {
    throw new Error(
      `PHASE_FACTS_INVALID: ${context} must be a normalized repository-relative path`
    );
  }
  return normalized;
}

function normalizedPaths(paths: readonly string[], context: string): readonly string[] {
  return Object.freeze(
    [...new Set(paths.map((path) => normalizedPath(path, context)))].sort((left, right) =>
      left.localeCompare(right)
    )
  );
}

function explicitFacts(
  facts: readonly PhaseArtifactFact[] | undefined
): ReadonlyMap<string, PhaseArtifactFact> {
  const result = new Map<string, PhaseArtifactFact>();
  for (const fact of facts ?? []) {
    const path = normalizedPath(fact.path, 'artifacts.path');
    if (result.has(path)) throw new Error(`PHASE_FACTS_DUPLICATE_ARTIFACT: ${path}`);
    result.set(path, fact);
  }
  return result;
}

function freezeProject(
  project: Readonly<Record<string, readonly string[]>> | undefined
): Readonly<Record<string, readonly string[]>> {
  const entries: [string, readonly string[]][] = [];
  const keys = new Set<string>();
  for (const [rawKey, values] of Object.entries(project ?? {})) {
    const key = normalizedToken(rawKey, 'project key');
    if (keys.has(key)) throw new Error(`PHASE_FACTS_DUPLICATE_PROJECT_KEY: ${key}`);
    keys.add(key);
    entries.push([key, normalizedValues(values, rawKey)]);
  }
  return Object.freeze(
    Object.fromEntries(entries.sort(([left], [right]) => left.localeCompare(right)))
  );
}

/**
 * @purpose Classify deterministic open-vocabulary facts without selecting rules or executing providers.
 * @param input Exact workflow scope and optional project-aware artifact facts.
 * @returns Deeply frozen facts with provider projection independent from RuleResolver.
 */
export function classifyPhaseFacts(input: PhaseFactsInput): PhaseFacts {
  const targetFiles = normalizedPaths(input.targetFiles, 'targetFiles');
  const plannedFiles = normalizedPaths(input.plannedFiles, 'plannedFiles');
  const tombstoneFiles = normalizedPaths(input.tombstoneFiles ?? [], 'tombstoneFiles');
  const factsByPath = explicitFacts(input.artifacts);
  const originsByPath = new Map<string, Set<PhaseArtifactOrigin>>();
  for (const [origin, paths] of [
    ['target', targetFiles],
    ['planned', plannedFiles],
    ['tombstone', tombstoneFiles],
  ] as const) {
    for (const path of paths) {
      const origins = originsByPath.get(path) ?? new Set<PhaseArtifactOrigin>();
      origins.add(origin);
      originsByPath.set(path, origins);
    }
  }
  for (const path of factsByPath.keys()) {
    if (!originsByPath.has(path)) {
      throw new Error(`PHASE_FACTS_UNSCOPED_ARTIFACT: ${path}`);
    }
  }
  const artifacts: PhaseFacts['artifacts'][number][] = [...originsByPath.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, origins]) => {
      const explicit = factsByPath.get(path);
      const inferredLanguage = LANGUAGE_BY_EXTENSION[extname(path).toLowerCase()];
      const inferredRole = isSddTestFile(path) ? 'test' : 'production';
      return Object.freeze({
        path,
        origins: Object.freeze([...origins].sort()),
        languages: normalizedValues(
          explicit?.languages ?? (inferredLanguage === undefined ? [] : [inferredLanguage]),
          `${path}.languages`
        ),
        roles: normalizedValues(explicit?.roles ?? [inferredRole], `${path}.roles`),
        frameworks: normalizedValues(explicit?.frameworks, `${path}.frameworks`),
      });
    });
  const providers = normalizedValues(
    artifacts.flatMap((artifact) =>
      artifact.languages.flatMap((language) => {
        const provider = PROVIDER_BY_LANGUAGE[language];
        return provider === undefined ? [] : [provider];
      })
    ),
    'providers'
  );
  return Object.freeze({
    targetFiles,
    plannedFiles,
    tombstoneFiles,
    artifacts: Object.freeze(artifacts),
    operations: normalizedValues(input.operations, 'operations'),
    intents: normalizedValues(input.intents, 'intents'),
    platforms: normalizedValues(input.platforms, 'platforms'),
    tools: normalizedValues(input.tools, 'tools'),
    project: freezeProject(input.project),
    providers,
  });
}
