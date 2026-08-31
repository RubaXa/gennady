// @file: Tests for the path-based Task-ID (`TSK-{PREFIX}-{NNN}`) in scan.sh and check.sh.
// @consumers: CI
// @tasks: N/A

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
const SCAN_SH = path.join(SCRIPTS_DIR, 'scan.sh');

/** @purpose Assemble a ticket Meta declaring the given Task-ID line verbatim. */
function ticket(taskIdLine: string): string {
  return [
    '## 1. Meta',
    '',
    taskIdLine,
    '- **Status:** [ ] TODO',
    '',
    '## 7. Execution Log',
    '',
  ].join('\n');
}

/** @purpose Tracker row linking one Task-ID to its ticket, status TODO. */
function tracker(id: string, file: string): string {
  return `| Task | Status |\n| --- | --- |\n| [${id}](${file}) | \`[ ]\` TODO |\n`;
}

// One path-based ticket (`<name>.{PREFIX}-{NNN}.md`) plus its tracker row.
const PATH_BASED: Record<string, string> = {
  'tasks/ingest/ingest-batch.IB-001.md': ticket('- **Task-ID:** TSK-IB-001'),
  'tasks/ingest/README.md': tracker('TSK-IB-001', 'ingest-batch.IB-001.md'),
};

/** @purpose Build a project tree from `files`, hand the directory to `fn`, clean up. */
function withProject<T>(files: Record<string, string>, fn: (dir: string) => T): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-task-id-'));
  try {
    fs.mkdirSync(path.join(dir, 'tasks'), { recursive: true });
    for (const [rel, content] of Object.entries(files)) {
      const target = path.join(dir, rel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
    }
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * @purpose Extract the data rows of one TSV section, independent of section ordering.
 * @param lines All output lines.
 * @param header Section header line, e.g. `[TASKS]`.
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

/** @purpose Run one SDD script over `dir` and return its output, lines and exit status. */
function run(
  script: string,
  dir: string,
  args: string[] = []
): { out: string; lines: string[]; status: number | null } {
  const proc = spawnSync('bash', [script, ...args, dir], { cwd: dir, encoding: 'utf-8' });
  const out = `${proc.stdout}${proc.stderr}`;
  return { out, lines: out.split('\n'), status: proc.status };
}

describe('scan.sh path-based Task-ID', () => {
  it('discovers a `<name>.{PREFIX}-{NNN}.md` ticket', () => {
    withProject(PATH_BASED, (dir) => {
      const { lines, status } = run(SCAN_SH, dir);

      assert.equal(status, 0);
      assert.deepEqual(sectionRows(lines, '[TASKS]'), [
        'tasks/ingest/ingest-batch.IB-001.md\tTODO\t0\tnone\t0\t-',
      ]);
    });
  });

  it('flags a Task-ID outside the grammar instead of reporting the ticket clean', () => {
    withProject(
      { 'tasks/ingest/ingest-batch.IB-001.md': ticket('- **Task-ID:** TSK-IB-1') },
      (dir) => {
        const { lines } = run(SCAN_SH, dir);

        assert.match(sectionRows(lines, '[TASKS]')[0], /task-id-unparseable/);
        assert.match(sectionRows(lines, '[WARNINGS]').join('\n'), /^WARN\t.*task-id-unparseable/m);
      }
    );
  });

  it('warns rather than reporting a clean snapshot when no tickets exist at all', () => {
    withProject({}, (dir) => {
      const { lines, status } = run(SCAN_SH, dir);

      assert.equal(status, 0);
      assert.match(
        sectionRows(lines, '[WARNINGS]').join('\n'),
        /^WARN\ttasks\/\tno markdown ticket with a Task-ID/m
      );
    });
  });
});

describe('check.sh --task path-based Task-ID', () => {
  it('checks a path-based ticket and reports it clean', () => {
    withProject(PATH_BASED, (dir) => {
      const { lines, status } = run(CHECK_SH, dir, ['--task', 'TSK-IB-001']);

      assert.deepEqual(sectionRows(lines, '[TRACKER_SYNC]'), ['TSK-IB-001\tTODO\tTODO\tYES']);
      assert.equal(status, 0);
    });
  });

  it('still accepts the legacy TSK-NN form', () => {
    withProject(
      {
        'tasks/demo/demo.task-01.md': ticket('- **Task-ID:** TSK-01'),
        'tasks/demo/README.md': tracker('TSK-01', 'demo.task-01.md'),
      },
      (dir) => {
        const { lines, status } = run(CHECK_SH, dir, ['--task', 'TSK-01']);

        assert.deepEqual(sectionRows(lines, '[TRACKER_SYNC]'), ['TSK-01\tTODO\tTODO\tYES']);
        assert.equal(status, 0);
      }
    );
  });

  it('rejects a malformed Task-ID instead of printing findings=0', () => {
    withProject(PATH_BASED, (dir) => {
      const { out, status } = run(CHECK_SH, dir, ['--task', 'TSK-IB-1']);

      assert.equal(status, 4);
      assert.match(out, /BAD_INVOCATION/);
      assert.doesNotMatch(out, /findings=/);
    });
  });

  it('reports a Task-ID absent from the scope instead of reporting it clean', () => {
    withProject(PATH_BASED, (dir) => {
      const { lines, status } = run(CHECK_SH, dir, ['--task', 'TSK-IB-002']);

      assert.deepEqual(sectionRows(lines, '[TASKID]'), [
        'missing\tTSK-IB-002\tno ticket declares this Meta Task-ID',
      ]);
      assert.equal(status, 3);
    });
  });

  it('reports a structural error when the ticket Meta Task-ID cannot be parsed', () => {
    withProject(
      { 'tasks/ingest/ingest-batch.IB-001.md': ticket('- **Task-ID:** TSK-IB-1') },
      (dir) => {
        const { out, status } = run(CHECK_SH, dir, ['--task', 'TSK-IB-001']);

        assert.equal(status, 2);
        assert.match(out, /TICKET_ID_UNREADABLE/);
        assert.match(out, /tasks\/ingest\/ingest-batch\.IB-001\.md/);
      }
    );
  });

  it('refuses to report a clean tree when no tickets were discovered', () => {
    withProject({}, (dir) => {
      const { out, status } = run(CHECK_SH, dir);

      assert.equal(status, 2);
      assert.match(out, /NO_TICKETS_FOUND/);
      assert.doesNotMatch(out, /findings=/);
    });
  });
});
