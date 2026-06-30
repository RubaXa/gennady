// @file: ai/inspector — parse a SKILL.md (frontmatter + <SddSkill>) into a TraceNode tree.
// The skill is a thin loader: its steps name the tools it runs and the directives it reads — those
// directive refs become 'run' nodes that resolve.ts expands into the directive's own tree.

import type { TraceNode } from './model.ts';
import { clean, firstSentence, nextElement, parseAttrs, scanRefsAndTools, topLevelElements } from './scan.ts';

interface Frontmatter {
  name?: string;
  description?: string;
}

/** Срезать YAML-frontmatter, вернуть поля + остаток. */
function parseFrontmatter(md: string): { fm: Frontmatter; body: string } {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(md);
  if (!m) return { fm: {}, body: md };
  const fm: Frontmatter = {};
  for (const line of (m[1] as string).split('\n')) {
    const kv = /^(name|description):\s*(.*)$/.exec(line);
    if (kv) fm[kv[1] as keyof Frontmatter] = kv[2] as string;
  }
  return { fm, body: m[2] as string };
}

/** ExecutionPlan скила → шаги (тело текстовое; внутри — тулы и ссылки на директивы). */
function parseSkillSteps(inner: string): TraceNode[] {
  const steps: TraceNode[] = [];
  for (const m of inner.matchAll(/<Step\b([^>]*)>([\s\S]*?)<\/Step>/g)) {
    const attrs = parseAttrs(m[1] as string);
    const body = m[2] as string;
    steps.push({ kind: 'step', label: `<Step ${attrs.id ?? ''}>`, attrs, note: firstSentence(body), detail: clean(body), children: scanRefsAndTools(body) });
  }
  return steps;
}

/**
 * Разобрать SKILL.md в дерево: skill-узел → секции SddSkill по порядку (Mission, Priming, ExecutionPlan→steps).
 * @param path Путь к SKILL.md (становится ref).
 * @param md Содержимое файла.
 */
export function parseSkill(path: string, md: string): TraceNode {
  const { fm, body } = parseFrontmatter(md);
  const root = nextElement(body, 0);
  const children: TraceNode[] = [];
  if (root) {
    for (const el of topLevelElements(root.inner)) {
      if (el.name === 'ExecutionPlan') children.push({ kind: 'section', label: '<ExecutionPlan>', note: 'шаги загрузчика', children: parseSkillSteps(el.inner) });
      else children.push({ kind: 'section', label: `<${el.name}>`, note: firstSentence(el.inner), detail: clean(el.inner) });
    }
  }
  return {
    kind: 'skill',
    label: `/${fm.name ?? path}`,
    note: firstSentence(fm.description ?? ''),
    detail: fm.description,
    attrs: fm.name ? { name: fm.name } : {},
    ref: path,
    children,
  };
}
