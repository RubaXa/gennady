// @file: Render a Neighbourhood into the fixed sdd-orient text contract — names + IDs only, never bodies, so the printout stays cheap to read.
// @consumers: SddOrientCommand

import type { Neighbourhood, NeighbourEntry } from '../core/build-neighbourhood.ts';

const NEXT_LINE =
  'next: перед фиксацией архитектуры ответь: расширяем что-то из перечисленного или вводим новое? «новое» требует обоснования со ссылкой на инвариант, который не подошёл.';

/** @purpose Empty-list wording for one neighbour's field — distinguishes "legacy spec, section never existed" from "v2 spec, this section is just missing". */
function emptyLabel(legacy: boolean): string {
  return legacy ? 'не найдены (старый формат)' : 'не найдены';
}

/** @purpose Render one neighbour's indented detail block. */
function renderEntry(n: NeighbourEntry): string[] {
  const lines = [`  ${n.name} (${n.kind}) → ${n.path}`];
  if (n.unreadable) {
    lines.push('    (спека не читается)');
    return lines;
  }
  if (n.kind === 'scope') {
    lines.push(
      n.modules.length > 0
        ? `    модули: ${n.modules.map((m) => m.name).join(', ')}`
        : `    модули: ${emptyLabel(n.legacy)}`
    );
    return lines;
  }
  lines.push(
    n.entities.length > 0
      ? `    сущности: ${n.entities.join(', ')}`
      : `    сущности: ${emptyLabel(n.legacy)}`
  );
  lines.push(
    n.contracts.length > 0
      ? `    контракты: ${n.contracts.map((c) => `${c.name} (${c.kind})`).join(', ')}`
      : `    контракты: ${emptyLabel(n.legacy)}`
  );
  lines.push(
    n.requirements.length > 0
      ? `    требования: ${n.requirements.map((r) => `${r.id} «${r.title}»`).join(', ')}`
      : `    требования: ${emptyLabel(n.legacy)}`
  );
  return lines;
}

/**
 * @purpose Render a Neighbourhood into the fixed sdd-orient printout.
 * @param n The assembled neighbourhood model.
 * @returns The full printout, one trailing newline short (caller/console.log adds it).
 */
export function renderNeighbourhood(n: Neighbourhood): string {
  const lines: string[] = [`[sdd-orient] neighbourhood — ${n.targetPath}`];

  const typeLabel = n.scopeType ?? 'тип неизвестен';
  if (!n.portalFound) {
    lines.push(`portal: ${n.scopeName} (${typeLabel}) · портал не найден (specs/README.md)`);
  } else {
    const deps = n.dependsOnScopes.length > 0 ? n.dependsOnScopes.join(', ') : 'нет';
    lines.push(`portal: ${n.scopeName} (${typeLabel}) · depends on: ${deps}`);
  }

  if (n.targetKind === 'unknown') {
    lines.push(
      'не удалось определить тип спеки (не module, не scope) — окрестность не построена; проверь наличие MODULE_VISION/SCOPE_TYPE (или заголовков "Module Vision"/"scope-type" в старом формате).'
    );
  } else if (n.neighbours.length === 0) {
    lines.push('соседей по графу нет');
  } else {
    lines.push('neighbours (по рёбрам, глубина 1):');
    for (const entry of n.neighbours) lines.push(...renderEntry(entry));
  }

  const consumers = n.consumers.length > 0 ? n.consumers.join(', ') : 'нет';
  lines.push(`потребители: ${consumers} ← (кто зависит от этой спеки)`);
  lines.push(NEXT_LINE);

  return lines.join('\n');
}
