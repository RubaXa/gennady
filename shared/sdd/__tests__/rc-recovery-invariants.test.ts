// @file: Cross-cutting regression invariants recovered from the SDD v2 RC failure analysis.
// @consumers: scaffold, check, flow-eval
// @tasks: N/A

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  checkScaffoldDraftPlan,
  deriveProjectFeasibilityContext,
  projectSpecDigest,
  type ProjectSpecRef,
  type ScaffoldDraftPlan,
} from '../project-feasibility.ts';
import { checkBddRequirementTraceability } from '../bdd-coverage.ts';
import { checkBddNegativeScenario } from '../check.ts';
import { TEMPLATES } from '../templates.ts';
import { SddEvalOpenCodeEvidenceSource } from '../../../ai/flow-eval/evidence.ts';
import { SddEvalObserver } from '../../../ai/flow-eval/observer.ts';
import type { SddEvalEvidenceSource, SddEvalTailEntry } from '../../../ai/flow-eval/types.ts';

const REPOSITORY_ROOT = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));
const execFileAsync = promisify(execFile);

const BOOTSTRAP_SPEC: ProjectSpecRef = {
  file: 'specs/infra/infra.spec.md',
  scope: 'infra',
  dependencies: [],
  content: [
    '<!--SECTION:BOOTSTRAP_REQUIREMENTS-->',
    '| Requirement | Kind | Owner | Resolution | Readiness Gates | Gate Artifacts |',
    '|---|---|---|---|---|---|',
    '| Node runtime and package manager | file | this-scope-task | create | — | .nvmrc, package.json, .npmrc |',
    '| Install project dependencies | package | this-scope-task | create | — | package.json, package-lock.json |',
    '<!--/SECTION:BOOTSTRAP_REQUIREMENTS-->',
  ].join('\n'),
};

function completePlan(): ScaffoldDraftPlan {
  const context = deriveProjectFeasibilityContext([BOOTSTRAP_SPEC]);
  const [runtime, dependencies] = context.requirements;
  assert.ok(runtime && dependencies, 'fixture must expose both bootstrap rows');
  return {
    schema: 'sdd-scaffold-plan/v1',
    specs: [{ path: BOOTSTRAP_SPEC.file, digest: projectSpecDigest(BOOTSTRAP_SPEC.content) }],
    nodes: [
      {
        id: 'INF-runtime/P1',
        scope: 'infra',
        dependencies: [],
        requirementRefs: [runtime.ref],
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
      {
        id: 'INF-install/P1',
        scope: 'infra',
        dependencies: ['INF-runtime/P1'],
        requirementRefs: [dependencies.ref],
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
      },
    ],
  };
}

test('RC invariant: Gate 1 follows materialized and mechanically checked task drafts', () => {
  const materialize = readFileSync(
    join(REPOSITORY_ROOT, 'ai/directives/sdd-v2/scaffold/steps/STEP_2_MATERIALIZE.xml'),
    'utf8'
  );
  const mechanical = readFileSync(
    join(REPOSITORY_ROOT, 'ai/directives/sdd-v2/scaffold/steps/STEP_3_MECHANICAL_CHECK.xml'),
    'utf8'
  );
  const approval = readFileSync(
    join(REPOSITORY_ROOT, 'ai/directives/sdd-v2/scaffold/steps/STEP_5_OPERATOR_APPROVAL_2.xml'),
    'utf8'
  );

  assert.match(materialize, /Create actual tickets and indexes/);
  assert.match(materialize, /For each derived node call exactly one applicable `sdd-new` command/);
  assert.match(mechanical, /Run the authoring check on every created or changed ticket/);
  assert.match(mechanical, /npx gennady sdd-check --task &lt;ticket-path&gt; --authoring/);
  assert.match(approval, /based on actual tickets/);
  assert.doesNotMatch(approval, /approval for an abstract pre-ticket plan/);
});

test('RC invariant: runtime provider precedes dependency consumers and shared writers serialize', () => {
  const plan = completePlan();
  assert.deepStrictEqual(checkScaffoldDraftPlan([BOOTSTRAP_SPEC], plan), []);

  plan.nodes[1]!.dependencies = [];
  const findings = checkScaffoldDraftPlan([BOOTSTRAP_SPEC], plan).map((finding) => finding.code);
  assert.ok(findings.includes('SDD_SCAFFOLD_PLAN_CAPABILITY_PREREQUISITE_ORDER'));
  assert.ok(findings.includes('SDD_SCAFFOLD_PLAN_SHARED_WRITER_OVERLAP'));
});

test('RC invariant: every task behavior carries a Requirement-ID, test mapping, and negative scenario', () => {
  const bdd = [
    '**Scenario:** creates a record [`unit`] `[GEN-REQ-1]`',
    '- **Given** valid input',
    '- **When** the command runs',
    '- **Then** it creates the record',
    '',
    '**Scenario:** rejects invalid input [`unit`] `[GEN-REQ-2]`',
    '- **Given** invalid input',
    '- **When** the command runs',
    '- **Then** it rejects the request',
  ].join('\n');
  const coverage = [
    '- creates a record → `record.test.ts` :: `[GEN-REQ-1] creates a record`',
    '- rejects invalid input → `record.test.ts` :: `[GEN-REQ-2] rejects invalid input`',
  ].join('\n');

  assert.deepStrictEqual(checkBddNegativeScenario('generic.task.md', bdd, false), []);
  assert.deepStrictEqual(checkBddRequirementTraceability('generic.task.md', bdd, coverage), []);

  const missingRequirement = checkBddRequirementTraceability(
    'generic.task.md',
    bdd,
    coverage.replace('[GEN-REQ-2]', '[GEN-REQ-9]')
  );
  assert.deepStrictEqual(
    missingRequirement.map((finding) => finding.code),
    ['SDD_BDD_REQUIREMENT_UNTRACED']
  );
  assert.deepStrictEqual(
    checkBddNegativeScenario('generic.task.md', bdd.split('\n\n')[0]!, false).map(
      (finding) => finding.code
    ),
    ['SDD_BDD_MISSING_NEGATIVE']
  );
});

test('RC invariant: a filled spec retains section anchors but no skeleton guidance comments', () => {
  const filled = [
    '<!--SECTION:VISION-->',
    '## Vision',
    'A bounded generic capability.',
    '<!--/SECTION:VISION-->',
  ].join('\n');
  const comments = [...filled.matchAll(/<!--([\s\S]*?)-->/g)].map((match) => match[1]?.trim());
  assert.ok(comments.length > 0, 'section anchors must remain machine-readable');
  assert.ok(
    comments.every((comment) => /^\/?SECTION:[A-Z][A-Z0-9_]*$/.test(comment ?? '')),
    'filled specs must remove every non-anchor skeleton comment'
  );
});

test('RC invariant: flow-eval evidence includes untracked artifacts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sdd-rc-untracked-'));
  try {
    await execFileAsync('git', ['init', '--quiet'], { cwd: root });
    await mkdir(join(root, 'specs'), { recursive: true });
    await writeFile(join(root, 'specs', 'generic.spec.md'), '# Generic\nGEN-REQ-1\n', 'utf8');
    const evidence = new SddEvalOpenCodeEvidenceSource({
      client: { session: { diff: async () => ({ data: [] }) } } as never,
      directory: root,
    });
    const diff = await evidence.readDiff('ses_generic');
    assert.match(diff, /FILE specs\/generic\.spec\.md \(untracked\)/);
    assert.match(diff, /AFTER\n# Generic\nGEN-REQ-1/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('RC invariant: observation budget adds no wait after its final observation', async () => {
  const tail: SddEvalTailEntry = {
    messageId: 'm1',
    role: 'assistant',
    text: 'working',
    fingerprint: 'm1',
    toolCalls: [],
  };
  const evidence: SddEvalEvidenceSource = {
    readTail: async () => [tail],
    readEvents: async () => [],
    readDiff: async () => '',
    readStatus: async () => 'running',
  };
  let sleeps = 0;
  const observations = await new SddEvalObserver(evidence, {
    everyMs: 300_000,
    stuckAfter: 10,
    tailLimit: 1,
    clock: { now: () => 0, sleep: async () => void sleeps++ },
  }).collect('ses_budget', 2);
  assert.equal(observations.length, 2);
  assert.equal(sleeps, 1);
});

test('RC invariant: generated coverage artifacts stay ignored', () => {
  const ignore = readFileSync(join(REPOSITORY_ROOT, '.gitignore'), 'utf8');
  assert.match(ignore, /^coverage\/?$/m);
});

test('RC invariant: authoring skeleton owns format and exposes only section-lazy references', () => {
  const library = TEMPLATES.library.skeleton;
  const module = TEMPLATES.module.skeleton;
  const directiveSources = ['scope', 'module', 'root', 'discover-from-code']
    .map((name) =>
      readFileSync(join(REPOSITORY_ROOT, `ai/kit/templates/sdd-v2/${name}.directive.hbs`), 'utf8')
    )
    .join('\n');

  assert.match(library, /УДАЛИ ПОСЛЕ ЗАПОЛНЕНИЯ/);
  assert.match(library, /### <ACR>-REQ-1 \[должен · нештатная\]/);
  assert.match(library, /\.\/<module>\/<module>\.spec\.md/);
  assert.match(module, /ENTITY_INVENTORY[\s\S]*entity-inventory-format\.xml только сейчас/);
  assert.match(module, /ENTITY_SURFACES[\s\S]*entity-surface-format\.xml только сейчас/);
  assert.match(module, /MODULE_CONTRACTS[\s\S]*dbc-contracts\.xml только сейчас/);
  assert.doesNotMatch(
    directiveSources,
    /READ_AND_USE_DIRECTIVE[^\n]*(?:library-spec-structure|module-spec-structure|requirement-entry-format|module-map-update|diagram-vocabulary|portal-structure)/
  );
  assert.doesNotMatch(directiveSources, /module-diagram-ladder\.example\.md/);
});
