ОТЧЁТ Пачка 11 — «Любой стек проходит verify без node-костылей» (V-05, V-07, V-08, V-06)

СТАТУС: ВЫПОЛНЕНО, с одним открытым вопросом Lead'у (V-08 §4) и двумя легитимными стопами вне
периметра «трогать» (V-06 §4: `ai/flow-eval/**`, `ai/kit/**`). Ветка `lead/verify-stacks`,
4 коммита, база `origin/codex/sdd-v2-rc52-followup` @ `c9726635`. Работу вела эта сессия
`rc-executor`, продолжив пачку после обрыва предыдущей сессии по лимиту API на шаге
`npm run check` (коммиты уже лежали в дереве нетронутыми, `npm test` уже дал заявленные
3870/3880/0). Эта сессия перечитала все 4 коммита и приёмку каждой задачи свежими глазами,
правок не потребовалось (waiver-реестр спеки уже был корректно обновлён каждой закрывающей
задачей), и довела до конца финальные прогоны + отчёты.

**Не запушено** (правило: `git push` делает только Lead). Команды пуша — в конце документа.

## Черновик для PR (простым языком)

До этой пачки `gennady sdd-verify`/`sdd-state` умели работать только с Node-проектами:
всё, что нужно было для проверки кода — имена шагов, команды, «какой стек вообще перед нами» —
было зашито под node в самом коде движка. Пачка 11 подключает четыре куска механизма, перенесённого
из старой версии продукта ещё в прошлых пачках (10, 9), так что теперь:

1. **Стек определяется сам.** `gennady sdd-state` смотрит на файлы репозитория (`package.json`,
   `go.mod`, …) и один раз решает, какой это стек — вместо того чтобы каждая команда гадала
   заново. Если ничего типового не нашлось — это не ошибка, а признанный «любой стек».
2. **Гейты для нетипового стека берутся из конфига.** Проект, который не Node и не Go, может
   объявить свои проверки прямо в `gennady.yaml` (`stack.anystack.extraGates`) — сколько угодно
   команд, в заявленном порядке, и ни одна из них не обязательна (проект не станет «не готов»
   только потому, что не объявил проверок).
3. **Конфиг проверяется заранее, целиком.** Если `gennady.yaml` содержит опечатку или ссылается
   на несуществующий стек — `sdd-verify` останавливается сразу с понятной ошибкой (код выхода 4),
   а не где-то на середине прогона.
4. **Для Node ничего не изменилось.** Каждый шаг доказан «эталоном» — точным снимком поведения
   Node-проекта, снятым ДО начала переноса; если хоть один байт вывода для существующих
   Node-проектов изменился бы, эталонный тест покраснел бы. Он зелёный: 45/45, без единой правки
   эталонных файлов.

Итог пачки: механизм «любой стек» физически подключён к живому CLI-пути `sdd-state` (детект +
готовность) и к гейту конфига `sdd-verify` (валидация `gennady.yaml`), но ещё НЕ подключён к
самому исполнению фазовых гейтов (см. п.4 ниже и `R-V-08.md §4`) — это открытый вопрос для
следующего брифа, не регрессия.

## 1. Таблица файлов (17 файлов, `git diff --stat c9726635..64b03e3c`)

| Каталог/файл | Файлов | Задача | Смысл |
|---|---|---|---|
| `shared/verify/stack-detection.ts` + тест | 2 | V-05 | новый общий факт `detectRepoStack` (node/go.mod/anystack-резерв/`stack.use`-сужение) |
| `cli/cmd/sdd-state/{sdd-state.cmd.ts,sdd-state.types.ts}` + тест | 3 | V-05, V-06 | `[READINESS]` печатает `STACK=`/`STACK_SOURCE=`; readiness выбирает адаптер по детектированному стеку |
| `package.json` | 1 | V-05 | `exports["./stack"]` — фикс `ERR_PACKAGE_PATH_NOT_EXPORTED` для `plugins/golang` |
| `cli/cmd/sdd-verify/{index.ts,sdd-verify.types.ts}` | 2 | V-07 | конфиг-гейт `stack:` — валидация ДО любого гейта, exit 4 при ошибке |
| `cli/__tests__/tool-behavior/sdd-verify-stack-config.test.ts` | 1 | V-07 | e2e реальным CLI-подпроцессом (4 сценария) |
| `shared/verify/presets/{anystack.ts,node.ts}` + 2 теста | 4 | V-08 | новый anystack-пресет (read-only гейты из конфига, фиксированный порядок); диспетчер `resolvePreset` маршрутизирует на него |
| `shared/sdd/__tests__/phase-receipt.test.ts` | 1 | V-08 | golden-пример «нереализованный стек» переключён с `anystack` на `golang` |
| `shared/sdd/readiness.ts` + тест | 2 | V-06 | движок `ReadinessAdapter` + node-адаптер (byte-identical) + anystack-адаптер (ready ⟺ ≥1 `extraGate`) |
| `specs/cli/verify/verify.spec.md` | 1 | все 4 | waiver-реестр обновлён каждой закрывающей задачей (8 из 25 исходных V-02 записей сняты) |

## 2. Архитектура — было / стало (весь контур пачки)

```mermaid
flowchart LR
  subgraph before["Было (после Пачки 10, `c9726635`)"]
    STATE1["sdd-state.cmd.ts\ncheckReadiness(gatherReadinessInput(root))\n— всегда node, безусловно"]
    VERIFY1["sdd-verify/index.ts\nне читает stack: секцию вовсе"]
    NODE1["presets/node.ts\nresolvePreset('anystack',…) → null"]
    REG1["stack-registry.ts / plugins/anystack/**\nперенесены (V-02), 0 вызовов —\nUsage Waiver"]
  end
```

```mermaid
flowchart LR
  subgraph after["Стало (`64b03e3c`, голова пачки 11)"]
    DETECT["stack-detection.ts\ndetectRepoStack(root, stackUse)"]
    STATE2["sdd-state.cmd.ts:154,161-169\nconst stack = detectRepoStack(root, null)\nreadinessAdapter = node|anystack по stack"]
    NODEADP["readiness.ts\nnodeReadinessAdapter\n(gatherReadinessInput/checkReadiness — те же ссылки)"]
    ANYADP["readiness.ts:696-718\nanystackReadinessAdapter\nready ⟺ extraGates.length>0"]
    VERIFY2["sdd-verify/index.ts:32-41\nloadStackConfig → errors? exit 4 : продолжает"]
    NODE2["presets/node.ts:90\nresolvePreset('anystack',…)\n→ resolveAnystackPreset(root, config)"]
    ANYPRESET["presets/anystack.ts\ngateNames = extraGates (порядок сохранён)\nrequiredGateNames = []"]
    PLAN3["phase-verification-plan.ts\nвсё ещё resolvePreset('node',…)\nжёстко — фазовый ладдер anystack не исполняет"]
    STATE2 --> DETECT
    STATE2 --> NODEADP
    STATE2 --> ANYADP
    VERIFY2 --> NODE2
    NODE2 --> ANYPRESET
    style DETECT fill:#dfd,stroke:#333
    style STATE2 fill:#dfd,stroke:#333
    style ANYADP fill:#dfd,stroke:#333
    style VERIFY2 fill:#dfd,stroke:#333
    style NODE2 fill:#dfd,stroke:#333
    style ANYPRESET fill:#dfd,stroke:#333
    style PLAN3 fill:#eee,stroke:#999,stroke-dasharray: 5 5
  end
```

_Зелёным — 4 задачи пачки 11, каждая добавила реальный вызов. Серым пунктиром —
`phase-verification-plan.ts`, единственный узел, который реально исполняет гейты фазового
`sdd-verify`: он остаётся жёстко на `'node'` и не подключён ни одной задачей этой пачки (см.
`R-V-08.md §4` — файл вне списка «трогать» финальной таблицы `61-TASK-BOARD.md §1`)._

## 3. Доказательства (пункты ПРИЁМКИ пачки)

| Команда | Вывод | Статус |
|---|---|---|
| `npm --prefix <tree> test` (первый прогон, воспроизводит хвост оборвавшейся сессии) | `# tests 3880 / # suites 659 / # pass 3870 / # fail 0 / # cancelled 0 / # skipped 10` | ВЫПОЛНЕНО |
| `npm --prefix <tree> test` (повторные прогоны — см. §5 «Флейк») | 3 доп. прогона: `fail 0` всегда, `cancelled` от 2 до 5 (таймаут 30с под нагрузкой хоста `load average 50` на 12 ядрах) | ВЫПОЛНЕНО (0 реальных падений; см. §5) |
| `npm --prefix <tree> run check` | `[sdd-verify] ✅ ALL PASS (5/5)`: type-check 3.7s, test:coverage 56.9s, lint 8.1s, format 1.7s, yagni 0.5s | ВЫПОЛНЕНО (5/5) |
| `npm --prefix <tree> run build` | `✓ built in 3.04s`, exit 0 | ВЫПОЛНЕНО |
| `npm --prefix <tree> run gate:sdd-check-baseline` | `[sdd-check-zero-new-error] OK — no error outside the baseline (baseline commit 227c03a8…, tag rc-baseline-1)` | ВЫПОЛНЕНО |
| Golden V-01: `shared/sdd/__tests__/preset-node-golden.test.ts` + `cli/cmd/sdd-verify/__tests__/parity-node.test.ts` | `# tests 19+26=45 / # pass 45 / # fail 0`; `git diff origin/codex/sdd-v2-rc52-followup..HEAD -- '*golden*'` — пусто | ВЫПОЛНЕНО (45/45, golden не тронут) |
| `node dist/gennady.js sdd-check --all .` | `[sdd-check] 192 error(s), 434 warning(s) across 213 file(s)`, exit 1 (ожидаемо — команда возвращает ненулевой код при наличии error-находок baseline; 192 < 198 baseline, 0 новых подтверждено строкой выше через `gate:sdd-check-baseline`) | ВЫПОЛНЕНО (0 новых ошибок) |
| `npm --prefix <tree> run check:directives-fresh` (доказательство V-06 п.4) | `✓ ai/directives/** matches a fresh rebuild.`, exit 0 | ВЫПОЛНЕНО |

## 4. Остаток waiver-реестра (`specs/cli/verify/verify.spec.md` §8) — 17 из 25, по владельцу

| Владелец | Символы | Причина |
|---|---|---|
| **V-09** (golang-пресет) | `C`, `I`, `Bad` (фикстуры), `scopeHasGoGenerate`, `isStructuralListError` | второй вызов появится, когда golang-пресет подключит `driftMeansFailure`/scope-логику к ладдеру |
| **V-18** (single-flight/tree-guard) | `TreeGuard`, `TreeGuardOptions`, `GuardAcquisition`, `acquireTreeGuard` | подключение лока к фазовому пути явно вынесено в отдельную задачу треком `30-TRACK-VERIFY.md` §6 |
| **V-16a** (`gennady verify --plan --json`, если появится) или кандидат на удаление | `StackRun`, `VerifyReport` | `resolvePreset`/`StackPreset` сознательно не используют форму MAIN; снято отрицательно уже при закрытии V-04 |
| **Владелец не назначен** (открытые вопросы, не тянут ни одну текущую задачу) | `ConfigSectionLoad`, `formatDuration`, `allOf`, `validateStackConfig` | все четыре пересмотрены явно при закрытии V-07 — задача их **исполняет** во время рантайма, но не добавляет новую **текстовую** ссылку на символ (гейт `yagni` считает именно текст); снимутся, когда появится независимый второй call site |
| **Владелец не назначен** (тот же критерий) | `unmatchedGateOverrides`, `applyStackConfig` | пересмотрены явно при закрытии V-08 — работают над полным `Gate[]` MAIN-модели, которой у anystack-пресета (`StackPreset`, узкий контракт) нет; снимутся, если/когда полная `Gate`-модель когда-нибудь заменит фазовую лестницу |

Ни одна запись не «протухла» молча — каждая либо снята с реальной второй ссылкой (8 из 25:
`detectStacks`, `loadStackConfig`, `BUILTIN_GATE_IDS`, `StackConfigError`, `StackConfigLoad`,
`ANYSTACK_GATE_IDS`, `StackPreset`, `pluginConfigOf`), либо явно пересмотрена и оставлена с
объяснением конкретно ЭТОЙ волной (не унаследованным текстом с V-02).

## 5. Отклонения от брифа, флейк-наблюдение, открытые вопросы

**Флейк `npm test` (наблюдение, не регрессия кода).** Первый прогон в этой сессии воспроизвёл
заявленные при обрыве 3870/3880/0/10-skipped. Три последующих прогона (нужные для
дублирующей проверки) дали `fail 0` неизменно, но переменное число `cancelled` (0→5→3→2) —
все отказы `testTimeoutFailure` на 30000мс (`bootstrap-path.test.ts`,
`inbox-review-plan.test.ts`, `testcov.cmd.test.ts` — ни один не входит в дифф этой пачки).
`uptime` во время прогонов показал `load average 50` на 12-ядерной машине (общий хост,
конкурентные сессии). Это ресурсный флейк среды, не связан с изменёнными файлами.

**Открытый вопрос Lead'у (V-08 §4, повтор здесь для видимости).** Финальная таблица
`61-TASK-BOARD.md §1` сузила список «трогать» V-08 до одного файла
(`shared/verify/presets/anystack.ts`), тогда как более ранний трек-документ
(`30-TRACK-VERIFY.md §6`) называл вторым файлом `cli/cmd/sdd-verify/sdd-verify.cmd.ts:431-598`.
Задача выполнена буквально по финальной таблице, но из-за этого anystack-пресет резолвится
только на уровне `resolvePreset`/unit-тестов — реальный фазовый путь `sdd-verify`
(`phase-verification-plan.ts`) anystack ещё не достигает, поэтому критерии «anystack-фаза с
3 гейтами пишет receipt» и «порядок anystack-гейтов в `receipt.commands` = порядку в `gatePlan`»
из `30-TRACK-VERIFY.md` не доказаны end-to-end. Нужно решение: отдельный бриф на подключение,
или принять как известный разрыв волны 2 до V-09/V-12/V-16.

**Стопы вне периметра «трогать» (V-06, оба легитимны по правилу исполнителя).**
1. Снятие `roundtrip-readiness-shim.package.json` требует правки `ai/flow-eval/scripts/roundtrip-eval.sh`
   — вне периметра. Зафиксировано как СТОП, как и требовал бриф пачки.
2. Обновление текста `readiness.directive.hbs`/`ax-verification-before-handoff.xml` требует
   `ai/kit/**` — вне периметра; `check:directives-fresh` тем не менее проходит (ничего под
   `ai/kit/**` не менялось), задача переноса текста — V-15.

Других отклонений нет.

## 6. Команды пуша для Lead

```
git -C /private/tmp/claude-503/-Users-k-lebedev-Developer-gennady--claude-worktrees-nice-panini-8aa14e/400aa5cc-7ed6-4bdd-aa81-d8e4a3003aaf/scratchpad/rc-w2 push origin lead/verify-stacks
```

Коммиты на ветке `lead/verify-stacks` (от `origin/codex/sdd-v2-rc52-followup` @ `c9726635`):
`934a4ff9` (V-05), `fb93baaf` (V-07), `d1e7f68b` (V-08), `64b03e3c` (V-06).

Отчёты задач: `R-V-05.md`, `R-V-07.md`, `R-V-08.md`, `R-V-06.md` (тот же каталог).
