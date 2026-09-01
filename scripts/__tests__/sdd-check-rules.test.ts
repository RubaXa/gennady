// @file: Tests for check.sh [RULES] — activated-rule-file section scan and its separate counter.
// @consumers: CI
// @tasks: TSK-96, TSK-97

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

const COMPLETE_RULE = `<Rule>
  <BeliefState><Axiom id="AX_X">x</Axiom></BeliefState>
  <AntiPatterns><Bad>y</Bad></AntiPatterns>
  <VerificationHooks><Hook id="HOOK_X">z</Hook></VerificationHooks>
  <RewardCriteria>✅ ok</RewardCriteria>
</Rule>
`;

/** @purpose Build a minimal SDD project tree, run check.sh in it, clean up. */
function withProject<T>(files: Record<string, string>, fn: (dir: string) => T): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-check-'));
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

/** @purpose Run check.sh and return its [RULES] rows plus the [SUMMARY] key/value pairs. */
function runCheck(
  dir: string,
  args: string[] = []
): { rules: string[]; summary: Record<string, string>; status: number | null } {
  const proc = spawnSync('bash', [CHECK_SH, ...args, dir], { cwd: dir, encoding: 'utf-8' });
  const out = `${proc.stdout}${proc.stderr}`;
  const lines = out.split('\n');

  const start = lines.indexOf('[RULES]');
  const rest = lines.slice(start + 1);
  const next = rest.findIndex((line) => /^\[[A-Z_]+\]$/.test(line));
  const rules = (next === -1 ? rest : rest.slice(0, next)).filter(
    (line) => line.trim() !== '' && !line.startsWith('#')
  );

  const summary: Record<string, string> = {};
  for (const line of lines.slice(lines.indexOf('[SUMMARY]') + 1)) {
    const [key, value] = line.split('=');
    if (value !== undefined) summary[key] = value;
  }

  return { rules, summary, status: proc.status };
}

describe('check.sh [RULES]', () => {
  it('passes a rule file exposing all four checkable sections', () => {
    withProject({ 'ai/directives/coding/good.xml': COMPLETE_RULE }, (dir) => {
      const { rules, summary } = runCheck(dir);

      assert.deepEqual(rules, ['ai/directives/coding/good.xml\t1\t1\t1\t1\tOK\t-']);
      assert.equal(summary.rule_findings, '0');
    });
  });

  it('uses the same canonical category predicate in tree and task modes', () => {
    withProject(
      {
        'ai/directives/architecture/ports-adapters.xml': COMPLETE_RULE,
        'tasks/demo/demo.task-01.md': [
          '## 1. Meta',
          '',
          '- **Task-ID:** TSK-01',
          '- **Status:** [ ] TODO',
          '',
          '## 3. Phases',
          '',
          '- **Rules:**',
          '  - ai/directives/architecture/ports-adapters.xml',
          '',
        ].join('\n'),
      },
      (dir) => {
        const tree = runCheck(dir);
        const task = runCheck(dir, ['--task', 'TSK-01']);

        assert.deepEqual(tree.rules, task.rules);
        assert.match(tree.rules[0], /architecture\/ports-adapters\.xml/);
      }
    );
  });

  it('names every missing section rather than only failing', () => {
    withProject(
      { 'ai/directives/testing/bare.xml': '<Rule><BeliefState>x</BeliefState></Rule>\n' },
      (dir) => {
        const { rules, summary, status } = runCheck(dir);

        assert.match(rules[0], /INCOMPLETE\tAntiPatterns,VerificationHooks,RewardCriteria$/);
        assert.equal(summary.rule_findings, '1');
        assert.equal(status, 3);
      }
    );
  });

  it('exempts *.directive.xml — protocols are not rule files', () => {
    withProject(
      {
        'ai/directives/coding/proto.directive.xml': '<P><BeliefState>x</BeliefState></P>\n',
        'ai/directives/coding/good.xml': COMPLETE_RULE,
      },
      (dir) => {
        const { rules } = runCheck(dir);

        assert.equal(rules.length, 1, rules.join('\n'));
        assert.match(rules[0], /good\.xml/);
      }
    );
  });

  it('ignores categories outside the cascade', () => {
    withProject({ 'ai/directives/perf-auditor/rules/x.xml': '<R>nothing</R>\n' }, (dir) => {
      const { rules, summary } = runCheck(dir);

      assert.deepEqual(rules, []);
      assert.equal(summary.rule_findings, '0');
    });
  });

  it('counts rule findings apart from task findings — shared rules are not a task defect', () => {
    withProject(
      { 'ai/directives/testing/bare.xml': '<Rule><BeliefState>x</BeliefState></Rule>\n' },
      (dir) => {
        const { summary } = runCheck(dir);

        assert.equal(summary.findings, '0');
        assert.equal(summary.rule_findings, '1');
      }
    );
  });

  it('task mode scans only the rules that ticket cites', () => {
    withProject(
      {
        'ai/directives/coding/good.xml': COMPLETE_RULE,
        'ai/directives/testing/bare.xml': '<Rule><BeliefState>x</BeliefState></Rule>\n',
        'tasks/demo/demo.task-01.md': [
          '## 1. Meta',
          '',
          '- **Task-ID:** TSK-01',
          '- **Status:** [ ] TODO',
          '',
          '## 3. Phases',
          '',
          '- **Rules:**',
          '  - ai/directives/coding/good.xml',
          '',
        ].join('\n'),
      },
      (dir) => {
        const { rules } = runCheck(dir, ['--task', 'TSK-01']);

        assert.equal(rules.length, 1, rules.join('\n'));
        assert.match(rules[0], /good\.xml\t1\t1\t1\t1\tOK/);
      }
    );
  });

  it('task mode ignores cited SDD protocols outside rule cascade categories', () => {
    withProject(
      {
        'ai/directives/sdd/phase-execution-protocol.xml':
          '<Protocol><BeliefState>x</BeliefState></Protocol>\n',
        'ai/directives/coding/good.xml': COMPLETE_RULE,
        'tasks/demo/demo.task-01.md': [
          '## 1. Meta',
          '',
          '- **Task-ID:** TSK-01',
          '- **Status:** [ ] TODO',
          '',
          '## 3. Phases',
          '',
          '- **Rules:**',
          '  - ai/directives/coding/good.xml',
          '- **Target Files:**',
          '  - ai/directives/sdd/phase-execution-protocol.xml',
          '',
        ].join('\n'),
      },
      (dir) => {
        const { rules, summary } = runCheck(dir, ['--task', 'TSK-01']);

        assert.equal(rules.length, 1, rules.join('\n'));
        assert.match(rules[0], /good\.xml/);
        assert.equal(summary.rule_findings, '0');
      }
    );
  });
});
