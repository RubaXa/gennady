// @file: cassettes — sanitized, body-sensitive HTTP cassettes for real adapter contract tests.
// @consumers: agent-inbox port contract suites
// @tasks: TSK-166

import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { setupMockAgent, type MockHttpEnv, type MockReply } from '../../../utils/test/mock-http.ts';

/** @purpose Recorded HTTP response safe to persist in a cassette. */
export type CassetteResponse = MockReply;

/** @purpose One sanitized request/response recording. */
export type CassetteEntry = {
  /** @purpose Stable request identity: METHOD + URL + SHA-256 of raw request body. */
  matchKey: string;
  /** @purpose Original request URL used by MockAgent interception. */
  url: string;
  /** @purpose HTTP method used by MockAgent interception. */
  method: string;
  /** @purpose Sanitized response returned by the intercepted network call. */
  response: CassetteResponse;
  /** @purpose Recording timestamp. */
  ts: string;
};

/** @purpose Tokens that must never be written into a cassette. */
export type CassetteSecrets = Record<string, string>;

/**
 * @purpose Compute a deterministic identity for one intercepted request.
 * @param method HTTP verb emitted by the adapter.
 * @param url Complete intercepted request URL, including its query string.
 * @param [body] Raw request body included in the identity hash.
 * @returns Stable METHOD, URL, and body-digest key used for strict replay matching.
 */
export function createCassetteMatchKey(
  method: string,
  url: string,
  body: string | null = null
): string {
  const digest = createHash('sha256')
    .update(body ?? '')
    .digest('hex');
  return `${method.toUpperCase()} ${url} ${digest}`;
}

/**
 * @purpose Replace known secret tokens before a cassette value reaches disk.
 * @param value Serializable cassette value to sanitize recursively.
 * @param secrets Token-to-placeholder mappings that must not be persisted verbatim.
 * @returns Value with every known token replaced by its safe placeholder.
 */
export function sanitizeCassetteValue<T>(value: T, secrets: CassetteSecrets): T {
  if (typeof value === 'string') {
    let sanitized: string = value;
    for (const [token, placeholder] of Object.entries(secrets)) {
      sanitized = sanitized.split(token).join(placeholder);
    }
    return sanitized as T;
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeCassetteValue(item, secrets)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        sanitizeCassetteValue(item, secrets),
      ])
    ) as T;
  }
  return value;
}

/**
 * @purpose Append sanitized real-adapter traffic to the host-scoped JSONL cassette.
 * @param cassetteDir Root containing `<host>.jsonl` files.
 * @param entry Captured request/response values.
 * @param [secrets] Sensitive token to placeholder mappings.
 * @returns Persisted cassette entry.
 * @sideEffect Creates and appends to a cassette JSONL file.
 */
export function recordCassette(
  cassetteDir: string,
  entry: Omit<CassetteEntry, 'matchKey' | 'ts'> & { body?: string | null; ts?: string },
  secrets: CassetteSecrets = {}
): CassetteEntry {
  const host = new URL(entry.url).host;
  const path = join(cassetteDir, `${host}.jsonl`);
  const persisted: CassetteEntry = sanitizeCassetteValue(
    {
      ...entry,
      matchKey: createCassetteMatchKey(entry.method, entry.url, entry.body),
      ts: entry.ts ?? new Date().toISOString(),
    },
    secrets
  );
  mkdirSync(cassetteDir, { recursive: true });
  appendFileSync(path, JSON.stringify(persisted) + '\n');
  return persisted;
}

/**
 * @purpose Read all complete recordings from a host-scoped cassette.
 * @param cassetteDir Root containing `<host>.jsonl` cassette files.
 * @param host Host whose recording file must be replayed.
 * @returns Complete cassette entries, or an empty collection when no recording exists.
 * @sideEffect Reads the host cassette file when it exists.
 */
export function readCassette(cassetteDir: string, host: string): CassetteEntry[] {
  const path = join(cassetteDir, `${host}.jsonl`);
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as CassetteEntry);
}

/**
 * @purpose Install a strict MockAgent replay for every entry in a cassette.
 * @invariant A replay rejects a request whose body-derived matchKey differs from the recording.
 * @param entries Recorded, sanitized entries.
 * @returns Mock environment; caller must invoke cleanup.
 */
export function replayCassette(entries: CassetteEntry[]): MockHttpEnv {
  const env = setupMockAgent();
  for (const entry of entries) {
    env.interceptOnce(entry.method, entry.url, (request) => {
      const actualUrl = new URL(request.path, new URL(entry.url).origin).href;
      const actual = createCassetteMatchKey(request.method, actualUrl, request.body);
      if (actual !== entry.matchKey) {
        throw new Error(
          `[replayCassette] Request does not match cassette: ${request.method} ${actualUrl}`
        );
      }
      return entry.response;
    });
  }
  return env;
}
