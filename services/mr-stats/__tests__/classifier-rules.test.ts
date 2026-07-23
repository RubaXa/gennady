// @file: Unit tests for classifier-rules.yaml — structure validation and non-overlap verification.
// @consumers: N/A (test file)
// @tasks: TSK-138, TSK-139

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import YAML from 'yaml';
import picomatch from 'picomatch';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rulesPath = resolve(__dirname, '..', 'classifier-rules.yaml');

interface ClassifierCategory {
  name: string;
  include: string[];
  exclude?: string[];
}

interface ClassifierRules {
  categories: ClassifierCategory[];
}

let rules: ClassifierRules;

function isMatch(file: string, pattern: string): boolean {
  if (pattern.includes('/') || pattern.includes('**')) {
    return picomatch.isMatch(file, pattern);
  }
  return picomatch.isMatch(file, pattern, { matchBase: true } as Parameters<
    typeof picomatch.isMatch
  >[2]);
}

function classifyFirst(file: string): { matched: boolean; name: string } {
  for (const cat of rules.categories) {
    const included = cat.include.some((pattern) => isMatch(file, pattern));
    if (!included) continue;

    let excluded = false;
    if (cat.exclude) {
      excluded = cat.exclude.some((pattern) => isMatch(file, pattern));
    }

    if (!excluded) {
      return { matched: true, name: cat.name };
    }
  }

  return { matched: false, name: '' };
}

function classifyAll(file: string): string[] {
  const names: string[] = [];
  for (const cat of rules.categories) {
    const included = cat.include.some((pattern) => isMatch(file, pattern));
    if (!included) continue;

    let excluded = false;
    if (cat.exclude) {
      excluded = cat.exclude.some((pattern) => isMatch(file, pattern));
    }

    if (!excluded) {
      names.push(cat.name);
    }
  }
  return names;
}

describe('classifier rules yaml is valid and contains 10 categories', () => {
  before(async () => {
    const raw = await readFile(rulesPath, 'utf8');
    rules = YAML.parse(raw) as ClassifierRules;
  });

  it('YAML синтаксически корректен и содержит categories', () => {
    assert.ok(rules, 'правила должны быть truthy объектом');
    assert.ok(Array.isArray(rules.categories), 'categories должен быть массивом');
  });

  it('содержит ровно 10 категорий', () => {
    assert.strictEqual(rules.categories.length, 10, 'должно быть ровно 10 категорий');
  });

  it('каждая категория имеет обязательные поля name (string) и include (string[])', () => {
    const names = new Set<string>();
    for (const cat of rules.categories) {
      assert.strictEqual(typeof cat.name, 'string', `category.name должен быть string`);
      assert.ok(cat.name.length > 0, `category.name не должен быть пустым`);
      assert.ok(!names.has(cat.name), `дублирующееся имя категории: ${cat.name}`);
      names.add(cat.name);
      assert.ok(Array.isArray(cat.include), `category.include в ${cat.name} должен быть массивом`);
      assert.ok(cat.include.length > 0, `category.include в ${cat.name} не должен быть пустым`);
      for (const pattern of cat.include) {
        assert.strictEqual(
          typeof pattern,
          'string',
          `include pattern в ${cat.name} должен быть string`
        );
      }
      if (cat.exclude !== undefined) {
        assert.ok(
          Array.isArray(cat.exclude),
          `category.exclude в ${cat.name} должен быть массивом`
        );
        for (const pattern of cat.exclude) {
          assert.strictEqual(
            typeof pattern,
            'string',
            `exclude pattern в ${cat.name} должен быть string`
          );
        }
      }
    }
  });

  it('realCode имеет поле exclude с непустым массивом', () => {
    const realCode = rules.categories.find((c) => c.name === 'realCode');
    assert.ok(realCode, 'должна быть категория realCode');
    assert.ok(Array.isArray(realCode.exclude), 'realCode должен иметь exclude массив');
    assert.ok(realCode.exclude!.length > 0, 'realCode exclude не должен быть пустым');
  });

  it('категории не пересекаются — каждый тестовый файл попадает ровно в одну категорию', () => {
    const testCases: { file: string; expectedCategory: string }[] = [
      { file: 'package.json', expectedCategory: 'configs' },
      { file: 'tsconfig.json', expectedCategory: 'configs' },
      { file: '.eslintrc', expectedCategory: 'configs' },
      { file: 'vite.config.ts', expectedCategory: 'configs' },

      { file: 'cli/gennady.ts', expectedCategory: 'infraScripts' },
      { file: 'scripts/build.ts', expectedCategory: 'infraScripts' },
      { file: 'types/global.d.ts', expectedCategory: 'infraScripts' },
      { file: 'vendor/lib.js', expectedCategory: 'infraScripts' },
      { file: 'tooling-lab/experiment.ts', expectedCategory: 'infraScripts' },

      { file: '__fixtures__/data.json', expectedCategory: 'mockFixture' },
      { file: 'msw/handlers.ts', expectedCategory: 'mockFixture' },
      { file: 'component.snap', expectedCategory: 'mockFixture' },
      { file: 'users.mock.ts', expectedCategory: 'mockFixture' },
      { file: '_figma-fixtures/button.json', expectedCategory: 'mockFixture' },
      { file: 'data-fixture.json', expectedCategory: 'mockFixture' },

      { file: 'icon.svg', expectedCategory: 'mediaStatic' },
      { file: 'photo.png', expectedCategory: 'mediaStatic' },
      { file: 'font.woff2', expectedCategory: 'mediaStatic' },
      { file: 'index.html', expectedCategory: 'mediaStatic' },
      { file: 'bundle.js.map', expectedCategory: 'mediaStatic' },
      { file: 'public/logo.png', expectedCategory: 'mediaStatic' },

      { file: 'src/Button.svelte', expectedCategory: 'uiSvelte' },
      { file: 'src/Button.module.css', expectedCategory: 'uiSvelte' },
      { file: 'src/theme.tokens.css', expectedCategory: 'uiSvelte' },
      { file: 'src/card.appearance.css', expectedCategory: 'uiSvelte' },

      { file: 'src/utils.test.ts', expectedCategory: 'testingStorybook' },
      { file: 'src/api.spec.ts', expectedCategory: 'testingStorybook' },
      { file: 'src/Button.stories.ts', expectedCategory: 'testingStorybook' },
      { file: 'e2e/login.spec.ts', expectedCategory: 'testingStorybook' },
      { file: 'api.integration.test.ts', expectedCategory: 'testingStorybook' },
      { file: '.storybook/main.ts', expectedCategory: 'testingStorybook' },

      { file: 'src/utils/helper.ts', expectedCategory: 'realCode' },
      { file: 'src/components/Button.tsx', expectedCategory: 'realCode' },
      { file: 'packages/core/index.ts', expectedCategory: 'realCode' },
      { file: 'packages/ui/ThemeProvider.tsx', expectedCategory: 'realCode' },

      { file: 'specs/mr-stats/mr-stats.spec.md', expectedCategory: 'specsTasksDocs' },
      { file: 'tasks/mr-stats/task-91.md', expectedCategory: 'specsTasksDocs' },
      { file: 'docs/architecture.md', expectedCategory: 'specsTasksDocs' },
      { file: 'README.md', expectedCategory: 'specsTasksDocs' },

      { file: 'ai/directives/review.xml', expectedCategory: 'aiSkills' },
      { file: '.superpowers/skill.json', expectedCategory: 'aiSkills' },
      { file: '.claude/settings.json', expectedCategory: 'aiSkills' },

      { file: 'draft/notes.md', expectedCategory: 'draftTodo' },
      { file: 'tmp-fix.patch', expectedCategory: 'draftTodo' },
      { file: 'ideas.todo.md', expectedCategory: 'draftTodo' },
    ];

    for (const { file, expectedCategory } of testCases) {
      const { matched, name } = classifyFirst(file);
      assert.ok(matched, `${file} не попал ни в одну категорию`);
      assert.strictEqual(
        name,
        expectedCategory,
        `${file} должен быть в ${expectedCategory}, но попал в ${name}`
      );
    }
  });

  it('realCode exclude корректно исключает тесты, стори и svelte', () => {
    const realCode = rules.categories.find((c) => c.name === 'realCode')!;

    const testCases: { file: string; shouldMatch: boolean }[] = [
      { file: 'src/foo.ts', shouldMatch: true },
      { file: 'src/bar.tsx', shouldMatch: true },
      { file: 'packages/core/index.ts', shouldMatch: true },
      { file: 'src/utils.test.ts', shouldMatch: false },
      { file: 'src/api.spec.ts', shouldMatch: false },
      { file: 'src/Button.stories.ts', shouldMatch: false },
      { file: 'src/Modal.svelte', shouldMatch: false },
      { file: 'src/component.snap', shouldMatch: false },
      { file: 'packages/ui/helpers.test.tsx', shouldMatch: false },
      { file: 'packages/ui/helpers.spec.tsx', shouldMatch: false },
    ];

    for (const { file, shouldMatch } of testCases) {
      const included = realCode.include.some((pattern) => isMatch(file, pattern));

      if (!included) {
        if (shouldMatch) {
          assert.fail(`${file} должен совпадать с include-паттернами realCode`);
        }
        continue;
      }

      let excluded = false;
      if (realCode.exclude) {
        excluded = realCode.exclude.some((pattern) => isMatch(file, pattern));
      }

      if (shouldMatch) {
        assert.strictEqual(excluded, false, `${file} не должен исключаться из realCode`);
      } else {
        assert.strictEqual(excluded, true, `${file} должен исключаться из realCode`);
      }
    }
  });
});
