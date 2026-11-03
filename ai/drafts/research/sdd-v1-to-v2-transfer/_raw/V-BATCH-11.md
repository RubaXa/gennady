ВЕРИФИКАЦИЯ Пачки 11 — «Любой стек проходит verify без node-костылей» (V-05, V-07, V-08, V-06)

Проверяющий: `plan-verifier` (свежие глаза, только чтение + перезапуск команд).
Дерево: `…/400aa5cc-…/scratchpad/rc-w2`, ветка `lead/verify-stacks`, база `c9726635`, коммиты
`934a4ff9` (V-05), `fb93baaf` (V-07), `d1e7f68b` (V-08), `64b03e3c` (V-06). Отчёты: `R-V-05/07/08/06.md`,
`R-BATCH-11-verify-stacks.md`. Источники истины: `61-TASK-BOARD.md §1`, `30-TRACK-VERIFY.md` §3.0/§3.4/§6,
`specs/cli/verify/verify.spec.md`, main `d37d5910`. Все числа пересчитаны прогоном.

---

## A. Полнота диффа и границы зоны

| Утверждение отчёта | Проверка | Вердикт |
|---|---|---|
| «17 файлов, `git diff --stat c9726635..64b03e3c`» | прогон: ровно 17 файлов, 817 insertions / 104 deletions | ПОДТВЕРЖДЕНО |
| Каждый файл имеет строку в таблице `§1` сводного отчёта | сверены все 17 путей построчно (2+3+1+2+1+4+1+2+1 = 17) | ПОДТВЕРЖДЕНО |
| Ничего в `ai/kit/**`, `ai/flow-eval/**`, `cli/cmd/sync*` | `git diff --name-only … \| grep -E '^(ai/kit/\|ai/flow-eval/\|cli/cmd/sync)'` → пусто | ПОДТВЕРЖДЕНО |
| Разбивка по коммитам соответствует задачам | `git show --name-status` × 4: V-05 7 файлов, V-07 4, V-08 6, V-06 4 | ПОДТВЕРЖДЕНО |

Вне буквальной разрешённой зоны — 4 файла: `package.json` (раскрыт как фикс `exports["./stack"]`),
`shared/sdd/__tests__/{phase-receipt,readiness}.test.ts` и `cli/__tests__/tool-behavior/sdd-verify-stack-config.test.ts`
(тесты своих же зонных модулей). Расширение реальное, но раскрытое. НЕБЛОКИРУЮЩЕЕ.
Не тронуты файлы, названные треком §6 ключевыми для этих задач: `shared/sdd/probe.ts:12-34` (V-05),
`shared/sdd/ladder.ts:68`, `gate-queue.ts:365,392`, `sdd-task.cmd.ts:462-487` (V-06). См. §B.4.

## B. Существо

### B.1 V-05 — детект стека, факт в снимке

- Примитив `detectStacks`/`stack-registry.ts` — дословный перенос v1: `diff` против
  `d37d5910:services/stack/stack-registry.ts` даёт ровно одну строку разницы — переименование импорта
  `./stack.types.ts` → `./verify.types.ts`. ПОДТВЕРЖДЕНО (работа V-02, V-05 на неё опирается).
  `detectNode` (`stack-detection.ts:21-31`) — новая v2-логика (node не `StackPlugin` в main), заявлена в шапке.
- `stack.use` сужает, но не назначает; anystack — последний резерв; мультистек сортируется — 8/8 pass.
  Факт в снимке: `sdd-state.cmd.ts:158` `detectRepoStack(root, null)`, печать `STACK=`/`STACK_SOURCE=`;
  `sdd-state.cmd.test.ts` 18/18 pass. ПОДТВЕРЖДЕНО.
- **Критерий трека «`sdd-state`/`sdd-task`/`sdd-verify` на одном корне видят один `StackDetection`»:**
  `grep -rn detectRepoStack shared cli \| grep -v __tests__` даёт ровно один продакшн-потребитель —
  `sdd-state.cmd.ts:158`. Шапка самого файла: `@consumers: sdd-state.cmd`. `sdd-task`/`sdd-verify`
  факт не видят. Отчёт помечает пункт `ВЫПОЛНЕНО (для заявленного скоупа)`. **ОПРОВЕРГНУТО** как
  `ВЫПОЛНЕНО`; фактически — частично. Правка: пометить `ЧАСТИЧНО`, назвать владельца доподключения.

### B.2 V-07 — секция `stack:` в `gennady.yaml`

- Гейт ДО любого гейта, exit 4: `cli/cmd/sdd-verify/index.ts:36-41` — `loadStackConfig(projectRoot,
  BUILTIN_GATE_IDS)`, при `errors.length > 0` → `stackConfigError(...)` → `process.exit(4)`.
  Отсутствие секции — не ошибка. 4 e2e-сценария реальным CLI-подпроцессом: 4/4 pass. ПОДТВЕРЖДЕНО.
- **Слияние и провенанс:** покрыты 29 перенесёнными юнит-тестами `shared/verify/__tests__/stack-config.test.ts`
  («deep-merges: a one-key personal .gennadyrc overlays the project yaml», «records per-key provenance
  for values from each source»). ПОДТВЕРЖДЕНО на уровне примитива (работа V-02).
- **Но:** результат загрузки нигде не используется дальше валидации — `stackConfigLoad` встречается в
  `index.ts` только на строках 36-38, `config`/`provenance` отбрасываются и в `run()`/`resolvePhaseContext()`
  не передаются. Слитый конфиг и провенанс не наблюдаемы ни в одном выходе v2. НЕБЛОКИРУЮЩЕЕ, но
  формулировка «deep-merge, провенанс» в строке доски закрыта только примитивом, не подключением.
- Шапка теста `sdd-verify-stack-config.test.ts:3` обещает «proving deep-merge, provenance-carrying
  validation … end to end» — ни одного утверждения о слиянии/провенансе в файле нет. Правка: снять обещание.

### B.3 V-08 — anystack-пресет

- `shared/verify/presets/anystack.ts:32-52`: имена = `ANYSTACK_GATE_IDS` (сегодня `[]`,
  `plugins/anystack/anystack-plugin.ts:8`) + `extraGates` в порядке объявления; `requiredGateNames: () => []`
  («never required»); `commandForGate` кавычит только нужные токены. 16/16 pass с `node.test.ts`.
  Диспетчер `presets/node.ts:90`, ветка node не тронута. ПОДТВЕРЖДЕНО на уровне `resolvePreset`/unit.
- **ОТКРЫТЫЙ ВОПРОС исполнителя — подтверждаю факт:**
  `grep -n "'node'" shared/sdd/phase-verification-plan.ts` → строки **45, 59, 255**
  (`resolvePreset('node', profile, '.')`, `resolvePreset('node', 'full', '.')`). Сильнее: единственный
  продакшн-вызов `resolveAnystackPreset` — из диспетчера `node.ts:90`, а ни один продакшн-вызов
  `resolvePreset` не передаёт стек, отличный от литерала `'node'`
  (`phase-receipt.ts:1216,1262` имеют параметр `stack: StackId = 'node'`, и оба вызывающих —
  `phase-run.ts:187-188`, `phase-receipt-validation.ts:45-46` — передают 3 аргумента, без стека).
  **Вывод: anystack-пресет сегодня недостижим ни одним продакшн-путём.** Оба критерия трека
  («anystack-фаза с 3 гейтами пишет receipt»; «порядок в `receipt.commands` = порядку в `gatePlan`»)
  НЕ ВЫПОЛНЕНЫ. Отчёт это честно называет — ПОДТВЕРЖДАЮ раскрытие.
- **Оценка: это провал приёмки V-08 по строке доски, а не только «известный gap».** Довод исполнителя
  опирается на колонку ФАЙЛЫ `61 §1` (один файл), но **цель** той же строки звучит дословно «anystack в
  фазовой модели: read-only гейты из `gennady.yaml`, фиксированный порядок **в `gatePlan`**», а `gatePlan`
  строит именно `phase-verification-plan.ts`. Колонка ФАЙЛЫ жёстким периметром не является и в этой же
  пачке: у V-07 на доске стоит `shared/verify/stack-config.ts`, которого `fb93baaf` не трогает вовсе,
  изменив вместо него `cli/cmd/sdd-verify/{index,sdd-verify.types}.ts`. Один критерий применён к V-07
  широко, к V-08 узко. Рекомендация — задача **V-08b**; V-08 на доске не закрывать как ВЫПОЛНЕНО.
- **Побочный эффект, не раскрытый отчётом:** до `d1e7f68b` `resolvePreset('anystack')` возвращал `null`,
  и fail-closed страж V-04a (`phase-receipt.ts:1216,1262` — `if (!resolvePreset(...)) return {ok:false,
  issue:'no environmentState source…'}`) защищал anystack от node-фингерпринта. Теперь пресет непуст,
  страж пропускает, а `environmentStateSource` у anystack — строка-заглушка `'…(no fingerprint — read-only)'`;
  страж проверяет только непустоту пресета. Коммит при этом **удалил** (не перенёс) отрицательное
  утверждение из `phase-receipt.test.ts` (`/no environmentState source for stack 'anystack'/`) — покрытие
  уменьшилось, `R-V-08 §1` описывает это как «переключён пример». Латентно (сегодня `'anystack'` никто
  не передаёт). НЕБЛОКИРУЮЩЕЕ — обязано войти в приёмку V-08b.

### B.4 V-06 — readiness как движок с адаптерами

- **node байт-в-байт:** `readiness.ts:643-647` — `nodeReadinessAdapter = {stack:'node',
  gather: gatherReadinessInput, evaluate: checkReadiness}` — те же ссылки на функции, не переписаны:
  байт-идентичность по построению. Эталон V-01 45/45 (перезапущен, §D), golden-файлы не тронуты. ПОДТВЕРЖДЕНО.
- **anystack тривиально, `REQUIRED_SCRIPTS` не требуется:** `readiness.ts:678-701` —
  `ready ⟺ configuredExtraGates.length > 0`, `required: []`, `missingGates: ['stack.anystack.extraGates']`.
  `readiness.test.ts` 56/56 pass. ПОДТВЕРЖДЕНО.
- **Шим эвала не снят** (`ai/flow-eval/scripts/roundtrip-eval.sh`) — СТОП по зоне зафиксирован честно.
  ПОДТВЕРЖДЕНО как раскрытие. Владелец — см. §Итог.
- **БЛОКИРУЮЩЕЕ, не раскрыто ни одним отчётом.** Движок подключён **только** к `sdd-state` —
  read-only команде-репортёру. Все блокирующие потребители readiness остались на прямом node-пути:
  - `cli/cmd/sdd-task/sdd-task.cmd.ts:462` — `checkReadiness(gatherReadinessInput(root))`, далее
    `infraNotReadyError(...)` (`ERR_CLI_SDD_TASK_INFRA_NOT_READY`);
  - `cli/cmd/sdd-task/sdd-task.cmd.ts:107` — `formatMap`/pickable-карта и `infraGateQueue`;
  - `cli/cmd/sdd-verify/phase-context.ts:256` — `checkReadiness(gatherReadinessInput(projectRoot))`,
    ветка `if (!readiness.executionReady && profile !== 'setup')`.
  Трек §6 называл `cli/cmd/sdd-task/sdd-task.cmd.ts:462-487` в списке ключевых файлов V-06 прямо,
  а §3.4 п.1 — причину: «Пока readiness node-only, **любой** non-node проект не проходит дальше
  `sdd-task` — то есть пресеты работать не начнут, даже если движок готов». Именно этот эффект и
  сохранён. Заголовок пачки «Любой стек проходит verify без node-костылей» на сегодня не достигнут:
  anystack-репозиторий получает `ready` только в печати `sdd-state`, но всё так же не пикается
  `sdd-task` и не проходит фазовый `sdd-verify`.
- **Следствие-противоречие в `ladder.ts`.** Отчёт `R-V-06 §3` утверждает «`ladder.ts`/`gate-queue.ts`
  не нуждаются в правке … форма `ReadinessResult` не изменилась» — форма верна, семантика нет.
  `ladder.ts:68`: `infraDone = s.packageJsonPresent && s.gates.typecheck && s.gates.test && s.gates.lint`.
  Для anystack-адаптера `required: []` → `requiredPresence` пуст → в `sdd-state.cmd.ts:247-250`
  `gates.typecheck/test/lint` все `false`, а `packageJsonPresent` для не-node репо `false`. Итог: один
  и тот же прогон `sdd-state` печатает `[READINESS]` `level=ready` и карточку ладдера с незакрытым
  шагом инфраструктуры. **ОПРОВЕРГНУТО** утверждение «правка не потребовалась». НЕБЛОКИРУЮЩЕЕ по
  регрессии (node-путь не затронут), но обязано войти в приёмку доподключения.

## C. Waiver-реестр (`specs/cli/verify/verify.spec.md` §6)

Пересчёт прогоном (`git show <sha>:specs/cli/verify/verify.spec.md | grep -c 'Usage Waiver:'`):

| Срез | Записей | Снято на шаге |
|---|---|---|
| база `c9726635` | **26** | — |
| V-05 `934a4ff9` | 25 | 1 (`detectStacks`) |
| V-07 `fb93baaf` | **20** | **5** |
| V-08 `d1e7f68b` | 17 | 3 (`ANYSTACK_GATE_IDS`, `StackPreset`, `pluginConfigOf`) |
| V-06 `64b03e3c` | 17 | 0 |

- «17 записей остаются» — ПОДТВЕРЖДЕНО (перечислены поимённо, совпали).
- «25 исходных, снято 8» — **ОПРОВЕРГНУТО**: исходных **26**, снято **9**. V-07 снял **5**, а не 4:
  помимо `loadStackConfig`/`BUILTIN_GATE_IDS`/`StackConfigError`/`StackConfigLoad` снята запись
  **`PROJECT_CONFIG_FILENAME`**, не названная ни в одном отчёте и ни в тексте спеки. Снятие само по себе
  законно — реальная вторая ссылка есть (`cli/cmd/sdd-verify/sdd-verify.types.ts:14,36`), но оно
  недокументировано. Ошибка «25» унаследована из текста V-02 (там прозой стояло 25 при 26 записях) и
  пачкой 11 растиражирована; ошибка «8» — своя. Правка: числа 26/9/5 в спеке §6, в шапке `<summary>`,
  в `R-V-05`, `R-V-07`, `R-V-08`, `R-BATCH-11 §4`; добавить `PROJECT_CONFIG_FILENAME` в список снятых V-07.
- Все 8 заявленных снятыми символов имеют реальные продакшн-ссылки (`grep` без `__tests__`:
  3, 8, 6, 3, 4, 4, 5, 6). ПОДТВЕРЖДЕНО. Оговорка: ссылки на `ANYSTACK_GATE_IDS`/`StackPreset`/
  `pluginConfigOf` живут в `presets/anystack.ts`, который сам недостижим из продакшна (§B.3) — гейт
  `yagni` считает текстовые ссылки, но по существу «реальный второй вызов» ещё не состоялся.
- Владельцы 17 оставшихся: V-09 — 5 (`C`, `I`, `Bad`, `scopeHasGoGenerate`, `isStructuralListError`),
  V-18 — 4 (`TreeGuard`, `TreeGuardOptions`, `GuardAcquisition`, `acquireTreeGuard`), V-16a — 2
  (`StackRun`, `VerifyReport`), без владельца — 6 (`ConfigSectionLoad`, `formatDuration`, `allOf`,
  `validateStackConfig`, `unmatchedGateOverrides`, `applyStackConfig`). V-09, V-18, V-16a есть на доске
  (`61 §1` строки 53, 63, 60), статус ЧЕРНОВИК — принесут вызов. ПОДТВЕРЖДЕНО.
- Расхождение: спека для `formatDuration` пишет «Владелец — V-16 … или V-09», а таблица `R-BATCH-11 §4`
  относит его к «Владелец не назначен» — поправить одну из формулировок. Сами 6 записей без владельца
  противоречат правилу спеки §1 («у каждой записи есть задача-владелец…»): нужен владелец или решение
  Lead. НЕБЛОКИРУЮЩЕЕ, фиксируется.
- Гейт `yagni` — зелёный (`npm run check` → `✅ yagni (0.7s)`). ПОДТВЕРЖДЕНО.

## D. Регрессии (все команды перезапущены мной)

| Заявлено | Мой прогон | Вердикт |
|---|---|---|
| `npm test` 3880 / 3870 pass / 0 fail / 0 cancelled / 10 skipped | **3869 / 3858 pass / 0 fail / 1 cancelled / 10 skipped**, `npm test` вышел с кодом **1** | ЧАСТИЧНО: `fail 0` ПОДТВЕРЖДЕНО; «0 cancelled» и итоговые числа не воспроизвелись |
| `npm run check` 5/5 | `✅ ALL PASS (5/5)`: type-check 5.1s, test:coverage 59.8s, lint 12.1s, format 2.6s, yagni 0.7s | ПОДТВЕРЖДЕНО |
| `npm run build` | `✓ built in 3.67s` | ПОДТВЕРЖДЕНО |
| `gate:sdd-check-baseline` OK | `OK — no error outside the baseline (baseline 227c03a8…, tag rc-baseline-1)` | ПОДТВЕРЖДЕНО |
| `sdd-check --all` 192/434, 0 новых | `[sdd-check] 192 error(s), 434 warning(s) across 213 file(s)`, exit 1 | ПОДТВЕРЖДЕНО |
| Эталон V-01 45/45, golden-дифф пуст | `# tests 45 / # pass 45 / # fail 0`; `git diff … -- '*golden*'` пуст | ПОДТВЕРЖДЕНО |
| `check:directives-fresh` | `✓ ai/directives/** matches a fresh rebuild.` | ПОДТВЕРЖДЕНО |

**Флейк `cancelled` — воспроизведён и локализован.** Виновник моего прогона —
`cli/__tests__/tool-behavior/bootstrap-path.test.ts` (`testTimeoutFailure`, `timed out after 30000ms`),
файл в дифф пачки не входит. Изолированно, дважды: **12/12 pass**, 9.5с и 12.5с при пороге 30с;
`load average 18.27` на 12 ядрах. Диагноз отчёта «ресурсный флейк среды» — ПОДТВЕРЖДЁН.
Уточнение для PR: при `cancelled > 0` `npm test` возвращает **ненулевой код**, и суммарные числа
«плывут» (недосчитанный файл уносит свои тесты), поэтому «3880/3870/0/10» воспроизводимой объявлять
нельзя — корректно «`fail 0`; `cancelled` 0–5 под нагрузкой хоста».

**Пересечения.**
- Голова RC `c9b58636` (включает PR #39): `git merge-tree --write-tree` — **чисто**, merge-base `c9726635`.
- `lead/journal-round` (rc-w3, `fcdba417`): реальная база — `ade787e6`, собственный дифф 22 файла,
  пересечение с 17 файлами пачки — **пусто**, merge-tree чисто. (Наивный `diff c9726635..lead/journal-round`
  показывает 323 файла и «удаление» verify-поверхности — артефакт разошедшихся баз, не факт.)
- `lead/eval-reproducible` (rc-v6, `54bca843`): пересечение — **только `package.json`**; merge-tree чисто.
- PR #38 = `lead/phase-agent-bounds` (OPEN): 11 файлов под `ai/directives/**`, `ai/kit/**`,
  `ai/inspector/**` — пересечение **пусто**.
- Замечание: PR #39 выносит `agent-inbox`/`agent-mon` из `npm test` (D-60), поэтому после слияния с
  головой RC числа прогона изменятся в любом случае.

## E. Сводный отчёт-черновик PR

- Понятность без кодов задач: ПОДТВЕРЖДЕНО — 4 пункта «простым языком» читаются без знания V-05..V-08.
- **Пункт 2 черновика неверен по существу.** «Гейты для нетипового стека берутся из конфига… сколько
  угодно команд, в заявленном порядке» — end-to-end этого нет: ни один продакшн-путь не берёт гейты из
  конфига (§B.3). Правка: «механизм готов и покрыт тестами на уровне пресета, но фазовый прогон его ещё
  не вызывает».
- **Ложная стрелка в mermaid «стало» (§2 сводного отчёта).** Ребро `VERIFY2 --> NODE2`
  (`sdd-verify/index.ts:32-41` → `presets/node.ts:90`) реальным вызовом не является:
  `grep -n "resolvePreset\|presets/" cli/cmd/sdd-verify/index.ts` → совпадений нет; `index.ts` импортирует
  только `loadStackConfig` и `BUILTIN_GATE_IDS`. ОПРОВЕРГНУТО. Правка: ребро удалить (узлы `VERIFY2` и
  `NODE2` не связаны) — иначе диаграмма рисует именно тот путь, которого нет.
- Остальные рёбра сверены с кодом и реальны: `STATE2 --> DETECT` (`sdd-state.cmd.ts:158`),
  `STATE2 --> NODEADP`/`ANYADP` (`:166`/`:168`), `NODE2 --> ANYPRESET` (`presets/node.ts:90`);
  в `R-V-05`/`R-V-07`/`R-V-08`/`R-V-06` ложных рёбер нет. `phase-verification-plan.ts` честно нарисован
  серым пунктиром как неподключённый — ПОДТВЕРЖДЕНО.
- Остаток waiver назван, но с неверными числами (§C). Открытые вопросы названы: V-08 (фазовый путь),
  два стопа V-06. **Не назван** главный: readiness-движок не достиг `sdd-task`/`phase-context` (§B.4).
- Мелочь: цитаты строк разъехались после V-06 — `sdd-state.cmd.ts` фактически `:158` и `:160-172`
  против заявленных `:154`/`:161-169`/`:157-169`; `index.ts` `:33-41` против `:32-41`. НЕБЛОКИРУЮЩЕЕ.

---

## Итог

**БЛОКИРУЮЩЕЕ (до PR).**
1. **V-06 нельзя закрывать как ВЫПОЛНЕНО.** Движок адаптеров подключён только к `sdd-state`;
   `sdd-task.cmd.ts:107,462` и `phase-context.ts:256` остались на node-only `checkReadiness(
   gatherReadinessInput(root))`, хотя `sdd-task.cmd.ts:462-487` прямо назван в списке файлов V-06 в
   `30-TRACK-VERIFY.md §6`. Ни один отчёт этого не раскрывает. Заголовок пачки не достигнут.
2. **Числа waiver.** База 26 (не 25), снято 9 (не 8), V-07 снял 5 (не 4), `PROJECT_CONFIG_FILENAME`
   не задокументирован. Правка в спеке §6 + `<summary>` + четырёх отчётах.
3. **Ложное ребро `VERIFY2 --> NODE2`** в mermaid сводного отчёта и **неверный п.2 PR-черновика**.

**НЕБЛОКИРУЮЩЕЕ.** Критерий V-05 «три команды видят один `StackDetection`» выполнен частично (только
`sdd-state`), `probe.ts` не тронут — пометить `ЧАСТИЧНО`. V-07 отбрасывает загруженный конфиг, провенанс
не наблюдаем; шапка e2e-теста обещает непроверяемое. V-08 ослабил fail-closed страж V-04a для anystack и
удалил отрицательное утверждение из `phase-receipt.test.ts`. `ladder.ts:68` даёт для anystack карточку,
противоречащую `[READINESS]` — утверждение «правка не потребовалась» опровергнуто. 6 waiver без владельца
против правила спеки §1; расхождение по владельцу `formatDuration`. Дрейф номеров строк в цитатах.
Строку «`npm test` 3880/3870/0/10» заменить на «`fail 0`; `cancelled` 0–5 под нагрузкой».

**ПОДТВЕРЖДЕНО.** 17 файлов, полная таблица, запретные зоны чисты. `check` 5/5 c зелёным `yagni`,
`build`, `gate:sdd-check-baseline` OK, `sdd-check --all` 192/434/213, `check:directives-fresh`,
эталон V-01 45/45 при нетронутых golden-файлах, `fail 0` в полном прогоне. Флейк воспроизведён,
виновник изолирован и зелёный. Слияние с головой RC `c9b58636`, с rc-w3 и rc-v6 — чистое; с PR #38
пересечений нет. `detectStacks` — дословный v1. node-адаптер байт-идентичен по построению.
anystack: порядок гейтов, «never required», `ready ⟺ ≥1 extraGate` без `REQUIRED_SCRIPTS` — на уровне unit.

**Рекомендация: PR после правок.** Код аддитивен и регрессий не даёт — вливать можно; но до слияния
исправить п.2 и п.3 (текст, дёшево), а на доске **не закрывать V-06 и V-08**: перевести в
«ВЫПОЛНЕНО ЧАСТИЧНО» со ссылкой на V-06b/V-08b, иначе Волна 2 зафиксирует недостижимую цель как достигнутую.

**Формулировка V-08b (M).** «anystack достигает фазового пути: план гейтов резолвится по
детектированному стеку, а не по литералу `'node'`». Файлы: `shared/sdd/phase-verification-plan.ts:45,59,255`,
`shared/sdd/phase-receipt.ts:1206-1216,1256-1262`, `cli/cmd/sdd-verify/phase-context.ts`.
Зависит: V-08, V-04a, V-05. Приёмка (первые два — дословно из `30-TRACK-VERIFY.md §6`):
(1) «anystack-фаза с 3 гейтами пишет receipt»; (2) «порядок anystack-гейтов в `receipt.commands`
совпадает с порядком в `gatePlan`» (И-2 п.а); (3) восстановлено отрицательное утверждение, удалённое
в `d1e7f68b`: стек без собственного источника `environmentState` отвергается fail-closed на резолве,
а не молча фингерпринтится по node-`package.json`; (4) node — байт-в-байт, эталон V-01 45/45 без правок.

**Формулировка V-06b (M).** «readiness-движок достигает блокирующих потребителей». Файлы:
`cli/cmd/sdd-task/sdd-task.cmd.ts:107,462-487`, `cli/cmd/sdd-verify/phase-context.ts:256`,
`shared/sdd/ladder.ts:68`, `shared/sdd/gate-queue.ts:365,392`. Зависит: V-06, V-05. Приёмка:
(1) anystack-репо с ≥1 `extraGate` пикается `sdd-task` и не даёт `ERR_CLI_SDD_TASK_INFRA_NOT_READY`;
(2) карточка ладдера не противоречит блоку `[READINESS]` для anystack; (3) node-выход всех трёх
потребителей байт-в-байт, эталон V-01 45/45.

**Владелец шима эвала (`roundtrip-readiness-shim.package.json`).** Заводить новую задачу не нужно —
владелец уже есть на доске: **E-18**, чья строка `61 §1` дословно требует «round-trip `cloud-ios`
(`[x] DONE`, **receipt без `package.json`-шима**, групповая квитанция аудита, R-COMPLETE зелёный)» и
чьи файлы включают `roundtrip-eval.sh`. Правка доски: `E-18 += V-06b, V-08b` в колонку зависимостей
(без них снятие шима недостижимо — §3.4 п.4 трека и И-3); в `R-V-06 §4` заменить «владелец не назначен /
естественный кандидат E-11/E-12» на «владелец — E-18». Отдельный владелец нужен только текстам
`readiness.directive.hbs`/`ax-verification-before-handoff.xml` — это **V-15**, уже назначена.
