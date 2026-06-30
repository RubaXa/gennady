// @file: ai/inspector — shared scanning primitives for SKILL.md and *.directive.xml (tag walk, refs, tools).
// The directives/skills are XML-tag-delimited markdown. We target KNOWN PascalCase structural tags; prose
// placeholders like <scope-name> are lowercase and never match, so markdown bodies do not confuse the scanner.

import type { TraceNode } from './model.ts';

const PASCAL_OPEN = /<([A-Z][A-Za-z0-9]*)\b([^>]*?)(\/?)>/;
const TOOL_RE = /\bsdd-(?:state|task|extract|verify|log|sync|check)\b|\borient\b/g;
// Sub-directive references are written inconsistently: READ_AND_USE_DIRECTIVE("path"), a backticked path,
// or a ~/abs path. Match any *.directive.xml token, then normalise to the repo-relative ai/directives/... tail.
const DIRECTIVE_REF_RE = /[\w./~-]*\.directive\.xml/g;

/** Содержимое тега для показа: срезать HTML-комментарии (но НЕ внутри `code`-спанов, там это literal-контент), dedent, схлопнуть пустые строки, обрезать. */
export function clean(s: string): string {
  // odd parts (index % 2 === 1) are `code spans` — keep them verbatim, strip comments only outside
  const noComments = s.split(/(`[^`]+`)/).map((p, i) => (i % 2 ? p : p.replace(/<!--[\s\S]*?-->/g, ''))).join('');
  const lines = noComments.replace(/\n{3,}/g, '\n\n').split('\n');
  const indents = lines.filter((l) => l.trim()).map((l) => (/^[ \t]*/.exec(l)?.[0] ?? '').length);
  const min = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(min)).join('\n').trim();
}

/** Первое предложение: убрать комментарии, схлопнуть пробелы, обрезать. */
export function firstSentence(s: string): string {
  const t = s.replace(/<!--[\s\S]*?-->/g, ' ').replace(/\s+/g, ' ').trim();
  const m = /^(.*?[.!?])(\s|$)/.exec(t);
  return (m ? (m[1] as string) : t).slice(0, 180);
}

/** Атрибуты открывающего тега → map. */
export function parseAttrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of raw.matchAll(/([a-zA-Z_:][\w:-]*)\s*=\s*"([^"]*)"/g)) out[m[1] as string] = m[2] as string;
  return out;
}

/** Нормализовать путь директивы к репо-относительному (ai/directives/...). */
export function normalizeDirectivePath(raw: string): string {
  const i = raw.indexOf('ai/directives/');
  return i >= 0 ? raw.slice(i) : raw;
}

export interface RawEl {
  name: string;
  attrsRaw: string;
  inner: string;
  end: number;
}

/** Следующий PascalCase-элемент от позиции `from`; закрытие — первый `</name>` (без вложенности тех же имён). */
export function nextElement(s: string, from: number): RawEl | null {
  const sub = s.slice(from);
  const m = PASCAL_OPEN.exec(sub);
  if (!m) return null;
  const name = m[1] as string;
  const openEnd = from + m.index + m[0].length;
  if (m[3] === '/') return { name, attrsRaw: m[2] as string, inner: '', end: openEnd };
  const cm = new RegExp('</' + name + '>').exec(s.slice(openEnd));
  if (!cm) return { name, attrsRaw: m[2] as string, inner: s.slice(openEnd), end: s.length };
  return { name, attrsRaw: m[2] as string, inner: s.slice(openEnd, openEnd + cm.index), end: openEnd + cm.index + cm[0].length };
}

/** Все элементы верхнего уровня строки в порядке появления. */
export function topLevelElements(inner: string): { name: string; attrs: Record<string, string>; inner: string }[] {
  const out: { name: string; attrs: Record<string, string>; inner: string }[] = [];
  let cursor = 0;
  while (cursor < inner.length) {
    const el = nextElement(inner, cursor);
    if (!el) break;
    out.push({ name: el.name, attrs: parseAttrs(el.attrsRaw), inner: el.inner });
    cursor = el.end;
  }
  return out;
}

/** Из произвольного текста: ссылки на под-директивы (run) + РЕАЛЬНЫЕ вызовы тулов (dedup). */
export function scanRefsAndTools(text: string): TraceNode[] {
  const out: TraceNode[] = [];
  const refs = new Set<string>();
  for (const m of text.matchAll(DIRECTIVE_REF_RE)) refs.add(normalizeDirectivePath(m[0]));
  for (const ref of refs) out.push({ kind: 'run', label: ref, ref, note: 'активировать директиву' });
  // Тул считается ВЫЗОВОМ только внутри inline-code (`...`) — команды пишут в обратных кавычках;
  // голое упоминание в прозе («state — from sdd-state») вызовом не является и не попадает в дерево.
  const code = Array.from(text.matchAll(/`([^`]+)`/g), (m) => m[1] as string).join('\n');
  const tools = new Set<string>();
  for (const m of code.matchAll(TOOL_RE)) tools.add(m[0]);
  for (const t of tools) out.push({ kind: 'tool', label: t });
  return out;
}
