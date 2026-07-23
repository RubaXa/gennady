// @file: File classifier — loads YAML rules and classifies files into 10 categories (first-match wins).
// @consumers: mr-stats.cmd
// @tasks: TSK-139

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '#logger';
import type { ClassifierRules, ClassifierCategory } from './mr-stats.types.ts';

/** @purpose Fixed path to the classifier rules YAML file relative to project root. */
const RULES_PATH = resolve(dirname(fileURLToPath(import.meta.url)), 'classifier-rules.yaml');

/**
 * @purpose Parse classifier-rules.yaml content into ClassifierRules.
 * @param raw Raw YAML text.
 * @throws {Error} When YAML cannot be parsed.
 * @returns ClassifierRules with declared categories.
 */
// #region START_MINIMAL_YAML_PARSER
function parseClassifierYaml(raw: string): ClassifierRules {
  const lines = raw.split('\n');
  const categories: ClassifierCategory[] = [];
  let currentCategory: Partial<ClassifierCategory> | null = null;
  let currentArray: 'include' | 'exclude' | null = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*$/, '').trimEnd();
    if (!line.trim()) continue;

    const indent = line.search(/\S/);
    const trimmed = line.trim();

    if (indent === 0 && trimmed.startsWith('categories:')) {
      continue;
    }

    if (indent === 2 && trimmed.startsWith('- name:')) {
      if (currentCategory?.name) {
        categories.push(finalizeCategory(currentCategory));
      }
      let catName = trimmed.slice(7).trim();
      if (
        (catName.startsWith("'") && catName.endsWith("'")) ||
        (catName.startsWith('"') && catName.endsWith('"'))
      ) {
        catName = catName.slice(1, -1);
      }
      currentCategory = { name: catName };
      currentArray = null;
      continue;
    }

    if (indent === 4 && currentCategory?.name) {
      if (trimmed.startsWith('include:')) {
        currentCategory.include = [];
        currentArray = 'include';

        const inline = extractInlineList(trimmed.slice(8));
        if (inline) {
          currentCategory.include = inline;
          currentArray = null;
        }
        continue;
      }

      if (trimmed.startsWith('exclude:')) {
        currentCategory.exclude = [];
        currentArray = 'exclude';

        const inline = extractInlineList(trimmed.slice(8));
        if (inline) {
          currentCategory.exclude = inline;
          currentArray = null;
        }
        continue;
      }
    }

    if (indent === 6 && trimmed.startsWith('- ') && currentCategory?.name && currentArray) {
      const value = trimmed.slice(2).trim();
      const cleanValue =
        (value.startsWith("'") && value.endsWith("'")) ||
        (value.startsWith('"') && value.endsWith('"'))
          ? value.slice(1, -1)
          : value;
      (currentCategory[currentArray] as string[]).push(cleanValue);
      continue;
    }
  }

  if (currentCategory?.name) {
    categories.push(finalizeCategory(currentCategory));
  }

  if (categories.length === 0) {
    throw new Error('classifier-rules.yaml: missing or invalid "categories" array');
  }

  return { categories };
}

function finalizeCategory(cat: Partial<ClassifierCategory>): ClassifierCategory {
  if (!cat.name) throw new Error('classifier-rules.yaml: category without name');
  if (!Array.isArray(cat.include) || cat.include.length === 0) {
    throw new Error(`classifier-rules.yaml: category "${cat.name}" has no include patterns`);
  }
  return {
    name: cat.name,
    include: cat.include,
    exclude: cat.exclude?.length ? cat.exclude : undefined,
  };
}

function extractInlineList(rest: string): string[] | null {
  const trimmed = rest.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const inner = trimmed.slice(1, -1);
    return inner
      .split(',')
      .map((s) => {
        const t = s.trim();
        return (t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"'))
          ? t.slice(1, -1)
          : t;
      })
      .filter(Boolean);
  }
  return null;
}
// #endregion END_MINIMAL_YAML_PARSER

/**
 * @purpose Load classifier rules from classifier-rules.yaml.
 * @param [path] Override path for testing.
 * @throws {Error} When file is missing or has invalid YAML.
 * @returns Parsed ClassifierRules.
 */
export function loadClassifierRules(path: string = RULES_PATH): ClassifierRules {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (cause) {
    const error = new Error(`classifier-rules.yaml: file not found at ${path}`, { cause });
    logger.error(`[loadClassifierRules] [reading → failed]`, { error });
    throw error;
  }

  try {
    return parseClassifierYaml(raw);
  } catch (cause) {
    const error = new Error(`classifier-rules.yaml: ${(cause as Error).message}`, { cause });
    logger.error(`[loadClassifierRules] [parsing → failed]`, { error });
    throw error;
  }
}

/**
 * @purpose Check whether a file path matches a glob pattern.
 * @param filePath Repository-relative file path.
 * @param pattern Glob pattern (e.g. "src/**​/*.ts", "*.json").
 * @returns True when the file matches.
 */
// #region START_GLOB_MATCHING
function matchesGlob(filePath: string, pattern: string): boolean {
  const path = filePath.replace(/\\/g, '/');
  let pat = pattern.replace(/\\/g, '/');

  // Bare extension/name patterns (no slash) → match in any directory
  if (!pat.includes('/') && !pat.startsWith('**')) {
    pat = '**/' + pat;
  }
  // Trailing ** without trailing * → match any file under directory
  if (pat.endsWith('**')) {
    pat = pat + '/*';
  }

  const regexStr = globToRegex(pat);
  const regex = new RegExp(`^${regexStr}$`);
  return regex.test(path);
}

function globToRegex(pattern: string): string {
  let result = '';
  let i = 0;

  while (i < pattern.length) {
    const ch = pattern[i];

    if (ch === '*' && pattern[i + 1] === '*') {
      if (pattern[i + 2] === '/' || i + 2 === pattern.length) {
        result += '(?:.*/)?';
        i += pattern[i + 2] === '/' ? 3 : 2;
        continue;
      }
    }

    if (ch === '*') {
      result += '[^/]*';
      i += 1;
      continue;
    }

    if (ch === '?') {
      result += '[^/]';
      i += 1;
      continue;
    }

    if ('.+^${}()|[]\\'.includes(ch)) {
      result += '\\' + ch;
    } else {
      result += ch;
    }
    i += 1;
  }

  return result;
}

// #endregion END_GLOB_MATCHING

/**
 * @purpose Classify files into categories using first-match-wins rule order.
 * @invariant Every file appears in exactly one category; union of all values equals input files.
 * @param files Repository-relative file paths.
 * @param rules Classifier rules with categories in priority order.
 * @returns Map from category name to file array.
 */
export function classify(files: string[], rules: ClassifierRules): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const cat of rules.categories) {
    result[cat.name] = [];
  }

  const unclassified = new Set(files);

  // #region START_FIRST_MATCH_CLASSIFICATION — categories ordered by priority; first include+exclude match wins
  for (const cat of rules.categories) {
    const matched: string[] = [];
    for (const file of unclassified) {
      const included = cat.include.some((pattern) => matchesGlob(file, pattern));
      if (!included) continue;

      const excluded = cat.exclude?.some((pattern) => matchesGlob(file, pattern)) ?? false;
      if (excluded) continue;

      matched.push(file);
    }

    for (const file of matched) {
      result[cat.name].push(file);
      unclassified.delete(file);
    }
  }
  // #endregion END_FIRST_MATCH_CLASSIFICATION

  if (unclassified.size > 0) {
    logger.warn(
      `[classify] [classified → unclassified-remaining] ${unclassified.size} file(s) not matched: ${[...unclassified].join(', ')}`
    );
  }

  return result;
}
