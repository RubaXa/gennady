// @file: Port contract tests — exercises shared suites against every mock adapter, each twice.
// @consumers: node:test runner
// @tasks: TSK-180

import { describe, it } from 'node:test';
import {
  assertJournalPortContract,
  assertArtifactStorePortContract,
  assertClockPortContract,
  assertTaskExecutorPortContract,
  assertProjectionPortContract,
  assertAgentRuntimePortContract,
  assertVcsPortContract,
  composePortContractSuites,
} from '../../../test/mock-port-suites.ts';

describe('mock-port contracts', () => {
  it('all mock adapters satisfy shared port contracts exhaustively', async () => {
    // contract: composePortContractSuites() produces independent factory functions;
    //           running two sets of fresh adapters proves each factory is isolated
    const run1 = composePortContractSuites();
    await assertJournalPortContract(run1.journal());
    await assertArtifactStorePortContract(run1.artifactStore());
    assertClockPortContract(run1.clock());
    await assertTaskExecutorPortContract(run1.taskExecutor);
    assertProjectionPortContract(run1.projection());
    await assertAgentRuntimePortContract(run1.agent());
    await assertVcsPortContract(run1.vcs());

    const run2 = composePortContractSuites();
    await assertJournalPortContract(run2.journal());
    await assertArtifactStorePortContract(run2.artifactStore());
    assertClockPortContract(run2.clock());
    await assertTaskExecutorPortContract(run2.taskExecutor);
    assertProjectionPortContract(run2.projection());
    await assertAgentRuntimePortContract(run2.agent());
    await assertVcsPortContract(run2.vcs());
  });

  describe('JournalPort — InMemoryJournalAdapter', () => {
    it('one named shared contract suite per port', async () => {
      await assertJournalPortContract(composePortContractSuites().journal());
    });
  });

  describe('ArtifactStorePort — InMemoryArtifactAdapter', () => {
    it('one named shared contract suite per port', async () => {
      await assertArtifactStorePortContract(composePortContractSuites().artifactStore());
    });
  });

  describe('ClockPort — ControlledClockAdapter', () => {
    it('one named shared contract suite per port', () => {
      assertClockPortContract(composePortContractSuites().clock());
    });
  });

  describe('TaskExecutorPort — DeterministicTaskExecutor', () => {
    it('one named shared contract suite per port', async () => {
      await assertTaskExecutorPortContract(composePortContractSuites().taskExecutor);
    });
  });

  describe('ProjectionPort — InMemoryProjectionAdapter', () => {
    it('one named shared contract suite per port', () => {
      assertProjectionPortContract(composePortContractSuites().projection());
    });
  });

  describe('AgentRuntimePort — MockAgentAdapter', () => {
    it('one named shared contract suite per port', async () => {
      await assertAgentRuntimePortContract(composePortContractSuites().agent());
    });
  });

  describe('VcsPort — MockVcsAdapter', () => {
    it('one named shared contract suite per port', async () => {
      await assertVcsPortContract(composePortContractSuites().vcs());
    });
  });
});
