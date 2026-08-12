# S11 — миграция v1→v2 целиком: `migration-v1-v2.directive` от STEP_0_SCAN до STEP_8_VERIFY

Проверяет: `migration-v1-v2.directive.xml` целиком, не только preflight-гейт (тот уже покрыт S2/S3).
Прогон идёт через все девять шагов (`STEP_0_SCAN` … `STEP_8_VERIFY`) до реального `--write` на каждом
уровне: layer-скаффолд, анкеры, закрытие `UNMAPPED`, operator ACK, замена ID (в тикетах И в коде),
перенос тикетов, restructure, финальная верификация и снятие слоя `migration/`. Отдельно проверяет
различие dry-run / `--write` — директива методично держит эту границу (`STEP_0_SCAN` — только
dry-run; `STEP_1_LAYER` — первый `--write`; `STEP_4_ACK` цитирует dry-run счётчики `ids --from-plan`
ДО того, как `STEP_5_IDS` тот же инструмент реально запускает с `--write`; `STEP_8_VERIFY` снова
гоняет `ids --from-plan` dry-run, теперь как финальный гейт «нечего делать»).

## Fixture

Изолированная песочница — git-репозиторий (`git init`), фикстура коммитится как baseline ДО запуска
флоу (`git add -A && git commit -m fixture-baseline`). Обязательно: `STEP_6_MOVE` делает `git mv`, а
Mission директивы прямо требует «under git (baseline first — every step is revertible)» — без
коммита-баз этот инвариант не проверить, а `git mv` без репозитория не работает.

**Легальные коммиты внутри прогона.** Кроме `fixture-baseline` (ДО флоу), директива сама коммитит
через `STEP_6_MOVE` (`git mv` внутри `sdd-migrate move --scope demo --write`) — это ЕДИНСТВЕННЫЙ
дополнительный коммит/индекс-эффект, легальный внутри этого прогона, и он принадлежит инструменту, не
Executor'у вручную. Executor НЕ коммитит от себя ни на одном шаге (ни после `STEP_1_LAYER`, ни после
`STEP_5_IDS`, ни после `STEP_7_RESTRUCTURE`) — рабочее дерево между `git mv` и финальным `## Stop`
остаётся uncommitted, `git diff`/`git status` читаются как «что сделал флоу с момента baseline» одним
непрерывным диффом (кроме самого `git mv`, зафиксированного инструментом). Ручной промежуточный
коммит, слитый по нескольким шагам, — находка («Импровизации», `PROTOCOL.md`), а если он слил move
(`git mv`) с restructure — `VIOLATED` по данному правилу (см. `PROTOCOL.md`, «Правила исполнителя»).

`package.json` (`typecheck`/`test`/`test:coverage`/`format` — инструментарий demo-фикстуры, ни один
из них не вызывается ни в одном Checkpoint этой карты, оставлены как есть, дословно фикстуре не важен
их путь; `lint` — реальная gennady-команда, поэтому репо-относительно, как везде в этой карте: все
`tool:`-вызовы `sdd-migrate`/`sdd-check`/`sdd-state`/`sdd-sync`/`lint` ниже — это сокращение для
`npx tsx <GENNADY_WORKTREE>/cli/gennady.ts <cmd> <args>`, НЕ `gennady <cmd>` напрямую и НЕ чужой
чекаут `~/Developer/gennady`; `<GENNADY_WORKTREE>` — абсолютный путь к worktree gennady, который
выдаёт оркестратор):

```json
{
  "name": "demo-project",
  "version": "0.1.0",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "lint": "npx tsx <GENNADY_WORKTREE>/cli/gennady.ts lint --all .",
    "format": "prettier --check ."
  }
}
```

`node_modules/.bin/gennady` (пустой файл — гейт readiness проверяет только наличие; сам `gennady`
вызывается через `npx tsx <GENNADY_WORKTREE>/cli/gennady.ts`, не через этот стаб):

```

```

`specs/README.md`:

```markdown
# demo-project

## Vision

Демо-проект для проверки миграции v1 → v2.

## Scopes

| Scope                         | Type    | Spec | Description |
| ----------------------------- | ------- | ---- | ----------- |
| [`demo`](./demo/demo.spec.md) | product | ✅   | Демо-скоуп  |
```

`specs/demo/demo.spec.md` (v1-спека — заголовки нумерованы, без `<!--SECTION:-->` якорей; три
заголовка узнаются курируемыми правилами `mapHeadingToSection`, один — «Notes» — не узнаётся ни одним
правилом и обязан остаться `UNMAPPED` после `sdd-migrate plan --write`):

```markdown
# Demo Scope

## 1. Vision

Демо-скоуп для проверки миграции v1 → v2 сквозным прогоном — от инвентаря до restructure.

## 2. Architecture

Один модуль `core` — вся логика внутри него.

## 3. Decision Log

### D-001 — Один модуль на старте

- **Status:** active
- **Why:** пока нет причин делить.

## 4. Notes

Свободные заметки по core: подумать про обработку невалидного ввода отдельным пайплайном.
```

`tasks/demo/README.md` (v1-трекер, два тикета — один из них процитирован из кода):

```markdown
# Demo — Tasks

| ID     | Module | Title                    | Status      |
| ------ | ------ | ------------------------ | ----------- |
| TSK-01 | core   | Реализовать ядро         | done        |
| TSK-02 | core   | Валидация входных данных | in-progress |
```

`tasks/demo/core/core.task-01.md`:

```markdown
# TSK-01 — Реализовать ядро

## Meta

- Purpose: базовая логика core-модуля demo
- Module: core
- Status: done

## Description

Инициализация core-модуля: структуры данных и точка входа.
```

`tasks/demo/core/core.task-02.md`:

```markdown
# TSK-02 — Валидация входных данных

## Meta

- Purpose: валидация входных данных перед обработкой в core
- Module: core
- Status: in-progress

## Description

Проверка формата входных данных перед вызовом core-логики.
```

`cli/demo/core/validate.ts` (единственная сквозная точка проверки: `STEP_5_IDS --write` обязан
заменить `TSK-01` в этом заголовке кода на новый slug-ID — не только в тикетах; путь взят внутри
`cli/`, а не гипотетического `src/`, — `sdd-migrate ids` бьёт по фиксированному списку зон
`ID_REPLACE_ZONES = ['specs', 'tasks', 'cli', 'shared', 'services', 'ai', 'e2e']`
(`shared/sdd/id-replace.ts`), и файл вне этого списка инструмент молча не тронет; `@file`/`@consumers`
заголовок добавлен сюда НАМЕРЕННО — без него `gennady lint` на этом файле бьёт
`ERR_CLI_LINT_MISSING_FILE`/`ERR_CLI_LINT_MISSING_CONSUMERS` (`cli/cmd/lint/checks/file-header.check.ts`),
шум, никак не связанный с тем, что проверяет Checkpoint 23/23a — фикстура его не должна producировать):

```ts
// @file: demo core input validation — placeholder for the inventory-reverse checkpoint.
// @consumers: N/A
// @tasks: TSK-01

export function validateInput(input: unknown): boolean {
  return typeof input === 'string' && input.length > 0;
}
```

## Entry

Скилл: `/sdd`. Директива входит «from the router preflight or any door» (`Mission`) — тот же
router-preflight маршрут, что в S2 (`FLOW_VERSION=v1` + запрос бьёт по `tasks/` layout целиком).
Первая реплика оператора:

> Переведи таски на новую раскладку — доведи миграцию до конца, не останавливайся на отчёте.

## Operator Script

1. На `STEP_4_ACK` (Approval Check по всему verified layer — units, Section/Ticket Map, derived ID
   map, что смёржится в STEP_7, что коснётся кода, И предложенный scope-type для `demo` —
   `product`, взятый из строки `demo` в `specs/README.md` Scopes-таблицы, где `Type` уже
   `product`) — ответ: «да, go, накатывай, scope-type product подтверждаю».
2. На вопрос оператору о снятии слоя `migration/` в конце `STEP_8_VERIFY» («With the operator's
confirmation remove the `migration/` layer») — ответ: «да, удаляй migration/».

## Stop

Сразу после того, как `STEP_8_VERIFY` прошёл финальный гейт всё-зелёное (`sdd-state` → `FLOW_VERSION=v2`
· `sdd-check --all .` clean · zero original Task-IDs и zero `*.task-*.md` имён · `sdd-migrate
ids --from-plan` DRY-RUN report «нечего делать» · каждый юнит `**Status:** DONE` ·
`gennady lint --spec=<module-spec> --inventory-reverse <module-code-dir>` clean) И оператор
подтвердил снятие каталога `migration/`, и он удалён с диска. Трейс заканчивается строкой
`stop: per-map — <это условие дословно>` (не `halt:` — это конец директивного лайфсайкла, отмеченный
картой, а не директивный `H_*`-гейт; директива сама на этом этапе «Return control to the caller»).

## Checkpoints

1. Единственная загрузка директивы — `directive: ai/directives/sdd-v2/migration-v1-v2.directive.xml
loaded`, обоснованная её собственным `Mission`: «Entered when `sdd-state` reports
   `FLOW_VERSION=v1` (a `tasks/` directory), from the router preflight or any door.»

2. `STEP_0_SCAN` — гейт `H_NOT_V1` не сработал: `sdd-state` вызван первым и подтвердил
   `FLOW_VERSION=v1` ДО остального шага — дословно Action: «Confirm `FLOW_VERSION=v1` via `sdd-state`
   (else `H_NOT_V1`).» В трейсе нет строки `halt: H_NOT_V1`.

3. `STEP_0_SCAN` — ровно два вызова `sdd-migrate`, ОБА без `--write` (первая dry-run/`--write`
   граница карты): `sdd-migrate plan --all .` и `sdd-migrate anchors --all .` — дословно: «Gather
   with tools, not by eye: `sdd-migrate plan --all .` (DRY-RUN — how many units, one per spec, and
   their ticket counts; orphan tickets surface here) and `sdd-migrate anchors --all .` (DRY-RUN —
   which tickets would be anchored / already are).»

4. `STEP_0_SCAN` — отчёт оператору зафиксирован строкой `show:`, содержимое включает units=1
   (`demo`), tickets=2 (`TSK-01`, `TSK-02`), orphans=0 — дословно: «Report the shape to the operator:
   units, tickets, orphans.» Без `show:` этот пункт непроверяем.

5. `STEP_1_LAYER` — первый `--write` во всём прогоне (вторая dry-run/`--write` граница): `tool:
sdd-migrate plan --all . --write`, дословно из Action: «Run `sdd-migrate plan --all . --write`.»
   — контраст со строго dry-run парой из чекпоинта 3.

6. `STEP_1_LAYER` создаёт `migration/`, зеркалящий `specs/`, ровно с описанным составом — дословно:
   «This scaffolds `migration/` mirroring `specs/`: one `*.migration.md` per spec (generated
   Inventory — facts a rescan can re-derive; a Section Map pre-filled by curated heading rules,
   `UNMAPPED` rows left for the agent; agent-filled Ticket Map / Diagram Plan; a per-unit step
   checklist) plus `migration/README.md` (the global G1–G8 order and the unit table).» `write:
migration/demo/demo.spec.migration.md`, `write: migration/README.md`.

7. `STEP_1_LAYER` — обоснование «файлы, не чат» показано оператору (по-русски, `AX_OPERATOR_LANGUAGE`)
   и зафиксировано `show:`/`note:`, отражающим ровно эту причину — дословно источник: «Explain to the
   operator, in plain Russian: the plan is files, not chat — it survives session breaks, it is
   verified mechanically (`plan --verify`), and its units are self-sufficient job cards that can be
   handed to parallel agents.»

8. `STEP_1_LAYER` — ничего вне `migration/` не тронуто на этом шаге: нет ни одной строки `write:`
   под `specs/`, `tasks/`, `src/` — дословно: «Nothing outside `migration/` is written here.»

9. `STEP_2_ANCHORS` — `tool: sdd-migrate anchors --all . --write`, дословно: «Run `sdd-migrate
anchors --all . --write` (deterministic — wraps canonical sections in `<!--SECTION:-->` markers;
   idempotent, skips already-anchored). Verify with `sdd-check` (anchor balance clean).» — в трейсе
   `tool: sdd-check ...` сразу после, `write:` затрагивает ТОЛЬКО оба `core.task-0N.md` (тикеты) —
   ни одной `write:`-строки на `specs/demo/demo.spec.md` НЕТ на этом шаге. `sdd-migrate anchors`
   якорит тикеты (`tasks/**/*.task-*.md`), не спеки — это подтверждает уже сам `STEP_0_SCAN`
   (Checkpoint 3): «`sdd-migrate anchors --all .` (DRY-RUN — which **tickets** would be anchored)»,
   без слова «specs». Якоря спеки — результат `STEP_7_RESTRUCTURE` (Checkpoint 20), не этого шага;
   `write:`-строка на `specs/demo/demo.spec.md` здесь была бы находкой (Executor якорит спеку раньше
   срока), а не ожидаемым поведением.

9a. `STEP_2_ANCHORS` — оба v1-тикета не несли `## Execution Log` вовсе (фикстура: только `## Meta` +
`## Description`), поэтому тот же `--write` обязан скаффолдить недостающую секцию с честной
пометкой, дословно из Action: «A v1 ticket missing a mandatory v2 section (`EXECUTION_LOG`) gets
it scaffolded with an honest placeholder — `migrated from v1 — no rounds/phases recorded in v1
    format` — never a fabricated Round.» `write:`-diff обоих `core.task-0N.md` показывает новую
секцию `<!--SECTION:EXECUTION_LOG--> ... <!--/SECTION:EXECUTION_LOG-->` с ровно этой строкой (дата
подстановкой, не выдуманной) — никакого `### Round 1` / `#### P1` не появляется: в v1-источнике
раундов и фаз не было, придумывать их запрещено тем же предложением Action. Сразу за скаффолдом —
дословно: «Once anchored, the agent brings each ticket's Meta to v2 form — `**Task-ID:**` /
`**Status:**` / `**Purpose:**`, replacing v1's own field labels — reading every value from the
ticket's real v1 content.» `write:` того же тикета меняет `- Purpose: ...` / `- Module: ...` / `-
    Status: done` (v1, plain dash-bullets) на `**Task-ID:** TSK-01` / `**Status:** [x] DONE` /
`**Purpose:** базовая логика core-модуля demo` — значения читаются из реального v1-контента
(`done` → `[x] DONE`, `in-progress` → `[~] IN_PROGRESS`), ни один статус не «улучшен» и не
выдуман. Найдена строка `### Round N` / `#### P<N>` с содержательным текстом (не плейсхолдером) в
скаффолде этого шага, либо Meta-поле со значением, не выводимым из показанного v1-текста
тикета, → `VIOLATED`.

10. `STEP_3_FILL_MAPS` — Section Map демо-спеки пришла пред-заполненной по трём заголовкам (`1.
Vision` → `VISION`, `2. Architecture` → `ARCHITECTURE`, `3. Decision Log` → `DECISION_LOG`), а
    `4. Notes` осталась целью `UNMAPPED` и стала единственной строкой, которую правит агент —
    дословно: «a heading no rule recognizes is left with target `UNMAPPED` — that row, and only that
    row, is this step's work.» Трейс показывает разрешение именно этой строки (`show:` с решением
    keep/merge/drop для «Notes»), остальные три строки не переоткрываются агентом заново.

11. `STEP_3_FILL_MAPS` — заполнен Ticket Map по правилу из Meta.Purpose: `TSK-01` →
    `DEMO-core-init`, `TSK-02` → `DEMO-validate-input` — дословно: «fill the **Ticket Map**
    (`<ACR>-<slug>` from `Meta.Purpose`, kebab-case, unique repo-wide — the same slug twice means
    «one feature»; destination computed from the ID).» `write: migration/demo/demo.spec.migration.md`
    обновлён (Status → `MAPPED`). Форма ID — `<ACR>-<slug>` с ВЕРХНИМ ACR (`DEMO-...`), дословно по
    `STEP_3_FILL_MAPS`: «New ID `<ACR>-<slug>` — `ACR` UPPERCASE, `slug` kebab-case». <!-- sync with
    directive wording after batch --> Известная зависимость этой карты: на момент правки этой карты
    `NEW_ID_REGEX` в `shared/sdd/migration-plan.ts` (`/^[a-z][a-z0-9]*(-[a-z0-9]+)+$/`) принимает
    ТОЛЬКО lowercase, что противоречит и этому тексту директивы, и собственному сообщению об ошибке
    инструмента («ACR — верхний регистр»); карта фиксирует ЦЕЛЕВУЮ, директивно-верную форму
    (`DEMO-core-init`), предполагая, что регэксп починен под директиву (а не наоборот) — если живой
    прогон карты бьётся о `MIG_BAD_SLUG` на этом шаге из-за регистра, это находка про рассинхрон
    код/директива, а не про Executor'а. Ticket Map также назначает destination
    `specs/demo/core/core.task.<newId>.md` (модульная co-location, per Meta `Module: core` обоих
    тикетов) — деталь-РЕШЕНИЕ ЭТОЙ карты, не единственно легальная форма: `verifyUnitFile` проверяет
    destination по ФОРМЕ (`specs/<scope>/**/*.task.<newId>.md`), не по точному пересчёту — плоское
    назначение `specs/demo/demo.task.<newId>.md` было бы равно легальным. Карта фиксирует модульную
    co-location, потому что оба тикета уже несут `Module: core` в v1 Meta — согласованно с их
    реальным домом в коде (`cli/demo/core/`).

12. `STEP_3_FILL_MAPS` — гейт: `tool: sdd-migrate plan --verify → exit=0`, дословно: «Gate:
    `sdd-migrate plan --verify` — inventory unchanged, maps complete, zero `UNMAPPED` targets
    remaining, action vocabulary respected, slug grammar valid, zero cross-unit slug collisions. Fix
    and re-verify until clean.» — ноль `UNMAPPED` осталось (чекпоинт 10 закрыт).

13. `STEP_4_ACK` — verified layer показан оператору с разделением факт/предложение
    (`AX_EVIDENCE_HYGIENE`), включая dry-run счётчики `ids --from-plan` (третья dry-run/`--write`
    граница — этот вызов БЕЗ `--write`, только для отчёта) — дословно: «Present the verified layer,
    in plain Russian, facts separate from proposals (`AX_EVIDENCE_HYGIENE`): units and their
    section/ticket maps, the derived ID map, which decisions will merge (STEP_7), what gets
    simplified beyond a 1:1 copy, and the files+code the ID replacement will touch (from
    `sdd-migrate ids --from-plan` DRY-RUN counts).»

13a. `STEP_4_ACK` — в тот же `show:` добавлен предложенный scope-type для `demo` (у v1-спеки нет
`SCOPE_TYPE`-якоря вовсе), дословно из Action: «for every unit that lacks a `SCOPE_TYPE` anchor —
the proposed scope-type token (`product` | `library` | `infrastructure` | `interface`, read from
the scope's own row in `specs/README.md`, never guessed).» Источник значения — строка `demo` в
`specs/README.md` Scopes-таблице (`Type` = `product`), не догадка агента; трейс показывает `show:`
с этим значением ДО `ask:`. Значение, не совпадающее с `specs/README.md`, либо взятое без
цитирования источника → `VIOLATED`.

14. `STEP_4_ACK` — hard stop, явное «да»/«go»/«ok» оператора (включая подтверждение scope-type,
    чекпоинт 13a), взятое из первого пункта Operator Script, ДО любого `write:` вне `migration/` —
    дословно `AX_OPERATOR_AGREEMENT`: «Every fix must
    be operator-approved before execution. The plan is shown as a table. No edits are made before
    explicit operator "yes" / "go" / "ok".» И из Action: «The operator confirms or edits ... —
    `AX_OPERATOR_AGREEMENT`; `H_OPERATOR_REJECTS_PLAN` on decline. On go-ahead set units `**Status:**
APPROVED`. STOP.» В трейсе `ask:`/`operator:` пара, `halt: H_OPERATOR_REJECTS_PLAN` НЕ
    встречается (оператор согласился).

15. `STEP_5_IDS` — `tool: sdd-migrate ids --from-plan --write`, дословно: «Run `sdd-migrate
ids --from-plan --write` (the map is derived from the approved Ticket Maps). The tool replaces
    exact IDs on word boundaries only — never a blind `TSK-[0-9]+` pattern, never non-IDs (`UTF-8`),
    never `D-NNN` / `FR-NN` / scope-prefixed requirement IDs — and gates itself on zero old IDs
    remaining. Then `sdd-check --all .` clean.» — этот `--write` вызов, в отличие от dry-run в
    STEP_4 (чекпоинт 13), реально переписывает файлы.

16. `STEP_5_IDS` — конкретное доказательство, что замена ID дошла до кода, а не только до тикетов:
    `write: cli/demo/core/validate.ts`, содержимое ДО — `// @tasks: TSK-01`, содержимое ПОСЛЕ —
    `// @tasks: DEMO-core-init`. Без этой строки `write:` с явным до/после чекпоинт 15 непроверяем
    на «трогает код», а не только `*.task-NN.md`.

17. `STEP_6_MOVE` — `tool: sdd-migrate move --scope demo --write`, дословно: «Per scope:
    `sdd-migrate move --scope <scope> --write` — relocates every ticket to its Ticket-Map
    destination (`git mv`, history kept), rewrites every relative markdown link that pointed at a
    moved ticket (inside the moved tickets themselves and inside every other file in the same zones
    that referenced them by path).» `write:` (через `git mv`) — `specs/demo/core/core.task.DEMO-core-init.md`
    и `specs/demo/core/core.task.DEMO-validate-input.md` появляются, `tasks/demo/core/core.task-01.md`
    / `core.task-02.md` исчезают из `tasks/`.

18. `STEP_6_MOVE` — индексы и снятие `tasks/<scope>/` — дословно: «It also scaffolds
    `<module>.3-tasks.md` + `<scope>.3-tasks.md` from ticket Meta (`MODULE_TASKS_INDEX_STRUCTURE` /
    `SCOPE_TASKS_INDEX_STRUCTURE`; the Cascade Table slot stays for the agent), and removes the
    emptied `tasks/<scope>/`.» `write: specs/demo/core/core.3-tasks.md`, `write:
specs/demo/demo.3-tasks.md`; `tasks/demo/` больше не существует на диске (пусто → удалён) —
    ЭТО СНЯТИЕ АВТОМАТИЧЕСКОЕ, часть эффекта одного и того же `tool: sdd-migrate move --scope demo
    --write` (Checkpoint 17) — дословно «no separate cleanup step». В трейсе НЕ должно быть отдельной
    строки `tool: rm -rf tasks/demo` / `rmdir tasks/demo` / любого ручного удаления Executor'ом —
    если такая строка есть, это `VIOLATED`: Executor подстраховался вручную там, где директива прямо
    называет автоматику инструмента, и ручное удаление ДО завершения `move` рискует стереть
    неперенесённые тикеты, если `move` для scope блокирован (см. Action: «A blocked move ... stops
    that scope, not the run»).

19. `STEP_6_MOVE` — мгновенный флип flow-версии именно этого scope, дословно из `ReferenceData`:
    «Together (index present + tasks dir gone) that mechanically flips the scope to v2 —
    `sdd-check` detects flow per scope, so the migrated scope is now checked strictly while
    unmigrated neighbours stay lenient.» — но здесь единственный scope, так что репозиторий целиком
    флипается.

20. `STEP_7_RESTRUCTURE` — цель шага дословно: «Transform each spec to the v2 document structure —
    the per-unit semantic work.» `write: specs/demo/demo.spec.md` перестроен: «target section order
    from the scope-type's `*-spec-structure.xml` (general → specific, arc42/C4), headings without
    numbers, heavy sections folded under `<details>`, the Overview section carrying its diagram per
    the Diagram Plan.» Здесь же (не на `STEP_2_ANCHORS`) перестроенный `specs/demo/demo.spec.md`
    впервые несёт `<!--SECTION:-->`-якоря на своих канонических секциях — восполняет то, что
    Checkpoint 9 явно исключил из `STEP_2_ANCHORS`.

20a. `STEP_7_RESTRUCTURE` ничего не сочинил сверх исходника — дословно из Mission (out-of-scope
строка): «migration only transforms what already exists: do not author a new section (Golden DX,
FR, or any other) the source spec never had; a section the target structure calls for but the
source lacks stays absent». `product-spec-structure.xml` предписывает секции вроде `GOLDEN_DX`,
`PROJECT_TYPE`, `SCOPE_DEPENDENCIES`, `BOOTSTRAP_REQUIREMENTS`, `HANDOFF` — ни у одной из них нет
материала в v1-источнике (Vision/Architecture/Decision Log/Notes, ничего больше) → перестроенный
`specs/demo/demo.spec.md` НЕ содержит текста под этими заголовками (секция может остаться
структурно предусмотренной, но пустой/absent — не заполненной выдумкой). Checkpoint нарушен, если
`write:`-diff показывает содержательный текст под секцией, для которой в v1-источнике нет
буквального материала.

20b. `STEP_7_RESTRUCTURE` пишет `SCOPE_TYPE` как структурные метаданные, а не как «сочинённую»
секцию — дословно: «The `SCOPE_TYPE` anchor is the one exception, not a violation of it: structural
v2 metadata, not content — write it (or correct it) with the value the operator confirmed in
STEP_4.» `write: specs/demo/demo.spec.md` (тот же перестроенный diff, что в Checkpoint 20) несёт
`<!--SECTION:SCOPE_TYPE-->product<!--/SECTION:SCOPE_TYPE-->` — значение `product`, слово-в-слово то,
что оператор подтвердил на `ask:`/`operator:` из Checkpoint 13a, не новая догадка на этом шаге.
Отсутствие `SCOPE_TYPE`-якоря в перестроенной спеке, либо значение, отличное от подтверждённого на
STEP_4, → `VIOLATED`.

21. `STEP_7_RESTRUCTURE` — comprehension-pass в тот же проход, «plain Russian», дословно: «Rewrite
    operator prose to flat engineering Russian in the same pass, per `AX_MIGRATION_COMPREHENSION_PASS`
    — decode every empty label and code-only term from the actual code, replace every metaphor with
    the literal mechanism, never guess (code / IDs / status tokens / BDD keywords / paths stay
    English).» — итоговый текст «4. Notes» (разрешённый в чекпоинте 10) отражён в перестроенной
    секции без метафор и без англицизмов не по делу.

21a. Правка Decision Log только через supersession, никогда in-place — дословно из `STEP_7_RESTRUCTURE`:
«a Decision Log entry's TEXT is changed only through supersession, never edited in place», per
`AX_PIVOT_REQUIRES_SUPERSESSION`. Эта фикстура несёт ровно один активный decision (`D-001 — Один
    модуль на старте`, Status `active`) — легитимная compression-обработка на этом шаге НЕ трогает
его текст напрямую: если `D-001` остаётся тем же decision (сжатие/сворачивание формата секции —
легально), `write:`-diff может менять ОБЁРТКУ (fold под `<details>`), но не переписывать `Why`/
`Status` в том же `D-001` без нового `D-NNN` с `Supersedes: D-001` и `Was → Now`. Правка текста
`D-001` без появления нового ID + `Supersedes` → `VIOLATED` — независимо от того, что новый текст
может быть содержательно лучше.

22. `STEP_7_RESTRUCTURE` — гейт per scope, дословно: «Gate per scope: `sdd-check --all specs/<scope>`
    — strict v2 structure, folds, real mermaid parse, and the language lint
    (`SDD_LANGUAGE_CALQUE`) that gates the comprehension pass above mechanically — clean. Set the
    unit `**Status:** DONE`.» `tool: sdd-check --all specs/demo → exit=0` — этот прогон уже видит
    `SCOPE_TYPE` (Checkpoint 20b), поэтому `checkSpecStructure` реально проходит строгую
    `REQUIRED_SECTIONS`-ветку для `product` (`shared/sdd/check.ts`, `extractSection(content,
'SCOPE_TYPE')` → `ok`) — не путь «нет `SCOPE_TYPE` → ветка спит» (дормантный путь легален ТОЛЬКО
    до этого шага, когда якоря у спеки ещё не было).

23. `STEP_8_VERIFY` — финальный гейт, дословно целиком: «Final gate, all green or
    `H_VERIFICATION_FAIL`: `sdd-state` → `FLOW_VERSION=v2` · `sdd-check --all .` clean (every
    migrated scope spec now carries `SCOPE_TYPE` from STEP_7, so this run exercises the strict
    `REQUIRED_SECTIONS` gate for real, not the dormant no-`SCOPE_TYPE` path) · zero original
    Task-IDs and zero `*.task-*.md` names remain (`sdd-migrate ids --from-plan` DRY-RUN reports
    nothing to do) · every unit `**Status:** DONE` · per migrated module, `gennady
lint --spec=<module-spec> --inventory-reverse <module-code-dir>` clean.» — четвёртая
    dry-run/`--write` граница: `tool: sdd-migrate ids --from-plan → exit=0` БЕЗ `--write`, отчёт
    «нечего делать» (контраст с реальным `--write` в чекпоинте 15). `halt: H_VERIFICATION_FAIL` НЕ
    встречается — гейт зелёный.

23a. `gennady lint --spec=<module-spec> --inventory-reverse <module-code-dir>` из Checkpoint 23 —
Executor ОБЯЗАН реально вызвать эту команду и записать `output:` под ней, а не подставить строку
без вызова (не no-op в трейсе). В этой фикстуре `<module-spec>` — модульная спека `core`, которая на
этом шаге, по построению карты (Checkpoint 11 — модульная co-location тикетов; `STEP_6_MOVE` создаёт
`specs/demo/core/core.3-tasks.md`, Checkpoint 18), физически существует по пути
`specs/demo/core/core.spec.md` ТОЛЬКО если `STEP_7_RESTRUCTURE` (Checkpoint 20) действительно
материализовал модульный под-спек для `core` — если конструкция этой фикстуры этого не гарантирует
(у v1-источника нет отдельного module-спека, только один общий `specs/demo/demo.spec.md`), Executor
ДОЛЖЕН зафиксировать это несоответствие строкой `note:` и вызвать команду с фактически резолвящимся
аргументом (`--spec=specs/demo/demo.spec.md`), а не тихо подставить путь, которого нет на диске.

Эта фикстура — легитимно вакуумный случай (продуктовая спека без модульной декомпозиции, ничего не
выдумано per Checkpoint 20a): у резолвящейся `--spec` нет секции `ENTITY_INVENTORY` вовсе, значит
`parseEntityInventory` возвращает пустой список ДЛЯ ЛЮБОГО `--spec`-аргумента здесь — гейт
структурно вакуумный независимо от того, module- или scope-спека резолвится. Реализация (`cli/cmd/
lint/lint.cmd.ts`, `inventoryVacuous = declaredInventory !== null && declaredInventory.length === 0`)
печатает в этом случае ровно: `ℹ️  [LintCommand#run] <spec> has no Entity Inventory section —
nothing to verify` — и пропускает обе стороны сверки (`checkInventorySync` / `reverseUnimplemented`
НЕ вызываются). Трейс обязан показать: `tool: npx tsx <GENNADY_WORKTREE>/cli/gennady.ts lint
--spec=<резолвящийся spec> --inventory-reverse cli/demo/core → exit=0` РЕАЛЬНО вызванным, с
`output:`, цитирующей именно эту `ℹ️`-строку (не переформулированной, не сокращённой до просто
«clean») — так Verifier отличает тривиальную вакуумную чистоту от содержательной проверки. Найдена
подстановка «clean»/«0 problems» без предшествующего реального `tool:`-вызова, ИЛИ `output:` без
этой `ℹ️`-строки в вакуумном случае, → `VIOLATED`.

24. `STEP_8_VERIFY` — снятие `migration/` только по подтверждению оператора, дословно: «With the
    operator's confirmation remove the `migration/` layer (its content is now embodied in the repo;
    git history keeps the record).» — `ask:`/`operator:` пара берёт второй (последний) пункт
    Operator Script, и только ПОСЛЕ ответа появляется `write:` (удаление) на `migration/README.md` и
    `migration/demo/demo.spec.migration.md`.

25. Финальная строка перед стопом — дословно: «Return control to the caller — script readiness is
    the router's separate gate.» — трейс заканчивается `stop: per-map — <условие Stop дословно>`, ни
    одной строки после неё; никакой readiness-скрипт (`readiness.directive.xml`) не загружается — это
    отдельный гейт роутера, вне границ этой карты.
