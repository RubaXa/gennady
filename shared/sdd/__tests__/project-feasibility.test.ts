// @file: Project proof over the unchanged six-column V2 Bootstrap Requirements format.
// @consumers: checkProjectFeasibility, checkScaffoldDraftPlan
// @tasks: N/A

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  checkProjectFeasibility,
  checkScaffoldDraftPlan,
  checkScaffoldPlanMaterialization,
  deriveProjectFeasibilityContext,
  projectSpecDigest,
  type ProjectSpecRef,
  type ScaffoldDraftPlan,
} from '../project-feasibility.ts';

type Row = {
  requirement: string;
  kind: 'file' | 'package' | 'tool';
  owner?: 'this-scope-task' | 'external-prereq-scope';
  gates?: string[];
  artifacts: string[];
};

function spec(scope: string, dependencies: string[], rows: Row[]): ProjectSpecRef {
  return {
    file: `specs/${scope}/${scope}.spec.md`,
    scope,
    dependencies,
    content: [
      '<!--SECTION:BOOTSTRAP_REQUIREMENTS-->',
      '| Requirement | Kind | Owner | Resolution | Readiness Gates | Gate Artifacts |',
      '|---|---|---|---|---|---|',
      ...rows.map(
        (row) =>
          `| ${row.requirement} | ${row.kind} | ${row.owner ?? 'this-scope-task'} | create | ${row.gates?.join(', ') || '—'} | ${row.artifacts.join(', ') || '—'} |`
      ),
      '<!--/SECTION:BOOTSTRAP_REQUIREMENTS-->',
    ].join('\n'),
  };
}

const RUNTIME: Row = {
  requirement: 'Node/npm runtime, engine and module mode',
  kind: 'file',
  artifacts: ['.nvmrc', 'package.json', '.npmrc'],
};
const DEPENDENCIES: Row = {
  requirement: 'Install dependencies',
  kind: 'package',
  artifacts: ['package.json', 'package-lock.json'],
};

describe('project feasibility before spec approval', () => {
  it('does not infer runtime or capability order from requirement prose', () => {
    const named = checkProjectFeasibility([
      spec('infra-base', [], [DEPENDENCIES]),
      spec('todos-app', ['infra-base'], [RUNTIME]),
    ]).map((finding) => finding.code);
    const opaque = checkProjectFeasibility([
      spec('infra-base', [], [{ ...DEPENDENCIES, requirement: 'Prepare the blue envelope' }]),
      spec('todos-app', ['infra-base'], [{ ...RUNTIME, requirement: 'Apply item seven' }]),
    ]).map((finding) => finding.code);

    assert.deepStrictEqual(named, opaque);
    assert.ok(!named.some((code) => code.includes('CAPABILITY')));
  });

  it('rejects a package row that hides the manifest or lockfile writer', () => {
    const findings = checkProjectFeasibility([
      spec('infra-base', [], [RUNTIME, { ...DEPENDENCIES, artifacts: ['package.json'] }]),
    ]);
    assert.ok(findings.some((finding) => finding.code === 'SDD_PROJECT_PACKAGE_ARTIFACTS_MISSING'));
  });

  it('accepts runtime upstream and serialized package ownership expressed in the existing format', () => {
    assert.deepStrictEqual(
      checkProjectFeasibility([
        spec('infra-base', [], [RUNTIME, DEPENDENCIES]),
        spec(
          'todos-app',
          ['infra-base'],
          [{ ...DEPENDENCIES, requirement: 'Install app packages' }]
        ),
      ]),
      []
    );
  });

  it('accepts an explicit "No external bootstrap required." declaration as an empty list', () => {
    // Pure-function scopes (e.g. a Fibonacci `nth`) legitimately have no external bootstrap; the
    // skeleton tells the author to declare it verbatim. The checker must not reject that exact
    // wording as an incomplete row (which routed scaffold back into authoring for chain-2).
    const ref: ProjectSpecRef = {
      file: 'specs/fibonacci/fibonacci.spec.md',
      scope: 'fibonacci',
      dependencies: [],
      content: [
        '<!--SECTION:BOOTSTRAP_REQUIREMENTS-->',
        '| Requirement | Kind | Owner | Resolution | Readiness Gates | Gate Artifacts |',
        '|---|---|---|---|---|---|',
        '| No external bootstrap required. |  |  |  | — | — |',
        '<!--/SECTION:BOOTSTRAP_REQUIREMENTS-->',
      ].join('\n'),
    };
    const findings = checkProjectFeasibility([ref]);
    assert.ok(
      !findings.some((finding) => finding.code === 'SDD_PROJECT_BOOTSTRAP_ROW_INCOMPLETE'),
      `unexpected bootstrap findings: ${JSON.stringify(findings)}`
    );
  });

  it('emits exact row fields without guessed adapter or capability facts', () => {
    const [requirement] = deriveProjectFeasibilityContext([
      spec(
        'infra-base',
        [],
        [
          {
            requirement: 'Vitest Node npm TypeScript lint format',
            kind: 'tool',
            gates: ['test', 'lint'],
            artifacts: ['tool.config.ts'],
          },
        ]
      ),
    ]).requirements;

    assert.deepStrictEqual(
      Object.keys(requirement!).sort(),
      ['artifacts', 'gates', 'kind', 'owner', 'ref', 'requirement', 'resolution', 'scope'].sort()
    );
  });
});

describe('scaffold plan proof before Gate 1', () => {
  const refs = [spec('infra-base', [], [RUNTIME, DEPENDENCIES])];
  const context = deriveProjectFeasibilityContext(refs);
  const runtimeRef = context.requirements[0]!.ref;
  const dependenciesRef = context.requirements[1]!.ref;

  function runtimePlan(): ScaffoldDraftPlan {
    return {
      schema: 'sdd-scaffold-plan/v1',
      specs: [{ path: refs[0]!.file, digest: projectSpecDigest(refs[0]!.content) }],
      nodes: [
        {
          id: 'IB-runtime/P1',
          scope: 'infra-base',
          dependencies: [],
          requirementRefs: [runtimeRef],
          adapter: 'node',
          action: null,
          targets: ['.nvmrc', 'package.json', '.npmrc'],
          provides: [
            'node.runtime-version',
            'node.manifest-engine',
            'node.manifest-module-kind',
            'node.registry-config',
            'node.runtime',
            'node.package-manager',
          ],
          requires: [],
        },
      ],
    };
  }

  it('rejects an approved requirement omitted from the proposed task plan', () => {
    const findings = checkScaffoldDraftPlan(refs, runtimePlan());
    assert.ok(findings.some((finding) => finding.code === 'SDD_SCAFFOLD_PLAN_REQUIREMENT_MISSING'));
  });

  it('rejects dependency installation before Node/npm runtime', () => {
    const draft = runtimePlan();
    draft.nodes.push({
      id: 'IB-install/P1',
      scope: 'infra-base',
      dependencies: [],
      requirementRefs: [dependenciesRef],
      adapter: 'node',
      action: 'dependency-install',
      targets: ['package.json', 'package-lock.json'],
      provides: ['node.dependencies'],
      requires: [
        'node.runtime-version',
        'node.manifest-engine',
        'node.manifest-module-kind',
        'node.registry-config',
        'node.package-manager',
      ],
    });

    const findings = checkScaffoldDraftPlan(refs, draft);
    assert.ok(
      findings.some((finding) => finding.code === 'SDD_SCAFFOLD_PLAN_CAPABILITY_PREREQUISITE_ORDER')
    );
    assert.ok(
      findings.some((finding) => finding.code === 'SDD_SCAFFOLD_PLAN_SHARED_WRITER_OVERLAP')
    );
  });

  it('accepts agent-selected capability facts without deriving them from row prose', () => {
    const opaqueRefs = [
      spec(
        'infra-base',
        [],
        [
          { ...RUNTIME, requirement: 'Prepare item seven' },
          { ...DEPENDENCIES, requirement: 'Apply the blue envelope' },
        ]
      ),
    ];
    const opaqueContext = deriveProjectFeasibilityContext(opaqueRefs);
    const draft = runtimePlan();
    draft.specs = [
      { path: opaqueRefs[0]!.file, digest: projectSpecDigest(opaqueRefs[0]!.content) },
    ];
    draft.nodes[0]!.requirementRefs = [opaqueContext.requirements[0]!.ref];
    draft.nodes.push({
      id: 'IB-install/P1',
      scope: 'infra-base',
      dependencies: ['IB-runtime/P1'],
      requirementRefs: [opaqueContext.requirements[1]!.ref],
      adapter: 'node',
      action: 'dependency-install',
      targets: ['package.json', 'package-lock.json', 'agent-selected-extra.json'],
      provides: ['node.dependencies'],
      requires: [
        'node.runtime-version',
        'node.manifest-engine',
        'node.manifest-module-kind',
        'node.registry-config',
        'node.package-manager',
      ],
    });

    assert.deepStrictEqual(checkScaffoldDraftPlan(opaqueRefs, draft), []);
  });

  it('leaves semantic mismatch to the reviewer when the explicit plan is structurally valid', () => {
    const semanticRefs = [
      spec(
        'infra-base',
        [],
        [
          {
            requirement: 'Configure the TypeScript compiler',
            kind: 'tool',
            artifacts: ['tsconfig.json'],
          },
        ]
      ),
    ];
    const semanticContext = deriveProjectFeasibilityContext(semanticRefs);
    const semanticallyWrong: ScaffoldDraftPlan = {
      schema: 'sdd-scaffold-plan/v1',
      specs: [
        {
          path: semanticRefs[0]!.file,
          digest: projectSpecDigest(semanticRefs[0]!.content),
        },
      ],
      nodes: [
        {
          id: 'IB-wrong/P1',
          scope: 'infra-base',
          dependencies: [],
          requirementRefs: [semanticContext.requirements[0]!.ref],
          adapter: 'node',
          action: null,
          targets: ['tsconfig.json'],
          provides: ['node.runtime'],
          requires: [],
        },
      ],
    };

    assert.deepStrictEqual(checkScaffoldDraftPlan(semanticRefs, semanticallyWrong), []);
  });

  it('rejects internally invalid explicit adapter and capability claims', () => {
    const draft = runtimePlan();
    draft.nodes[0]!.adapter = 'typescript';
    const mismatch = checkScaffoldDraftPlan(refs, draft);
    assert.ok(
      mismatch.some((finding) => finding.code === 'SDD_SCAFFOLD_PLAN_CAPABILITY_ADAPTER_MISMATCH')
    );

    draft.nodes[0]!.adapter = 'unknown-platform';
    const unknown = checkScaffoldDraftPlan(refs, draft);
    assert.ok(unknown.some((finding) => finding.code === 'SDD_SCAFFOLD_PLAN_ADAPTER_UNKNOWN'));
  });

  it('rejects ticket materialization that changes approved targets', () => {
    const draft = runtimePlan();
    const materialized = [{ ...draft.nodes[0]!, requirementRefs: [], targets: ['package.json'] }];
    const findings = checkScaffoldPlanMaterialization(draft, materialized);
    assert.ok(
      findings.some((finding) => finding.code === 'SDD_SCAFFOLD_PLAN_MATERIALIZATION_DRIFT')
    );
  });
});
