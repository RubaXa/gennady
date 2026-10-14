// @file: Live-CLI behavior of universal Verify's temporary `stack:` config adapter (V-07) — a real
//   `tsx cli/gennady.ts verify` plan against fixture repos whose gennady.yaml is valid or
//   deliberately malformed, proving deep-merge, provenance-carrying validation, and exit 4 end to
//   end (not just at the loadStackConfig unit level already covered by
//   shared/verify/__tests__/stack-config.test.ts).
// @spec: CLI
// @consumers: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRepoFixture } from './fixture.ts';
import { runCliAsync } from './run-cli.ts';

function commitFixture(root: string): void {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key];
  execFileSync('git', ['add', '-A'], { cwd: root, env });
  execFileSync('git', ['commit', '-qm', 'fixture state'], { cwd: root, env });
}

describe('verify — stack config adapter (V-07)', { concurrency: 4 }, () => {
  it('fails closed on legacy extraGates instead of silently running the removed ladder', async () => {
    const { root } = buildRepoFixture({ scripts: {} });
    try {
      writeFileSync(
        join(root, 'gennady.yaml'),
        [
          'stack:',
          '  use: [anystack]',
          '  anystack:',
          '    extraGates:',
          '      - id: syntax',
          "        argv: [sh, -c, 'true']",
          '      - id: style',
          "        argv: [sh, -c, 'true']",
          '        envFail:',
          "          - exitCodeMatches: '>0'",
          '            stderrMatches: nope-this-never-matches',
          "            hint: 'fix the exotic toolchain'",
          '      - id: build',
          "        argv: [sh, -c, 'true']",
          '        requires:',
          "          - argv: [sh, -c, 'true']",
          "            hint: 'install the exotic compiler'",
          '        fixer:',
          "          argv: [sh, -c, 'true']",
          '',
        ].join('\n'),
        'utf-8'
      );
      commitFixture(root);
      const result = await runCliAsync(['verify', '--phase', 'full', '--plan', '--json'], root);
      assert.strictEqual(result.exitCode, 4, result.stdout + result.stderr);
      assert.match(result.stderr, /VERIFY_CONFIG_LEGACY_UNSUPPORTED/);
      assert.match(result.stderr, /migrate each gate explicitly to verify\.presets/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('an unknown stack config key fails closed with exit 4, never a partial run', async () => {
    const { root } = buildRepoFixture({ scripts: {} });
    try {
      writeFileSync(
        root + '/gennady.yaml',
        [
          'stack:',
          '  anystack:',
          '    extraGates:',
          '      - id: build',
          '        argv: [tool]',
          '        typo: oops',
          '',
        ].join('\n'),
        'utf-8'
      );
      const result = await runCliAsync(['verify', '--phase', 'full', '--plan', '--json'], root);
      assert.strictEqual(result.exitCode, 4, result.stdout + result.stderr);
      assert.match(result.stderr, /anystack\.extraGates\[0\]\.typo/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('stack.use naming an unknown plugin id fails closed with exit 4', async () => {
    const { root } = buildRepoFixture({ scripts: {} });
    try {
      writeFileSync(join(root, 'gennady.yaml'), 'stack:\n  use: [not-a-real-stack]\n', 'utf-8');
      const result = await runCliAsync(['verify', '--phase', 'full', '--plan', '--json'], root);
      assert.strictEqual(result.exitCode, 4, result.stdout + result.stderr);
      assert.match(result.stderr, /stack\.use\.not-a-real-stack/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('no gennady.yaml at all is not an error — the config gate stays silent', async () => {
    const { root } = buildRepoFixture({ scripts: {} });
    try {
      const result = await runCliAsync(['verify', '--phase', 'full', '--plan', '--json'], root);
      assert.doesNotMatch(
        result.stdout + result.stderr,
        /ERR_CLI_SDD_VERIFY_STACK_CONFIG/,
        result.stdout + result.stderr
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
