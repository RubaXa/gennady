// @file: ai/inspector — shared scanning primitives for SKILL.md and *.directive.xml (tag walk, refs, tools).
// The directives/skills are XML-tag-delimited markdown. We target KNOWN PascalCase structural tags; prose
// placeholders like <scope-name> are lowercase and never match, so markdown bodies do not confuse the scanner.

import type { TraceNode } from './model.ts';

const PASCAL_OPEN = /<([A-Z][A-Za-z0-9]*)\b([^>]*?)(\/?)>/;
const TOOL_RE = /\bsdd-(?:state|task|extract|verify|log|sync|check|orient)\b|(?<![\w-])orient\b/g;
const GENNADY_COMMAND_RE = /\bnpx\s+gennady\s+([a-z][\w-]*)\b/g;
const TOOL_CALL_RE = /<ToolCall\b[^>]*>([\s\S]*?)<\/ToolCall>/g;
const TOOL_LITERAL_RE = /<ToolLiteral\b[^>]*>[\s\S]*?<\/ToolLiteral>/g;
// Sub-directive references are written inconsistently: READ_AND_USE_DIRECTIVE("path"), a backticked path,
// or a ~/abs path. Every real reference is anchored under ai/directives/ (verified: no READ_AND_USE_DIRECTIVE
// ref points elsewhere), so match any such .xml token — both *.directive.xml AND formats/*.xml contracts —
// then normalise to the repo-relative ai/directives/... tail.
const DIRECTIVE_REF_RE = /[\w./~-]*ai\/directives\/[\w./-]+\.xml/g;

/** Содержимое тега для показа: срезать HTML-комментарии (но НЕ внутри `code`-спанов, там это literal-контент), dedent, схлопнуть пустые строки, обрезать. */
export function clean(s: string): string {
  // odd parts (index % 2 === 1) are `code spans` — keep them verbatim, strip comments only outside
  const noComments = s
    .split(/(`[^`]+`)/)
    .map((p, i) => (i % 2 ? p : p.replace(/<!--[\s\S]*?-->/g, '')))
    .join('');
  const lines = noComments.replace(/\n{3,}/g, '\n\n').split('\n');
  const indents = lines.filter((l) => l.trim()).map((l) => (/^[ \t]*/.exec(l)?.[0] ?? '').length);
  const min = indents.length ? Math.min(...indents) : 0;
  return lines
    .map((l) => l.slice(min))
    .join('\n')
    .trim();
}

/** Первое предложение: убрать комментарии, схлопнуть пробелы, обрезать. */
export function firstSentence(s: string): string {
  const t = s
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const m = /^(.*?[.!?])(\s|$)/.exec(t);
  return (m ? (m[1] as string) : t).slice(0, 180);
}

/** Атрибуты открывающего тега → map. */
export function parseAttrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of raw.matchAll(/([a-zA-Z_:][\w:-]*)\s*=\s*"([^"]*)"/g))
    out[m[1] as string] = m[2] as string;
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
  /** Полный исходный текст элемента (открывающий тег…закрывающий тег включительно) — для удаления
   *  вложенного элемента из текста родителя без дублирования (см. parse-directive.ts fallback-ветка). */
  raw: string;
}

/**
 * Следующий PascalCase-элемент от позиции `from`; закрытие — первый `</name>` (без вложенности тех же
 * имён — см. отдельный балансный разбор для легитимной вложенности одноимённых тегов, напр. `<Axiom>`
 * в `<Axiom>`, в parse-directive.ts).
 *
 * Кандидат без пары (self-close ИЛИ настоящий `</name>` где-то дальше в строке) — НЕ элемент, а голый
 * псевдо-тег вида `<NAME>`, `<X>`, `<YYYY-MM-DD>`: markdown-прототипы (`research-doc-structure.xml` и
 * т.п.) пишут плейсхолдеры именно в этой форме, и PASCAL_OPEN (одна заглавная буква — валидное имя
 * тега) иначе матчит их как реальные теги. Раньше отсутствие закрывающего тега трактовалось как
 * «до конца строки» — единственный такой плейсхолдер молча проглатывал ВЕСЬ остаток документа как своё
 * тело. Теперь непарный кандидат просто пропускается — сканирование продолжается с символа после его
 * `<`, ища следующий валидный (само-закрытый или парный) тег дальше в тексте.
 */
export function nextElement(s: string, from: number): RawEl | null {
  let searchFrom = from;
  while (searchFrom < s.length) {
    const sub = s.slice(searchFrom);
    const m = PASCAL_OPEN.exec(sub);
    if (!m) return null;
    const name = m[1] as string;
    const start = searchFrom + m.index;
    const openEnd = start + m[0].length;
    if (m[3] === '/')
      return {
        name,
        attrsRaw: m[2] as string,
        inner: '',
        end: openEnd,
        raw: s.slice(start, openEnd),
      };
    const cm = new RegExp('</' + name + '>').exec(s.slice(openEnd));
    if (!cm) {
      searchFrom = start + 1; // непарный псевдо-тег — не элемент, продолжаем поиск дальше
      continue;
    }
    const end = openEnd + cm.index + cm[0].length;
    return {
      name,
      attrsRaw: m[2] as string,
      inner: s.slice(openEnd, openEnd + cm.index),
      end,
      raw: s.slice(start, end),
    };
  }
  return null;
}

/** Все элементы верхнего уровня строки в порядке появления. */
export function topLevelElements(
  inner: string
): { name: string; attrs: Record<string, string>; inner: string; raw: string }[] {
  const out: { name: string; attrs: Record<string, string>; inner: string; raw: string }[] = [];
  let cursor = 0;
  while (cursor < inner.length) {
    const el = nextElement(inner, cursor);
    if (!el) break;
    out.push({ name: el.name, attrs: parseAttrs(el.attrsRaw), inner: el.inner, raw: el.raw });
    cursor = el.end;
  }
  return out;
}

/** Из произвольного текста: ссылки на под-директивы (run) + РЕАЛЬНЫЕ вызовы тулов (dedup). */
export function scanRefsAndTools(text: string): TraceNode[] {
  const out: TraceNode[] = [];
  const refs = new Set<string>();
  for (const m of text.matchAll(DIRECTIVE_REF_RE)) refs.add(normalizeDirectivePath(m[0]));
  for (const ref of refs)
    out.push({ kind: 'run', label: ref, ref, note: 'активировать директиву' });
  // Тул считается ВЫЗОВОМ только на одной из двух исполняемых поверхностей: legacy inline-code
  // (`...`) или типизированный `<ToolCall>...</ToolCall>`. Голое упоминание в прозе («state — from
  // sdd-state») и `<ToolLiteral>` вызовом не являются. ToolCall-команды не обязаны быть обёрнуты в
  // backticks: это намеренно raw command text внутри HTML-like prompt tag.
  // A ToolLiteral is documentation/delegated output even when its example happens to use backticks.
  // Remove it before the legacy inline-code scan so it cannot masquerade as an execution surface.
  const legacyText = text.replace(TOOL_LITERAL_RE, ' ');
  const executableSurfaces = [
    ...Array.from(legacyText.matchAll(/`([^`]+)`/g), (m) => m[1] as string),
    ...Array.from(text.matchAll(TOOL_CALL_RE), (m) => m[1] as string),
  ];
  const tools = new Set<string>();
  for (const surface of executableSurfaces) {
    // A typed ToolCall carries the complete `npx gennady <command>` spelling. Capture its command
    // generically so the inspector does not need another hard-coded edit every time the CLI grows.
    // Mask that full spelling before the legacy shorthand scan: otherwise `sdd-orient` also exposes
    // the substring `orient`, creating two misleading tool nodes for one exact command.
    const withoutFullCommands = surface.replace(GENNADY_COMMAND_RE, (full, command: string) => {
      tools.add(command);
      return ' '.repeat(full.length);
    });
    // Keep legacy inline shorthand (`sdd-task`, `orient`) visible too.
    for (const m of withoutFullCommands.matchAll(TOOL_RE)) tools.add(m[0]);
  }
  for (const t of tools) out.push({ kind: 'tool', label: t });
  return out;
}
