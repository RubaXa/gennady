// @file: ai/inspector — trace model: the node tree the parser emits and the UI renders.

/** Читатель файла по репо-относительному пути → содержимое или null, если файла нет. Общий тип
 *  для resolve.ts (READ_AND_USE-переходы между директивами) и parse-directive.ts (чтение пакетов
 *  шагов lazy-директивы) — один и тот же контракт: инъекция, а не прямой fs, чтобы парсер/резолвер
 *  оставались чистыми и тестируемыми без реального диска. */
export type FileReader = (ref: string) => string | null;

/** Тип узла дерева трейса. Управляет цветом/иконкой в UI и смыслом узла. */
export type NodeKind =
  | 'skill' // активация скила (корень)
  | 'step' // шаг (ExecutionPlan / загрузчик)
  | 'tool' // вызов gennady CLI
  | 'read' // прочитали файл/директиву (осмотр)
  | 'run' // READ_AND_USE — активировали другую директиву
  | 'directive' // корневой тег директивы
  | 'section' // структурный тег (Mission, BeliefState, ...)
  | 'axiom' // правило BeliefState
  | 'halt' // стоп-условие
  | 'switch' // LOGIC_SWITCH
  | 'branch' // ветка switch
  | 'text' // произвольный тег с текстом (Goal/Action/Mission)
  | 'unparsed'; // не разобрали чисто — честная пометка, не врём

/** Один узел дерева. Дети — вложенность; ref — цель READ_AND_USE для рекурсивного разворота. */
export interface TraceNode {
  /** @purpose Класс узла — определяет отображение и смысл. */
  kind: NodeKind;
  /** @purpose Подпись узла: тег, id аксиомы/шага, имя тула. */
  label: string;
  /** @purpose Краткая строка (первое предложение тела) — видна сразу. */
  note?: string;
  /** @purpose Полный текст (тело аксиомы, текст Action) — раскрывается по клику. */
  detail?: string;
  /** @purpose Путь-цель для read/run (READ_AND_USE) — резолвится рекурсивно. */
  ref?: string;
  /** @purpose Атрибуты исходного тега (id, ver, ...). */
  attrs?: Record<string, string>;
  /** @purpose Источник: файл + строка, куда «open in editor» (проставляется на этапе генерации). */
  loc?: { file: string; line: number };
  /** @purpose Вложенные узлы в порядке появления. */
  children?: TraceNode[];
}
