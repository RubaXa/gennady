// @file: Unit tests for AgentMonitor — provider registry and scan coordination
// @consumers: monitor
// @tasks: TSK-36

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { AgentMonitor } from '../agent-monitor.ts';
import type { AgentProvider } from '../../model/agent-provider.type.ts';
import type { AgentSession } from '../../model/agent-session.type.ts';
import type { ScanOpts } from '../../model/scan-opts.type.ts';
import { DuplicateProviderError, ProviderNotFoundError } from '../../model/errors.ts';

/**
 * @purpose Minimal valid AgentSession factory for use in mock providers.
 * All required fields populated; optional fields left undefined.
 */
function makeSession(overrides?: Partial<AgentSession>): AgentSession {
  return {
    provider: 'mock',
    pid: 12345,
    sessionId: 'sess-1',
    title: 'Mock Session',
    cwd: '/mock',
    status: 'active',
    startedAt: 100,
    elapsedSeconds: 0,
    ...overrides,
  };
}

/**
 * @purpose Create a mock AgentProvider whose scan() returns the given sessions.
 * Uses native mock.fn() for call tracking.
 */
function mockProvider(key: string, sessions: AgentSession[]): AgentProvider {
  return {
    key,
    scan: mock.fn(async (_opts?: ScanOpts): Promise<AgentSession[]> => sessions),
  } satisfies AgentProvider;
}

describe('AgentMonitor', () => {
  let monitor: AgentMonitor;

  beforeEach(() => {
    monitor = new AgentMonitor();
  });

  describe('#register', () => {
    it('register adds provider and rejects duplicate', async () => {
      // purpose: verify provider registration contract — register stores provider so scanAll delegates to it; duplicate key throws DuplicateProviderError with the conflicting key
      // contract: scanAll must invoke provider.scan(); duplicate registration must throw DuplicateProviderError
      // failure mode: do not assert internal provider map size — verify through public scanAll behavior

      // #region START_REGISTER_DUPLICATE_SETUP
      const provider1 = mockProvider('test', [makeSession({ provider: 'test', startedAt: 2000 })]);
      const provider2 = mockProvider('test', []);
      // #endregion END_REGISTER_DUPLICATE_SETUP

      // #region START_REGISTER_DUPLICATE_TRIGGER
      monitor.register('test', provider1);
      const sessions = await monitor.scanAll();
      // #endregion END_REGISTER_DUPLICATE_TRIGGER

      // #region START_REGISTER_DUPLICATE_ASSERT
      assert.strictEqual(provider1.scan.mock.callCount(), 1);
      assert.strictEqual(sessions.length, 1);
      assert.strictEqual(sessions[0].provider, 'test');

      assert.throws(
        () => monitor.register('test', provider2),
        (error: unknown) => {
          assert.ok(error instanceof DuplicateProviderError);
          assert.match((error as DuplicateProviderError).message, /"test"/);
          return true;
        }
      );
      // #endregion END_REGISTER_DUPLICATE_ASSERT
    });
  });

  describe('#unregister', () => {
    it('unregister removes provider so scanAll returns empty', async () => {
      // purpose: verify unregister contract — removed provider is no longer called during scanAll
      // side effect: scanAll on empty registry returns []

      // #region START_UNREGISTER_SETUP
      const provider = mockProvider('to-remove', [makeSession()]);
      monitor.register('to-remove', provider);
      // #endregion END_UNREGISTER_SETUP

      // #region START_UNREGISTER_TRIGGER
      monitor.unregister('to-remove');
      const sessions = await monitor.scanAll();
      // #endregion END_UNREGISTER_TRIGGER

      // #region START_UNREGISTER_ASSERT
      assert.strictEqual(provider.scan.mock.callCount(), 0);
      assert.deepStrictEqual(sessions, []);
      // #endregion END_UNREGISTER_ASSERT
    });
  });

  describe('#scanAll', () => {
    it('scanAll aggregates from all providers', async () => {
      // purpose: verify scanAll aggregation contract — results from all providers are flattened and sorted by startedAt descending, each session carries its provider key
      // contract: return value is a flat array sorted by startedAt desc; provider field matches registration key
      // invariant: sort order is stable when startedAt timestamps differ

      // #region START_SCANALL_AGGREGATE_SETUP
      const providerA = mockProvider('alpha', [
        makeSession({ provider: 'alpha', startedAt: 1000, sessionId: 'a-1' }),
      ]);
      const providerB = mockProvider('beta', [
        makeSession({ provider: 'beta', startedAt: 3000, sessionId: 'b-1' }),
      ]);
      monitor.register('alpha', providerA);
      monitor.register('beta', providerB);
      // #endregion END_SCANALL_AGGREGATE_SETUP

      // #region START_SCANALL_AGGREGATE_TRIGGER
      const sessions = await monitor.scanAll();
      // #endregion END_SCANALL_AGGREGATE_TRIGGER

      // #region START_SCANALL_AGGREGATE_OBSERVE
      // observation focus: sort order + provider key fidelity are the contract surface
      const actual = sessions.map((s) => ({
        provider: s.provider,
        sessionId: s.sessionId,
        startedAt: s.startedAt,
      }));
      // #endregion END_SCANALL_AGGREGATE_OBSERVE

      // #region START_SCANALL_AGGREGATE_ASSERT
      assert.strictEqual(sessions.length, 2);
      assert.deepStrictEqual(actual, [
        { provider: 'beta', sessionId: 'b-1', startedAt: 3000 },
        { provider: 'alpha', sessionId: 'a-1', startedAt: 1000 },
      ]);
      // #endregion END_SCANALL_AGGREGATE_ASSERT
    });

    it('scanAll degrades gracefully on provider failure', async () => {
      // purpose: verify N3 graceful degradation — a failing provider returns empty array and does not abort remaining providers
      // contract: one provider's failure must not prevent other providers from contributing their sessions
      // failure mode: scanAll must NOT throw when a provider fails; must return surviving provider sessions

      // #region START_SCANALL_DEGRADE_SETUP
      const failingProvider: AgentProvider = {
        key: 'failing',
        scan: mock.fn(async (_opts?: ScanOpts): Promise<AgentSession[]> => {
          throw new Error('connection refused');
        }),
      };
      const workingProvider = mockProvider('working', [
        makeSession({ provider: 'working', sessionId: 'w-1' }),
      ]);
      monitor.register('failing', failingProvider);
      monitor.register('working', workingProvider);
      // #endregion END_SCANALL_DEGRADE_SETUP

      // #region START_SCANALL_DEGRADE_TRIGGER
      const sessions = await monitor.scanAll();
      // #endregion END_SCANALL_DEGRADE_TRIGGER

      // #region START_SCANALL_DEGRADE_ASSERT
      assert.strictEqual(sessions.length, 1);
      assert.strictEqual(sessions[0].provider, 'working');
      assert.strictEqual(sessions[0].sessionId, 'w-1');
      // #endregion END_SCANALL_DEGRADE_ASSERT
    });
  });

  describe('#scanOne', () => {
    it('scanOne throws ProviderNotFoundError for unknown key', async () => {
      // purpose: verify scanOne error contract — unknown provider key must throw ProviderNotFoundError with the missing key
      // contract: error is ProviderNotFoundError; message contains the missing key; instanceof check is the contract surface for callers

      // #region START_SCANONE_UNKNOWN_TRIGGER_AND_ASSERT
      await assert.rejects(
        () => monitor.scanOne('unknown'),
        (error: unknown) => {
          assert.ok(error instanceof ProviderNotFoundError);
          assert.match((error as ProviderNotFoundError).message, /"unknown"/);
          return true;
        }
      );
      // #endregion END_SCANONE_UNKNOWN_TRIGGER_AND_ASSERT
    });

    it('scanOne returns sessions from the specified provider', async () => {
      // purpose: verify scanOne happy-path — delegates to the registered provider and returns its sessions
      // contract: scanOne must call provider.scan() with the passed opts and return the result array

      // #region START_SCANONE_HAPPY_SETUP
      const provider = mockProvider('gamma', [
        makeSession({ provider: 'gamma', sessionId: 'g-1' }),
      ]);
      monitor.register('gamma', provider);
      // #endregion END_SCANONE_HAPPY_SETUP

      // #region START_SCANONE_HAPPY_TRIGGER
      const sessions = await monitor.scanOne('gamma');
      // #endregion END_SCANONE_HAPPY_TRIGGER

      // #region START_SCANONE_HAPPY_ASSERT
      assert.strictEqual(provider.scan.mock.callCount(), 1);
      assert.strictEqual(sessions.length, 1);
      assert.strictEqual(sessions[0].provider, 'gamma');
      assert.strictEqual(sessions[0].sessionId, 'g-1');
      // #endregion END_SCANONE_HAPPY_ASSERT
    });
  });
});
