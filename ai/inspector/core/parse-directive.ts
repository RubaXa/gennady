// @file: ai/inspector — parse a rendered SDD v2 directive XML into a TraceNode tree.

import type { FileReader, TraceNode } from './model.ts';
import {
  clean,
  firstSentence,
  nextElement,
  parseAttrs,
  scanRefsAndTools,
  topLevelElements,
  type RawEl,
} from './scan.ts';
import { resolveAssemblyMode } from '../../kit/lazy-assembly.ts';

/**
 * Top-level `<Axiom>` элементы в `inner`, закрытие — БАЛАНСНОЕ (считает вложенные open/close той же
 * пары, в духе nextElement/topLevelElements), а не первое `</Axiom>` — легитимная форма вложенности:
 * `<Axiom id="AX_NO_DUPLICATION">…<Axiom id="AX_TICKET_DEDUPLICATION">…</Axiom>…</Axiom>`
 * (agent-inbox/{code-lens,security-lens,synthesize,track-review}.directive.xml — внешняя аксиома
 * дословно цитирует внутреннюю вместо дублирования текста). Ленивый `/<Axiom\b...>...<\/Axiom>/`
 * останавливался на ПЕРВОМ `</Axiom>`, то есть на закрытии ВНУТРЕННЕЙ: внешняя обрезалась на середине
 * (хвост после вложенной терялся), а внутренняя не становилась узлом дерева вовсе.
 */
function axiomElements(
  inner: string
): { attrs: Record<string, string>; body: string; raw: string }[] {
  const out: { attrs: Record<string, string>; body: string; raw: string }[] = [];
  const openRe = /<Axiom\b([^>]*)>/g;
  let cursor = 0;
  while (cursor < inner.length) {
    openRe.lastIndex = cursor;
    const om = openRe.exec(inner);
    if (!om) break;
    const attrs = parseAttrs(om[1] as string);
    const start = om.index;
    const bodyStart = om.index + om[0].length;
    const pairRe = /<Axiom\b[^>]*>|<\/Axiom>/g;
    pairRe.lastIndex = bodyStart;
    let depth = 1;
    let bodyEnd = inner.length;
    let closeEnd = inner.length;
    let m: RegExpExecArray | null;
    while ((m = pairRe.exec(inner))) {
      if (m[0] === '</Axiom>') {
        depth--;
        if (depth === 0) {
          bodyEnd = m.index;
          closeEnd = m.index + m[0].length;
          break;
        }
      } else depth++;
    }
    out.push({ attrs, body: inner.slice(bodyStart, bodyEnd), raw: inner.slice(start, closeEnd) });
    cursor = closeEnd;
  }
  return out;
}

/**
 * BeliefState → узлы-аксиомы (id + первое предложение + полное тело), рекурсивно. Вложенная аксиома —
 * РЕБЁНОК внешней (не поднятый sibling): рендер (ai/inspector/web/app.js renderNode) полностью
 * рекурсивен по `children` независимо от `kind`, так что ребёнком дерево честно отражает исходную
 * вложенность разметки; поднятой в sibling вложенная аксиома не соответствовала бы исходной структуре
 * и потеряла бы, что она процитирована ВНУТРИ текста внешней, а не идёт после неё.
 */
function parseAxioms(inner: string): TraceNode[] {
  return axiomElements(inner).map(({ attrs, body: rawBody }) => {
    const children = parseAxioms(rawBody); // вложенные <Axiom> внутри тела — детьми, рекурсивно
    // Внешний note/detail — только СОБСТВЕННЫЙ текст (без raw-разметки вложенных <Axiom>): без этого
    // вырезания вложенная аксиома дублировалась бы дословно и как raw XML внутри текста родителя, и как
    // отдельный узел-ребёнок (см. тест «no raw tag markup leaks into detail» для того же паттерна у
    // ChatProtocol/generic-секций).
    let ownText = rawBody;
    for (const nested of axiomElements(rawBody)) ownText = ownText.replace(nested.raw, '\n');
    const body = ownText.trim();
    return {
      kind: 'axiom' as const,
      label: attrs.id ?? 'AX_?',
      note: firstSentence(body),
      detail: body,
      children: children.length ? children : undefined,
    };
  });
}

/** Теги, разбираемые как лист «id + первое предложение + полное тело» (в стиле parseAxioms), а не
 *  как под-секция для дальнейшего разворота. */
const LEAF_TAGS: Record<string, TraceNode['kind']> = { Axiom: 'axiom', Contract: 'text' };

/** Предел рекурсии для генерик-секций без спец-разборщика — реальная вложенность в директивах мала
 *  (Section → Contract/Axiom, изредка ещё один уровень), предел просто страхует от патологического XML. */
const GENERIC_DEPTH_LIMIT = 8;

/** «N вложенных элементов» с верным русским согласованием числительного (1/2-4/5+). */
function nestedCountNote(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} вложенный элемент`;
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return `${n} вложенных элемента`;
  return `${n} вложенных элементов`;
}

/** Замаскировать `code`-спаны (той же длины, символы `<`/`>` внутри не выживают) — секции без
 *  спец-разборщика — это свободная markdown-проза, и плейсхолдеры вида `` `P<N>` ``, `` `<Task-ID>` ``
 *  иначе ложно матчатся как псевдо-тег PascalCase-сканером (см. PASCAL_OPEN в scan.ts: одна заглавная
 *  буква — валидное имя тега). Длина сохраняется, чтобы смещения совпадали с оригиналом.
 *
 *  Спан не пересекает границу строки (`[^`\n]`, не просто `[^`]`): markdown-проза нередко несёт
 *  непарный/тройной backtick внутри одной строки (пример: `code-lens.directive.xml` `<Probes>` —
 *  таблица с ячейкой «...fenced-блоком ```suggestion:-0+0, новый текст...» — тройной backtick как
 *  литеральный пример синтаксиса, не открытие настоящего fenced-блока). Без ограничения строкой один
 *  такой нечётный backtick сдвигает четность на весь ОСТАТОК документа: следующая «пара» находится
 *  где угодно дальше, включая случай, когда в маску попадает настоящий закрывающий тег секции
 *  (`</Probes>`) — тогда секция для сканера как бы не заканчивается, и всё, что после неё, отрезается
 *  от дерева. Ограничение строкой держит ущерб непарного backtick в пределах одной строки. */
function maskCodeSpans(s: string): string {
  return s.replace(/`[^`\n]*`/g, (m) => ' '.repeat(m.length));
}

/** Top-level элементы секции, игнорируя псевдо-теги внутри `code`-спанов: находим границы на
 *  замаскированной копии (те же смещения), затем перечитываем реальный тег из оригинала на найденном
 *  старте — на этой позиции маска гарантированно не тронула текст, иначе тег там не нашёлся бы. */
function nestedElements(inner: string): RawEl[] {
  const masked = maskCodeSpans(inner);
  const out: RawEl[] = [];
  let cursor = 0;
  while (cursor < masked.length) {
    const probe = nextElement(masked, cursor);
    if (!probe) break;
    const real = nextElement(inner, probe.end - probe.raw.length);
    if (real) out.push(real);
    cursor = probe.end;
  }
  return out;
}

/**
 * Разбор секции без спец-разборщика (ChatProtocol, ChatOutput, Mission, ...): вложенные top-level
 * элементы становятся детьми (Contract/Axiom — лист с id/телом, прочий PascalCase-тег — под-секция,
 * рекурсивно той же логикой), а собственный текст секции (то, что осталось после вычитания тел
 * вложенных элементов) — note/detail самой секции. Пустой собственный текст при непустых детях даёт
 * осмысленный note («N вложенных контрактов»), а не пропадает в пустоту.
 */
function parseGenericSection(
  inner: string,
  depth = 0
): { note?: string; detail?: string; children?: TraceNode[] } {
  const nested = depth < GENERIC_DEPTH_LIMIT ? nestedElements(inner) : [];
  if (!nested.length) {
    const text = clean(inner);
    return text ? { note: firstSentence(text), detail: text } : {};
  }
  let outsideText = inner;
  const children: TraceNode[] = [];
  for (const el of nested) {
    outsideText = outsideText.replace(el.raw, '\n');
    const leafKind = LEAF_TAGS[el.name];
    if (leafKind) {
      const attrs = parseAttrs(el.attrsRaw);
      const body = clean(el.inner);
      children.push({
        kind: leafKind,
        label: attrs.id ?? `<${el.name}>`,
        note: firstSentence(body),
        detail: body,
      });
    } else {
      const sub = parseGenericSection(el.inner, depth + 1);
      children.push({ kind: 'section', label: `<${el.name}>`, ...sub });
    }
  }
  const text = clean(outsideText);
  const note = text ? firstSentence(text) : nestedCountNote(children.length);
  return { note, detail: text || undefined, children };
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
    out.push({
      kind: 'unparsed',
      label: 'ветвление текстом',
      note: 'условие задано текстом, не структурным <LogicSwitch> — ветки не разобраны',
    });
  }
  return out;
}

/** Структурный <LogicSwitch> → switch-узел с ветками WHEN/DEFAULT (условие → переход; READ_AND_USE → run). */
function parseLogicSwitch(inner: string, onAttr?: string): TraceNode {
  const header = /LOGIC_SWITCH\s*\(([^)]*)\)/.exec(inner);
  const branches: TraceNode[] = [];
  for (const m of inner.matchAll(
    /-\s*(WHEN|DEFAULT)\b([\s\S]*?)(?=\n\s*-\s*(?:WHEN|DEFAULT)\b|\n```|$)/g
  )) {
    const kind = m[1] as string;
    const rest = m[2] as string;
    const ai = rest.indexOf('->');
    const cond = ai >= 0 ? rest.slice(0, ai) : rest;
    const action = ai >= 0 ? rest.slice(ai + 2) : '';
    const kids = scanRefsAndTools(action);
    if (!kids.length && action.trim())
      kids.push({ kind: 'text', label: '→ ' + firstSentence(clean(action)) });
    branches.push({
      kind: 'branch',
      label: kind === 'DEFAULT' ? 'DEFAULT' : firstSentence(clean(cond)),
      detail: clean(rest),
      children: kids.length ? kids : undefined,
    });
  }
  const on = (onAttr || (header ? (header[1] as string) : '') || '').trim().replace(/^on\s+/i, '');
  return {
    kind: 'switch',
    label: '<LogicSwitch>',
    note: on ? `по: ${on}` : 'развилка маршрутизации',
    children: branches,
  };
}

/** Один `<Step id="...">...</Step>` → узел «шаг» с Goal/Action (+ их содержимое) детьми. Общая
 *  форма для монолитного шага (тело — прямо в скелете) и для шага, прочитанного из файла пакета
 *  lazy-директивы (тело идентично, только физически лежит в другом файле — см. parseLazySteps). */
function buildStepNode(attrsRaw: string, body: string): TraceNode {
  const attrs = parseAttrs(attrsRaw);
  const children: TraceNode[] = [];
  const goal = /<Goal>([\s\S]*?)<\/Goal>/.exec(body);
  if (goal)
    children.push({
      kind: 'text',
      label: '<Goal>',
      note: firstSentence(goal[1] as string),
      detail: clean(goal[1] as string),
    });
  const action = /<Action>([\s\S]*?)<\/Action>/.exec(body);
  if (action) {
    const ai = action[1] as string;
    const prose = ai.replace(/<LogicSwitch\b[^>]*>[\s\S]*?<\/LogicSwitch>/g, ' '); // switch shown as branches, not raw in detail
    children.push({
      kind: 'text',
      label: '<Action>',
      note: firstSentence(prose),
      detail: clean(prose),
      children: parseAction(ai),
    });
  }
  return { kind: 'step', label: `<Step ${attrs.id ?? ''}>`, attrs, children };
}

/** ExecutionPlan/PhaseProcedure (монолит) → шаги; `<Step>` живёт прямо в теле секции. */
function parseMonolithSteps(inner: string): TraceNode[] {
  const steps: TraceNode[] = [];
  for (const m of inner.matchAll(/<Step\b([^>]*)>([\s\S]*?)<\/Step>/g)) {
    steps.push(buildStepNode(m[1] as string, m[2] as string));
  }
  return steps;
}

/** Одна bullet-строка списка шагов lazy-скелета:
 *  `- **STEP_ID** — gist. Full step text: \`ai/directives/sdd-v2/<name>/steps/<id>.xml\` (...).`
 *  (форма — buildStepListEntry в ai/kit/lazy-assembly.ts). Захватываем id + путь к пакету; gist —
 *  только как честный fallback-текст, если пакет физически не прочитался. */
const LAZY_STEP_BULLET_RE =
  /-\s*\*\*([A-Za-z0-9_]+)\*\*\s*[—-]\s*([^\n]*?)\s*Full step text:\s*`([^`]+)`[^\n]*/g;

/** Top-level `<Axiom>`/`<Contract>` блоки, физически перенесённые lazy-сборкой в файл пакета шага
 *  (DA-REQ-9: аксиома/контракт, активирующийся только в ОДНОМ шаге, живёт только там — его больше
 *  НЕТ в скелетном BeliefState/OutputContracts). Без этого разворота они пропали бы из трейса
 *  вовсе: у секции-скелета их нет, а к пакету никто больше не заглядывает. */
function parsePackageExtras(extras: string): TraceNode[] {
  const nodes: TraceNode[] = parseAxioms(extras);
  for (const el of topLevelElements(extras)) {
    if (el.name !== 'Contract') continue;
    const body = clean(el.inner);
    nodes.push({
      kind: 'text',
      label: el.attrs.id ?? '<Contract>',
      note: firstSentence(body),
      detail: body,
    });
  }
  return nodes;
}

/**
 * ExecutionPlan/PhaseProcedure (lazy) → шаги, физически внешние: скелет несёт только bullet-список
 * `id + путь к пакету` (DA-REQ-4), само тело шага — в `ai/directives/sdd-v2/<name>/steps/<id>.xml`.
 * Каждый файл пакета читается и разбирается ОТДЕЛЬНО, никогда не склеивается с соседним перед
 * разбором: непарный backtick одного файла (например, markdown-пример в `<Contract>` теле) иначе
 * сцепляется с backtick-ом следующего пакета и глотает всё содержимое между ними (см. предупреждение
 * задачи — тот же класс бага, что уже фиксили в audit-contract-activation.mjs и delta-assembly).
 * Порядок шагов — как в bullet-списке скелета (уже в порядке скелета, не алфавитный).
 */
function parseLazySteps(inner: string, read: FileReader | undefined): TraceNode[] {
  const steps: TraceNode[] = [];
  for (const m of inner.matchAll(LAZY_STEP_BULLET_RE)) {
    const id = m[1] as string;
    const gist = clean(m[2] as string);
    const packagePath = m[3] as string;
    const content = read ? read(packagePath) : null;
    if (content == null) {
      steps.push({
        kind: 'step',
        label: `<Step ${id}>`,
        attrs: { id, source: packagePath },
        note: 'пакет шага не прочитан — сборка устарела или файл отсутствует',
        detail: gist || undefined,
        children: [{ kind: 'unparsed', label: 'файл пакета не найден', note: packagePath }],
      });
      continue;
    }
    const stepMatch = /<Step\b([^>]*)>([\s\S]*?)<\/Step>/.exec(content);
    if (!stepMatch) {
      steps.push({
        kind: 'step',
        label: `<Step ${id}>`,
        attrs: { id, source: packagePath },
        note: 'в файле пакета не нашли <Step> — сборка устарела',
        detail: gist || undefined,
        children: [{ kind: 'unparsed', label: 'пакет без <Step>', note: packagePath }],
      });
      continue;
    }
    const stepNode = buildStepNode(stepMatch[1] as string, stepMatch[2] as string);
    const extras = content.slice((stepMatch.index ?? 0) + stepMatch[0].length);
    const extraNodes = parsePackageExtras(extras);
    if (extraNodes.length) stepNode.children = [...(stepNode.children ?? []), ...extraNodes];
    // честная пометка источника: тело шага читается в дереве этой директивы, но физически лежит
    // в отдельном файле пакета — attrs.source даёт точный путь, note — то же самое видно сразу,
    // без разворота узла.
    stepNode.attrs = { ...stepNode.attrs, source: packagePath };
    stepNode.note = `физически в пакете: ${packagePath}`;
    steps.push(stepNode);
  }
  return steps;
}

/** Ключ директивы в `ai/kit/assembly-manifest.json` — то же преобразование, что
 *  `manifestKeyFor` в ai/kit/audit-contract-activation.mjs: репо-относительный путь без префикса
 *  `ai/directives/` (у наших путей он совпадает с `sdd-v2/<file>` ровно потому, что все директивы
 *  сегодня лежат под `ai/directives/sdd-v2/`). */
function manifestKeyFor(directivePath: string): string {
  const marker = 'ai/directives/';
  const i = directivePath.indexOf(marker);
  return i >= 0 ? directivePath.slice(i + marker.length) : directivePath;
}

/** ExecutionPlan/PhaseProcedure → шаги, режим определяем через `resolveAssemblyMode` (одна и та же
 *  функция, что использует боевая сборка/аудитор — сюда, ни в коем случае, логика режима не
 *  дублируется). Lazy без инжектированного `read` — деградация: пакеты помечаются «не прочитан»
 *  честно, а не тихой пустотой. */
function parseSteps(
  inner: string,
  directivePath: string,
  read: FileReader | undefined
): TraceNode[] {
  const mode = resolveAssemblyMode(manifestKeyFor(directivePath));
  return mode === 'lazy' ? parseLazySteps(inner, read) : parseMonolithSteps(inner);
}

/**
 * Разобрать XML директивы в дерево: корневой тег → дочерние секции в порядке появления.
 * @param path Путь к файлу директивы (становится ref корня; также ключ режима сборки — lazy/monolith).
 * @param xml Содержимое директивы.
 * @param read Читатель файлов пакетов шагов lazy-директивы (тот же контракт, что у resolve.ts'а
 *   READ_AND_USE-резолвера) — без него lazy-шаги честно помечаются «не прочитан», а не падают.
 */
export function parseDirective(path: string, xml: string, read?: FileReader): TraceNode {
  const root = nextElement(xml, 0);
  if (!root) return { kind: 'directive', label: path, note: 'не найден корневой тег' };
  const sections: TraceNode[] = [];
  // nestedElements (not the raw topLevelElements) — same `code`-span masking parseGenericSection uses
  // one level down. A format/contract file's body (e.g. formats/research-doc-structure.xml) is free
  // markdown FULL of bare placeholders shaped like a tag (`<NAME>`, `<X>`, `<YYYY-MM-DD>` — one capital
  // letter is a valid PASCAL_OPEN tag name) with no real closing counterpart anywhere in the document;
  // masking keeps a backtick-wrapped placeholder from ever reaching the tag scanner, and nextElement's
  // own pairing requirement (scan.ts) skips over any unmasked bare one that still has no real `</Name>`.
  for (const el of nestedElements(root.inner)) {
    const attrs = parseAttrs(el.attrsRaw);
    if (el.name === 'BeliefState')
      sections.push({
        kind: 'section',
        label: '<BeliefState>',
        note: 'правила установки',
        children: parseAxioms(el.inner),
      });
    else if (el.name === 'HaltConditions')
      sections.push({
        kind: 'section',
        label: '<HaltConditions>',
        note: 'стоп-условия',
        children: parseHalts(el.inner),
      });
    else if (el.name === 'ExecutionPlan')
      sections.push({
        kind: 'section',
        label: '<ExecutionPlan>',
        note: 'шаги исполнения',
        children: parseSteps(el.inner, path, read),
      });
    // PhaseProcedure (phase-execution-protocol.directive.xml) — same shape as ExecutionPlan: a
    // list of <Step> blocks, monolith or lazy-split the same way.
    else if (el.name === 'PhaseProcedure')
      sections.push({
        kind: 'section',
        label: '<PhaseProcedure>',
        note: 'процедура фазы',
        children: parseSteps(el.inner, path, read),
      });
    else if (el.name === 'LogicSwitch') sections.push(parseLogicSwitch(el.inner, attrs.on));
    else
      sections.push({ kind: 'section', label: `<${el.name}>`, ...parseGenericSection(el.inner) });
  }
  // A format/contract file (<Contract>) has no PascalCase structural children — its whole body IS the
  // content (a markdown template). Capture it as detail so descending into it shows something, not a blank leaf.
  const rootDetail = sections.length === 0 ? clean(root.inner) : undefined;
  return {
    kind: 'directive',
    label: `<${root.name}>`,
    ref: path,
    attrs: parseAttrs(root.attrsRaw),
    note: rootDetail ? firstSentence(rootDetail) : undefined,
    detail: rootDetail,
    children: sections,
  };
}
