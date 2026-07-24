// @file: mock-http — network-level HTTP interception harness for node:test black-box e2e.
// @purpose Swap the backend at the undici/fetch layer so production adapters run unchanged
//          while fixtures answer their HTTP calls. Implements testing AX_HTTP_MOCK_AGENT_PATTERN.
// @consumers black-box e2e suites that drive real adapters (VcsInboxReal, OpenCodeReal) without
//            reaching the network — the SUT keeps calling real URLs; only the transport is faked.

import { MockAgent, setGlobalDispatcher, getGlobalDispatcher, type Dispatcher } from 'undici';

/** A single mocked response. `body` as object is JSON-encoded; as string is sent verbatim. */
export interface MockReply {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
}

/** The intercepted request, handed to a reply function for param-aware ("intelligent") answers. */
export interface InterceptedRequest {
  method: string;
  /** Full path including query string, e.g. `/api/v4/mrs?state=opened`. */
  path: string;
  /** Parsed query params of `path` for convenient dispatch. */
  query: URLSearchParams;
  headers: Record<string, string | string[] | undefined>;
  /** Raw request body as a string (JSON not parsed) or null when absent. */
  body: string | null;
}

/**
 * A reply that inspects the request — the seam for an intelligent mock backend.
 * Synchronous by undici's contract; load any fixture data before registering the intercept.
 */
export type ReplyFn = (req: InterceptedRequest) => MockReply;

/** Reports how many times the registered endpoint was actually hit. */
export interface AttemptTracker {
  getAttemptCount(): number;
}

export interface MockHttpEnv {
  /** Intercept one matching call; `reply` may be static or a request-inspecting function. */
  interceptOnce(method: string, url: string, reply: MockReply | ReplyFn): AttemptTracker;
  /** Intercept N sequential calls to the same endpoint, one reply per attempt in order. */
  interceptMultiple(
    method: string,
    url: string,
    replies: Array<MockReply | ReplyFn>
  ): AttemptTracker;
  /** Restore the previous global dispatcher. Call in `afterEach`. */
  cleanup(): void;
  /** The underlying MockAgent, for advanced assertions (e.g. assertNoPendingInterceptors). */
  agent: MockAgent;
}

interface SetupOptions {
  /**
   * Net-connect policy for un-intercepted requests.
   * `false` (default) — throw on any real network call (strict black-box).
   * `true` — allow all real connections. A string/RegExp — allow only matching hosts.
   */
  allowNetConnect?: boolean | string | RegExp;
}

function encodeReply(r: MockReply): {
  statusCode: number;
  data: string;
  responseOptions: { headers: Record<string, string> };
} {
  const isJson = r.body !== undefined && typeof r.body !== 'string';
  const data = r.body === undefined ? '' : isJson ? JSON.stringify(r.body) : (r.body as string);
  return {
    statusCode: r.status,
    data,
    responseOptions: {
      headers: {
        'content-type': isJson ? 'application/json' : 'text/plain',
        ...(r.headers ?? {}),
      },
    },
  };
}

/**
 * Install a MockAgent as the global dispatcher so `fetch()` (and any undici-based client,
 * including the OpenCode SDK default fetch and the GitLab client) is intercepted transparently.
 */
export function setupMockAgent(opts: SetupOptions = {}): MockHttpEnv {
  const previous: Dispatcher = getGlobalDispatcher();
  const agent = new MockAgent();

  if (opts.allowNetConnect === undefined || opts.allowNetConnect === false) {
    agent.disableNetConnect();
  } else if (opts.allowNetConnect !== true) {
    agent.enableNetConnect(opts.allowNetConnect as string);
  }

  setGlobalDispatcher(agent);

  // Route by pathname; branch on params/body inside the reply — the intelligent-backend seam.
  const register = (
    method: string,
    url: string,
    reply: MockReply | ReplyFn,
    counter: { n: number }
  ): void => {
    const target = new URL(url);
    const upper = method.toUpperCase();
    agent
      .get(target.origin)
      .intercept({
        path: (p: string) => new URL(p, target.origin).pathname === target.pathname,
        method: upper,
      })
      .reply((o) => {
        counter.n += 1;
        const rawPath = typeof o.path === 'string' ? o.path : target.pathname;
        const req: InterceptedRequest = {
          method: upper,
          path: rawPath,
          query: new URL(rawPath, target.origin).searchParams,
          headers: (o.headers ?? {}) as Record<string, string | string[] | undefined>,
          body: typeof o.body === 'string' ? o.body : null,
        };
        const resolved = typeof reply === 'function' ? reply(req) : reply;
        return encodeReply(resolved);
      })
      .times(1);
  };

  return {
    interceptOnce(method, url, reply) {
      const counter = { n: 0 };
      register(method, url, reply, counter);
      return { getAttemptCount: () => counter.n };
    },
    interceptMultiple(method, url, replies) {
      const counter = { n: 0 };
      for (const reply of replies) register(method, url, reply, counter);
      return { getAttemptCount: () => counter.n };
    },
    cleanup() {
      setGlobalDispatcher(previous);
      void agent.close();
    },
    agent,
  };
}
