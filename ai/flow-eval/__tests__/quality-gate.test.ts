// @file: Both-outcomes proof for the R1 quality parser (structural integrity).
// @consumers: ai/flow-eval/quality-gate
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseSddCheckResult, checkCompletion } from '../quality-gate.ts';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import {
  buildGroupReceipt,
  upsertGroupReceipt,
  type GroupReceipt,
} from '../../../shared/sdd/group-receipt.ts';

describe('parseSddCheckResult (R1, both outcomes)', () => {
  it('PASS on a clean summary', () => {
    const r = parseSddCheckResult('[sdd-check] ✅ clean — 6 file(s) checked');
    assert.strictEqual(r.pass, true);
    assert.strictEqual(r.rule, 'R1');
  });

  it('FAIL on an error summary, carrying the count', () => {
    const r = parseSddCheckResult(
      'specs/x.spec.md: error: SDD_DIAGRAM_INVALID …\n[sdd-check] 3 error(s), 0 warning(s) across 3 file(s)'
    );
    assert.strictEqual(r.pass, false);
    assert.match(r.detail, /3/);
  });

  // E-01: on any real repository `sdd-check` almost never has literally zero findings — the common
  // real-repo case is "0 error(s), N warning(s)", which is `sdd-check`'s OWN definition of clean
  // (`cli/cmd/sdd-check/help.ts`: "0 clean (warnings allowed)"; `sdd-check.types.ts:164` is the exact
  // summary-line format it prints). Before this fix the parser fell through to "no verdict parsed"
  // (FAIL) on this line, so every warnings-only real run looked like "the eval failed" instead of
  // "the rule was broken" (R4 digest §3.8).
  it('PASS on the real-repo "0 error(s), N warning(s)" summary (sdd-check calls this clean)', () => {
    const r = parseSddCheckResult(
      'specs/x.spec.md:12: warning: SDD_LANGUAGE_CALQUE  some calque\n\n' +
        '[sdd-check] 0 error(s), 1 warning(s) across 6 file(s)\n' +
        'next: язык — калька за калькой, по месту (`file:line`) правь всё предложение целиком.'
    );
    assert.strictEqual(r.pass, true);
    assert.strictEqual(r.rule, 'R1');
    assert.match(r.detail, /0 sdd-check error\(s\), 1 warning\(s\)/);
  });

  it('PASS on "0 error(s), 0 warning(s)" too (same real-repo line shape, zero of both)', () => {
    const r = parseSddCheckResult('[sdd-check] 0 error(s), 0 warning(s) across 4 file(s)');
    assert.strictEqual(r.pass, true);
  });

  // E-01 regression guard (both-way): errors must win even when a genuine "clean" marker sits right
  // next to them in the combined stdout+stderr — e.g. a checker that prints a per-target "✅ clean"
  // banner for one target and then a real error count for another in the same combined run. Before
  // this fix `if (clean) return pass` was checked BEFORE `errors > 0`, so either clean pattern
  // co-occurring with a real error count masked the failure entirely (silent pass on a broken run).
  it('FAIL when "✅ clean" co-occurs with a real error count (clean must not mask errors)', () => {
    const r = parseSddCheckResult(
      '[sdd-check] ✅ clean — 6 file(s) checked\n[sdd-check] 2 error(s), 1 warning(s) across 5 file(s)'
    );
    assert.strictEqual(r.pass, false);
    assert.match(r.detail, /2/);
  });

  it('FAIL when "clean — N file(s)" co-occurs with a real error count (clean must not mask errors)', () => {
    const r = parseSddCheckResult(
      'clean — 6 file(s) checked\n[sdd-check] 3 error(s) across 5 file(s)'
    );
    assert.strictEqual(r.pass, false);
    assert.match(r.detail, /3/);
  });

  it('FAIL (not a silent pass) when no verdict is present', () => {
    assert.strictEqual(parseSddCheckResult('some unrelated output').pass, false);
  });
});

describe('checkCompletion (R-COMPLETE, both outcomes, from disk)', () => {
  const T = { artifact: 'Tools/g.sh', ticket: 'specs/s/s.task.T1.md', spec: 'specs/s/s.spec.md' };

  /** @purpose A ticket whose Meta/Execution-Log state `deriveGroupState`/`groupReceiptIssue` can
   *  actually re-derive (real SECTION markers) — needed so a "valid receipt" test bed matches what
   *  `checkReceipt` (quality-gate.ts) verifies against, the same way `sdd-check`'s `checkGroupReceipts`
   *  would in production. */
  function ticketMd(opts: { done: boolean; round: boolean }): string {
    return [
      '<!--SECTION:META-->',
      `- **Status:** ${opts.done ? '[x] DONE' : '[ ] TODO'}`,
      '<!--/SECTION:META-->',
      '<!--SECTION:EXECUTION_LOG-->',
      opts.round
        ? '### Round 1 — 2026-09-07, initial\n- [x] `2026-09-07T00:00:00Z` DONE'
        : '- [ ] `<ts>` DONE',
      '<!--/SECTION:EXECUTION_LOG-->',
    ].join('\n');
  }

  /** @purpose Build a REAL, validly-signed receipt (via the production `buildGroupReceipt`) for the
   *  given ticket content — mutate the returned JSON string to explore invalid shapes (wrong verdict,
   *  wrong kind, stale signature) rather than hand-rolling a signature that would never validate. */
  function realReceipt(
    kind: 'audit' | 'review',
    ticketContent: string,
    verdict = 'PASS'
  ): GroupReceipt {
    const built = buildGroupReceipt(
      kind,
      T.spec,
      [{ file: T.ticket, content: ticketContent }],
      'deadbeef',
      verdict,
      '2026-09-10T00:00:00.000Z'
    );
    assert.ok(built.ok, 'test setup: ticket must be DONE for buildGroupReceipt to mint a receipt');
    return built.ok ? built.receipt : (undefined as never);
  }

  function bed(opts: {
    artifact: boolean;
    done: boolean;
    round: boolean;
    audit: boolean;
    review: boolean;
    /** @purpose Override the receipt object written under each marker before serializing (mutate a
     *  valid receipt into an invalid one — wrong verdict/kind, or signed against different content). */
    auditReceipt?: GroupReceipt;
    reviewReceipt?: GroupReceipt;
  }): string {
    const dir = mkdtempSync(join(tmpdir(), 'rcomplete-'));
    for (const rel of [T.artifact, T.ticket, T.spec])
      mkdirSync(join(dir, dirname(rel)), { recursive: true });
    if (opts.artifact) writeFileSync(join(dir, T.artifact), '#!/bin/bash\n');
    const ticketContent = ticketMd({ done: opts.done, round: opts.round });
    writeFileSync(join(dir, T.ticket), ticketContent);

    let spec = '# spec\n';
    if (opts.audit)
      spec = upsertGroupReceipt(spec, opts.auditReceipt ?? realReceipt('audit', ticketContent));
    if (opts.review)
      spec = upsertGroupReceipt(spec, opts.reviewReceipt ?? realReceipt('review', ticketContent));
    writeFileSync(join(dir, T.spec), spec);
    return dir;
  }

  it('PASS when artifact + DONE + closed round + both receipts (valid verdict + signature)', () => {
    const r = checkCompletion(
      bed({ artifact: true, done: true, round: true, audit: true, review: true }),
      T
    );
    assert.strictEqual(r.pass, true, r.detail);
    assert.strictEqual(r.rule, 'R-COMPLETE');
  });
  it('FAIL (abandoned) when artifact built but ticket TODO + open round', () => {
    const r = checkCompletion(
      bed({ artifact: true, done: false, round: false, audit: false, review: false }),
      T
    );
    assert.strictEqual(r.pass, false);
    assert.match(r.detail, /ticket not \[x\] DONE/);
    assert.match(r.detail, /no closed execution-log round/);
  });
  it('FAIL when the group audit receipt is missing (skipped audit)', () => {
    const r = checkCompletion(
      bed({ artifact: true, done: true, round: true, audit: false, review: true }),
      T
    );
    assert.strictEqual(r.pass, false);
    assert.match(r.detail, /no group audit receipt on spec \(no receipt recorded\)/);
  });
  it('FAIL when the declared artifact was never produced', () => {
    const r = checkCompletion(
      bed({ artifact: false, done: true, round: true, audit: true, review: true }),
      T
    );
    assert.strictEqual(r.pass, false);
    assert.match(r.detail, /not produced/);
  });

  // V-BATCH-22 verdict B-3: the naive `spec.includes('SDD_AUDIT_RECEIPT')` substring check accepted a
  // receipt regardless of its verdict, kind, or binding to the real ticket state. These prove the
  // fixed `checkReceipt` (quality-gate.ts) actually reads the receipt, not just detects its marker.
  describe('B-3: receipts require an explicit verdict and distinguishable, current provenance', () => {
    it('FAIL when the audit receipt carries a non-PASS verdict (a self-attested "FAIL" must not pass R-COMPLETE)', () => {
      const ticketContent = ticketMd({ done: true, round: true });
      const r = checkCompletion(
        bed({
          artifact: true,
          done: true,
          round: true,
          audit: true,
          review: true,
          auditReceipt: realReceipt('audit', ticketContent, 'FAIL'),
        }),
        T
      );
      assert.strictEqual(r.pass, false);
      assert.match(r.detail, /not an explicit PASS/);
    });

    it('FAIL when a receipt is pasted under the wrong marker (kind mismatch — indistinguishable provenance)', () => {
      // `upsertGroupReceipt` is kind-aware (it always writes under `receipt.kind`'s own marker), so
      // simulating "pasted under the wrong marker" means writing the review marker's HTML comments
      // by hand around a receipt whose `kind` field still says "audit" — exactly what a copy-paste
      // forgery (or the prior naive `spec.includes('SDD_REVIEW_RECEIPT')` check) would let through.
      const ticketContent = ticketMd({ done: true, round: true });
      const dir = mkdtempSync(join(tmpdir(), 'rcomplete-kind-'));
      for (const rel of [T.artifact, T.ticket, T.spec])
        mkdirSync(join(dir, dirname(rel)), { recursive: true });
      writeFileSync(join(dir, T.artifact), '#!/bin/bash\n');
      writeFileSync(join(dir, T.ticket), ticketContent);
      const auditReceipt = realReceipt('audit', ticketContent);
      let spec = upsertGroupReceipt('# spec\n', auditReceipt); // real, correctly-kinded audit receipt
      spec += [
        '<!--SDD_REVIEW_RECEIPT-->',
        '```json',
        JSON.stringify(auditReceipt, null, 2),
        '```',
        '<!--/SDD_REVIEW_RECEIPT-->',
      ].join('\n');
      writeFileSync(join(dir, T.spec), spec);

      const r = checkCompletion(dir, T);
      assert.strictEqual(r.pass, false);
      assert.match(r.detail, /provenance mismatch/);
    });

    it('FAIL when the receipt is stale — signed against a ticket state that has since changed (new Round)', () => {
      // Receipt minted when the ticket had only Round 1; the ticket on disk now has a second Round —
      // group-receipt.ts's own reopen-invalidation signature must catch this exactly as sdd-check would.
      const signedAgainst = ticketMd({ done: true, round: true });
      const staleReceipt = realReceipt('audit', signedAgainst);
      const reopenedTicket = [
        signedAgainst.replace(
          '<!--/SECTION:EXECUTION_LOG-->',
          '### Round 2 — 2026-09-11, reopen\n- [x] `2026-09-11T00:00:00Z` DONE\n<!--/SECTION:EXECUTION_LOG-->'
        ),
      ].join('');
      const dir = mkdtempSync(join(tmpdir(), 'rcomplete-stale-'));
      for (const rel of [T.artifact, T.ticket, T.spec])
        mkdirSync(join(dir, dirname(rel)), { recursive: true });
      writeFileSync(join(dir, T.artifact), '#!/bin/bash\n');
      writeFileSync(join(dir, T.ticket), reopenedTicket);
      let spec = upsertGroupReceipt('# spec\n', staleReceipt);
      spec = upsertGroupReceipt(spec, realReceipt('review', signedAgainst));
      writeFileSync(join(dir, T.spec), spec);

      const r = checkCompletion(dir, T);
      assert.strictEqual(r.pass, false);
      assert.match(r.detail, /stale/);
    });

    it('FAIL when the receipt block is not valid JSON (a hand-pasted placeholder, not a CLI-written fact)', () => {
      const ticketContent = ticketMd({ done: true, round: true });
      const dir = mkdtempSync(join(tmpdir(), 'rcomplete-badjson-'));
      for (const rel of [T.artifact, T.ticket, T.spec])
        mkdirSync(join(dir, dirname(rel)), { recursive: true });
      writeFileSync(join(dir, T.artifact), '#!/bin/bash\n');
      writeFileSync(join(dir, T.ticket), ticketContent);
      writeFileSync(
        join(dir, T.spec),
        '<!--SDD_AUDIT_RECEIPT-->\n```json\nx\n```\n<!--/SDD_AUDIT_RECEIPT-->\n' +
          upsertGroupReceipt('', realReceipt('review', ticketContent))
      );
      const r = checkCompletion(dir, T);
      assert.strictEqual(r.pass, false);
      assert.match(r.detail, /not valid JSON/);
    });
  });

  // V-BATCH-22 verdict B-3: `artifactExists` used to mean "file is non-empty" — the `slugify-toolchain`
  // fixture ships its target file already committed at provisioning, so that was satisfied before any
  // work happened. `artifactWasProduced` diffs against the sandbox's root commit instead.
  describe('B-3: the declared artifact must actually change vs. the sandbox root commit (git-aware)', () => {
    function gitBed(): { dir: string } {
      const dir = mkdtempSync(join(tmpdir(), 'rcomplete-git-'));
      mkdirSync(join(dir, dirname(T.artifact)), { recursive: true });
      mkdirSync(join(dir, dirname(T.ticket)), { recursive: true });
      writeFileSync(join(dir, T.artifact), 'export const stub = true;\n');
      execFileSync('git', ['init', '--quiet', '--initial-branch=main'], { cwd: dir });
      execFileSync('git', ['add', '--all'], { cwd: dir });
      execFileSync(
        'git',
        ['-c', 'user.email=t@t.dev', '-c', 'user.name=t', 'commit', '--quiet', '-m', 'init'],
        { cwd: dir }
      );
      return { dir };
    }

    it('FAIL when the artifact is untouched since the root commit (the provisioned stub, not real work)', () => {
      const { dir } = gitBed();
      const r = checkCompletion(dir, T);
      assert.strictEqual(r.pass, false);
      assert.match(r.detail, /not produced/);
    });

    it('artifact IS counted as produced once it differs from the root commit (uncommitted change)', () => {
      const { dir } = gitBed();
      writeFileSync(join(dir, T.artifact), 'export const stub = false; // real work\n');
      const ticketContent = ticketMd({ done: true, round: true });
      writeFileSync(join(dir, T.ticket), ticketContent);
      let spec = upsertGroupReceipt('# spec\n', realReceipt('audit', ticketContent));
      spec = upsertGroupReceipt(spec, realReceipt('review', ticketContent));
      writeFileSync(join(dir, T.spec), spec);
      const r = checkCompletion(dir, T);
      assert.strictEqual(r.pass, true, r.detail);
    });

    it('artifact IS counted as produced when the change was committed on top of the root commit', () => {
      const { dir } = gitBed();
      writeFileSync(join(dir, T.artifact), 'export const stub = false; // real work, committed\n');
      const ticketContent = ticketMd({ done: true, round: true });
      writeFileSync(join(dir, T.ticket), ticketContent);
      let spec = upsertGroupReceipt('# spec\n', realReceipt('audit', ticketContent));
      spec = upsertGroupReceipt(spec, realReceipt('review', ticketContent));
      writeFileSync(join(dir, T.spec), spec);
      execFileSync('git', ['add', '--all'], { cwd: dir });
      execFileSync(
        'git',
        ['-c', 'user.email=t@t.dev', '-c', 'user.name=t', 'commit', '--quiet', '-m', 'work'],
        { cwd: dir }
      );
      const r = checkCompletion(dir, T);
      assert.strictEqual(r.pass, true, r.detail);
    });
  });
});
