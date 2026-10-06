// @file: UV-27A causal contract for deterministic V1-only inventory and canonical-v2 protection.
// @spec: INFRA-BASE
// @consumers: test-topology, audit:v1-eradication

import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = resolve(import.meta.dirname, '../..');
const SCRIPT = join(ROOT, 'scripts/check-v1-eradication.ts');
const POLICY_PATH = 'scripts/v1-eradication.policy.json';
const temporary: string[] = [];

type Report = {
  ok: boolean;
  policyDigest: string;
  inventoryDigest: string;
  counts: Record<string, number>;
  entries: Array<{ path: string; classification: string; markers: string[]; protected: boolean }>;
  findings: Array<{ code: string; path: string; detail: string }>;
};

function write(root: string, path: string, content: string): void {
  const absolute = join(root, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content);
}

function execute(root: string): { status: number | null; report: Report; stderr: string } {
  const result = executeRaw(root);
  assert.notEqual(result.stdout.trim(), '', result.stderr);
  return {
    status: result.status,
    report: JSON.parse(result.stdout) as Report,
    stderr: result.stderr,
  };
}

function executeRaw(root: string): SpawnSyncReturns<string> {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', SCRIPT, '--root', root, '--json'],
    { cwd: ROOT, encoding: 'utf8' }
  );
  assert.equal(result.signal, null, result.stderr);
  return result;
}

function policy(expectedInventoryDigest = 'PENDING', expectedCounts: Record<string, number> = {}) {
  return {
    schemaVersion: 'gennady.v1-eradication-policy.v1',
    markers: [
      { id: 'v1-word', pattern: '\\b[Vv]1\\b' },
      { id: 'old-directive-path', literal: 'ai/directives/sdd/' },
      { id: 'old-skill-script-path', literal: 'ai/skills/sdd-execute/scripts/' },
      {
        id: 'retired-skill-path',
        pattern:
          'ai/skills/sdd-(?:setup|discover|continue|infra|module-decomposition|fix|execute-batch)(?:/|\\b)',
      },
      { id: 'old-whole-project-runner', literal: 'sdd-verify --profile' },
    ],
    forbiddenPaths: ['ai/directives/sdd/', 'tasks/'],
    protectedPaths: [
      {
        path: 'ai/skills/sdd-execute/SKILL.md',
        classification: 'canonical-v2',
        requiredLiteral: 'ai/directives/sdd-v2/router.directive.xml',
      },
      {
        path: 'shared/sdd/migration-bootstrap.ts',
        classification: 'required-v1-to-v2-migration-boundary',
        requiredLiteral: 'KNOWN_V1_BYTES',
      },
      {
        path: 'shared/sdd/__tests__/fixtures/v1.fixture',
        classification: 'historical-test-evidence',
        requiredLiteral: 'frozen V1',
      },
      {
        path: 'services/agent-mon/schema.ts',
        classification: 'unrelated-product-version',
        requiredLiteral: 'agent-mon V1',
      },
    ],
    classifiers: [
      {
        prefix: 'ai/skills/',
        classification: 'canonical-v2',
        reason: 'v2 loader',
      },
      {
        prefix: 'shared/sdd/__tests__/',
        classification: 'historical-test-evidence',
        reason: 'frozen fixture',
      },
      {
        prefix: 'shared/sdd/',
        classification: 'required-v1-to-v2-migration-boundary',
        reason: 'migration boundary',
      },
      {
        prefix: 'services/agent-mon/',
        classification: 'unrelated-product-version',
        reason: 'other product',
      },
      {
        prefix: 'ai/kit/',
        classification: 'canonical-v2',
        reason: 'v2 source with provenance',
      },
      {
        prefix: 'specs/',
        classification: 'historical-test-evidence',
        reason: 'decision history',
      },
    ],
    markerConstraints: [
      {
        markerId: 'old-directive-path',
        forbiddenClassifications: ['canonical-v2', 'unrelated-product-version'],
        allowContexts: [
          {
            pathPattern: '^ai/kit/(?:axiom|anti-pattern)/',
            kind: 'source-provenance-comment',
          },
        ],
      },
      {
        markerId: 'old-skill-script-path',
        forbiddenClassifications: ['canonical-v2', 'unrelated-product-version'],
      },
      {
        markerId: 'retired-skill-path',
        forbiddenClassifications: ['canonical-v2', 'unrelated-product-version'],
      },
      {
        markerId: 'old-whole-project-runner',
        forbiddenClassifications: ['canonical-v2', 'unrelated-product-version'],
      },
    ],
    excludedInventoryPaths: [POLICY_PATH],
    expectedInventoryDigest,
    expectedCounts,
  };
}

function acceptObservedInventory(root: string, report: Report): void {
  const accepted = JSON.parse(readFileSync(join(root, POLICY_PATH), 'utf8')) as ReturnType<
    typeof policy
  >;
  accepted.expectedInventoryDigest = report.inventoryDigest;
  accepted.expectedCounts = report.counts;
  write(root, POLICY_PATH, `${JSON.stringify(accepted, null, 2)}\n`);
}

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'gennady-v1-eradication-'));
  temporary.push(root);
  execFileSync('git', ['init', '-q', root]);
  write(
    root,
    'ai/skills/sdd-execute/SKILL.md',
    'canonical ai/directives/sdd-v2/router.directive.xml\n'
  );
  write(root, 'shared/sdd/migration-bootstrap.ts', 'const KNOWN_V1_BYTES = new Map();\n');
  write(root, 'shared/sdd/__tests__/fixtures/v1.fixture', 'frozen V1 evidence\n');
  write(root, 'services/agent-mon/schema.ts', "export const version = 'agent-mon V1';\n");
  write(root, POLICY_PATH, `${JSON.stringify(policy(), null, 2)}\n`);
  const observed = execute(root).report;
  write(
    root,
    POLICY_PATH,
    `${JSON.stringify(policy(observed.inventoryDigest, observed.counts), null, 2)}\n`
  );
  assert.equal(execute(root).status, 0);
  return root;
}

afterEach(() => {
  for (const root of temporary.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('UV-27A V1-only eradication inventory', () => {
  it('passes the real tree with zero forbidden residue and protects canonical/migration/evidence classes', () => {
    const result = execute(ROOT);
    assert.equal(result.status, 0, JSON.stringify(result.report.findings, null, 2));
    const byPath = new Map(result.report.entries.map((entry) => [entry.path, entry]));
    assert.equal(byPath.get('ai/skills/sdd-execute/SKILL.md')?.classification, 'canonical-v2');
    assert.equal(
      byPath.get('shared/sdd/migration-bootstrap.ts')?.classification,
      'required-v1-to-v2-migration-boundary'
    );
    assert.equal(
      byPath.get('shared/sdd/__tests__/fixtures/v1-sdd-setup.SKILL.md')?.classification,
      'historical-test-evidence'
    );
    assert.equal(
      byPath.get('services/agent-mon/model/agent-session.type.ts')?.classification,
      'unrelated-product-version'
    );
    assert.equal(
      byPath.get('ai/kit/__tests__/v1-skill-names-as-triggers.test.ts')?.classification,
      'historical-test-evidence'
    );
    assert.equal(result.report.findings.length, 0);
  });

  it('fails closed on a real forbidden runtime residue', () => {
    const root = fixture();
    write(root, 'ai/directives/sdd/root.directive.xml', '<OldV1Runtime/>\n');
    const result = execute(root);
    assert.equal(result.status, 1);
    assert.ok(
      result.report.findings.some(
        (finding) =>
          finding.code === 'V1_ERADICATION_FORBIDDEN_RESIDUE' &&
          finding.path === 'ai/directives/sdd/root.directive.xml'
      )
    );
  });

  it('does not accept a protected v2 path name without its causal loader identity', () => {
    const root = fixture();
    write(root, 'ai/skills/sdd-execute/SKILL.md', 'same path, but no canonical loader\n');
    const result = execute(root);
    assert.equal(result.status, 1);
    assert.ok(
      result.report.findings.some(
        (finding) => finding.code === 'V1_ERADICATION_PROTECTED_V2_RECLASSIFIED'
      )
    );
  });

  it('fails on an unclassified marker instead of treating a name or prefix as proof', () => {
    const root = fixture();
    write(root, 'src/looks-modern.ts', "export const protocol = 'V1';\n");
    const result = execute(root);
    assert.equal(result.status, 1);
    assert.ok(
      result.report.findings.some(
        (finding) =>
          finding.code === 'V1_ERADICATION_UNCLASSIFIED_CANDIDATE' &&
          finding.path === 'src/looks-modern.ts'
      )
    );
  });

  it('fails inventory drift even when a new marker has an allowed historical classification', () => {
    const root = fixture();
    write(root, 'specs/new-history.md', 'Historical V1 note.\n');
    const result = execute(root);
    assert.equal(result.status, 1);
    assert.ok(
      result.report.findings.some((finding) => finding.code === 'V1_ERADICATION_INVENTORY_DRIFT')
    );
    assert.ok(
      result.report.entries.some(
        (entry) =>
          entry.path === 'specs/new-history.md' &&
          entry.classification === 'historical-test-evidence'
      )
    );
  });

  it('binds the causal classification policy itself into the frozen digest', () => {
    const root = fixture();
    const changed = JSON.parse(readFileSync(join(root, POLICY_PATH), 'utf8')) as ReturnType<
      typeof policy
    >;
    changed.classifiers[0]!.reason = 'silently broadened policy';
    write(root, POLICY_PATH, `${JSON.stringify(changed, null, 2)}\n`);
    const result = execute(root);
    assert.equal(result.status, 1);
    assert.ok(
      result.report.findings.some((finding) => finding.code === 'V1_ERADICATION_INVENTORY_DRIFT')
    );
  });

  it('rejects an active old-runtime reference even after the inventory digest is accepted', () => {
    const root = fixture();
    write(
      root,
      'ai/skills/sdd-execute/SKILL.md',
      [
        'canonical ai/directives/sdd-v2/router.directive.xml',
        'read active ai/directives/sdd/discovery.directive.xml',
        '',
      ].join('\n')
    );
    const observed = execute(root).report;
    acceptObservedInventory(root, observed);
    const result = execute(root);
    assert.equal(result.status, 1);
    assert.equal(
      result.report.findings.some((finding) => finding.code === 'V1_ERADICATION_INVENTORY_DRIFT'),
      false
    );
    assert.ok(
      result.report.findings.some(
        (finding) => finding.code === 'V1_ERADICATION_FORBIDDEN_ACTIVE_REFERENCE'
      )
    );
  });

  it('allows an old directive path only as explicit ai/kit source provenance', () => {
    const root = fixture();
    write(
      root,
      'ai/kit/axiom/process/ax-history.xml',
      '<!-- source: ai/directives/sdd/discovery.directive.xml -->\n<Rule>current v2 body</Rule>\n'
    );
    const observed = execute(root).report;
    acceptObservedInventory(root, observed);
    const result = execute(root);
    assert.equal(result.status, 0, JSON.stringify(result.report.findings));
    assert.equal(
      result.report.entries.find((entry) => entry.path.endsWith('ax-history.xml'))?.classification,
      'canonical-v2'
    );
  });

  it('rejects unknown classifications before inventory scanning', () => {
    const root = fixture();
    const invalid = JSON.parse(readFileSync(join(root, POLICY_PATH), 'utf8')) as ReturnType<
      typeof policy
    >;
    invalid.classifiers[0]!.classification = 'canonical-v3';
    write(root, POLICY_PATH, `${JSON.stringify(invalid, null, 2)}\n`);
    const result = executeRaw(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /V1_ERADICATION_POLICY_INVALID:.*unknown classification/u);
  });

  it('rejects duplicate marker ids and protected paths before inventory scanning', () => {
    for (const duplicate of ['marker', 'protected'] as const) {
      const root = fixture();
      const invalid = JSON.parse(readFileSync(join(root, POLICY_PATH), 'utf8')) as ReturnType<
        typeof policy
      >;
      if (duplicate === 'marker') invalid.markers.push({ ...invalid.markers[0]! });
      else invalid.protectedPaths.push({ ...invalid.protectedPaths[0]! });
      write(root, POLICY_PATH, `${JSON.stringify(invalid, null, 2)}\n`);
      const result = executeRaw(root);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /V1_ERADICATION_POLICY_INVALID:.*duplicate/u);
    }
  });
});
