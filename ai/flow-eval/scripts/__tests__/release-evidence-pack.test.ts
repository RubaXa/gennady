// @file: REL-18 contract tests for the immutable clean-commit evidence matrix and migration no-op bar.
// @spec: AI-SKILLS
// @consumers: node:test via test:sdd-flow-eval and test-topology

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  migrationScopeIdentityFinding,
  releaseEvidenceCommandPlan,
  renderReleaseEvidenceReadme,
  validateReleaseEvidenceResult,
  type ReleaseEvidenceManifest,
} from '../release-evidence-contract.ts';

describe('REL-18 release evidence plan', () => {
  it('contains the six literal release gates and two deterministic migration rounds', () => {
    const plan = releaseEvidenceCommandPlan(['vcs', 'cli']);
    assert.deepEqual(
      plan.slice(0, 6).map(({ id, command, args }) => ({ id, command, args })),
      [
        { id: 'type-check', command: 'npm', args: ['run', 'type-check'] },
        { id: 'format-check', command: 'npm', args: ['run', 'format'] },
        { id: 'lint', command: 'npm', args: ['run', 'lint'] },
        { id: 'audit-sdd-templates', command: 'npm', args: ['run', 'audit:sdd-templates'] },
        { id: 'build', command: 'npm', args: ['run', 'build'] },
        { id: 'test', command: 'npm', args: ['test'] },
      ]
    );
    assert.deepEqual(
      plan.slice(6).map(({ id, migrationScope, migrationRound }) => ({
        id,
        migrationScope,
        migrationRound,
      })),
      [
        { id: 'migration-1-cli', migrationScope: 'cli', migrationRound: 1 },
        { id: 'migration-1-vcs', migrationScope: 'vcs', migrationRound: 1 },
        { id: 'migration-2-cli', migrationScope: 'cli', migrationRound: 2 },
        { id: 'migration-2-vcs', migrationScope: 'vcs', migrationRound: 2 },
      ]
    );
  });

  it('fails closed on nonzero gates and migration output that is not exact no-op', () => {
    const gate = releaseEvidenceCommandPlan([])[0];
    assert.match(validateReleaseEvidenceResult(gate, 2, '') ?? '', /exit=2/);

    const migration = releaseEvidenceCommandPlan(['cli'])[6];
    assert.match(
      validateReleaseEvidenceResult(migration, 0, 'would move 2 tickets') ?? '',
      /не подтвердил exact no-op/
    );
    assert.equal(
      validateReleaseEvidenceResult(migration, 0, 'no-op scope cli — уже мигрирован в v2'),
      null
    );
  });

  it('fails closed when manifest omits a scope from the immutable source tree', () => {
    assert.match(
      migrationScopeIdentityFinding(['cli'], ['cli', 'vcs']) ?? '',
      /не совпадают с source tree/
    );
    assert.match(
      migrationScopeIdentityFinding(['vcs', 'cli'], ['cli', 'vcs']) ?? '',
      /уникальны и отсортированы/
    );
    assert.equal(migrationScopeIdentityFinding(['cli', 'vcs'], ['cli', 'vcs']), null);
  });

  it('renders README deterministically in repository Prettier form', async () => {
    const manifest: ReleaseEvidenceManifest = {
      schema: 'gennady.rc-evidence-pack.v1',
      sourceCommit: '1'.repeat(40),
      generatedAt: '2026-09-23T00:00:00.000Z',
      cleanBefore: true,
      cleanAfter: true,
      environment: {
        platform: 'darwin',
        arch: 'arm64',
        node: 'v22.23.2',
        nodeExecutable: '/node',
        npm: '10.9.8',
        packageLockSha256: '2'.repeat(64),
      },
      commands: [
        {
          id: 'type-check',
          command: 'npm run type-check',
          exitCode: 0,
          signal: null,
          logFile: 'logs/type-check.log',
          sha256: '3'.repeat(64),
        },
      ],
      migration: { scopes: ['cli'], rounds: 2, allNoOp: true },
    };
    const markdown = renderReleaseEvidenceReadme(manifest);
    const { format } = await import('prettier');
    assert.equal(await format(markdown, { parser: 'markdown' }), markdown);
  });
});
