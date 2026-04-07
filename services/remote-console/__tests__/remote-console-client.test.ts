import { beforeEach, describe, it, mock, type TestContext } from 'node:test';
import { strict as assert } from 'node:assert';
import type { RemoteConsoleCommandEnvelope } from '../server/remote-console-server.types.ts';
import { remoteConsoleClient } from '../remote-console.ts';
import { serializeRemoteConsoleArg } from '../client/remote-console-client-serializer.ts';

/**
 * RemoteConsoleClient Test Graph:
 * ├── connect()
 * │   ├── should emit connect event with tab and branch metadata
 * │   ├── should preserve local console behavior and send mirrored entries
 * │   ├── should flush batches no more than once every five seconds
 * │   ├── should flush before disconnect and then send disconnect command
 * │   ├── should warn once for duplicate connect on same target
 * │   ├── should degrade to local console after first transport failure
 * │   ├── should trigger auto-disconnect on pagehide
 * │   ├── should prefer sendBeacon before keepalive fetch on unload
 * │   └── should flush buffered logs before unload disconnect signal
 * │
 * └── serializeRemoteConsoleArg()
 *     └── should never throw for non-JSON-safe values
 */
describe('remoteConsoleClient', () => {
  let fetchCalls: Array<{ url: string; init: RequestInit }>;
  let fetchFailuresRemaining: number;
  let sendBeaconCalls: Array<{ url: string; payloadText: string }>;
  let listeners: Map<string, Set<() => void>>;
  let addEventListenerMock: ReturnType<typeof mock.fn>;
  let removeEventListenerMock: ReturnType<typeof mock.fn>;
  let sendBeaconMode: 'disabled' | 'always-true' | 'always-false';

  beforeEach(() => {
    // START_BEFORE_EACH_ARRANGE_GLOBAL_RUNTIME_DOUBLES
    fetchCalls = [];
    fetchFailuresRemaining = 0;
    sendBeaconCalls = [];
    listeners = new Map();
    sendBeaconMode = 'disabled';

    addEventListenerMock = mock.fn((eventName: string, listener: () => void) => {
      const eventListeners = listeners.get(eventName) ?? new Set<() => void>();
      eventListeners.add(listener);
      listeners.set(eventName, eventListeners);
    });

    removeEventListenerMock = mock.fn((eventName: string, listener: () => void) => {
      const eventListeners = listeners.get(eventName);
      eventListeners?.delete(listener);
    });

    Object.defineProperty(globalThis, 'addEventListener', {
      configurable: true,
      value: addEventListenerMock,
    });

    Object.defineProperty(globalThis, 'removeEventListener', {
      configurable: true,
      value: removeEventListenerMock,
    });

    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        sendBeacon: (url: string, _payload: Blob) => {
          if (sendBeaconMode === 'disabled') {
            return false;
          }

          sendBeaconCalls.push({ url, payloadText: '[blob]' });

          return sendBeaconMode === 'always-true';
        },
      },
    });

    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: async (url: string, init?: RequestInit) => {
        if (fetchFailuresRemaining > 0) {
          fetchFailuresRemaining -= 1;
          throw new Error('transport_down');
        }

        fetchCalls.push({ url, init: init ?? {} });
        return new Response(JSON.stringify({ ok: true }), { status: 202 });
      },
    });
    // END_BEFORE_EACH_ARRANGE_GLOBAL_RUNTIME_DOUBLES
  });

  describe('connect()', () => {
    it('should emit connect event with tab and branch metadata', async () => {
      // START_CONNECT_EVENT_ARRANGE_TARGET
      const target = createConsoleTarget();
      remoteConsoleClient.connect(target.consoleTarget, {
        url: 'http://localhost:43100/',
        tabId: 'web-tab-1',
        branch: 'feature/remote-console',
      });
      // END_CONNECT_EVENT_ARRANGE_TARGET

      // START_CONNECT_EVENT_ACT
      await target.consoleTarget.__remote__?.disconnect();
      // END_CONNECT_EVENT_ACT

      // START_CONNECT_EVENT_ASSERT
      const logsEnvelope = extractEnvelope(fetchCalls[0]) as {
        type: string;
        items: Array<{ args: Array<{ text: string }> }>;
      };

      assert.deepStrictEqual(
        {
          envelopeTypes: extractEnvelopeTypes(fetchCalls),
          connectEventArgs: logsEnvelope.items[0]?.args.map((arg) => arg.text),
        },
        {
          envelopeTypes: ['logs', 'disconnect'],
          connectEventArgs: [
            '[remote-console] connected',
            'tabId=web-tab-1',
            'branch=feature/remote-console',
          ],
        }
      );
      // END_CONNECT_EVENT_ASSERT
    });

    it('should preserve local console behavior and send mirrored entries', async () => {
      // START_CONNECT_MIRROR_ARRANGE_TARGET
      const target = createConsoleTarget();
      remoteConsoleClient.connect(target.consoleTarget, { url: 'http://localhost:43101/' });
      // END_CONNECT_MIRROR_ARRANGE_TARGET

      // START_CONNECT_MIRROR_ACT
      target.consoleTarget.log('one');
      target.consoleTarget.info('two');
      target.consoleTarget.warn('three');
      target.consoleTarget.error('four');
      target.consoleTarget.debug('five');
      await target.consoleTarget.__remote__?.disconnect();
      // END_CONNECT_MIRROR_ACT

      // START_CONNECT_MIRROR_ASSERT
      const envelopes = extractEnvelopeTypes(fetchCalls);
      assert.deepStrictEqual(
        {
          localCalls: {
            log: target.calls.log.length,
            info: target.calls.info.length,
            warn: target.calls.warn.length,
            error: target.calls.error.length,
            debug: target.calls.debug.length,
          },
          envelopes,
          firstEnvelopeItems: (extractEnvelope(fetchCalls[0]) as { items: unknown[] }).items.length,
        },
        {
          localCalls: {
            log: 1,
            info: 1,
            warn: 1,
            error: 1,
            debug: 1,
          },
          envelopes: ['logs', 'disconnect'],
          firstEnvelopeItems: 6,
        }
      );
      // END_CONNECT_MIRROR_ASSERT
    });

    it('should flush batches no more than once every five seconds', async (t: TestContext) => {
      // START_CONNECT_FLUSH_INTERVAL_ARRANGE_RUNTIME
      t.mock.timers.enable({ apis: ['setInterval'] });
      const target = createConsoleTarget();
      remoteConsoleClient.connect(target.consoleTarget, { url: 'http://localhost:43102/' });
      target.consoleTarget.log('one');
      // END_CONNECT_FLUSH_INTERVAL_ARRANGE_RUNTIME

      // START_CONNECT_FLUSH_INTERVAL_ACT
      t.mock.timers.tick(4_999);
      await Promise.resolve();
      const callsBeforeWindow = fetchCalls.length;
      t.mock.timers.tick(1);
      await Promise.resolve();
      const callsAfterWindow = fetchCalls.length;
      await target.consoleTarget.__remote__?.disconnect();
      // END_CONNECT_FLUSH_INTERVAL_ACT

      // START_CONNECT_FLUSH_INTERVAL_ASSERT
      assert.deepStrictEqual(
        { callsBeforeWindow, callsAfterWindow },
        { callsBeforeWindow: 0, callsAfterWindow: 1 }
      );
      // END_CONNECT_FLUSH_INTERVAL_ASSERT
    });

    it('should flush before disconnect and then send disconnect command', async () => {
      // START_CONNECT_DISCONNECT_ORDER_ARRANGE_RUNTIME
      const target = createConsoleTarget();
      remoteConsoleClient.connect(target.consoleTarget, { url: 'http://localhost:43103/' });
      target.consoleTarget.log('buffered');
      // END_CONNECT_DISCONNECT_ORDER_ARRANGE_RUNTIME

      // START_CONNECT_DISCONNECT_ORDER_ACT
      await target.consoleTarget.__remote__?.disconnect();
      // END_CONNECT_DISCONNECT_ORDER_ACT

      // START_CONNECT_DISCONNECT_ORDER_ASSERT
      assert.deepStrictEqual(extractEnvelopeTypes(fetchCalls), ['logs', 'disconnect']);
      // END_CONNECT_DISCONNECT_ORDER_ASSERT
    });

    it('should warn once for duplicate connect on same target', async () => {
      // START_CONNECT_DUPLICATE_ARRANGE_RUNTIME
      const target = createConsoleTarget();
      remoteConsoleClient.connect(target.consoleTarget, { url: 'http://localhost:43104/' });
      remoteConsoleClient.connect(target.consoleTarget, { url: 'http://localhost:43104/' });
      remoteConsoleClient.connect(target.consoleTarget, { url: 'http://localhost:43104/' });
      // END_CONNECT_DUPLICATE_ARRANGE_RUNTIME

      // START_CONNECT_DUPLICATE_ACT
      target.consoleTarget.log('single');
      await target.consoleTarget.__remote__?.disconnect();
      // END_CONNECT_DUPLICATE_ACT

      // START_CONNECT_DUPLICATE_ASSERT
      assert.deepStrictEqual(
        {
          warnCalls: target.calls.warn.length,
          envelopes: extractEnvelopeTypes(fetchCalls),
          mirroredEntries: (extractEnvelope(fetchCalls[0]) as { items: unknown[] }).items.length,
        },
        {
          warnCalls: 1,
          envelopes: ['logs', 'disconnect'],
          mirroredEntries: 2,
        }
      );
      // END_CONNECT_DUPLICATE_ASSERT
    });

    it('should degrade to local console after first transport failure', async (t: TestContext) => {
      // START_CONNECT_TRANSPORT_FAILURE_ARRANGE_RUNTIME
      t.mock.timers.enable({ apis: ['setInterval'] });
      fetchFailuresRemaining = 10;
      const target = createConsoleTarget();
      remoteConsoleClient.connect(target.consoleTarget, { url: 'http://localhost:43105/' });
      target.consoleTarget.log('first');
      t.mock.timers.tick(5_000);
      await Promise.resolve();
      target.consoleTarget.log('second');
      t.mock.timers.tick(5_000);
      await Promise.resolve();
      // END_CONNECT_TRANSPORT_FAILURE_ARRANGE_RUNTIME

      // START_CONNECT_TRANSPORT_FAILURE_ACT
      await target.consoleTarget.__remote__?.disconnect();
      // END_CONNECT_TRANSPORT_FAILURE_ACT

      // START_CONNECT_TRANSPORT_FAILURE_ASSERT
      assert.deepStrictEqual(
        {
          localLogCalls: target.calls.log.length,
          localErrorCalls: target.calls.error.length,
        },
        {
          localLogCalls: 2,
          localErrorCalls: 1,
        }
      );
      // END_CONNECT_TRANSPORT_FAILURE_ASSERT
    });

    it('should trigger auto-disconnect on pagehide', async () => {
      // START_CONNECT_PAGEHIDE_ARRANGE_RUNTIME
      const target = createConsoleTarget();
      remoteConsoleClient.connect(target.consoleTarget, { url: 'http://localhost:43106/' });
      target.consoleTarget.info('buffered');
      // END_CONNECT_PAGEHIDE_ARRANGE_RUNTIME

      // START_CONNECT_PAGEHIDE_ACT
      emitLifecycleEvent(listeners, 'pagehide');
      await waitForLifecycleAsyncWork();
      // END_CONNECT_PAGEHIDE_ACT

      // START_CONNECT_PAGEHIDE_ASSERT
      assert.deepStrictEqual(extractEnvelopeTypes(fetchCalls), ['logs', 'disconnect']);
      // END_CONNECT_PAGEHIDE_ASSERT
    });

    it('should prefer sendBeacon before keepalive fetch on unload', async () => {
      // START_CONNECT_UNLOAD_POLICY_ARRANGE_RUNTIME
      sendBeaconMode = 'always-true';
      const target = createConsoleTarget();
      remoteConsoleClient.connect(target.consoleTarget, { url: 'http://localhost:43107/' });
      target.consoleTarget.log('payload');
      // END_CONNECT_UNLOAD_POLICY_ARRANGE_RUNTIME

      // START_CONNECT_UNLOAD_POLICY_ACT
      emitLifecycleEvent(listeners, 'pagehide');
      await waitForLifecycleAsyncWork();
      // END_CONNECT_UNLOAD_POLICY_ACT

      // START_CONNECT_UNLOAD_POLICY_ASSERT
      assert.deepStrictEqual(
        {
          beaconCalls: sendBeaconCalls.length,
          fetchCalls: fetchCalls.length,
        },
        {
          beaconCalls: 2,
          fetchCalls: 0,
        }
      );
      // END_CONNECT_UNLOAD_POLICY_ASSERT
    });

    it('should flush buffered logs before unload disconnect signal', async () => {
      // START_CONNECT_UNLOAD_ORDER_ARRANGE_RUNTIME
      sendBeaconMode = 'always-false';
      const target = createConsoleTarget();
      remoteConsoleClient.connect(target.consoleTarget, { url: 'http://localhost:43108/' });
      target.consoleTarget.log('payload');
      // END_CONNECT_UNLOAD_ORDER_ARRANGE_RUNTIME

      // START_CONNECT_UNLOAD_ORDER_ACT
      emitLifecycleEvent(listeners, 'pagehide');
      await waitForLifecycleAsyncWork();
      // END_CONNECT_UNLOAD_ORDER_ACT

      // START_CONNECT_UNLOAD_ORDER_ASSERT
      assert.deepStrictEqual(
        fetchCalls.map((call) => (extractEnvelope(call) as { type: string }).type),
        ['logs', 'disconnect']
      );
      // END_CONNECT_UNLOAD_ORDER_ASSERT
    });
  });

  describe('serializeRemoteConsoleArg()', () => {
    it('should never throw for non-JSON-safe values', () => {
      // START_SERIALIZER_SAFETY_ARRANGE_VALUES
      const cyclicValue: Record<string, unknown> = { name: 'cycle' };
      cyclicValue.self = cyclicValue;
      const values = [
        42,
        'text',
        true,
        undefined,
        null,
        BigInt(1),
        Symbol('token'),
        new Error('boom'),
        cyclicValue,
        { nodeType: 1, nodeName: 'DIV' },
      ];
      // END_SERIALIZER_SAFETY_ARRANGE_VALUES

      // START_SERIALIZER_SAFETY_ACT
      const serialized = values.map((value) => serializeRemoteConsoleArg(value));
      // END_SERIALIZER_SAFETY_ACT

      // START_SERIALIZER_SAFETY_ASSERT
      assert.deepStrictEqual(
        serialized.map((item) => ({ kind: item.kind, hasText: item.text.length > 0 })),
        [
          { kind: 'primitive', hasText: true },
          { kind: 'primitive', hasText: true },
          { kind: 'primitive', hasText: true },
          { kind: 'primitive', hasText: true },
          { kind: 'primitive', hasText: true },
          { kind: 'primitive', hasText: true },
          { kind: 'primitive', hasText: true },
          { kind: 'tagged', hasText: true },
          { kind: 'tagged', hasText: true },
          { kind: 'tagged', hasText: true },
        ]
      );
      // END_SERIALIZER_SAFETY_ASSERT
    });
  });
});

function createConsoleTarget(): {
  consoleTarget: {
    log: (...args: unknown[]) => void;
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
    debug: (...args: unknown[]) => void;
    __remote__?: { disconnect: () => Promise<void> };
  };
  calls: Record<'log' | 'info' | 'warn' | 'error' | 'debug', unknown[][]>;
} {
  const calls = {
    log: [] as unknown[][],
    info: [] as unknown[][],
    warn: [] as unknown[][],
    error: [] as unknown[][],
    debug: [] as unknown[][],
  };

  return {
    consoleTarget: {
      log: (...args: unknown[]) => calls.log.push(args),
      info: (...args: unknown[]) => calls.info.push(args),
      warn: (...args: unknown[]) => calls.warn.push(args),
      error: (...args: unknown[]) => calls.error.push(args),
      debug: (...args: unknown[]) => calls.debug.push(args),
    },
    calls,
  };
}

function extractEnvelopeTypes(calls: Array<{ init: RequestInit }>): string[] {
  return calls.map((call) => (extractEnvelope(call) as { type: string }).type);
}

function extractEnvelope(call: { init: RequestInit } | undefined): RemoteConsoleCommandEnvelope {
  const bodyText = call?.init.body as string | undefined;
  if (!bodyText) {
    throw new Error('missing request body in fetch call');
  }

  return JSON.parse(bodyText) as RemoteConsoleCommandEnvelope;
}

function emitLifecycleEvent(listeners: Map<string, Set<() => void>>, eventName: string): void {
  listeners.get(eventName)?.forEach((listener) => listener());
}

async function waitForLifecycleAsyncWork(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
