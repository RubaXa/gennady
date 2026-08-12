# Module: `sdd-new`

**Module:** sdd-new · **Parent scope:** [cli](../cli.spec.md) · **Task:** bootstrap — SDD v2 tooling, block L1 (без тикета; см. [ai/sdd-v2-plan.md](../../../ai/sdd-v2-plan.md))

<!--SECTION:MODULE_VISION-->

## 1. Module Vision

Скаффолд одного SDD v2 артефакта (scope spec любого `scope-type`, module spec, task ticket, project portal) из единого реестра шаблонов `shared/sdd/templates.ts` — того же реестра, из которого `shared/sdd/check.ts` выводит `REQUIRED_SECTIONS` / `MODULE_REQUIRED_V2` / `FOLD_REQUIRED_V2`. До этого модуля три источника правды о структуре артефактов (литеральные скелеты в `ai/kit/contract/spec/*.xml`, ручные списки в `check.ts`, построчная сборка в `migration-move.ts`) не были связаны; `sdd-new` — первый потребитель, который читает и записывает по реестру напрямую, а не копирует markdown вручную.

**Key properties:**

- Single source of truth — скелет пишется байт-в-байт из `TEMPLATES[<kind>].skeleton`; тот же реестр гонит derived-списки в `check.ts`
- Never-overwrite — существующий файл по вычисленному (или явному `--out`) пути никогда не перезаписывается
- Manifest-on-create — успешный вызов возвращает не только путь, но и таблицу секций (имя · REQUIRED/OPTIONAL · FOLD · что заполнить) — контракт «что агенту делать дальше»
- `--out` всегда побеждает конвенцию путей

**Invariants:**

- `<kind>` ∈ `product | library | infrastructure | interface | module | task | portal`
- exit `0` создано / `--list` · `1` файл существует / ошибка записи · `4` плохой вызов / неизвестный `<kind>`
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

$ npx gennady sdd-new task --scope backend --module auth --id AUTH-login-flow
[sdd-new] created task skeleton: specs/backend/auth/auth.task.AUTH-login-flow.md

# --- уже существует: exit 1, файл не тронут ---
$ npx gennady sdd-new product --scope backend
[sdd-new] ERR_CLI_SDD_NEW_FILE_EXISTS: specs/backend/backend.spec.md
  sdd-new never overwrites an existing artifact. Edit it directly, or pass --out with a fresh path.

$ npx gennady sdd-new --list
[sdd-new] known kinds:
  product        specs/<scope>/<scope>.spec.md
  library        specs/<scope>/<scope>.spec.md
  infrastructure specs/<scope>/<scope>.spec.md
  interface      specs/<scope>/<scope>.spec.md
  module         specs/<scope>/<module>/<module>.spec.md
  task           specs/<scope>/<module>/<module>.task.<ACR>-<slug>.md
  portal         specs/README.md
```

<!--/SECTION:MODULE_USAGE_EXAMPLE-->

<!--SECTION:ENTITY_INVENTORY-->

## 3. Entity Inventory (Closed-World)

| Name                                                           | Type    | Purpose                                                                               |
| -------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------- |
| `run`                                                          | Command | Точка входа CLI: `--list` или `<kind>` → resolve path → no-overwrite → write → report |
| `resolvePath`                                                  | Utility | `<kind>` + `--scope`/`--module`/`--id`/`--out` → target path (pure)                   |
| `renderList`                                                   | Utility | `--list` output: every kind + its `pathPattern`                                       |
| `missingOptions`                                               | Utility | Which required options are absent for `<kind>` (empty when `--out` given)             |
| `renderManifestTable` / `renderCreated`                        | Utility | (`sdd-new.types`) Section manifest table + success report text                        |
| `badInvocation` / `unknownKind` / `fileExists` / `writeFailed` | Utility | Diagnostic builders                                                                   |
| `NewOutcome`                                                   | Type    | `{ok:true,text,path}` либо `{ok:false,code,exitCode,message}`                         |
| `TEMPLATES` / `ARTIFACT_KINDS`                                 | Value   | (`shared/sdd/templates`) Реестр скелетов + манифестов, единый источник правды         |

<!--/SECTION:ENTITY_INVENTORY-->

<!--SECTION:MODULE_CONTRACTS-->

## 4. Module Contracts (DbC)

### 4.1 Artifact Scaffold

- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`, `e2e`

**Contract (DbC):**

- Preconditions:
  - `<kind>` — один из `ARTIFACT_KINDS`
  - Требуемые опции присутствуют: `--scope` для всех kind кроме `portal`; `--module` для `module`/`task`; `--id` для `task` — если только не задан `--out` (короткое замыкание)
- Postconditions:
  - Целевой файл не существовал до вызова → создан с содержимым `TEMPLATES[<kind>].skeleton` байт-в-байт, недостающие родительские директории созданы
  - Целевой файл уже существовал → ничего не записано, exit 1
  - Успех → stdout содержит путь + таблицу секций (`Section | Required | Fold | Fill`) из `TEMPLATES[<kind>].sections`
- Invariants:
  - `--out`, если задан, всегда переопределяет путь по конвенции
  - Скелет никогда не выдумывается по месту — только literal-копия из реестра

<!--/SECTION:MODULE_CONTRACTS-->

<!--SECTION:PUBLIC_OPTIONS-->

## 5. Public Options & Policies

| Argument          | Type    | Description                                                                     |
| ----------------- | ------- | ------------------------------------------------------------------------------- |
| `<kind>`          | string  | `product \| library \| infrastructure \| interface \| module \| task \| portal` |
| `--scope <s>`     | string  | Имя scope. Обязателен для всех kind кроме `portal` (если не задан `--out`)      |
| `--module <m>`    | string  | Имя module. Обязателен для `module` и `task`                                    |
| `--id <ACR-slug>` | string  | Task-ID slug. Обязателен для `task`                                             |
| `--out <path>`    | string  | Явный целевой путь — переопределяет конвенцию                                   |
| `--list`          | boolean | Вывести все известные kind + их `pathPattern` и завершиться                     |

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

### D-NW001 — Единый реестр шаблонов вместо трёх копий

- **Status:** active
- **Why:** До block L1 структура артефактов жила в трёх не связанных местах (`ai/kit/contract/spec/*.xml` скелеты, ручные `REQUIRED_SECTIONS`/`MODULE_REQUIRED_V2`/`FOLD_REQUIRED_V2` в `check.ts`, построчная сборка в `migration-move.ts`). `shared/sdd/templates.ts` — единственное место, откуда и `check.ts`, и `sdd-new` читают структуру; `check.ts`'s derived-списки — производные, не копии.
- **Risk accepted:** Нет.

### D-NW002 — `required` vs `loadBearing` как два разных флага

- **Status:** active
- **Why:** Часть секций контракт называет MANDATORY (например `OVERVIEW` — diagram, `AX_SPEC_MANDATORY_DIAGRAM`), но текущий механический гейт `REQUIRED_SECTIONS` их не перечисляет — они проверяются отдельным кодом (`SDD_NO_DIAGRAM_BLOCK`). Разделение `required` (семантика контракта) и `loadBearing` (что сегодня реально гейтит `check.ts`) позволяет derived-спискам совпасть с текущими значениями без искажения смысла `required`.
- **Risk accepted:** Нет — расширение строгости (перевод `required`-но-не-`loadBearing` секций в мех. гейт) сознательно вынесено за пределы этого блока.

### D-NW003 — Never-overwrite, не merge

- **Status:** active
- **Why:** Слияние существующего артефакта со свежим скелетом — риск тихой потери контента. `sdd-new` либо создаёт с нуля, либо отказывает (exit 1) — детерминированно и безопасно для повторных вызовов оператора/агента.
- **Risk accepted:** Нет.
<!--/SECTION:MODULE_DECISION_LOG-->

<!--SECTION:INTER_MODULE_DEPENDENCIES-->

## 8. Inter-Module Dependencies

- **Depends on:** `shared/common/parse-args.ts`, `shared/sdd/templates.ts`, `#logger`
- **Provides to:** `gennady.ts`; вызывается оператором/агентом до `sdd-discover`/`sdd-module-decomposition`/`sdd-scaffold`, когда нужен пустой артефакт по конвенции, а не только через directive-скилы
<!--/SECTION:INTER_MODULE_DEPENDENCIES-->
