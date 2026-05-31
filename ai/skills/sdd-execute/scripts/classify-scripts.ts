#!/usr/bin/env -S node --import tsx
// @file: Heuristic npm script classifier — reads package.json, outputs discovered commands as JSON.
// @consumers: verify.sh
// @tasks: TSK-55
//
// Usage:
//   classify-scripts.ts [--json] [project-root]
//
// Output:
//   --json (default):  JSON array [{name, body, classes}]
//   no flag:           human-readable summary

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type ScriptClass = 'typecheck' | 'gennady' | 'lint' | 'test' | 'format' | 'umbrella' | 'unknown';

interface ScriptEntry {
  name: string;
  body: string;
  classes: ScriptClass[];
}

interface ClassifiedProject {
  scripts: ScriptEntry[];
  selected: Partial<Record<ScriptClass, string>>;
}

function hasCategory(body: string, category: string): boolean {
  const patterns: Record<string, RegExp> = {
    tsc: /\b(tsc|tsgo)\b/,
    lint: /\b(eslint|mail-core-lint\b|biome check\b|standard\b)\b/,
    test: /\b(jest|vitest|playwright test|mocha\b|--test\b)\b/,
    format: /\b(prettier|biome format)\b/,
  };
  return patterns[category]?.test(body) ?? false;
}

function classify(name: string, body: string): ScriptClass[] {
  const isUmbrellaName = /^(check|ci-check|check:all|verify)$/.test(name);
  if (isUmbrellaName && body.length > 0) return ['umbrella'];

  const tscCount = hasCategory(body, 'tsc') ? 1 : 0;
  const lintCount = hasCategory(body, 'lint') ? 1 : 0;
  const testCount = hasCategory(body, 'test') ? 1 : 0;
  const hasGennady = /\bgennady\b/.test(body) || /lint:contracts/.test(body);
  const hasChain = body.includes('&&');
  const hasParallel = /[&]/.test(body) && /;\s*wait/.test(body);

  if (tscCount + lintCount + testCount >= 2 && (hasChain || hasParallel)) return ['umbrella'];
  if (hasGennady && hasChain) return ['umbrella'];

  const classes: ScriptClass[] = [];
  if (hasGennady) classes.push('gennady');

  const typecheckName = /^(type-?check|typecheck|typecheck:|tsc)$/.test(name);
  const typecheckBody = /\b(tsc|tsgo)\b/.test(body) && /--noEmit/.test(body);
  if ((typecheckName || typecheckBody || name === 'lint:ts') && !name.startsWith('build:') && !name.startsWith('prepublish'))
    classes.push('typecheck');

  const lintName = /^(lint|lint:all|lint-check|eslint|mc:eslint|stylist:lint|stylelint)$/.test(name);
  const lintBody = hasCategory(body, 'lint');
  if ((lintName || lintBody) && !name.startsWith('lint:fix') && !name.startsWith('lint:contracts') && !name.startsWith('lint:ts') && !hasGennady)
    classes.push('lint');

  const testName = /^(test|test:|mc:test|mc:jest|jest)$/.test(name);
  const testBody = hasCategory(body, 'test') || /\bnode\b.*--test\b/.test(body);
  if (testName || (testBody && !name.startsWith('build:') && !name.startsWith('prepublish')))
    classes.push('test');

  const formatName = /^format(:?check)?$/.test(name);
  const formatBody = hasCategory(body, 'format');
  if (formatName || formatBody) classes.push('format');

  return classes.length > 0 ? classes : ['unknown'];
}

function selectBest(entries: ScriptEntry[], cls: ScriptClass): string | undefined {
  const candidates = entries.filter((e) => e.classes.includes(cls));
  if (candidates.length === 0) return undefined;

  // Prefer shorter, more specific names
  const priority: Record<string, number> = {
    typecheck: { 'type-check': 10, typecheck: 10, tsc: 5 },
    gennady: { 'lint:contracts': 10 },
    lint: { lint: 10, eslint: 7, 'lint:all': 5, 'lint-check': 5, 'mc:eslint': 3 },
    test: { test: 10, 'test:unit': 7, 'mc:test': 5, 'mc:jest': 3, jest: 3 },
    format: { 'format:check': 10, format: 5 },
  };

  const rank = (name: string) => priority[cls]?.[name] ?? 1;
  candidates.sort((a, b) => rank(b.name) - rank(a.name));
  return candidates[0]?.name;
}

// --- Main ---
const root = process.argv.slice(2).find((a) => !a.startsWith('-')) || process.cwd();
const pkgPath = resolve(root, 'package.json');

let pkg: { scripts?: Record<string, string> };
try {
  pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
} catch {
  console.error(`[classify-scripts] package.json not found at ${pkgPath}`);
  process.exit(1);
}

const entries: ScriptEntry[] = Object.entries(pkg.scripts ?? {}).map(([name, body]) => ({
  name,
  body,
  classes: classify(name, body),
}));

const selected: Partial<Record<ScriptClass, string>> = {};
for (const cls of ['typecheck', 'gennady', 'lint', 'test', 'format'] as ScriptClass[]) {
  const best = selectBest(entries, cls);
  if (best) selected[cls] = best;
}

const result: ClassifiedProject = { scripts: entries, selected };
console.log(JSON.stringify(result));
