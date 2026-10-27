// @file: Execute the documented orphan-decision repro against its frozen source, not candidate code.
// @spec: AI-SKILLS
// @consumers: execution-autonomy baseline qualification

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { it } from 'node:test';
import { cleanTestChildEnv } from '../../../cli/__tests__/tool-behavior/run-cli.ts';

const ROOT = resolve(import.meta.dirname, '../../..');
const SOURCE = '7958ecb0a3cabcfd2ba923d272a65e00a981a0c6';

function withFrozenSource(source: string, run: (root: string) => void): void {
  const temporary = mkdtempSync(join(tmpdir(), 'gennady-autonomy-baseline-'));
  try {
    const archive = execFileSync(
      'git',
      [
        '-C',
        ROOT,
        'archive',
        source,
        'package.json',
        'tsconfig.json',
        'cli',
        'shared',
        'services',
        'plugins',
      ],
      {
        env: cleanTestChildEnv(process.env),
        maxBuffer: 64 * 1024 * 1024,
        timeout: 30_000,
      }
    );
    execFileSync('tar', ['-xf', '-', '-C', temporary], {
      input: archive,
      timeout: 30_000,
      env: { ...cleanTestChildEnv(process.env), LC_ALL: 'C', LANG: 'C' },
    });
    symlinkSync(realpathSync(join(ROOT, 'node_modules')), join(temporary, 'node_modules'), 'dir');
    run(temporary);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

it('reproduces the documented orphan failure on frozen source with shared dependencies and cleanup', () => {
  withFrozenSource(SOURCE, (temporary) => {
    const baseline = readFileSync(
      join(ROOT, 'ai/flow-eval/results/2026-10-26-execution-autonomy/BASELINE.md'),
      'utf8'
    );
    const snippet = /```js\n([\s\S]*?)\n```/.exec(baseline.split('## 2.')[0] ?? '')?.[1];
    assert.ok(snippet, 'the original documented repro must remain present');
    const outcome = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-'], {
      cwd: temporary,
      input: snippet,
      encoding: 'utf8',
      env: cleanTestChildEnv(process.env),
      timeout: 30_000,
    });
    assert.equal(outcome.error, undefined);
    assert.equal(outcome.status, 0, outcome.stdout + outcome.stderr);
    const result = JSON.parse(outcome.stdout);
    assert.equal(result.case, 'handoff-orphan');
    assert.equal(result.completeAccepted, true);
    assert.equal(result.records, 0);
    assert.equal(result.verdict.ok, false);
    assert.equal(result.controlRecords, 1);
    assert.equal(result.controlVerdictAccepted, true);
  });
});

it('reproduces the pre-lease stale-context execution on frozen EA2a, not on the fixed candidate', () => {
  withFrozenSource('e9021500caa8ddade3b357dcbb73bdb5cd703e5e', (temporary) => {
    const snippet = [
      'import fs from "node:fs";',
      'import path from "node:path";',
      'import {execFileSync} from "node:child_process";',
      'import {runWithSddAttemptJournal} from "./shared/sdd/verify/sdd-attempt-journal.ts";',
      'const root = path.join(process.cwd(), ".case"); fs.mkdirSync(root);',
      'const git = (...args) => execFileSync("git", ["-C", root, "-c", "user.name=fixture", "-c", "user.email=fixture@test", ...args], {stdio:"pipe"});',
      'const ticket = path.join(root,"ticket.md");',
      'const original = ["<!--SECTION:PHASES_OVERVIEW-->","| ID | Kind | Deps | Status |","|---|---|---|---|","| P1 | code | — | [ ] |","<!--/SECTION:PHASES_OVERVIEW-->","<!--SECTION:PHASE_P1-->","- **Target Files:**","  - source.ts","<!--/SECTION:PHASE_P1-->","<!--SECTION:EXECUTION_LOG-->","<!--/SECTION:EXECUTION_LOG-->",""].join("\\n");',
      'fs.writeFileSync(ticket, original); fs.writeFileSync(path.join(root,"source.ts"), "export const x=1;\\n"); git("init","-q"); git("add","."); git("commit","-qm","fixture");',
      'fs.writeFileSync(ticket, original.replace("  - source.ts", "  - changed.ts"));',
      'let calls = 0; await runWithSddAttemptJournal({root,ticketPath:ticket,sddPhase:"P1",expectedTicketContent:original,run:async()=>{calls++;return {exitCode:1,stdout:"",stderr:"controlled failed execution"};}});',
      'console.log(JSON.stringify({calls, obsoleteAttemptPersisted:fs.readFileSync(ticket,"utf8").includes("SDD_VERIFY_EVIDENCE:")}));',
    ].join('\n');
    const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-'], {
      cwd: temporary,
      input: snippet,
      encoding: 'utf8',
      env: cleanTestChildEnv(process.env),
      timeout: 30_000,
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { calls: 1, obsoleteAttemptPersisted: true });
  });
});
