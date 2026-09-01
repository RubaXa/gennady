// @file: Platform-neutral capability-plan contract extracted from the draft.60 bootstrap failure.
// @consumers: checkScaffoldFeasibility
// @tasks: N/A

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkScaffoldFeasibility, type ScaffoldPackageBaseline } from '../scaffold-feasibility.ts';
import type { TicketCorpusRef } from '../ticket-resolve.ts';
import {
  DEFAULT_CAPABILITY_ADAPTER_REGISTRY,
  NODE_NPM_CAPABILITY_ADAPTER,
  TYPESCRIPT_CAPABILITY_ADAPTER,
  TYPESCRIPT_QUALITY_CAPABILITY_ADAPTER,
  type CapabilityAdapter,
  type CapabilityAdapterRegistry,
} from '../capability-adapter.ts';

type PhaseFixture = {
  id: string;
  adapterId?: string;
  kind?: 'bootstrap' | 'config' | 'impl' | 'test';
  deps?: string[];
  rules?: string[];
  targets: string[];
  action?: 'dependency-install';
  providesPackages?: string[];
  requiresPackages?: string[];
  providesCapabilities?: string[];
  requiresCapabilities?: string[];
};

type TicketFixture = {
  id: string;
  adapterId?: string;
  dependencies?: string[];
  phases: PhaseFixture[];
};

const NODE_ADAPTER = NODE_NPM_CAPABILITY_ADAPTER;
const TYPESCRIPT_ADAPTER = TYPESCRIPT_CAPABILITY_ADAPTER;
const TYPESCRIPT_QUALITY_ADAPTER_FIXTURE = TYPESCRIPT_QUALITY_CAPABILITY_ADAPTER;

const FAKE_ADAPTER: CapabilityAdapter = {
  id: 'fake-mobile',
  dependencyBoundary: {
    manifestPath: 'fake-project.toml',
    lockfilePath: 'fake.lock',
    capability: 'fake.dependencies',
  },
  artifacts: [
    { id: 'fake.runtime-version', location: { kind: 'path', path: 'fake.version' }, order: 1 },
    {
      id: 'fake.manifest-runtime',
      location: { kind: 'field', path: 'fake-project.toml', field: 'runtime' },
      order: 2,
    },
    { id: 'fake.registry-config', location: { kind: 'path', path: 'fake.registry' }, order: 3 },
    { id: 'fake.dependencies', location: { kind: 'path', path: 'fake.lock' }, order: 4 },
  ],
  layers: [
    { kind: 'runtime', capability: 'fake.runtime', requires: [] },
    {
      kind: 'package-manager',
      capability: 'fake.package-manager',
      requires: ['fake.runtime'],
    },
    {
      kind: 'language-compiler',
      capability: 'fake.language-compiler',
      requires: ['fake.package-manager'],
    },
    {
      kind: 'quality-test-tooling',
      capability: 'fake.quality-test-tooling',
      requires: ['fake.language-compiler'],
    },
    {
      kind: 'app-platform',
      capability: 'fake.app-platform',
      requires: ['fake.quality-test-tooling'],
    },
  ],
  requiredRules: [
    {
      rulePath: 'test-fixture://fake-mobile-toolchain-setup',
      actions: ['dependency-install'],
      capabilities: [
        'fake.runtime-version',
        'fake.manifest-runtime',
        'fake.registry-config',
        'fake.dependencies',
        'fake.runtime',
        'fake.package-manager',
      ],
    },
  ],
  gateRequirements: [],
};

const REGISTRY: CapabilityAdapterRegistry = {
  ...DEFAULT_CAPABILITY_ADAPTER_REGISTRY,
  [TYPESCRIPT_QUALITY_ADAPTER_FIXTURE.id]: TYPESCRIPT_QUALITY_ADAPTER_FIXTURE,
  'fake-mobile': FAKE_ADAPTER,
};

function dependencyBoundary(adapter: CapabilityAdapter) {
  assert.ok(adapter.dependencyBoundary, `${adapter.id} fixture needs a dependency boundary`);
  return adapter.dependencyBoundary;
}

function setupRule(adapter: CapabilityAdapter): string {
  const rule = adapter.requiredRules[0]?.rulePath;
  assert.ok(rule, `${adapter.id} fixture needs one setup rule`);
  return rule;
}

function ticket(fixture: TicketFixture): TicketCorpusRef {
  const dependencies = fixture.dependencies ?? [];
  const phases = fixture.phases.flatMap((phase) => [
    `<!--SECTION:PHASE_${phase.id}-->`,
    `### ${phase.id} — ${phase.kind ?? 'config'}`,
    `- **Objective:** ${phase.adapterId ?? fixture.adapterId ?? 'unassigned'} capability ${phase.id}`,
    ...((phase.adapterId ?? fixture.adapterId)
      ? [`- **Capability Adapter:** ${phase.adapterId ?? fixture.adapterId}`]
      : []),
    ...(phase.action ? [`- **Bootstrap Action:** ${phase.action}`] : []),
    ...(phase.providesPackages
      ? [`- **Provides Packages:** ${phase.providesPackages.join(', ')}`]
      : []),
    ...(phase.requiresPackages
      ? [`- **Requires Packages:** ${phase.requiresPackages.join(', ')}`]
      : []),
    ...(phase.providesCapabilities
      ? [`- **Provides Capabilities:** ${phase.providesCapabilities.join(', ')}`]
      : []),
    ...(phase.requiresCapabilities
      ? [`- **Requires Capabilities:** ${phase.requiresCapabilities.join(', ')}`]
      : []),
    '- **Rules:**',
    ...(phase.rules?.length ? phase.rules.map((rule) => `  - [rule](${rule})`) : ['  - none']),
    '- **Target Files:**',
    ...phase.targets.map((target) => `  - ${target}`),
    '- **Deleted Files:**',
    '  - none',
    '- **Inputs:** none',
    '- **Exit:** capability state is materialized',
    `<!--/SECTION:PHASE_${phase.id}-->`,
  ]);
  const content = [
    `# Task: ${fixture.id}`,
    '<!--SECTION:META-->',
    `- **Task-ID:** ${fixture.id}`,
    '- **Status:** [ ] TODO',
    '- **Scope:** infra',
    '- **Module:** N/A',
    `- **Dependencies:** ${dependencies.join(', ') || 'None'}`,
    '<!--/SECTION:META-->',
    '<!--SECTION:PHASES_OVERVIEW-->',
    '| ID | Kind | Deps | Status |',
    '|---|---|---|---|',
    ...fixture.phases.map(
      (phase) =>
        `| ${phase.id} | ${phase.kind ?? 'config'} | ${phase.deps?.join(', ') || '—'} | [ ] |`
    ),
    '<!--/SECTION:PHASES_OVERVIEW-->',
    ...phases,
    '<!--SECTION:BDD-->',
    '**Scenario:** ordered capability plan [`unit`] [CAP-REQ-1]',
    '- **Given** a clean repository',
    '- **When** the capability DAG is evaluated',
    '- **Then** every prerequisite precedes its consumer',
    '<!--/SECTION:BDD-->',
    '<!--SECTION:VERIFICATION-->',
    '| Command | Required by | Role |',
    '|---|---|---|',
    '| — | — | extra |',
    '<!--/SECTION:VERIFICATION-->',
    '<!--SECTION:TEST_COVERAGE-->',
    '- ordered capability plan → `test/capability-plan.test.ts` :: `ordered capability plan`',
    '<!--/SECTION:TEST_COVERAGE-->',
  ].join('\n');
  return {
    file: `specs/infra/infra.task.${fixture.id}.md`,
    taskId: fixture.id,
    status: '[ ] TODO',
    dependencies,
    scope: 'infra',
    flowVersion: 'v2',
    content,
  };
}

function baseline(adapter: CapabilityAdapter): ScaffoldPackageBaseline {
  return {
    declaredPackages: new Set(),
    activeLockfiles: [dependencyBoundary(adapter).lockfilePath],
    scripts: {},
    availableArtifacts: new Set(['tsconfig.json']),
  };
}

function findingsFor(
  registry: CapabilityAdapterRegistry,
  refs: TicketCorpusRef[],
  adapter: CapabilityAdapter
) {
  return checkScaffoldFeasibility(refs, baseline(adapter), registry);
}

function assertActionable(message: string): void {
  assert.match(message, /Expected:/);
  assert.match(message, /Next:/);
}

function oneInstallTicket(
  adapter: CapabilityAdapter,
  options: { rule: boolean; prerequisitesBeforeInstall: boolean }
): TicketCorpusRef {
  const boundary = dependencyBoundary(adapter);
  const prerequisiteIds = adapter.artifacts
    .filter((artifact) => artifact.id !== boundary.capability)
    .map((artifact) => artifact.id);
  const prerequisitePaths = adapter.artifacts.flatMap((artifact) =>
    artifact.location.kind === 'path' && artifact.location.path !== boundary.lockfilePath
      ? [artifact.location.path]
      : []
  );
  return ticket({
    id: `${adapter.id}-install`,
    adapterId: adapter.id,
    phases: options.prerequisitesBeforeInstall
      ? [
          {
            id: 'P1',
            kind: 'config',
            rules: options.rule ? [setupRule(adapter)] : [],
            targets: [boundary.manifestPath, boundary.lockfilePath, ...prerequisitePaths],
            action: 'dependency-install',
            providesPackages: [`${adapter.id}-compiler`],
            providesCapabilities: [...prerequisiteIds, boundary.capability],
          },
        ]
      : [
          {
            id: 'P1',
            kind: 'config',
            rules: options.rule ? [setupRule(adapter)] : [],
            targets: [boundary.manifestPath, boundary.lockfilePath],
            action: 'dependency-install',
            providesPackages: [`${adapter.id}-compiler`],
            providesCapabilities: [boundary.capability],
          },
          {
            id: 'P2',
            kind: 'config',
            deps: ['P1'],
            rules: [setupRule(adapter)],
            targets: [
              boundary.manifestPath,
              ...adapter.artifacts.flatMap((artifact) =>
                artifact.location.kind === 'path' &&
                artifact.location.path !== boundary.lockfilePath
                  ? [artifact.location.path]
                  : []
              ),
            ],
            providesCapabilities: prerequisiteIds,
          },
        ],
  });
}

describe('platform adapter registry contract', () => {
  for (const adapter of [NODE_ADAPTER, FAKE_ADAPTER]) {
    it(`${adapter.id}: reports the adapter rule missing from the dependency-install phase`, () => {
      const findings = findingsFor(
        REGISTRY,
        [oneInstallTicket(adapter, { rule: false, prerequisitesBeforeInstall: true })],
        adapter
      );
      const ruleFinding = findings.find((finding) => finding.code.includes('PLATFORM_RULE'));
      assert.ok(ruleFinding);
      assertActionable(ruleFinding.message);
      assert.deepStrictEqual(
        findings
          .filter((finding) => finding.code.includes('PLATFORM_RULE'))
          .map((finding) => ({
            code: finding.code,
            rule: setupRule(adapter),
            mentionsRule: finding.message.includes(setupRule(adapter)),
          })),
        [
          {
            code: 'SDD_SCAFFOLD_PLATFORM_RULE_CASCADE_MISSING',
            rule: setupRule(adapter),
            mentionsRule: true,
          },
        ]
      );
    });

    it(`${adapter.id}: reports prerequisite capability artifacts owned only after install`, () => {
      const findings = findingsFor(
        REGISTRY,
        [oneInstallTicket(adapter, { rule: true, prerequisitesBeforeInstall: false })],
        adapter
      );
      const orderFinding = findings.find((finding) => finding.code.includes('CAPABILITY_ARTIFACT'));
      assert.ok(orderFinding);
      assertActionable(orderFinding.message);
      assert.deepStrictEqual(
        findings
          .filter((finding) => finding.code.includes('CAPABILITY_ARTIFACT'))
          .map((finding) => finding.code),
        ['SDD_SCAFFOLD_CAPABILITY_ARTIFACT_ORDER']
      );
    });
  }

  it('does not require the Node setup rule for an unrelated app capability', () => {
    const refs = [
      ticket({
        id: 'APP-unrelated',
        adapterId: NODE_ADAPTER.id,
        phases: [
          {
            id: 'P1',
            kind: 'impl',
            targets: ['src/app.ts'],
            providesCapabilities: ['app.feature'],
          },
        ],
      }),
    ];
    const findings = findingsFor(REGISTRY, refs, NODE_ADAPTER);
    assert.deepStrictEqual(
      findings.filter((finding) => finding.code === 'SDD_SCAFFOLD_PLATFORM_RULE_CASCADE_MISSING'),
      []
    );
  });

  it('requires an explicit adapter before evaluating a dependency-install action', () => {
    const refs = [
      ticket({
        id: 'IB-unassigned-install',
        phases: [
          {
            id: 'P1',
            kind: 'bootstrap',
            targets: ['package.json'],
            action: 'dependency-install',
          },
        ],
      }),
    ];
    const findings = checkScaffoldFeasibility(
      refs,
      { declaredPackages: new Set(), activeLockfiles: [], scripts: {} },
      REGISTRY
    );
    const missing = findings.find(
      (finding) => finding.code === 'SDD_SCAFFOLD_CAPABILITY_ADAPTER_MISSING'
    );
    assert.ok(missing);
    assert.match(missing.message, /Expected: one adapter id from fake-mobile, node, typescript/);
    assert.match(
      missing.message,
      /Next: set the phase's Capability Adapter field, then rerun scaffold feasibility/
    );
  });
});

function layerChainTicket(
  adapter: CapabilityAdapter,
  defect: 'none' | 'missing-language-edge' | 'reversed-language-quality-edge'
): TicketCorpusRef {
  const ids = adapter.layers.map((_, index) => `P${index + 1}`);
  return ticket({
    id: `${adapter.id}-layer-chain`,
    adapterId: adapter.id,
    phases: adapter.layers.map((layer, index) => {
      const previous = index === 0 ? [] : [ids[index - 1] as string];
      let deps = previous;
      if (layer.kind === 'language-compiler' && defect === 'missing-language-edge') deps = [];
      if (layer.kind === 'language-compiler' && defect === 'reversed-language-quality-edge') {
        deps = [ids[index + 1] as string];
      }
      if (layer.kind === 'quality-test-tooling' && defect === 'reversed-language-quality-edge') {
        deps = [ids[index - 2] as string];
      }
      return {
        id: ids[index] as string,
        kind: 'config' as const,
        deps,
        rules: [setupRule(adapter)],
        targets: [`capabilities/${adapter.id}/${layer.kind}.state`],
        providesCapabilities: [layer.capability],
        requiresCapabilities: [...layer.requires],
      };
    }),
  });
}

describe('platform-neutral capability layer DAG', () => {
  function productionLanguageChain(linked: boolean): TicketCorpusRef[] {
    const nodeTargets = [
      ...new Set(NODE_ADAPTER.artifacts.map((artifact) => artifact.location.path)),
    ];
    return [
      ticket({
        id: 'IB-node-runtime-and-packages',
        adapterId: NODE_ADAPTER.id,
        phases: [
          {
            id: 'P1',
            kind: 'bootstrap',
            rules: [setupRule(NODE_ADAPTER)],
            targets: nodeTargets,
            action: 'dependency-install',
            providesCapabilities: [
              ...NODE_ADAPTER.artifacts.map((artifact) => artifact.id),
              'node.runtime',
              'node.package-manager',
            ],
            requiresCapabilities: ['node.runtime'],
          },
        ],
      }),
      ticket({
        id: 'IB-typescript',
        adapterId: TYPESCRIPT_ADAPTER.id,
        dependencies: linked ? ['IB-node-runtime-and-packages'] : [],
        phases: [
          {
            id: 'P1',
            kind: 'config',
            targets: ['tsconfig.json'],
            providesCapabilities: ['typescript.compiler'],
            requiresCapabilities: ['node.package-manager', 'node.dependencies'],
          },
        ],
      }),
    ];
  }

  it('selects TypeScript separately from Node/npm and accepts the cross-adapter DAG', () => {
    assert.deepStrictEqual(
      NODE_ADAPTER.layers.map((layer) => layer.kind),
      ['runtime', 'package-manager']
    );
    assert.deepStrictEqual(
      TYPESCRIPT_ADAPTER.layers.map((layer) => layer.kind),
      ['language-compiler']
    );
    assert.deepStrictEqual(findingsFor(REGISTRY, productionLanguageChain(true), NODE_ADAPTER), []);
  });

  it('rejects a missing Node/npm → TypeScript cross-adapter edge before execute', () => {
    const findings = findingsFor(REGISTRY, productionLanguageChain(false), NODE_ADAPTER);
    const order = findings.filter((finding) => finding.code.includes('CAPABILITY_LAYER_ORDER'));
    assert.ok(order.length > 0);
    order.forEach((finding) => assertActionable(finding.message));
  });

  it('fake-mobile accepts the complete five-layer taxonomy', () => {
    assert.deepStrictEqual(
      FAKE_ADAPTER.layers.map((layer) => layer.kind),
      ['runtime', 'package-manager', 'language-compiler', 'quality-test-tooling', 'app-platform']
    );
    assert.deepStrictEqual(
      findingsFor(REGISTRY, [layerChainTicket(FAKE_ADAPTER, 'none')], FAKE_ADAPTER),
      []
    );
  });

  it('fake-mobile rejects a reversed language/quality edge before execute', () => {
    const findings = findingsFor(
      REGISTRY,
      [layerChainTicket(FAKE_ADAPTER, 'reversed-language-quality-edge')],
      FAKE_ADAPTER
    );
    const layerFinding = findings.find((finding) => finding.code.includes('CAPABILITY_LAYER'));
    assert.ok(layerFinding);
    assertActionable(layerFinding.message);
  });
});

describe('requirement-selected Node → TypeScript → quality/test workstream', () => {
  const TEST_CAPABILITY = 'typescript.test-tooling';
  const LINT_CAPABILITY = 'typescript.eslint-lint-tooling';
  const FORMAT_CAPABILITY = 'typescript.format-tooling';
  const eslintRule = 'ai/directives/infra/eslint-setup.xml';

  function productionToolchain(options: {
    selected: Array<'test' | 'lint' | 'format'>;
    qualityDependsOnTypeScript?: boolean;
    materializePrettierBridge?: boolean;
    lintRule?: boolean;
    monolithicClaim?: boolean;
  }): TicketCorpusRef[] {
    const nodeTargets = [
      ...new Set(NODE_ADAPTER.artifacts.map((artifact) => artifact.location.path)),
    ];
    const packages = [
      'typescript',
      ...(options.selected.includes('test') ? ['vitest'] : []),
      ...(options.selected.includes('format') ? ['prettier'] : []),
      ...(options.selected.includes('lint')
        ? [
            'eslint',
            ...(options.materializePrettierBridge === false ? [] : ['eslint-config-prettier']),
          ]
        : []),
    ];
    const qualityPhases: PhaseFixture[] = options.monolithicClaim
      ? [
          {
            id: 'P1',
            adapterId: TYPESCRIPT_QUALITY_ADAPTER_FIXTURE.id,
            kind: 'config',
            targets: ['package.json'],
            providesCapabilities: ['typescript.quality-test-tooling'],
            requiresCapabilities: ['typescript.compiler', 'node.dependencies'],
          },
        ]
      : options.selected.map((selected, index) => {
          const id = `P${index + 1}`;
          const deps = index === 0 ? [] : [`P${index}`];
          if (selected === 'test') {
            return {
              id,
              kind: 'config',
              deps,
              targets: ['package.json'],
              requiresPackages: ['vitest'],
              providesCapabilities: [TEST_CAPABILITY],
              requiresCapabilities: ['typescript.compiler', 'node.dependencies'],
            };
          }
          if (selected === 'format') {
            return {
              id,
              kind: 'config',
              deps,
              targets: ['package.json'],
              requiresPackages: ['prettier'],
              providesCapabilities: [FORMAT_CAPABILITY],
              requiresCapabilities: ['typescript.compiler', 'node.dependencies'],
            };
          }
          return {
            id,
            kind: 'config',
            deps,
            rules: options.lintRule === false ? [] : [eslintRule],
            targets: ['package.json', 'eslint.config.mjs'],
            requiresPackages: ['eslint', 'eslint-config-prettier'],
            providesCapabilities: [LINT_CAPABILITY],
            requiresCapabilities: ['typescript.compiler', 'node.dependencies'],
          };
        });
    return [
      ticket({
        id: 'IB-node-foundation',
        adapterId: NODE_ADAPTER.id,
        phases: [
          {
            id: 'P1',
            kind: 'bootstrap',
            rules: [setupRule(NODE_ADAPTER)],
            targets: nodeTargets,
            action: 'dependency-install',
            providesPackages: packages,
            providesCapabilities: [
              ...NODE_ADAPTER.artifacts.map((artifact) => artifact.id),
              ...NODE_ADAPTER.layers.map((layer) => layer.capability),
            ],
            requiresCapabilities: ['node.runtime'],
          },
        ],
      }),
      ticket({
        id: 'IB-typescript-config',
        adapterId: TYPESCRIPT_ADAPTER.id,
        dependencies: ['IB-node-foundation'],
        phases: [
          {
            id: 'P1',
            kind: 'config',
            targets: ['tsconfig.json'],
            requiresPackages: ['typescript'],
            providesCapabilities: ['typescript.compiler'],
            requiresCapabilities: ['node.package-manager', 'node.dependencies'],
          },
        ],
      }),
      ticket({
        id: 'IB-quality-tooling',
        dependencies: [
          options.qualityDependsOnTypeScript === false
            ? 'IB-node-foundation'
            : 'IB-typescript-config',
        ],
        adapterId: TYPESCRIPT_QUALITY_ADAPTER_FIXTURE.id,
        phases: qualityPhases,
      }),
    ];
  }

  it('ships the real quality/test capability family in the default registry', () => {
    assert.deepStrictEqual(
      DEFAULT_CAPABILITY_ADAPTER_REGISTRY[TYPESCRIPT_QUALITY_ADAPTER_FIXTURE.id],
      TYPESCRIPT_QUALITY_ADAPTER_FIXTURE
    );
  });

  it('accepts test-only tooling without the ESLint rule or lint/format capabilities', () => {
    assert.deepStrictEqual(
      TYPESCRIPT_QUALITY_ADAPTER_FIXTURE.artifacts.find(
        (artifact) => artifact.id === TEST_CAPABILITY
      )?.location,
      { kind: 'field', path: 'package.json', field: 'scripts.test' }
    );
    assert.ok(
      TYPESCRIPT_QUALITY_ADAPTER_FIXTURE.requiredRules.every(
        (requirement) => !requirement.capabilities.includes(TEST_CAPABILITY)
      )
    );
    assert.deepStrictEqual(
      findingsFor(REGISTRY, productionToolchain({ selected: ['test'] }), NODE_ADAPTER),
      []
    );
  });

  it('accepts format-only tooling without activating the ESLint rule', () => {
    assert.deepStrictEqual(
      TYPESCRIPT_QUALITY_ADAPTER_FIXTURE.artifacts.find(
        (artifact) => artifact.id === FORMAT_CAPABILITY
      )?.location,
      { kind: 'field', path: 'package.json', field: 'scripts.format' }
    );
    assert.ok(
      TYPESCRIPT_QUALITY_ADAPTER_FIXTURE.requiredRules.every(
        (requirement) => !requirement.capabilities.includes(FORMAT_CAPABILITY)
      )
    );
    assert.deepStrictEqual(
      findingsFor(REGISTRY, productionToolchain({ selected: ['format'] }), NODE_ADAPTER),
      []
    );
  });

  it('requires the exact ESLint rule only when the ESLint lint implementation is selected', () => {
    assert.deepStrictEqual(TYPESCRIPT_QUALITY_ADAPTER_FIXTURE.requiredRules, [
      { rulePath: eslintRule, actions: [], capabilities: [LINT_CAPABILITY] },
    ]);
    const missing = findingsFor(
      REGISTRY,
      productionToolchain({ selected: ['lint'], lintRule: false }),
      NODE_ADAPTER
    ).find((finding) => finding.code === 'SDD_SCAFFOLD_PLATFORM_RULE_CASCADE_MISSING');
    assert.ok(missing);
    assert.match(missing.message, new RegExp(eslintRule.replaceAll('.', '\\.')));
    assert.deepStrictEqual(
      findingsFor(REGISTRY, productionToolchain({ selected: ['lint'] }), NODE_ADAPTER),
      []
    );
  });

  it('proves test, ESLint lint, and format capabilities through separate materialization fields', () => {
    assert.deepStrictEqual(
      TYPESCRIPT_QUALITY_ADAPTER_FIXTURE.artifacts.map((artifact) => [
        artifact.id,
        artifact.location,
      ]),
      [
        [TEST_CAPABILITY, { kind: 'field', path: 'package.json', field: 'scripts.test' }],
        [LINT_CAPABILITY, { kind: 'field', path: 'package.json', field: 'scripts.lint' }],
        [FORMAT_CAPABILITY, { kind: 'field', path: 'package.json', field: 'scripts.format' }],
      ]
    );
    assert.deepStrictEqual(TYPESCRIPT_QUALITY_ADAPTER_FIXTURE.gateRequirements, [
      { gate: 'test', capabilities: [TEST_CAPABILITY] },
      { gate: 'lint', capabilities: [LINT_CAPABILITY] },
      { gate: 'format', capabilities: [FORMAT_CAPABILITY] },
    ]);
    assert.deepStrictEqual(
      findingsFor(
        REGISTRY,
        productionToolchain({ selected: ['test', 'lint', 'format'] }),
        NODE_ADAPTER
      ),
      []
    );
  });

  it('rejects the old monolithic quality claim instead of letting it greenwash all gates', () => {
    const finding = findingsFor(
      REGISTRY,
      productionToolchain({ selected: [], monolithicClaim: true }),
      NODE_ADAPTER
    ).find((candidate) => candidate.code === 'SDD_SCAFFOLD_CAPABILITY_NOT_DECLARED_BY_ADAPTER');
    assert.ok(finding);
    assert.match(finding.message, /typescript\.quality-test-tooling/);
    assert.match(
      finding.message,
      /Expected: one of typescript\.test-tooling, typescript\.eslint-lint-tooling, typescript\.format-tooling/
    );
    assert.match(finding.message, /Next: replace the claim in Provides Capabilities/);
    assertActionable(finding.message);
  });

  it('rejects quality/test tooling whose TypeScript provider is not upstream', () => {
    const finding = findingsFor(
      REGISTRY,
      productionToolchain({
        selected: ['lint'],
        qualityDependsOnTypeScript: false,
      }),
      NODE_ADAPTER
    ).find((candidate) => candidate.code === 'SDD_SCAFFOLD_CAPABILITY_LAYER_ORDER');
    assert.ok(finding);
    assert.match(finding.message, /typescript\.compiler/);
    assertActionable(finding.message);
  });

  it('rejects the draft.60 missing eslint-config-prettier materialization before execute', () => {
    const finding = findingsFor(
      REGISTRY,
      productionToolchain({
        selected: ['lint'],
        materializePrettierBridge: false,
      }),
      NODE_ADAPTER
    ).find((candidate) => candidate.code === 'SDD_SCAFFOLD_PACKAGE_PROVIDER_MISSING');
    assert.ok(finding);
    assert.match(finding.message, /IB-quality-tooling\/P1.+eslint-config-prettier/);
    assert.match(finding.message, /Expected: one DAG-reachable dependency-install provider/);
    assert.match(finding.message, /Next: add eslint-config-prettier to Provides Packages/);
  });
});

describe('capability provider and registry edges', () => {
  it('reports an unknown adapter with the registered ids and exact next action', () => {
    const refs = [
      ticket({
        id: 'unknown-adapter',
        adapterId: 'mystery-platform',
        phases: [{ id: 'P1', targets: ['mystery.project'] }],
      }),
    ];
    const finding = findingsFor(REGISTRY, refs, NODE_ADAPTER).find(
      (candidate) => candidate.code === 'SDD_SCAFFOLD_CAPABILITY_ADAPTER_UNKNOWN'
    );
    assert.ok(finding);
    assert.match(finding.message, /Expected: one of fake-mobile, node/);
    assert.match(finding.message, /Next: correct the field or register that platform adapter/);
  });

  it('rejects unordered duplicate capability providers', () => {
    const provider = (id: string) =>
      ticket({
        id,
        adapterId: NODE_ADAPTER.id,
        phases: [
          {
            id: 'P1',
            rules: [setupRule(NODE_ADAPTER)],
            targets: ['.nvmrc'],
            providesCapabilities: ['node.runtime-version'],
          },
        ],
      });
    const findings = findingsFor(
      REGISTRY,
      [provider('runtime-a'), provider('runtime-b')],
      NODE_ADAPTER
    );
    const duplicate = findings.find(
      (finding) => finding.code === 'SDD_SCAFFOLD_CAPABILITY_PROVIDER_DUPLICATE'
    );
    assert.ok(duplicate);
    assertActionable(duplicate.message);
    assert.deepStrictEqual(
      findings
        .filter((finding) => finding.code === 'SDD_SCAFFOLD_CAPABILITY_PROVIDER_DUPLICATE')
        .map((finding) => finding.code),
      ['SDD_SCAFFOLD_CAPABILITY_PROVIDER_DUPLICATE']
    );
  });

  it('reports a required capability with no provider', () => {
    const refs = [
      ticket({
        id: 'missing-runtime',
        adapterId: NODE_ADAPTER.id,
        phases: [
          {
            id: 'P1',
            targets: ['src/app.ts'],
            requiresCapabilities: ['node.runtime'],
          },
        ],
      }),
    ];
    const finding = findingsFor(REGISTRY, refs, NODE_ADAPTER).find(
      (candidate) => candidate.code === 'SDD_SCAFFOLD_CAPABILITY_PROVIDER_MISSING'
    );
    assert.ok(finding);
    assert.match(finding.message, /Expected: one reachable Provides Capabilities owner/);
    assert.match(finding.message, /Next: add the provider phase or correct the capability id/);
  });

  it('binds a field artifact capability to its real manifest Target File', () => {
    const refs = [
      ticket({
        id: 'wrong-field-owner',
        adapterId: NODE_ADAPTER.id,
        phases: [
          {
            id: 'P1',
            rules: [setupRule(NODE_ADAPTER)],
            targets: ['.nvmrc'],
            providesCapabilities: ['node.manifest-engine'],
          },
        ],
      }),
    ];
    const finding = findingsFor(REGISTRY, refs, NODE_ADAPTER).find(
      (candidate) => candidate.code === 'SDD_SCAFFOLD_CAPABILITY_ARTIFACT_TARGET_MISSING'
    );
    assert.ok(finding);
    assert.match(finding.message, /package\.json field 'engines\.node'/);
    assertActionable(finding.message);
  });

  for (const topology of ['within-ticket', 'cross-ticket'] as const) {
    it(`accepts ${topology} capability reachability`, () => {
      const providerPhase: PhaseFixture = {
        id: 'P1',
        rules: [setupRule(NODE_ADAPTER)],
        targets: ['capabilities/node-runtime.state'],
        providesCapabilities: ['node.runtime'],
      };
      const consumerPhase: PhaseFixture = {
        id: topology === 'within-ticket' ? 'P2' : 'P1',
        deps: topology === 'within-ticket' ? ['P1'] : [],
        targets: ['src/runtime-consumer.ts'],
        requiresCapabilities: ['node.runtime'],
      };
      const refs =
        topology === 'within-ticket'
          ? [
              ticket({
                id: 'runtime-chain',
                adapterId: NODE_ADAPTER.id,
                phases: [providerPhase, consumerPhase],
              }),
            ]
          : [
              ticket({
                id: 'runtime-provider',
                adapterId: NODE_ADAPTER.id,
                phases: [providerPhase],
              }),
              ticket({
                id: 'runtime-consumer',
                adapterId: NODE_ADAPTER.id,
                dependencies: ['runtime-provider'],
                phases: [consumerPhase],
              }),
            ];
      const findings = findingsFor(REGISTRY, refs, NODE_ADAPTER);
      assert.deepStrictEqual(
        findings.filter((finding) =>
          [
            'SDD_SCAFFOLD_CAPABILITY_PROVIDER_MISSING',
            'SDD_SCAFFOLD_CAPABILITY_PREREQUISITE_ORDER',
            'SDD_SCAFFOLD_CAPABILITY_LAYER_ORDER',
          ].includes(finding.code)
        ),
        []
      );
    });
  }
});

describe('shared manifest writer reachability', () => {
  const nodeBoundary = dependencyBoundary(NODE_ADAPTER);
  const prerequisiteCapabilities = NODE_ADAPTER.artifacts
    .filter((artifact) => artifact.id !== nodeBoundary.capability)
    .map((artifact) => artifact.id);
  const prerequisitePaths = NODE_ADAPTER.artifacts.flatMap((artifact) =>
    artifact.location.kind === 'path' && artifact.location.path !== nodeBoundary.lockfilePath
      ? [artifact.location.path]
      : []
  );

  function writer(
    id: string,
    dependencies: string[],
    providedPackage: string,
    providesPrerequisites = false
  ): TicketCorpusRef {
    return ticket({
      id,
      adapterId: NODE_ADAPTER.id,
      dependencies,
      phases: [
        {
          id: 'P1',
          kind: 'bootstrap',
          rules: [setupRule(NODE_ADAPTER)],
          targets: [
            nodeBoundary.manifestPath,
            nodeBoundary.lockfilePath,
            ...(providesPrerequisites ? prerequisitePaths : []),
          ],
          action: 'dependency-install',
          providesPackages: [providedPackage],
          providesCapabilities: [
            ...(providesPrerequisites ? prerequisiteCapabilities : []),
            nodeBoundary.capability,
          ],
        },
      ],
    });
  }

  function prerequisites(): TicketCorpusRef {
    return ticket({
      id: 'IB-node-prerequisites',
      adapterId: NODE_ADAPTER.id,
      phases: [
        {
          id: 'P1',
          kind: 'config',
          rules: [setupRule(NODE_ADAPTER)],
          targets: ['.nvmrc', '.npmrc', 'package.json'],
          providesCapabilities: prerequisiteCapabilities,
        },
      ],
    });
  }

  function consumer(dependencies: string[]): TicketCorpusRef {
    return ticket({
      id: 'APP-consumer',
      adapterId: NODE_ADAPTER.id,
      dependencies,
      phases: [
        {
          id: 'P1',
          kind: 'impl',
          targets: ['src/app.ts'],
          requiresPackages: ['node-runtime', 'typescript'],
          requiresCapabilities: [nodeBoundary.capability],
        },
      ],
    });
  }

  it('allows package.json and lockfile writers serialized by DAG reachability', () => {
    const refs = [
      writer('IB-node-runtime', [], 'node-runtime', true),
      writer('IB-typescript', ['IB-node-runtime'], 'typescript'),
      consumer(['IB-typescript']),
    ];
    const findings = findingsFor(REGISTRY, refs, NODE_ADAPTER);
    assert.deepStrictEqual(findings, []);
  });

  it('rejects unordered package.json and lockfile writers with an overlap diagnostic', () => {
    const refs = [
      prerequisites(),
      writer('IB-node-runtime', ['IB-node-prerequisites'], 'node-runtime'),
      writer('IB-typescript', ['IB-node-prerequisites'], 'typescript'),
      consumer(['IB-node-runtime', 'IB-typescript']),
    ];
    const findings = findingsFor(REGISTRY, refs, NODE_ADAPTER);
    const overlap = findings.find(
      (finding) => finding.code === 'SDD_SCAFFOLD_SHARED_ARTIFACT_WRITER_OVERLAP'
    );
    assert.ok(overlap);
    assertActionable(overlap.message);
    assert.deepStrictEqual(
      [
        ...new Set(
          findings
            .filter((finding) => finding.code.startsWith('SDD_SCAFFOLD_SHARED_ARTIFACT_'))
            .map((finding) => finding.code)
        ),
      ],
      ['SDD_SCAFFOLD_SHARED_ARTIFACT_WRITER_OVERLAP']
    );
  });

  it('requires the adapter future lockfile even when clean HEAD has no active lockfile', () => {
    const refs = [
      ticket({
        id: 'IB-first-install',
        adapterId: NODE_ADAPTER.id,
        phases: [
          {
            id: 'P1',
            kind: 'bootstrap',
            rules: [setupRule(NODE_ADAPTER)],
            targets: [...new Set(prerequisitePaths.concat(nodeBoundary.manifestPath))],
            action: 'dependency-install',
            providesCapabilities: [...prerequisiteCapabilities, nodeBoundary.capability],
          },
        ],
      }),
    ];
    const findings = checkScaffoldFeasibility(
      refs,
      { declaredPackages: new Set(), activeLockfiles: [], scripts: {} },
      REGISTRY
    );
    const incomplete = findings.find(
      (finding) => finding.code === 'SDD_SCAFFOLD_PACKAGE_PROVIDER_TARGETS_INCOMPLETE'
    );
    assert.ok(incomplete);
    assert.match(incomplete.message, /package-lock\.json/);
  });

  it('rejects unordered install writers even without package consumers', () => {
    const refs = [
      prerequisites(),
      writer('IB-first-writer', ['IB-node-prerequisites'], 'first-package'),
      writer('IB-second-writer', ['IB-node-prerequisites'], 'second-package'),
    ];
    const findings = findingsFor(REGISTRY, refs, NODE_ADAPTER);
    assert.ok(
      findings.some((finding) => finding.code === 'SDD_SCAFFOLD_SHARED_ARTIFACT_WRITER_OVERLAP')
    );
  });
});
