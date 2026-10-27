// @file: Real CLI route checkpoint accepts ordinary build tasks and rejects broken aliases.
// @spec: AI-SKILLS
// @consumers: brownfield route-smoke scenario

import assert from 'node:assert/strict';
import { it } from 'node:test';
import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { BROWNFIELD_ROUTING_FILES } from '../fixtures/brownfield-routing.ts';

it('source-owned checkpoint is green only with real commands, exact links and unchanged build files', () => {
  const root = mkdtempSync(join(tmpdir(), 'sdd-brownfield-route-'));
  const source = fileURLToPath(new URL('../../../', import.meta.url));
  const scenario = JSON.parse(
    readFileSync(new URL('../scenarios-v2-brownfield-routing.json', import.meta.url), 'utf8')
  )[0];
  const run = () =>
    spawnSync('bash', ['-c', scenario.checkpoints[0].cmd], {
      cwd: root,
      encoding: 'utf8',
      timeout: 25000,
      env: { ...process.env, GENNADY_NO_UPDATE_CHECK: '1' },
    });
  try {
    for (const [file, content] of Object.entries(BROWNFIELD_ROUTING_FILES)) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), content);
    }
    cpSync(join(source, 'ai/directives'), join(root, 'ai/directives'), { recursive: true });
    const bin = join(root, 'node_modules/.bin/gennady');
    mkdirSync(dirname(bin), { recursive: true });
    writeFileSync(
      bin,
      '#!/usr/bin/env node\nconst{spawnSync}=require("node:child_process");const r=spawnSync(' +
        JSON.stringify(process.execPath) +
        ',' +
        JSON.stringify(['--import', import.meta.resolve('tsx'), join(source, 'cli/gennady.ts')]) +
        '.concat(process.argv.slice(2)),{stdio:"inherit",env:process.env});process.exit(r.status??1);\n'
    );
    chmodSync(bin, 0o755);
    assert.notEqual(run().status, 0, 'aliases must actually be created');
    symlinkSync('AGENTS.md', join(root, 'CLAUDE.md'));
    symlinkSync('docs', join(root, 'README.md'));
    const green = run();
    assert.equal(green.status, 0, green.stdout + green.stderr);
    const manifest = join(root, '.claude/skills/.gennady-synced');
    mkdirSync(dirname(manifest), { recursive: true });
    writeFileSync(manifest, 'sdd\n');
    assert.notEqual(run().status, 0, 'actual skills manifest writes must be detected');
    rmSync(manifest);
    symlinkSync('absent-target', join(root, 'broken.md'));
    assert.notEqual(run().status, 0, 'unsafe corpus still fails closed');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
