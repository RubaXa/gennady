# Техническое задание: Отказоустойчивый сервис парсинга Git Diff (`git-diff-parser`)

## Правила кодирования

- Строго следовать всем правилам, описанным в `ai/agents/agent-typescript-devgen.xml`. Любое отклонение от этих правил и от публичного контракта этого документа считается ошибкой.
- Реализация должна быть написана на TypeScript.
- Сначала фиксируется публичный API и граничные сценарии, затем внутренняя реализация.

## 1. Назначение системы

### 1.1. Назначение

Сервис `git-diff-parser` предназначен для разбора diff-данных из нескольких источников и приведения их к одному стабильному readonly-контракту, пригодному для дальнейшего использования другими сервисами и automation-слоями.

Первая целевая область:

- raw unified diff из Git CLI;
- diff-данные, уже полученные из GitHub;
- diff-данные, уже полученные из GitLab.

### 1.2. Для кого предназначен результат

Результат этого сервиса должен использоваться:

- review-сервисами;
- сервисами визуализации diff;
- VCS-клиентами и orchestration-слоями;
- другими внутренними сервисами, которым нужен единый diff AST без привязки к конкретному источнику.

### 1.3. Что именно должен выдавать сервис

Сервис должен возвращать:

- типизированное описание изменённых файлов;
- hunks и построчную diff-модель для unified patch;
- метаданные файла: тип изменения, пути, режимы, similarity, признаки binary/combined/submodule/LFS/too-large/corrupted;
- список предупреждений по каждому файлу;
- единый контракт независимо от источника входных данных.

## 2. Архитектурная позиция и границы ответственности

### 2.1. Архитектурная позиция

`git-diff-parser` проектируется как отдельный доменный сервис уровня парсинга, а не как CLI-утилита, не как VCS-клиент и не как orchestration-слой.

Сервис получает уже готовый вход и только парсит его. Он не должен:

- запускать `git`;
- ходить в сеть;
- читать файлы из репозитория;
- собирать diff самостоятельно;
- принимать решения о том, как показывать diff пользователю.

### 2.2. Что входит в первую версию

В первую версию обязано входить:

- поддержка raw unified diff из Git CLI;
- поддержка адаптеров для GitHub и GitLab поверх уже полученных данных;
- tolerant parsing по умолчанию;
- strict mode для усиленной валидации результата;
- восстановление после повреждённого файла и переход к следующему `diff`-блоку;
- безопасный path parsing без RegExp для строк `diff --git` и родственных путей;
- отсутствие runtime-зависимостей.

### 2.3. Что не входит в scope первой версии

Следующее не является обязательным и не должно считаться частью первой поставки:

- выполнение `git diff` или любых других git-команд;
- HTTP-клиент для GitHub или GitLab;
- split diff view;
- word-level diff внутри строки;
- применение patch к файловой системе;
- парсинг combined diff content как обычных hunks;
- поддержка произвольных форматов diff вне standard unified patch;
- визуализация, pagination и UI-представление diff.

## 3. Структура проекта

Исполнитель должен организовать сервис по следующей структуре и с таким naming:

```text
services/git-diff-parser/
  |- README.md
  |- git-diff-parser.task.spec.md
  |- git-diff-parser.tests.spec.md
  |- index.ts
  |- git-diff-parser.types.ts
  |- git-diff-parser.errors.ts
  |- /core/
  |    |- string-scanner.ts
  |    |- patch-parser.ts
  |    |- git-path-parser.ts
  |- /adapters/
  |    |- parse-git-diff.ts
  |    |- parse-github-diff.ts
  |    |- parse-gitlab-diff.ts
  |- /__tests__/
  |    |- public-api-contract.test.ts
  |    |- string-scanner.test.ts
  |    |- git-path-parser.test.ts
  |    |- patch-parser.test.ts
  |    |- parse-git-diff.test.ts
  |    |- parse-git-diff-corruption.test.ts
  |    |- parse-github-diff.test.ts
  |    |- parse-gitlab-diff.test.ts
  |    |- strict-mode.test.ts
  |    |- performance.test.ts
  |    |- /fixtures/
  |         |- /git-cli/
  |         |    |- /repos/
  |         |    |- /synthetic/
  |         |- /github/
  |         |- /gitlab/
```

Правила к этой структуре:

1. `index.ts` является единственной публичной runtime entrypoint.
2. Все публичные типы и константы warning-кодов объявляются и экспортируются из `git-diff-parser.types.ts`.
3. Публичные runtime-ошибки объявляются и экспортируются из `git-diff-parser.errors.ts`.
4. Внутренние low-level механизмы (`StringScanner`, `patch-parser`, `git-path-parser`) не экспортируются из `index.ts`.
5. Нейминг файлов фиксируется именно в этой форме; переименование допустимо только после отдельного обновления этого task-spec.

## 4. Публичный API

### 4.1. Что экспортируется из `index.ts`

Из `services/git-diff-parser/index.ts` должны экспортироваться:

- все публичные типы из `git-diff-parser.types.ts`;
- все публичные warning-константы из `git-diff-parser.types.ts`;
- `GitDiffParserStrictModeError` из `git-diff-parser.errors.ts`;
- `parseGitDiff`;
- `parseGitHubDiff`;
- `parseGitLabDiff`.

Не должны экспортироваться:

- `StringScanner`;
- внутренние FSM и их служебные типы;
- служебные low-level parser helpers;
- внутренние warning/message formatters.

### 4.2. Канонический публичный контракт

Это основной контракт сервиса. Любая реализация обязана ему соответствовать.

```ts
export const WARN_HUNK_TRUNCATED_UNEXPECTEDLY = 'WARN_HUNK_TRUNCATED_UNEXPECTEDLY';
export const WARN_PATCH_OMITTED_BY_SOURCE = 'WARN_PATCH_OMITTED_BY_SOURCE';
export const WARN_COMBINED_DIFF_SKIPPED = 'WARN_COMBINED_DIFF_SKIPPED';
export const WARN_UNSUPPORTED_FILE_FORMAT = 'WARN_UNSUPPORTED_FILE_FORMAT';
export const WARN_INVALID_INDEX_LINE = 'WARN_INVALID_INDEX_LINE';
export const WARN_MISSING_PATH_HEADERS = 'WARN_MISSING_PATH_HEADERS';
export const WARN_UNTERMINATED_QUOTED_PATH = 'WARN_UNTERMINATED_QUOTED_PATH';
export const WARN_INVALID_HUNK_HEADER = 'WARN_INVALID_HUNK_HEADER';

export type GitDiffWarningCode =
  | typeof WARN_HUNK_TRUNCATED_UNEXPECTEDLY
  | typeof WARN_PATCH_OMITTED_BY_SOURCE
  | typeof WARN_COMBINED_DIFF_SKIPPED
  | typeof WARN_UNSUPPORTED_FILE_FORMAT
  | typeof WARN_INVALID_INDEX_LINE
  | typeof WARN_MISSING_PATH_HEADERS
  | typeof WARN_UNTERMINATED_QUOTED_PATH
  | typeof WARN_INVALID_HUNK_HEADER;

export type FileDiffChangeType = 'added' | 'deleted' | 'modified' | 'renamed' | 'unknown';

export type LineDiffChangeType = 'added' | 'deleted' | 'context';

export type GitDiffParserOptions = Readonly<{
  strictMode?: boolean;
}>;

export type GitHubDiffFileInput = Readonly<{
  status: string;
  filename: string;
  previousFilename?: string;
  patch?: string | null;
  isBinary?: boolean;
  isTooLarge?: boolean;
  isLFS?: boolean;
}>;

export type GitLabDiffFileInput = Readonly<{
  oldPath: string;
  newPath: string;
  newFile?: boolean;
  deletedFile?: boolean;
  renamedFile?: boolean;
  diff?: string | null;
  aMode?: string | null;
  bMode?: string | null;
  isBinary?: boolean;
  isTooLarge?: boolean;
  isLFS?: boolean;
}>;

export type NoNewlineLine = Readonly<{
  type: 'no-newline';
  content: string;
}>;

export type CodeLine = Readonly<{
  type: LineDiffChangeType;
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}>;

export type DiffLine = CodeLine | NoNewlineLine;

export type DiffHunk = Readonly<{
  header: string;
  context?: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: readonly DiffLine[];
}>;

export type FileDiff = Readonly<{
  type: FileDiffChangeType;
  oldPath: string;
  newPath: string;

  isBinary: boolean;
  isTooLarge: boolean;
  isCombined: boolean;
  isCorrupted: boolean;
  isSubmodule: boolean;
  isLFS: boolean;

  oldMode?: string;
  newMode?: string;
  similarity?: number;

  hunks: readonly DiffHunk[];
  warnings: readonly GitDiffWarningCode[];
}>;

export type ParsedDiff = readonly FileDiff[];

export declare function parseGitDiff(rawOutput: string, options?: GitDiffParserOptions): ParsedDiff;

export declare function parseGitHubDiff(
  files: readonly GitHubDiffFileInput[],
  options?: GitDiffParserOptions
): ParsedDiff;

export declare function parseGitLabDiff(
  files: readonly GitLabDiffFileInput[],
  options?: GitDiffParserOptions
): ParsedDiff;
```

`GitHubDiffFileInput` и `GitLabDiffFileInput` являются нормализованными DTO этого сервиса.

Это означает:

- публичный парсер не зависит от полного raw schema внешнего API;
- upstream-клиент отвечает за первичное преобразование ответа провайдера в эти типы;
- сам `git-diff-parser` остаётся pure parsing/mapping слоем.

### 4.3. Контракт strict mode

В `services/git-diff-parser/git-diff-parser.errors.ts` должна быть объявлена runtime-ошибка:

```ts
export declare class GitDiffParserStrictModeError extends Error {
  readonly partialResult: ParsedDiff;
  readonly filesWithWarnings: readonly FileDiff[];
}
```

Правила strict mode:

1. По умолчанию `strictMode === false`.
2. В tolerant mode парсер не бросает исключения из-за повреждённого diff-входа.
3. В strict mode парсер всё равно обязан закончить разбор всего входа.
4. После завершения разбора всего входа, если хотя бы у одного `FileDiff` есть `warnings.length > 0`, парсер обязан выбросить `GitDiffParserStrictModeError`.
5. `partialResult` обязан содержать полностью собранный `ParsedDiff`, чтобы вызывающий код мог его диагностировать.

## 5. Семантика модели данных

### 5.1. Общие правила

1. Все публичные структуры должны быть readonly на уровне TypeScript-контракта.
2. `Object.freeze` и иные runtime freeze-механизмы использовать запрещено.
3. Возвращённые наружу объекты и массивы после публикации результата больше не мутируются.

### 5.2. Семантика путей

1. Для Git CLI пути в `oldPath` и `newPath` должны храниться без префиксов `a/` и `b/`.
2. Значение `/dev/null` сохраняется как literal и используется для `added` и `deleted`.
3. Для API-адаптеров пути хранятся в том виде, в котором были переданы адаптеру, без добавления `a/` или `b/`.

### 5.3. Семантика типа изменения и file metadata

Определение типа изменения должно происходить по следующему приоритету:

1. Если есть явный признак rename (`rename from/to`, `similarity index` + смена пути, флаг rename на уровне источника) -> `renamed`.
2. Иначе если `oldPath === '/dev/null'` или источник явно пометил файл как новый -> `added`.
3. Иначе если `newPath === '/dev/null'` или источник явно пометил файл как удалённый -> `deleted`.
4. Иначе если файл распознан, но не подпадает под предыдущие случаи -> `modified`.
5. `unknown` допустим только если источник дал неполные или противоречивые метаданные.
6. `similarity`, если присутствует, должен быть целым числом от `0` до `100`.

### 5.4. Семантика `DiffHunk` и `DiffLine`

1. `header` хранит полный raw hunk header без символа перевода строки.
2. `context` содержит текст после второго `@@` и сохраняется без trim.
3. Для `CodeLine`:
   - `context`-строка содержит и `oldLineNumber`, и `newLineNumber`;
   - `deleted`-строка содержит только `oldLineNumber`;
   - `added`-строка содержит только `newLineNumber`.
4. `NoNewlineLine` не должна менять виртуальные счётчики строк hunk.

### 5.5. Семантика служебных флагов

1. `isBinary === true` означает, что текст patch не разбирается как hunks.
2. `isTooLarge === true` означает, что источник не отдал полный patch. Если patch отсутствует полностью, `hunks` должен быть пустым.
3. `isCombined === true` означает, что файл представлен combined diff (`diff --cc` или `diff --combined`) и контент сознательно не разбирается как unified hunk.
4. `isCorrupted === true` означает, что в файле обнаружена неразрешимая аномалия, после которой парсер прекратил разбор именно этого файла и перешёл к следующему.
5. `isSubmodule === true` означает, что diff описывает gitlink/submodule-изменение и обычный patch-контент для этого файла не разбирается.
6. `isLFS === true` является best-effort флагом и устанавливается только если источник явно дал достаточный сигнал или контент однозначно идентифицируется как Git LFS pointer; запрещено пытаться угадывать LFS только по расширению файла или размеру.
7. `isLFS` является информационным флагом и сам по себе не запрещает сохранять `hunks`, если источник всё равно предоставил обычный текстовый unified patch.

## 6. Ядро: внутренние low-level модули

### 6.1. `services/git-diff-parser/core/string-scanner.ts`

Необходимо реализовать `StringScanner`.

Обязательный контракт:

- хранит `cursor: number`;
- читает вход построчно без `rawText.split('\n')`;
- работает за счёт поиска следующего `\n` через `indexOf`;
- не создаёт массив всех строк;
- умеет корректно читать `\n`, `\r\n` и последнюю строку без завершающего перевода строки.

Минимальный внутренний контракт:

```ts
type LineView = {
  rawText: string;
  start: number;
  end: number;
};

class StringScanner {
  hasNext(): boolean;
  readLine(): LineView | null;
}
```

Правила:

1. `readLine()` возвращает диапазон строки без символов конца строки.
2. Если перед `\n` стоит `\r`, `end` должен указывать на позицию `\r`, а не `\n`.
3. После возврата последней строки следующий вызов `readLine()` обязан вернуть `null`.
4. Курсор обязан монотонно двигаться вперёд.
5. Если внутренняя реализация попала в anti-stall ситуацию и не может сдвинуть `cursor`, это считается багом реализации, а не ошибкой входных данных.

### 6.2. `services/git-diff-parser/core/git-path-parser.ts`

Необходимо реализовать отдельный посимвольный path parser.

Он обязан:

- разбирать строки `diff --git ...`, `rename from ...`, `rename to ...`, `--- ...`, `+++ ...`;
- поддерживать как unquoted, так и quoted git-path form;
- корректно обрабатывать полный набор C-style escape-последовательностей, которые Git может использовать в quoted path;
- не использовать RegExp для этой задачи.

Правила:

1. Незакрытая кавычка считается повреждением файла.
2. Для quoted path должны поддерживаться минимум `\\`, `\"`, `\t`, `\n` и восьмеричные escape-последовательности.
3. Парсер обязан возвращать уже нормализованный путь без surrounding quotes.

### 6.3. `services/git-diff-parser/core/patch-parser.ts`

`patch-parser` отвечает только за unified hunk parsing внутри уже найденного diff-файла.

Он не занимается:

- поиском начала файла в raw CLI input;
- HTTP/API mapping;
- определением имени сервиса-источника.

### 6.3.1. Обязанности

1. Найти и разобрать один или несколько hunk headers вида `@@ -a,b +c,d @@`.
2. Собрать `DiffHunk[]` и warning-коды.
3. Вернуть управление вызывающему adapter-слою, когда встречена строка, не относящаяся к текущему patch-контенту.

### 6.3.2. Правила парсинга hunk

1. Если в header опущены счётчики (`@@ -1 +1 @@`), оба счётчика считаются равными `1`.
2. Если в header присутствует контекст после второго `@@`, он попадает в `DiffHunk.context` без trim.
3. Внутри тела hunk:
   - строки, начинающиеся с `' '`, `'+'`, `'-'`, трактуются как `CodeLine`;
   - строка, начинающаяся с `'\\'`, трактуется как `NoNewlineLine`;
   - `NoNewlineLine` не влияет на счётчики `oldLines/newLines`.
4. Пока счётчики текущего hunk не обнулены, parser не имеет права реагировать на текст `diff --git`, `diff --cc`, `@@` или `@@@`, если строка уже легально распознана как code-line по первому символу.
5. Если hunk прерван EOF или новым file marker до схождения счётчиков, parser обязан:
   - завершить текущий hunk;
   - добавить `WARN_HUNK_TRUNCATED_UNEXPECTEDLY`;
   - отдать управление вызывающему слою.
6. Если после file header не найдено ни одного `@@`, это валидный случай для metadata-only change; `hunks` возвращается пустым массивом.

## 7. Адаптеры источников

### 7.1. Git CLI: `services/git-diff-parser/adapters/parse-git-diff.ts`

Публичная функция:

```ts
parseGitDiff(rawOutput: string, options?: GitDiffParserOptions): ParsedDiff
```

### 7.1.1. Предварительная санитаризация

Перед подачей в `StringScanner` raw string должна быть очищена от ANSI color codes.

Разрешён только локальный line-safe паттерн для stripping escape-codes:

- искать `\x1b\[[0-9;]*m`;
- заменять на пустую строку.

### 7.1.2. FSM по файлам

Адаптер обязан реализовать FSM как минимум с состояниями:

- `SEARCH_FILE`
- `PARSE_HEADER`
- `PARSE_UNIFIED_PATCH`
- `SKIP_COMBINED_PATCH`

### 7.1.3. Распознавание начала файла

В `SEARCH_FILE` adapter реагирует только на top-level file markers:

- `diff --git`
- `diff --cc`
- `diff --combined`

Правила:

1. Любой другой top-level текст игнорируется.
2. Если во всём входе не найден ни один поддерживаемый file marker, функция возвращает пустой `ParsedDiff`.
3. Combined diff начинается с `diff --cc` или `diff --combined`, а не с `diff --git`.

### 7.1.4. Разбор header

В `PARSE_HEADER` adapter обязан уметь обрабатывать:

- `old mode`
- `new mode`
- `deleted file mode`
- `new file mode`
- `similarity index`
- `rename from`
- `rename to`
- `index ...`
- `--- ...`
- `+++ ...`
- `Binary files ... differ`
- `GIT binary patch`
- `Submodule ...`

Правило для mode:

- если строка `index ...` содержит trailing mode (`index <old>..<new> 100644`) и отдельные `old mode` / `new mode` не встретились, это значение должно быть установлено и в `oldMode`, и в `newMode`.

### 7.1.5. Приоритет определения путей

Пути файла должны определяться по приоритету:

1. `rename from` / `rename to`
2. `---` / `+++`
3. line `diff --git ...`

### 7.1.6. Правила поведения

1. Если обнаружен `Binary files ... differ` или `GIT binary patch`, устанавливается `isBinary: true`, `hunks` остаётся пустым.
2. Если обнаружен `diff --cc` или `diff --combined`, файл помечается как `isCombined: true`, в `warnings` добавляется `WARN_COMBINED_DIFF_SKIPPED`, а контент читается до следующего top-level file marker без попытки parse unified hunks.
3. Если обнаружен submodule/gitlink case (например, mode `160000` или явная строка `Submodule ...`), устанавливается `isSubmodule: true`, `hunks` остаётся пустым.
4. Если найден первый `@@`, управление передаётся в `patch-parser`.
5. После возврата из `patch-parser` adapter завершает файл и переходит в `SEARCH_FILE`.

### 7.2. GitHub adapter: `services/git-diff-parser/adapters/parse-github-diff.ts`

Публичная функция:

```ts
parseGitHubDiff(
  files: readonly GitHubDiffFileInput[],
  options?: GitDiffParserOptions,
): ParsedDiff
```

Правила:

1. Адаптер не делает HTTP-запросы. Он только маппит уже переданные данные.
2. Маппинг статусов:
   - `added` -> `added`
   - `removed` -> `deleted`
   - `renamed` -> `renamed`
   - любой другой распознанный статус -> `modified`
3. `oldPath` и `newPath` определяются так:
   - `added`: `oldPath = '/dev/null'`, `newPath = filename`
   - `deleted`: `oldPath = filename`, `newPath = '/dev/null'`
   - `renamed`: `oldPath = previousFilename ?? filename`, `newPath = filename`
   - иначе: `oldPath = filename`, `newPath = filename`
4. Если `isLFS === true`, флаг обязан быть сохранён в результате.
5. Если `isTooLarge === true`, флаг обязан быть сохранён в результате независимо от наличия `patch`.
6. Если `patch` отсутствует и файл не binary, он должен быть помечен как `isTooLarge: true`, а в `warnings` добавляется `WARN_PATCH_OMITTED_BY_SOURCE`.
7. Если `isBinary === true`, patch-content не разбирается, `hunks` остаётся пустым.
8. Если `patch` присутствует, он разбирается через общее ядро `patch-parser`.

### 7.3. GitLab adapter: `services/git-diff-parser/adapters/parse-gitlab-diff.ts`

Публичная функция:

```ts
parseGitLabDiff(
  files: readonly GitLabDiffFileInput[],
  options?: GitDiffParserOptions,
): ParsedDiff
```

Правила:

1. Адаптер не делает HTTP-запросы. Он только маппит уже переданные данные.
2. Тип изменения определяется по приоритету:
   - `renamedFile === true` -> `renamed`
   - `newFile === true` -> `added`
   - `deletedFile === true` -> `deleted`
   - иначе -> `modified`
3. `oldPath` и `newPath` берутся напрямую из `oldPath/newPath` входа, кроме added/deleted случаев, где используется `/dev/null`.
4. Если `aMode` или `bMode` указывает на `160000`, файл считается submodule и помечается `isSubmodule: true`.
5. Если `aMode` или `bMode` указывает на `120000`, файл трактуется как opaque symlink-like change и помечается `isBinary: true`.
6. Если вход явно помечен как `isBinary`, patch-content не разбирается.
7. Если `isLFS === true`, флаг обязан быть сохранён в результате.
8. Если `isTooLarge === true`, флаг обязан быть сохранён в результате независимо от наличия `diff`.
9. Если `diff` отсутствует и файл не binary/submodule, он помечается как `isTooLarge: true`, а в `warnings` добавляется `WARN_PATCH_OMITTED_BY_SOURCE`.
10. Если `diff` присутствует, он разбирается через общее ядро `patch-parser`.

## 8. Поведение при повреждениях, unsupported cases и warning-модель

### 8.1. Обязательные warning-коды

Ниже перечислен минимальный обязательный набор warning-кодов и их смысл:

| Код                                | Когда добавляется                                                       |
| ---------------------------------- | ----------------------------------------------------------------------- |
| `WARN_HUNK_TRUNCATED_UNEXPECTEDLY` | Hunk оборвался раньше, чем сошлись счётчики старых и новых строк        |
| `WARN_PATCH_OMITTED_BY_SOURCE`     | Источник не передал patch-текст, хотя метаданные файла есть             |
| `WARN_COMBINED_DIFF_SKIPPED`       | Файл распознан как combined diff и был пропущен без разбора содержимого |
| `WARN_UNSUPPORTED_FILE_FORMAT`     | Для конкретного файла передан неподдерживаемый patch-формат             |
| `WARN_INVALID_INDEX_LINE`          | Строка `index ...` синтаксически повреждена                             |
| `WARN_MISSING_PATH_HEADERS`        | Перед первым unified hunk отсутствуют обязательные `---` и `+++`        |
| `WARN_UNTERMINATED_QUOTED_PATH`    | В path-строке обнаружена незакрытая quoted path                         |
| `WARN_INVALID_HUNK_HEADER`         | Строка выглядит как hunk header, но не соответствует unified syntax     |

### 8.2. Что считается повреждением файла

Если обнаружена неразрешимая аномалия в рамках одного файла, parser обязан:

1. завершить обработку текущего файла;
2. выставить `isCorrupted: true`;
3. добавить соответствующий warning-код;
4. перейти к поиску следующего top-level file marker.

Минимальный список corruption triggers:

- синтаксически повреждённая строка `index ...`;
- отсутствуют `---` и `+++` перед первым `@@` в unified file;
- незакрытая quoted path в `diff --git`, `rename from/to` или `---/+++`;
- строка похожа на `@@ ... @@`, но не может быть разобрана как valid unified hunk;
- file content распознан как unsupported per-file format, включая `--word-diff`.

### 8.3. Whole-input unsupported formats

Парсер рассчитан только на supported file markers и unified patch flow.

Правило:

- если input содержит произвольный текст или другой diff-формат, но ни разу не содержит `diff --git`, `diff --cc` или `diff --combined`, `parseGitDiff` обязан вернуть пустой `ParsedDiff`;
- это не считается ошибкой и не должно порождать глобальное исключение.

### 8.4. Что происходит с уже разобранными данными

Если файл стал `isCorrupted: true`, разрешено сохранить:

- уже полностью разобранные metadata этого файла;
- hunks, которые были завершены до точки повреждения.

Запрещено сохранять:

- незавершённый текущий hunk как будто он был валидным;
- фиктивные строки, придуманные для "достраивания" patch.

## 9. Ограничения производительности и безопасности

Реализация обязана соблюдать следующие ограничения:

1. Нельзя использовать `rawText.split('\n')` или аналогичное разбиение всего входа на массив строк.
2. Нельзя использовать RegExp для парсинга `diff --git` path-строк и quoted paths.
3. Разрешено использовать локальные, line-safe и bounded RegExp только для коротких metadata-строк.
4. Нельзя использовать жадные выражения по всему сырому diff-тексту.
5. Нельзя тянуть runtime dependencies. В `dependencies` должно быть пусто; допустимы только `devDependencies`.
6. Нельзя использовать `Object.freeze`.
7. Парсер не должен бросать исключения из-за malformed diff-input в tolerant mode.
8. Исключение допустимо только в двух случаях:
   - `GitDiffParserStrictModeError` после полного разбора входа в strict mode;
   - явная внутренняя invariant failure реализации, например anti-stall bug.
9. По памяти парсер должен быть линейным относительно размера результирующего AST и не должен аллоцировать отдельную копию всех строк входного diff.

## 10. Тестовая стратегия

Исполнитель обязан покрыть тестами минимум следующие группы сценариев.

Детальный BDD-план, правила организации тестовых файлов и требования к fixture-набору являются обязательными и задаются отдельным документом:

- [services/git-diff-parser/git-diff-parser.tests.spec.md](services/git-diff-parser/git-diff-parser.tests.spec.md)

Если между task-spec и tests-spec обнаружено расхождение, это считается дефектом документации. В таком случае нужно сначала синхронизировать документы, а не молча адаптировать тесты под текущую реализацию.

Ключевое правило для `parseGitDiff`:

- все сценарии, которые Git способен честно сгенерировать сам, должны опираться на реальные git-fixture repositories и получаться через shell-вызов `git`, а не через вручную написанный `input.diff`;
- synthetic raw diff fixtures допустимы только для malformed, corruption и иных случаев, которые нельзя стабильно или вообще нельзя получить из валидной git-истории;
- точные правила разделения между git-based и synthetic fixtures задаются в tests-spec.

### 10.1. `StringScanner`

- пустой input;
- один line c `\n`;
- один line c `\r\n`;
- последняя строка без завершающего newline;
- корректный EOF;
- монотонное движение cursor.

### 10.2. `git-path-parser`

- unquoted path без пробелов;
- quoted path с пробелами;
- quoted path c escape-последовательностями;
- octal escape;
- незакрытая quoted path.

### 10.3. `patch-parser`

- один валидный hunk;
- hunk без явных счётчиков (`@@ -1 +1 @@`);
- hunk c context после второго `@@`;
- `\ No newline at end of file`;
- hunk, внутри которого встречается строка кода с текстом `diff --git`;
- metadata-only change без hunk;
- hunk, оборванный до завершения счётчиков.

### 10.4. `parseGitDiff`

- обычный modified file;
- rename file;
- binary file;
- combined diff (`diff --cc` или `diff --combined`);
- ANSI-colored input;
- unsupported whole input;
- corrupted header;
- submodule case;
- file с quoted path и пробелами.

### 10.5. `parseGitHubDiff`

- added file c patch;
- removed file;
- renamed file;
- missing patch -> `isTooLarge`;
- binary file;
- strict mode c warning.

### 10.6. `parseGitLabDiff`

- new file;
- deleted file;
- renamed file;
- missing diff -> `isTooLarge`;
- symlink via mode `120000`;
- submodule via mode `160000`;
- strict mode c warning.

### 10.7. Память и устойчивость

- mock diff на 500,000 строк не должен приводить к OOM из-за стратегии чтения строк;
- тест должен подтверждать отсутствие `split('\n')`-подхода хотя бы косвенно по поведению и по ревью реализации;
- парсер должен корректно переходить к следующему файлу после corruption trigger.

## 11. Примеры ожидаемого поведения

### 11.1. Пример: обычный modified file из Git CLI

**Вход:**

```text
diff --git a/src/a.ts b/src/a.ts
index 1234567..89abcde 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,1 +1,2 @@ export function a()
-return 1;
+return 2;
+return 3;
```

**Ожидаемый результат:**

```json
[
  {
    "type": "modified",
    "oldPath": "src/a.ts",
    "newPath": "src/a.ts",
    "isBinary": false,
    "isTooLarge": false,
    "isCombined": false,
    "isCorrupted": false,
    "isSubmodule": false,
    "isLFS": false,
    "oldMode": "100644",
    "newMode": "100644",
    "hunks": [
      {
        "header": "@@ -1,1 +1,2 @@ export function a()",
        "context": "export function a()",
        "oldStart": 1,
        "oldLines": 1,
        "newStart": 1,
        "newLines": 2,
        "lines": [
          {
            "type": "deleted",
            "content": "return 1;",
            "oldLineNumber": 1
          },
          {
            "type": "added",
            "content": "return 2;",
            "newLineNumber": 1
          },
          {
            "type": "added",
            "content": "return 3;",
            "newLineNumber": 2
          }
        ]
      }
    ],
    "warnings": []
  }
]
```

### 11.2. Пример: GitHub file без patch

**Вход:**

```ts
[
  {
    status: 'modified',
    filename: 'src/large.ts',
    patch: null,
  },
];
```

**Ожидаемый результат:**

```json
[
  {
    "type": "modified",
    "oldPath": "src/large.ts",
    "newPath": "src/large.ts",
    "isBinary": false,
    "isTooLarge": true,
    "isCombined": false,
    "isCorrupted": false,
    "isSubmodule": false,
    "isLFS": false,
    "hunks": [],
    "warnings": ["WARN_PATCH_OMITTED_BY_SOURCE"]
  }
]
```

### 11.3. Пример: combined diff

**Вход:**

```text
diff --cc f.txt
index 1f7391f,a7453f0..0000000
--- a/f.txt
+++ b/f.txt
@@@ -1,1 -1,1 +1,5 @@@
+<<<<<<< HEAD
 +master
+=======
+feature
+>>>>>>> branch
```

**Ожидаемый результат:**

```json
[
  {
    "type": "modified",
    "oldPath": "f.txt",
    "newPath": "f.txt",
    "isBinary": false,
    "isTooLarge": false,
    "isCombined": true,
    "isCorrupted": false,
    "isSubmodule": false,
    "isLFS": false,
    "hunks": [],
    "warnings": ["WARN_COMBINED_DIFF_SKIPPED"]
  }
]
```

## 12. README и документация пакета

`services/git-diff-parser/README.md` обязан содержать:

- краткое назначение сервиса;
- описание трёх публичных parse-функций;
- объяснение tolerant vs strict mode;
- список warning-кодов;
- минимум по одному примеру использования для Git CLI, GitHub и GitLab;
- ссылку на этот task-spec как источник истины;
- ссылку на отдельный tests-spec:
  - [services/git-diff-parser/git-diff-parser.tests.spec.md](services/git-diff-parser/git-diff-parser.tests.spec.md)

## 13. Definition of Done

Задача считается выполненной только если одновременно выполнены все условия:

1. Структура проекта соответствует разделу 3.
2. `index.ts` экспортирует только публичный API, перечисленный в разделе 4.1.
3. `git-diff-parser.types.ts` содержит единый канонический контракт из раздела 4.2.
4. `parseGitDiff`, `parseGitHubDiff` и `parseGitLabDiff` принимают `GitDiffParserOptions`.
5. Default mode работает как tolerant parsing и не бросает исключения на malformed diff-input.
6. Strict mode после полного разбора входа выбрасывает `GitDiffParserStrictModeError`, если обнаружены warnings.
7. Raw Git CLI parser корректно обрабатывает unified diff, binary, metadata-only change, combined diff и переход к следующему файлу после corruption trigger.
8. GitHub и GitLab adapters работают как pure mapping layer и не выполняют сетевых запросов.
9. Path parsing реализован через state machine, а не через RegExp.
10. В runtime `dependencies` отсутствуют.
11. Все тестовые сценарии из раздела 10 реализованы и проходят.
12. Все обязательные BDD-сценарии и требования к фикстурам из [services/git-diff-parser/git-diff-parser.tests.spec.md](services/git-diff-parser/git-diff-parser.tests.spec.md) реализованы и соблюдены.
13. README описывает публичный API и соответствует фактическому поведению реализации.
