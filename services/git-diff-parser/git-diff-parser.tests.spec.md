# Спецификация тестирования `git-diff-parser`

## Цель

Проверить, что реализация `git-diff-parser` строго соответствует [основной task-спецификации](./services/git-diff-parser/git-diff-parser.task.spec.md), а все сценарии парсинга, деградации, восстановления и source-mapping покрыты воспроизводимыми BDD-тестами.

Этот документ является обязательным дополнением к task-spec и фиксирует:

- структуру тестового набора;
- формат и правила хранения фикстур;
- обязательные BDD-сценарии;
- критерии полноты тестового покрытия.

## Базовые правила

ВАЖНО: Строго следовать правилам написания тестов, указанным в `ai/agents/agent-qa-code.rules.xml`.

Обязательные принципы:

1. Каждый тест формулируется как один BDD-сценарий в терминах `Given / When / Then`.
2. Expected behavior берётся из [task-спецификации](./services/git-diff-parser/git-diff-parser.task.spec.md), а не из текущего поведения реализации.
3. Один тест покрывает один сценарий или одну чётко определённую ветку поведения.
4. Для parser-результатов источником истины являются явные `expected.json`, а не snapshots.
5. Snapshot-тесты не являются обязательным форматом для этого сервиса и не должны подменять явный проверяемый expected result.
6. Порядок файлов, hunks, lines и warnings должен проверяться как часть контракта, а не считаться несущественной деталью.
7. Если сценарий не закреплён в task-spec, его нельзя делать обязательным регрессионным кейсом без отдельного уточнения.

## Структура тестовых файлов

Рабочая директория:

- `services/git-diff-parser/__tests__`

Обязательная структура тестовых файлов:

1. `public-api-contract.test.ts`
2. `string-scanner.test.ts`
3. `git-path-parser.test.ts`
4. `patch-parser.test.ts`
5. `parse-git-diff.test.ts`
6. `parse-git-diff-corruption.test.ts`
7. `parse-github-diff.test.ts`
8. `parse-gitlab-diff.test.ts`
9. `strict-mode.test.ts`
10. `performance.test.ts`

Правила:

- все test-файлы обязаны использовать `kebab-case`;
- low-level unit tests (`string-scanner`, `git-path-parser`, `patch-parser`) должны быть отделены от adapter-level тестов;
- сценарии corruption и unsupported behavior должны быть вынесены из happy-path тестов в отдельный файл `parse-git-diff-corruption.test.ts`;
- strict mode должен тестироваться отдельным файлом, а не вскользь внутри happy-path;
- performance и large-input кейсы не должны смешиваться с обычными функциональными кейсами.

## Контракт по фикстурам

### 1. Базовая стратегия фикстур

Для `git-diff-parser` используется гибридная стратегия:

1. Для валидных Git CLI сценариев, которые Git способен сгенерировать сам, источником истины должны быть реальные mini-repo fixtures.
2. Для malformed, corruption и иных невалидных сценариев, которые Git не генерирует честно, используются synthetic raw diff fixtures.
3. Для `parseGitHubDiff` и `parseGitLabDiff` используются JSON fixtures с нормализованными DTO сервиса.

Правило выбора:

- если ожидаемый raw diff можно детерминированно получить реальным вызовом `git`, нужно использовать git-based fixture;
- если сценарий требует намеренно сломанный diff или провайдерный DTO, который не выражается через raw git output, используется отдельный synthetic fixture.

### 2. Где лежат фикстуры

Все файловые фикстуры должны лежать только в:

- `services/git-diff-parser/__tests__/fixtures/git-cli/repos`
- `services/git-diff-parser/__tests__/fixtures/git-cli/synthetic`
- `services/git-diff-parser/__tests__/fixtures/github`
- `services/git-diff-parser/__tests__/fixtures/gitlab`

### 3. Формат каталогов фикстур

Каждый сценарий, который использует файловую фикстуру, должен жить в отдельной директории формата:

- `NNN-scenario-name`

Примеры:

- `001-basic-modified-file`
- `014-combined-diff-skipped`
- `023-github-patch-omitted`

### 4. Git-based fixture repositories

Git-based fixture repository является каноническим способом тестирования `parseGitDiff` для supported CLI cases.

Каждый git-based scenario должен лежать в:

- `services/git-diff-parser/__tests__/fixtures/git-cli/repos/NNN-scenario-name`

Обязательные файлы внутри такого сценария:

- `setup.sh` — shell-script, который создаёт детерминированный mini-repo в переданной временной директории
- `manifest.json` — статическое описание сценария
- `expected.json` — ожидаемый `ParsedDiff`

Опционально:

- `README.md` — если сценарий сложный

#### 4.1. Контракт `setup.sh`

`setup.sh` обязан:

1. Создавать repo с нуля во временной директории, а не опираться на текущее состояние основного monorepo.
2. Выполнять все git-операции через shell-вызовы.
3. Настраивать локальный git config, достаточный для детерминированных commit hash:
   - `user.name`
   - `user.email`
   - фиксированные author/committer dates
4. Печатать в stdout машиночитаемый JSON с минимум такими полями:
   - `repoPath`
   - `fromRef`
   - `toRef`
   - `gitDiffCommand`
5. Не использовать сеть и не требовать внешних зависимостей кроме `git` и стандартного shell.

Пример ожидаемого stdout JSON:

```json
{
  "repoPath": "/tmp/git-diff-fixtures/001-basic-modified-file",
  "fromRef": "abc123",
  "toRef": "def456",
  "gitDiffCommand": "git diff --find-renames=50% abc123 def456"
}
```

#### 4.2. Контракт `manifest.json`

`manifest.json` должен описывать сценарий минимум такими полями:

- `scenarioId`
- `kind`: `git-cli-repo`
- `description`
- `covers`
- `notes` — опционально

Каноническим идентификатором fixture-сценария является `scenarioId`, а не commit hash.

Commit hash:

- должен использоваться как runtime-данные для получения diff;
- может фиксироваться в логах и debug-output;
- не должен быть единственным человекочитаемым идентификатором сценария в тестовом наборе.

Поле `covers` должно явно перечислять, что именно покрывает этот сценарий, например:

- `basic-modified-file`
- `rename-with-similarity`
- `binary-file`
- `combined-diff`
- `ansi-colored-output`

#### 4.3. Обязательное правило выполнения

Тест не должен читать raw diff из заранее сохранённого `input.diff` для git-based сценария.

Вместо этого тест обязан:

1. вызвать `setup.sh` через shell;
2. получить `fromRef` и `toRef`;
3. получить raw diff повторным shell-вызовом `git` по данным из `setup.sh`;
4. передать именно этот raw diff в `parseGitDiff`.

Иными словами:

- source of truth для supported CLI fixtures — git history;
- commit hash и shell-команда являются частью тестового контракта;
- сохранённый `expected.json` проверяет parser result, а не подменяет собой источник diff.

### 5. Synthetic raw diff fixtures

Synthetic fixture используется только там, где Git не может честно и стабильно сгенерировать нужный вход или где ожидается намеренно сломанный raw diff.

Каждый synthetic Git CLI scenario должен лежать в:

- `services/git-diff-parser/__tests__/fixtures/git-cli/synthetic/NNN-scenario-name`

Разрешённые файлы:

- `input.diff`
- `expected.json`
- `options.json` — опционально
- `README.md` — опционально

Synthetic fixture допустим для:

- повреждённой строки `index ...`;
- отсутствующих `---` / `+++`;
- незакрытой quoted path;
- невалидного hunk header;
- намеренно оборванного hunk;
- multi-file recovery сценария, в котором один блок повреждён вручную;
- иных malformed raw diff cases.

Предпочтительный способ создания synthetic fixture:

- сначала получить реальный diff через git-based scenario;
- затем точечно исказить его до требуемого malformed состояния;
- описать это в `README.md`, если искажение нетривиально.

### 6. Provider DTO fixtures

Для GitHub/GitLab сценариев используются JSON fixtures, потому что адаптеры тестируют не shell-output Git, а нормализованные provider DTO.

Каждый provider scenario должен лежать в:

- `services/git-diff-parser/__tests__/fixtures/github/NNN-scenario-name`
- `services/git-diff-parser/__tests__/fixtures/gitlab/NNN-scenario-name`

Разрешённые файлы:

- `input.json`
- `expected.json`
- `options.json` — опционально
- `README.md` — опционально

### 7. Разрешённые файлы внутри fixture-сценария

Для raw Git CLI сценариев:

- для `git-cli/repos`: `setup.sh`, `manifest.json`, `expected.json`
- для `git-cli/synthetic`: `input.diff`, `expected.json`, `options.json` — опционально

Для GitHub/GitLab сценариев:

- `input.json` — массив нормализованных DTO, описанных в [task-спецификации](./services/git-diff-parser/git-diff-parser.task.spec.md)
- `expected.json` — ожидаемый `ParsedDiff`
- `options.json` — опционально

Допустимо дополнительное `README.md` внутри fixture-директории, если сценарий сложный и требует пояснения.

### 8. Правила содержимого фикстур

1. Один fixture-сценарий должен покрывать один логический кейс.
2. Если сценарий требует восстановления после ошибки, в одном `input.diff` допустимы несколько файлов, но только если это часть одного сценария.
3. `expected.json` должен быть записан как канонический результат парсинга и форматирован стабильно.
4. В `expected.json` обязательно проверяются:
   - `type`
   - `oldPath`
   - `newPath`
   - все служебные флаги
   - `oldMode` / `newMode`, если они должны присутствовать
   - `similarity`, если она ожидается
   - `hunks`
   - `warnings`
5. Порядок элементов в `warnings` фиксируется по порядку обнаружения.
6. Для corrupted-сценариев в `expected.json` должен быть отражён фактически сохранённый partial file result, если он допускается task-spec.
7. Для git-based fixtures commit hash должны получаться из `setup.sh` и shell-вызова `git`, а не захардкоживаться в тестовом коде как единственный источник истины.

### 9. Что не должно храниться как fixture-файл

Следующие сценарии не должны коммититься как огромные статические фикстуры:

- искусственный diff на 500,000 строк;
- генеративные large-input кейсы для memory behavior;
- микросценарии `StringScanner` и `git-path-parser`, состоящие из одной-двух строк.

Для них должны использоваться builder/helper-функции прямо в тесте.

### 10. Специальные требования к фикстурам

1. ANSI-сценарии должны содержать реальные escape-последовательности, а не их текстовое описание.
2. Malformed fixtures нельзя "подчищать" ради удобства чтения; они должны сохранять ровно тот сломанный ввод, который проверяется.
3. Quoted-path fixtures должны содержать именно тот формат escaping, который обязан поддержать parser.
4. GitHub/GitLab `input.json` должен соответствовать нормализованным DTO сервиса, а не полному raw ответу внешнего API.
5. Для каждого обязательного warning-кода из task-spec должен существовать минимум один отдельный fixture-сценарий.
6. Git-based fixture repos не должны строиться внутри текущего monorepo; они поднимаются только во временной директории.
7. Shell-команда, которой получается diff, должна быть частью fixture contract и не должна восстанавливаться тестом "по памяти".
8. Для git-based fixtures запрещено подменять raw diff заранее сохранённым файлом, если тот же сценарий можно получить реальным вызовом `git`.

## Общий тестовый подход

### Что проверяется через файловые fixtures

Через fixtures обязательно проверяются:

- `parseGitDiff`
- `parseGitHubDiff`
- `parseGitLabDiff`
- сложные multi-file и corruption-сценарии
- all-warning coverage

### Что проверяется inline без fixture-файлов

Inline в тестах должны задаваться:

- короткие сценарии `StringScanner`
- короткие сценарии `git-path-parser`
- часть unit-сценариев `patch-parser`
- structural assertions для `public-api-contract.test.ts`

## Матрица выбора источника фикстуры

### Должно быть git-based через shell

Следующие сценарии должны, где это технически возможно, тестироваться через `git-cli/repos`:

- базовый modified file;
- rename и similarity;
- binary file;
- metadata-only change;
- combined diff;
- ANSI-colored output;
- quoted path и escape-последовательности;
- trailing mode в `index ...`;
- unsupported whole input, если он честно получается через Git-команду другого формата;
- unsupported `--word-diff`, если сценарий строится через реальный вызов Git.

Если конкретный сценарий из этого списка не удаётся сделать стабильным через git-based repo в CI, fallback на synthetic fixture допустим только при двух условиях:

1. в fixture-директории есть `README.md` с объяснением, почему git-based вариант нестабилен или неприменим;
2. synthetic input всё равно основан на реальном git output или максимально близок к нему по форме.

### Должно быть synthetic

Следующие сценарии должны тестироваться через `git-cli/synthetic`:

- повреждённая строка `index ...`;
- отсутствующие `---` / `+++`;
- незакрытая quoted path;
- невалидный hunk header;
- намеренно оборванный hunk;
- multi-file corruption recovery, если повреждение достигается только ручным искажением raw diff.

### Должно быть provider DTO fixture

Следующие сценарии должны тестироваться только через JSON fixtures:

- все сценарии `parseGitHubDiff`;
- все сценарии `parseGitLabDiff`;
- source flags наподобие `isTooLarge` и `isLFS`, когда они являются частью provider DTO, а не raw git output.

## BDD-сценарии

---

## Группа 0. Публичный контракт и package-level проверки

Файл: `public-api-contract.test.ts`

### Кейс 0.1: Публичный export surface совпадает со спецификацией

- Given: импорт из `services/git-diff-parser/index.ts`
- When: тест получает список экспортируемых runtime-symbols и type-level entrypoints
- Then: наружу доступны только элементы, перечисленные в [task-спецификации](./services/git-diff-parser/git-diff-parser.task.spec.md), и отсутствуют внутренние low-level модули

### Кейс 0.2: `GitDiffParserStrictModeError` соответствует контракту

- Given: публичный класс ошибки strict mode
- When: тест создает или перехватывает экземпляр ошибки
- Then: ошибка является наследником `Error` и содержит `partialResult` и `filesWithWarnings`

### Кейс 0.3: В runtime `dependencies` отсутствуют

- Given: package manifest сервиса
- When: тест или статическая проверка читает раздел `dependencies`
- Then: runtime dependencies отсутствуют полностью

---

## Группа 1. `StringScanner`

Файл: `string-scanner.test.ts`

### Кейс 1.1: Пустой input

- Given: пустая строка
- When: scanner вызывается на чтение
- Then: `hasNext()` и `readLine()` корректно показывают отсутствие строк

### Кейс 1.2: Обычная строка с `\n`

- Given: input с одной строкой и завершающим `\n`
- When: scanner читает первую строку
- Then: возвращается корректный `LineView` без символа перевода строки

### Кейс 1.3: Строка с `\r\n`

- Given: input в CRLF формате
- When: scanner читает строку
- Then: `end` указывает на `\r`, а не на `\n`

### Кейс 1.4: Последняя строка без завершающего newline

- Given: input без финального `\n`
- When: scanner доходит до конца
- Then: последняя строка возвращается корректно, а следующий вызов возвращает `null`

### Кейс 1.5: Курсор движется монотонно

- Given: многострочный input
- When: scanner последовательно читает строки
- Then: `cursor` никогда не остаётся на прежнем месте и не откатывается назад

---

## Группа 2. `git-path-parser`

Файл: `git-path-parser.test.ts`

### Кейс 2.1: Unquoted path без пробелов

- Given: простая строка пути в git header
- When: path parser разбирает путь
- Then: путь извлекается без изменений

### Кейс 2.2: Quoted path с пробелами

- Given: quoted git path c пробелами
- When: path parser разбирает строку
- Then: возвращается путь без кавычек и без потери пробелов

### Кейс 2.3: Escape-последовательности в quoted path

- Given: quoted path с `\\`, `\"`, `\t`, `\n`
- When: path parser выполняет unquoting
- Then: escape-последовательности интерпретируются корректно

### Кейс 2.4: Octal escape

- Given: quoted path с octal escape
- When: path parser выполняет разбор
- Then: путь декодируется в ожидаемое значение

### Кейс 2.5: Незакрытая quoted path

- Given: строка пути с незакрытой кавычкой
- When: path parser обрабатывает вход
- Then: сценарий считается ошибкой формата и должен быть распознан как corruption trigger на уровне file parsing

---

## Группа 3. `patch-parser`

Файл: `patch-parser.test.ts`

### Кейс 3.1: Один валидный hunk

- Given: patch с одним корректным `@@ -a,b +c,d @@`
- When: patch parser разбирает вход
- Then: возвращается один `DiffHunk` с корректными line numbers и без warnings

### Кейс 3.2: Header без явных счётчиков

- Given: hunk header вида `@@ -1 +1 @@`
- When: patch parser разбирает header
- Then: оба счётчика считаются равными `1`

### Кейс 3.3: Header с context

- Given: header с текстом после второго `@@`
- When: parser извлекает metadata hunk
- Then: `DiffHunk.context` сохраняется без trim

### Кейс 3.4: `\ No newline at end of file`

- Given: patch с no-newline marker
- When: parser обрабатывает hunk body
- Then: marker попадает в `NoNewlineLine` и не меняет virtual line counters

### Кейс 3.5: Строка кода содержит текст `diff --git`

- Given: внутри hunk есть удалённая или добавленная строка, текст которой содержит `diff --git`
- When: parser находится внутри тела hunk
- Then: строка трактуется как code line и не завершает файл

### Кейс 3.6: Metadata-only change без hunk

- Given: file header был распознан, но ни одного `@@` дальше нет
- When: patch parser завершает обработку файла
- Then: возвращается пустой массив `hunks` без ложной ошибки

### Кейс 3.7: Hunk оборван до завершения счётчиков

- Given: patch прерывается EOF или новым file marker раньше времени
- When: parser завершает hunk досрочно
- Then: добавляется `WARN_HUNK_TRUNCATED_UNEXPECTEDLY`, при этом parser корректно возвращает управление вызывающему слою

---

## Группа 4. `parseGitDiff` happy-path и supported behavior

Файл: `parse-git-diff.test.ts`

### Кейс 4.1: Базовый modified file

- Given: git-based fixture repo с одним обычным modified unified diff файлом
- When: вызывается `parseGitDiff`
- Then: результат совпадает с `expected.json`

### Кейс 4.2: Rename c similarity и правильным приоритетом путей

- Given: git-based fixture repo, в котором одновременно присутствуют `diff --git`, `rename from/to`, `---/+++`
- When: вызывается `parseGitDiff`
- Then: итоговые `oldPath/newPath` берутся по приоритету из `rename from/to`, а `similarity` сохраняется

### Кейс 4.3: Binary file

- Given: git-based fixture repo с `Binary files ... differ` или `GIT binary patch`
- When: вызывается `parseGitDiff`
- Then: файл помечается как `isBinary: true`, а `hunks` остаётся пустым

### Кейс 4.4: Metadata-only change

- Given: git-based fixture repo с изменением mode или rename без hunks
- When: вызывается `parseGitDiff`
- Then: файл корректно парсится без ложного corruption-флага

### Кейс 4.5: Combined diff

- Given: git-based fixture repo, дающий на shell-вызове `git` combined diff, начинающийся с `diff --cc` или `diff --combined`
- When: вызывается `parseGitDiff`
- Then: файл помечается `isCombined: true`, `hunks` пуст, а в `warnings` есть `WARN_COMBINED_DIFF_SKIPPED`

### Кейс 4.6: ANSI-colored input

- Given: git-based fixture repo и shell-команда `git`, возвращающая diff с реальными ANSI escape-последовательностями
- When: вызывается `parseGitDiff`
- Then: ANSI stripping не ломает разбор результата

### Кейс 4.7: Submodule/gitlink change

- Given: git-based fixture repo с mode `160000` или явной строкой `Submodule ...`, если сценарий стабильно воспроизводим через shell
- When: вызывается `parseGitDiff`
- Then: файл помечается `isSubmodule: true`, а обычный patch не разбирается

### Кейс 4.8: Quoted path и escape-последовательности в имени файла

- Given: git-based fixture repo с quoted path, содержащим пробелы и escaping
- When: вызывается `parseGitDiff`
- Then: путь декодируется корректно и попадает в `oldPath/newPath`

### Кейс 4.9: `index` line с trailing mode

- Given: git-based fixture repo со строкой `index <old>..<new> 100644` без отдельных `old mode` / `new mode`
- When: вызывается `parseGitDiff`
- Then: `oldMode` и `newMode` устанавливаются из trailing mode

---

## Группа 5. `parseGitDiff` corruption и unsupported behavior

Файл: `parse-git-diff-corruption.test.ts`

### Кейс 5.1: Unsupported whole input

- Given: git-based fixture repo или synthetic input, который не содержит `diff --git`, `diff --cc` и `diff --combined`
- When: вызывается `parseGitDiff`
- Then: возвращается пустой `ParsedDiff`

### Кейс 5.2: Некорректная строка `index ...`

- Given: synthetic fixture с повреждённой строкой `index ...`
- When: вызывается `parseGitDiff`
- Then: файл помечается `isCorrupted: true`, получает `WARN_INVALID_INDEX_LINE`, а parser продолжает обработку следующих файлов

### Кейс 5.3: Отсутствуют `---` и `+++` перед первым `@@`

- Given: synthetic fixture с unified hunk, но без обязательных path headers
- When: вызывается `parseGitDiff`
- Then: файл помечается `isCorrupted: true` и получает `WARN_MISSING_PATH_HEADERS`

### Кейс 5.4: Незакрытая quoted path

- Given: synthetic fixture с незакрытой quoted path в `diff --git` или `rename from/to`
- When: вызывается `parseGitDiff`
- Then: файл помечается `isCorrupted: true` и получает `WARN_UNTERMINATED_QUOTED_PATH`

### Кейс 5.5: Невалидный hunk header

- Given: synthetic fixture со строкой, похожей на `@@ ... @@`, но не соответствующей unified syntax
- When: вызывается `parseGitDiff`
- Then: файл помечается `isCorrupted: true` и получает `WARN_INVALID_HUNK_HEADER`

### Кейс 5.6: Unsupported per-file format (`--word-diff`)

- Given: git-based fixture repo или synthetic fixture с неподдерживаемым patch-форматом на уровне одного файла
- When: вызывается `parseGitDiff`
- Then: файл помечается `isCorrupted: true` и получает `WARN_UNSUPPORTED_FILE_FORMAT`

### Кейс 5.7: Повреждённый первый файл не мешает разобрать следующий

- Given: synthetic multi-file fixture, где первый файл повреждён, а второй валиден
- When: вызывается `parseGitDiff`
- Then: второй файл корректно попадает в итоговый `ParsedDiff`

### Кейс 5.8: Truncated hunk не теряет уже завершённые данные

- Given: synthetic fixture, где один hunk завершён, а следующий обрывается
- When: вызывается `parseGitDiff`
- Then: уже завершённый hunk сохраняется, а warning фиксируется только для оборванной части

---

## Группа 6. `parseGitHubDiff`

Файл: `parse-github-diff.test.ts`

### Кейс 6.1: `added` file

- Given: fixture c одним GitHub DTO со статусом `added`
- When: вызывается `parseGitHubDiff`
- Then: `oldPath = '/dev/null'`, `newPath = filename`, а тип файла равен `added`

### Кейс 6.2: `removed` file

- Given: fixture со статусом `removed`
- When: вызывается `parseGitHubDiff`
- Then: `newPath = '/dev/null'`, а тип файла равен `deleted`

### Кейс 6.3: `renamed` file

- Given: fixture со статусом `renamed` и `previousFilename`
- When: вызывается `parseGitHubDiff`
- Then: old/new path и `type` совпадают со спецификацией

### Кейс 6.4: Patch omitted by source

- Given: fixture без `patch`
- When: вызывается `parseGitHubDiff`
- Then: файл получает `isTooLarge: true` и `WARN_PATCH_OMITTED_BY_SOURCE`

### Кейс 6.5: Binary file

- Given: fixture с `isBinary: true`
- When: вызывается `parseGitHubDiff`
- Then: patch-content не разбирается

### Кейс 6.6: Явный `isTooLarge` сохраняется

- Given: fixture, где `isTooLarge: true` уже передан источником
- When: вызывается `parseGitHubDiff`
- Then: этот флаг сохраняется в результате независимо от того, есть ли `patch`

### Кейс 6.7: Явный `isLFS` сохраняется

- Given: fixture, где `isLFS: true` передан источником
- When: вызывается `parseGitHubDiff`
- Then: результат сохраняет `isLFS: true`

---

## Группа 7. `parseGitLabDiff`

Файл: `parse-gitlab-diff.test.ts`

### Кейс 7.1: New file

- Given: fixture с `newFile: true`
- When: вызывается `parseGitLabDiff`
- Then: файл определяется как `added`

### Кейс 7.2: Deleted file

- Given: fixture с `deletedFile: true`
- When: вызывается `parseGitLabDiff`
- Then: файл определяется как `deleted`

### Кейс 7.3: Renamed file

- Given: fixture с `renamedFile: true`
- When: вызывается `parseGitLabDiff`
- Then: файл определяется как `renamed`

### Кейс 7.4: Missing diff

- Given: fixture без `diff`
- When: вызывается `parseGitLabDiff`
- Then: файл получает `isTooLarge: true` и `WARN_PATCH_OMITTED_BY_SOURCE`

### Кейс 7.5: Symlink через mode `120000`

- Given: fixture, где `aMode` или `bMode` равен `120000`
- When: вызывается `parseGitLabDiff`
- Then: файл помечается `isBinary: true`

### Кейс 7.6: Submodule через mode `160000`

- Given: fixture, где `aMode` или `bMode` равен `160000`
- When: вызывается `parseGitLabDiff`
- Then: файл помечается `isSubmodule: true`

### Кейс 7.7: Явный `isTooLarge` сохраняется

- Given: fixture, где `isTooLarge: true` уже пришёл от источника
- When: вызывается `parseGitLabDiff`
- Then: этот флаг сохраняется в результате

### Кейс 7.8: Явный `isLFS` сохраняется

- Given: fixture, где `isLFS: true` пришёл от источника
- When: вызывается `parseGitLabDiff`
- Then: результат сохраняет `isLFS: true`

---

## Группа 8. Strict mode

Файл: `strict-mode.test.ts`

### Кейс 8.1: `parseGitDiff` в tolerant mode не бросает исключение

- Given: fixture, который порождает warning
- When: вызывается `parseGitDiff` без `strictMode`
- Then: результат возвращается как `ParsedDiff` без throw

### Кейс 8.2: `parseGitDiff` в strict mode бросает ошибку после полного разбора входа

- Given: multi-file fixture, где один файл даёт warning, а другой валиден
- When: вызывается `parseGitDiff(..., { strictMode: true })`
- Then: выбрасывается `GitDiffParserStrictModeError`, а `partialResult` содержит оба разобранных файла

### Кейс 8.3: `parseGitHubDiff` в strict mode

- Given: fixture GitHub, содержащий warning-сценарий
- When: вызывается `parseGitHubDiff(..., { strictMode: true })`
- Then: выбрасывается `GitDiffParserStrictModeError` с корректным `partialResult`

### Кейс 8.4: `parseGitLabDiff` в strict mode

- Given: fixture GitLab, содержащий warning-сценарий
- When: вызывается `parseGitLabDiff(..., { strictMode: true })`
- Then: выбрасывается `GitDiffParserStrictModeError` с корректным `partialResult`

### Кейс 8.5: `filesWithWarnings` содержит только проблемные файлы

- Given: результат strict mode со смесью чистых и warning-файлов
- When: тест анализирует объект ошибки
- Then: `filesWithWarnings` содержит только те `FileDiff`, у которых `warnings.length > 0`

---

## Группа 9. Производительность и устойчивость

Файл: `performance.test.ts`

### Кейс 9.1: Large input не требует разбиения на массив строк

- Given: сгенерированный большой diff на 500,000 строк
- When: вызывается `parseGitDiff`
- Then: тест подтверждает, что parser завершается без OOM и без поведения, характерного для `split('\n')` стратегии

### Кейс 9.2: Parser продолжает работу после corruption trigger

- Given: большой multi-file input, где один файл повреждён посередине потока
- When: вызывается `parseGitDiff`
- Then: parser корректно восстанавливается и продолжает разбор следующих файлов

### Кейс 9.3: Порядок warnings детерминирован

- Given: сценарий, где у одного файла может возникнуть несколько warnings
- When: parser завершает разбор
- Then: порядок `warnings` стабилен и соответствует порядку обнаружения

---

## Матрица обязательного покрытия warning-кодов

Каждый обязательный warning-код из [task-спецификации](./services/git-diff-parser/git-diff-parser.task.spec.md) должен иметь минимум один dedicated test-case:

1. `WARN_HUNK_TRUNCATED_UNEXPECTEDLY`
2. `WARN_PATCH_OMITTED_BY_SOURCE`
3. `WARN_COMBINED_DIFF_SKIPPED`
4. `WARN_UNSUPPORTED_FILE_FORMAT`
5. `WARN_INVALID_INDEX_LINE`
6. `WARN_MISSING_PATH_HEADERS`
7. `WARN_UNTERMINATED_QUOTED_PATH`
8. `WARN_INVALID_HUNK_HEADER`

## Контрольный список качества тестового набора

- все обязательные сценарии из этого документа реализованы;
- каждый публичный parser покрыт happy-path, degraded-path и strict-mode поведением;
- low-level модули покрыты отдельными unit-тестами;
- fixture-структура соответствует этому документу;
- все валидные `parseGitDiff` CLI-сценарии, которые Git умеет воспроизводить, построены через git-based fixtures и shell-вызов `git`;
- synthetic fixtures используются только там, где реальный Git fixture не даёт нужного malformed/provider сценария;
- fallback с git-based на synthetic имеет явное письменное обоснование в fixture `README.md`;
- `expected.json` используется как канонический expected result для parser-level тестов;
- giant fixtures не коммитятся статически, а генерируются в тесте;
- каждый mandatory warning-code покрыт минимум одним отдельным сценарием;
- corrupted multi-file recovery проверен минимум одним dedicated тестом;
- тесты не подменяют спецификацию snapshot-обновлением;
- перед обновлением `expected.json` ожидаемое поведение сверяется с [task-спецификацией](./services/git-diff-parser/git-diff-parser.task.spec.md).
