// @file: port-contract tests — cassette replay and fake/real drift diagnostics.
// @consumers: node:test runner
// @tasks: TSK-166

import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeTestTmpDir, cleanupTestTmp } from '../../modules/inbox-core/test-support/test-tmp.ts';
import { readCassette, recordCassette, replayCassette } from '../cassettes.ts';
import { assertPortContract } from '../port-contract.suite.ts';
import { setupMockAgent } from '#utils/test/mock-http.ts';
import { VcsInboxReal } from '../../modules/inbox-core/vcs-inbox.real.ts';
import type { VcsActionableMr } from '../../../vcs-client/entities/vcs-actionable-mr.type.ts';

const directories: string[] = [];
const HOST = 'gitlab.example.test';
const GRAPHQL_URL = 'https://' + HOST + '/api/graphql';
afterEach(() => {
  for (const directory of directories.splice(0)) cleanupTestTmp(directory);
});

function realisticGitlabResponse(): { data: unknown } {
  return {
    data: {
      currentUser: {
        todos: { nodes: [] },
        reviewRequestedMergeRequests: {
          nodes: [
            {
              iid: '42',
              title: 'Sanitized real GitLab MR',
              webUrl: 'https://' + HOST + '/group/project/-/merge_requests/42',
              updatedAt: '2026-08-07T00:00:00.000Z',
              draft: false,
              state: 'opened',
              description: 'Recorded response shape',
              author: { username: 'author' },
              reviewers: { nodes: [{ username: 'reviewer' }] },
              approvedBy: { nodes: [] },
              project: { fullPath: 'group/project' },
            },
          ],
        },
        authoredMergeRequests: { nodes: [] },
      },
    },
  };
}

describe('TSK-166 port infrastructure', () => {
  it('cassette replays real response shape through real adapter', async () => {
    const cassetteDir = makeTestTmpDir('tsk-166-cassette-');
    directories.push(cassetteDir);
    const recording = setupMockAgent();
    try {
      recording.interceptOnce('POST', GRAPHQL_URL, (request) => {
        recordCassette(
          cassetteDir,
          {
            method: request.method,
            url: GRAPHQL_URL,
            body: request.body,
            response: { status: 200, body: realisticGitlabResponse() },
          },
          { 'secret-token': '<GITLAB_TOKEN>' }
        );
        return { status: 200, body: realisticGitlabResponse() };
      });
      const recordedResult = await new VcsInboxReal({
        host: HOST,
        token: 'secret-token',
      }).getActionable();
      assert.strictEqual(recordedResult[0].title, 'Sanitized real GitLab MR');
    } finally {
      recording.cleanup();
    }

    const entries = readCassette(cassetteDir, HOST);
    assert.strictEqual(entries.length, 1);
    const replay = replayCassette(entries);
    try {
      const result = await new VcsInboxReal({ host: HOST, token: 'secret-token' }).getActionable();
      assert.strictEqual(result[0].role, 'reviewer');
    } finally {
      replay.cleanup();
    }
  });

  it('contract suite compares fake with cassette-backed real adapter and names fake drift fields', async () => {
    const cassetteDir = makeTestTmpDir('tsk-166-contract-');
    directories.push(cassetteDir);
    const recording = setupMockAgent();
    let expected: VcsActionableMr[];
    try {
      recording.interceptOnce('POST', GRAPHQL_URL, (request) => {
        recordCassette(cassetteDir, {
          method: request.method,
          url: GRAPHQL_URL,
          body: request.body,
          response: { status: 200, body: realisticGitlabResponse() },
        });
        return { status: 200, body: realisticGitlabResponse() };
      });
      expected = await new VcsInboxReal({ host: HOST, token: 'test-token' }).getActionable();
    } finally {
      recording.cleanup();
    }

    const fixtureReplay = replayCassette(readCassette(cassetteDir, HOST));
    try {
      expected = await new VcsInboxReal({ host: HOST, token: 'test-token' }).getActionable();
    } finally {
      fixtureReplay.cleanup();
    }

    const contractReplay = replayCassette(readCassette(cassetteDir, HOST));
    try {
      const equivalent = await assertPortContract({
        name: 'VcsInboxPort#getActionable',
        createFake: () => ({ getActionable: async () => expected }),
        createReal: () => new VcsInboxReal({ host: HOST, token: 'test-token' }),
        exercise: (port) => port.getActionable(),
      });
      assert.deepStrictEqual(equivalent, expected);
    } finally {
      contractReplay.cleanup();
    }

    const driftReplay = replayCassette(readCassette(cassetteDir, HOST));
    try {
      await assert.rejects(
        () =>
          assertPortContract({
            name: 'VcsInboxPort#getActionable',
            createFake: () => ({
              getActionable: async () => [{ ...expected[0], title: 'wrong title' }],
            }),
            createReal: () => new VcsInboxReal({ host: HOST, token: 'test-token' }),
            exercise: (port) => port.getActionable(),
          }),
        /VcsInboxPort#getActionable diverges at \$\.0\.title/
      );
    } finally {
      driftReplay.cleanup();
    }
  });

  it('cassette replay rejects a changed URL query and body hash', async () => {
    const cassetteDir = makeTestTmpDir('tsk-166-query-');
    directories.push(cassetteDir);
    const url = 'https://' + HOST + '/api/v4/user?state=opened';
    recordCassette(cassetteDir, {
      method: 'GET',
      url,
      response: { status: 200, body: { username: 'agent' } },
    });
    const replay = replayCassette(readCassette(cassetteDir, HOST));
    try {
      await assert.rejects(() => fetch('https://' + HOST + '/api/v4/user?state=closed'));
    } finally {
      replay.cleanup();
    }

    const postUrl = 'https://' + HOST + '/api/v4/projects/group%2Fproject/merge_requests/42/notes';
    recordCassette(cassetteDir, {
      method: 'POST',
      url: postUrl,
      body: JSON.stringify({ body: 'recorded note' }),
      response: { status: 201, body: { id: 1 } },
    });
    const bodyReplay = replayCassette(readCassette(cassetteDir, HOST));
    try {
      await assert.rejects(() =>
        fetch(postUrl, {
          method: 'POST',
          body: JSON.stringify({ body: 'different note' }),
        })
      );
    } finally {
      bodyReplay.cleanup();
    }
  });
});
