// @file: UV-25 production-backed read-only GitHub exact-SHA watcher smoke over one immutable run.
// @spec: AI-SKILLS
// @consumers: release-evidence-contract uv25-remote-live scenario; release operator

import assert from 'node:assert/strict';
import { basename } from 'node:path';
import { VcsGithubClient } from '../../../services/vcs-client/github/vcs-github-client.ts';
import { watchRemotePipeline } from '../../../shared/verify/execution/remote-watcher.ts';

const PROJECT = 'sindresorhus/p-map';
const SOURCE_SHA = '2c0934b8312b637f933b752c6054845c2d2d5533';
const DEFINITION_ID = '4634269';
const PIPELINE_ID = '36383812626';
const JOBS = 5;

async function main(): Promise<void> {
  const token = process.env.GITHUB_TOKEN ?? process.env.GITHUB_PERSONAL_TOKEN;
  if (!token) {
    throw new Error(
      'UV-25 remote live smoke requires GITHUB_TOKEN or GITHUB_PERSONAL_TOKEN with read-only Actions access'
    );
  }
  const client = new VcsGithubClient({ baseUrl: 'https://api.github.com', token });
  assert.ok(client.Pipeline, 'GitHub client must expose the production read-only pipeline port');
  const result = await watchRemotePipeline({
    observer: { provider: 'github', project: PROJECT, pipeline: client.Pipeline },
    sourceSha: SOURCE_SHA,
    timeoutMs: 60_000,
    pollIntervalMs: 1_000,
  });
  assert.equal(
    result.state,
    'REMOTE_SUCCESS',
    `unexpected terminal state ${result.state}: ${result.message}`
  );
  assert.equal(result.pipelineId, PIPELINE_ID);
  assert.ok(result.proof, 'terminal provider result must carry immutable proof');
  const proof = result.proof;
  assert.equal(proof.provider, 'github');
  assert.equal(proof.project, PROJECT);
  assert.equal(proof.sourceSha, SOURCE_SHA);
  assert.equal(proof.pipelineSha, SOURCE_SHA);
  assert.equal(proof.definitionId, DEFINITION_ID);
  assert.equal(proof.pipelineId, PIPELINE_ID);
  assert.equal(proof.terminalState, 'REMOTE_SUCCESS');
  assert.equal(proof.jobs.length, JOBS);
  const successfulJobs = proof.jobs.filter(({ rawStatus }) => rawStatus === 'success');
  assert.equal(successfulJobs.length, JOBS);
  assert.ok(proof.jobs.every(({ logIdentity }) => logIdentity === undefined));

  console.log(`UV25_REMOTE_LIVE provider=github project=${PROJECT} readOnly=true`);
  console.log(`UV25_REMOTE_LIVE exactSha=${SOURCE_SHA}`);
  console.log(
    `UV25_REMOTE_LIVE definitionId=${DEFINITION_ID} pipelineId=${PIPELINE_ID} ` +
      `state=${result.state} jobs=${proof.jobs.length} successfulJobs=${successfulJobs.length}`
  );
  console.log('UV25_REMOTE_LIVE mutations=0 secretOutput=0 logBodies=0');
}

if (process.argv[1] && basename(process.argv[1]) === basename(import.meta.filename)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
