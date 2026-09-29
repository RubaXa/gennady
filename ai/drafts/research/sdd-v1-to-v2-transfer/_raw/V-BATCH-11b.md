ПОВТОРНАЯ ВЕРИФИКАЦИЯ Пачки 11 после правок (V-08b `da2c078f`, V-06b `9937239a`, docs `f83a4733`)

`plan-verifier`, только чтение + перезапуск команд. Дерево `…/400aa5cc-…/scratchpad/rc-w2`, ветка
`lead/verify-stacks`, HEAD `f83a4733`, база `c9726635`. Предыдущий отчёт — `V-BATCH-11.md` (3 блокирующих).
Числа пересчитаны прогоном; `dist` пересобран мной (был старше `f83a4733`).

## A. Блокеры

**A.1 V-06 — движок достигает блокирующих потребителей. ЗАКРЫТ.** `grep -rn "checkReadiness\|
gatherReadinessInput" shared cli | grep -v __tests__` → вне `readiness.ts` продакшн-вызовов нет.
`sdd-task.cmd.ts:89-95` — новая `resolveProjectReadiness(root)`: `resolveReadinessAdapter(stack) ??
nodeReadinessAdapter` → `adapter.evaluate(adapter.gather(root))`; оба потребителя переведены — `:131`
(в `formatMap`, начало `:129`) и `:486` (`--phase`-гейт). `phase-context.ts:267-277` — то же.
`ladder.ts:36-46,63-71,100-105`: `infraDone = otherStackReady === true ? true : <прежняя node-формула>`,
`step4` для не-node — «готово (не-node стек, детали — блок [READINESS])»; `sdd-state.cmd.ts:243` передаёт
поле только при `readinessAdapter.stack !== 'node'`, node-текст байт-в-байт нетронут. Противоречие
«`level=ready` + незакрытый рунг» устранено. Дрейф цитат в `R-V-06b` (`:113,483`, `:256` против
фактических `:131`, `:486`, `:276`) повторяется третий раз.

**A.2 Числа waiver. ЗАКРЫТ в спеке, НЕ ЗАКРЫТ в сводном отчёте.** Пересчёт по коммитам
(`git show <sha>:specs/cli/verify/verify.spec.md | grep -c '\*\*Usage Waiver:\*\*'`): 26 → 25 → 20 → 17 →
17 → 17 → 17. Снятые V-07 (`comm` по заголовкам `###`): `BUILTIN_GATE_IDS`, `PROJECT_CONFIG_FILENAME`,
`StackConfigError`, `StackConfigLoad`, `loadStackConfig` — ровно 5. Спека §6 и `<summary>` пишут 26/9/5 и
называют `PROJECT_CONFIG_FILENAME` со второй ссылкой `sdd-verify.types.ts:14,36`. **Остаток:**
`R-BATCH-11-verify-stacks.md` сохранил старые числа на строках 60 («8 из 25»), 124 («17 из 25»), 134
(«8 из 25») и противоречит сам себе на 183/194. Блокер называл `R-BATCH-11 §4` явно.

**A.3 Ложное ребро и п.2 черновика. ЗАКРЫТЫ.** `VERIFY2 --> NODE2` убрано с фиксацией факта (строки
103-109); п.2 переписан. Новая диаграмма «стало» (`R-V-08b §2`) сверена поребёрно: `PCTX2 → DETECT2`
(`phase-context.ts:269-271` → `stack-detection.ts:91-93`), `PCTX2 → PLAN2` (`:343,353`), `PLAN2 → PRESET2`
(`phase-verification-plan.ts:53,71,282`), `PRESET2 → ANYP2` (`presets/node.ts:90`), `PCTX2 -.gatePlan.→
PRUN2` (`phase-run.ts:187-190,364`), `PRUN2 → RCPT2`, `PLAN2 -.→ PRCPT2` (`phase-receipt.ts:1262,1271-1288`).
Ложных рёбер нет; цитаты строк плывут на 5-20.

**A.4 V-08b — три пункта задания.** (1) `grep -n "'node'" shared/sdd/phase-verification-plan.ts` → только
дефолты параметров (`:50,68,279`), `input.stack ?? 'node'` (`:344`) и комментарии; все три `resolvePreset`
принимают `stack`. (2) Перезапущено мной: `node --import tsx --test
cli/cmd/sdd-verify/__tests__/phase-run.test.ts` → `# tests 24 / # pass 24 / # fail 0`, зелёные «a 3-gate
anystack phase (no package.json) writes a receipt whose commands match gatePlan order» и «halts on the
first failing anystack gate»; попутно ОПРОВЕРГНУТО утверждение `R-V-08b §3` «standalone-запуск невозможен».
(3) `phase-receipt.test.ts:217-233,257-266` — оба пути отвергают `'golang'` с `/no environmentState source
for stack 'golang'/` (субъект вынужденно сменён `anystack`→`golang`, раскрыто). Все три ПОДТВЕРЖДЕНЫ.

**A.5 НОВОЕ: `resolvePreset(...)!` падает `TypeError`.** Живой прогон продакшн-функции:
`verificationGateNames('code', false, 'golang')` → `TypeError: Cannot read properties of null (reading
'gateNames')`. До `da2c078f` путь был недостижим (литерал `'node'`); теперь `stack` приходит из
`stack.use`, а `'golang'` — валидный `StackId` (`verify.types.ts:6`). Сегодня прикрыто случайно:
`resolveReadinessAdapter('golang')` → `null` → node-адаптер → `not-ready` → гейт срабатывает раньше плана
(воспроизведено живьём на фикстуре `go.mod` + `stack.use:[golang]`). Противоречит контракту И-3/V-04a,
который пачка объявляет восстановленным: `phase-receipt.ts` отказывает по-человечески,
`phase-verification-plan.ts:53,71,282` — падает. Правка на три строки; блокирующее для V-09.

## B. Ключевое решение: детект только при явном `stack.use`

**(а) Факт воспроизведён живым CLI** (пересобранный `dist/gennady.js`, три фикстуры, один тикет):

| Фикстура | `sdd-task ticket.md --phase P1` |
|---|---|
| нет `package.json`, нет `gennady.yaml` | `ERR_CLI_SDD_TASK_INFRA_NOT_READY … missing: package.json, type-check, test, test:coverage, format, format:fix, lint, lint:fix, fix, gennady` — дословно как раньше |
| нет `package.json`, `stack.use:[anystack]` + 1 `extraGate` | контекст фазы печатается, гейт пройден |
| нет `package.json`, `stack.use:[anystack]`, 0 `extraGates` | `… missing: stack.anystack.extraGates (gennady.yaml)` |

ПОДТВЕРЖДЕНО. Побочный эффект (в `R-V-06b §4` назван, последствие — нет): во второй строке карточка
печатает `gates: npm run type-check` — `sdd-task --phase` резолвит дисплей гейтов с `stack:'node'`, то
есть anystack-репозиторию предлагается запустить npm там, где `package.json` нет.

**(б) Согласованность.** D-14/D-15/D-16 о триггере детекта молчат — гейтировка им не противоречит; D-17
(«не ломать старые квитанции») она обслуживает. `30-TRACK-VERIFY.md` §3.1.4 описывает детект «по
репозиторию», но это про примитив, и та же §3.1.4 последним пунктом оставляет выбор primary-стека
нерешённым: «одна «основная» ступень от primary-стека … требует явного решения». **Вердикт: компромисс
Волны 2, не отход от цели** — причина реальна (воспроизведена уже существовавшим тестом про node
mid-bootstrap), а единственный живой не-node потребитель уже несёт opt-in:
`/Users/k.lebedev/.gennady/eval/cloud-ios/rt-regen/gennady.yaml` содержит `stack: use: [anystack]`
(проверено на диске). Но решение принял исполнитель, не Lead, и оно делает критерий V-05 постоянно
частичным. Отдельно: `primaryStackOf` («node побеждает, иначе первый детектированный») — правило
незадокументированное и отличное от кандидата трека («первый матч по `stack.use`, иначе `BUILTIN_PLUGINS`»).

**(в) Что доказывают A3/A6.** swift-ветка (E-10, E-18) не задета — `fixture-detmig`/`cloud-ios` живёт с
явным `stack.use`. go-ветка (E-12, `golang-slugify`) задета: обычный go-репозиторий без `gennady.yaml`
командами `sdd-task`/`sdd-verify` читается как node; больше того, даже с `stack.use:[golang]` он получает
node-адаптер готовности (`resolveReadinessAdapter('golang')` → `null`) и тот же
`ERR_CLI_SDD_TASK_INFRA_NOT_READY` — воспроизведено живьём. Критерии E-12 («`STACK`, pickable, receipt,
чист») доказывают либо конфиг-путь (если фикстуре добавят `gennady.yaml`), либо ничего; A6 «стек
определяется сам» сегодня верно только для `sdd-state`.

**L-24 (предложение).** «Детект стека для `sdd-task`/`sdd-verify` включается только при явном `stack.use`
в `gennady.yaml`; без него обе команды остаются node независимо от наличия `package.json`, потому что
`anystack` как последний резерв делает неотличимыми "не-node проект" и "node-проект до bootstrap-тикета".
`sdd-state` остаётся безусловным (read-only). Следствие: критерий V-05 закрывается частично; A3/A6 в
go-ветке до V-05b доказываются только через фикстуру с `gennady.yaml`.»

**V-05b нужна.** «Детект без `stack.use` с безопасным fallback на node». Файлы:
`shared/verify/stack-detection.ts`, `cli/cmd/sdd-task/sdd-task.cmd.ts:89-95`,
`cli/cmd/sdd-verify/phase-context.ts:267-277`. Зависит: V-05, V-06b, V-08b. Размер S/M. Приёмка:
(1) репозиторий без `package.json`, чей infra-тикет в `BOOTSTRAP_REQUIREMENTS` называет node-гейты,
остаётся node — существующий тест «missing gate scripts + a queued infra TODO ticket → gate line names it»
зелёный без правок; (2) go-репозиторий (`go.mod`, без `gennady.yaml`) резолвится в golang во всех трёх
командах; (3) `primaryStackOf` получает явное правило и тест; (4) node байт-в-байт, V-01 45/45. Правка
`!`-ассерта (A.5) — сюда же либо в V-09.

## C. Регрессии (перезапущены мной; `load average` 55-72 на 12 ядрах)

| Заявлено | Мой прогон | Вердикт |
|---|---|---|
| `npm test` 3890/3880/0 fail/0 cancelled | **3853 / 3841 / 0 fail / 2 cancelled / 10 skipped**, exit 1 | ЧАСТИЧНО: `fail 0` подтверждено, числа снова не воспроизвелись |
| `npm run check` 5/5 | 1-й прогон ⛔ на `test:coverage` (3 cancelled), 2-й — `✅ ALL PASS (5/5)`: type-check 6.6s, test:coverage 83.6s, lint 24.1s, format 11.9s, yagni 1.2s | ПОДТВЕРЖДЕНО со второй попытки |
| `gate:sdd-check-baseline` OK | `OK — no error outside the baseline (227c03a8…, rc-baseline-1)` | ПОДТВЕРЖДЕНО |
| `sdd-check --all` 192/434, 0 новых | `192 error(s), 434 warning(s) across 213 file(s)`, exit 1 | ПОДТВЕРЖДЕНО |
| эталон V-01 45/45, golden-дифф пуст | `# tests 45 / # pass 45 / # fail 0`; `git diff c9726635..HEAD -- '*golden*'` пуст | ПОДТВЕРЖДЕНО |
| `npm run build` | `✓ built in 7.72s` | ПОДТВЕРЖДЕНО |

Флейк локализован повторно: `bootstrap-path`, `clean-repo-composition`, `sdd-verify`, `inbox-review-plan`,
`lint.cmd` изолированно дают 12/12, 1/1, 27/27, 35/35, 31/31 — ни один не в диффе пачки. «3890/3880/0/0»
воспроизводимой объявлять нельзя: корректно «`fail 0`; `cancelled` 0-3 под нагрузкой хоста».
**Пересечения** (`merge-tree --write-tree` + имена файлов; собственный дифф `c9726635..f83a4733` — 28 файлов):

| Ветка | merge-tree | Пересечение |
|---|---|---|
| голова RC `c9b58636` (PR #39) | чисто | — |
| PR #38 `lead/phase-agent-bounds` `b55f7cac` | чисто | пусто |
| **PR #40 `lead/journal-round` `fcdba417`** | **КОНФЛИКТ** | `cli/cmd/sdd-task/sdd-task.cmd.ts` |
| `lead/eval-reproducible` `a157b903` | чисто | только `package.json` |
| `lead/spec-authoring` `fbf7e513` (rc-w3) | чисто | только `package.json` |

Конфликт с PR #40 — **новый относительно `V-BATCH-11.md`**; его создал V-06b, впервые тронув
`sdd-task.cmd.ts`. Существо тривиально: journal-round расщепляет импорт `scanBlockerTrail`/
`parsePhaseHandoffs` в `execution-log.ts` на строке, соседней с импортом `checkReadiness,
gatherReadinessInput`, который V-06b заменил на адаптеры. Один хунк; в порядок слияния Lead. Отдельно:
§1 сводного отчёта озаглавлена «17 файлов, `git diff c9726635..64b03e3c`» при 28 в реальном диффе —
11 файлов V-08b/V-06b имеют строку только в `R-V-08b §1`/`R-V-06b §1`.

## D. Шесть waiver-записей без владельца

- `validateStackConfig`, `allOf` → **V-19** (`61 §1` стр. 66: «`timeout > 10m` без `when` → ошибка
  валидации», файлы `stack-config.ts`, `phase-verification-plan.ts`) — единственная запланированная задача,
  обязанная добавить новое правило валидации, то есть второй прямой call site и предикат рядом с `allOf`.
- `formatDuration` → **V-16a** (`gennady verify --plan --json`, стр. 62): `timeoutMs` печатается только в
  плане; альтернатива V-14 заблокирована контрадикцией D-19 vs И-2.
- `unmatchedGateOverrides`, `applyStackConfig` → **V-12** (`when:` на гейт + сужение по Target Files,
  стр. 58) либо «снять как неиспользуемое»: V-12 первой заносит config-объявленные per-gate переопределения
  в план; если она ляжет на узкий `StackPreset`, обе записи относятся к `Gate[]`-модели MAIN, которую v2 не несёт.
- `ConfigSectionLoad` → **V-07b** (наблюдаемость конфига/провенанс — назван спекой как кандидат, на доске
  его нет) либо «снять как неиспользуемое»: внутренний тип `config-loader.ts`, второго места аннотации нет.

## Итог

**БЛОКИРУЮЩЕЕ (текст, минуты).** Устаревшие числа waiver в самом сводном отчёте, который станет телом PR:
`R-BATCH-11-verify-stacks.md` строки 60, 124, 134 против верных 26/9/5 на строках 183/194 того же файла.
Прошлый блокер №2 называл `R-BATCH-11 §4` явно.

**НЕБЛОКИРУЮЩЕЕ.** (1) `resolvePreset(...)!` → `TypeError` (A.5): сегодня недостижимо, обязано войти в
приёмку V-09. (2) Новый конфликт с PR #40 в `sdd-task.cmd.ts`. (3) Заголовок §1 «17 файлов» против 28.
(4) `sdd-task --phase` печатает anystack-репозиторию node-гейты. (5) Дрейф номеров строк в
`R-V-06b`/`R-V-08b` (±5-20). (6) Незадокументированное правило `primaryStackOf`. (7) `R-V-08b §3` неверно
утверждает невозможность standalone-прогона `phase-run.test.ts`. (8) Строку `npm test` заменить на
«`fail 0`; `cancelled` 0-3». (9) Шесть waiver без владельца — раздел D.

**ПОДТВЕРЖДЕНО.** Три блокера закрыты по существу: движок достигает `sdd-task.cmd.ts:131,486` и
`phase-context.ts:276`, `ladder.ts` согласован, node байт-в-байт; waiver 26/9/5 с
`PROJECT_CONFIG_FILENAME` в спеке; ложное ребро убрано, п.2 черновика исправлен, новая диаграмма сверена
поребёрно с кодом. `phase-verification-plan.ts` не хардкодит `'node'`; anystack-фаза на фикстуре без
`package.json` пишет квитанцию в порядке `gatePlan` (24/24); страж V-04a восстановлен на `'golang'`.
Регрессий нет: `check` 5/5, `gate` OK, `sdd-check` 192/434/213, V-01 45/45 при нетронутых golden, `fail 0`
в полном прогоне; слияние с головой RC, PR #38, `lead/eval-reproducible`, `lead/spec-authoring` — чистое.
Гейтировка по `stack.use` — обоснованный компромисс Волны 2, подтверждённый живым тестом и конфигом
реального потребителя cloud-ios.

**Рекомендация: PR после правок** — три устаревших числа и заголовок «17 файлов» в сводном отчёте,
фиксация L-24, заведение V-05b, отметка конфликта с PR #40 в порядке слияния. Код аддитивен, регрессий не
даёт; V-06/V-08 теперь закрываются честно.
