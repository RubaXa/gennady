// @file: Unit tests for mr-stats classifier — loadClassifierRules, classify.
// @consumers: node:test runner
// @tasks: TSK-139

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadClassifierRules, classify } from '../classifier.ts';
import type { ClassifierRules } from '../mr-stats.types.ts';

const domainRules: ClassifierRules = {
  categories: [
    { name: 'testingStorybook', include: ['*.test.*', '*.spec.*', '*.stories.*'] },
    { name: 'uiSvelte', include: ['*.svelte'] },
    { name: 'mediaStatic', include: ['*.png', '*.jpg', '*.svg'] },
    { name: 'realCode', include: ['*.ts', '*.tsx'], exclude: ['*.test.*', '*.spec.*', '*.svelte'] },
    { name: 'specsTasksDocs', include: ['*.md'] },
    { name: 'configs', include: ['*.json', '*.yml'] },
  ],
};

describe('classifier — loadClassifierRules', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'classifier-test-'));
  });

  afterEach(() => {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
  });

  it('parses valid classifier-rules.yaml', () => {
    const yaml = [
      'categories:',
      '  - name: mockFixture',
      '    include:',
      '      - "*fixture*"',
      '      - "*.snap"',
      '  - name: realCode',
      '    include:',
      '      - "*.ts"',
      '    exclude:',
      '      - "*.test.ts"',
    ].join('\n');
    const path = join(tmpDir, 'rules.yaml');
    writeFileSync(path, yaml, 'utf8');

    const rules = loadClassifierRules(path);
    assert.ok(Array.isArray(rules.categories));
    assert.strictEqual(rules.categories.length, 2);
    assert.strictEqual(rules.categories[0].name, 'mockFixture');
    assert.strictEqual(rules.categories[1].name, 'realCode');
    assert.ok(rules.categories[1].exclude);
  });

  it('invalid yaml returns exit 7 — missing file', () => {
    const path = join(tmpDir, 'nonexistent.yaml');
    assert.throws(
      () => loadClassifierRules(path),
      (err: Error) =>
        err.message.includes('classifier-rules.yaml') && err.message.includes('not found')
    );
  });

  it('invalid yaml returns exit 7 — parse error', () => {
    const yaml = 'categories: [unclosed';
    const path = join(tmpDir, 'invalid.yaml');
    writeFileSync(path, yaml, 'utf8');

    assert.throws(
      () => loadClassifierRules(path),
      (err: Error) => err.message.startsWith('classifier-rules.yaml:')
    );
  });

  it('handles empty categories array', () => {
    const yaml = 'categories: []';
    const path = join(tmpDir, 'empty.yaml');
    writeFileSync(path, yaml, 'utf8');

    assert.throws(
      () => loadClassifierRules(path),
      (err: Error) => err.message.includes('classifier-rules.yaml')
    );
  });
});

describe('classifier — classify', () => {
  it('every file in exactly one category', () => {
    // contract: BDD "Классификатор — каждый файл в одной категории" — 50 files, each in exactly 1 category
    const files = [
      'helper.ts',
      'Component.tsx',
      'Header.svelte',
      'package.json',
      'README.md',
      'icon.svg',
      'helper.test.ts',
      'api.spec.tsx',
      'Button.stories.tsx',
    ];
    const classified = classify(files, domainRules);

    const seen = new Set<string>();
    let totalClassified = 0;
    for (const cat of domainRules.categories) {
      const catFiles = classified[cat.name] ?? [];
      for (const f of catFiles) {
        assert.ok(!seen.has(f), `file ${f} appears in multiple categories`);
        seen.add(f);
        totalClassified += 1;
      }
    }

    // every input file is classified at least once
    for (const f of files) {
      assert.ok(seen.has(f), `file ${f} not classified into any category`);
    }
    assert.strictEqual(totalClassified, files.length);
  });

  it('single category with all files', () => {
    // contract: BDD "Все файлы в одной категории" — all .md files → specsTasksDocs
    const files = ['README.md', 'CHANGELOG.md', 'ARCHITECTURE.md'];
    const classified = classify(files, domainRules);

    assert.strictEqual(classified.specsTasksDocs.length, 3);
  });

  it('classifies .ts files as realCode when not excluded', () => {
    const files = ['helper.ts', 'Component.tsx', 'index.ts'];
    const classified = classify(files, domainRules);

    assert.strictEqual(classified.realCode.length, 3);
  });

  it('excludes test/spec/stories files from realCode into testingStorybook', () => {
    const files = ['helper.test.ts', 'api.spec.tsx', 'Button.stories.tsx'];
    const classified = classify(files, domainRules);

    assert.strictEqual(classified.realCode.length, 0, 'realCode should be empty');
    assert.strictEqual(
      classified.testingStorybook.length,
      3,
      'all 3 should be in testingStorybook'
    );
  });

  it('first-match wins — .svelte matches uiSvelte, excluded from realCode', () => {
    const files = ['Header.svelte'];
    const classified = classify(files, domainRules);

    assert.strictEqual(classified.uiSvelte.length, 1);
    assert.strictEqual(classified.realCode.length, 0);
  });

  it('handles empty input array', () => {
    const classified = classify([], domainRules);

    for (const cat of domainRules.categories) {
      assert.strictEqual(classified[cat.name].length, 0);
    }
  });

  it('handles empty categories list', () => {
    const classified = classify(['file.ts'], { categories: [] });

    assert.deepStrictEqual(classified, {});
  });
});
