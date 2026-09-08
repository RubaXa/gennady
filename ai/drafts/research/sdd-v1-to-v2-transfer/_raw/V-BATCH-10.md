ВЕРИФИКАЦИЯ Пачка 10 — «Verify считает окружение и гейты как данные» (V-02, V-03, V-04, V-04a)

Верификатор: `plan-verifier` (свежие глаза, только чтение + прогоны). Дерево
`.../scratchpad/rc-w2`, ветка `lead/verify-core`. Метод: утверждение → команда/строка
первоисточника → вердикт → правка. Числа пересчитаны прогонами, не по отчётам.

## 0. Расхождение базы — читать первым

Отчёты писались ДО перебазирования. Факт на момент проверки:

| Что | В отчётах | Фактически |
|---|---|---|
| База | `84eeec60` (тип PR #28) | `f4b06aee` (мердж PR #30 `lead/kit-lint`) = `origin/codex/sdd-v2-rc52-followup` |
| Коммиты | `4da13fc4`, `b91d90d8`, `313dbbd8`, `c532c64a` | `bba126a7`, `cc464504`, `02959f66`, `1756b8e5` |
| Пуш | «не запушено, команды в конце» | **запушено**: `origin/lead/verify-core` = `1756b8e5` |

Перебазирование **содержимое не изменило** — ПОДТВЕРЖДЕНО: `git diff 84eeec60..c532c64a` и
`git diff f4b06aee..1756b8e5` дают одинаковый набор файлов и идентичный текст патча (сравнение с
вырезанными строками `index `). Оба — 271 файл, 8093 вставки, 48 удалений.

Замечание к брифу верификации: диапазон `4b14d781..1756b8e5` (332 файла) — НЕ диапазон пачки.
`4b14d781` — мердж PR #28; между ним и базой пачки лежит мердж PR #30. Собственный диапазон
пачки (и будущий дифф PR, т.к. база = голова RC) — `f4b06aee..1756b8e5`, 271 файл.

## A. Полнота и изоляция зон

Таблица файлов `R-BATCH-10` §1 — сверена по каталогам поштучно, **все 14 бакетов совпали
точно**: `plugins/golang/e2e/**` 210, `plugins/golang/` не-e2e 11, `plugins/anystack/e2e/**` 20,
`plugins/anystack/` не-e2e 3, `plugins/index.ts` 1, `shared/verify/` без `presets` 11,
`shared/verify/presets/**` 2, `services/config/**` 2, `shared/common/**` 2,
`scripts/test-topology.ts`+`tsconfig.json` 2, `phase-verification-plan.ts` 1, `phase-receipt*` 2,
`cli/cmd/sdd-verify/**` 3, `specs/cli/verify/verify.spec.md` 1 = **271**, файлов вне бакетов —
**0**. ПОДТВЕРЖДЕНО. По коммитам: `bba126a7` 263, `cc464504` 4, `02959f66` 4, `1756b8e5` 3.
(`R-V-02.md` §4 говорит «262 файла в индексе» — это до-L-21 снимок, без `verify.spec.md`;
фактический коммит V-02 — 263. Косметика.)

Зоны других пачек — ПОДТВЕРЖДЕНО чисто: в 271 файле **ноль** путей `ai/flow-eval/**`,
`cli/cmd/sync*`, `ai/kit/**`. Все 38 файлов `ai/kit/**`, видимые в диапазоне `4b14d781..`,
принадлежат целиком PR #30 (`git diff --name-only 4b14d781..f4b06aee` даёт те же 38).

## B. Дословность переноса (V-02) — против main `d37d5910`

Проверены **не 10 случайных, а все** перенесённые файлы программным сравнением.

**`plugins/**` — 244 файла: 242 байт-в-байт идентичны** `d37d5910`. Два отличия — ровно те, что
`R-V-02.md` §1 п.5 сам раскрыл как прогон `prettier --write`:
`plugins/anystack/e2e/fixtures/any-with-node-stack/package.json` (раскрытие однострочного
`"scripts"`) и `plugins/golang/skills/sdd-infra-golang/SKILL.md` (выравнивание markdown-таблицы,
`"…"` → `'…'`, `*designed*` → `_designed_`). Смысловых отличий нет. ПОДТВЕРЖДЕНО.

**`shared/verify/**` — отличия только в путях импортов**, ПОДТВЕРЖДЕНО: `verify.types.ts`
(← `services/stack/stack.types.ts`), `tree-guard.ts`, `__tests__/tree-guard.test.ts`,
`services/config/__tests__/config-loader.test.ts` — **байт-в-байт**; `env-fail.ts`,
`stack-registry.ts` и четыре теста — ровно одна строка `./stack.types.ts` → `./verify.types.ts`;
`plugin-api.ts`, `stack-config.ts` — та же строка + `../config/config-loader.ts` →
`../../services/config/config-loader.ts`.

**`services/config/config-loader.ts`** — одна строка:
`../../shared/common/damerau-levenshtein.ts` → `../../cli/cmd/orient/core/damerau-levenshtein.ts`.
Заявление «байт-в-байт идентичный алгоритм» ПОДТВЕРЖДЕНО с уточнением: единственное отличие
двух копий — строка шапки `@consumers` (в main она перечисляет `stack-config`). Файл
`shared/common/damerau-levenshtein.ts` в RC действительно отсутствовал — ПОДТВЕРЖДЕНО.

**`plugins/index.ts`** — сужение (`BUILTIN_PLUGINS = [anystackPlugin, golangPlugin]`, без
`nodePlugin`) + новая шапка с обоснованием. Отклонение раскрыто в `R-V-02.md` §5 п.1 и
соответствует строке доски V-02 (`plugins/{anystack,golang}/**`). ПОДТВЕРЖДЕНО.

**126/126 перенесённых тестов** — перезапущено мной, `# tests 126 / # pass 126 / # fail 0`.
ПОДТВЕРЖДЕНО (строка доски требует 106 — перевыполнено).

## C. Существо

### V-03 — ПОДТВЕРЖДЕНО

- `GateStatus` (`sdd-verify.types.ts:242-250`) = `'pass'|'fail'|'skipped'|'missing'|'env-fail'|'timeout'|'violation'`;
  `Gate` (`:22-66`) получил `argv/cwd/env/timeoutMs/envFail/requires/stack/outputMeansFailure/driftMeansFailure`,
  все опциональные; **ни одна запись `GATES` (`:72-80`) их не заполняет** → И-1/И-2 не задеты.
- `verdict()` (`:399-489`): `envFailed` — отдельный фильтр (`:427`) с собственным кодом
  `ERR_CLI_SDD_VERIFY_ENV_FAIL`, вне счётчика `FAILED`; `timeout`/`violation` идут в `failed`.
- «Строки статуса не сравниваются как текст» — ПОДТВЕРЖДЕНО: все ветви сравнивают типизированное
  поле `r.status` дискриминированного объединения; ни одного разбора отрендеренного вывода.
- Потребители обновлены: `runGate` (`sdd-verify.cmd.ts:223-297`) применяет `requires` (`:234-250`),
  `outputMeansFailure` (`:264-266`), `envFail` (`:273-286`); `run()` тормозит на `env-fail` (`:655`).
  `runGate` вызывается из продакшена (`:646`, `:702`), экспорт — для тестов, в поверхность не попал.
- `sdd-verify.types.ts:12` реально импортирует `Cmd`, `EnvFailPredicate`, `StackId` из
  `shared/verify/verify.types.ts` — это единственное настоящее подключение ладдера к
  перенесённому коду в этой пачке (в mermaid сводного отчёта не показано, см. §F).

### V-04 — ПОДТВЕРЖДЕНО

- `resolvePreset(stack, _profile, _root, _config?)` — `shared/verify/presets/node.ts:81-111`,
  сигнатура ровно как в строке доски и D-17; `null` для любого стека кроме `'node'`.
- Делегирование `phase-verification-plan.ts:45`, `:59`, `:255` (отчёт пишет `58` — фактически `59`).
- Node байт-в-байт: `commandForGate` возвращает `` `npm run ${script}` `` (`node.ts:107`) и
  `'target-repair'` для `fix` — та же строка, что до V-04.
- **Golden НЕ обновлялся** — ПОДТВЕРЖДЕНО тремя способами: (1) прогон 45/45
  (`preset-node-golden.test.ts` 19 + `parity-node.test.ts` 26, оба файла отдельно — как требует
  бриф); (2) оба golden-теста и все `*.golden.json`/`*.golden.txt` не входят в дифф
  `f4b06aee..1756b8e5`; (3) единственное совпадение `git log -p -- '*golden*'` в диапазоне —
  `plugins/golang/e2e/fixtures/go-fmt-excludes-nested-testdata/internal/testdata/golden.go`,
  Go-фикстура, а не эталон V-01.
- D-17 «старые квитанции валидны» — ПОДТВЕРЖДЕНО зелёным тестом `parity-node.test.ts:423`
  «a receipt frozen as a fixture … still validates against today's code».
- 9/9 тестов `presets/__tests__/node.test.ts` — перезапущено.

### V-04a — ПОДТВЕРЖДЕНО с оговоркой

- `environmentState` через пресет: `phase-receipt.ts:1216` и `:1262` — `if (!resolvePreset(...))`
  стоит **до** любой node-специфики (до чтения `package.json`), отказ
  `no environmentState source for stack '<x>' — no preset is implemented for it yet`.
  «Фейлится на резолве, а не на записи receipt» — ПОДТВЕРЖДЕНО.
- Fail-closed для стека без пресета — ПОДТВЕРЖДЕНО; `stack: StackId = 'node'` по умолчанию →
  существующее поведение не менялось.
- 30/30 `phase-receipt.test.ts` (27 старых + 3 новых) — перезапущено; +3 `it(` в диффе, совпадает.
- **Матрица npm/pnpm/yarn — по существу ПОДТВЕРЖДЕНО, ссылка в отчёте неверна.**
  `R-V-04a.md` §3 ссылается на `parity-node.test.ts`, но его тест «pnpm/yarn script forwarding»
  (`:591-616`) прогоняет только `pnpm run mylint` — слова `yarn` в теле файла нет вообще.
  Покрытие yarn живёт в `shared/sdd/__tests__/phase-receipt.test.ts:445` и `:760` — обе
  доперенесённые, в диффе пачки не менялись, и эта неизменность и есть доказательство
  байт-идентичности. Ответ на вопрос брифа: тесты на yarn **есть**, но не там, куда указывает отчёт.
- **И-3 закрыт в объёме, который задаёт `30-TRACK-VERIFY.md` §6 строка V-04a** (оба пункта
  приёмки выполнены). Оговорка: `environmentStateSource` — **метка, а не механизм**. Поле нигде
  не читается в продакшене (`grep '\.environmentStateSource'` даёт единственное попадание —
  `node.test.ts:48`); гейт проверяет лишь `resolvePreset(...) !== null`, движок фингерпринта
  остаётся node-захардкоженным. Раскрыто в `R-V-04a.md` §5, но **шапка кода утверждает
  обратное**: `presets/node.ts:64-68` «V-04a wires the engine that reads it» — теперь ложно.

## D. Waiver (L-21)

- Реестр `specs/cli/verify/verify.spec.md` §6 — **26 записей** (25 символов V-02 + `StackPreset`
  от V-04). Формулировка спеки «25 символов V-02» корректна. **У каждой записи есть
  владелец-задача** (V-05 / V-07 / V-08 / V-09 / V-16a / V-18) — ПОДТВЕРЖДЕНО поштучно;
  сводка `R-BATCH-10` §4 покрывает все 26 без пропусков.
- «Записи, чьи вызовы появились в пачке, сняты» — ПОДТВЕРЖДЕНО как «снимать было нечего»:
  единственный символ, получивший реальные продакшн-вызовы, — `resolvePreset` (13 ссылок вне
  тестов), он никогда не был в реестре. `StackPreset` остаётся waived корректно (используется
  только как аннотация возвращаемого типа самого `resolvePreset`).
- `yagni` — **зелёный** (`npm run check`, 0.7s), т.е. ни один символ не нарушает правило «<2
  вызовов без waiver». ПОДТВЕРЖДЕНО.
- **«Спека не даёт новых ошибок `sdd-check`» — ПОДТВЕРЖДЕНО для ошибок, ОПРОВЕРГНУТО для
  формулировки отчёта.** Новых *ошибок* — 0 (`gate:sdd-check-baseline` OK). Но `R-V-04a.md` §1
  пишет «`sdd-check --all` не добавил новых находок по этому файлу» — фактически добавил две
  новые *warning*-находки, обе порождены именно этой пачкой:
  - `specs/cli/verify/verify.spec.md: warn: SDD_MODULE_NO_CALL_CHAIN` — «Module spec has 11
    entities (≥ 2) but no call-chain rung»;
  - `specs/cli/cli.spec.md: warn: SDD_MODULE_NOT_IN_INDEX` — `verify.spec.md` не слинкован из
    родительского индекса.
  Правка дешёвая: ссылка на модуль в `specs/cli/cli.spec.md` + `sequenceDiagram` либо
  шаг-таблица в §2 спеки.

## E. Регрессии — все команды перезапущены мной

| Команда | Отчёт | Мой прогон | Вердикт |
|---|---|---|---|
| `npm test` | 3715 / 3705 / 0 / 10 | **3784 / 3774 / 0 / 10**, exit 0 | ОПРОВЕРГНУТО (число), регрессий нет |
| `npm run check` | ALL PASS (5/5) | `[sdd-verify] ✅ ALL PASS (5/5)`, exit 0 | ПОДТВЕРЖДЕНО |
| `npm run build` | ✓ built, exit 0 | `✓ built in 3.07s`, exit 0 | ПОДТВЕРЖДЕНО |
| `sdd-check --all` | 198 err / 433 warn / 213 files | **198 / 433 / 213** (пересчитано grep'ом) | ПОДТВЕРЖДЕНО |
| `gate:sdd-check-baseline` | OK | `[sdd-check-zero-new-error] OK` (baseline `227c03a8`, `rc-baseline-1`) | ПОДТВЕРЖДЕНО |
| V-01 golden (оба файла отдельно) | 45/45 | 19/19 + 26/26 = **45/45** | ПОДТВЕРЖДЕНО |
| `npm run test:topology` | `unit=222 contract=16 local=53 external=8` | **`unit=225 contract=20 local=53 external=8`** | ОПРОВЕРГНУТО (число), гейт зелёный |
| `sdd-verify.cmd.test.ts` | 86 | 86 | ПОДТВЕРЖДЕНО |
| `phase-receipt.test.ts` | 30 | 30 | ПОДТВЕРЖДЕНО |
| `presets/node.test.ts` | 9 | 9 | ПОДТВЕРЖДЕНО |

Расхождения `npm test` и `test:topology` — следствие перебазирования: числа снимались на
`84eeec60`, а PR #30 добавил тесты. Регрессией не являются (`# fail 0`), но в тексте PR неверны.

**Топология**: все 10 новых/перенесённых тест-файлов классифицированы, каждый ровно в один слой
(`golang-scope.test.ts` и `tree-guard.test.ts` → `local`, остальные восемь → `unit`); дубликатов
по 306 файлам корпуса нет. Новый корень `plugins` зарегистрирован в `scripts/test-topology.ts`
(`TEST_ROOTS`, `UNIT_ROOTS`) и в независимой копии `legacyGateCorpus`
(`shared/common/__tests__/test-topology.test.ts`). ПОДТВЕРЖДЕНО.

**Конфликты с открытыми PR** — `git merge-tree --write-tree` против `1756b8e5`: #31
`lead/specs-match-code`, #32 `docs/flow-eval-results`, #33 `lead/eval-honest-outcome`, #34
`lead/surface-locks`, #36 `lead/test-speed` — **все чисто, exit 0, ни одного конфликта**.
Пересечение файлов только с #36 и ровно по двум путям, как и предполагал бриф:
`scripts/test-topology.ts` и `shared/common/__tests__/test-topology.test.ts`. Ханки
непересекающиеся и семантически ортогональные: пачка меняет **состав** корней
(`TEST_ROOTS`/`UNIT_ROOTS`/`legacyGateCorpus` += `plugins`), #36 — **параллелизм и порядок
диспетчеризации** (`OUTER_TEST_CONCURRENCY`, `DETERMINISTIC_LAYER_ORDER`); #36 сам пишет «Set
membership is unchanged — only dispatch order». Слияние безопасно. ПОДТВЕРЖДЕНО.

## F. Сводный отчёт-черновик PR

Понятность без кодов — хорошая: §«Черновик для PR» объясняет движок, гейты, пресет и
`environmentState` обычными словами и проговаривает «поведение для Node не изменилось». Таблица
файлов точна (§A), остаток waiver с владельцами приведён полностью. Претензии к mermaid «стало»
(стрелка = реальный вызов, `file:line`):

| Стрелка / узел | Заявлено | Факт | Вердикт |
|---|---|---|---|
| `PLAN2 --> NODE2` | `phase-verification-plan.ts:45,58,255` | вызовы на `:45`, **`:59`**, `:255` | ПОДТВЕРЖДЕНО (сдвиг 1) |
| `RCPT2 --> NODE2` | `phase-receipt.ts:1205-1245,1255-1275` | функции ровно `1205-1245` и `1255-1275`, вызовы `:1216`, `:1262` | ПОДТВЕРЖДЕНО (точно) |
| узел `NODE2` | `presets/node.ts:81-111` | `resolvePreset` ровно `81-111` | ПОДТВЕРЖДЕНО (точно) |
| `CMD2 --> PLAN2` | сплошная стрелка = вызов | `sdd-verify.cmd.ts:28` — `import type { PhaseVerificationPlan }`, **только тип, не вызов** | ОПРОВЕРГНУТО |
| `CMD2 -.-> REG2` | пунктир «ещё не подключено» | ссылок из `sdd-verify.cmd.ts` на `stack-registry`/`stack-config`/`plugins` нет вовсе | ПОДТВЕРЖДЕНО (легенда явно объявляет пунктир будущей связью) |
| узел `CMD2` | `sdd-verify.cmd.ts:230-296` | `runGate` = `223-297` | сдвиг 7 |
| (`R-V-03`) `TYPES2` | `sdd-verify.types.ts:21-44` | `Gate` = `22-66`, `GateStatus` = `242-250` | ОПРОВЕРГНУТО (скопирована до-правочная ссылка доски) |
| (`R-V-03`) `VERDICT2` | `:412-437`, узел стоит в цепочке от `CMD2` | `verdict()` живёт в **`sdd-verify.types.ts:399-489`**, не в `sdd-verify.cmd.ts` | ОПРОВЕРГНУТО (файл не назван, читается как `cmd.ts`) |
| пропуск | — | не показано единственное реальное новое ребро ладдер → перенесённый код: `sdd-verify.types.ts:12` → `shared/verify/verify.types.ts` | неполнота |

## G. Прочие находки

1. **`R-V-03.md` §1 «+19 юнит-тестов»** — ОПРОВЕРГНУТО: в диффе `cc464504` добавлено **11**
   `it(` (файл 75 → 86). Итоговые 86 в §3 верны, неверно только число новых.
2. **230 из 271 файлов — инертны.** Фикстуры `plugins/{golang,anystack}/e2e/**` перенесены, но
   их прогонщик из main (`services/stack/__tests__/e2e/{plugin-suite.e2e.test.ts,suite.ts,fixture.ts}`)
   **не переносился**, и ни один файл RC не ссылается на `e2e/fixtures`. Это в границах строки
   доски V-02 (`plugins/**`), но текст waiver `verify.spec.md:126` для `C`/`I`/`Bad` утверждает в
   настоящем времени «фикстуры реально упражняются e2e-прогоном golang-пресета» — сегодня ложно;
   станет правдой в V-09, которой придётся портировать и харнесс.
3. **Шапки `@consumers` не обновлены**: `cli/cmd/orient/core/damerau-levenshtein.ts:2` (новый
   потребитель `services/config/config-loader.ts`), `shared/verify/presets/node.ts:4` (после
   V-04a потребителей два, указан один).

## Итог

**Блокирующее (правки только в документах, код менять не нужно):**
1. `R-BATCH-10-verify-core.md` §5/§6 и подпись mermaid «HEAD `c532c64a`» описывают
   до-перебазировочное состояние: неверные база (`84eeec60` вместо `f4b06aee`), неверные четыре
   SHA, инструкция «Lead обязан перебазировать перед пушем» при уже перебазированной и
   **запушенной** ветке (`origin/lead/verify-core` = `1756b8e5`). Этот же файл §6 предписывает
   делать из себя тело PR (`--body "$(cat …)"`) — в таком виде PR будет противоречить
   собственному диффу.
2. Устаревшие числа доказательств в том же теле PR: `npm test` `3715/3705` → фактически
   `3784/3774/0/10`; `test:topology` `unit=222 contract=16` → `unit=225 contract=20`.
3. `R-V-04a.md` §1: «`sdd-check --all` не добавил новых находок по этому файлу» — ОПРОВЕРГНУТО,
   добавлены две warning-находки (`SDD_MODULE_NO_CALL_CHAIN` на `specs/cli/verify/verify.spec.md`,
   `SDD_MODULE_NOT_IN_INDEX` на `specs/cli/cli.spec.md`). Ошибок 0 — это верно и подтверждено.
   Либо снять находки (линк из родительского индекса + цепочка вызовов в §2 спеки), либо
   переписать утверждение честно.

**Неблокирующее:**
4. `presets/node.ts:64-68` — комментарий «V-04a wires the engine that reads it» ложен:
   `environmentStateSource` не читается в продакшене ни разу; И-3 закрыт проверкой
   `resolvePreset(...) !== null`, а не чтением источника.
5. `R-V-04a.md` §3 ссылается на `parity-node.test.ts` как на доказательство матрицы
   npm/pnpm/yarn — там покрыт только `pnpm`; yarn покрыт в `phase-receipt.test.ts:445,760`.
6. `R-V-03.md` §1 «19 новых тестов» → фактически 11.
7. Дрейф `file:line` в mermaid `R-V-03`/`R-BATCH-10` для узлов V-03 (`runGate` 223-297,
   `Gate` 22-66, `GateStatus` 242-250, `verdict()` в `sdd-verify.types.ts:399-489`);
   стрелка `CMD2 --> PLAN2` — импорт типа, не вызов; не показано ребро
   `sdd-verify.types.ts:12` → `shared/verify/verify.types.ts`.
8. Текст waiver для `C`/`I`/`Bad` утверждает, что e2e-фикстуры уже упражняются — прогонщика в RC нет.
9. Шапки `@consumers` в `damerau-levenshtein.ts` и `presets/node.ts` не дополнены.
10. `R-V-02.md` §4 «262 файла» → в коммите 263.

**Подтверждено:** 271 файл, все 14 бакетов поштучно, вне бакетов 0, зоны `ai/flow-eval/**`,
`cli/cmd/sync*`, `ai/kit/**` не тронуты; перебазирование содержимое не изменило; дословность —
242/244 `plugins/**` байт-в-байт с `d37d5910` (два файла — раскрытая косметика prettier),
`shared/verify/**` только пути импортов, сужение `plugins/index.ts` документировано; 126/126
перенесённых тестов реально исполняются, каждый файл ровно в одном слое; V-03 — `Gate`/`GateStatus`
данные с `env-fail|timeout|violation`, `GATES` их не задаёт, статусы сравниваются типизированно,
`env-fail` вне счётчика FAILED; V-04 — `resolvePreset(stack, profile, root, config)` по D-17, node
байт-в-байт, эталон V-01 45/45 **без единого обновления golden**; V-04a — fail-closed до
node-специфики на обоих сайтах, матрица npm/pnpm/yarn покрыта, И-3 закрыт в объёме строки трека;
waiver — 26 записей, у каждой владелец, `yagni` зелёный, снимать было нечего; регрессий нет
(`npm test` 0 fail, `check` 5/5, `build` 0, `sdd-check` 198/433/213, baseline-гейт OK);
`git merge-tree` чист против #31/#32/#33/#34/#36, пересечение с #36 семантически безопасно.

**Рекомендация: PR после правок** — правки исключительно текстовые (пункты 1–3), в коде менять
нечего. После обновления SHA/базы/чисел в `R-BATCH-10-verify-core.md` и честной формулировки
про две warning-находки пачку можно вливать как есть.
