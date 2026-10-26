// @file: Both-way offline qualification of new transfer tasks before any paid authoring run.
// @spec: AI-SKILLS
// @consumers: transfer controller; eval regression suite

import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { it } from 'node:test';
import {
  AUTHORING_TRANSFER_TASKS,
  getAuthoringTransferCase,
  transferReference,
} from '../authoring-transfer.ts';
import { checkAuthoringBenchmark, getAuthoringCase } from '../authoring-benchmark.ts';
import { captureAuthoringJudgeEvidence } from '../authoring-judge-evidence.ts';
import { checkSpecAuthoringDraft } from '../../../shared/sdd/check.ts';

for (const task of AUTHORING_TRANSFER_TASKS) {
  it(`transfer ${task.id}: valid control passes, broken facts/links/ownership remain red, judge is blind`, () => {
    const root = mkdtempSync(join(tmpdir(), 'gennady-transfer-preflight-'));
    const prior = process.env.GENNADY_AUTHORING_TRANSFER_CASE;
    process.env.GENNADY_AUTHORING_TRANSFER_CASE = task.id;
    try {
      const item = getAuthoringTransferCase(task.layout, task);
      assert.deepEqual(getAuthoringCase(task.layout), item);
      assert.ok(!Object.values(item.files).some((value) => /normalizeToken|Foo__BAR/.test(value)));
      for (const [path, text] of Object.entries(item.files)) {
        if (path.endsWith('.spec.md'))
          assert.deepEqual(checkSpecAuthoringDraft(path, text), [], path);
        mkdirSync(dirname(join(root, path)), { recursive: true });
        writeFileSync(join(root, path), text);
      }
      const target = join(root, item.target);
      mkdirSync(dirname(target), { recursive: true });
      const valid = transferReference(task, 'module');
      writeFileSync(target, valid);
      const quality = checkAuthoringBenchmark(root, task.layout);
      assert.equal(quality.pass, true, JSON.stringify(quality.checks.filter((c) => !c.pass)));
      const evidence = captureAuthoringJudgeEvidence(root, task.layout);
      assert.equal(evidence.complete, true);
      assert.equal(Object.hasOwn(evidence, 'oracle'), false);
      assert.ok(evidence.references?.some((ref) => ref.path === `docs/${task.domain}-contract.md`));
      assert.ok(!JSON.stringify(evidence).includes('baseline'));
      const swapped = valid
        .split('\n')
        .map((line) => {
          if (!line.trim().startsWith('|')) return line;
          const cells = line.split('|').slice(1, -1);
          return cells.length === 2 ? `|${cells[1]}|${cells[0]}|` : line;
        })
        .join('\n');
      writeFileSync(target, swapped);
      assert.equal(
        checkAuthoringBenchmark(root, task.layout).pass,
        true,
        'equivalent reordered example columns'
      );
      writeFileSync(
        target,
        valid.replace(
          `| \`${task.examples[0]![0]}\` | \`${task.examples[0]![1]}\` |`,
          `| \`${task.examples[0]![0]}\` | \`wrong\` |`
        )
      );
      assert.equal(
        checkAuthoringBenchmark(root, task.layout).pass,
        false,
        'wrong concrete outcome'
      );
      writeFileSync(target, valid.replace('pending-operator', 'approved'));
      assert.equal(checkAuthoringBenchmark(root, task.layout).pass, false, 'forged approval');
      const parent = `specs/${task.domain}/${task.domain}.spec.md`;
      const parentText = readFileSync(join(root, parent), 'utf8');
      writeFileSync(join(root, parent), parentText + '\nchanged\n');
      writeFileSync(target, valid);
      assert.equal(checkAuthoringBenchmark(root, task.layout).pass, false, 'mutated parent');
      writeFileSync(join(root, parent), parentText);
      writeFileSync(
        target,
        valid.replace(
          /\[Parent specification\]\([^)]+\)/,
          '[Parent specification](./missing.spec.md)'
        )
      );
      assert.equal(checkAuthoringBenchmark(root, task.layout).pass, false, 'broken relative link');
    } finally {
      if (prior === undefined) delete process.env.GENNADY_AUTHORING_TRANSFER_CASE;
      else process.env.GENNADY_AUTHORING_TRANSFER_CASE = prior;
      rmSync(root, { recursive: true, force: true });
    }
  });
}

it('transfer corpus is exactly six new tasks, two domains, three flat and three nested; default is unchanged', () => {
  assert.equal(AUTHORING_TRANSFER_TASKS.length, 6);
  assert.equal(new Set(AUTHORING_TRANSFER_TASKS.map((t) => t.id)).size, 6);
  assert.equal(new Set(AUTHORING_TRANSFER_TASKS.map((t) => t.domain)).size, 2);
  assert.equal(AUTHORING_TRANSFER_TASKS.filter((t) => t.layout === 'module-flat').length, 3);
  assert.equal(AUTHORING_TRANSFER_TASKS.filter((t) => t.ownership === 'delegate').length, 2);
  assert.equal(process.env.GENNADY_AUTHORING_TRANSFER_CASE, undefined);
  assert.ok(getAuthoringCase('module-flat').brief.includes('normalizeToken'));
});
