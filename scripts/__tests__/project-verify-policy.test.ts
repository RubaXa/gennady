// @file: Project-owned D-60 verification scope without weakening generic consumer full profiles.
// @spec: INFRA-BASE
// @consumers: deterministic release gate, pre-commit

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { it } from 'node:test';
import { resolveNodeVerifyPlan } from '../../plugins/node/node-planner.ts';
import { getFileInfo } from 'prettier';

const ROOT = resolve(import.meta.dirname, '../..');
const CODE = ['node:type-check', 'node:lint-fix', 'node:lint', 'node:format-fix', 'node:format'];

it('the real project full selector preserves code, unit and coverage while experimental integration stays explicit', () => {
  const project = resolveNodeVerifyPlan(ROOT, 'full', { homeDirectory: ROOT });
  assert.deepEqual(
    project.plan.steps.map((step) => step.id),
    [...CODE, 'node:unit', 'node:coverage']
  );
  assert.equal(
    project.composed.provenance.get('verify.presets.node.phases.full.include'),
    'gennady.yaml'
  );
  assert.deepEqual(project.plan.steps.find((step) => step.id === 'node:unit')?.command?.argv, [
    'npm',
    'run',
    'test',
  ]);
  assert.deepEqual(project.plan.steps.find((step) => step.id === 'node:coverage')?.command?.argv, [
    'npm',
    'run',
    'test:coverage',
  ]);
  const explicit = resolveNodeVerifyPlan(ROOT, 'integration', { homeDirectory: ROOT });
  assert.ok(explicit.plan.steps.some((step) => step.id === 'node:integration'));
});

it('a generic zero-config Node consumer still requires integration in full', () => {
  const root = mkdtempSync(join(tmpdir(), 'gennady-generic-full-'));
  try {
    writeFileSync(
      join(root, 'package.json'),
      readFileSync(join(ROOT, 'plugins/node/__tests__/fixtures/zero-yaml/package.json'))
    );
    const generic = resolveNodeVerifyPlan(root, 'full', { homeDirectory: root });
    assert.deepEqual(
      generic.plan.steps.map((step) => step.id),
      [...CODE, 'node:unit', 'node:coverage', 'node:integration']
    );
    assert.equal(
      generic.composed.provenance.get('verify.presets.node.phases.full.include'),
      'builtin:node'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/** @purpose Count the three leaf checks through this project's literal npm-script hops, excluding repair steps. */
function observationCounts(
  plan: ReturnType<typeof resolveNodeVerifyPlan>['plan'],
  scripts: Record<string, string>
): Record<string, number> {
  const counts: Record<string, number> = { 'type-check': 0, format: 0, 'lint:contracts': 0 };
  const visit = (script: string, parents: readonly string[] = []) => {
    assert.ok(!parents.includes(script), 'project check scripts must not cycle');
    if (Object.hasOwn(counts, script)) {
      counts[script]++;
      return;
    }
    for (const match of (scripts[script] ?? '').matchAll(/\bnpm run ([\w:-]+)/g))
      visit(match[1]!, [...parents, script]);
  };
  for (const step of plan.steps) {
    if (step.effect === 'repair') continue;
    const argv = step.command?.argv ?? [];
    if (argv[0] === 'npm' && argv[1] === 'run') visit(argv[2]!);
  }
  return counts;
}

it('the project Verify DAG observes type-check, format and contract lint once while standalone lint retains all three', () => {
  const document = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
  };
  assert.equal(
    document.scripts.lint,
    'npm run format && npm run type-check && npm run lint:contracts'
  );
  assert.equal(document.scripts['type-check'], 'tsc --noEmit');
  assert.equal(
    document.scripts['lint:contracts'],
    'tsx cli/gennady.ts lint cli/ shared/ services/'
  );
  const project = resolveNodeVerifyPlan(ROOT, 'full', { homeDirectory: ROOT });
  assert.deepEqual(project.plan.steps.find((step) => step.id === 'node:lint')?.command?.argv, [
    'npm',
    'run',
    'lint:contracts',
  ]);
  assert.deepEqual(observationCounts(project.plan, document.scripts), {
    'type-check': 1,
    format: 1,
    'lint:contracts': 1,
  });
  assert.deepEqual(
    project.plan.steps.map((step) => step.id),
    [...CODE, 'node:unit', 'node:coverage']
  );
  const root = mkdtempSync(join(tmpdir(), 'gennady-composite-lint-control-'));
  try {
    writeFileSync(join(root, 'package.json'), JSON.stringify(document));
    writeFileSync(
      join(root, 'gennady.yaml'),
      'verify:\n  presets:\n    node:\n      phases:\n        full:\n          include: [code, unit, coverage]\n'
    );
    const previous = resolveNodeVerifyPlan(root, 'full', { homeDirectory: root });
    assert.deepEqual(
      previous.plan.steps.map((step) => step.id),
      project.plan.steps.map((step) => step.id)
    );
    assert.deepEqual(observationCounts(previous.plan, document.scripts), {
      'type-check': 2,
      format: 2,
      'lint:contracts': 1,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it('the project lint shorthand still requires an existing read-only Gennady contract script', () => {
  const document = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
  };
  const yaml = readFileSync(join(ROOT, 'gennady.yaml'), 'utf8');
  for (const [body, requirement] of [
    [null, 'node:script:lint:contracts'],
    ['echo clean', 'node:lint-reaches-gennady:lint:contracts'],
    ['tsx cli/gennady.ts lint --autofix cli/', 'node:read-only:lint:contracts'],
  ] as const) {
    const root = mkdtempSync(join(tmpdir(), 'gennady-project-lint-negative-'));
    try {
      const scripts = { ...document.scripts };
      if (body === null) delete scripts['lint:contracts'];
      else scripts['lint:contracts'] = body;
      writeFileSync(join(root, 'package.json'), JSON.stringify({ ...document, scripts }));
      writeFileSync(join(root, 'gennady.yaml'), yaml);
      const planned = resolveNodeVerifyPlan(root, 'full', { homeDirectory: root });
      assert.ok(
        planned.readiness.entries.some(
          (entry) =>
            entry.stepId === 'node:lint' &&
            entry.requirementId === requirement &&
            entry.status === 'BLOCKED'
        ),
        requirement
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

it('formatter ignores only hash-owned unsupported BF3 snapshots while canonical source and authored reports remain checked', async () => {
  const archive = 'ai/flow-eval/results/2026-11-03-brownfield-bf3-live';
  const manifest = JSON.parse(readFileSync(join(ROOT, archive, 'manifest.json'), 'utf8')) as {
    files: Record<string, string>;
  };
  const ignorePath = [join(ROOT, '.gitignore'), join(ROOT, '.prettierignore')];
  const snapshots = Object.keys(manifest.files).filter(
    (file) => file.startsWith('harness/') || file.startsWith('post-campaign-harness/')
  );
  assert.ok(snapshots.length > 0);
  for (const file of snapshots) {
    const path = join(ROOT, archive, file);
    const unignored = await getFileInfo(path, { ignorePath: [], resolveConfig: false });
    assert.equal(
      unignored.inferredParser,
      null,
      `${file} is immutable unsupported text, not a skipped source parser`
    );
    assert.equal(
      (await getFileInfo(path, { ignorePath, resolveConfig: false })).ignored,
      true,
      file
    );
  }
  const canonical = await getFileInfo(
    join(ROOT, 'ai/flow-eval/scripts/brownfield-benchmark-live.ts'),
    { ignorePath, resolveConfig: false }
  );
  assert.equal(canonical.ignored, false);
  assert.equal(canonical.inferredParser, 'typescript');
  const authored = Object.keys(manifest.files).filter((file) => file.endsWith('.md'));
  assert.ok(authored.length > 0);
  for (const file of authored) {
    const info = await getFileInfo(join(ROOT, archive, file), { ignorePath, resolveConfig: false });
    assert.equal(info.ignored, false, file);
    assert.equal(info.inferredParser, 'markdown', file);
  }
});
