// @file: Explicitly allowlisted real GitLab native-effect reconciliation proof.
// @consumers: operator-run node:test with an isolated writable MR
// @tasks: TSK-174

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryJournal } from '../../inbox-core/adapters/in-memory-journal.ts';
import { VcsGitlabClient } from '../../../../vcs-client/gitlab/vcs-gitlab-client.ts';
import { Effects, composeVcsEffectId } from '../effects.ts';
import { VcsGitlabPort } from '../vcs-gitlab.port.ts';
import type { VcsEffectKind, VcsEffectRequest } from '../vcs-port.ts';

type RealEffectPayload = Partial<
  Pick<VcsEffectRequest, 'body' | 'discussionId' | 'noteId' | 'emoji'>
>;

type RealEffectContext = {
  host: string;
  project: string;
  iid: string;
  revision: string;
  kind: VcsEffectKind;
  payload: RealEffectPayload;
  reviewerPermission: boolean;
  port: VcsGitlabPort;
  journal: InMemoryJournal;
  effects: Effects;
};

function createRealEffectContext(): RealEffectContext {
  const host = process.env.TSK174_GITLAB_HOST ?? '';
  const project = process.env.TSK174_GITLAB_PROJECT ?? '';
  const iid = process.env.TSK174_GITLAB_MR_IID ?? '';
  const revision = process.env.TSK174_GITLAB_REVISION ?? '';
  const kind = process.env.TSK174_GITLAB_EFFECT_KIND ?? '';
  const payloadText = process.env.TSK174_GITLAB_EFFECT_PAYLOAD ?? '';
  const reviewerPermission = process.env.TSK174_GITLAB_REVIEWER_PERMISSION === 'true';
  const token = process.env.GITLAB_PERSONAL_TOKEN ?? '';
  const allowlist = process.env.TSK174_GITLAB_EFFECT_ALLOW ?? '';
  const expectedAllowlist = `${kind}:${host}/${project}!${iid}@${revision}`;

  // #region START_REAL_EFFECT_SETUP_REQUIRE_EXACT_ALLOWLIST
  assert.ok(
    host && project && iid && revision && kind && payloadText && token,
    'real effect prerequisites are incomplete'
  );
  assert.strictEqual(
    allowlist,
    expectedAllowlist,
    `explicit real-effect allowlist must equal ${expectedAllowlist}`
  );
  const payload = JSON.parse(payloadText) as Record<string, unknown>;
  assert.ok(payload && typeof payload === 'object' && !Array.isArray(payload));
  for (const controlledField of [
    'effectId',
    'kind',
    'project',
    'iid',
    'revision',
    'currentRevision',
    'mrUrl',
    'permission',
  ]) {
    assert.ok(!(controlledField in payload), `payload must not override ${controlledField}`);
  }
  // #endregion END_REAL_EFFECT_SETUP_REQUIRE_EXACT_ALLOWLIST

  const port = new VcsGitlabPort(
    new VcsGitlabClient({ baseUrl: `https://${host}/api/v4`, token }),
    host
  );
  const journal = new InMemoryJournal();
  return {
    host,
    project,
    iid,
    revision,
    kind: kind as VcsEffectKind,
    payload: payload as RealEffectPayload,
    reviewerPermission,
    port,
    journal,
    effects: new Effects(port, journal),
  };
}

describe('allowlisted real GitLab effect', () => {
  it('allowlisted real GitLab effect is observed exactly once after reconciliation', async () => {
    // invariant: absent exact host/project/MR/revision allowlist is a red prerequisite, never a skipped test
    const context = createRealEffectContext();
    const detail = await context.port.getMrDetail(context.project, context.iid);
    const operatorLogin = await context.port.getCurrentUserLogin();
    const effect: Omit<VcsEffectRequest, 'effectId'> = {
      ...context.payload,
      kind: context.kind,
      project: context.project,
      iid: context.iid,
      revision: context.revision,
      currentRevision: detail.headSha,
      mrUrl: detail.webUrl,
      permission: {
        operatorLogin,
        operatorIsMrAuthor: detail.author === operatorLogin,
        reviewerPermission: context.reviewerPermission,
        automatic: false,
      },
    };
    assert.strictEqual(detail.headSha, context.revision);
    assert.strictEqual(await context.port.observeEffect({ ...effect, effectId: '' }), false);

    const outcome = await context.effects.apply({
      ...effect,
      effectId: composeVcsEffectId(effect),
    });
    const observed = await context.port.observeEffect({ ...effect, effectId: outcome.effectId });

    // #region START_REAL_EFFECT_ASSERT_FRESH_RECONCILIATION
    assert.strictEqual(outcome.status, 'applied');
    assert.strictEqual(observed, true);
    assert.strictEqual(context.journal.read().length, 1);
    assert.strictEqual(context.journal.read()[0].payload?.status, 'confirmed');
    // #endregion END_REAL_EFFECT_ASSERT_FRESH_RECONCILIATION
  });
});
