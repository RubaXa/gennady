// @file: Platform-neutral capability adapter registry for scaffold feasibility.
// @consumers: scaffold-feasibility, tests
// @tasks: N/A

/** @purpose One materialized capability artifact: a whole repo path or a structured field inside it. */
type CapabilityArtifactLocation =
  | { kind: 'path'; path: string }
  | { kind: 'field'; path: string; field: string };

/** @purpose Ordered artifact required by one platform's dependency capability. */
type CapabilityArtifact = {
  id: string;
  location: CapabilityArtifactLocation;
  order: number;
};

/** @purpose Cross-platform bootstrap layers; adapters bind concrete capabilities to this order. */
type CapabilityLayerKind =
  | 'runtime'
  | 'package-manager'
  | 'language-compiler'
  | 'quality-test-tooling'
  | 'app-platform';

/** @purpose One concrete capability layer and the capabilities that must precede it. */
type CapabilityLayer = {
  kind: CapabilityLayerKind;
  capability: string;
  requires: readonly string[];
};

/** @purpose One exact rule activated only by the listed actions or capabilities. */
type CapabilityRuleRequirement = {
  rulePath: string;
  actions: readonly string[];
  capabilities: readonly string[];
};

/** @purpose Canonical verification gate prerequisites owned by one capability family. */
type CapabilityGateRequirement = {
  gate: string;
  capabilities: readonly string[];
};

/** @purpose Manifest/lock boundary owned by adapters that materialize dependencies. */
type CapabilityDependencyBoundary = {
  manifestPath: string;
  lockfilePath: string;
  capability: string;
};

/** @purpose Mechanical scaffold contract for one independently selectable capability family. */
export type CapabilityAdapter = {
  /** @purpose Stable adapter id written in a phase's Capability Adapter field. */
  id: string;
  /** @purpose Optional manifest and lockfile boundary for dependency-materializing adapters. */
  dependencyBoundary: CapabilityDependencyBoundary | null;
  /** @purpose Structured files or fields that materialize this adapter's capabilities. */
  artifacts: readonly CapabilityArtifact[];
  /** @purpose Capability layers and their prerequisite edges. */
  layers: readonly CapabilityLayer[];
  /** @purpose Rules activated by exact actions or selected capabilities. */
  requiredRules: readonly CapabilityRuleRequirement[];
  /** @purpose Canonical verification gates supplied by exact adapter capabilities. */
  gateRequirements: readonly CapabilityGateRequirement[];
};

/** @purpose Injectable adapter lookup; tests add a fake platform without changing production code. */
export type CapabilityAdapterRegistry = Readonly<Record<string, CapabilityAdapter>>;

/** @purpose Exact Node/npm setup rule supplied by the installed directive bundle. */
const NODE_NPM_SETUP_RULE_PATH = 'ai/directives/infra/nodejs-npm-setup.xml';

/** @purpose Built-in Node/npm runtime, package-manager, and dependency materialization contract. */
export const NODE_NPM_CAPABILITY_ADAPTER: CapabilityAdapter = {
  id: 'node',
  dependencyBoundary: {
    manifestPath: 'package.json',
    lockfilePath: 'package-lock.json',
    capability: 'node.dependencies',
  },
  artifacts: [
    { id: 'node.runtime-version', location: { kind: 'path', path: '.nvmrc' }, order: 1 },
    {
      id: 'node.manifest-engine',
      location: { kind: 'field', path: 'package.json', field: 'engines.node' },
      order: 2,
    },
    {
      id: 'node.manifest-module-kind',
      location: { kind: 'field', path: 'package.json', field: 'type' },
      order: 2,
    },
    { id: 'node.registry-config', location: { kind: 'path', path: '.npmrc' }, order: 3 },
    {
      id: 'node.dependencies',
      location: { kind: 'path', path: 'package-lock.json' },
      order: 4,
    },
  ],
  layers: [
    { kind: 'runtime', capability: 'node.runtime', requires: [] },
    {
      kind: 'package-manager',
      capability: 'node.package-manager',
      requires: ['node.runtime'],
    },
  ],
  requiredRules: [
    {
      rulePath: NODE_NPM_SETUP_RULE_PATH,
      actions: ['dependency-install'],
      capabilities: [
        'node.runtime-version',
        'node.manifest-engine',
        'node.manifest-module-kind',
        'node.registry-config',
        'node.dependencies',
        'node.runtime',
        'node.package-manager',
      ],
    },
  ],
  gateRequirements: [],
};

/** @purpose Independently selected TypeScript compiler contract layered on Node/npm dependencies. */
export const TYPESCRIPT_CAPABILITY_ADAPTER: CapabilityAdapter = {
  id: 'typescript',
  dependencyBoundary: null,
  artifacts: [
    {
      id: 'typescript.compiler',
      location: { kind: 'path', path: 'tsconfig.json' },
      order: 1,
    },
  ],
  layers: [
    {
      kind: 'language-compiler',
      capability: 'typescript.compiler',
      requires: ['node.package-manager', 'node.dependencies'],
    },
  ],
  requiredRules: [],
  gateRequirements: [{ gate: 'type-check', capabilities: ['typescript.compiler'] }],
};

/** @purpose Independently selected TypeScript test, ESLint, and format gate boundaries. */
export const TYPESCRIPT_QUALITY_CAPABILITY_ADAPTER: CapabilityAdapter = {
  id: 'typescript-quality',
  dependencyBoundary: null,
  artifacts: [
    {
      id: 'typescript.test-tooling',
      location: { kind: 'field', path: 'package.json', field: 'scripts.test' },
      order: 1,
    },
    {
      id: 'typescript.eslint-lint-tooling',
      location: { kind: 'field', path: 'package.json', field: 'scripts.lint' },
      order: 1,
    },
    {
      id: 'typescript.format-tooling',
      location: { kind: 'field', path: 'package.json', field: 'scripts.format' },
      order: 1,
    },
  ],
  layers: [
    {
      kind: 'quality-test-tooling',
      capability: 'typescript.test-tooling',
      requires: ['typescript.compiler', 'node.dependencies'],
    },
    {
      kind: 'quality-test-tooling',
      capability: 'typescript.eslint-lint-tooling',
      requires: ['typescript.compiler', 'node.dependencies'],
    },
    {
      kind: 'quality-test-tooling',
      capability: 'typescript.format-tooling',
      requires: ['typescript.compiler', 'node.dependencies'],
    },
  ],
  requiredRules: [
    {
      rulePath: 'ai/directives/infra/eslint-setup.xml',
      actions: [],
      capabilities: ['typescript.eslint-lint-tooling'],
    },
  ],
  gateRequirements: [
    { gate: 'test', capabilities: ['typescript.test-tooling'] },
    { gate: 'lint', capabilities: ['typescript.eslint-lint-tooling'] },
    { gate: 'format', capabilities: ['typescript.format-tooling'] },
  ],
};

/** @purpose Production defaults; new platforms extend this value or inject another registry. */
export const DEFAULT_CAPABILITY_ADAPTER_REGISTRY: CapabilityAdapterRegistry = {
  [NODE_NPM_CAPABILITY_ADAPTER.id]: NODE_NPM_CAPABILITY_ADAPTER,
  [TYPESCRIPT_CAPABILITY_ADAPTER.id]: TYPESCRIPT_CAPABILITY_ADAPTER,
  [TYPESCRIPT_QUALITY_CAPABILITY_ADAPTER.id]: TYPESCRIPT_QUALITY_CAPABILITY_ADAPTER,
};
