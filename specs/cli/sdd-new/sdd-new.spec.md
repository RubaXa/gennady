# Module: `sdd-new`

**Module:** sdd-new · **Parent scope:** [cli](../cli.spec.md) · **Task:** bootstrap — SDD v2 tooling, block L1 (без тикета; см. ai/sdd-v2-plan.md (удалён))

<!--SECTION:MODULE_VISION-->

## 1. Module Vision

Скаффолд одного SDD v2 артефакта (scope spec любого `scope-type`, module spec, task ticket, project portal) из единого реестра шаблонов `shared/sdd/templates.ts` — того же реестра, из которого `shared/sdd/check.ts` выводит `REQUIRED_SECTIONS` / `MODULE_REQUIRED_V2` / `FOLD_REQUIRED_V2`. До этого модуля три источника правды о структуре артефактов (литеральные скелеты в `ai/kit/contract/spec/*.xml`, ручные списки в `check.ts`, построчная сборка в `migration-move.ts`) не были связаны; `sdd-new` — первый потребитель, который читает и записывает по реестру напрямую, а не копирует markdown вручную.

**Key properties:**

- Single source of truth — скелет пишется байт-в-байт из `TEMPLATES[<kind>].skeleton`; тот же реестр гонит derived-списки в `check.ts`
- Never-overwrite — существующий файл по вычисленному (или явному `--out`) пути никогда не перезаписывается
- Manifest-on-create — успешный вызов возвращает не только путь, но и таблицу секций (имя · REQUIRED/OPTIONAL · FOLD · что заполнить) — контракт «что агенту делать дальше»
- `--manifest` — та же таблица секций для `<kind>`, БЕЗ создания файла и БЕЗ требования `--scope`/`--owner`/`--module`/`--id`; для `task` дополнительно печатает закрытую owner-матрицу
- `--out` побеждает только конвенцию пути; для `task` он repo-relative, остаётся внутри `specs/`, не проходит через symlink и обязан сам доказать ровно одного canonical owner; explicit `--scope`/`--module` только сверяют доказанное владение
- `task` требует явный `--owner`: легальны только infrastructure flat, product/library scope bootstrap и product/library module; обычная product/library реализация без module и любой interface owner запрещены
- Успешное создание `task` печатает path-aware copy-ready literals: ссылку на owning spec, bounded typed contract anchors, все канонические rule tuples (`id` + ticket-relative href) из `ai/directives/knowledge.xml` и полную строку Deferred Test Ownership; pathless `--manifest` только объясняет этот контракт и не выдумывает href

**Invariants:**

- `<kind>` ∈ `product | library | infrastructure | interface | module | task | module-index | scope-index | project-index | portal | research`
- `--module` любой глубины (`foo/bar/qux`, `AX_HIERARCHICAL_SPECS`) — каждый сегмент kebab-case (как имя scope); пустой/абсолютный/`..`-сегмент → `BAD_INVOCATION` (exit 4) до вычисления пути
- `project-index` не требует `--scope` (как `portal`) — путь фиксирован: `specs/3-tasks.md`
- exit `0` создано / `--list` / `--manifest` · `1` файл существует / ошибка записи / `ERR_CLI_SDD_NEW_SCOPE_NOT_DECOMPOSED` / `ERR_CLI_SDD_NEW_RULE_REGISTRY_INVALID` · `4` плохой вызов / неизвестный `<kind>` / невалидный `--module`
<!--/SECTION:MODULE_VISION-->

<!--SECTION:MODULE_USAGE_EXAMPLE-->

## 2. Module Usage Example

```bash
$ npx gennady sdd-new product --scope backend
[sdd-new] created product skeleton: specs/backend/backend.spec.md

Section                      Required  Fold  Fill
----------------------------  --------  ----  ----------------------------------------------
SCOPE_TYPE                    REQUIRED  -     Literal value `product` — identifies this…
VISION                        REQUIRED  -     Vision & primary goal — what this product…
...

$ npx gennady sdd-new module --scope backend --module auth
[sdd-new] created module skeleton: specs/backend/auth/auth.spec.md

$ npx gennady sdd-new task --owner module --scope backend --module auth --id AUTH-login-flow
[sdd-new] created task skeleton: specs/backend/auth/auth.task.AUTH-login-flow.md

# --- вложенный модуль (AX_HIERARCHICAL_SPECS) — имя модуля = последний сегмент ---
$ npx gennady sdd-new module --scope backend --module auth/tokens
[sdd-new] created module skeleton: specs/backend/auth/tokens/tokens.spec.md

$ npx gennady sdd-new module-index --scope backend --module auth
[sdd-new] created module-index skeleton: specs/backend/auth/auth.3-tasks.md

$ npx gennady sdd-new scope-index --scope backend
[sdd-new] created scope-index skeleton: specs/backend/backend.3-tasks.md

# --- project-index — как portal, --scope не нужен ---
$ npx gennady sdd-new project-index
[sdd-new] created project-index skeleton: specs/3-tasks.md

# --- research — MADR-гибрид; дату (сегодняшнюю) подставляет инструмент, оператор даёт только --slug ---
$ npx gennady sdd-new research --scope backend --slug ai-tooling-stack
[sdd-new] created research skeleton: specs/backend/research/2026-08-18-ai-tooling-stack.research.md

# --- уже существует: exit 1, файл не тронут ---
$ npx gennady sdd-new product --scope backend
[sdd-new] ERR_CLI_SDD_NEW_FILE_EXISTS: specs/backend/backend.spec.md
  sdd-new never overwrites an existing artifact. Edit it directly, or pass --out with a fresh path.

# --- манифест секций без создания файла, --scope/--module не нужны ---
$ npx gennady sdd-new module --manifest
[sdd-new] manifest for module:

Section                      Required  Fold  Fill
----------------------------  --------  ----  ----------------------------------------------
MODULE_VISION                 REQUIRED  -     What this module owns; link to the parent…
OVERVIEW                      REQUIRED  -     MANDATORY (AX_SPEC_MANDATORY_DIAGRAM)…
...

$ npx gennady sdd-new --list
[sdd-new] known kinds:
  product        specs/<scope>/<scope>.spec.md
  library        specs/<scope>/<scope>.spec.md
  infrastructure specs/<scope>/<scope>.spec.md
  interface      specs/<scope>/<scope>.spec.md
  module         specs/<scope>/<module>/<module>.spec.md
  task           specs/<scope>/<module>/<module>.task.<ACR>-<slug>.md
  module-index   specs/<scope>/<module...>/<module>.3-tasks.md
  scope-index    specs/<scope>/<scope>.3-tasks.md
  project-index  specs/3-tasks.md
  portal         specs/README.md
  research       specs/<scope>/research/<yyyy-mm-dd>-<slug>.research.md
```

<!--/SECTION:MODULE_USAGE_EXAMPLE-->

<!--SECTION:ENTITY_INVENTORY-->

## 3. Entity Inventory (Closed-World)

| Name                                                                         | Type           | Purpose                                                                                                                                                                  |
| ---------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `run`                                                                        | Command        | Точка входа CLI: `--list` / `<kind> --manifest` (короткое замыкание) / `<kind>` → resolve path → no-overwrite → write → report                                           |
| `resolvePath`                                                                | Utility        | `<kind>` + `--scope`/`--module`/`--id`/`--out` → target path (pure); `--module` любой глубины — имя файла = последний сегмент                                            |
| `validateScope`                                                              | Utility        | Единая one-segment kebab grammar для explicit/inferred scope до path resolution/write                                                                                    |
| `validateModulePath`                                                         | Utility        | `--module` (любой глубины) → причина невалидности или `null` (пустой/абсолютный/`..`/не-kebab-case сегмент)                                                              |
| `validateSlug`                                                               | Utility        | `research`'s `--slug` (один сегмент) → причина невалидности или `null` (пустой/не-kebab-case)                                                                            |
| `todayDateStamp`                                                             | Utility        | Сегодняшняя дата `yyyy-mm-dd` (wall clock, переопределяема для тестов) — инструмент, не оператор, подставляет её в путь `research`                                       |
| `renderList`                                                                 | Utility        | `--list` output: every kind + its `pathPattern`                                                                                                                          |
| `missingOptions` / `resolveTaskOutputOwnership`                              | Utility        | Для `task`: `--id` и `--owner` всегда обязательны; безопасный `--out` обязан доказать ровно одного SCOPE_TYPE-bearing owner                                              |
| `resolveScopeDecomposition`                                                  | Utility        | (`shared/sdd/module-specs`) scope type + non-empty Module Map ↔ exact canonical module-spec closure                                                                      |
| `TaskOwnerKind` / `resolveTaskOwnership`                                     | Type / Utility | Закрытые owner kinds + исчерпывающая проверка owner против scope type, decomposition и exact module                                                                      |
| `renderManifestTable` / `renderCreated` / `renderManifestReport`             | Utility        | (`sdd-new.types`) Section manifest table + success report text + `--manifest` report text (no path)                                                                      |
| `parseContractAnchors` / `parseRuleRegistry` / `renderTaskAuthoringLiterals` | Utility        | (`shared/sdd/task-authoring-literals`) Bounded typed contract anchors, канонические rule tuples и copy-ready owning/deferred literals относительно реального ticket path |
| `badInvocation` / `unknownKind` / `fileExists` / `writeFailed`               | Utility        | Diagnostic builders                                                                                                                                                      |
| `NewOutcome`                                                                 | Type           | `{ok:true,text,path}` либо `{ok:false,code,exitCode,message}`                                                                                                            |
| `TEMPLATES` / `ARTIFACT_KINDS`                                               | Value          | (`shared/sdd/templates`) Реестр скелетов + манифестов, единый источник правды                                                                                            |

<!--/SECTION:ENTITY_INVENTORY-->

<!--SECTION:MODULE_CONTRACTS-->

## 4. Module Contracts (DbC)

### 4.1 Artifact Scaffold

- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`, `e2e`

**Contract (DbC):**

- Preconditions:
  - `<kind>` — один из `ARTIFACT_KINDS`
  - неизвестный, повторный или value-флаг без значения даёт `BAD_INVOCATION` с canonical usage до filesystem access; каждый scalar/boolean option single-use; `--scope`, explicit или выведенный из task `--out`, — ровно один kebab-case segment (не путь, не `.`/`..`, не absolute)
  - Для `task` всегда присутствуют `--id` и ровно один `--owner` из `infrastructure-flat | scope-bootstrap | module`; task `--out` repo-relative, находится внутри `specs/`, не содержит symlink-компонентов и однозначно выводит единственного SCOPE_TYPE-bearing owner. Zero/multiple owners fail closed независимо от explicit `--scope`; `--scope`/`--module` только сверяют доказанного owner. Для остальных kind `--out` может заменить опции, нужные только для вычисления conventional path. `--manifest` остаётся отдельным read-only short circuit
  - `--module`, если задан, валиден: каждый `/`-сегмент непустой, не `.`/`..`, kebab-case (как имя scope) — иначе `BAD_INVOCATION` ДО вычисления пути
  - Для `task` `specs/<scope>/<scope>.spec.md` читается fail-closed: отсутствующий/нечитаемый файл, malformed/ambiguous `SCOPE_TYPE`, `interface` или неполное product/library разложение блокируют создание. `infrastructure-flat` принимает только infrastructure без module; `scope-bootstrap` — только complete product/library без module; `module` — только complete product/library с exact declared module. Обычный product/library task без module не имеет legal owner
- Postconditions:
  - Целевой файл не существовал до вызова → создан с содержимым `TEMPLATES[<kind>].skeleton` байт-в-байт, недостающие родительские директории созданы
  - Целевой файл уже существовал → ничего не записано, exit 1
  - Успех (без `--manifest`) → stdout содержит путь + таблицу секций (`Section | Required | Fold | Fill`) из `TEMPLATES[<kind>].sections`
  - `--manifest` → stdout содержит таблицу секций для `<kind>` (та же `TEMPLATES[<kind>].sections`); task manifest также содержит закрытую owner-матрицу, никакой файл не создаётся и не проверяется на существование
- Invariants:
  - `--out`, если задан, переопределяет только путь по конвенции и не отменяет task identity/decomposition preconditions; его scope inference структурный и fail-closed, не догадка по имени файла
  - `--manifest` проверяется ПОСЛЕ валидации `<kind>`, но ДО `missingOptions`/`resolvePath`/no-overwrite/записи — неизвестный `<kind>` с `--manifest` всё равно даёт `UNKNOWN_KIND`
  - Скелет никогда не выдумывается по месту — только literal-копия из реестра

<!--/SECTION:MODULE_CONTRACTS-->

<!--SECTION:PUBLIC_OPTIONS-->

## 5. Public Options & Policies

| Argument          | Type    | Description                                                                                                                                                      |
| ----------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<kind>`          | string  | `product \| library \| infrastructure \| interface \| module \| task \| module-index \| scope-index \| project-index \| portal \| research`                      |
| `--scope <s>`     | string  | Один kebab-case segment, не путь. Для `task` explicit либо структурно выведен из `--out`; для других scope-aware kinds `--out` может заменить его как path input |
| `--module <m>`    | string  | Имя module любой глубины. Обязателен для kind `module` и task owner `module`; запрещён flat task owners; опционален для `module-index`                           |
| `--id <ACR-slug>` | string  | Task-ID slug. Для `task` обязателен всегда, в том числе с `--out`                                                                                                |
| `--owner <owner>` | enum    | Для `task` обязателен всегда: `infrastructure-flat \| scope-bootstrap \| module`; определяет один из трёх легальных ownership cases                              |
| `--slug <slug>`   | string  | Человекочитаемый kebab-case слаг. Обязателен для `research`; дату (сегодняшнюю) подставляет инструмент, не оператор                                              |
| `--out <path>`    | string  | Явный destination; для task — repo-relative non-symlink path внутри `specs/` с ровно одним structural owner; explicit identity только сверяет owner              |
| `--list`          | boolean | Вывести все известные kind + их `pathPattern` и завершиться                                                                                                      |
| `--manifest`      | boolean | Вывести таблицу секций для `<kind>` и завершиться — без создания файла, `--scope`/`--module`/`--id` не требуются                                                 |

Каждая option допускается не более одного раза. Повтор scalar или boolean mode отклоняется exit `4`
до `--list`/`--manifest` short circuit, path resolution и любой записи.

<!--/SECTION:PUBLIC_OPTIONS-->

<!--SECTION:FILE_STRUCTURE-->

## 6. File Structure

```
cli/cmd/sdd-new/
├── index.ts             # Entry point for dynamic import
├── sdd-new.cmd.ts        # Command: resolve path, no-overwrite guard, write skeleton, report
├── sdd-new.types.ts      # error codes, NewOutcome, manifest-table/report renderers, diagnostic builders
├── help.ts               # Help text output
└── __tests__/sdd-new.cmd.test.ts

shared/sdd/templates.ts   # ArtifactKind registry: skeleton + section manifest + pathPattern per kind
                           # + __tests__/templates.test.ts (derived-list parity with check.ts)
```

**Registration points:** `cli/gennady.ts` (dispatch + per-command help).
**E2E:** отложен. Покрытие: unit (pure `resolvePath`/`missingOptions` + `run` integration через tmp-dir + `--out`) + lint + typecheck.

<!--/SECTION:FILE_STRUCTURE-->

<!--SECTION:MODULE_DECISION_LOG-->

## 7. Module Decision Log

### D-NW008 — Task scaffold fail-closed до module decomposition

- **Status:** superseded by D-NW009
- **Why:** scaffold до module flow превращает незафиксированные границы в случайные task/file decisions. Проверка срабатывает при `sdd-new task`, требует `--scope` + `--id` независимо от `--out`, читает scope spec, принимает ровно один canonical `SCOPE_TYPE` и считает module specs. Отсутствующая, нечитаемая или неоднозначная evidence блокирует создание; `interface` реализуется owning product/library modules, а не прямыми interface tickets. Канонический `infrastructure` — единственный flat-scope exception.
- **Risk accepted:** Минимальный floor — одна module spec; качество decomposition обеспечивает integrated critic, не этот структурный guard.

### D-NW009 — Structural decomposition closure и fail-closed task ownership

- **Status:** superseded by D-NW013
- **Supersedes:** D-NW008
- **Why:** Наличие одного module-файла не доказывает завершённую декомпозицию и позволяло `--out` обойти ownership. `resolveScopeDecomposition` требует непустой Module Map и точное равенство его unique canonical links всем MODULE_VISION module specs на диске; этот SSOT используют task scaffold и integrated review-state. Task без `--scope` допускается только когда путь `--out` имеет ровно один SCOPE_TYPE-bearing ancestor; иначе CLI просит явный `--scope`.
- **Risk accepted:** Module identity задаётся явной markdown-ссылкой и canonical path `<module>/<module>.spec.md`; произвольные prose-упоминания намеренно не считаются членством.

### D-NW010 — Task ownership включает exact declared module

- **Status:** superseded by D-NW014 · **Extends:** D-NW009
- **Why:** `--module` больше не является свободной строкой: допустим только exact canonical `<module>/<leaf>.spec.md`, входящий в `resolveScopeDecomposition(...).moduleSpecs`. `--out` под module subtree выводит и scope, и deepest declared module; конфликт explicit/inferred ownership, ghost или ambiguous module краснеет до создания файла. Осознанный scope-level task без `--module` остаётся допустимым после complete decomposition; infrastructure остаётся flat.
- **Risk accepted:** Scope-level task внутри product/library — явная модель владения, не fallback для пути внутри объявленного module subtree.

### D-NW001 — Единый реестр шаблонов вместо трёх копий

- **Status:** active
- **Why:** До block L1 структура артефактов жила в трёх не связанных местах (`ai/kit/contract/spec/*.xml` скелеты, ручные `REQUIRED_SECTIONS`/`MODULE_REQUIRED_V2`/`FOLD_REQUIRED_V2` в `check.ts`, построчная сборка в `migration-move.ts`). `shared/sdd/templates.ts` — единственное место, откуда и `check.ts`, и `sdd-new` читают структуру; `check.ts`'s derived-списки — производные, не копии.
- **Risk accepted:** Нет.

### D-NW002 — `required` vs `loadBearing` как два разных флага

- **Status:** active
- **Why:** Часть секций контракт называет MANDATORY (например `OVERVIEW` — diagram, `AX_SPEC_MANDATORY_DIAGRAM`), но текущий механический гейт `REQUIRED_SECTIONS` их не перечисляет — они проверяются отдельным кодом (`SDD_NO_DIAGRAM_BLOCK`). Разделение `required` (семантика контракта) и `loadBearing` (что сегодня реально гейтит `check.ts`) позволяет derived-спискам совпасть с текущими значениями без искажения смысла `required`.
- **Risk accepted:** Нет — расширение строгости (перевод `required`-но-не-`loadBearing` секций в мех. гейт) сознательно вынесено за пределы этого блока.

### D-NW004 — Вложенные `--module` + `module-index`/`scope-index` kinds

- **Status:** active
- **Why:** `AX_HIERARCHICAL_SPECS` разрешает произвольную глубину под-модулей (`specs/<scope>/<a>/<b>/<b>.spec.md`), но `resolvePath` подставляла `--module` целиком в оба места пути — `--module foo/bar` давало битый `specs/<s>/foo/bar/foo/bar.spec.md`. Теперь имя файла = последний `/`-сегмент `--module`, директория = `--module` целиком; та же логика для `task`. Индексные kind (`module-index` → `<module>.3-tasks.md`, `scope-index` → `<scope>.3-tasks.md`) добавлены в реестр `shared/sdd/templates.ts` как обычные `ArtifactKind` — их скелеты 1:1 из `ai/kit/contract/scaffold/{module,scope}-tasks-index.xml`, которые теперь тянут скелет через `{{> "sdd-skeleton-<kind>"}}` вместо ручной копии (см. `ai/kit/render.ts`).
- **Risk accepted:** Вложенность разрешена только `--module`; `--scope` остаётся одной identity-единицей по D-NW011.

### D-NW005 — `--manifest`: манифест секций без создания файла

- **Status:** active
- **Why:** Флоу-симуляция (`ai/flow-sim/`) и агенты-роутеры должны показать оператору состав секций
  артефакта (например, на `STEP_1_CONFIRM` в `scope.directive`) ДО того, как решение создавать
  спеку принято — а значит до того, как есть `--scope`/`--module` для вычисления пути. `--manifest`
  читает `TEMPLATES[<kind>].sections` напрямую, минуя `missingOptions`/`resolvePath`/no-overwrite —
  та же таблица, что при создании, без побочных эффектов на диске.
- **Risk accepted:** Нет.

### D-NW006 — `project-index` kind: `specs/3-tasks.md`

- **Status:** active
- **Why:** `sdd-scaffold` STEP_5 материализует `specs/3-tasks.md` (проектный task-index — общие конвенции + cross-scope DAG + scope-rollup) по формат-директиве `PROJECT_TASKS_INDEX_STRUCTURE` (`ai/directives/sdd-v2/formats/project-tasks-index.xml`), но до этого решения реестр не знал такого kind — путь собирался вручную. `project-index` добавлен в `shared/sdd/templates.ts` как обычный `ArtifactKind`: скелет — 1:1 копия тела markdown-фенса формат-директивы (источник истины при расхождении с `ai/kit/contract/scaffold/project-tasks-index.xml`, который тянет тот же текст через партиал `{{> "sdd-skeleton-project-index"}}`); опций не требует, как `portal`.
- **Risk accepted:** Нет — секции без SECTION-анкоров (как `portal`/`scope-index`/`module-index`), мех. гейт `check.ts` их не проверяет.

### D-NW007 — `research` kind: MADR-гибрид, дату подставляет инструмент

- **Status:** active
- **Why:** Research-документы (MADR-гибрид: STATUS/PROBLEM/CRITERIA/OPTIONS/DECISION/CONSEQUENCES/EVIDENCE/RELATED) фиксируют обезличенное решение с проверяемыми источниками, а не сессионный дневник. Путь `specs/<scope>/research/<yyyy-mm-dd>-<slug>.research.md` требует и дату, и слаг; дату вычисляет `run()` (`todayDateStamp`, wall clock) и передаёт в `resolvePath` через `opts.date` — оператор задаёт только `--slug` (kebab-case, валидация как у `--module`-сегмента через `validateSlug`), никогда дату вручную. Never-overwrite (D-NW003) поэтому означает: второй вызов с тем же `--slug` в тот же день — `FILE_EXISTS`, не тихая перезапись.
- **Risk accepted:** Связность (битые ссылки на `*.research.md`, документы-сироты без входящей ссылки) — не в этом модуле; проверяется `sdd-check` (`SDD_RESEARCH_REF_BROKEN` / `SDD_RESEARCH_ORPHAN`).

### D-NW003 — Never-overwrite, не merge

- **Status:** active
- **Why:** Слияние существующего артефакта со свежим скелетом — риск тихой потери контента. `sdd-new` либо создаёт с нуля, либо отказывает (exit 1) — детерминированно и безопасно для повторных вызовов оператора/агента.
- **Risk accepted:** Нет.

### D-NW011 — Scope identity и CLI syntax fail closed до I/O

- **Status:** active
- **Why:** `--scope` задаёт identity-сегмент conventional path, а не произвольный путь: единая grammar принимает только kebab-case и отклоняет absolute, slash/backslash, `.`/`..` и пустое значение до `resolvePath`/write. То же правило применяется к owner, структурно выведенному для task `--out` после необходимого structural owner read. Raw option guard отдельно отклоняет unknown flags, лишний positional и value-флаги без значения, потому что permissive parser иначе стирал typo или превращал missing value в boolean `true`; diagnostic сразу печатает canonical invocation, без дополнительного `--help`.
- **Risk accepted:** Для non-task kinds explicit `--out` остаётся произвольным destination по существующему контракту; task-исключение с D-NW013 fail closed.

### D-NW012 — Option cardinality проверяется до short circuit и I/O

- **Status:** active · **Extends:** D-NW011
- **Why:** permissive argv parser упаковывает повторный scalar/boolean в массив, после чего команда могла молча выбрать неверную ветку или проигнорировать значение. Raw guard теперь принимает каждую option не более одного раза и возвращает exit 4 с canonical usage до `--list`/`--manifest`, ownership reads, path resolution и записи.
- **Risk accepted:** Нет; у `sdd-new` нет repeatable options.

### D-NW013 — Task `--out` доказывает owner и не проходит через symlink

- **Status:** active · **Supersedes:** D-NW009 · **Extends:** D-NW010, D-NW011
- **Why:** Explicit `--scope` раньше позволял task `--out` без owning ancestor записать файл вне `specs/`, а canonicalization следовала symlink-компонентам. Теперь task `--out` сам обязан быть exact repo-relative non-symlink path внутри `specs/` и иметь ровно одного SCOPE_TYPE-bearing ancestor; explicit `--scope`/`--module` только сверяют уже доказанное владение и не заменяют его. Absolute, `..`, zero/multiple owner и любой symlink component краснеют до `mkdir`/write; custom путь внутри доказанного scope/module subtree сохраняется.
- **Risk accepted:** Ограничение относится только к `task`, где путь является ownership evidence; у остальных kind `--out` остаётся явным destination и не интерпретируется как task owner.

### D-NW014 — Explicit exhaustive task owner

- **Status:** active · **Supersedes:** D-NW010 · **Extends:** D-NW013
- **Why:** Вывод owner только из наличия или отсутствия `--module` оставлял двусмысленный scope-level product/library task и расходился с DAG vocabulary. Task теперь всегда требует типизированный `--owner`; легальны ровно `infrastructure-flat` для infrastructure без module, `scope-bootstrap` для явного bootstrap complete product/library scope без module и `module` для обычной product/library работы с exact declared module. Interface и ordinary flat product/library fail closed; `--out` меняет путь, но не отменяет semantic owner.
- **Risk accepted:** CLI доказывает структурную допустимость bootstrap owner, а семантическую необходимость bootstrap формулирует scaffold DAG и проверяет review.

### D-NW015 — Path-aware task authoring literals принадлежат create output

- **Status:** active · **Extends:** D-NW005, D-NW014
- **Why:** Pathless manifest не способен честно назвать ticket-relative href, а агент, вычисляющий `../../../` или переводящий display-name правила в ID, воспроизводит ошибки `common` вместо registry ID `testing-common` и битые spec refs. После создания task команда уже знает фактический ticket path и typed owner: она печатает copy-ready owning-spec link, ID+href для каждого `<Rule>` из единственного registry `ai/directives/knowledge.xml`, полную допустимую Deferred Test Ownership row и bounded `contract-anchors` из структурных headings `Service|Port|Adapter|Component|Pattern|Value Object|Entity: <name>`. Slug вычисляет общий `headingSlug`; `<details>` не скрывает heading, fenced examples не считаются. Пустой набор печатается как explicit none. Duplicate slug или больше 40 anchors краснеет до записи task с owning-flow route. Scaffold выбирает применимые literals, но не сочиняет их байты и не перебирает `sdd-extract` guesses.
- **Risk accepted:** typed heading vocabulary закрыт намеренно; новый contract kind добавляется в общий parser/tests, а не угадывается из произвольного заголовка.
<!--/SECTION:MODULE_DECISION_LOG-->

<!--SECTION:INTER_MODULE_DEPENDENCIES-->

## 8. Inter-Module Dependencies

- **Depends on:** `shared/common/parse-args.ts`, `shared/sdd/templates.ts`, `#logger`
- **Provides to:** `gennady.ts`; вызывается оператором/агентом до `sdd-discover`/`sdd-module-decomposition`/`sdd-scaffold`, когда нужен пустой артефакт по конвенции, а не только через directive-скилы
<!--/SECTION:INTER_MODULE_DEPENDENCIES-->
