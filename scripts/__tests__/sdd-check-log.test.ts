// @file: Tests for check.sh [LOG] — Execution Log token vocabulary and Round-close shape.
// @consumers: CI
// @tasks: TSK-96

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPTS_DIR = path.join(REPO_ROOT, 'ai', 'skills', 'sdd-execute', 'scripts');
const CHECK_SH = path.join(SCRIPTS_DIR, 'check.sh');

const TS = '2026-01-01T00:00:00Z';

/**
 * @purpose Extract the data rows of one TSV section, independent of section ordering.
 * @param lines All output lines.
 * @param header Section header line, e.g. `[LOG]`.
 * @returns Rows between that header and the next one, minus blanks and comments.
 */
function sectionRows(lines: string[], header: string): string[] {
  const start = lines.indexOf(header);
  if (start === -1) return [];
  const rest = lines.slice(start + 1);
  const next = rest.findIndex((line) => /^\[[A-Z_]+\]$/.test(line));
  return (next === -1 ? rest : rest.slice(0, next)).filter(
    (line) => line.trim() !== '' && !line.startsWith('#')
  );
}

/** @purpose Assemble a ticket whose Execution Log holds the given P1 and Round-close lines. */
function ticket(p1Lines: string[], closeLines: string[] = [`- [x] \`${TS}\` DONE`]): string {
  return [
    '## 1. Meta',
    '',
    '- **Task-ID:** TSK-01',
    '- **Status:** [x] DONE',
    '',
    '## 7. Execution Log',
    '',
    '### Round 1 — 2026-01-01, initial',
    '',
    '#### P1',
    '',
    ...p1Lines,
    '',
    '#### Round close',
    '',
    ...closeLines,
    '',
  ].join('\n');
}

/** @purpose Run check.sh over a one-ticket project and return its [LOG] rows and findings count. */
function runLog(body: string): { rows: string[]; findings: string; ruleFindings: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-log-'));
  try {
    fs.mkdirSync(path.join(dir, 'tasks', 'demo'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'tasks', 'demo', 'demo.task-01.md'), body);
    fs.writeFileSync(
      path.join(dir, 'tasks', 'demo', 'README.md'),
      '| Task | Status |\n| --- | --- |\n| [TSK-01](demo.task-01.md) | `[x]` DONE |\n'
    );

    const proc = spawnSync('bash', [CHECK_SH, dir], { cwd: dir, encoding: 'utf-8' });
    const lines = `${proc.stdout}${proc.stderr}`.split('\n');
    const rows = sectionRows(lines, '[LOG]');

    const summary = Object.fromEntries(
      lines
        .slice(lines.indexOf('[SUMMARY]') + 1)
        .map((line) => line.split('='))
        .filter((pair) => pair.length === 2)
    ) as Record<string, string>;

    return { rows, findings: summary.findings, ruleFindings: summary.rule_findings };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('check.sh [LOG]', () => {
  it('accepts a log using only canonical tokens', () => {
    const { rows, findings } = runLog(
      ticket([
        `- [x] \`${TS}\` intro \`Thing\` ← нужна новая сущность`,
        `- [x] \`${TS}\` ver \`npm test\` → pass exit=0`,
        `- [x] \`${TS}\` DONE`,
      ])
    );

    assert.deepEqual(rows, []);
    assert.equal(findings, '0');
  });

  it('flags a token outside the vocabulary', () => {
    const { rows, findings } = runLog(
      ticket([`- [x] \`${TS}\` frobnicate something`, `- [x] \`${TS}\` DONE`])
    );

    assert.equal(rows.length, 1, rows.join('\n'));
    assert.match(rows[0], /unknown-token\tfrobnicate/);
    assert.equal(findings, '1');
  });

  it('reports a retired token as history, not as a finding — rounds are append-only', () => {
    const { rows, findings } = runLog(
      ticket([`- [x] \`${TS}\` DONE`], [`- [x] \`${TS}\` sync demo+root`, `- [x] \`${TS}\` DONE`])
    );

    assert.equal(rows.length, 1, rows.join('\n'));
    assert.match(rows[0], /retired-token\tsync/);
    assert.equal(findings, '0');
  });

  it('treats a trailing colon as cosmetic rather than a different token', () => {
    const { rows } = runLog(
      ticket([`- [x] \`${TS}\` insight: спека молчит про retry`, `- [x] \`${TS}\` DONE`])
    );

    assert.deepEqual(rows, []);
  });

  it('does not mistake blocker lifecycle markers for action tokens', () => {
    const { rows, findings } = runLog(
      ticket([
        `- [x] \`${TS}\` 🛑 BLOCKED: нет доступа к реестру`,
        `- [x] \`${TS}\` ✅ RESOLVED Round-1: реестр доступен`,
        `- [x] \`${TS}\` DONE`,
      ])
    );

    assert.deepEqual(rows, []);
    assert.equal(findings, '0');
  });

  it('flags a Round close whose DONE is not ticked — the round never actually closed', () => {
    const { rows, findings } = runLog(ticket([`- [x] \`${TS}\` DONE`], [`- - [ ] TODO`]));

    assert.equal(rows.length, 1, rows.join('\n'));
    assert.match(rows[0], /unclosed-round/);
    assert.equal(findings, '1');
  });

  // A [ ] TODO ticket carries the scaffolder's untouched skeleton: unticked lines everywhere,
  // including the Round close. That is the normal state of work that has not started, not a defect.
  it('says nothing about a round that never ran', () => {
    const { rows, findings } = runLog(
      ticket(
        ['- [ ] `<ts>` ver `npm test` → <pass|fail> exit=<code>', '- [ ] `<ts>` DONE'],
        ['- [ ] DONE']
      )
    );

    assert.deepEqual(rows, []);
    assert.equal(findings, '0');
  });

  it('demotes a ticked DONE missing only its timestamp to informational', () => {
    const { rows, findings } = runLog(ticket([`- [x] \`${TS}\` DONE`], ['- [x] DONE']));

    assert.equal(rows.length, 1, rows.join('\n'));
    assert.match(rows[0], /round-close-no-timestamp/);
    assert.equal(findings, '0');
  });
});
