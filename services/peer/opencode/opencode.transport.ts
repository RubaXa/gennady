// @file: OpenCode peer transport — sessions from opencode.db; send via the live desktop HTTP API.
// @consumers: peer-transport-registry
// @tasks: N/A

import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { listOpenCodeSessions, readOpenCodeTexts, type OpenCodeSession } from './opencode-store.ts';
import { bestFuzzyMatch } from '../peer-match.ts';
import type { PeerSelf, PeerTarget, PeerTransport, ReplyContract } from '../peer-port.ts';
import type { PeerMessage } from '../peer-message.ts';

const stripAnsi = (text: string): string => text.replace(/\u001b\[[0-9;]*m/g, '');

/**
 * @purpose Convert an OpenCode session row into a normalized peer target.
 * @param session Session row.
 * @returns Peer target.
 */
const toTarget = (session: OpenCodeSession): PeerTarget => ({
  runtime: 'opencode',
  id: session.id,
  name: session.title,
  address: `opencode:${session.id}`,
  cwd: session.directory,
  raw: session,
});

/**
 * @purpose Base URL of the running OpenCode HTTP server.
 */
export const opencodeServerUrl = (): string | undefined => {
  if (process.env.GENNADY_OPENCODE_URL) return process.env.GENNADY_OPENCODE_URL;
  try {
    const out = execFileSync('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN'], { encoding: 'utf8' });
    for (const line of out.split('\n')) {
      if (!/OpenCode/i.test(line)) continue;
      const match = line.match(/127\.0\.0\.1:(\d+)\s+\(LISTEN\)/);
      if (match) return `http://127.0.0.1:${match[1]}`;
    }
  } catch {
    /* ignore */
  }
  return undefined;
};

/**
 * @purpose Build the Basic auth header from the environment, if available.
 * @returns Authorization header value or undefined.
 */
const opencodeAuth = (): string | undefined => {
  const password = process.env.OPENCODE_SERVER_PASSWORD;
  if (!password) return undefined;
  const user = process.env.OPENCODE_SERVER_USERNAME ?? 'opencode';
  return `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
};

/**
 * @purpose Send a message to a session through the live OpenCode HTTP API.
 */
export const opencodeHttpCall = async (
  sessionId: string,
  text: string,
  model?: string
): Promise<string> => {
  const base = opencodeServerUrl();
  const auth = opencodeAuth();
  if (!base || !auth) throw new Error('OpenCode server URL or credentials unavailable');
  const slash = model?.indexOf('/') ?? -1;
  const modelRef =
    model && slash > 0
      ? { providerID: model.slice(0, slash), modelID: model.slice(slash + 1) }
      : undefined;
  const response = await fetch(`${base}/session/${sessionId}/message`, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      parts: [{ type: 'text', text }],
      ...(modelRef ? { model: modelRef } : {}),
    }),
  });
  if (!response.ok) throw new Error(`OpenCode API returned ${response.status}`);
  const data = (await response.json()) as { parts?: { type?: string; text?: string }[] };
  return (data.parts ?? [])
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('\n')
    .trim();
};

/**
 * @purpose Fallback: run a message through the local opencode CLI.
 */
export const runOpenCodeSession = (
  sessionId: string,
  message: string,
  cwd?: string,
  model?: string
): Promise<string> =>
  new Promise((resolve, reject) => {
    const timeoutMs = Number(process.env.GENNADY_OPENCODE_TIMEOUT_MS ?? 300_000);
    const args = ['run', message, '--session', sessionId, ...(model ? ['-m', model] : [])];
    const child = spawn('opencode', args, {
      cwd: cwd && existsSync(cwd) ? cwd : undefined,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`opencode run timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    timer.unref();
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      const reply = stripAnsi(stdout).trim();
      if (code === 0 && reply) resolve(reply);
      else
        reject(new Error(`opencode run exited ${code}: ${stripAnsi(stderr).trim().slice(0, 300)}`));
    });
  });

/**
 * @purpose OpenCode implementation of {@link PeerTransport}.
 * @consumer peer-transport-registry
 */
export class OpenCodeTransport implements PeerTransport {
  /** @purpose Runtime discriminator. */
  readonly runtime = 'opencode' as const;

  /**
   * @purpose List recent OpenCode sessions.
   * @returns Addressable peer targets.
   */
  async discover(): Promise<PeerTarget[]> {
    return listOpenCodeSessions().map(toTarget);
  }

  /**
   * @purpose Resolve a session by title or id (exact, prefix, then fuzzy).
   * @param query Title or id.
   * @returns The peer target, or undefined.
   */
  async resolve(query: string): Promise<PeerTarget | undefined> {
    const q = query.trim().toLowerCase();
    const sessions = listOpenCodeSessions();
    const exact = sessions.find(
      (s) => s.title.toLowerCase() === q || s.id === query || s.id === `opencode:${query}`
    );
    if (exact) return toTarget(exact);
    const prefix = sessions.find(
      (s) => s.title.toLowerCase().startsWith(q) || s.id.startsWith(query)
    );
    if (prefix) return toTarget(prefix);
    const fuzzy = bestFuzzyMatch(
      sessions.map((s) => ({ id: s.id, title: s.title, session: s })),
      query
    );
    return fuzzy ? toTarget(fuzzy.session) : undefined;
  }

  /**
   * @purpose Send the message through the live HTTP API (fallback: local CLI).
   * @param target Destination session.
   * @param message Task message.
   * @returns Assistant reply text.
   */
  async call(target: PeerTarget, message: PeerMessage): Promise<string> {
    if (opencodeServerUrl() && opencodeAuth()) {
      return opencodeHttpCall(target.id, message.body, message.model);
    }
    const session = target.raw as OpenCodeSession;
    return runOpenCodeSession(
      target.id,
      message.body,
      session?.directory ?? target.cwd,
      message.model
    );
  }

  /**
   * @purpose OpenCode uses a synchronous API call, not a tool-based reply channel.
   * @param self Our identity.
   * @returns A placeholder reply contract.
   */
  replyContract(self: PeerSelf): ReplyContract {
    return {
      tool: '(sync http)',
      address: self.address,
      format: 'peer-xml',
      instructions: 'Replies are returned synchronously on the HTTP/CLI stdout of the call.',
    };
  }

  /**
   * @purpose Read a digest of the session's recent assistant activity.
   * @param target Session to inspect.
   * @returns Recent assistant text, or null when none.
   */
  async readActivity(target: PeerTarget): Promise<string | null> {
    const texts = readOpenCodeTexts(target.id, 5);
    return texts.length > 0 ? texts.join('\n\n---\n\n') : null;
  }
}
