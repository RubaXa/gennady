# R4 — Дайджест `ai/flow-eval` на RC HEAD `227c03a8` (что это по факту, что врут доки)

> Статус: аналитический сырец. Источник фактов — чекаут ветки `codex/sdd-v2-rc52-followup`,
> HEAD `227c03a8`, дерево чистое (`?? .npm-ci-done`), путь чекаута:
> `…/scratchpad/rc-v6`. Прочитаны **все 19** `*.md` в `ai/flow-eval/**` (2025 строк) и код:
> `cli.ts`, `runner.ts`, `observer.ts`, `judge.ts`, `evidence.ts`, `prompts.ts`, `provision.ts`,
> `quality-gate.ts`, `migration-grade.ts`, `sandbox-lifecycle.ts`, `session-directory.ts`,
> `opencode-runtime.ts`, `types.ts`, `scenarios.json`, `scripts/*` (8 файлов), `__tests__/*` (12 файлов).
> Все утверждения ниже помечены как «в коде» / «только в доке» / «расходится».
> `227c03a8` = docs-only + guard (`git show --stat`: 5 новых доков, `require-developer-repo.sh` +
> его bash-селф-тест, по 4 строки в двух раннерах). **Код харнесса с `3d5f66a7` не менялся** —
> значит все кодовые факты `50-TRACK-EVAL.md` остаются в силе, устарел только doc-слой.

---

## 1. Что такое flow-eval и инвентарь документов

### 1.1 Одним абзацем (по коду, не по докам)

flow-eval — это внешний прогонщик: он берёт **сценарий** (JSON-объект: какую фазу SDD проверяем,
в какой стартовой фикстуре, с каким intent/acceptance), материализует под каждый сценарий
**отдельный одноразовый git-репозиторий** со свежесобранным `gennady` внутри
(`node_modules/gennady/dist` + `ai/**` + bin-shim), создаёт **одну сессию OpenCode** на уже
работающем HTTP-сервере (никаких `codex`/`opencode`-бинарей — только `@opencode-ai/sdk`), скармливает
ей фазовый промпт и затем **не вмешивается**: раз в интервал внешний наблюдатель читает ограниченный
хвост сообщений, статус сессии и diff репозитория, вычисляет «есть ли прогресс» и при N одинаковых
снимках сам обрывает воркера. После остановки два независимых оценщика выносят результат:
**LLM-судья** в отдельной сессии с узкой evidence (`intent`/`acceptance`/`diff`/`events`/`tail`/`state`)
обязан выдать первой строкой `VERDICT: pass|fail|inconclusive`, а **детерминированный quality-gate**
читает файлы песочницы напрямую (`R1` = `sdd-check --all` чист, `R-COMPLETE` = артефакт+DONE+закрытый
раунд+групповые квитанции, `MIGRATION` = `FLOW_VERSION=v2` + ноль внесённых критических находок).
Всё, что стоит хранить (спеки, обоснование судьи, `summary.json`), копируется в
`ai/flow-eval/.results/run-<ISO>/`, а песочницы **удаляются** (если не передан `--keep`).

### 1.2 Инвентарь: 19 документов

`назначение → адресат → дублирует → состояние` (строк — по `grep -c ''`).

| # | Документ | Строк | Назначение | Адресат | Дублирует | Состояние |
|---|---|---|---|---|---|---|
| 1 | `README.md` | 83 | «что это», карта доков, каноническая команда | новичок-человек | `docs/ARCHITECTURE` §1–3 (устройство), `RUNBOOK` (команда) | **частично устарел**: `:41` «reference scenarios (authoring, scaffold, execute, repair)» — в файле **7** сценариев (+3 `task`); канон-команда без `--keep`/`--artifacts-dir`, teardown не упомянут; таблица «How it is wired» не содержит `quality-gate.ts`, `migration-grade.ts`, `sandbox-lifecycle.ts`, `prompts.ts`, `opencode-runtime.ts`; «Fake-backed regression suite … no OpenCode server needed» умалчивает, что сюите нужен собранный `dist/` (`provision.ts:1126-1128`) |
| 2 | `RUNBOOK.ru.md` | 211 | процедура: сервер, env, живой прогон, чтение наблюдений, вердикт | оператор + «следующий агент» | `docs/PREREQUISITES` §1–3 (почти дословно), README (компоненты), `WRITING-EVALS` §6 (грабли) | **устарел в трёх местах**: `:25` «Три эталонных сценария»; `:36`/`:119` жёсткий путь worktree `sdd-v2-rc52-followup`; `:181-198` «цепочные прогоны на одной песочнице» **невозможны по умолчанию** — `cli.ts:184-215` удаляет песочницы в `finally`, а флага `--keep` в доке нет; про `.results/` нет ни слова; `--stuck-after 1` против README `--stuck-after 2` |
| 3 | `WRITING-EVALS.ru.md` | 158 | как добавить сценарий/фикстуру | разработчик-автор эвала | judge-контракт (README, ARCHITECTURE), грабли (RUNBOOK) | **устарел по типам**: таблица `:26` знает 3 фазы из **7**, 3 режима из **11**; «эталонные фикстуры» — 4 из **14**; поле `completion` (`types.ts:22-26`) и правило `R-COMPLETE` **не упомянуты вовсе** — автор нового эвала о них отсюда не узнает |
| 4 | `QUALITY-RULES.ru.md` | 65 | бэклог правил R1–R6, дисциплина both-way, набор brownfield | автор харнесса | brownfield-набор дублирован в `ROADMAP` §A2/§B и `EXPERIMENTS-LOG` | **расходится с кодом**: в коде существуют `R1`, `MIGRATION`, `R-COMPLETE`; из бэклога реализовано **1 из 6**; `MIGRATION`/`R-COMPLETE` в бэклог не внесены; `:44` «Итерация 1 (R1+R3) — стартуем» при том, что `R3` в коде нет, а R-COMPLETE уже сдан |
| 5 | `ROADMAP.ru.md` | 77 | рабочий TODO автора, «все цели закрыты» | автор | `EXPERIMENTS-LOG` (те же H4/B3/B4 короче) | **устарел**: `:59` «suite 71/71» (сейчас ~90 кейсов), `:63` «все цели закрыты» — при том что весь миграционный и round-trip трек в роадмапе отсутствует; `C4` (R1–R6) открыт |
| 6 | `PROGRESS-REPORT.ru.md` | 125 | отчёт «было→стало» для коллег | коллеги/руководство | `EXPERIMENTS-LOG`, грабли RUNBOOK | **числа исторические**: получены до `4bb00f4b` (STEP_6/7) и до фикса stale-dist `3d5f66a7`; «полный greenfield end-to-end (chain10b)» с тех пор не перепроверялся; локальные тестовые числа (`judge 3/3`, `fixture-coverage 3/3`) уже не совпадают с сюитой |
| 7 | `EXPERIMENTS-LOG.ru.md` | 262 | журнал H1–H5/B3/B4: токены, 10 вариаций, деградаторы | автор/аналитик | — (уникальный контент) | **валиден, с оговоркой**: `:255` «урок зафиксирован в RUNBOOK-практике» — в `RUNBOOK` ни ENOSPC, ни `sandbox.ts`; все `total` не включают `cacheRead` (`evidence.ts:285`), т.е. «токен-экономика» систематически занижена |
| 8 | `INFRA-TASKS-RESEARCH.ru.md` | 58 | ресёрч, из которого выросли 3 инфра-фикстуры | автор фикстур | `QUALITY-RULES` §brownfield по жанру | **историчен**: фикстуры уже в `provision.ts:999-1022`, golden залочен `infra-golden.test.ts` — для запуска не нужен |
| 9 | `P9-UNDERSTANDING-SIGNIFIERS.md` | 43 | калибровка сообщений CLI по одной сессии | автор CLI-сообщений | — | историчен; фикстура `__tests__/fixtures/p9-misunderstood-cases.json` существует (в коде) |
| 10 | `P9-VERIFICATION.md` | 50 | протокол одного прогона 2026-09-02 | аудитор | — | историчен; пути песочницы (`/private/tmp/p9-flow-eval-root.*`) давно удалены |
| 11 | `docs/ARCHITECTURE.ru.md` | 103 | пайплайн (mermaid), роли модулей, детерминизм vs judge | новичок-инженер | README «How it is wired» | **самый точный док**. Пробелы: в диаграмме и в таблице §4 нет `MIGRATION` grade; нет teardown/`--keep`; `:74` «сценарии (authoring, scaffold, execute, repair и др.)» |
| 12 | `docs/PREREQUISITES.ru.md` | 93 | чек-лист готовности + правило `~/Developer/` | оператор/агент | `RUNBOOK` «Подготовка» — дубль на ~80% | **расходится**: `:81` обещает `REPO="${REPO:-$HOME/Developer/<repo>}"`, в скриптах literal `/Users/k.lebedev/Developer/cloud-ios` (`migration-eval.sh:12`, `roundtrip-eval.sh:19`) |
| 13 | `docs/WRITING-EVALS-EXTERNAL.ru.md` | 103 | паттерн «эвал на своём внешнем репо» | разработчик | `roundtrip-eval.sh` (пересказ), PREREQUISITES §4 | **внутреннее противоречие**: таблица §4 «Пересборка gennady — подхватывается автоматически при провижне» (для встроенных фикстур) против §3 и PREREQUISITES §1 («build обязателен всегда») |
| 14 | `docs/METRICS.ru.md` | 125 | quality-gate + `session-metrics.py` + telemetry | оператор/агент | ARCHITECTURE §4, README | точен и честен (прямо пишет, что `session-metrics.py gate` зашит на cloud-ios). **Пробел**: `MIGRATION` grade — единственный детерминированный бар миграции — не описан **нигде** в доках |
| 15 | `docs/AGENT-BRIEF.ru.md` | 71 | copy-paste бриф агенту | агент (LLM) | README/RUNBOOK/PREREQUISITES (пересказ ссылками) | **ближайший конкурент нашему Part B и он не самодостаточен**: ни одной точной команды запуска (всё через «см. README»), нет `--keep`/`.results`, нет stop-conditions, «формат отчёта» = чек-лист без полей |
| 16 | `docs/flow-verification-redesign.md` | 167 | план редизайна verification (v1 + v2 после критики) | автор/критик | `flow-verification-ledger` (тот же материал в реестре) | **историчен**: реализовано (см. ledger E1); «open questions for the critic» закрыты; `:71` «flow-eval unit tests (84/84)» устарело |
| 17 | `docs/flow-verification-ledger.md` | 91 | append-only реестр CONFIRMED/REFUTED/ACCEPTED/LANDED | автор | пересекается с redesign | **ценнейший**, но чисто авторский; для запуска эвала бесполезен |
| 18 | `docs/roundtrip-wall3-assessment.md` | 79 | три «стены» cloud-ios + результат rt4 (71/82) | автор/оператор | — | историчен + одна живая архитектурная находка (readiness node-hardcoded, adaptive verify живёт на `main`) |
| 19 | `docs/swiftlint-toolchain-setup.md` | 61 | хостовая настройка Swift 6.2 + TMPDIR-грабля | оператор ЭТОГО хоста | — | **битая ссылка**: `:51` ссылается на `run-bench.sh` — такого файла в `scripts/` нет (есть `roundtrip-grade.sh`, который делает `export TMPDIR=/tmp`) |

### 1.3 Матрица дублирования (тема × документ)

| Тема | README | RUNBOOK | ARCHITECTURE | PREREQUISITES | WRITING-EVALS | W-E-EXTERNAL | METRICS | AGENT-BRIEF |
|---|---|---|---|---|---|---|---|---|
| «Что это / зачем» | ✅ канон | ✅ дубль | ✅ дубль | — | ✅ дубль (§0) | ✅ дубль | — | ✅ дубль |
| Таблица компонентов | ✅ (неполная) | ✅ (неполная) | ✅ канон | — | — | — | — | — |
| Поднять сервер/env/порт | — | ✅ канон | — | ✅ дубль | — | — | — | ✅ дубль (ссылкой) |
| `npm run build` обязателен | ⚠️ вскользь | ✅ | ✅ | ✅ канон | ✅ | ✅ | — | ✅ |
| Команда запуска | ✅ канон | ✅ дубль (другие флаги!) | — | — | ссылкой | ссылкой | — | ссылкой |
| Чтение наблюдений | — | ✅ канон | ✅ кратко | — | — | — | — | — |
| Контракт судьи | ✅ | ✅ | ✅ | — | ✅ канон (§4) | — | — | — |
| Детерминированные гейты | ⚠️ 1 строкой | ⚠️ «две мерки» | ✅ | — | ✅ (§5) | ✅ | ✅ канон | ✅ |
| Грабли/анти-паттерны | — | ✅ | — | — | ✅ дубль | ✅ частично | — | — |
| Что оставляет на диске | — | ❌ | ⚠️ `.results/` вскользь | — | — | — | ⚠️ ledger | ⚠️ «не удаляй» |

Вывод по инвентарю: **четыре документа (README, RUNBOOK, ARCHITECTURE, WRITING-EVALS) на 555 строк
рассказывают одно и то же ядро тремя разными наборами чисел**; ещё 5 доков (`ROADMAP`,
`PROGRESS-REPORT`, `EXPERIMENTS-LOG`, `INFRA-TASKS-RESEARCH`, `P9-*`) — авторский журнал, который
новичок читает как инструкцию и получает устаревшие цифры; 4 дока в `docs/` — историческая
аналитика одного кейса (cloud-ios). Для запуска эвала нужны **~40 строк**, разбросанные по 6 файлам.

---

## 2. Модель eval, извлечённая из кода

Легенда статуса: **в коде** — работает так, как написано ниже; **только в доке** — описано, но кодом
не поддержано; **расходится** — код и док противоречат.

### 2.1 Конвейер по этапам

| # | Этап | Entry point / команда | Входы | Выходы (файлы/пути) | Критерий pass/fail | Тесты | Статус |
|---|---|---|---|---|---|---|---|
| 0 | Предпосылки | `npm run build` (+`npm run build:directives` при правке шаблонов); запущенный `opencode serve --hostname 127.0.0.1 --port <P>`; `LLM_PROXY_BASE_URL`/`LLM_PROXY_API_KEY` в env | — | `dist/gennady.js` | `findGennadyRoot` падает: `gennady dist is missing at <root>/dist; run npm run build first` (`provision.ts:1126-1128`) | `provision-gennady.test.ts` (2 кейса) | **в коде** |
| 1 | Сценарий | `--scenario-file <FILE>` (дефолт — `./scenarios.json` рядом с `cli.ts`, `cli.ts:51`) | JSON-массив объектов `SddEvalScenario` (`types.ts:5-27`) | — | `loadScenarios` (`cli.ts:133-150`) проверяет только: массив объектов; `scale ∈ {product,module,function,fix}`; `spec-authoring` **обязан** иметь `scale`. `phase`/`mode`/`fixture` в рантайме **не валидируются** | `harness.test.ts:182` (невалидные `--max-observations`) | **расходится** (см. §3.16) |
| 2 | Провижн | `provisionScenarioDirectories` (`provision.ts:1298-1350`) из `cli.ts:175-178` | `--directory <ROOT>`, `--gennady-root`, `scenario.fixture` \| `scenario.directory` | `<ROOT>/sdd-flow-eval-XXXXXX/` — git-репо; `FIXTURE_FILES[fixture]` файлами; `ai/skills/sdd`+`ai/directives`+`.claude/skills/sdd*`; `node_modules/gennady/{dist,ai,package.json}`, `node_modules/.bin/{gennady,tsc,prettier}`; baseline-коммит `chore: initialize eval fixture` (**только** для авто-созданных каталогов, `:1345`) | throw: `unknown SDD eval fixture`, `fixture scenario … must use an auto-provisioned directory` (fixture+directory вместе запрещены, `:1316-1318`), `required local dependency is missing: <dep>`, `scenario directories must be unique` | `harness.test.ts:197`; `provision-gennady.test.ts`; `fixture-coverage.test.ts` (c8 + без glob-токенов) | **в коде** |
| 3 | Воркер | `SddEvalRunner.runScenario` (`runner.ts:65-153`) | `composeSddPhasePrompt(scenario)` (`prompts.ts:54-91`); модель `--model` (дефолт `openai/gpt-5.6-luna`, `runner.ts:27`); `--agent` | сессия OpenCode с title `sdd-eval:<scenario-id>`; судейская — `sdd-eval-judge` (`opencode-runtime.ts`) | ошибка SDK → `worker.error`, судья **не вызывается** (`runner.ts:138`) | `harness.test.ts:831` (промпт: фаза+граница approval), `:872` (батчи+изоляция), `:942` (cwd на каждый вызов SDK) | **в коде** |
| 4 | Наблюдение | `SddEvalObserver.collect` (`observer.ts:177-198`); интервал `--observe-every-ms` (300000), порог `--stuck-after` (1), бюджет `--max-observations` (6), хвост `--tail-limit` (20) | `readTail`/`readEvents`/`readStatus`/`readDiff` | stdout-строка на наблюдение (`cli.ts:155-168`): `status= progress= artifact= artifact-wait= tools= repeat= stuck= tail=` | `stuck` при: `repeatCount >= stuckAfter`, **или** нарушении политики (`observer.ts:36-63`); при `stuck` → `abort(session)`; при исчерпании бюджета раннер сам ставит `stuck:true` + `errors += 'observation budget exceeded'` (`runner.ts:91-105`) | `harness.test.ts:105,124,140,160,615,649,681,713` | **в коде** |
| 4a | Политики-детекторы | — | `tail[].toolCalls[].inputSummary` | `errors[]` + `stuck` | fail при чтении `node_modules/gennady/` или `dist/chunks/`; при `npx gennady … 2>/dev/null`; при `npx gennady --help/--version` | `harness.test.ts:649,681,713` | **в коде, в доках отсутствует** |
| 5 | Evidence | `SddEvalOpenCodeEvidenceSource` (`evidence.ts:136-308`) | OpenCode SDK: `session.messages/children/diff/status` + `git ls-files --others` | bounded: файл diff ≤ 6000 симв., весь diff ≤ 24000, ≤ 8 дочерних сессий × ≤ 2 сообщения, ≤ 24 untracked-файла (`evidence.ts:38-42`) | «не влезло» → `… <truncated>` / `… <diff evidence truncated>` — **молча** | `harness.test.ts:1067` (untracked), `:1090` (дочерние воркеры в fingerprint) | **в коде, лимиты в доках не названы** |
| 5a | События | `readEvents` | — | **всегда `[]` в живом прогоне**: `cli.ts:227-230` создаёт evidence без `readEvents`, дефолт — `async () => []` (`evidence.ts:151`) | детект ошибок/`permission.asked`/`session.waiting` из событий в живом прогоне **не срабатывает никогда** | только фейки в `harness.test.ts` | **расходится** (README `:38`, RUNBOOK `:22`, ARCHITECTURE `:50` обещают события) |
| 6 | Судья | `SddEvalJudge.evaluate` (`judge.ts:57-73`), модель `--judge-model` (дефолт `openai/gpt-5.6-sol`) | `intent`, `acceptance`, `state{status,stuck,waiting,errors}`, `diff`, `events`, `tail` — и больше ничего | `<sandbox>/.sdd-eval-judge.<scenario-id>.md` (`cli.ts:288-295`) → копия `…/.results/run-*/<id>/judge.md` | `parseVerdict` (`judge.ts:38-45`): `pass|fail|inconclusive` из явной строки; нет строки → `inconclusive`. Рубрика (`judge.ts:18`): stuck/незавершённый воркер, отменённый инструмент, красный обязательный гейт, отсутствие артефакта границы = fail | `judge.test.ts` (3), `harness.test.ts:806,895,909,925` | **в коде** |
| 7 | R1 | `checkR1Structure` (`quality-gate.ts:43-60`) → `<sandbox>/node_modules/.bin/gennady sdd-check --all .` | вывод чекера | stdout: `quality R1: pass\|FAIL — <detail>`; поле `quality` в `summary.json` | `clean — N file(s)` \| `✅ clean` → pass; `N error(s)` при N>0 → fail; **иначе fail** `no sdd-check verdict parsed` | `quality-gate.test.ts:12` (3 кейса both-way) | **в коде + известный дефект**: строка `[sdd-check] 0 error(s), N warning(s) across M file(s)` (`cli/cmd/sdd-check/sdd-check.types.ts:164`) не матчится ни одним предикатом, а `✅ clean` печатается только при `findings.length === 0` (`:148-151`) ⇒ любой репозиторий с 0 ошибок и ≥1 ворнингом получает FAIL |
| 7a | Когда включается R1 | `cli.ts:240-249, 261-265` | `scenario.phase`, `scenario.mode` | — | автоматически для фаз, «производящих спеки»: всё кроме `task`, а для `brownfield` — только режимы `recover-spec`/`delta-to-spec`/`modify-via-spec` | — | **в коде** |
| 8 | R-COMPLETE | `checkCompletion` (`quality-gate.ts:130-143`) | `scenario.completion {artifact,ticket,spec}` (repo-relative) | stdout `quality R-COMPLETE: …`; `quality` в `summary.json` | нет артефакта → fail `declared artifact was not produced`; есть артефакт, но нет `**Status:** [x]` / `- [x] \`…\` DONE` внутри `<!--SECTION:EXECUTION_LOG-->` / `SDD_AUDIT_RECEIPT` / `SDD_REVIEW_RECEIPT` на спеке → fail со списком; иначе pass. **Решающий над R1** (`cli.ts:273`) | `quality-gate.test.ts:32` (4 кейса both-way) | **в коде, opt-in**; в `scenarios.json` не объявлен ни у одного сценария — только в `scripts/roundtrip-eval.sh:97-101` |
| 9 | MIGRATION | `computeMigrationGrade` (`migration-grade.ts:84-114`), baseline — `captureBaseline` до воркера (`cli.ts:198-202`) | `sdd-state .` + `sdd-check --all .` в песочнице | stdout `migration: PASS\|FAIL — FLOW_VERSION=… · critical-introduced: … · backlog: …` | `pass = (FLOW_VERSION === 'v2') && нет введённых кодов из `MIGRATION_CRITICAL_CODES` = {`SDD_BROKEN_SPEC_REF`, `SDD_BROKEN_SPEC_ANCHOR`, `ERR_CLI_SDD_CHECK_READ_FAILED`}` | `migration-grade.test.ts` (7 both-way) | **в коде**; **докблок `:79` расходится с кодом** («no migration-introduced ERROR-severity findings» — а фильтруются ровно 3 кода); `types.ts:38-39, :68-69` обещает «sdd-state=v2 + sdd-check clean» — тоже расходится |
| 10 | Артефакты | `persistRunArtifacts` (`sandbox-lifecycle.ts:55-91`) | `--artifacts-dir` (дефолт `<gennady-root\|cwd>/ai/flow-eval/.results`) | `…/.results/run-<ISO>/summary.json` + `…/<scenario-id>/judge.md` + копии `**/*.spec.md` (кроме `ai/`, `node_modules/`, `.claude/`, `.git/`) | ошибки копирования проглатываются (`.catch(() => undefined)`) | `sandbox-lifecycle.test.ts` (4) | **в коде, в доках почти нет** (`.results/` упомянут только `ARCHITECTURE:59`) |
| 11 | Teardown | `teardownSandboxDirectories` (`sandbox-lifecycle.ts:97-110`) из `finally` + хендлеры `SIGINT`/`SIGTERM` (`cli.ts:190-194`, `exit 130`) | `--keep` отключает | stdout `sandboxes removed: N` \| `sandboxes kept (--keep): N` | best-effort, не бросает | `sandbox-lifecycle.test.ts`; `sandbox.test.ts` (7, включая «clean never touches non-sandbox directories») | **в коде, ни в одном `.md` не описан** |
| 12 | Код возврата | `cli.ts:313-317` | — | — | `process.exitCode = 1` **только** при исключении в `main()`. Батч, где все сценарии `fail`, завершается **кодом 0** | — | **в коде** (гейтить CI нечем) |
| 13 | Метрики | `python3 ai/flow-eval/scripts/session-metrics.py record\|gate\|compare` | SQLite `~/.local/share/opencode/opencode.db` + файлы фикстуры | `ai/flow-eval/.results/metrics-ledger.jsonl` (путь **зашит**: `session-metrics.py:19-21`) | `gate` → `COMPLETION GATE: RED/GREEN`, ненулевой код при RED; `compare` → `VERDICT: PASS/FAIL — regression` | нет юнит-тестов | **в коде, но зашит на cloud-ios** (`Tools/check-swiftlint-exceptions.sh`, `IB-script`) |
| 14 | Телеметрия | `python3 ai/flow-eval/scripts/session-telemetry.py <session\|фрагмент>` | та же SQLite (только топ-сессия, `WHERE p.session_id=?`) | stdout-таймлайн | ничего не решает | нет тестов | **в коде** |
| 15 | Внешние раннеры | `scripts/migration-eval.sh run\|status\|grade`; `scripts/roundtrip-eval.sh prep\|execute\|grade\|status` → `roundtrip-grade.sh` | `REPO`, `GEN_ROOT`, `BASE`/`RTBASE`, `SCENARIO`, `BASEURL`, `MODEL`, `MAX_OBS` из env с дефолтами | `.results/migration-<runid>.log`, `.results/roundtrip-<runid>.log`, worktree под `~/.gennady/eval/cloud-ios/*` | обе команды сначала зовут `require-developer-repo.sh "$REPO"` (новое в `227c03a8`) — `REPO` вне `$HOME/Developer` ⇒ выход до любых изменений | `require-developer-repo.test.sh` (bash, both-outcomes) — **ни в одном npm-скрипте не вызывается** | **в коде**; у `migration-eval.sh:16` дефолтный `SCENARIO` указывает в scratchpad **чужой сессии** — файла нет ⇒ `run` без явного `SCENARIO` падает на загрузке сценария |
| 16 | Симуляция approval | `ai/flow-eval/operator-approve.sh <sandbox>` | каталог песочницы | правит `specs/README.md` (`🚧`→`✅`) и во всех `*.md`: `**Status:** pending`→`approved`, `**Operator decision:** pending`→`approved` | `[ -d "$SB/specs" ]` иначе usage | нет тестов | **в коде** |
| 17 | Песочница-хелпер | `node --import tsx ai/flow-eval/scripts/sandbox.ts prepare\|clean [--dry] [--root D]` | `TMPDIR` | путь свежего root / вычищенные `sdd-flow-eval-*`, `gen-*`, `diag-*` | не трогает не-sandbox каталоги | `sandbox.test.ts` (7) | **в коде** |

### 2.2 Схема сценария (`scenarios.json`) — источник истины `types.ts:5-27`

| Поле | Обяз. | Значения (закрытые union в `types.ts`) | Проверяется в рантайме |
|---|---|---|---|
| `id` | да | строка | нет (только уникальность каталогов) |
| `intent` | да | строка (дословно уходит и судье) | нет |
| `phase` | да | `spec-authoring` \| `scaffold` \| `execute` \| `repair` \| `task` \| `brownfield` \| `migration` (`:30-39`) | **нет** |
| `mode` | да | 11 значений (`:42-70`): `full-spec-to-approval-1`, `actual-tickets-to-approval-2`, `canonical-execute`, `fix-to-clean`, `brief-to-artifact`, `modify-code-delta`, `fix-code-delta`, `recover-spec`, `delta-to-spec`, `modify-via-spec`, `v1-to-v2` | **нет** |
| `fixture` | нет | 14 id (`:73-105`) | да (throw на неизвестном) |
| `directory` | нет | путь (внешний репо) | да (взаимоисключим с `fixture`) |
| `scale` | для `spec-authoring` — да | `product\|module\|function\|fix` | да (`cli.ts:138-148`) |
| `acceptance` | нет | строка (числа, негативные кейсы — только это судья видит отдельно от `intent`) | нет |
| `completion` | нет | `{artifact, ticket, spec}` — включает `R-COMPLETE` | нет (пути читаются как есть) |

Референсный `scenarios.json` — **7 сценариев**: `fibonacci-library` (spec-authoring), `tic-tac-toe`
(scaffold), `slugify-toolchain` (execute, **без `acceptance` и без `completion`**),
`broken-specs-repair` (repair), `infra-log-summary`/`infra-rotate-logs`/`infra-makefile` (task).
Не покрыто референсом: фазы `brownfield` и `migration`, 6 режимов, 7 brownfield-фикстур.
**Фикстуры `migration` не существует вовсе** — миграционный сценарий может быть только
`directory`-сценарием (внешний репо), т.е. вне `scenarios.json` по построению.

### 2.3 Кто такой «агент» в прогоне

Воркер — **сессия OpenCode**, а не `codex`/CLI-агент: `opencode-runtime.ts` через `@opencode-ai/sdk`
делает `session.create`/`session.prompt`/`session.abort` на **уже поднятом** `opencode serve`.
Модель приходит строкой `provider/model` (`parseOpenCodeModel`), реально гоняли
`llm-proxy/deepseek-v4-flash` для воркера **и** судьи. Промпт воркера = фазовый текст
(`PHASE_PROMPTS[phase]`, для `brownfield` — `BROWNFIELD_MODE_PROMPTS[mode]`) + фиксированный
`headlessOperator`-контракт (`prompts.ts:66-73`: не звать интерактивные вопросы; не переклассифицировать
маршрут; не зондировать `--help/--version`; не читать `node_modules/gennady`/`dist`; не одобрять границу
за оператора; не гасить красный гейт) + `Selected phase/mode` + `scale` + `intent` + `acceptance`,
и всё это заворачивается в `appendSddSessionBoundary(…, directory)` (`shared/sdd/session-boundary.ts`).
Воркер может поднимать **дочерние сессии** (review-субагенты) — их прогресс попадает в хвост
как `child:<title>:<role>` (≤8 сессий × ≤2 сообщения), а токены — в `readUsage` целиком.

---

## 3. Что доки скрывают, путают или обещают лишнее

Каждый пункт — конкретное место; «⇒» = практическое следствие для читателя.

1. **События всегда пустые.** README `:38` («reads only a bounded tail + status + events + diff»),
   RUNBOOK `:22`, ARCHITECTURE `:50` описывают события как часть evidence. В живом прогоне
   `cli.ts:227-230` не передаёт `readEvents`, дефолт — `async () => []` (`evidence.ts:151`).
   ⇒ `EVENTS` у судьи всегда `[]`; ветки `waiting` по `permission.asked`/`session.waiting` и
   `errors` из `session.error` (`observer.ts:136-152`) в реальности **мертвы**. Это единственный
   заявленный канал «модель ждёт разрешения» — и он не подключён.
2. **Про удаление песочниц не написано нигде.** Ни `--keep`, ни `--artifacts-dir`, ни
   `sandboxes removed:` не встречаются ни в одном `.md` (проверено grep по `ai/flow-eval/**/*.md`).
   ⇒ RUNBOOK `:181-198` («цепочные прогоны»: найди песочницу `ls -d "$SDD_EVAL_ROOT"/sdd-flow-eval-*`,
   прогони на ней approval и scaffold) **не выполним** как написано: к моменту `ls` каталога уже нет.
   ⇒ Совет RUNBOOK `:210` («мерь механикой: `gennady sdd-check --all .`») тоже не выполним постфактум.
   ⇒ `cli.ts:295` печатает `judge rationale → <sandbox>/…md` — путь, который удалится через секунду;
   реальная копия лежит в `.results/run-*/<id>/judge.md`, и об этом не сказано.
3. **Код сам себе противоречит про артефакты.** `cli.ts:152`: «results are human-readable lines and no
   trace/JSON file is written»; `types.ts:113`: «no session trace or JSON output settings are present».
   При этом `persistRunArtifacts` пишет `summary.json` и копии спек. ⇒ читатель кода делает неверный
   вывод, что результат живёт только в stdout.
4. **Три разных счёта сценариев.** README `:41` — «authoring, scaffold, execute, repair»;
   RUNBOOK `:25` — «Три эталонных сценария»; факт — 7. ⇒ невозможно понять, что запустится
   по канонической команде (запустятся все 7, включая три `task`).
5. **Правила качества: доковый бэклог ≠ код.** `QUALITY-RULES.ru.md` описывает R1–R6 и объявляет
   «Итерация 1 (R1+R3) — стартуем»; в коде есть `R1`, `MIGRATION`, `R-COMPLETE`, и ни один из двух
   последних в бэклоге не значится. ⇒ читатель ищет `R3` (type-check/lint/testcov как правило эвала)
   и не находит; и не находит `MIGRATION`/`R-COMPLETE` в списке правил.
6. **`MIGRATION` grade не описан ни в одном доке.** Единственный полностью детерминированный бар
   для самой дорогой фазы существует только в коде (`migration-grade.ts`) и в промпте воркера
   (`prompts.ts:34`). `METRICS.ru.md`, который специально про детерминированный слой, о нём молчит,
   а `ARCHITECTURE` §4 его не включает в таблицу. ⇒ оператор не знает, по какому бару миграция «прошла».
7. **Внутри `migration-grade.ts` док расходится с кодом**: `@purpose` на `:79` — «no
   migration-introduced **ERROR-severity** findings», реализация — фильтр по трём кодам
   (`:31-36`, `:96`), т.е. новая ERROR-находка вне списка (например `SDD_VERIFICATION_TABLE_INVALID`)
   миграцию **не** валит. Плюс `types.ts:38-39` и `:68-69` обещают совсем другой бар
   («sdd-state=v2 + sdd-check clean»).
8. **R1 структурно неверен, и доки этого не говорят.** `METRICS.ru.md:11-19` подаёт R1 как надёжный
   («`clean` → pass, `N error(s)` → fail, иначе fail»), но `sdd-check` печатает `✅ clean` только при
   **нуле находок** (`sdd-check.types.ts:148-151`), а обычный итог — `[sdd-check] 0 error(s),
   N warning(s) across M file(s)` (`:164`), который парсер трактует как «нет вердикта» ⇒ FAIL.
   ⇒ на любом реальном репозитории (где всегда есть ворнинги) R1 = FAIL, и это выглядит как
   «эвал провалился», а не «правило сломано».
9. **Политики-детекторы наблюдателя не документированы.** `observer.ts:36-63` мгновенно ставит
   `stuck` (⇒ abort ⇒ рубрика судьи = fail) при чтении `node_modules/gennady/**`/`dist/chunks/**`,
   при `npx gennady … 2>/dev/null` и при `--help`/`--version`. Запрет адресован воркеру
   (`prompts.ts:70`), но оператор, читающий `stuck=true`, нигде не найдёт, что причиной может быть
   не зацикливание, а нарушение политики. ⇒ ложная диагностика «модель зависла».
10. **Бюджет наблюдений = приговор, и это не сказано прямо.** `runner.ts:91-105` при исчерпании
    бюджета сам выставляет `stuck: true` + `errors += 'observation budget exceeded'`, а рубрика судьи
    (`judge.ts:18`) объявляет stuck-воркера провалом. Дефолт — 6 наблюдений × 5 мин = 30 мин.
    RUNBOOK `:164` упоминает «исчерпала бюджет» в списке fail, но нигде нет таблицы «какой бюджет
    нужен фазе» (по факту: `task` ~6 достаточно, `execute` нужно ≥20–30, миграция/round-trip — 40–60,
    как и стоит в `migration-eval.sh:19` / `roundtrip-eval.sh:25`).
11. **Лимиты evidence нигде не названы**: 6000 симв. на файл, 24000 на весь diff, 8 дочерних сессий
    по 2 сообщения, 24 untracked-файла (`evidence.ts:38-42`), и обрезка происходит молча.
    ⇒ классическая загадка «судья не увидел артефакт» не имеет объяснения в доках.
12. **«Как читать результат» разорвано на 4 дока и нигде нет раскладки `.results/`.** Строка
    наблюдения — RUNBOOK; строка вердикта — README; гейты — METRICS; «судья не отменяет факты» —
    ARCHITECTURE `:89`. Структуру `run-<ISO>/summary.json` (поля `scenarioId/verdict/status/usage/
    quality/specFiles/hasJudge`) не описывает **никто**.
13. **«Когда eval пройден» не имеет одного ответа.** RUNBOOK `:160-164` даёт три исхода судьи;
    METRICS `:36` говорит, что R-COMPLETE решающий; AGENT-BRIEF `:41` требует «два измерения»;
    ARCHITECTURE `:89` — «вердикт судьи не отменяет проверку фактов». Нигде не сказано, что
    **агрегированного вердикта и кода возврата у прогона нет вовсе** (`cli.ts:313-317`) ⇒ CI
    невозможен, а «пройден» остаётся решением человека.
14. **Битые/мёртвые ссылки и пути.** `swiftlint-toolchain-setup.md:51` → `run-bench.sh` (файла нет);
    `migration-eval.sh:16` дефолтный `SCENARIO` — путь в scratchpad чужой сессии (файла нет ⇒
    `migration-eval.sh run` сегодня падает); `RUNBOOK:36,119` предписывает единственный
    авторитетный worktree `sdd-v2-rc52-followup`; `PREREQUISITES:81` обещает
    `REPO="${REPO:-$HOME/Developer/<repo>}"`, а в скриптах literal `/Users/k.lebedev/Developer/cloud-ios`;
    `session-metrics.py:19-21` зашивает `GEN`/`DB` абсолютами одного хоста.
15. **`require-developer-repo.test.sh` — самотест, который никто не гоняет**: `grep -rn
    'require-developer' package.json scripts/*.ts` пусто, а `test-topology.ts` собирает только
    `*.test.ts`. ⇒ both-way дисциплина, заявленная в `QUALITY-RULES`, для нового гарда формально
    не выполнена (тест есть, в гейт не включён).
16. **`phase`/`mode` не валидируются на входе.** `loadScenarios` (`cli.ts:133-150`) проверяет только
    `scale`. При опечатке в `phase` `PHASE_PROMPTS[phase]` даёт `undefined`, а
    `[basePrompt, …].filter(Boolean)` (`prompts.ts:78-88`) его **молча выбрасывает** ⇒ воркер получает
    промпт без фазовой части (только headless-контракт + intent) и «эвал фазы» превращается
    в «свободный кодинг» без единого предупреждения.
17. **Объём против пользы.** Заявленный порядок чтения (README → ARCHITECTURE → PREREQUISITES →
    WRITING-EVALS → METRICS) — 502 строки до первого запуска; весь корпус — 2025 строк.
    Реально исполняемая процедура — 6 шагов и 2 команды. Пять доков из 19 (`ROADMAP`,
    `PROGRESS-REPORT`, `EXPERIMENTS-LOG`, `P9-*`) — журнал с историческими числами, которые читаются
    как текущее состояние («все цели закрыты», «suite 71/71», «полный greenfield проходит»).

---

## 4. Сверка с `50-TRACK-EVAL.md`

### 4.1 Что в треке подтверждается на `227c03a8`

`227c03a8` — docs-only + новый bash-гард, **код харнесса не изменился с `3d5f66a7`** (`git show --stat`).
Значит перепроверены и подтверждены прямым чтением кода: анатомия сценария (§1.1), 7 фаз/11 режимов/
14 фикстур против 5/5/7 в референсе (§1.1), дефолты `runner.ts:25-34` (§1.3), «бюджет = провал»
(§1.3, H-12), слабости `parseVerdict` и рубрики (§1.4), таблица гейтов R1/MIGRATION/R-COMPLETE (§1.5),
диагноз H-13 (R1 ломается на строке `0 error(s), N warning(s)` — подтверждено чтением
`sdd-check.types.ts:148-164`), расхождение докблока `migration-grade.ts:79` с кодом (§1.5),
«R2/R3/R4/R5/R6 в коде нет» (§1.5), отсутствие агрегированного кода возврата (§1.4.4),
жёсткая привязка `session-metrics.py` к cloud-ios (§2.1 H-14), `harness.test.ts` вне коммит-гейта
(`test-topology.ts:36`). **Ни одно из этих утверждений трека не устарело.**

Более того, дайджест добавляет к реестру рисков трека **три новых дефекта харнесса**, которых в
H-1…H-14 нет: пустые `events` в живом прогоне (§3.1), невалидируемый `phase` ⇒ молча пустой фазовый
промпт (§3.16), необъявленные лимиты evidence как источник «судья не увидел артефакт» (§3.11).
Предлагаю занести их как **H-15/H-16/H-17**.

### 4.2 Что в треке устарело/неверно после `227c03a8`

| Место в треке | Что сказано | Как на `227c03a8` |
|---|---|---|
| §2, строка «Документация для нового человека» (**C+**) | «`README` Documentation map перечисляет 4 документа из **14**»; «в `ai/flow-eval/**` — 10 в корне + 4 в `docs/`» | **устарело**: доков **19** (10 в корне + **9** в `docs/`); карта README перечисляет **11** записей + отдельную строку про `docs/*.md` deep-dive. Не залинкованы только `EXPERIMENTS-LOG`, `INFRA-TASKS-RESEARCH`, `P9-*` (2). ⇒ обоснование оценки нужно переписать: проблема больше не «нет ссылок», а **объём (2025 строк), три разных набора чисел и противоречия §3** |
| §2, там же | «нет доков про архитектуру/предпосылки/метрики/внешние эвалы/бриф агенту» (неявная посылка оценки C+) | **закрыто `227c03a8`**: добавлены `docs/ARCHITECTURE.ru.md` (103), `docs/PREREQUISITES.ru.md` (93), `docs/METRICS.ru.md` (125), `docs/WRITING-EVALS-EXTERNAL.ru.md` (103), `docs/AGENT-BRIEF.ru.md` (71) — 661 строка. `ARCHITECTURE` — самый точный док корпуса |
| §4.1 **E-00** | среди пунктов: «добавить `npm run build` в README/`test:sdd-flow-eval`» | **частично закрыто документально**: `PREREQUISITES` §1 и §5 требуют `npm run build` перед сюитой. В самом `README` («Fake-backed regression suite») и в npm-скрипте — по-прежнему нет. ⇒ формулировку таска сузить до «npm-скрипт + README», документация уже есть |
| §4.1 **E-16** / §5 **Q3** | «параметризовать все скрипты (`EVAL_FIXTURES_ROOT`)» | **сузилось**: `migration-eval.sh`/`roundtrip-eval.sh` уже читают `REPO`/`GEN_ROOT`/`BASE`/`RTBASE`/`SCENARIO`/`BASEURL`/`MODEL`/`MAX_OBS` из env (`${VAR:-default}`). Остались: (а) дефолт `SCENARIO` в `migration-eval.sh:16` — **мёртвый путь в scratchpad чужой сессии**, из-за него `run` сегодня не работает; (б) `session-metrics.py:19-21` (`GEN`, `DB`) — единственные настоящие литералы; (в) незакоммиченное состояние фикстур |
| §5 **Q3** (хранение фикстур) | обсуждает `~/.gennady/eval/cloud-ios/*` вне git | **добавилось ограничение**: `require-developer-repo.sh` (новый) валит **любую** подкоманду обоих раннеров, если `REPO` (репозиторий-источник) не под `$HOME/Developer`. Гард проверяет **только `REPO`**, не eval-worktree — т.е. фикстуры под `~/.gennady/eval/**` остаются легальными. Для обязательной самомиграции (`E-14`) условие уже выполнено: сам `gennady` живёт в `/Users/k.lebedev/Developer/gennady` |
| §3 G4, пункт 2 плана («перенести сценарий в `scenarios.json`, `fixture` — новый id, читающий снапшот из переменной») | подаётся как правка размера S | **противоречит коду**: `provision.ts:1316-1318` **запрещает** сочетание `fixture` + `directory`, а `FIXTURE_FILES` — это `Record<путь, содержимое>` в TS, никакого механизма «фикстура, читающая внешний снапшот» нет. ⇒ либо новый вид провижна (клон/worktree по SHA) = M, либо сценарий остаётся `directory`-сценарием и переносится в репозиторий как **JSON-файл рядом со скриптом** (S) — второе честнее и закрывает мёртвый `SCENARIO` из §4.2 выше |
| §2.1 реестр рисков | H-1…H-14 | добавить H-15 (пустые `events`), H-16 (невалидируемый `phase`/`mode`), H-17 (немые лимиты evidence). Также: H-4 «закрыто `sandbox-lifecycle.ts` + авто-teardown» верно **по коду**, но создало новый док-дефект (§3.2) — цепочные прогоны RUNBOOK стали невыполнимы |

### 4.3 Какие E-* уже сделаны, какие опровергнуты

| Таск | Состояние на `227c03a8` |
|---|---|
| **E-00** (агрегированный exit-код, `harness.test.ts` в цепочку, build в README) | **не сделан** (`cli.ts:313-317` без изменений; `test-topology.ts:36` исключение на месте). Частично закрыт только doc-пункт про build (см. §4.2) |
| **E-01** (R1: «0 errors + N warnings = pass») | **не сделан**; диагноз подтверждён чтением кода |
| **E-02** (`completion` + `acceptance` у `slugify-toolchain`) | **не сделан**: в `scenarios.json` у `slugify-toolchain` нет ни `acceptance`, ни `completion` |
| **E-03** … **E-16** | **не сделаны**; кодовых изменений после `3d5f66a7` нет |
| **новое, чего в списке E-* нет** | (1) починить дефолт `SCENARIO` в `migration-eval.sh` (иначе G4 не воспроизводим ни у кого) — S; (2) включить `require-developer-repo.test.sh` в гейт (сегодня самотест мимо всех сюит) — S; (3) подключить `readEvents` или убрать события из evidence/доков (H-15) — S; (4) валидировать `phase`/`mode` в `loadScenarios` (H-16) — S; (5) **не создавать 20-й документ**: `docs/AGENT-BRIEF.ru.md` уже занимает нишу «брифа агенту», и наш `R4b-EVAL-SPEC` должен его **заменить**, а не дополнить |
| **опровергнуто** | посылка §2 «новичку не хватает архитектурного дока» — теперь `ARCHITECTURE`+`PREREQUISITES`+`METRICS` есть; ⇒ оценка «Документация» остаётся C+ **по другой причине** (объём, противоречия, немые механизмы), и таск на документацию должен быть «свести к одной спеке + пометить журналы как архив», а не «дописать доки» |

### 4.4 Какие группы приёмки G1–G4 харнесс может прогнать сегодня

| Группа | Может ли сегодня | Что именно и чего не хватает |
|---|---|---|
| **G1** non-Node (execute + verify) | **нет** | Ни одной non-node фикстуры (`FIXTURE_FILES` — 14, все node/bash; `go.mod`/`Package.swift`/`pyproject.toml` в `provision.ts` нет), ни одного сценария. Вся ветка блокирована портом VERIFY (`readiness.ts` node-hardcoded — `roundtrip-wall3-assessment.md`). Единственная реальная Swift-проверка — `roundtrip-grade.sh` (82 пробы), и она требует хостового Swift 6.2 + `TMPDIR` без слэша ⇒ не воспроизводима вне этого хоста |
| **G2** sync/ownership | **не через харнесс** (и не нужно): это `npm run test:e2e` (`GENNADY_E2E=1`), 0 токенов. Харнесс здесь не участвует вообще | нет кейсов про владение и нет самого механизма — как в треке |
| **G3** execute → audit → review | **частично, сегодня** | `execute`/`canonical-execute` на `slugify-toolchain` запускается канонической командой прямо сейчас; `R-COMPLETE` механически работает (4 both-way юнита). Не хватает **трёх правок конфигурации, не кода**: (а) добавить `completion`+`acceptance` в сценарий (E-02); (б) поднять `--max-observations` до 20–30 (иначе бюджет ⇒ авто-fail, §3.10); (в) помнить, что `SDD_GROUP_*_MISSING` — WARN и grandfather-ятся отсутствием `PHASE_RECEIPTS:v1` (D-4). Живого прогона, где R-COMPLETE = pass, по-прежнему ноль |
| **G4** миграция v1→v2 | **да, механически, но с двумя ручными предпосылками** | Фаза `migration` полностью вкручена в `cli.ts:198-202, 250-261` + `MIGRATION` grade + 7 both-way юнитов. Но: (1) фикстуры `migration` не существует ⇒ нужен внешний репо как `directory`; (2) `migration-eval.sh run` **сегодня падает**, т.к. дефолтный `SCENARIO`-файл отсутствует ⇒ нужно передать свой JSON; (3) `REPO` обязан лежать под `$HOME/Developer` (новый гард). Судья на этой фазе бесполезен (всегда fail по бюджету) — бар только детерминированный |

### 4.5 Итог сверки

Трек `50-TRACK-EVAL.md` остаётся **фактически верным по коду** и не требует ревизии выводов;
устарел ровно один его блок — оценка документации (числа 14/4 → 19/11) и связанная с ней посылка
«архитектурного дока нет». Зато `227c03a8` добавил ниши, которых трек не учитывал: гард
`~/Developer/` как жёсткую предпосылку G4, `docs/AGENT-BRIEF.ru.md` как уже существующего
конкурента «спеке для агента», и мёртвый дефолт `SCENARIO`, из-за которого миграционный эвал
сегодня не запускается ни у кого, включая автора.

---

## 5. Приложение: команды, существующие в чекауте (проверено)

`npm run build` · `npm run build:directives` · `npm run sdd-flow-eval -- …` ·
`npm run test:sdd-flow-eval` (`package.json:42,57,58,68`) ·
`node --import tsx ai/flow-eval/scripts/sandbox.ts prepare|clean [--dry] [--root D]` ·
`ai/flow-eval/operator-approve.sh <sandbox>` ·
`ai/flow-eval/scripts/require-developer-repo.sh <repo>` ·
`ai/flow-eval/scripts/migration-eval.sh run|status|grade [runid]` ·
`ai/flow-eval/scripts/roundtrip-eval.sh prep|execute|grade|status [runid]` ·
`ai/flow-eval/scripts/roundtrip-grade.sh [rt-dir]` ·
`python3 ai/flow-eval/scripts/session-metrics.py record|gate|compare` ·
`python3 ai/flow-eval/scripts/session-telemetry.py <session|fragment>` ·
`python3 ai/flow-eval/scripts/reset-ticket.py <ticket.md>` ·
`python3 ai/flow-eval/scripts/upgrade-verification-tables.py <path…>` ·
в песочнице: `node_modules/.bin/gennady sdd-check --all .` · `gennady sdd-state .` ·
`gennady sdd-verify --task <ticket> --phase <PhaseID>` · `gennady sdd-verify --profile full` ·
`gennady testcov <src>` (все подтверждены в `cli/cmd/**` и `cli/cmd/sdd-*/help.ts`).
Флаги CLI харнесса (`cli.ts:56-114`): `--scenario-file`, `--directory`, `--gennady-root`, `--keep`,
`--artifacts-dir`, `--base-url`, `--model`, `--judge-model`, `--provider`, `--concurrency`,
`--observe-every-ms`, `--stuck-after`, `--max-observations`, `--tail-limit`, `--agent`, `--help`.
Отсутствуют, хотя упомянуты в доках: `run-bench.sh` (`swiftlint-toolchain-setup.md:51`),
дефолтный `SCENARIO`-файл `migration-eval.sh:16`, каталог `ai/flow-eval/.results` (создаётся прогоном,
в git отсутствует).
