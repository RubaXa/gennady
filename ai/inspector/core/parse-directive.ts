// @file: ai/inspector — parse a rendered SDD v2 directive XML into a TraceNode tree.

import type { TraceNode } from './model.ts';
import { clean, firstSentence, nextElement, parseAttrs, scanRefsAndTools, topLevelElements } from './scan.ts';

/** BeliefState → узлы-аксиомы (id + первое предложение + полное тело). */
function parseAxioms(inner: string): TraceNode[] {
  const out: TraceNode[] = [];
  for (const m of inner.matchAll(/<Axiom\b([^>]*)>([\s\S]*?)<\/Axiom>/g)) {
    const attrs = parseAttrs(m[1] as string);
    const body = (m[2] as string).trim();
    out.push({ kind: 'axiom', label: attrs.id ?? 'AX_?', note: firstSentence(body), detail: body });
  }
  return out;
}

/** HaltConditions → узлы-halt с триггером из таблицы (| `H_X` | trigger |), fallback на голые токены. */
function parseHalts(inner: string): TraceNode[] {
  const seen = new Set<string>();
  const out: TraceNode[] = [];
  for (const m of inner.matchAll(/\|\s*`?(H_[A-Z0-9_]+)`?\s*\|\s*([^|\n]*?)\s*\|/g)) {
    const id = m[1] as string;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ kind: 'halt', label: id, note: firstSentence(m[2] as string) });
  }
  for (const m of inner.matchAll(/H_[A-Z][A-Z0-9_]*/g)) {
    if (seen.has(m[0])) continue;
    seen.add(m[0]);
    out.push({ kind: 'halt', label: m[0] });
  }
  return out;
}

/** Тело Action → структурный <LogicSwitch> (если есть) + тулы/порталы; метка только при РЕАЛЬНОМ текстовом ветвлении. */
function parseAction(inner: string): TraceNode[] {
  const out: TraceNode[] = [];
  const sw = /<LogicSwitch\b([^>]*)>([\s\S]*?)<\/LogicSwitch>/.exec(inner);
  let rest = inner;
  if (sw) {
    out.push(parseLogicSwitch(sw[2] as string, parseAttrs(sw[1] as string).on));
    rest = inner.replace(sw[0], ' '); // не дублировать ссылки свича как плоские run
  }
  out.push(...scanRefsAndTools(rest));
  // помечаем ТОЛЬКО реальное текстовое ветвление: мульти-цель (≥2 ссылки на директивы) или строки «условие → действие».
  // голая ссылка «evaluate the LOGIC_SWITCH below» — НЕ ветвление, метку не ставим.
  const refs = (rest.match(/\.directive\.xml/g) ?? []).length;
  const branchLine = /\b(WHEN|PASS|FAIL|DONE|BLOCKED|else|otherwise)\b[^\n]*(?:->|→)/.test(rest);
  if (!sw && (refs >= 2 || branchLine)) {
    out.push({ kind: 'unparsed', label: 'ветвление текстом', note: 'условие задано текстом, не структурным <LogicSwitch> — ветки не разобраны' });
  }
  return out;
}

/** Структурный <LogicSwitch> → switch-узел с ветками WHEN/DEFAULT (условие → переход; READ_AND_USE → run). */
function parseLogicSwitch(inner: string, onAttr?: string): TraceNode {
  const header = /LOGIC_SWITCH\s*\(([^)]*)\)/.exec(inner);
  const branches: TraceNode[] = [];
  for (const m of inner.matchAll(/-\s*(WHEN|DEFAULT)\b([\s\S]*?)(?=\n\s*-\s*(?:WHEN|DEFAULT)\b|\n```|$)/g)) {
    const kind = m[1] as string;
    const rest = m[2] as string;
    const ai = rest.indexOf('->');
    const cond = ai >= 0 ? rest.slice(0, ai) : rest;
    const action = ai >= 0 ? rest.slice(ai + 2) : '';
    const kids = scanRefsAndTools(action);
    if (!kids.length && action.trim()) kids.push({ kind: 'text', label: '→ ' + firstSentence(clean(action)) });
    branches.push({
      kind: 'branch',
      label: kind === 'DEFAULT' ? 'DEFAULT' : firstSentence(clean(cond)),
      detail: clean(rest),
      children: kids.length ? kids : undefined,
    });
  }
  const on = (onAttr || (header ? (header[1] as string) : '') || '').trim().replace(/^on\s+/i, '');
  return { kind: 'switch', label: '<LogicSwitch>', note: on ? `по: ${on}` : 'развилка маршрутизации', children: branches };
}

/** ExecutionPlan → шаги; внутри — Goal/Action (+ их содержимое). */
function parseSteps(inner: string): TraceNode[] {
  const steps: TraceNode[] = [];
  for (const m of inner.matchAll(/<Step\b([^>]*)>([\s\S]*?)<\/Step>/g)) {
    const attrs = parseAttrs(m[1] as string);
    const body = m[2] as string;
    const children: TraceNode[] = [];
    const goal = /<Goal>([\s\S]*?)<\/Goal>/.exec(body);
    if (goal) children.push({ kind: 'text', label: '<Goal>', note: firstSentence(goal[1] as string), detail: clean(goal[1] as string) });
    const action = /<Action>([\s\S]*?)<\/Action>/.exec(body);
    if (action) {
      const ai = action[1] as string;
      const prose = ai.replace(/<LogicSwitch\b[^>]*>[\s\S]*?<\/LogicSwitch>/g, ' '); // switch shown as branches, not raw in detail
      children.push({ kind: 'text', label: '<Action>', note: firstSentence(prose), detail: clean(prose), children: parseAction(ai) });
    }
    steps.push({ kind: 'step', label: `<Step ${attrs.id ?? ''}>`, attrs, children });
  }
  return steps;
}

/**
 * Разобрать XML директивы в дерево: корневой тег → дочерние секции в порядке появления.
 * @param path Путь к файлу директивы (становится ref корня).
 * @param xml Содержимое директивы.
 */
export function parseDirective(path: string, xml: string): TraceNode {
  const root = nextElement(xml, 0);
  if (!root) return { kind: 'directive', label: path, note: 'не найден корневой тег' };
  const sections: TraceNode[] = [];
  for (const el of topLevelElements(root.inner)) {
    if (el.name === 'BeliefState') sections.push({ kind: 'section', label: '<BeliefState>', note: 'правила установки', children: parseAxioms(el.inner) });
    else if (el.name === 'HaltConditions') sections.push({ kind: 'section', label: '<HaltConditions>', note: 'стоп-условия', children: parseHalts(el.inner) });
    else if (el.name === 'ExecutionPlan') sections.push({ kind: 'section', label: '<ExecutionPlan>', note: 'шаги исполнения', children: parseSteps(el.inner) });
    else if (el.name === 'LogicSwitch') sections.push(parseLogicSwitch(el.inner, el.attrs.on));
    else sections.push({ kind: 'section', label: `<${el.name}>`, note: firstSentence(el.inner), detail: clean(el.inner) });
  }
  return { kind: 'directive', label: `<${root.name}>`, ref: path, attrs: parseAttrs(root.attrsRaw), children: sections };
}
