// @file: Deterministic V2 Go execute round-trip (E-12): pickable → phase receipt → clean mechanics.
// @consumers: V-09 golang preset, sdd-task pickability, sdd-verify phase transaction
// @tasks: E-12

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
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
  writeFileSync(join(root, 'slugify.go'), IMPLEMENTATION);
  return {
    root,
    ticket: 'specs/golang-slugify/core/core.task.GSL-slug.md',
    spec: join(root, 'specs/golang-slugify/core/core.spec.md'),
  };
}

describe('E-12 Go V2 mechanical round-trip', () => {
  it('is pickable, writes a receipt only after Go gates pass, and remains mechanically clean', async (t) => {
    if (spawnSync('go', ['version']).status !== 0) return t.skip('go toolchain unavailable');
    const fixture = layout();
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

      const resolved = resolvePhaseContext(fixture.ticket, 'P1', fixture.root);
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
          ['P1']
        );
        assert.deepEqual(
          receipts.receipts[0]?.commands.map((command) => command.gate),
          ['fix', 'type-check', 'test']
        );
      }
      assert.deepEqual(checkTicket(fixture.ticket, ticketContent, 'v2'), []);

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
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });
});
