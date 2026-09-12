# Триаж dirty diff в worktree `sdd-v2-rc52-followup` (HEAD c84aff31, 79 файлов, +2771/−445)

## 1–2. Карта и классификация

| Категория | Файлов | Строк (+/−) | Состав |
|---|---|---|---|
| **A. Eval-стенд** (`ai/flow-eval/*.ts`, README) | 9 | ~621 / 127 | provision.ts (+318), evidence.ts (+118), observer.ts (+58), judge, prompts, runner, cli, types |
| **B. Production flow** | 47 | ~1103 / 277 | директивы .xml (~306+, сборка из .hbs), шаблоны .hbs (~159+), аксиомы/контракты (~49+), shared/sdd+mermaid (~115+), cli/cmd (~389+), specs/*.spec.md (~83+) |
| **C. Фикстуры/сценарии** | 2 (+1 untracked) | ~15 | scenarios.json; `scenarios.authoring.tmp.json` (untracked) |
| **D. Тесты** | 13 | ~1044 / 40 | harness.test.ts (+540), sdd-log.cmd.test (+193), check-phases.test (+85), stateless-sdd-flow-contract (+86) и др. |

Ночь ушла примерно поровну: тесты (~37%), production-flow (~30%), eval-стенд (~22%).

## 3. Production (B): упрощение или усложнение — обе стороны, осмысленно

**Упрощения (fast-path для мелких масштабов):**
- `scope.directive.hbs`: при `scale=function` бриф закрывает STEP_2 **без загрузки interview-protocol**; research gate на `function` — skip; чтение rule-registry отложено с STEP_0 на STEP_7; DFD-store optional («a pure function has no store; never invent one»).
- `module.directive.hbs`: новый `<ScalePath when="scale=function|fix">` — «Steps 1–5 form one compact design packet, not five planning loops»; Module Map диаграмма только при ≥2 модулях; zero-new-information решение проходит без лишнего Ask/STOP; STEP_5: не изобретать `ports/`/`adapters/` для Function-only модуля.
- `ax-coverage-map-closure`: полный текст оператора в intake может стартовать `✅` (раньше максимум 🟡) — главный кандидат на осознанный ревью.
- `ax-handoff-to-module-decomposition` / `ax-scope-stays-thin`: «Decomposition is not fragmentation».
- `entity-surface-format`: добавлен тип **Function**.

**Усложнения (новая машинерия и запреты):**
- Пивот владения тикетом: `ax-ticket-write-scope` развёрнут на 180° — worker'у `sdd-log` запрещён; оркестратор закрывает фазу атомарным `sdd-log complete --phase`. Каскад консистентен: аксиома → steps → phase-execution-protocol → execute.directive → CLI (+298 строк, спека и +193 строк тестов).
- `execute.directive` STEP_4/5: новые обязательные вызовы — pre-close `sdd-check --task`, `sdd-log complete`, `sdd-log close` + `sdd-sync` + `sdd-check --all .` **до** аудита.
- Новые запреты: «never inspect Gennady source or bundled chunks», запрет `--help`-проб и shell-redirection, «validator is not an authoring oracle».
- Правило владения requirement-ID: модуль не копирует scope-требования.
- Новый check `SDD_COVERAGE_READER_RERUNS_PRODUCER`.

## 4. Подгонка под toy-задачи

**Не обнаружена в production.** Grep по `fibonacci|slugify|tic-tac|todomvc` в diff по `ai/directives`, `ai/kit`, `shared`, `cli/cmd`, `specs` — совпадения **только** в тестовых фикстурах и eval-стенде. Обобщения честные («Function» как тип сущности, `scale=function` fast-path — generic). Пограничное: `acceptance` в scenario фактически диктует ожидаемую структуру результата — лежит в стенде, не в production. Judge стал **строже** → подозрений в «ослаблении судьи ради зелёного» нет.

## 5. Рискованные / неконсистентные места

- ✅ `.hbs ↔ .xml` консистентны: `npm run check:directives-fresh` зелёный.
- ⚠️ `ai/kit/contract/spec/dbc-service-format.xml` — **untracked, но обязателен**: на него ссылается dbc-contracts.hbs и он вкомпилирован в собранный .xml. Забыть в коммите = сломанная сборка директив.
- ⚠️ `ai/flow-eval/scenarios.authoring.tmp.json` — итерационный мусор, не коммитить.
- ⚠️ Поведенческие пивоты, требующие осознанного ревью: (а) STEP_5 запрещает повторный прогон verification-команд («already owned by each phase receipt»); (б) DONE+sync до аудита; (в) ослабление coverage-map (`✅` из intake).
- Мелкое: `sdd-check.cmd.ts` `!authoring` → `!authoringPhase` — тихая смена гейтинга, покрыта тестами.
- **Тесты**: 330/330 pass по всем изменённым сьютам. Правок «без тестов» практически нет.

## 6. Вердикт

**Безопасно коммитить как WIP:** весь diff, включая обязательно `dbc-service-format.xml`, исключая `scenarios.authoring.tmp.json`.

**Проверить перед мержем:** (1) пивот «worker не пишет в тикет / оркестраторский sdd-log complete» — крупнейшее семантическое изменение ночи; (2) отказ от повторного прогона verification и DONE-до-аудита; (3) ослабление coverage-map; (4) валидность эвала — `acceptance` как «синтетический оператор» или подгонка метрики.
