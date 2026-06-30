// @file: ai/inspector — build the trace model from real skills + directives → web/trace.json.
// Run: npx tsx ai/inspector/generate.ts

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSkill } from './core/parse-skill.ts';
import { resolveTree, type DirectiveReader } from './core/resolve.ts';
import type { TraceNode } from './core/model.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const skillsDir = join(repoRoot, 'ai', 'skills');
const gennady = join(repoRoot, 'cli', 'gennady.ts');
const outFile = join(here, 'web', 'trace.json');

/** Читатель директив: ref репо-относительный → содержимое или null. */
const read: DirectiveReader = (ref) => {
  const p = resolve(repoRoot, ref);
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
};

/** Кэш `--help` по команде — каждая запускается один раз. */
const helpCache = new Map<string, string>();
function toolHelp(cmd: string): string {
  const cached = helpCache.get(cmd);
  if (cached !== undefined) return cached;
  let out: string;
  try {
    out = execSync(`npx tsx ${JSON.stringify(gennady)} ${cmd} --help`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    out = `(нет вывода --help для ${cmd})`;
  }
  if (!out) out = `(пустой --help для ${cmd})`;
  helpCache.set(cmd, out);
  return out;
}

/** Номер строки первого вхождения токена (1-based), либо null. */
function lineOf(content: string, token: string | null): number | null {
  if (!token) return null;
  const i = content.indexOf(token);
  return i < 0 ? null : content.slice(0, i).split('\n').length;
}

/** Токен, по которому ищем строку узла в исходном файле. */
function tokenFor(node: TraceNode): string | null {
  switch (node.kind) {
    case 'axiom':
    case 'halt':
      return node.label; // AX_* / H_*
    case 'step':
      return node.attrs?.id ? `id="${node.attrs.id}"` : node.label;
    case 'switch':
      return 'LogicSwitch';
    case 'skill':
      return '<SddSkill';
    case 'section':
    case 'directive':
      return node.label.replace(/[<>]/g, '').split(/\s/)[0] ?? null; // tag name
    default:
      return null;
  }
}

/** Проставить loc {file,line} каждому узлу. Файл переключается при входе в директиву/скил (по ref). */
function attachLoc(node: TraceNode, file: string, content: string): void {
  let f = file;
  let c = content;
  if ((node.kind === 'directive' || node.kind === 'skill') && node.ref) {
    const got = read(node.ref);
    if (got != null) { f = node.ref; c = got; }
  }
  const ln = lineOf(c, tokenFor(node));
  if (ln) node.loc = { file: f, line: ln };
  (node.children ?? []).forEach((ch) => attachLoc(ch, f, c));
}

/** Пометить tool-узлы: это bash-команда gennady — как зовут + что вернёт (--help). */
function annotateTools(node: TraceNode): void {
  if (node.kind === 'tool') {
    node.note = `bash · npx gennady ${node.label}`;
    node.detail = `$ npx gennady ${node.label}\n\n${toolHelp(node.label)}`;
  }
  (node.children ?? []).forEach(annotateTools);
}

/** SDD-скилы: SKILL.md с корнем <SddSkill> (не-SDD скилы — не наш предмет). */
function skillFiles(): string[] {
  return readdirSync(skillsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => join(skillsDir, d.name, 'SKILL.md'))
    .filter((p) => existsSync(p) && readFileSync(p, 'utf8').includes('<SddSkill'));
}

const skills: TraceNode[] = [];
for (const file of skillFiles()) {
  const rel = file.slice(repoRoot.length + 1);
  const tree = parseSkill(rel, readFileSync(file, 'utf8'));
  resolveTree(tree, read);
  annotateTools(tree);
  attachLoc(tree, rel, readFileSync(file, 'utf8'));
  skills.push(tree);
}

if (!existsSync(dirname(outFile))) mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify({ repoRoot, skills }, null, 2), 'utf8');
console.log(`[inspector] ${skills.length} skill(s) → ${outFile.slice(repoRoot.length + 1)}`);
