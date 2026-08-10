// @file: Real-filesystem integration proof for runtime namespace isolation, reset and diagnostic reopen.
// @consumers: node:test runner
// @tasks: TSK-172

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ReviewRuntimeProfile } from '../runtime-profile.ts';
import { RuntimeProfilePort } from '../runtime-profile.port.ts';
import { StateStore } from '../state-store.ts';
import type { ReviewRuntimeRoots } from '../types/review-runtime-roots.type.ts';
import { bootstrap, BootstrapSafetyError } from '../../../serve/bootstrap.ts';

type RuntimeProfileIntegrationContext = {
  root: string;
  roots: ReviewRuntimeRoots;
  productionFile: string;
  dispose: () => void;
};

function createRuntimeProfileIntegrationContext(): RuntimeProfileIntegrationContext {
  const root = mkdtempSync(join(tmpdir(), 'gennady-runtime-profile-'));
  const roots = {
    production: join(root, 'production'),
    test: join(root, 'test'),
    mock: join(root, 'mock'),
  };
  mkdirSync(roots.production, { recursive: true });
  const productionFile = join(roots.production, 'production-state.bin');
  writeFileSync(productionFile, Buffer.from([0, 17, 23, 255]));
  return { root, roots, productionFile, dispose: () => rmSync(root, { recursive: true }) };
}

describe('RuntimeProfilePort integration', () => {
  it('test reset cannot read write or delete production state', async () => {
    const context = createRuntimeProfileIntegrationContext();
    try {
      const before = readFileSync(context.productionFile);
      const profile = ReviewRuntimeProfile.compose({
        stateNamespace: 'test',
        externalIoPolicy: 'real-readonly',
        runId: 'owned-run-172',
      });
      const port = new RuntimeProfilePort(context.roots);
      const binding = await port.openProfile(profile);
      const store = new StateStore(binding);
      const testBytes = join(binding.stateRoot, 'test-state.bin');
      writeFileSync(testBytes, Buffer.from([9, 9, 9]));

      await port.resetBoundTestRun('owned-run-172');

      // #region START_RESET_ISOLATION_ASSERT_PHYSICAL_BYTES
      assert.deepStrictEqual(readFileSync(context.productionFile), before);
      assert.throws(() => readFileSync(testBytes), /ENOENT/);
      assert.strictEqual(store.getStateDir(), binding.stateRoot);
      assert.strictEqual(store.getRuntimeProfile(), profile);
      await assert.rejects(
        () => port.resetBoundTestRun('foreign-run-172'),
        /\[RuntimeProfilePort#resetBoundTestRun\] Reset denied/
      );
      // #endregion END_RESET_ISOLATION_ASSERT_PHYSICAL_BYTES
    } finally {
      context.dispose();
    }
  });

  it('saved run reopens read only and foreign reset or root collision is rejected', async () => {
    const context = createRuntimeProfileIntegrationContext();
    try {
      // #region START_DIAGNOSTIC_ISOLATION_SETUP_SAVED_RUN
      const effectsProfile = ReviewRuntimeProfile.compose({
        stateNamespace: 'test',
        externalIoPolicy: 'real-effects',
        runId: 'saved-run-172',
        effectAllowlistIdentity: 'allowlist:saved-run-172',
      });
      const saved = await new RuntimeProfilePort(context.roots).openProfile(effectsProfile);
      const evidencePath = join(saved.stateRoot, 'evidence.json');
      writeFileSync(evidencePath, '{"saved":true}\n', 'utf8');
      const reopenedProfile = effectsProfile.composeReadOnlyReopen();
      const reopenedPort = new RuntimeProfilePort(context.roots);
      const reopened = await reopenedPort.openProfile(reopenedProfile, { reopenReadOnly: true });
      // #endregion END_DIAGNOSTIC_ISOLATION_SETUP_SAVED_RUN

      // #region START_DIAGNOSTIC_ISOLATION_ASSERT_GUARDS
      assert.strictEqual(readFileSync(evidencePath, 'utf8'), '{"saved":true}\n');
      assert.strictEqual(reopened.reopenedReadOnly, true);
      assert.strictEqual(reopened.profile.externalIoPolicy, 'real-readonly');
      await assert.rejects(
        () => reopenedPort.resetBoundTestRun('saved-run-172'),
        /Reset denied for foreign runtime/
      );
      await assert.rejects(
        () =>
          new RuntimeProfilePort({
            production: context.roots.production,
            test: join(context.roots.production, 'nested-test'),
            mock: context.roots.mock,
          }).openProfile(reopenedProfile, { reopenReadOnly: true }),
        /Runtime roots collide/
      );
      // #endregion END_DIAGNOSTIC_ISOLATION_ASSERT_GUARDS

      // #region START_DIAGNOSTIC_ISOLATION_TRIGGER_STORAGE_FAILURE
      const blockedRoot = join(context.root, 'blocked-root');
      writeFileSync(blockedRoot, 'not-a-directory', 'utf8');
      const observed: string[] = [];
      await assert.rejects(
        () =>
          bootstrap({
            mocks: false,
            port: 0,
            runtimeProfile: {
              stateNamespace: 'test',
              externalIoPolicy: 'real-readonly',
              runId: 'storage-failure-172',
            },
            runtimeRoots: context.roots,
            stateDir: join(blockedRoot, 'child'),
            onBootState: (state) => {
              observed.push(state.phase);
            },
          }),
        (error: unknown) => {
          assert.ok(error instanceof BootstrapSafetyError);
          assert.strictEqual(error.bootState.phase, 'failed');
          assert.match(error.bootState.error ?? '', /Runtime safety binding failed/);
          return true;
        }
      );
      // #endregion END_DIAGNOSTIC_ISOLATION_TRIGGER_STORAGE_FAILURE

      assert.deepStrictEqual(observed, ['connect', 'failed']);
    } finally {
      context.dispose();
    }
  });
});
