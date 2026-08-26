// @file: Shippable bootstrap-to-one-shot black-box proof.
// @consumers: TSK-184 verification
// @tasks: TSK-184, TSK-190

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import { cleanupTestTmp, makeTestTmpDir } from '../../modules/inbox-core/test-support/test-tmp.ts';
import { VcsInboxMock } from '../../modules/inbox-core/vcs-inbox.mock.ts';
import { OpenCodeMock } from '../../modules/inbox-opencode/opencode.mock.ts';
import { bootstrap, type BootstrapResult } from '../bootstrap.ts';
import { runMrsOnce } from '../run-mode.ts';
import { gracefulShutdown } from '../shutdown.ts';

const MR = 'https://gitlab.example.com/group/project/-/merge_requests/184';

describe('bootstrap one-shot pipeline black box', () => {
  it('live readonly OpenCode operation produces trusted tool trace without effects', async () => {
    const root = makeTestTmpDir('bootstrap-one-shot-');
    let result: BootstrapResult | undefined;
    try {
      result = await bootstrap({
        mocks: true,
        port: 0,
        stateDir: `${root}/mock/run-184`,
        runtimeRoots: {
          production: `${root}/production`,
          test: `${root}/test`,
          mock: `${root}/mock`,
        },
      });
      const vcs = new VcsInboxMock();
      vcs.seed([], {
        [MR]: {
          project: 'group/project',
          iid: '184',
          webUrl: MR,
          title: 'Control-plane cutover',
          sourceBranch: 'feature',
          targetBranch: 'main',
          createdAt: '2026-08-13T10:00:00Z',
          updatedAt: '2026-08-13T11:00:00Z',
          author: 'other',
          reviewers: ['operator'],
          approvedBy: [],
          description: 'Wire deterministic pipeline acceptance.',
          myRole: 'reviewer',
        },
      });
      assert.ok(result.opencode instanceof OpenCodeMock);
      const fields = Object.fromEntries(
        [
          'objective',
          'acceptance',
          'outOfScope',
          'sourceAnchors',
          'components',
          'dependencies',
          'invariants',
          'decisions',
          'requirementIds',
          'behavior',
          'observedDrift',
          'changedBehavior',
          'positiveScenarios',
          'negativeScenarios',
          'coverageGaps',
          'trustBoundaries',
          'assets',
          'threats',
          'mitigations',
          'resources',
          'bottlenecks',
          'alternatives',
          'identity',
          'purpose',
          'observedChanges',
          'risks',
          'testImpact',
          'responsibility',
          'lensId',
          'lensVersion',
          'observations',
          'evidenceRefs',
          'conclusion',
          'sectionId',
          'schema',
          'fragments',
          'anchors',
          'diagramType',
          'typedNodes',
          'dependencyEdges',
          'beforeState',
          'afterState',
          'changedRelations',
          'orderedActors',
          'orderedEvents',
          'branches',
          'terminalOutcomes',
        ].map((field) => [field, `worker:${field}`])
      );
      for (const task of ['pipeline_track_control', 'pipeline_lens_control']) {
        result.opencode.seed(task, { findings: [] });
      }

      const sourceIds = [
        'goal',
        'architecture',
        'specification',
        'tests',
        'security',
        'optimality',
        'review-lens',
        'discussions',
      ];
      const inventory = [
        ...sourceIds.map((name) => ({
          inputId: `source:${name}`,
          kind: 'source' as const,
          canonicalIdentity: `${MR}#${name}`,
        })),
        { inputId: 'file:runtime.ts', kind: 'file' as const, canonicalIdentity: 'runtime.ts' },
        {
          inputId: 'entity:Runtime',
          kind: 'entity' as const,
          canonicalIdentity: 'runtime.ts#Runtime',
        },
      ];
      for (const input of inventory) {
        const inputDigest = createHash('sha256').update(input.inputId).digest('hex');
        const operationTitle = `pipeline_control_slot_${inputDigest}`;
        result.opencode.seed(operationTitle, {
          sourceId: 'forged-agent-source',
          content: 'Agent-authored black-box control evidence.',
          fields,
        });
        result.opencode.seedToolCalls(operationTitle, [`control-plane/sources/${inputDigest}.txt`]);
      }

      const acceptance = await runMrsOnce({
        mrs: [MR],
        deps: {
          pipeline: result.pipeline,
          vcs,
          fetchDiffRefs: async () => ({ headSha: 'head-184' }),
          captureReviewInput: async () => ({
            inputs: inventory.map((input) => {
              const capturedBytes = `exact:${input.canonicalIdentity}`;
              return {
                ...input,
                version: 'head-184',
                digest: createHash('sha256').update(capturedBytes).digest('hex'),
                capturedBytes,
              };
            }),
            classifications: inventory.map((input) => ({
              inputId: input.inputId,
              code: 'BEHAVIOR_CHANGED' as const,
              changeShape: ['BEHAVIOR_CHANGED' as const],
              rationaleDigest: `classification:${input.inputId}`,
              classifierVersion: 'review-classifier-v0',
            })),
            provenance: ['black-box-exact-capture'],
          }),
        },
      });
      const mrResult = acceptance.results[0];
      assert.strictEqual(mrResult?.state, 'completed');
      assert.strictEqual(mrResult?.runtimeIdentity, result.controlPlaneTrace.runtimeIdentity);
      assert.strictEqual(mrResult?.runtimeIdentity, result.pipeline.identity);
      assert.ok(mrResult?.artifacts?.['review.json']);
      assert.ok(mrResult?.artifacts?.['verdict.json']);
      assert.ok(
        Object.keys(mrResult?.artifacts ?? {}).some((name) => name === 'tail_reviewer.json')
      );
    } finally {
      if (result) {
        result.pipeline.stop();
        await gracefulShutdown({
          server: result.server,
          scheduler: result.scheduler,
          opencode: result.opencode,
          opencodeProcess: result.opencodeProcess,
          opencodePidFile: result.opencodePidFile,
        });
        clearInterval(result.lifecycleReaper);
      }
      cleanupTestTmp(root);
    }
  });
});

setTimeout(() => process.exit(0), 60_000).unref();
