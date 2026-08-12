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

`package.json`:

```json
{
  "name": "demo-project",
  "version": "0.1.0",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "lint": "gennady lint --all .",
    "format": "prettier --check ."
  }
}
```

`node_modules/.bin/gennady` (пустой файл):

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
(`shared/sdd/id-replace.ts`), и файл вне этого списка инструмент молча не тронет):

```ts
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
   map, что смёржится в STEP_7, что коснётся кода) — ответ: «да, go, накатывай».
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
migration/demo/demo.migration.md`, `write: migration/README.md`.

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
   `tool: sdd-check ...` сразу после, `write:` затрагивает `specs/demo/demo.spec.md` и оба
   `core.task-0N.md` (канонические секции обёрнуты якорями).

10. `STEP_3_FILL_MAPS` — Section Map демо-спеки пришла пред-заполненной по трём заголовкам (`1.
Vision` → `VISION`, `2. Architecture` → `ARCHITECTURE`, `3. Decision Log` → `DECISION_LOG`), а
    `4. Notes` осталась целью `UNMAPPED` и стала единственной строкой, которую правит агент —
    дословно: «a heading no rule recognizes is left with target `UNMAPPED` — that row, and only that
    row, is this step's work.» Трейс показывает разрешение именно этой строки (`show:` с решением
    keep/merge/drop для «Notes»), остальные три строки не переоткрываются агентом заново.

11. `STEP_3_FILL_MAPS` — заполнен Ticket Map по правилу из Meta.Purpose: `TSK-01` →
    `DEMO-core-init`, `TSK-02` → `DEMO-validate-input` — дословно: «fill the **Ticket Map**
    (`<ACR>-<slug>` from `Meta.Purpose`, kebab-case, unique repo-wide — the same slug twice means
    «one feature»; destination computed from the ID).» `write: migration/demo/demo.migration.md`
    обновлён (Status → `MAPPED`).

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

14. `STEP_4_ACK` — hard stop, явное «да»/«go»/«ok» оператора, взятое из первого пункта Operator
    Script, ДО любого `write:` вне `migration/` — дословно `AX_OPERATOR_AGREEMENT`: «Every fix must
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
specs/demo/demo.3-tasks.md`; `tasks/demo/` больше не существует на диске (пусто → удалён).

19. `STEP_6_MOVE` — мгновенный флип flow-версии именно этого scope, дословно из `ReferenceData`:
    «Together (index present + tasks dir gone) that mechanically flips the scope to v2 —
    `sdd-check` detects flow per scope, so the migrated scope is now checked strictly while
    unmigrated neighbours stay lenient.» — но здесь единственный scope, так что репозиторий целиком
    флипается.

20. `STEP_7_RESTRUCTURE` — цель шага дословно: «Transform each spec to the v2 document structure —
    the per-unit semantic work.» `write: specs/demo/demo.spec.md` перестроен: «target section order
    from the scope-type's `*-spec-structure.xml` (general → specific, arc42/C4), headings without
    numbers, heavy sections folded under `<details>`, the Overview section carrying its diagram per
    the Diagram Plan.»

21. `STEP_7_RESTRUCTURE` — comprehension-pass в тот же проход, «plain Russian», дословно: «Rewrite
    operator prose to flat engineering Russian in the same pass, per `AX_MIGRATION_COMPREHENSION_PASS`
    — decode every empty label and code-only term from the actual code, replace every metaphor with
    the literal mechanism, never guess (code / IDs / status tokens / BDD keywords / paths stay
    English).» — итоговый текст «4. Notes» (разрешённый в чекпоинте 10) отражён в перестроенной
    секции без метафор и без англицизмов не по делу.

22. `STEP_7_RESTRUCTURE` — гейт per scope, дословно: «Gate per scope: `sdd-check --all specs/<scope>`
    — strict v2 structure, folds, real mermaid parse, and the language lint
    (`SDD_LANGUAGE_CALQUE`) that gates the comprehension pass above mechanically — clean. Set the
    unit `**Status:** DONE`.» `tool: sdd-check --all specs/demo → exit=0`.

23. `STEP_8_VERIFY` — финальный гейт, дословно целиком: «Final gate, all green or
    `H_VERIFICATION_FAIL`: `sdd-state` → `FLOW_VERSION=v2` · `sdd-check --all .` clean · zero original
    Task-IDs and zero `*.task-*.md` names remain (`sdd-migrate ids --from-plan` DRY-RUN reports
    nothing to do) · every unit `**Status:** DONE` · per migrated module, `gennady
lint --spec=<module-spec> --inventory-reverse <module-code-dir>` clean.» — четвёртая
    dry-run/`--write` граница: `tool: sdd-migrate ids --from-plan → exit=0` БЕЗ `--write`, отчёт
    «нечего делать» (контраст с реальным `--write` в чекпоинте 15). `halt: H_VERIFICATION_FAIL` НЕ
    встречается — гейт зелёный.

24. `STEP_8_VERIFY` — снятие `migration/` только по подтверждению оператора, дословно: «With the
    operator's confirmation remove the `migration/` layer (its content is now embodied in the repo;
    git history keeps the record).» — `ask:`/`operator:` пара берёт второй (последний) пункт
    Operator Script, и только ПОСЛЕ ответа появляется `write:` (удаление) на `migration/README.md` и
    `migration/demo/demo.migration.md`.

25. Финальная строка перед стопом — дословно: «Return control to the caller — script readiness is
    the router's separate gate.» — трейс заканчивается `stop: per-map — <условие Stop дословно>`, ни
    одной строки после неё; никакой readiness-скрипт (`readiness.directive.xml`) не загружается — это
    отдельный гейт роутера, вне границ этой карты.
