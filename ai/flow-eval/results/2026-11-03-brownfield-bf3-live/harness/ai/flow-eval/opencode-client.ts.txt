// @file: Shared OpenCode SDK client construction for authenticated local servers.
// @spec: AI-SKILLS
// @consumers: eval runtime and bounded evidence reader

import { createOpencodeClient, type OpencodeClient } from '@opencode-ai/sdk';

/** @purpose Keep default eval connections away from the operator's personal Desktop server. */
export const DEFAULT_SDD_EVAL_BASE_URL = 'http://127.0.0.1:4097';

/** @purpose Connect to a local OpenCode server without putting its password in command arguments. */
export function createSddEvalOpenCodeClient(options: {
  baseUrl: string;
  directory?: string;
}): OpencodeClient {
  const password = process.env.OPENCODE_SERVER_PASSWORD;
  const username = process.env.OPENCODE_SERVER_USERNAME || 'opencode';
  const headers = password
    ? { Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}` }
    : undefined;
  return createOpencodeClient({ ...options, headers });
}
