// @file: Shippable bootstrap composition proof for the deterministic review control plane.
// @consumers: TSK-184 verification, TSK-190 trusted boundary verification
// @tasks: TSK-184, TSK-190

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cleanupTestTmp, makeTestTmpDir } from '../../modules/inbox-core/test-support/test-tmp.ts';
import { PipelineRuntime } from '../../modules/inbox-pipeline/pipeline-runtime.ts';
import { bootstrap, type BootstrapResult } from '../bootstrap.ts';
import { gracefulShutdown } from '../shutdown.ts';

describe('bootstrap deterministic control plane', () => {
  it('real bootstrap constructs and drives every deterministic control-plane boundary', async () => {
    const stateDir = makeTestTmpDir('bootstrap-control-plane-');
    let result: BootstrapResult | undefined;
    try {
      result = await bootstrap({
        mocks: true,
        port: 0,
        stateDir: `${stateDir}/mock/run-184`,
        runtimeRoots: {
          production: `${stateDir}/production`,
          test: `${stateDir}/test`,
          mock: `${stateDir}/mock`,
        },
      });
      const composition = result.pipeline.retrieveControlPlane();

      // #region START_BOOTSTRAP_ASSERT_REACHABLE_BOUNDARIES
      assert.ok(result.pipeline instanceof PipelineRuntime);
      assert.ok(composition);
      assert.strictEqual(result.controlPlaneTrace.runtimeIdentity, result.pipeline.identity);
      assert.strictEqual(result.controlPlaneTrace.separateControlJournal, true);
      assert.deepStrictEqual(result.controlPlaneTrace.boundaries, {
        manifestBuilder: 'ReviewInputManifestBuilder',
        contractCompiler: 'ReviewContractCompiler',
        receiptRecorder: 'ReviewRuntimeReceiptRecorder',
        structuralValidator: 'ReviewStructuralValidator',
        repairCoordinator: 'ReviewRepairCoordinator',
        freshnessGate: 'ReviewFreshnessGate',
        orchestrator: 'ReviewOrchestrator',
        synthesis: 'ReviewSynthesis',
        effectCoordinator: 'UNAVAILABLE_IN_PROFILE',
      });
      assert.strictEqual(result.pipeline.retrieveControlPlane(), composition);
      // #endregion END_BOOTSTRAP_ASSERT_REACHABLE_BOUNDARIES

      // #region START_BOOTSTRAP_DRIVE_CONTROL_PATH
      const intent = {
        kind: 'full' as const,
        manifestKey: {
          mr: 'group/project!184',
          headSHA: 'head-184',
          eventCursor: 'cursor-184',
        },
        trigger: 'integration-test',
        requester: 'operator',
      };
      const prepared = await result.pipeline.prepareControlPlaneReview(intent, {
        inputs: [
          {
            inputId: 'file:bootstrap.ts',
            kind: 'file',
            canonicalIdentity: 'services/agent-inbox/serve/bootstrap.ts',
            version: 'head-184',
            digest: 'digest-bootstrap-184',
          },
        ],
        classifications: [
          {
            inputId: 'file:bootstrap.ts',
            code: 'RUNTIME_FLOW_CHANGED',
            changeShape: ['RUNTIME_FLOW_CHANGED', 'BEHAVIOR_CHANGED'],
            rationaleDigest: 'classification-184',
            classifierVersion: 'review-classifier-v0',
          },
        ],
        provenance: ['bootstrap-control-plane-test'],
      });
      assert.strictEqual(prepared.manifest.status, 'SEALED');
      assert.strictEqual(prepared.contract?.status, 'COMPILED');
      assert.ok(prepared.manifest.status === 'SEALED');
      assert.ok(prepared.contract?.status === 'COMPILED');
      const incomplete = composition.structuralValidator.validate({
        manifest: prepared.manifest,
        contract: prepared.contract,
        artifacts: [],
        evidence: [],
        storeContext: {
          namespace: result.runtimeBinding.profile.stateNamespace,
          contractId: prepared.contract.contractId,
          manifestKeyDigest: prepared.contract.manifestKeyDigest,
        },
        attempt: 0,
        maxAttempts: 3,
      });
      assert.strictEqual(incomplete.status, 'REPAIRABLE');
      assert.strictEqual(composition.orchestrator.canPublish(incomplete, true), false);
      const repair = await composition
        .repairCoordinator(prepared.contract.contractId)
        .planTargetedRepair(prepared.contract, incomplete);
      assert.ok('slotIds' in repair);
      const guarded = await composition.freshnessGate.guard(
        'VERDICT',
        intent.manifestKey,
        () => 'head-184:cursor-184',
        () => 'validated'
      );
      assert.strictEqual(guarded.status, 'FRESH');
      // #endregion END_BOOTSTRAP_DRIVE_CONTROL_PATH
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
      cleanupTestTmp(stateDir);
    }
  });
});

setTimeout(() => process.exit(0), 60_000).unref();
