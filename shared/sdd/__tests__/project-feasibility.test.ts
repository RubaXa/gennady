// @file: Project-level bootstrap proof before spec approval and scaffold Gate 1.
// @consumers: checkProjectFeasibility, checkScaffoldDraftPlan
// @tasks: N/A

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  checkProjectFeasibility,
  checkScaffoldDraftPlan,
  checkScaffoldPlanMaterialization,
  projectSpecDigest,
  type ProjectSpecRef,
  type ScaffoldDraftPlan,
} from '../project-feasibility.ts';

type BootstrapRow = {
  id: string;
  requirement: string;
  kind: 'file' | 'package' | 'tool';
  owner?: 'this-scope-task' | 'external-prereq-scope';
  adapter: string;
  provides: string[];
  requires: string[];
  artifacts: string[];
};

function spec(
  scope: string,
  dependencies: string[],
  rows: BootstrapRow[],
  legacy = false
): ProjectSpecRef {
  const header = legacy
    ? '| Requirement | Kind | Owner | Resolution | Readiness Gates | Gate Artifacts |'
    : '| ID | Requirement | Kind | Owner | Resolution | Capability Adapter | Provides Capabilities | Requires Capabilities | Readiness Gates | Gate Artifacts |';
  const separator = legacy
    ? '|---|---|---|---|---|---|'
    : '|---|---|---|---|---|---|---|---|---|---|';
  const data = rows.map((row) =>
    legacy
      ? `| ${row.requirement} | ${row.kind} | ${row.owner ?? 'this-scope-task'} | create | — | ${row.artifacts.join(', ') || '—'} |`
      : `| ${row.id} | ${row.requirement} | ${row.kind} | ${row.owner ?? 'this-scope-task'} | create | ${row.adapter} | ${row.provides.join(', ') || '—'} | ${row.requires.join(', ') || '—'} | — | ${row.artifacts.join(', ') || '—'} |`
  );
  return {
    file: `specs/${scope}/${scope}.spec.md`,
    scope,
    dependencies,
    content: [
      '<!--SECTION:BOOTSTRAP_REQUIREMENTS-->',
      '## Prerequisites',
      '<details>',
      '<summary>Requirements</summary>',
      header,
      separator,
      ...data,
      '</details>',
      '<!--/SECTION:BOOTSTRAP_REQUIREMENTS-->',
    ].join('\n'),
  };
}

const RUNTIME: BootstrapRow = {
  id: 'BOOT-RUNTIME',
  requirement: 'Node runtime and registry configuration',
  kind: 'file',
  adapter: 'node',
  provides: [
    'node.runtime-version',
    'node.manifest-engine',
    'node.manifest-module-kind',
    'node.registry-config',
    'node.runtime',
    'node.package-manager',
  ],
  requires: [],
  artifacts: ['.nvmrc', '.npmrc', 'package.json'],
};

const DEPENDENCIES: BootstrapRow = {
  id: 'BOOT-DEPS',
  requirement: 'Install dependencies',
  kind: 'package',
  adapter: 'node',
  provides: ['node.dependencies'],
  requires: [
    'node.runtime-version',
    'node.manifest-engine',
    'node.manifest-module-kind',
    'node.registry-config',
    'node.package-manager',
  ],
  artifacts: ['package.json', 'package-lock.json'],
};

describe('project feasibility before spec approval', () => {
  it('rejects legacy Bootstrap Requirements because causal facts cannot be proved', () => {
    const refs = [spec('infra-base', [], [DEPENDENCIES], true)];

    const findings = checkProjectFeasibility(refs);

    assert.deepStrictEqual(
      findings.map((finding) => finding.code),
      ['SDD_PROJECT_BOOTSTRAP_FACTS_MISSING']
    );
    assert.match(findings[0]?.message ?? '', /ID.*Capability Adapter.*Provides Capabilities/);
    assert.match(findings[0]?.message ?? '', /before spec approval/);
  });

  it('rejects runtime selectors owned by a downstream product after infrastructure install', () => {
    const refs = [
      spec('infra-base', [], [DEPENDENCIES]),
      spec('todos-app', ['infra-base'], [RUNTIME]),
    ];

    const findings = checkProjectFeasibility(refs);

    const order = findings.find(
      (finding) => finding.code === 'SDD_PROJECT_CAPABILITY_PREREQUISITE_ORDER'
    );
    assert.ok(order);
    assert.match(order.message, /infra-base\/BOOT-DEPS/);
    assert.match(order.message, /todos-app\/BOOT-RUNTIME/);
    assert.match(order.message, /provider must be in the same scope or an upstream dependency/);
  });

  it('accepts runtime, package manager, and dependency installation in causal order', () => {
    const refs = [
      spec('infra-base', [], [RUNTIME, DEPENDENCIES]),
      spec(
        'todos-app',
        ['infra-base'],
        [
          {
            id: 'APP-DEPS',
            requirement: 'Install application packages',
            kind: 'package',
            adapter: 'node',
            provides: ['node.dependencies'],
            requires: [
              'node.runtime-version',
              'node.manifest-engine',
              'node.manifest-module-kind',
              'node.registry-config',
              'node.package-manager',
            ],
            artifacts: ['package.json', 'package-lock.json'],
          },
        ]
      ),
    ];

    assert.deepStrictEqual(checkProjectFeasibility(refs), []);
  });
});

describe('scaffold draft proof before Gate 1', () => {
  function plan(requirementIds: string[]): ScaffoldDraftPlan {
    return {
      schema: 'sdd-scaffold-plan/v1',
      specs: [
        {
          path: 'specs/infra-base/infra-base.spec.md',
          digest: projectSpecDigest(refs[0]!.content),
        },
      ],
      nodes: [
        {
          id: 'IB-bootstrap/P1',
          scope: 'infra-base',
          dependencies: [],
          requirementIds,
          adapter: 'node',
          action: null,
          targets: ['.nvmrc', '.npmrc', 'package.json'],
          provides: RUNTIME.provides,
          requires: [],
        },
      ],
    };
  }

  const refs = [spec('infra-base', [], [RUNTIME, DEPENDENCIES])];

  it('rejects an approved requirement omitted from the proposed task plan', () => {
    const findings = checkScaffoldDraftPlan(refs, plan(['BOOT-RUNTIME']));

    assert.ok(findings.some((finding) => finding.code === 'SDD_SCAFFOLD_PLAN_REQUIREMENT_MISSING'));
  });

  it('rejects one approved requirement copied into multiple plan nodes', () => {
    const draft = plan(['BOOT-RUNTIME', 'BOOT-DEPS']);
    draft.nodes.push({
      ...draft.nodes[0]!,
      id: 'IB-duplicate/P1',
      requirementIds: ['BOOT-RUNTIME'],
    });

    const findings = checkScaffoldDraftPlan(refs, draft);

    assert.ok(
      findings.some((finding) => finding.code === 'SDD_SCAFFOLD_PLAN_REQUIREMENT_DUPLICATE')
    );
  });

  it('rejects a consumer phase ordered before its required provider', () => {
    const draft = plan(['BOOT-RUNTIME']);
    draft.nodes.push({
      id: 'IB-install/P1',
      scope: 'infra-base',
      dependencies: [],
      requirementIds: ['BOOT-DEPS'],
      adapter: 'node',
      action: 'dependency-install',
      targets: ['package.json', 'package-lock.json'],
      provides: ['node.dependencies'],
      requires: ['node.runtime-version', 'node.registry-config', 'node.package-manager'],
    });

    const findings = checkScaffoldDraftPlan(refs, draft);

    assert.ok(
      findings.some((finding) => finding.code === 'SDD_SCAFFOLD_PLAN_CAPABILITY_PREREQUISITE_ORDER')
    );
  });

  it('rejects a materialized phase that changes the approved plan', () => {
    const draft = plan(['BOOT-RUNTIME', 'BOOT-DEPS']);
    const materialized = [{ ...draft.nodes[0]!, targets: ['package.json'] }];

    const findings = checkScaffoldPlanMaterialization(draft, materialized);

    assert.ok(
      findings.some((finding) => finding.code === 'SDD_SCAFFOLD_PLAN_MATERIALIZATION_DRIFT')
    );
  });
});
