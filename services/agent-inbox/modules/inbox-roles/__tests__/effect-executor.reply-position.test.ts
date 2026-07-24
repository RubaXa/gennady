// Regression for the live posting failure (2026-07-24): session-proposed reply positions carry only
// `{ file, newLine }` (no diff SHAs), and GitLab rejects such a line comment with a 500 — every
// positioned reply failed in production. EffectExecutor#_enrichReplyPositions must complete the
// position into `{ newPath, baseSha, startSha, headSha, newLine }` from the MR's diff refs, and
// degrade to a general note (anchor kept in the body) when refs can't be resolved.

import { describe, it, mock, before } from 'node:test';
import assert from 'node:assert/strict';

describe('EffectExecutor#_enrichReplyPositions (reply-position regression)', () => {
  let refsResult: { baseSha?: string; startSha?: string; headSha?: string } | undefined;

  before(() => {
    // Stub only the one context-builder export EffectExecutor imports; each test drives the
    // resolved refs via the `refsResult` closure. Mocked once — the runner keeps it for the suite.
    mock.module('../context-builder.ts', {
      namedExports: { fetchDiffRefsLive: async () => refsResult },
    });
  });

  async function makeExecutor() {
    const { EffectExecutor } = await import('../effect-executor.ts');
    class Probe extends EffectExecutor {
      enrich(mr: string, payload: Array<{ body?: string; position?: unknown }>) {
        // @ts-expect-error — exercising the protected enrichment seam directly
        return this._enrichReplyPositions(mr, payload);
      }
    }
    return new Probe({ vcs: {} as never, store: {} as never });
  }

  it('completes a { file, newLine } position with newPath + diff SHAs', async () => {
    refsResult = { baseSha: 'BASE', startSha: 'START', headSha: 'HEAD' };
    const exec = await makeExecutor();

    const out = await exec.enrich('https://gl/x/-/merge_requests/1', [
      { body: 'inline finding', position: { file: 'src/a.ts', newLine: 42 } },
    ]);

    const pos = out[0].position as Record<string, unknown>;
    assert.strictEqual(pos.newPath, 'src/a.ts');
    assert.strictEqual(pos.newLine, 42);
    assert.strictEqual(pos.baseSha, 'BASE');
    assert.strictEqual(pos.startSha, 'START');
    assert.strictEqual(pos.headSha, 'HEAD');
  });

  it('degrades to a general note (position dropped, anchor kept in body) when refs are unavailable', async () => {
    refsResult = undefined; // diff-refs lookup failed
    const exec = await makeExecutor();

    const out = await exec.enrich('https://gl/x/-/merge_requests/1', [
      { body: 'inline finding', position: { file: 'src/a.ts', newLine: 42 } },
    ]);

    assert.strictEqual(out[0].position, undefined, 'position must be dropped, not sent invalid');
    assert.match(out[0].body ?? '', /src\/a\.ts:42/, 'anchor preserved in the note body');
    assert.match(out[0].body ?? '', /inline finding/);
  });

  it('leaves a position that already has SHAs untouched and never fetches refs', async () => {
    refsResult = undefined; // if fetched, enrichment would have to degrade — proves it is not fetched
    const exec = await makeExecutor();

    const complete = { newPath: 'src/a.ts', newLine: 7, baseSha: 'b', startSha: 's', headSha: 'h' };
    const out = await exec.enrich('https://gl/x/-/merge_requests/1', [
      { body: 'ok', position: complete },
    ]);

    assert.deepStrictEqual(out[0].position, complete);
  });
});
