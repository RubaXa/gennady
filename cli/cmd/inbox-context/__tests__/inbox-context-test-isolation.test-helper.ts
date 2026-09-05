// @file: Hermetic child-process boundary for inbox-context CLI tests.
// @consumers: inbox-context command tests

const SAFE_CHILD_ENV_KEYS = [
  'PATH',
  'TMPDIR',
  'TMP',
  'TEMP',
  'SYSTEMROOT',
  'COMSPEC',
  'PATHEXT',
  'LANG',
  'LC_ALL',
] as const;

export const SENSITIVE_ENV_PROOF_KEYS = [
  'GITLAB_PERSONAL_TOKEN',
  'GITLAB_TOKEN',
  'GITLAB_OAUTH_TOKEN',
  'GLAB_TOKEN',
  'GITHUB_PERSONAL_TOKEN',
  'GITHUB_TOKEN',
  'GITHUB_APP_PRIVATE_KEY',
  'GH_TOKEN',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GOOGLE_API_KEY',
  'GEMINI_API_KEY',
  'OPENROUTER_API_KEY',
  'MISTRAL_API_KEY',
  'COHERE_API_KEY',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'AZURE_OPENAI_API_KEY',
  'OPENCODE_SERVER_USERNAME',
  'OPENCODE_SERVER_PASSWORD',
  'NPM_TOKEN',
] as const;

export const UNEXPECTED_NETWORK_MARKER = 'ERR_TEST_UNEXPECTED_NETWORK';

const networkGuardSource = `
import http from 'node:http';
import https from 'node:https';
const marker = ${JSON.stringify(UNEXPECTED_NETWORK_MARKER)};
const reject = (target) => {
  process.stderr.write(marker + ' ' + String(target) + '\\n');
  throw new Error(marker);
};
globalThis.fetch = async (input) => reject(input);
http.request = (...args) => reject(args[0]);
http.get = (...args) => reject(args[0]);
https.request = (...args) => reject(args[0]);
https.get = (...args) => reject(args[0]);
`;

export const NETWORK_GUARD_IMPORT = `data:text/javascript,${encodeURIComponent(networkGuardSource)}`;

/** Builds a child environment from a fixed OS-runtime allowlist, never from inherited credentials. */
export function createIsolatedChildEnv(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: 'test',
    GENNADY_NO_UPDATE_CHECK: '1',
  };

  for (const key of SAFE_CHILD_ENV_KEYS) {
    if (source[key] !== undefined) env[key] = source[key];
  }

  return env;
}
