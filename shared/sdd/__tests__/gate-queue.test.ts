// @file: Negative and positive proofs for exact missing-readiness-gate phase ownership.
// @consumers: node:test runner
// @tasks: N/A

import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkAuthoringReadiness,
  phaseOwnsMissingReadinessGate,
  queuedInfraGateTicketIds,
} from '../gate-queue.ts';
import type { TicketCorpusRef } from '../ticket-resolve.ts';
import type { Scope } from '../portal.ts';
import type { ReadinessResult } from '../readiness.ts';

const roots: string[] = [];
afterEach(() => {
  while (roots.length) rmSync(roots.pop() as string, { recursive: true, force: true });
});

const notReady: ReadinessResult = {
  packageJsonPresent: true,
  required: [{ name: 'lint', present: false }],
  lintHasGennady: false,
  formatReadOnly: true,
  lintReadOnly: true,
  checkReadOnly: true,
  formatFixMutates: true,
  lintFixMutates: true,
  formatFixDeclaredTargetPrefix: true,
  lintFixDeclaredTargetPrefix: true,
  fixHasCanonicalRepairs: true,
  gennadyAvailable: true,
  ready: false,
  missing: ['lint'],
  stubbed: [],
  missingGates: ['lint'],
  level: 'not-ready',
  executionReady: false,
};

function fixture(ticketCount = 1): { root: string; refs: TicketCorpusRef[]; scopes: Scope[] } {
  const root = mkdtempSync(join(tmpdir(), 'gate-owner-'));
  roots.push(root);
  const scopeDir = join(root, 'specs', 'infra');
  mkdirSync(join(scopeDir, 'tasks'), { recursive: true });
  writeFileSync(
    join(scopeDir, 'infra.spec.md'),
    [
      '<!--SECTION:SCOPE_TYPE-->',
      'infrastructure',
      '<!--/SECTION:SCOPE_TYPE-->',
      '<!--SECTION:BOOTSTRAP_REQUIREMENTS-->',
      '| ID | Requirement | Kind | Owner | Resolution | Capability Adapter | Provides Capabilities | Requires Capabilities | Readiness Gates | Gate Artifacts |',
      '|---|---|---|---|---|---|---|---|---|---|',
      '| INFRA-LINT | lint gate | tool | this-scope-task | create | node | — | — | lint | package.json |',
      '<!--/SECTION:BOOTSTRAP_REQUIREMENTS-->',
    ].join('\n')
  );
  const refs: TicketCorpusRef[] = [];
  for (let index = 1; index <= ticketCount; index++) {
    const id = `INF-${index}`;
    const file = join(scopeDir, 'tasks', `${id}.md`);
    const content = [
      '<!--SECTION:META-->',
      `- **Task-ID:** ${id}`,
      '- **Status:** [ ] TODO',
      '- **Scope:** infra',
      '<!--/SECTION:META-->',
      '<!--SECTION:PHASES_OVERVIEW-->',
      '| ID | Kind | Deps | Status |',
      '|---|---|---|---|',
      '| P1 | impl | — | [ ] |',
      '| P2 | test | P1 | [ ] |',
      '<!--/SECTION:PHASES_OVERVIEW-->',
      '<!--SECTION:PHASE_P1-->',
      '- **Target Files:**',
      '  - package.json',
      '- **Readiness Gates:**',
      '  - lint',
      '<!--/SECTION:PHASE_P1-->',
      '<!--SECTION:PHASE_P2-->',
      '- **Target Files:**',
      '  - src/infra.test.ts',
      '<!--/SECTION:PHASE_P2-->',
    ].join('\n');
    writeFileSync(file, content);
    refs.push({ file, taskId: id, status: '[ ] TODO', scope: 'infra', dependencies: [], content });
  }
  return {
    root,
    refs,
    scopes: [
      {
        name: 'infra',
        type: 'infrastructure',
        status: 'done',
        description: '',
        specPath: './infra/infra.spec.md',
      },
    ],
  };
}

describe('queuedInfraGateTicketIds structural ownership', () => {
  it('grants setup only to the exact phase claiming and targeting the declared gate artifact', () => {
    const f = fixture();
    const queue = queuedInfraGateTicketIds(f.refs, f.scopes, notReady, f.root);
    assert.deepStrictEqual(queue.ticketIds, ['INF-1']);
    assert.equal(phaseOwnsMissingReadinessGate(queue, 'INF-1', 'P1'), true);
    assert.equal(phaseOwnsMissingReadinessGate(queue, 'INF-1', 'P2'), false);
  });

  it('does not exempt an unrelated infra ticket or a claim whose target misses the artifact', () => {
    const f = fixture();
    const file = f.refs[0]?.file as string;
    const content = readFileSync(file, 'utf-8').replace('  - package.json', '  - other.json');
    writeFileSync(file, content);
    (f.refs[0] as TicketCorpusRef).content = content;
    const queue = queuedInfraGateTicketIds(f.refs, f.scopes, notReady, f.root);
    assert.deepStrictEqual(queue.ticketIds, []);
    assert.match(
      queue.diagnostics.map((item) => item.message).join('\n'),
      /no exact active ticket phase owner/
    );
  });

  it('fails closed when two active phases claim the same missing gate', () => {
    const f = fixture(2);
    const queue = queuedInfraGateTicketIds(f.refs, f.scopes, notReady, f.root);
    assert.deepStrictEqual(queue.ticketIds, []);
    assert.match(
      queue.diagnostics.map((item) => item.message).join('\n'),
      /multiple phase owners.*INF-1\/P1.*INF-2\/P1/
    );
  });

  it('withholds every exemption when even one missing gate has no owner', () => {
    const f = fixture();
    const queue = queuedInfraGateTicketIds(
      f.refs,
      f.scopes,
      {
        ...notReady,
        required: [
          { name: 'lint', present: false },
          { name: 'test', present: false },
        ],
        missing: ['lint', 'test'],
        missingGates: ['lint', 'test'],
      },
      f.root
    );
    assert.deepStrictEqual(queue.ticketIds, []);
    assert.deepStrictEqual(queue.owners, []);
    assert.match(queue.diagnostics.map((item) => item.message).join('\n'), /missing gate 'test'/);
  });

  it('returns no owners or diagnostics after readiness is complete', () => {
    const f = fixture();
    const queue = queuedInfraGateTicketIds(
      f.refs,
      f.scopes,
      { ...notReady, executionReady: true, level: 'ready', ready: true },
      f.root
    );
    assert.deepStrictEqual(queue, { ticketIds: [], owners: [], diagnostics: [] });
  });

  it('rejects a portal specPath traversal even when the outside file has a valid contract', () => {
    const f = fixture();
    writeFileSync(
      join(f.root, 'outside.spec.md'),
      readFileSync(join(f.root, 'specs', 'infra', 'infra.spec.md'), 'utf-8')
    );
    (f.scopes[0] as Scope).specPath = '../outside.spec.md';

    const queue = queuedInfraGateTicketIds(f.refs, f.scopes, notReady, f.root);

    assert.deepStrictEqual(queue.ticketIds, []);
    assert.deepStrictEqual(queue.owners, []);
    assert.match(
      queue.diagnostics.map((item) => item.message).join('\n'),
      /unsafe portal specPath.*\.\.\/outside\.spec\.md.*`\.\.` path segments are forbidden/
    );
  });

  it('rejects an absolute portal specPath outside the repository', () => {
    const f = fixture();
    const outside = join(f.root, 'outside.spec.md');
    writeFileSync(outside, readFileSync(join(f.root, 'specs', 'infra', 'infra.spec.md'), 'utf-8'));
    (f.scopes[0] as Scope).specPath = outside;

    const queue = queuedInfraGateTicketIds(f.refs, f.scopes, notReady, f.root);

    assert.deepStrictEqual(queue.ticketIds, []);
    assert.match(
      queue.diagnostics.map((item) => item.message).join('\n'),
      /unsafe portal specPath.*absolute paths are forbidden/
    );
  });

  it('rejects a symlinked portal spec instead of reading its external target', () => {
    const f = fixture();
    const outside = join(f.root, 'outside.spec.md');
    writeFileSync(outside, readFileSync(join(f.root, 'specs', 'infra', 'infra.spec.md'), 'utf-8'));
    symlinkSync(outside, join(f.root, 'specs', 'infra', 'linked.spec.md'));
    (f.scopes[0] as Scope).specPath = './infra/linked.spec.md';

    const queue = queuedInfraGateTicketIds(f.refs, f.scopes, notReady, f.root);

    assert.deepStrictEqual(queue.ticketIds, []);
    assert.match(
      queue.diagnostics.map((item) => item.message).join('\n'),
      /unsafe portal specPath.*symlink component/
    );
  });
});

describe('checkAuthoringReadiness structural scaffold permission', () => {
  const currentSchema = { version: 'test', status: 'current' as const, findings: [] };

  it('accepts a future platform gate alias when one complete infrastructure row owns it', () => {
    const f = fixture();
    const spec = join(f.root, 'specs', 'infra', 'infra.spec.md');
    writeFileSync(
      spec,
      readFileSync(spec, 'utf-8')
        .replace('lint gate', 'swift gate')
        .replace('| lint | package.json |', '| swift-build | Package.swift |')
    );

    const result = checkAuthoringReadiness(
      f.scopes,
      { ...notReady, missingGates: ['swift-build'] },
      currentSchema,
      f.root
    );

    assert.deepStrictEqual(result, {
      ready: true,
      diagnostics: [],
      scopes: [{ name: 'infra', status: 'yes', diagnostics: [] }],
    });
  });

  it('blocks scaffold when a missing gate row has ambiguous ownership metadata', () => {
    const f = fixture();
    const spec = join(f.root, 'specs', 'infra', 'infra.spec.md');
    writeFileSync(spec, readFileSync(spec, 'utf-8').replace('| create |', '| — |'));

    const result = checkAuthoringReadiness(f.scopes, notReady, currentSchema, f.root);

    assert.equal(result.ready, false);
    assert.match(result.diagnostics.join('\n'), /has no Resolution/);
  });

  it('does not let a product scope own a missing runtime gate', () => {
    const f = fixture();
    (f.scopes[0] as Scope).type = 'product';

    const result = checkAuthoringReadiness(f.scopes, notReady, currentSchema, f.root);

    assert.equal(result.ready, false);
    assert.match(result.diagnostics.join('\n'), /no complete infrastructure.*owner row/);
  });

  it('isolates target scope health while keeping missing runtime-gate ownership project-wide', () => {
    const root = mkdtempSync(join(tmpdir(), 'authoring-scopes-'));
    roots.push(root);
    const writeScope = (name: string, type: string, bootstrap: string, extra = ''): void => {
      const dir = join(root, 'specs', name);
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, `${name}.spec.md`),
        [
          '<!--SECTION:SCOPE_TYPE-->',
          type,
          '<!--/SECTION:SCOPE_TYPE-->',
          extra,
          '<!--SECTION:BOOTSTRAP_REQUIREMENTS-->',
          bootstrap,
          '<!--/SECTION:BOOTSTRAP_REQUIREMENTS-->',
        ].join('\n')
      );
    };
    const currentHeader =
      '| Requirement | Kind | Owner | Resolution | Readiness Gates | Gate Artifacts |\n|---|---|---|---|---|---|';
    writeScope('healthy', 'infrastructure', currentHeader);
    writeScope(
      'broken',
      'product',
      '| Requirement | Kind | Owner | Resolution |\n|---|---|---|---|'
    );
    writeScope('api', 'interface', currentHeader);
    const scopes: Scope[] = [
      {
        name: 'healthy',
        type: 'infrastructure',
        status: 'done',
        description: '',
        specPath: './healthy/healthy.spec.md',
      },
      {
        name: 'broken',
        type: 'product',
        status: 'done',
        description: '',
        specPath: './broken/broken.spec.md',
      },
      {
        name: 'api',
        type: 'interface',
        status: 'done',
        description: '',
        specPath: './api/api.spec.md',
      },
    ];
    const schema = {
      version: 'test',
      status: 'stale-migratable' as const,
      findings: [
        {
          path: 'specs/healthy/healthy.spec.md',
          kind: 'scope' as const,
          status: 'current' as const,
          reason: 'current',
        },
        {
          path: 'specs/broken/broken.spec.md',
          kind: 'scope' as const,
          status: 'stale-migratable' as const,
          reason: 'legacy columns',
        },
      ],
    };
    const runtimeReady = {
      ...notReady,
      ready: true,
      level: 'ready' as const,
      executionReady: true,
      missingGates: [],
    };

    const isolated = checkAuthoringReadiness(scopes, runtimeReady, schema, root);
    assert.equal(isolated.ready, false, 'all-scope aggregate stays red');
    assert.equal(isolated.scopes.find((fact) => fact.name === 'healthy')?.status, 'yes');
    assert.equal(isolated.scopes.find((fact) => fact.name === 'broken')?.status, 'no');
    assert.equal(isolated.scopes.find((fact) => fact.name === 'api')?.status, 'not-applicable');

    const sharedMissing = checkAuthoringReadiness(scopes, notReady, schema, root);
    assert.equal(sharedMissing.scopes.find((fact) => fact.name === 'healthy')?.status, 'no');
    assert.match(
      sharedMissing.scopes.find((fact) => fact.name === 'healthy')?.diagnostics.join('\n') ?? '',
      /missing runtime gate 'lint'.*no complete infrastructure/
    );

    writeScope(
      'healthy',
      'infrastructure',
      `${currentHeader}\n| lint gate | tool | this-scope-task | create | lint | package.json |`
    );
    const owned = checkAuthoringReadiness(scopes, notReady, schema, root);
    assert.equal(owned.scopes.find((fact) => fact.name === 'healthy')?.status, 'yes');
    assert.equal(owned.scopes.find((fact) => fact.name === 'broken')?.status, 'no');
  });
});
