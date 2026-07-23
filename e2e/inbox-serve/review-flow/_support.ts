// @file: shared support for the decomposed review-flow proof suite (TSK-131). Each tN spec boots a
//   REAL in-process HttpServer (bootstrap, mocks:false, dryRun:true) and drives one stage; no mocks
//   or fixtures on the flow. Two seed strategies: an EMPTY temp state (t1/t2/t3/t4 — the real review
//   runs live), or a temp state PRE-SEEDED with a byte-copy of the operator's already-materialized
//   real review of mail/messenger!159 (t5/t6/t7/t8 — render/chat/mutation/action over a real review
//   without paying the ~20-min live review each time). Copies never touch the operator's real
//   ~/.gennady state.
//   MR_REF was vk-workspace/superapp!602 until 2026-07-18 — that MR was for-real merged on GitLab
//   (independent of this suite's dry-run actions), dropping it from the actionable board and
//   breaking any UI-driven "assign" flow; switched to mail/messenger!159 (real, open, non-draft).
// @consumers: e2e/inbox-serve/review-flow/*.spec.ts
// @tasks: TSK-131

import { cpSync, existsSync, mkdirSync, symlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mrWorktreeDir } from '../../../cli/cmd/inbox/_core/logic/state-paths.logic.ts';
import { bootstrap, type BootstrapResult } from '../../../services/agent-inbox/serve/bootstrap.ts';
import { StateStore } from '../../../services/agent-inbox/modules/inbox-core/state-store.ts';
import { gracefulShutdown } from '../../../services/agent-inbox/serve/shutdown.ts';
import {
  makeTestTmpDir,
  cleanupTestTmp,
} from '../../../services/agent-inbox/modules/inbox-core/test-support/test-tmp.ts';
import { mrReportsDir } from '../../../cli/cmd/inbox/_core/logic/state-paths.logic.ts';

/** @purpose The real test MR the whole suite drives end-to-end. */
export const MR_URL = 'https://gitlab.corp.mail.ru/hocuspocus/hocuspocus/-/merge_requests/18';
/** @purpose Dashboard hash-route id + `mrReportsDir` ref for MR_URL — `project!iid`. */
export const MR_REF = 'hocuspocus/hocuspocus!18';
/** @purpose Port the suite's server listens on. Overridable so a spec can avoid clashing with a
 *   concurrently-running big-test server on 4174. */
export const PORT = Number(process.env.REVIEW_FLOW_PORT ?? 4174);
/** @purpose Same-origin base URL for browser specs (page served by the same HttpServer). */
export const BASE_URL = `http://localhost:${PORT}`;

/** @purpose Flat encoding of MR_REF (`project!iid` → `project-with-__-for-slash-iid`) shared with
 *   `mrReportsDir`/worktree naming. */
function _encodedMrRef(): string {
  const sep = MR_REF.lastIndexOf('!');
  const project = MR_REF.slice(0, sep);
  const iid = MR_REF.slice(sep + 1);
  return `${project.replace(/\//g, '__')}-${iid}`;
}

/** @purpose Path to the operator's real, already-materialized review of MR_REF — the copy source. */
export function realReviewSourceDir(): string {
  return mrReportsDir(join(homedir(), '.gennady'), MR_REF);
}

/**
 * @purpose Create an isolated temp state dir with a valid config; optionally seed it with a byte
 *   copy of the operator's real materialized review of MR_REF.
 * @param opts.seedReview When true, copies the real review dir into the temp state's reports tree.
 * @returns The temp state dir path and the review.json path inside it.
 */
export async function makeStateDir(opts: { seedReview: boolean }): Promise<{
  stateDir: string;
  reviewPath: string;
}> {
  // A persistent state dir (REVIEW_FLOW_STATE_DIR) lets a debug run keep telemetry/artifacts for
  // `gennady inbox stats --state-dir …` inspection; unset → an auto-cleaned temp dir (normal CI).
  const stateDir = process.env.REVIEW_FLOW_STATE_DIR ?? makeTestTmpDir('review-flow-suite-');
  const store = new StateStore(stateDir);
  await store.saveConfig({
    reposBase: join(homedir(), 'Developer'),
    vcsHost: 'gitlab.corp.mail.ru',
  });

  const reviewDir = mrReportsDir(stateDir, MR_REF);
  if (opts.seedReview) {
    const src = realReviewSourceDir();
    if (!existsSync(join(src, 'review.json'))) {
      throw new Error(
        `[review-flow] real review source missing at ${src}/review.json — cannot seed. ` +
          `A real review of ${MR_REF} must exist in ~/.gennady first.`
      );
    }
    mkdirSync(reviewDir, { recursive: true });
    cpSync(src, reviewDir, { recursive: true });

    // The Review Chat opens its opencode session in worktreesRoot/<encoded ref> (chat-session.ts).
    // Point that at the operator's REAL, already-checked-out worktree for this MR (read-only — chat
    // reviews code, never mutates it, and runs under dryRun) so the chat pipeline gets a genuine
    // working directory instead of a missing dir (which makes opencode error before it ever prompts).
    const realWorktree = join(homedir(), '.gennady', 'worktrees', _encodedMrRef());
    if (existsSync(realWorktree)) {
      const targetWorktreePath = mrWorktreeDir(stateDir, MR_REF);
      mkdirSync(join(targetWorktreePath, '..'), { recursive: true });
      try {
        symlinkSync(realWorktree, targetWorktreePath);
      } catch {
        /* symlink may already exist — ignore */
      }
    }
  }

  return { stateDir, reviewPath: join(reviewDir, 'review.json') };
}

/**
 * @purpose Boot the REAL product in-process (mocks:false, dryRun:true) and start its HTTP server.
 * @invariant Spawns its OWN proxy-free `opencode serve` (unset proxy, no pinned OPENCODE_PORT).
 * @param stateDir Temp state dir from `makeStateDir`.
 * @returns The bootstrap result (server/scheduler/opencode handles).
 */
export async function bootReal(stateDir: string): Promise<BootstrapResult> {
  // The corporate squid proxy blocks the llm-proxy provider (opencode → `fetch failed`). Unset ALL
  // proxy vars in THIS process so the opencode server bootstrap spawns inherits a proxy-free env,
  // regardless of how the suite was launched (https provider still routes via HTTP_PROXY/ALL_PROXY).
  for (const key of [
    'HTTPS_PROXY',
    'https_proxy',
    'HTTP_PROXY',
    'http_proxy',
    'ALL_PROXY',
    'all_proxy',
  ]) {
    delete process.env[key];
  }
  // Do NOT pin OPENCODE_PORT: let bootstrap findFreePort + spawn its OWN clean opencode instead of
  // reusing a possibly-proxied long-lived server on :4096.
  delete process.env.OPENCODE_PORT;
  const app = await bootstrap({ mocks: false, port: PORT, stateDir, dryRun: true });
  await app.server.start();
  return app;
}

/**
 * @purpose Tear down a booted app + remove its temp state dir. Safe to call with a partially-booted
 *   app.
 * @param app Bootstrap result (or undefined).
 * @param stateDir Temp state dir (or undefined).
 */
export async function teardown(
  app: BootstrapResult | undefined,
  stateDir: string | undefined
): Promise<void> {
  if (app) {
    await gracefulShutdown({
      server: app.server,
      scheduler: app.scheduler,
      opencode: app.opencode,
      opencodeProcess: app.opencodeProcess,
      opencodePidFile: app.opencodePidFile,
    });
  }
  // Keep a persistent debug state dir (REVIEW_FLOW_STATE_DIR) for post-run `inbox stats` inspection.
  if (stateDir && !process.env.REVIEW_FLOW_STATE_DIR) cleanupTestTmp(stateDir);
}

export { cleanupTestTmp, makeTestTmpDir };
