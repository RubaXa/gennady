// @file: Opt-in execution help and fail-closed writer recovery controls without sessions or models.
// @spec: AI-SKILLS
// @consumers: execution-autonomy pre-live qualification

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SddEvalObserver } from '../observer.ts';
import type { SddEvalEvidenceSource, SddEvalTailEntry } from '../types.ts';

const lifecycleModule = new URL('../sandbox-lifecycle.ts', import.meta.url).href;

for (const keep of [false, true]) {
  test(`unsafe writers retain pending ownership and exact dependency lease (keep=${keep})`, () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'gennady-writer-recovery-')));
    try {
      // A separate bounded process owns the intentionally retained, unref'ed lease heartbeat.
      // Its exit is test cleanup only, never the quiescence evidence under test.
      const script = `
        import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
        import {join} from 'node:path';
        import {hostname} from 'node:os';
        import {SddEvalSandboxLifecycle} from ${JSON.stringify(lifecycleModule)};
        const root=${JSON.stringify(root)};
        const owned=join(root,'sdd-flow-eval-unsafe');
        mkdirSync(join(owned,'specs'),{recursive:true});
        writeFileSync(join(owned,'specs/result.spec.md'),'# partial evidence\\n');
        const leaseDir=join(root,'store','fingerprint','leases');
        mkdirSync(leaseDir,{recursive:true});
        const makeLease=(name)=>{
          const file=join(leaseDir,name+'.json');
          const ownerToken='owned-'+name;
          const at=new Date().toISOString();
          writeFileSync(file,JSON.stringify({schema:1,leaseId:name,ownerToken,hostname:hostname(),pid:process.pid,createdAt:at,heartbeatAt:at})+'\\n');
          return {file,ownerToken};
        };
        const lease=makeLease('unsafe');
        let removeCalls=0;
        const lifecycle=new SddEvalSandboxLifecycle({sandboxRoot:root,artifactsRoot:join(root,'artifacts'),runId:'unsafe',keep:${keep},removeDirectory:async()=>{removeCalls++;throw new Error('unsafe removal attempted');}});
        lifecycle.registerOwnedDirectory('scenario',owned);
        lifecycle.registerDependencyLease(lease);
        lifecycle.retainForWriterRecovery('scenario','SDK descendant tool remains running');
        const first=await lifecycle.finalize('failure');
        const second=await lifecycle.finalize('failure');
        // Prove the same lease format/capability is actually releasable for a safe lifecycle.
        const safeOwned=join(root,'sdd-flow-eval-safe');
        mkdirSync(safeOwned);
        const safeLease=makeLease('safe');
        const safe=new SddEvalSandboxLifecycle({sandboxRoot:root,artifactsRoot:join(root,'artifacts'),runId:'safe',keep:false});
        safe.registerOwnedDirectory('safe',safeOwned);
        safe.registerDependencyLease(safeLease);
        const safeResult=await safe.finalize('success');
        console.log(JSON.stringify({first,second,owned:lifecycle.ownedDirectories,removeCalls,lease:lease.file,safeResult,safeLeaseExists:existsSync(safeLease.file)}));
      `;
      const child = spawnSync(
        process.execPath,
        ['--import', 'tsx', '--input-type=module', '-e', script],
        { encoding: 'utf8', timeout: 10_000, killSignal: 'SIGKILL', maxBuffer: 64_000 }
      );
      assert.equal(child.status, 0, `${child.stdout}\n${child.stderr}`);
      const result = JSON.parse(child.stdout);
      const owned = join(root, 'sdd-flow-eval-unsafe');
      assert.deepEqual(result.first.pending, [owned]);
      assert.deepEqual(result.second.pending, [owned], 'retry must not forget the unsafe owner');
      assert.deepEqual(result.owned, [owned]);
      assert.equal(result.first.removed, 0);
      assert.equal(
        result.first.retained,
        0,
        'unsafe recovery is not ordinary bounded debug retention'
      );
      assert.equal(result.second.runDirectory, result.first.runDirectory);
      assert.match(result.first.errors.join('\n'), /writer quiescence unproven/);
      assert.equal(result.removeCalls, 0, 'do not even enter the unsafe removal callback');
      assert.equal(existsSync(owned), true);
      assert.equal(existsSync(join(owned, '.sdd-eval-retained.json')), false);
      assert.equal(existsSync(result.lease), true, 'dependency lease remains pinned');
      assert.equal(JSON.parse(readFileSync(result.lease, 'utf8')).ownerToken, 'owned-unsafe');
      assert.equal(result.safeResult.removed, 1);
      assert.deepEqual(result.safeResult.pending, []);
      assert.deepEqual(result.safeResult.errors, []);
      assert.equal(result.safeLeaseExists, false, 'positive control really releases a valid lease');
      assert.equal(
        readFileSync(join(result.first.runDirectory, 'scenario/specs/result.spec.md'), 'utf8'),
        '# partial evidence\n',
        'partial evidence is compacted before recovery retention'
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

async function observeCommand(command: string, allowRequiredHelp?: boolean) {
  const tail: SddEvalTailEntry[] = [
    {
      messageId: 'message-help',
      role: 'assistant',
      text: '',
      fingerprint: 'help-control',
      toolCalls: [
        {
          callId: 'call-help',
          tool: 'bash',
          status: 'completed',
          inputSummary: JSON.stringify({ command }),
        },
      ],
    },
  ];
  const evidence: SddEvalEvidenceSource = {
    readTail: async () => tail,
    readEvents: async () => [],
    readStatus: async () => 'running',
    readDiff: async () => '',
  };
  return new SddEvalObserver(evidence, {
    everyMs: 0,
    stuckAfter: 3,
    tailLimit: 4,
    ...(allowRequiredHelp === undefined ? {} : { allowRequiredHelp }),
    clock: { now: () => 100, sleep: async () => {} },
  }).observe('session-help');
}

test('generic observer still rejects CLI help by default and with explicit opt-out', async () => {
  for (const option of [undefined, false]) {
    const observation = await observeCommand('npx --no-install gennady sdd-log --help', option);
    assert.equal(observation.stuck, true);
    assert.match(observation.errors.join('\n'), /forbidden CLI interface probe/);
  }
});

test('execution help opt-in permits the required help probe without changing progress accounting', async () => {
  const observation = await observeCommand('npx --no-install gennady sdd-log --help', true);
  assert.equal(observation.stuck, false);
  assert.deepEqual(observation.errors, []);
  assert.equal(observation.progress, true);
  assert.equal(observation.repeated, false);
  assert.equal(observation.repeatCount, 0);
  assert.equal(observation.artifactProgress, false);
  assert.equal(observation.toolCallCount, 1);
});

test('execution help opt-in does not permit version probing', async () => {
  for (const command of [
    'npx gennady --version',
    'npx --no-install gennady sdd-log --help --version',
  ]) {
    const observation = await observeCommand(command, true);
    assert.equal(observation.stuck, true);
    assert.match(observation.errors.join('\n'), /forbidden CLI interface probe/);
  }
});

test('execution help opt-in does not waive forbidden stderr redirection', async () => {
  const observation = await observeCommand(
    'npx --no-install gennady sdd-log --help 2>/dev/null',
    true
  );
  assert.equal(observation.stuck, true);
  assert.match(observation.errors.join('\n'), /forbidden CLI shell redirection/);
});
