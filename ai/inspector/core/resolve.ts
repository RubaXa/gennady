// @file: ai/inspector — recursively expand 'run' nodes (directive refs) into the referenced directive's tree.
// Cycle-guarded (a directive that references an ancestor on the current path is marked, not followed) and
// depth-capped. The file reader is injected so the resolver stays pure and testable.

import type { TraceNode } from './model.ts';
import { parseDirective } from './parse-directive.ts';

const MAX_DEPTH = 12;

/** Чтение содержимого директивы по ref; null — файла нет. */
export type DirectiveReader = (ref: string) => string | null;

/**
 * Развернуть дерево на месте: каждый run-узел со ссылкой на *.directive.xml получает дочерним
 * разобранное дерево этой директивы (рекурсивно). Циклы и превышение глубины помечаются узлом 'unparsed'.
 * @param node Корень поддерева.
 * @param read Читатель файлов директив.
 * @param seen Ссылки на текущем пути сверху вниз (для детекта циклов).
 * @param depth Текущая глубина вложенности директив.
 */
export function resolveTree(node: TraceNode, read: DirectiveReader, seen: Set<string> = new Set(), depth = 0): TraceNode {
  if (node.kind === 'run' && node.ref && node.ref.endsWith('.directive.xml')) {
    if (depth >= MAX_DEPTH) {
      node.children = [{ kind: 'unparsed', label: 'предел глубины', note: node.ref }];
      return node;
    }
    if (seen.has(node.ref)) {
      node.children = [{ kind: 'unparsed', label: '↻ цикл', note: `${node.ref} уже выше по ветке` }];
      return node;
    }
    const content = read(node.ref);
    if (content == null) {
      node.children = [{ kind: 'unparsed', label: 'файл директивы не найден', note: node.ref }];
      return node;
    }
    const sub = parseDirective(node.ref, content);
    const nextSeen = new Set(seen);
    nextSeen.add(node.ref);
    resolveTree(sub, read, nextSeen, depth + 1);
    node.children = [sub];
    return node;
  }
  if (node.children) node.children = node.children.map((c) => resolveTree(c, read, seen, depth));
  return node;
}
