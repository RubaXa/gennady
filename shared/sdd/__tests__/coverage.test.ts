// @file: Deterministic declaration and stage boundaries for partial SDD adoption in existing projects.
// @spec: SHARED
// @consumers: coverage resolver, normal unit and coverage gates

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveSddCoverage } from '../coverage.ts';
import type { CoverageInput, CoverageObservation } from '../coverage.types.ts';

const observed = (path: string, specIds: string[] = []): CoverageObservation => ({
  path,
  state: 'file',
  specIds,
});
function fixture(): CoverageInput {
  return {
    stage: 'preflight',
    selection: { kind: 'phase', task: 'CORE-work', phase: 'P1' },
    specs: [
      { id: 'PORTAL', path: 'specs/portal.spec.md', children: ['CORE'], files: [] },
      {
        id: 'CORE',
        path: 'specs/core/core.spec.md',
        children: [],
        files: ['src/main.ts', 'src/untouched.ts'],
      },
    ],
    targets: [
      { task: 'CORE-work', phase: 'P1', specId: 'CORE', path: 'src/main.ts', operation: 'write' },
    ],
    observations: [
      observed('src/main.ts'),
      observed('src/untouched.ts'),
      observed('src/unmanaged.ts'),
    ],
  };
}
const codes = (input: CoverageInput) =>
  resolveSddCoverage(input).findings.map((finding) => finding.code);

test('preflight permits a headerless phase target without claiming complete coverage or changing inputs', () => {
  const input = fixture();
  const bytes = JSON.stringify(input);
  const result = resolveSddCoverage(input);
  assert.equal(result.canProceed, true);
  assert.equal(result.complete, false);
  assert.deepEqual(
    result.rows.map((row) => row.path),
    ['src/main.ts']
  );
  assert.deepEqual(
    result.findings.map((finding) => finding.code),
    ['MISSING_HEADER']
  );
  assert.equal(JSON.stringify(input), bytes);
});

test('phase exit requires its own header, not mass annotation; audit still reports untouched obligations', () => {
  const input = fixture();
  assert.equal(resolveSddCoverage({ ...input, stage: 'phase-exit' }).canProceed, false);
  const observations = [observed('src/main.ts', ['CORE']), ...input.observations.slice(1)];
  const exit = resolveSddCoverage({ ...input, stage: 'phase-exit', observations });
  assert.equal(exit.complete, true);
  assert.equal(exit.canProceed, true);
  const audit = resolveSddCoverage({
    ...input,
    stage: 'audit',
    selection: { kind: 'spec', id: 'PORTAL' },
    observations,
  });
  assert.equal(audit.canProceed, false);
  assert.deepEqual(
    audit.rows.map((row) => row.path),
    ['src/main.ts', 'src/untouched.ts']
  );
});

test('a project without SDD has no ownership obligations for thousands of ordinary files', () => {
  const result = resolveSddCoverage({
    stage: 'audit',
    selection: { kind: 'project' },
    specs: [],
    targets: [],
    observations: Array.from({ length: 5000 }, (_, i) => observed(`src/${i}.ts`)),
  });
  assert.equal(result.complete, true);
  assert.deepEqual(result.rows, []);
});

test('structural descendants aggregate; read-only inputs do not acquire ownership', () => {
  const input = fixture();
  const result = resolveSddCoverage({
    ...input,
    stage: 'authoring',
    selection: { kind: 'spec', id: 'PORTAL' },
    targets: [
      ...input.targets,
      { ...input.targets[0]!, path: 'src/unmanaged.ts', operation: 'read' },
    ],
  });
  assert.equal(result.canProceed, true);
  assert.equal(result.rows.length, 2);
  assert.ok(
    result.rows.every((row) => row.sources.some((source) => source.startsWith('mapping:')))
  );
});

test('missing, ambiguous, unknown and foreign headers cannot pass phase exit', () => {
  for (const [header, code] of [
    [[], 'MISSING_HEADER'],
    [['CORE', 'CORE'], 'AMBIGUOUS_HEADER'],
    [['UNKNOWN'], 'UNRESOLVED_HEADER'],
    [['PORTAL'], 'HEADER_OWNER_CONFLICT'],
  ] as const) {
    assert.ok(
      codes({
        ...fixture(),
        stage: 'phase-exit',
        observations: [observed('src/main.ts', [...header])],
      }).includes(code)
    );
  }
});

test('a phase does not silently reassign another spec-owned file', () => {
  const input = fixture();
  assert.ok(
    codes({ ...input, targets: [{ ...input.targets[0]!, specId: 'PORTAL' }] }).includes(
      'TARGET_OWNER_CONFLICT'
    )
  );
  assert.ok(
    codes({
      ...input,
      specs: [
        ...input.specs,
        { id: 'OTHER', path: 'specs/other.spec.md', children: [], files: ['src/main.ts'] },
      ],
    }).includes('OWNER_CONFLICT')
  );
});

test('read inputs and unrelated phase claims do not introduce ownership obligations into a selected phase', () => {
  const input = fixture();
  const expected = resolveSddCoverage(input);
  assert.deepEqual(
    resolveSddCoverage({
      ...input,
      targets: [
        ...input.targets,
        {
          ...input.targets[0]!,
          operation: 'read',
          specId: 'NOT-AN-OWNER',
          path: 'docs/context.md',
        },
        { ...input.targets[0]!, task: 'OTHER-work', specId: 'UNRESOLVED', path: '../unrelated.ts' },
      ],
    }),
    expected
  );
});

test('removing a previous header does not opt a file out, even before execution', () => {
  assert.ok(
    codes({
      ...fixture(),
      observations: [{ ...observed('src/main.ts'), previousSpecIds: ['CORE'] }],
    }).includes('REMOVED_OWNERSHIP')
  );
});

test('future output is permitted before execution but required at phase exit', () => {
  const input = {
    ...fixture(),
    observations: [{ path: 'src/main.ts', state: 'missing' as const, specIds: [] }],
  };
  assert.equal(resolveSddCoverage(input).canProceed, true);
  assert.ok(codes({ ...input, stage: 'phase-exit' }).includes('MISSING_TARGET'));
});

test('unexpected disappearance and explicit deletion differ; an unapplied deletion cannot pass', () => {
  const input = fixture();
  const observations = [
    { path: 'src/main.ts', state: 'missing' as const, specIds: [], previousSpecIds: ['CORE'] },
  ];
  assert.ok(codes({ ...input, observations }).includes('UNEXPECTED_MISSING'));
  const targets = [{ ...input.targets[0]!, operation: 'delete' as const }];
  assert.equal(
    resolveSddCoverage({ ...input, stage: 'phase-exit', targets, observations }).rows[0]?.state,
    'deleted'
  );
  assert.ok(codes({ ...input, stage: 'phase-exit', targets }).includes('DELETE_TARGET_EXISTS'));
});

test('temporary target ownership works for a phase but still needs File Mapping at audit', () => {
  const input = fixture();
  const specs = input.specs.map((spec) => ({ ...spec, files: [] }));
  const observations = [observed('src/main.ts', ['CORE'])];
  assert.equal(
    resolveSddCoverage({ ...input, stage: 'phase-exit', specs, observations }).complete,
    true
  );
  assert.ok(codes({ ...input, stage: 'audit', specs, observations }).includes('MAPPING_REQUIRED'));
});

test('a project query catches undeclared header claims instead of silently dropping them', () => {
  const input = fixture();
  assert.ok(
    codes({
      ...input,
      selection: { kind: 'project' },
      observations: [...input.observations, observed('src/claim.ts', ['UNKNOWN'])],
    }).includes('UNRESOLVED_HEADER')
  );
});

test('unsafe, missing and duplicate observations fail closed', () => {
  const input = fixture();
  assert.ok(codes({ ...input, observations: [] }).includes('OBSERVATION_MISSING'));
  assert.ok(
    codes({ ...input, observations: [{ ...observed('src/main.ts'), state: 'unsafe' }] }).includes(
      'UNSAFE_PATH'
    )
  );
  assert.ok(
    codes({ ...input, observations: [...input.observations, input.observations[0]!] }).includes(
      'DUPLICATE_OBSERVATION'
    )
  );
  for (const path of ['../escape.ts', '/tmp/file.ts', 'src/*.ts', 'src/../file.ts', 'src\\file.ts'])
    assert.ok(
      codes({ ...input, targets: [{ ...input.targets[0]!, path }] }).includes('INVALID_PATH')
    );
});

test('invalid graph identities, cycles, unresolved children and unknown phases do not make empty PASS', () => {
  const input = fixture();
  assert.ok(
    codes({ ...input, selection: { kind: 'spec', id: 'MISSING' } }).includes('UNRESOLVED_SPEC')
  );
  assert.ok(
    codes({ ...input, specs: [...input.specs, input.specs[0]!] }).includes('DUPLICATE_SPEC_ID')
  );
  const specs = input.specs.map((spec) => ({ ...spec, children: ['PORTAL'] }));
  assert.ok(codes({ ...input, specs, selection: { kind: 'project' } }).includes('SPEC_CYCLE'));
  assert.ok(
    codes({ ...input, selection: { kind: 'phase', task: 'CORE-work', phase: 'UNKNOWN' } }).includes(
      'PHASE_CONTEXT_MISSING'
    )
  );
  assert.ok(
    codes({ ...input, stage: 'phase-exit', selection: { kind: 'project' } }).includes(
      'PHASE_CONTEXT_REQUIRED'
    )
  );
});

test('literal framework route names are not expanded as glob patterns', () => {
  const input = fixture();
  const path = 'pages/[...slug].tsx';
  const result = resolveSddCoverage({
    ...input,
    specs: [input.specs[1]!],
    targets: [{ ...input.targets[0]!, path }],
    observations: [observed(path)],
  });
  assert.equal(result.canProceed, true);
  assert.ok(!result.findings.some((finding) => finding.code === 'INVALID_PATH'));
});

test('valid input order does not change the deterministic projection', () => {
  const input = { ...fixture(), selection: { kind: 'project' as const } };
  assert.deepEqual(
    resolveSddCoverage(input),
    resolveSddCoverage({
      ...input,
      specs: [...input.specs].reverse(),
      observations: [...input.observations].reverse(),
    })
  );
});

test('large and deeply nested spec graphs do not depend on the JavaScript call stack', () => {
  const specs = Array.from({ length: 12000 }, (_, index) => ({
    id: `S${index}`,
    path: `specs/s${index}.spec.md`,
    children: index < 11999 ? [`S${index + 1}`] : [],
    files: [],
  }));
  assert.equal(
    resolveSddCoverage({
      ...fixture(),
      selection: { kind: 'spec', id: 'S0' },
      specs,
      targets: [],
      observations: [],
    }).complete,
    true
  );
});
