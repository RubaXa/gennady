// @file: Deterministic V2 Go execute round-trip (E-12): pickable → phase receipt → clean mechanics.
// @spec: AI-SKILLS
// @consumers: V-09 golang preset, sdd-task pickability, sdd-verify phase transaction

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import {
  defaultAsyncRunner,
  GATE_MAX_BUFFER_BYTES,
} from '../../../cli/cmd/sdd-verify/sdd-verify.cmd.ts';
import { resolvePhaseContext } from '../../../cli/cmd/sdd-verify/phase-context.ts';
import { runPhaseVerification } from '../../../cli/cmd/sdd-verify/phase-run.ts';
import { checkTicket, pickableTasks } from '../../../shared/sdd/check.ts';
import { parsePhaseReceipts } from '../../../shared/sdd/phase-receipt.ts';
import { collectTicketCorpus } from '../../../shared/sdd/ticket-resolve.ts';
import { FIXTURE_FILES } from '../provision.ts';
import { checkCompletion } from '../quality-gate.ts';

const REPO_ROOT = resolve(import.meta.dirname, '../../..');
const TSX_IMPORT = join(REPO_ROOT, 'node_modules/tsx/dist/loader.mjs');
const GENNADY = join(REPO_ROOT, 'cli/gennady.ts');
const CLOCK = '2026-09-16T12:00:00.000Z';

const IMPLEMENTATION = `package slugify

import (
	"errors"
	"strings"
	"unicode"
)

func Slugify(value string) (string, error) {
	var out strings.Builder
	separator := false
	for _, r := range strings.ToLower(strings.TrimSpace(value)) {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			if separator && out.Len() > 0 { out.WriteByte('-') }
			out.WriteRune(r)
			separator = false
		} else { separator = true }
	}
	result := out.String()
	if result == "" { return "", errors.New("slugify: empty input") }
	return result, nil
}
`;

function layout(): { root: string; ticket: string; spec: string } {
  const root = mkdtempSync(join(tmpdir(), 'golang-execute-roundtrip-'));
  for (const [relativePath, content] of Object.entries(FIXTURE_FILES['golang-slugify'])) {
    const absolute = join(root, relativePath);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, content);
  }
  const init = (args: readonly string[]): void => {
    const result = spawnSync('git', [...args], { cwd: root, encoding: 'utf-8' });
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  };
  init(['init', '-q']);
  init(['config', 'user.email', 'tests@example.com']);
  init(['config', 'user.name', 'Tests']);
  init(['add', '-A']);
  init(['commit', '-qm', 'fixture baseline']);
  writeFileSync(join(root, 'slugify.go'), IMPLEMENTATION);
  return {
    root,
    ticket: 'specs/golang-slugify/core/core.task.GSL-slug.md',
    spec: join(root, 'specs/golang-slugify/core/core.spec.md'),
  };
}

function sddLog(root: string, args: readonly string[]): void {
  const result = spawnSync(
    process.execPath,
    ['--import', TSX_IMPORT, GENNADY, 'sdd-log', ...args],
    {
      cwd: root,
      encoding: 'utf-8',
    }
  );
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
}

function git(root: string, args: readonly string[]): string {
  const result = spawnSync('git', [...args], { cwd: root, encoding: 'utf-8' });
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  return result.stdout.trim();
}

describe('E-12 Go V2 mechanical round-trip', () => {
  it('is pickable and deterministically closes DONE + receipts + R-COMPLETE after Go gates', async (t) => {
    if (spawnSync('go', ['version']).status !== 0) return t.skip('go toolchain unavailable');
    const fixture = layout();
    const goCache = mkdtempSync(join(tmpdir(), 'golang-execute-gocache-'));
    const goTmp = mkdtempSync(join(tmpdir(), 'golang-execute-gotmp-'));
    const previousGoCache = process.env.GOCACHE;
    const previousGoTmp = process.env.GOTMPDIR;
    process.env.GOCACHE = goCache;
    process.env.GOTMPDIR = goTmp;
    try {
      const corpus = collectTicketCorpus(fixture.root);
      assert.equal(corpus.ok, true);
      if (!corpus.ok) return;
      const ref = corpus.refs.find((candidate) => candidate.taskId === 'GSL-slug');
      assert.ok(ref);
      assert.deepEqual(checkTicket(ref.file, ref.content, 'v2'), []);
      const owner = realpathSync(fixture.spec);
      assert.deepEqual(
        pickableTasks(corpus.refs, {
          ownerByTaskId: new Map([['GSL-slug', owner]]),
          validAuditOwners: new Set(),
        }).map((candidate) => candidate.taskId),
        ['GSL-slug']
      );

      for (const phase of ['P1', 'P2']) {
        const resolved = resolvePhaseContext(fixture.ticket, phase, fixture.root);
        assert.equal(resolved.ok, true, resolved.ok ? undefined : resolved.message);
        if (!resolved.ok) return;
        assert.equal(resolved.context.stack, 'golang');
        assert.deepEqual(
          resolved.context.gatePlan?.gates.map((gate) => gate.name),
          ['fix', 'type-check', 'test']
        );

        const outcome = await runPhaseVerification(
          fixture.root,
          resolved.context,
          defaultAsyncRunner,
          (command) => {
            const result = spawnSync(command, {
              cwd: fixture.root,
              shell: true,
              encoding: 'utf-8',
              maxBuffer: GATE_MAX_BUFFER_BYTES,
            });
            return {
              exitCode: result.status ?? 1,
              output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
            };
          }
        );
        assert.equal(outcome.ok, true, outcome.ok ? undefined : outcome.message);
        sddLog(fixture.root, [
          fixture.ticket,
          'complete',
          `artifacts: [${phase === 'P1' ? 'slugify.go' : 'slugify_test.go'}]; decisions: [none]; open: [none]; deviations: []`,
          '--phase',
          phase,
        ]);
      }

      git(fixture.root, ['add', 'slugify.go']);
      const incomplete = checkCompletion(fixture.root, {
        artifact: 'slugify.go',
        ticket: fixture.ticket,
        spec: 'specs/golang-slugify/core/core.spec.md',
      });
      assert.equal(incomplete.pass, false);
      assert.match(incomplete.detail, /ticket not \[x\] DONE|no closed execution-log round/);

      sddLog(fixture.root, [fixture.ticket, 'close']);
      sddLog(fixture.root, [fixture.ticket, 'audit-receipt', 'PASS']);
      sddLog(fixture.root, [fixture.ticket, 'review-receipt', 'PASS']);

      const ticketContent = readFileSync(join(fixture.root, fixture.ticket), 'utf-8');
      const receipts = parsePhaseReceipts(ticketContent);
      assert.equal(
        receipts.ok,
        true,
        receipts.ok ? undefined : `${receipts.issue}\n${ticketContent}`
      );
      if (receipts.ok) {
        assert.deepEqual(
          receipts.receipts.map((receipt) => receipt.phase),
          ['P1', 'P2']
        );
        assert.deepEqual(
          receipts.receipts[0]?.commands.map((command) => command.gate),
          ['fix', 'type-check', 'test']
        );
        assert.deepEqual(
          receipts.receipts[1]?.commands.map((command) => command.gate),
          ['fix', 'type-check', 'test']
        );
      }
      assert.deepEqual(checkTicket(fixture.ticket, ticketContent, 'v2'), []);
      assert.match(ticketContent, /- \*\*Status:\*\* \[x\] DONE/);
      assert.match(ticketContent, /#### Round close\n- \[x\] `[^`]+` DONE/);

      const completed = checkCompletion(fixture.root, {
        artifact: 'slugify.go',
        ticket: fixture.ticket,
        spec: 'specs/golang-slugify/core/core.spec.md',
      });
      assert.equal(completed.pass, true, completed.detail);
      assert.equal(completed.rule, 'R-COMPLETE');

      const goTest = spawnSync('go', ['test', './...'], {
        cwd: fixture.root,
        encoding: 'utf-8',
      });
      assert.equal(goTest.status, 0, `${goTest.stdout}${goTest.stderr}`);
      const golden = spawnSync('bash', ['golden/verify.sh'], {
        cwd: fixture.root,
        encoding: 'utf-8',
      });
      assert.equal(golden.status, 0, `${golden.stdout}${golden.stderr}`);

      git(fixture.root, ['add', '-A']);
      git(fixture.root, ['commit', '-qm', `complete Go round-trip ${CLOCK}`]);
      assert.equal(git(fixture.root, ['status', '--porcelain']), '');
    } finally {
      if (previousGoCache === undefined) delete process.env.GOCACHE;
      else process.env.GOCACHE = previousGoCache;
      if (previousGoTmp === undefined) delete process.env.GOTMPDIR;
      else process.env.GOTMPDIR = previousGoTmp;
      rmSync(goCache, { recursive: true, force: true });
      rmSync(goTmp, { recursive: true, force: true });
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });
});
