# 50 — Трек EVAL: зрелость flow-eval и минимальные эвалы G1–G4

> Статус: ВЕРИФИЦИРОВАНО (B7 + V-B7, правки применены; учтены D-3/D-4 и предпосылки G4). Ждёт решений оператора (§5).

**Как читать.** Это чистый документ: аналитика B7 (трек EVAL) прошла независимую верификацию V-B7 (свежие глаза, read-only, ~70 цитат `file:line` перепроверены по коду и собственными прогонами) и найденные правки применены прямо в тексте — без отдельного «раздела ошибок». Счёт верификации: **58** утверждений подтверждено (дословно или со сдвигом строки в пределах опечатки), **9** сдвинуто на 1–9 строк (сам факт при этом верен — номера строк ниже уже исправлены), **3** опровергнуты по существу, плюс **6** числовых обсчётов (13→14 прогонов, 29→22 кейса `harness.test.ts`, «4 из 15»→«4 из 14» документов и др.). Сырые материалы обеих сессий (полный текст аналитика B7, полный текст верификатора V-B7, включая ход рассуждений) лежат в `ai/drafts/research/sdd-v1-to-v2-transfer/_raw/50-TRACK-EVAL.raw.md` — обращайтесь туда, если нужна не выжимка, а дословный след верификации по каждой цитате.

**Источники фактов.** Два чекаута ветки `codex/sdd-v2-rc52-followup`:

| Обозначение | Путь | HEAD |
|---|---|---|
| **RC-scratch** | `…/scratchpad/rc-v6` | `11291af5` (без `dist/`, `?? .npm-ci-done`) |
| **RC-live** | `/Users/k.lebedev/Developer/gennady/.claude/worktrees/sdd-v2-rc52-followup` | `3d5f66a7`, дерево **чистое**, `dist/gennady.js` собран, есть `ai/flow-eval/.results/**` (**14** прогонов + `metrics-ledger.jsonl`) |

Все `file:line` ниже — по **RC-live** (`3d5f66a7`), если не указано иное. Фикстуры: `/Users/k.lebedev/.gennady/eval/cloud-ios/{fixture-detmig, fixture-mig-run, rt-regen, bench-smoke}` (read-only). Прочитано до начала: A2 §6, A3b §3.1–3.4/§6, A4 «Сводная таблица», B1 §6, B2 §3.7, B3 §3.6, B4 §5.1, транскрипт решений оператора.

---

## 1. Анатомия харнесса (факты)

### 1.1 Что такое «сценарий»

`SddEvalScenario` — `ai/flow-eval/types.ts:5-27`: `id` (`:7`), `intent` (`:9`), `phase` (`:15`), `mode` (`:17`), опциональные `fixture`, `directory`, `scale` (`:19`), `acceptance` (`:21`) и — с `95329c19` — `completion?: { artifact; ticket; spec }` (`:26`). Всё остальное (модель, бюджет наблюдений, concurrency) — флаги CLI, не поле сценария.

Референсный файл `ai/flow-eval/scenarios.json` — **7 сценариев** (58 строк): `fibonacci-library` (`spec-authoring`/`full-spec-to-approval-1`/`scale: function`), `tic-tac-toe` (`scaffold`/`actual-tickets-to-approval-2`), `slugify-toolchain` (`execute`/`canonical-execute`, **без `acceptance`**), `broken-specs-repair` (`repair`/`fix-to-clean`), `infra-log-summary` · `infra-rotate-logs` · `infra-makefile` (`task`/`brief-to-artifact`).

**Тип-пространство больше файла сценариев.** `types.ts:30-39` — 7 фаз; `:42-70` — 11 режимов; далее — 14 `SddEvalFixtureId`; `provision.ts` поставляет все 14 `FIXTURE_FILES` (`Record<SddEvalFixtureId, …>`, `:807`). `scenarios.json` задействует **5 фаз / 5 режимов / 7 фикстур**. Не покрыты референсным файлом: фазы `brownfield`, `migration`; режимы `modify-code-delta`, `fix-code-delta`, `recover-spec`, `delta-to-spec`, `modify-via-spec`, `v1-to-v2`; 7 brownfield-фикстур. Они существуют, детерминированно протестированы golden'ом, но **ни один LLM-сценарий их не гоняет из референса** — только вручную или через `scripts/migration-eval.sh` / `scripts/roundtrip-eval.sh`, которые генерируют сценарий на лету (`roundtrip-eval.sh:82-102` `write_scenario()`).

### 1.2 Фазы, режимы, промпты

`ai/flow-eval/prompts.ts:7-36` — `PHASE_PROMPTS` по 7 фазам; `:41-51` — `BROWNFIELD_MODE_PROMPTS` (mode ветвит только внутри `brownfield`; для остальных фаз `mode` в промпт попадает лишь строкой `Selected phase: …; selected mode: …`, `:61`). `:66-73` — `headlessOperator`-контракт (запрет интерактивных вопросов, запрет `--help`/`--version`/`redirect`/чтения `node_modules/gennady`, запрет самоодобрения границы; запреты — `:70`, `:72-73`). `composeSddPhasePrompt` требует `directory` (`:60`) и заворачивает всё в `appendSddSessionBoundary` (`shared/sdd/session-boundary.ts`).

### 1.3 Как исполняется прогон (и главный структурный факт)

`cli.ts` → `provisionScenarioDirectories` → `SddEvalRunner.runAll` (батчи по `concurrency`, `runner.ts:156-167`) → на сценарий одна OpenCode-сессия (`runner.ts:67-70`) → `SddEvalObserver.collect` (`runner.ts:83-90`) → `judge.evaluate` (`runner.ts:139-151`).

Дефолты кода — `runner.ts:25-34`: `baseUrl http://localhost:4096`, worker `openai/gpt-5.6-luna`, judge `openai/gpt-5.6-sol`, `concurrency 3`, `observeEveryMs 300 000`, `stuckAfter 1`, `maxObservations 6`, `tailLimit 20`. Реально гоняли `llm-proxy/deepseek-v4-flash` для обеих ролей (README «Defaults (code) vs what we run», `:58-63`; `runner.ts:55-60` явно допускает совпадение моделей — комментарий «Same model is allowed…»).

**Исчерпание бюджета наблюдений = провал по построению.** `runner.ts:91-105`: если наблюдений набралось `>= maxObservations`, а статус не `completed`/`error` и `stuck` не выставлен — раннер сам зовёт `abort`, помечает последнее наблюдение `stuck: true` и добавляет ошибку `'observation budget exceeded'`. Это `state` уходит судье (`{status, stuck, waiting, errors}`, `runner.ts:142-147`), а рубрика судьи (`judge.ts:18`) прямо говорит: «A stuck or unfinished worker … is a failure». **Следствие:** на длинных реальных сценариях (migration, round-trip) вердикт судьи детерминирован бюджетом, а не качеством. Подтверждение — §1.8.

### 1.4 Контракт судьи и его слабости

`judge.ts:12-28` `composeJudgePrompt` посылает ровно: инструкцию про первую строку + рубрику (`:18`), `INTENT`, `ACCEPTANCE` (если есть), `STATE`, `DIFF`, `EVENTS`, `BOUNDED_TAIL`. Никогда — промпт воркера, полный транскрипт, внутренности раннера. Судья — отдельная сессия (`judge.ts:48-73`), модель отдельным флагом.

`parseVerdict` (`judge.ts:38-45`): регексп `/^\s*(?:[*_`]{0,2})?(?:(?:verdict|вердикт)\s*[:：]\s*)?(pass|fail|inconclusive)\b/m`; нет строки — `inconclusive`, никогда не догадка по прозе.

Известные слабости (факты, не мнения; #1, #3 воспроизведены прогоном регекспа независимой верификацией):

1. **Префикс `VERDICT:` опционален** в регекспе, а флаг `/m` даёт совпадение по **любой** строке. Первое совпадение по всему тексту побеждает → рационале, начавшееся с абзаца «Fail conditions were…» или «Pass rate…» без первой строки-вердикта, будет прочитано как вердикт (проверено: `"…\nFail conditions were not met…"` → `fail`; `"Rationale:\nPass rate … 100%"` → `pass`). Класс дефекта тот же, что у убитого fallback `/ошиб|fail/`, только уже.
2. **Рубрика не проверяет завершённость по SDD**: в ней нет `DONE`, нет `audit`, нет receipt'ов (`judge.ts:18` — полный текст рубрики). Именно это H1 из `docs/flow-verification-redesign.md:16-17`: «Judge rubric never checks DONE/audit. The one catch was stochastic (worker narrated "stays TODO")»; закрыто механически (R-COMPLETE), не в рубрике.
3. **Вердикт печатается только от судьи.** `cli.ts:234`: `const verdict = result.judge?.verdict ?? 'worker-error'`. Детерминированные правила ложатся в поле `quality` артефакта (`cli.ts:259, 263, 271`) и печатаются отдельной строкой, но **не сливаются в вердикт**.
4. **Прогон не имеет агрегированного кода возврата.** Единственный `process.exitCode = 1` — `cli.ts:316`, только в `main().catch` (`process.exit(130)` — отдельно, `:192`). Батч, где все сценарии `fail`, завершается кодом 0. Гейтить CI по `sdd-flow-eval` сегодня нечем.
5. Стохастичность подтверждена документами и транскриптами (A3b §6): ложный fail на `scaffold` chain6/10b при чистой механике; осцилляция pass/fail из-за неполной симуляции approval (лечилось `operator-approve.sh`).

### 1.5 Детерминированные гейты — что есть на HEAD

| Гейт | Где | Бар | Как включается |
|---|---|---|---|
| **R1** (структурная целостность) | `quality-gate.ts:28-36` (`parseSddCheckResult`, чистая), `:43-60` (`checkR1Structure` — запускает `node_modules/.bin/gennady sdd-check --all .` в песочнице) | `clean` → pass; `N error(s)` → fail с числом; иначе → **fail** `'no sdd-check verdict parsed'` | автоматически для фаз, что «производят спеки»: `cli.ts:240-249` — не `task`, и для `brownfield` только spec-режимы (`brownfieldSpecMode` `:241-245`, `producesSpecs` `:246-249`) |
| **MIGRATION** | `migration-grade.ts` (`computeMigrationGrade:84-…`), вызов `cli.ts:250-261` | `pass = flowV2 && criticalIntroduced.length === 0` (`:97`); `MIGRATION_CRITICAL_CODES = {SDD_BROKEN_SPEC_REF, SDD_BROKEN_SPEC_ANCHOR, ERR_CLI_SDD_CHECK_READ_FAILED}` (`:31-36`); остальной рост находок → `backlog` (`:103`), не провал. Baseline снимается `captureBaseline` до воркера (`cli.ts:199-201`). Докблок `:79` обещает «Pass = repo is v2 AND no migration-introduced **ERROR-severity** findings» — код фильтрует только эти 3 кода; докблок и код разошлись (та же категория дрейфа, что у `types.ts:38-39`, см. §2) | автоматически при `phase === 'migration'` |
| **R-COMPLETE** (новое, `95329c19`) | `quality-gate.ts:62-74` (`CompletionSignals`), `:76-85` (докблок), `:86-102` (`parseCompletion`, чистая), `:113-121` (`CompletionTargets`), `:130-143` (`checkCompletion` — читает файлы с диска); вызов `cli.ts:266-274` | нет артефакта → fail `'declared artifact was not produced'`; артефакт есть, но нет `**Status:** [x]`, закрытого раунда `- [x] \`…\` DONE` внутри `<!--SECTION:EXECUTION_LOG-->`, `SDD_AUDIT_RECEIPT` или `SDD_REVIEW_RECEIPT` на owning-спеке → fail со списком отсутствующего | **opt-in**: только если у сценария есть `completion` (`cli.ts:270`). В `scenarios.json` его нет ни у одного сценария; объявлен только в `scripts/roundtrip-eval.sh:93-97` |
| **`session-metrics.py gate`** | `scripts/session-metrics.py:81-99` (`state_metrics`), `:164-186` (`gate`) | RED, если `guard_written`, но `ticket_status` не `[x]`, либо нет закрытого раунда, либо нет `SDD_AUDIT_RECEIPT`/`SDD_REVIEW_RECEIPT` | вкручен в `scripts/roundtrip-eval.sh` |
| **golden `verify.sh`** | по фикстуре (`task`, `brownfield`) | exit 0 | руками/через тесты |
| **`roundtrip-grade.sh`** | `scripts/roundtrip-grade.sh:22-46` | «soft» балл 82-пробного бенча (`:49` «frozen golden 82 probes»): проба зачтена, если совпал **exit-код** И дерево не изменилось; «нет в выводе: …» — отдельный wording-gap, не провал (`:35-45`); плюс не-поведенческие факторы (`:62-70`) | руками |

Замечания по этим гейтам:

- **R-COMPLETE и `session-metrics.py gate` — два независимых воплощения одного правила, и они уже разошлись, а не «могут разойтись».** Питоновский вариант жёстко зашит на cloud-ios (`session-metrics.py:82-84`: пути `Tools/check-swiftlint-exceptions.sh`, `specs/infra-base/infra-base.task.IB-script.md`, `specs/infra-base/infra-base.spec.md`) и на хост (`:19-21`: `DB = ~/.local/share/opencode/opencode.db`, `GEN = /Users/k.lebedev/Developer/gennady/.claude/worktrees/sdd-v2-rc52-followup`). TS-вариант параметризован сценарием. Два конкретных расхождения: (а) при **отсутствующем** артефакте `session-metrics.py gate` всё равно печатает GREEN — все проверки внутри `if s["guard_written"]` (`:170`), тогда как `checkCompletion` даёт FAIL `'declared artifact was not produced'`; (б) `session-metrics.py` пишет сигнал `impl_receipt` (`SDD_PHASE_RECEIPT` в тикете, `:96`), но **не гейтит** его, а `checkCompletion` про impl-receipt не знает вовсе.
- **R1 на реальном репозитории не работает — но не по той причине, что казалось на первый взгляд.** Во всех 10 прогонах на cloud-ios `quality` = `R1/false — no sdd-check verdict parsed` (§1.8). `parseSddCheckResult` при этом **прекрасно читает** реальный вывод: прогон `sdd-check --all` на `fixture-detmig` (25 errors/141 warnings/13 files) даёт `{"rule":"R1","pass":false,"detail":"25 sdd-check error(s)"}` — парсер отработал корректно. Дыра в другом: `✅ clean — N file(s) checked` печатается только при `findings.length === 0` (`cli/cmd/sdd-check/sdd-check.types.ts:148-151`), а строку вида «`0 error(s), 141 warning(s)`» (`:164`) парсер трактует как отсутствие вердикта → `no sdd-check verdict parsed`. То есть **R1 валит любой репозиторий с нулём ошибок и хотя бы одним ворнингом**, хотя `cli/cmd/sdd-check/help.ts:92` прямо говорит «0 clean (warnings allowed)». Фикс — один предикат («0 ошибок при любом числе ворнингов = pass»), а не «собрать реальные выводы и расширить парсер» (детали — E-01 в §4.1).
- **R2/R3/R4/R5/R6 из `QUALITY-RULES.ru.md` в код не вписаны**: `grep -n "rule: '"` по `ai/flow-eval/*.ts` даёт только `R1`, `MIGRATION`, `R-COMPLETE`. Точнее: в `QUALITY-RULES.ru.md` заявлен бэклог из **6** правил (R1, R2, R3, R4, R5, R6); реализовано из бэклога **1** (R1); `MIGRATION` и `R-COMPLETE` реализованы **вне** бэклога и в него не внесены.

### 1.6 Что реально доказывает «PASS» по фазам

| Фаза (сценарий) | Что подтверждает pass | Чего pass **не** подтверждает |
|---|---|---|
| `spec-authoring` (`fibonacci-library`) | судья счёл артефакты соответствующими `acceptance`; R1 = `sdd-check --all` чист | семантическое качество декомпозиции; что Approval #1 действительно «pending» механически (проверяет только судья по прозе); масштабы кроме `function` |
| `scaffold` (`tic-tac-toe`) | судья + R1 | что тикеты **исполнимы** (`sdd-task` их принимает) — не проверяется; DAG-консистентность |
| `execute` (`slugify-toolchain`) | судья **без `acceptance`** (поле отсутствует) → фактически «судья по intent'у»; R1 | завершённость по SDD (`DONE`, закрытый раунд, receipt'ы) — только если добавить `completion`; корректность кода (нет golden для execute — R2 не реализован) |
| `repair` (`broken-specs-repair`) | R1 чист + судья; бар в `acceptance` совпадает с R1 | что фикс не сломал смысл спеки |
| `task` ×3 | независимый `golden/verify.sh` exit 0 — **самый крепкий бар в харнессе** (both-way залочен `infra-golden.test.ts`) | ничего про SDD-флоу (по промпту «no SDD ceremony») |
| `brownfield` (все 5 режимов) | только детерминированный golden в юнит-тестах; LLM-прогоны были, но вне `scenarios.json` | воспроизводимость как сценария; R1 применяется только к spec-режимам |
| `migration` (cloud-ios) | **`MIGRATION` grade**: `FLOW_VERSION=v2` + ноль внесённых критических находок | что мигрированный репозиторий **исполним** (см. §3, G4: 2-колоночные §5, `SCOPE_TYPE`, нет `PHASE_RECEIPTS:v1`); вердикт судьи здесь всегда `fail` (§1.8) |
| round-trip (`RT-cloud-ios-IB-script`) | `roundtrip-grade.sh` soft-балл против эталона + (с `95329c19`) R-COMPLETE | что фазовые гейты что-то проверяли — в фикстуре `rt-regen/package.json` **4 из 8** npm-скриптов = readiness-шим `node -e "process.exit(0)"` (`type-check`/`test`/`test:coverage`/`format`), а `lint`/`format:fix`/`lint:fix` при этом вызывают настоящий `gennady lint`. Т.е. в этом прогоне `sdd-verify` частично гонял no-op'ы, частично — реальные проверки |

### 1.7 Планка воспроизводимости

Формальная дисциплина документирована в `QUALITY-RULES.ru.md:10-16`: **оба исхода** каждого правила должны воспроизводимо проходить и падать («both-way»). Это выполнено для детерминированных гейтов (see suite ниже: `parseSddCheckResult (R1, both outcomes)`, `checkCompletion (R-COMPLETE, both outcomes, from disk)`, `brownfield-*-golden … (both outcomes reproducible)`, `infra-golden … (both outcomes reproducible)`).

Для **LLM-прогонов** формальной планки в коде/доках нет; рабочая планка сессии — «2 pass» (A3b §6: authoring 1/4→5/6, `scaffold` 2/2, `execute` 2/2, migration r5/r6/rtbase 3/3, recover N≈3). `R5` («воспроизводимость исхода ≥ порога на N») в `QUALITY-RULES.ru.md:27` помечена как итерация 5 и **не реализована**: батч-замер clean-rate в `cli.ts` отсутствует.

### 1.8 Цена и токены — измерено по `.results/**` (не по докам)

Все **14** сохранённых прогонов (`ls -d .results/run-*` = 14; таблица `summary.json` каждого `run-*`):

| Прогон (дата/время UTC) | Сценарий | verdict | status | in | out | reasoning | cacheRead | total | cost | quality |
|---|---|---|---|---|---|---|---|---|---|---|
| 09-05T11:33 | `MIG-cloud-ios-infra` | fail | running | 179 837 | 23 885 | 88 305 | 14 911 232 | 292 027 | 0 | R1 false (no verdict parsed) |
| 09-05T12:19 | `MIG-cloud-ios-infra` | fail | running | 265 543 | 17 728 | 200 632 | 13 870 720 | 483 903 | 0 | R1 false |
| 09-05T16:53 | `MIG-cloud-ios-infra` | fail | running | 289 361 | 20 953 | 313 387 | 26 514 304 | 623 701 | 0 | **MIGRATION false** (`SDD_LANGUAGE_CALQUE`…) |
| 09-05T17:57 | `MIG-cloud-ios-infra` | fail | running | 396 850 | 52 173 | 382 560 | 30 549 248 | 831 583 | 0 | **MIGRATION false** (`SDD_BROKEN_SPEC_REF`…) |
| 09-06T09:29 | `MIG-cloud-ios-infra` | fail | running | 201 865 | 23 649 | 216 928 | 18 522 368 | 442 442 | 0 | **MIGRATION true** |
| 09-06T10:13 | `MIG-cloud-ios-infra` | fail | running | 160 680 | 15 900 | 255 264 | 21 138 816 | 431 844 | 0 | **MIGRATION true** |
| 09-06T10:37 | `MIG-cloud-ios-infra` (rtbase) | fail | running | 122 666 | 14 297 | 59 584 | 8 153 728 | 196 547 | 0 | **MIGRATION true** |
| 09-06T12:37 | `RT-cloud-ios-IB-script` | fail | running | 86 717 | 3 849 | 70 232 | 1 753 472 | 160 798 | 0 | R1 false |
| 09-06T14:52 | `RT-…` | fail | running | 139 218 | 10 829 | 57 493 | 2 281 856 | 207 540 | 0 | R1 false |
| 09-06T15:28 | `RT-…` (rt4) | fail | running | 89 928 | 27 512 | 72 255 | 6 966 272 | 189 695 | 0 | R1 false |
| 09-06T16:22 | `RT-…` | fail | running | 87 559 | 5 168 | 27 156 | 2 024 448 | 119 883 | 0 | R1 false |
| 09-06T16:50 | `RT-…` (rt7) | fail | running | 77 126 | 14 124 | 67 671 | 2 773 888 | 158 921 | 0 | R1 false |
| 09-06T17:14 | `RT-…` (fc1) | fail | running | 66 751 | 3 518 | 28 235 | 1 170 048 | 98 504 | 0 | R1 false |
| 09-06T17:38 | `RT-…` (**fc2**) | fail | **completed** | 111 853 | 29 660 | 106 421 | 8 390 272 | 247 934 | 0 | R1 false |

Выводы (перепроверены и исправлены независимой верификацией):

1. **14/14 прогонов — вердикт судьи `fail`**, включая три, где `MIGRATION` grade = PASS (r5/r6/rtbase). «migration r5/r6 PASS» — это **детерминированный грейд**, а судья на них сказал fail. **13 из 14** прогонов имеют `status: running` — то есть закончились исчерпанием бюджета наблюдений, что по `runner.ts:91-105` + `judge.ts:18` = автоматический fail. Единственный `completed` (fc2) получил fail по существу: судья прочитал признание воркера («phase cannot be marked DONE and the ticket stays `TODO`», см. `rt-regen/.sdd-eval-judge.RT-cloud-ios-IB-script.md`) — то есть единственный «настоящий» вердикт судьи был правильным, но опирался на прозу воркера, а не на диск. Метрики-леджер (`metrics-ledger.jsonl`) содержит ровно одну запись — `fc2-baseline`, все четыре completion-сигнала `false` (`ticket_status "[ ] TODO"`, `round_closed/impl_receipt/audit_receipt/review_receipt = false`).
2. **`cost` = 0 во всех 14 прогонах** — `llm-proxy` не отдаёт стоимость. Денежных лимитов харнесс измерить не может; ограничивать можно только токенами.
3. **`cacheRead` — главная величина и она нигде не бюджетируется**: от 1,17 M до **30,5 M** токенов на прогон, что на 1–2 порядка больше `total`. `total` в `evidence.ts:250-296` (`readUsage`) явно не включает cache-read — `acc.total += input + output + reasoning` (`:285`; арифметика сходится: 179837+23885+88305 = 292027), поэтому любые «токен-экономики» в докладах занижают реальный трафик.
4. Порядок величин по фазам (из `EXPERIMENTS-LOG.ru.md`, совпадает с таблицей): `task` ≈ 10–32 k total (`:54/:64` → 32 235); brownfield-дельта ≈ 10 k (`:89`); recover V2 ≈ 10,8 k (reason 334) против V1 129 k (reason 68 k) (`:102-105/:170`); repair 25–79 k (`:9/:14` → 25 271/78 877); authoring baseline in ≈ 83 k, total ≈ 136 k (`:29`); migration 196 k–831 k; round-trip 98 k–248 k. `EXPERIMENTS-LOG.ru.md:8-10`: «~93–95 % токенов — ВХОД + reasoning, запись ~5 %». **Оговорка:** для фазы `execute` измеренных прогонов нет вовсе — ни в `.results`, ни в `EXPERIMENTS-LOG.ru.md` (там только «execute ~28 tool-calls», `PROGRESS-REPORT.ru.md:97`). Все оценки «60–150 k» для execute в этом документе — **экстраполяция** между `task` (~32 k) и authoring (~136 k), не измерение.

### 1.9 Прогоны детерминированных проверок (эта сессия)

```
# RC-live (HEAD 3d5f66a7, dist собран):
$ node --import tsx --test <RC-live>/ai/flow-eval/__tests__/*.test.ts
# tests 90   # suites 16   # pass 90   # fail 0   # cancelled 0   # skipped 0   # todo 0
# duration_ms 34921.384
```

```
# RC-scratch (HEAD 11291af5, dist НЕ собран):
$ node --import tsx --test <RC-scratch>/ai/flow-eval/__tests__/*.test.ts
# tests 84   # suites 14   # pass 83   # fail 1
not ok 14 - provisioner gives fixture scenarios unique isolated directories
  error: 'gennady dist is missing at <RC-scratch>/dist; run npm run build first'
  (findGennadyRoot — provision.ts:1127)
```

Делта 84→90 = ровно два новых коммита: `95329c19` даёт +4 кейса (`checkCompletion (R-COMPLETE, both outcomes, from disk)`: PASS при artifact+DONE+round+2 receipt'а; FAIL «abandoned» при artifact+TODO+открытый раунд; FAIL при отсутствии audit-receipt; FAIL при непроизведённом артефакте — `__tests__/quality-gate.test.ts:32-90`), `3d5f66a7` даёт +2 кейса и новый файл `__tests__/provision-gennady.test.ts` («materializes the local built dist and a bin shim that execs it», «REFRESHES a stale sandbox dist on re-provision (no blanket skip)»). Прогнал их отдельно: `# tests 9 # pass 9` (7 в `quality-gate.test.ts` + 2 в `provision-gennady.test.ts`).

```
$ npm --prefix <RC-scratch> run test:topology
unit=211 contract=16 local=51 external=8
coverage observed=227[unit+contract] black-box=59[local+external]
```

**Suite требует собранный `dist/`** (`provision.ts:1127` `findGennadyRoot`), но `README.md` («Fake-backed regression suite», `:65-71`) обещает «no OpenCode server needed» и о `npm run build` молчит (косвенно упомянуто в `:24`: «copies the built SDD (`dist/**`…)»). Один кейс из 90 — фактически интеграционный.

**Про коммит-гейт — правка после независимой верификации.** Исходная формулировка «`npm run check` не гоняет flow-eval-suite вообще» **опровергнута**. `package.json:51` `"test"` = `scripts/test-topology.ts deterministic`, `TEST_ROOTS` включает `ai` (`test-topology.ts:19`), режим `deterministic` = unit+contract+local+external минус `V2_GATE_EXCLUDED_NAMES` (`:216-219` минус `:164`) → **68 из 90** кейсов flow-eval сидят в коммит-гейте через `npm test`; и `test:sdd-flow-eval` **встречается** в `scripts/test-topology.ts:34` (утверждение обратного было неверным). Вне гейта — только `harness.test.ts` (`V2_GATE_EXCLUDED_NAMES` содержит `'harness.test.ts'`, `:25-37`, обоснование «под c8 детерминированно превышает бюджет offline-гейта», `:36`), и в нём — **22 кейса**, не 29 (прогнан отдельно: `# tests 22 # pass 21 # fail 1`; цифра 29, как и сумма «46», унаследована из A2 §6.7 без проверки и там тоже неверна). `package.json:78` `check` = `sdd-verify --profile full` (дословно).

### 1.10 Что НЕ покрыто (A2 §6.7 + собственная проверка)

Восемь поверхностей флоу без **никакого** автоматического покрытия (ни LLM-сценария, ни детерминированного теста), по A2 §6.7 — перепроверено:

1. маршрутизация роутера / `LOGIC_SWITCH` (есть только `cli/__tests__/directive-tool-contract/**` про форму tool-call'ов и человеко-управляемый `ai/flow-sim` — 13 md, **ни одного npm-скрипта**, `grep 'flow-sim' package.json scripts/*.ts` пусто);
2. авторинг infra-скоупа / выбор тул-стека;
3. авторинг interface-скоупа;
4. код-ревью;
5. reconcile (`fix` / `from-code`) — только карты `ai/flow-sim/S8`, `S9`;
6. discover-from-code масштаба проекта;
7. execute батчем / очередь тикетов (есть только `sdd-task.cmd.test.ts` про execution map);
8. module decomposition end-to-end.

Плюс к этому списку (собственная проверка):

9. **non-Node стеки** — ноль тестов и ноль сценариев; единственный Swift-артефакт в репозитории — `ai/flow-eval/docs/swiftlint-toolchain-setup.md` (61 строка, ручная записка), а swift/go/python-фикстур в `provision.ts` нет;
10. **ownership при `sync`/`sync-skills`** — `cli/__tests__/e2e/sync.e2e.test.ts` (6 кейсов) и `sync-skills.e2e.test.ts` (4 кейса) проверяют только «first run / repeat unchanged / --dry-run / фильтр / несуществующий подкаталог / нет dev-machine-путей». **Ни одного кейса «локально изменённый файл сохраняется»** и «проектный скилл не удаляется». `grep -rn "preserved|manifest" cli/cmd/sync/*.ts cli/cmd/sync-skills/*.ts` — пусто (единственное совпадение во всём поддереве — комментарий в `cli/cmd/sync/__tests__/sync.cmd.test.ts:276`), т.е. и механизма нет (регресс против `main` `f74c8c1d` и issue #9.4 / #24);
11. **критик/семантическое ревью** — по природе (A2 §6.7);
12. **чейн-режим** (authoring→scaffold→execute одним прогоном) в харнессе отсутствует: `cli.ts`/`runner.ts` не знают про зависимости между сценариями; chain1–chain14 гонялись вручную;
13. **`inconclusive` не отличается от `fail`** ни в отчёте, ни в артефакте — агрегата вердиктов нет вовсе.

---

## 2. Оценка зрелости

Шкала: **A** — можно опираться как на доказательство · **B** — годно как сигнал, требует ручной интерпретации · **C** — работает только в руках автора · **D** — заявлено, но не работает.

| Измерение | Оценка | Доказательство |
|---|---|---|
| **Детерминизм (юнит-слой)** | **A−** | 90/90 кейсов, 16 сюит, 34,9 с на HEAD `3d5f66a7` (§1.9). Both-way дисциплина соблюдена на каждом реализованном правиле (`quality-gate.test.ts:12,32`, `brownfield-golden.test.ts`, `brownfield-spec-golden.test.ts` 19 кейсов, `infra-golden.test.ts`, `migration-grade.test.ts` 7). Минус: один кейс требует `dist/` (интеграционный внутри «fake-backed» сюиты) |
| **Детерминизм (гейты прогона)** | **B** | Реализовано **1 правило из 6 бэклоговых** `QUALITY-RULES.ru.md` (R1; R2/R3/R4/R5/R6 — без `rule:` в коде) **+ 2 внебэклоговых** (`MIGRATION`, `R-COMPLETE`). `R1` на реальном репозитории 10/10 раз дал `'no sdd-check verdict parsed'` (§1.8) — не потому что «не понимает вывод», а потому что не имеет исхода для «0 errors + N warnings» (§1.5). `R-COMPLETE` — opt-in и объявлен ровно у одного сценария (`roundtrip-eval.sh:93-97`) |
| **Судья** | **C** | 14/14 прогонов `fail`; 13 из них — по исчерпанию бюджета (`runner.ts:91-105` → `stuck` → рубрика `judge.ts:18`), т.е. вердикт не о качестве. Рубрика не знает про `DONE`/audit/receipt'ы. Вердикт не сливается с детерминированными гейтами (`cli.ts:234`). `parseVerdict` допускает совпадение по любой строке без префикса `VERDICT:` (воспроизведено прогоном регекспа). Единственный содержательный fail (fc2) построен на **признании воркера в прозе**, а не на диске |
| **Реалистичность фикстур** | **B/D** — двойная оценка | **B** для синтетики: 14 фикстур, у всех node-проектов есть `c8` + `scripts/test-coverage.mjs` без glob-токенов (залочено `fixture-coverage.test.ts`, причина — фингерпринт receipt'а отвергает `GLOB_META`). **D** для «реального» слоя: единственный реальный репозиторий — cloud-ios, и он проходит execute только через **частичный readiness-шим** `rt-regen/package.json` (4 из 8 npm-скриптов = `node -e "process.exit(0)"`: `type-check`/`test`/`test:coverage`/`format`; `lint`/`format:fix`/`lint:fix` вызывают настоящий `gennady lint`). Значит часть фазовых гейтов round-trip-прогона были no-op'ами; реальную проверку делал внешний 82-пробный бенч. Плюс обе «реальные» фикстуры не воспроизводимы своим HEAD: `fixture-detmig` держит 14 незакоммиченных изменений (грязное, уже мигрированное дерево — см. §3, G4), `rt-regen` живёт на eval-ветке `eval/run/roundtrip/regen` с 5 eval-коммитами |
| **Наблюдаемость / телеметрия** | **B+** | `evidence.ts:250-…` (докблок `:243-249`) `readUsage` суммирует **воркер + дочерние сессии** и включает `cacheRead` (`:283`); `evidence.ts:291-296` тянет ограниченный прогресс дочерних воркеров в tail (`child:<label>:<role>`, `:125`). Артефакты персистятся: `.results/run-*/summary.json` + `judge.md` + снимки спек (`cli.ts:275-300`). Минусы: `cost` всегда 0 (llm-proxy), `cacheRead` не бюджетируется, `session-metrics.py:38-42` читает **только топ-сессию** (`WHERE p.session_id=?`) → tool-calls субагентов в леджере не видны |
| **Стоимость** | **B−** | Токены измеряются точно и per-run; денежная стоимость — нет (`cost: 0` ×14). Порядок величин известен и стабилен для `task`/authoring/repair/migration/round-trip (§1.8); для `execute` измерений нет — оценка «60–150 k» экстраполяция, не измерение. В леджере ровно **одна** запись (`fc2-baseline`), т.е. non-regression-сравнение пока не с чем делать; `cacheRead` до 30,5 M на прогон, ограничителя нет |
| **Документация для нового человека** | **C+** | **Обоснование переписано после гейта адекватности (06 §5.2 п.47, R4).** Актуальные числа: в `ai/flow-eval/**` — **19 документов**, из которых карта `README.md` «Documentation map» линкует **11**; посылка прежней редакции «архитектурного дока нет» **опровергнута** — `docs/AGENT-BRIEF.ru.md` ровно им и является. Что остаётся в силе: карта не полна; **три параллельных словаря правил качества** (`R1` в `QUALITY-RULES.ru.md`, `MIGRATION` в `migration-grade.ts`, `R-COMPLETE` в `roundtrip-eval.sh`) не сведены в один; `README.md:29` описывает `scenarios.json` как «(authoring, scaffold, execute, repair)», умалчивая три `task`-сценария; `ROADMAP.ru.md:63` заявляет «Итог (все цели закрыты)» и «suite 71/71» (`:59`) — устарело; `types.ts:37-39` (и `:68-69`) обещает грейд миграции «sdd-state=v2 + sdd-check clean», что прямо противоречит `migration-grade.ts` (baseline-diff); докблок `migration-grade.ts:79` расходится с кодом; политики-детекторы наблюдателя (`observer.ts:36-63`) и лимиты evidence (`evidence.ts:38-42`) не описаны; `--keep`/teardown (`cli.ts:184-189`, `:211-215`) не документированы; `README.md` не упоминает необходимость `npm run build` перед suite. **Владелец правки — `GAP-E-5`** (**D-46**): единая eval-спека (часть A — человек, часть B — агент) заменяет `docs/AGENT-BRIEF.ru.md`, корпус сокращается **19 → README + спека + RUNBOOK + ledger**, словарь правил качества становится **один**; приёмка — скрипт-верификатор (`[UNVERIFIED]` = 0) и `README`, линкующий все оставшиеся доки. Критерий **A21** |
| **Пригодность к CI** | **C−** | Исходная оценка **D** снижена верификацией: пункт «`npm run check` не гоняет flow-eval-suite вообще» опровергнут — 68/90 кейсов сидят в коммит-гейте через `npm test`. Остаются в силе: (а) `sdd-flow-eval` не имеет агрегированного exit-кода — батч из одних `fail` завершается 0 (`cli.ts:316`); (б) `harness.test.ts` (**22** кейса) исключён из коммит-гейта; (в) LLM-часть требует уже поднятого OpenCode-сервера и хостовых артефактов (Swift 6.2 в `~/Library/Developer/Toolchains`, `TMPDIR` без хвостового слэша, `~/.gennady/eval/cloud-ios/*`), `session-metrics.py:19-21` зашит на абсолютные пути одного хоста |
| **Изоляция песочниц** | **A−** | `provisionScenarioDirectories` + `assertUniqueScenarioDirectories`; наблюдатель прерывает прогон, если воркер читает установленные бандлы Gennady или зондирует CLI через redirect (`harness.test.ts`: «aborts immediately when a worker reads installed Gennady bundles», «aborts an SDD CLI probe wrapped in stderr redirection», «SDK evidence includes bounded untracked artifacts omitted by OpenCode session.diff»); `sandbox-lifecycle.ts` + авто-teardown после ENOSPC-инцидента; `sandbox.test.ts`: «clean never touches non-sandbox directories». С `3d5f66a7` закрыта последняя дырка — stale dist в переиспользуемой песочнице |

### 2.1 Реестр рисков — «харнесс сам был источником примерно половины провалов»

Список из A3b §6 + `3d5f66a7`, каждый пункт с текущим статусом. Источник подтверждён дословно: A3b §6 (`:223`) — «харнесс сам был источником ~половины провалов (untracked diff, парсер вердикта, approval-симуляция, ENOSPC, стёртый лог, backticks, mise-сеть, TMPDIR `//`)» — это ровно H-1…H-8 ниже, один к одному и в том же порядке; H-9/H-11 тоже присутствуют в A3b. Реестр **не преувеличен** — «~половина провалов» не фигура речи, а цитата собственного отчёта сессии.

| # | Дефект харнесса | Что он портил | Статус |
|---|---|---|---|
| H-1 | `session.diff` не видел untracked-файлы | судья не видел созданные артефакты → ложные fail | закрыто; лок `harness.test.ts` «SDK evidence includes untracked artifacts omitted by `session.diff`» |
| H-2 | `parseVerdict` fallback `/ошиб\|fail/` | ложный fail на каждом сценарии про обработку ошибок | закрыто структурным `VERDICT:`; **остаточный риск** — префикс опционален, совпадение по любой строке (§1.4.1) |
| H-3 | неполная симуляция одобрения оператора | осцилляция pass/fail на «pending Approval» | закрыто `operator-approve.sh` (портал + Decision Log) |
| H-4 | накопление песочниц → ENOSPC | падение прогонов посередине | закрыто `sandbox-lifecycle.ts` + авто-teardown |
| H-5 | `reset-ticket.py` стирал execution-log | round-trip стартовал с испорченного состояния | закрыто (правка скрипта) |
| H-6 | backticks в `intent`/`acceptance` ломали JSON сценария | сценарий не парсился | закрыто соглашением (без backticks); **тестом не залочено** |
| H-7 | `.mise.toml` тянул сетевые тулы в offline-песочнице | fc1 упал | закрыто тримом `.mise.toml` (`rt-regen` `09f8594f50`) |
| H-8 | `TMPDIR` с хвостовым слэшем → `//` → SIGBUS в CoreFoundation | бенч SwiftLint падал | закрыто `export TMPDIR=/tmp` (`roundtrip-grade.sh:9`) |
| H-9 | противоречие `probes.sh` в `golden/` | воркер видел «эталон», который запрещено читать | закрыто (стенд вынесен) |
| H-10 | **stale `dist` в переиспользуемой песочнице** — `materializeLocalCli` делал blanket-skip при наличии `dist` | **все rt2–rt7 и fc1/fc2 гонялись на том dist, что лёг первым**, а не на текущем; изменения `execute.directive` STEP_6/7 и новых команд `sdd-log` воркер мог не видеть | закрыто `3d5f66a7` (+ `roundtrip-eval.sh:112-113` теперь делает `npm run build` перед прогоном, `|| exit 2`). **Все round-trip-числа до 07.09 надо считать «на неизвестной сборке»** (`3d5f66a7` датирован 07.09 08:13, все 14 прогонов — 05–06.09) |
| H-11 | фикстуры с path-кэшами (worktree vs clone) | несопоставимые прогоны | частично; дисциплина, не тест |
| H-12 | исчерпание бюджета → `stuck` → авто-fail судьи | 13/14 прогонов получили вердикт от бюджета, не от качества | **открыто** (см. §1.3, §1.8) |
| H-13 | `sdd-check.types.ts:148-151` печатает `✅ clean` только при нуле находок, а строку «0 error(s), N warning(s)» R1-парсер трактует как «нет вердикта» | 10/10 cloud-ios-прогонов: `quality R1: FAIL — no sdd-check verdict parsed` на репозитории **без единой ошибки** | **открыто**; фикс — один предикат (см. §1.5, E-01) |
| **H-15** | **мёртвый event-канал**: события `permission.asked` / `permission.updated` / `session.waiting` не подключены в живом прогоне — судья всегда получает `EVENTS []`. **Уточнение V-06-GAP:** «единственный канал» неверно — **две** эвристики `waiting` работают без событий (`observer.ts:144-152`); мёртв именно event-канал | судья не видит части наблюдений, но не полностью слеп | **открыто**; владелец — **`GAP-E-1`** (подключить `readEvents` **либо** убрать события из evidence и доков). Реальный масштаб потери **измерим только прогоном** (06 §6 п.4: нужны два прогона — с `readEvents` и без — на одном сценарии) |
| **H-16** | **опечатка в `phase`/`mode` не валидируется** (`cli.ts:133-150`, fallback вместо fail-fast). Исходы **разные**: опечатка в `phase` даёт молча **пустой** фазовый промпт (`prompts.ts:87` вырезает `undefined`), опечатка в `mode` — молча **другой валидный** промпт (`prompts.ts:76`, `?? PHASE_PROMPTS.brownfield`) | прогон выглядит успешным, но **измеряет не ту ветку** — худший класс ложного исхода | **открыто**; владелец — **`GAP-E-1`** (валидация fail-fast, а не через fallback) |
| **H-17** | **недостающая документация `--keep` и teardown** (`cli.ts:184-189`, `:211-215`) + путь результата не печатается | внутри песочницы результат перепроверить нечем, хотя артефакты **переживают** teardown и `.results/` описан в трёх доках | **открыто, но сужено V-06-GAP**: посылка «результат прогона недоставаем» опровергнута. Владелец — **`GAP-E-5`** (поглотил `GAP-E-3`): документировать `--keep`/teardown, внести `--keep` в приёмку `E-10`/`E-12`/`E-14`/`E-18`, печатать `.results/run-<ISO>/summary.json` как источник результата |
| H-14 | два независимых воплощения completion-правила уже **разошлись**, а не «могут разойтись»: (а) `session-metrics.py gate` даёт GREEN при отсутствующем артефакте (всё под `if s["guard_written"]`, `:170`), `checkCompletion` — FAIL; (б) `session-metrics.py` пишет `impl_receipt`, но не гейтит его, TS-вариант о нём не знает | барьеры расходятся по conкретным сценариям, не гипотетически | **открыто** |

**Честный итог зрелости.** Детерминированный слой харнесса — рабочий инструмент уровня A. Слой LLM-прогонов сегодня даёт **один** надёжный вид доказательства: «независимый golden/бенч сказал да» (фазы `task`, `brownfield`, round-trip-бенч) и «frozen grade сказал да» (`MIGRATION`). Вердикт судьи как отдельный сигнал — **не пригоден к использованию без ручного чтения rationale**. Всё, что называлось «PASS» на реальном репозитории, было PASS детерминированного грейда при `fail` судьи.

---

## 3. Покрытие по группам G1–G4

Принцип оператора: **один минимальный бар на ГРУППУ похожих проблем**, а не на пункт (не «одна штука на группу» буквально — G1 получает 4 таска, G3 — 3, G4 — 4, G2 — 1; общее у них то, что приёмка сведена к одному-двум детерминированным барам на группу). Ниже по каждой группе: что есть сегодня (сценарий / детерминированный тест / фикстура), чего нет, минимальный добавляемый эвал (форма фикстуры, приёмка — сначала детерминированные гейты, судья вторым), зависимости и как работа RC-сессии это меняет.

### G1 — non-Node стек: execute + verify (go/swift)

**Что есть.**
- Фикстур non-Node **нет**: `provision.ts` `FIXTURE_FILES` — 14 фикстур, все node/bash; ни одной с `go.mod`, `Package.swift`, `pyproject.toml`.
- Детерминированных тестов non-Node **нет**. Единственный Swift-артефакт в репозитории — `ai/flow-eval/docs/swiftlint-toolchain-setup.md` (ручная записка про Swift 6.2 + rpath-шим + `TMPDIR` без хвостового слэша).
- Единственный «стековый» прогон, что был: round-trip cloud-ios — но он проходил через readiness-шим (`rt-regen/package.json`, 4 из 8 скриптов no-op). Стековая верификация в этом прогоне выполнялась лишь частично (`lint`-класс — по-настоящему).
- Реальная фикстура-заготовка есть и она хороша: `fixture-detmig` содержит `gennady.yaml` (247 строк) с `stack.use: [anystack]` и тремя `extraGates` — `swiftlint` (`:23`, `cwd: MRCloudApp`, `argv: [mise, exec, --, swiftlint, lint, --strict]`, `timeout: 10m`, два правила `envFail` с `outputMatches`/`exitCodeMatches`/`hint`, `fixer`), `build` (`:97`), `unit-tests` (`:155`). Это готовый контракт приёмки для порта конфига. В дереве этой фикстуры также присутствует `Tools/Artifactory/.netrc` — файл с именем, характерным для учётных данных (см. §5, Q3).
- Внешний бенч (`roundtrip-grade.sh`, 82 пробы) — единственная работающая **поведенческая** проверка на Swift-репозитории, но он про качество скрипта-сторожа, не про verify-ладдер.

**Чего нет.** Всего, что B1 §6 помечает колонкой G1: детект стека (V-05), пресеты (V-04/V-08/V-09/V-10/V-11), readiness-движок (V-06), `gennady.yaml`-контракт (V-07), `when`-сужение (V-12), `--only/--skip` (V-13), вывод зелёного гейта (V-14) — **и, по сверке с B1 §6 в §3.2, также V-01 (node-parity golden), V-03 (`Gate`/`GateStatus`) и V-15 (директивы/`.hbs`/rules cascade)**, которые B1 тоже помечает «G1 = да», но B7 их не перечислял. Плюс из A4: #9.2 (orphan-скан только `ts/tsx/js`), #17, #19, #20, #9-bonus.

**Минимальный эвал G1 — `E-G1-go-execute` (детерминированный, БЕЗ LLM) + `E-G1-swift-verify` (детерминированный, на реальной фикстуре).**

| | `E-G1-go-execute` | `E-G1-swift-verify` |
|---|---|---|
| Форма фикстуры | новая `SddEvalFixtureId` `golang-slugify` в `provision.ts` `FIXTURE_FILES`: `go.mod`, `internal/slugify/slugify.go` + `_test.go`, одна scope-спека + один тикет с 3-колоночной §5 (`Command \| Required by \| Role`), `PHASE_RECEIPTS:v1`, `COVERAGE_POLICY:v1`, **без `package.json`** | `fixture-detmig` как есть (read-only clone), плюс её `gennady.yaml`. **Требует предварительного шага** — фикстура сейчас грязная (14 незакоммиченных изменений, см. G4 ниже); `verify` под tree-guard отказывается работать при `DIRTY_TREE` (написано прямо в шапке `gennady.yaml`), значит пункты приёмки №3 и №5 без предшествующего таска не запустятся (см. §4.1, E-16) |
| Приёмка (гейты, по порядку) | 1) `sdd-state` печатает `STACK=golang` (или что решит V-05); 2) `sdd-task` выдаёт тикет как pickable без `EXECUTION_READY=no`; 3) `sdd-verify --task … --phase P1` строит ладдер из go-пресета и пишет валидный `SDD_PHASE_RECEIPT`; 4) `sdd-check --all` чист. Всё — `assert` в `shared/sdd/__tests__` + `cli/cmd/sdd-verify/__tests__`, both-way (негатив: репозиторий без `go.mod` не получает go-ладдер) | 1) 3 `extraGates` из `gennady.yaml` распарсились без потери `envFail`/`timeout`/`cwd`/`fixer`; 2) неизвестный ключ → exit 4; 3) anystack-проект получает `ready` **без шима**; 4) гейт с непересекшимися `when`-globs печатает видимый `skipped`; 5) `DerivedData`/`.build` не считаются мутацией дерева |
| Судья | **не нужен** — обе проверки детерминированные | **не нужен** |
| Цена | 0 токенов | 0 токенов (swiftlint не запускаем — проверяем резолв гейтов, не их исполнение; `--plan`) |
| Размер | M (фикстура + 2 набора тестов) | S–M |

**LLM-часть G1** — ровно один сценарий, и он же снимает главный вопрос переноса: `E-G1-llm-go` = `phase: 'execute'`, `mode: 'canonical-execute'`, фикстура `golang-slugify`, `completion: { artifact, ticket, spec }` (т.е. **R-COMPLETE обязателен**), плюс независимый `golden/verify.sh` (go build + go test). Приёмка: golden exit 0 **И** R-COMPLETE pass; вердикт судьи — только как диагностика. Стоимость по аналогии с `slugify-toolchain`: порядок 30–60 k total (правдоподобная оценка по аналогии с `task`-классом ~32 k, не измерена напрямую).

**Зависимости.** `E-G1-go-execute` и вся LLM-часть **блокированы портом VERIFY** (B1: V-04 → V-05 → V-06 как минимум; без V-06 non-node проект не достигнет `EXECUTION_READY`, и `sdd-task` заблокирует impl-фазу — `sdd-task.cmd.ts:123` (`pickable = readiness.executionReady ? graphPickable : queuePickable`), `:461-487` (блок для всех `kind` вне `UNGATED_KINDS = ['bootstrap','config','doc']`, с уточнением — есть исключение `:464-478`, infra-queue exemption для тикетов, что сами строят отсутствующие гейты; для go-фикстуры блокировка сработает, но формулировка «жёстко» не абсолютна). Подтверждено эмпирически: `sdd-state` на `fixture-detmig` даёт `READINESS=not-ready (missing: package.json, type-check, test, test:coverage, format, format:fix, lint, lint:fix, fix, gennady (not installed))`, `EXECUTION_READY=no`. `E-G1-swift-verify` частично можно ставить раньше: пункты 1–2 (парсинг `gennady.yaml`) зависят только от V-07.

**Что меняет работа RC-сессии.** Ничего напрямую (Lead запретил трогать `sdd-verify`/`readiness.ts`). Косвенно — `3d5f66a7` делает возможным честный прогон на свежей сборке, а `95329c19` даёт готовый механический бар завершённости, который в G1 надо просто объявить.

### G2 — sync / ownership

**Что есть.**
- `cli/__tests__/e2e/sync.e2e.test.ts` — 6 кейсов: «sync directives on first run», «report unchanged on repeat run», «--dry-run», «filter by subdirectory», «fail on nonexistent subdirectory», «not contain dev-machine paths in synced directives».
- `cli/__tests__/e2e/sync-skills.e2e.test.ts` — 4 кейса: «install skills on first run», «unchanged on repeat», «--dry-run», «filter by skill name».
- Запускаются только `npm run test:e2e` (`GENNADY_E2E=1`), в коммит-гейт не входят (`test-topology.ts` `external`-класс, 8 файлов).

**Чего нет.** Ни одного кейса про **владение**: нет «локально изменённый файл сохраняется», нет «проектный скилл не удаляется», нет «`knowledge.xml` проектный не перетирается». Механизма тоже нет (см. §1.10 п.10). Это прямые регрессы против `main` (#9.4 — манифест владения `62172906`; #24 — `preserved` для `knowledge.xml` `f74c8c1d`) и открытый #11.

**Минимальный эвал G2 — `E-G2-ownership` (детерминированный e2e, БЕЗ LLM).** Один тест-файл, 6 кейсов both-way, дописывается в уже существующие `sync.e2e.test.ts` / `sync-skills.e2e.test.ts` (инфраструктура `E2eContext` уже есть):
1. директива, изменённая локально после `sync`, при повторном `sync` **сохраняется** (или отклоняется с явной ошибкой — по решению оператора, см. §5);
2. `ai/directives/knowledge.xml` проекта не перетирается (позитив) и перетирается при `--force` (негатив);
3. проектный скилл, которого нет в пакете, после `sync-skills` **остаётся**;
4. скилл, который был поставлен пакетом и удалён из пакета, после `sync-skills` **удаляется** (зеркальная сторона — чтобы правило не выродилось в «никогда не удалять»);
5. `--dry-run` печатает ровно те же решения, что применит реальный прогон (байтовое сравнение плана);
6. директивы, которые директивы зовут (`~/.claude/skills/…` vs `<cwd>/.claude/skills/`), резолвятся из того места, куда `sync-skills` реально положил.

Приёмка — только `assert`; **LLM не нужен вообще**. Цена 0. Размер S. Зависимость: решение оператора о модели владения (манифест как в `main` vs «preserved»-список) — это открытый вопрос B3 D-1 (см. §3.2 и §5).

**Важное расхождение с B4 (см. §3.2).** B4 §5.1 требует ещё и один LLM-эвал в G2 — «агент, которому сказали добавить правило для нового языка, пишет его в проектный слой, а не в пакетный». B7 считал, что «LLM не нужен вообще». Это прямое противоречие, не снятое в этой ревизии — оператору стоит явно решить, входит ли эта LLM-точка в минимальный набор G2 (см. §5, вопрос отдельно не задан, но зафиксирован здесь как открытый пункт плана).

### G3 — целостность execution-log и конвенций: execute → audit → critic

**Что есть.**
- Детерминированно: `shared/sdd/__tests__/group-receipt.test.ts`, `phase-receipt.test.ts`; `cli/cmd/sdd-check/__tests__/group-receipt.check.test.ts`, `phase-receipt-check.test.ts`; `cli/cmd/sdd-log/__tests__/group-receipt.cmd.test.ts`; `audit-group.test.ts` — коды `SDD_GROUP_AUDIT_MISSING` / `SDD_GROUP_REVIEW_MISSING` (**WARN**, с grandfather'ом по `PHASE_RECEIPTS:v1` у всех членов группы, `group-receipt.ts:316` `severity: 'warn'`, маркер `:24-25, :82-87`), аксиомы `AX_GROUP_AUDIT_LEAVES_A_RECEIPT` / `AX_GROUP_REVIEW_LEAVES_A_RECEIPT` (`execute.directive.xml:57, :77`).
- На уровне эвала: **`R-COMPLETE`** (`95329c19`) — ровно та проверка, которой не хватало: артефакт есть ⇒ обязаны быть `[x] DONE`, закрытый раунд, `SDD_AUDIT_RECEIPT` и `SDD_REVIEW_RECEIPT`. 4 both-way кейса.
- `session-metrics.py gate` — то же правило, зашитое на cloud-ios; и `compare` (non-regression: `steps`/`tool_calls_total`/`reasoning_tokens` не растут, completion-сигналы не падают).
- Живой прогон с одиночными сигналами **был** — chain10b даёт `Status: [x] DONE` + квитанции P1/P2 + `sdd-verify P2` ALL PASS 3/3 + judge pass 2/2 (`PROGRESS-REPORT.ru.md:70-73`). Но живого прогона с **групповыми** `SDD_AUDIT_RECEIPT`/`SDD_REVIEW_RECEIPT` **и** с `R-COMPLETE` ещё не было.

**Чего нет.**
- **Живого прогона, где STEP_6 действительно исполнился и групповые receipt'ы легли, а R-COMPLETE дал pass.** Все 14 сохранённых прогонов харнесса — `fail`; в леджере одна запись `fc2-baseline` со всеми completion-сигналами `false`. R-COMPLETE ещё **никогда не давал pass на живом прогоне харнесса**.
- Словаря токенов Execution Log (`intro`/`decision`/`tried`/`discovery`/`insight`/`verified`/`ver`/`BLOCKED`/`DONE`) `sdd-check` не проверяет вовсе → #13, #15-остаток, #23 открыты.
- Критик не видит конвенций скоупа (`tasks/README.md` / `3-tasks.md`) → #21; провенанс в Handoff отсутствует → #22.
- Никакого эвала на **код-ревью** (поверхность 4 из §1.10).
- По сверке с B2 §3.7 (см. §3.2) — три сценария G3 (значение исправлено в позднем раунде, пустой scope, `DONE` без `complete`-квитанции) без эвал-таска.

**Минимальный эвал G3 — `E-G3-execute-audit-review` (один LLM-сценарий + один детерминированный лок).**

- Фикстура: **`slugify-toolchain` как есть** — уже существует, дешёвая, уже гоняется. Добавить в `scenarios.json` поля `acceptance` (сейчас его нет!) и `completion: { artifact: 'src/slugify.ts', ticket: <путь тикета>, spec: <путь спеки> }`.
- Промпт остаётся `PHASE_PROMPTS.execute` — важно, чтобы сценарий не подсказывал про аудит: проверяем, доводит ли **сама директива** до STEP_6 и receipt'ов.
- Приёмка (по порядку): 1) **R-COMPLETE pass** (жёсткий бар); 2) R1 `sdd-check --all` чист; 3) `sdd-check --all` не содержит `SDD_GROUP_AUDIT_MISSING`/`SDD_GROUP_REVIEW_MISSING`; 4) вердикт судьи — диагностика. Негативная сторона (both-way) уже залочена юнит-тестами `checkCompletion`.
- Бюджет: `--max-observations` надо поднять с 6 хотя бы до 20–30 (иначе H-12: бюджет = fail). Цена по порядку `execute`-прогона — **экстраполяция**, порядок 60–150 k total (см. оговорку в §1.8).
- Плюс детерминированный лок `E-G3-log-vocabulary` (0 токенов): новый модуль-парсер Execution Log (`shared/sdd/execution-log.ts`) + тесты both-way на неизвестный токен, правку закрытого раунда, рассинхрон `Reopens`. Закрывает #13/#15/#23 одним модулем.

**Зависимости.** Нужен grandfather-переключатель: пока `SDD_GROUP_*_MISSING` — WARN и гасятся отсутствием `PHASE_RECEIPTS:v1`, третий пункт приёмки бессмыслен на любой не-эталонной фикстуре. **Оператор уже принял решение D-4** (см. §4.0): WARN→ERROR переводится только после того, как мигратор эмитит `PHASE_RECEIPTS:v1` (E-06) и пройдена самомиграция `gennady` (E-14). До этого момента третий пункт приёмки E-09 действует только на фикстурах, у которых `PHASE_RECEIPTS:v1` уже стоит (синтетика, не сегодняшний корпус RC — маркер `<!--PHASE_RECEIPTS:v1-->` не несёт ни один тикет RC на сегодня).

**Что меняет работа RC-сессии.** Меняет радикально: `95329c19` — это и есть ядро приёмки G3. Осталось (а) объявить `completion` у `slugify-toolchain` в `scenarios.json`, (б) поднять бюджет, (в) сделать один прогон, который **не** упрётся в бюджет.

### G4 — миграция v1 → v2 на реальном снапшоте

**Что есть.**
- Полноценный контролируемый раннер: `scripts/migration-eval.sh run|status|grade` — сбрасывает `fixture-mig-run` через `git worktree add -b <br> <fx> <base>` (`base = 9c04a878b0`, `:15`), накрывает v2-директивы оверлеем (`:31-35`), снимает v1-baseline (`flow`/`hist`), гоняет с `MAX_OBS=40` (`:19`), `--observe-every-ms 90000 --stuck-after 4 --concurrency 1` (`:47-48`).
- Замороженный грейд `migration-grade.ts` + 7 both-way юнит-кейсов.
- Результаты: 3 PASS грейда из 7 прогонов (r5, r6, rtbase); 2 FAIL до фикса STEP_7 (`SDD_BROKEN_SPEC_REF`), 2 «R1-эры» до появления грейда (§1.8).
- Вторая фикстура-кандидат — `fixture-detmig`. **Правка после независимой верификации:** это **не** v1-раскладка «на диске», как описывалось раньше, а **грязное, уже мигрированное дерево**: `git status --porcelain` даёт 14 записей — 7 × `RM tasks/infra-base/infra-base.IB-00N.md -> specs/infra-base/infra-base.task.IB-<slug>.md`, `D tasks/README.md`, `D tasks/infra-base/README.md`, `M specs/infra-base/infra-base.spec.md`, `?? specs/infra-base/infra-base.3-tasks.md`, `?? migration/`, `?? ai/directives/sdd-v2/`. HEAD-коммит фикстуры (`9c04a878b0`) действительно v1-раскладка (`tasks/infra-base/infra-base.IB-001…IB-007.md` + `tasks/README.md`), но то, что лежит на диске, — уже результат прошлого прогона миграции, а не v1-снапшот.
- **Ещё одна правка:** HEAD `fixture-detmig` (`9c04a878b0`) — это **та же точка истории**, что `BASE` у `migration-eval.sh:15`, на которой уже гоняется `fixture-mig-run`. «Вторая, другая точка истории cloud-ios» — не соответствует фактам; фикстура даёт ту же базу, что уже используется.

**Чего нет.**
1. **Сценария в `scenarios.json`** — фаза `migration` и режим `v1-to-v2` объявлены в типах, но референсного сценария нет; всё держится на bash-скрипте с абсолютными путями одного хоста.
2. **Бара «мигрированный репозиторий исполним»**. Это главный пробел G4, и он подтверждён прогоном на `fixture-detmig` (25 errors/141 warnings/13 files): грейд PASS при том, что (а) §5-таблицы 2-колоночные (`Command | Required by`) → `sdd-check --all` даёт их как **error**, ровно **7 × `SDD_VERIFICATION_TABLE_INVALID`** (полная гистограмма: `SDD_BDD_COVERAGE_ROW_UNPARSED` 63w, `SDD_LANGUAGE_CALQUE` 60w, `SDD_TABLE_CELL_TOO_LONG` 13w, `SDD_DEP_UNRESOLVED` 9e, `SDD_VERIFICATION_TABLE_INVALID` 7e, `SDD_BDD_SCENARIO_UNTESTED` 6e, `SDD_BROKEN_SPEC_ANCHOR` 5w, по 1e — `SDD_TABLE_CELL_MULTI_SENTENCE`, `SDD_PORTAL_ORPHAN_SPEC`, `SDD_BDD_MISSING_NEGATIVE`). Утверждение «`sdd-check` молчит» об этих таблицах — **опровергнуто**: `sdd-check` их прекрасно ловит как ошибку, просто `sdd-task`/`sdd-state` тоже спотыкаются на своей стороне; (б) `<!--SCOPE-TYPE: infrastructure-->` вместо секции `<!--SECTION:SCOPE_TYPE-->` → `sdd-state` даёт `AUTHORING_SCOPE_DIAG=infra-base scope 'infra-base': SCOPE_TYPE is not found`, `EXECUTION_READY=no` (при этом `FLOW_VERSION=v2`); (в) нет `<!--PHASE_RECEIPTS:v1-->` и `COVERAGE_POLICY:v1` (0 файлов с каждым из маркеров) → group-receipt enforcement grandfather-ится в ноль; (г) нет `Structural Owner`/`Owning Spec` в META, hyphen-анкоры не извлекаются `sdd-extract`.
3. Второго и третьего снапшота (messenger, сам `gennady`). Про `gennady`: репозиторий, который поставляет v2, сам на v1 — `sdd-state` даёт `FLOW_VERSION=v1`, 127 v1-тикетов в `tasks/`, 12 скоуп-каталогов, 1 v2-тикет (`*.task.<ID>.md`) (A2 §7.1). Это идеальный масштабный снапшот и одновременно проверка «съест ли мигратор 12 скоупов».
4. Фазы fold-back знания из execution-log в спеку (решение 44) — доказана руками, не автоматизирована.

**Минимальный эвал G4 — `E-G4-migration-executable` (усиление существующего, не новый).** Три изменения, ни одно не требует нового LLM-прогона сверх одного:
1. **Добавить в грейд третий бар: «мигрированный репозиторий исполним»** — детерминированно, 0 токенов, **дешевле, чем предполагалось изначально**: поскольку `sdd-check` уже ловит проблемные таблицы как `error: SDD_VERIFICATION_TABLE_INVALID`, третий бар — это добавление `SDD_VERIFICATION_TABLE_INVALID` (плюс проверки отсутствия `SCOPE_TYPE`/`PHASE_RECEIPTS:v1`) в `MIGRATION_CRITICAL_CODES` (`migration-grade.ts:31-36`) — расширение уже работающего механизма baseline-diff, не новый механизм проверки `sdd-task`/`sdd-state`. Both-way юнит-кейсы на замороженных выводах. Заодно поправить докблок `migration-grade.ts:79` (обещает «no migration-introduced ERROR-severity findings», а фильтрует ровно 3 кода — расхождение дока и кода).
2. **Перенести сценарий из bash в репозиторный JSON.** **Переоценено после гейта адекватности (06 §5.2 п.47, §2.6): размер S → M**, и форма уточнена — сценарий живёт **JSON-файлом в репозитории рядом со скриптом** и становится **дефолтом** `migration-eval.sh:16` (`id: MIG-cloud-ios-infra`, `phase: migration`, `mode: v1-to-v2`). **Поле `fixture` вместе с `directory` в одном сценарии запрещено** — это два взаимоисключающих способа задать дерево, и одновременное объявление делает источник дерева неопределённым; миграционный сценарий использует **`directory`** (снапшот вне репозитория, путь — из `EVAL_FIXTURES_ROOT`), а не новый `fixture`-id. Заодно убираются **все три** мёртвых литерала `migration-eval.sh` (`:13` `GEN_ROOT` указывает на несуществующий воркtree — из него выводятся `:22`/`:23`; `:16` `SCENARIO`; `:21` `FX` без env-override) и литералы `session-metrics.py:19-21`; те же дефолты проверяются в `roundtrip-eval.sh`. **Владелец — `GAP-E-4`.** Иначе миграционный эвал не воспроизводим ни у кого, кроме автора.
3. **Прогнать на снапшоте, который действительно даёт новую точку истории или новый масштаб.** `fixture-detmig` в текущем виде такой точки **не даёт** (см. выше — та же база, что у `fixture-mig-run`), и её сначала нужно привести в воспроизводимое состояние (см. §4.1, E-16). Обязательный снапшот по решению оператора D-3 — самомиграция `gennady` (12 скоупов, 127 тикетов, см. §4.0).

Приёмка: `MIGRATION` grade pass **И** новый executable-бар pass; судья не участвует (на migration он всегда `fail` по бюджету — §1.8). Цена одного прогона: 196–831 k total, медиана ≈ 442 k (§1.8) — **самый дорогой класс эвала**; для самомиграции `gennady` порядок выше кратно масштабу (см. §4.1, E-14). Размер: пункт 1 — S (было M до правки диагноза), пункт 2 — S, пункт 3 — по прогону M/L.

**Зависимости.** Пункт 1 требует, чтобы мигратор действительно научился эмитить 3-колоночные §5, секцию `SCOPE_TYPE` и `PHASE_RECEIPTS:v1` — иначе новый бар просто зафиксирует RED. Порядок обязателен: **сначала полнота мигратора (E-06), потом бар (E-07)** — это и есть предпосылка G4 (а) из §4.0. Скрипт `scripts/upgrade-verification-tables.py` уже существует (снимал «стену 1» вручную) — при реализации не дублировать, а встроить в `sdd-migrate`. Предпосылка G4 (б) — sandbox на свежем dist — уже закрыта `3d5f66a7`.

### 3.1 Триаж восьми непокрытых поверхностей флоу (из A2 §6.7) под план переноса

| Поверхность | Важность для плана переноса | Решение |
|---|---|---|
| Маршрутизация роутера / `LOGIC_SWITCH` | **высокая**: перенос VERIFY добавляет ветвление по стеку именно в роутер/readiness-директиву (B1 V-15 ⚑dir). Ошибка маршрута = молчаливый неверный путь | покрыть **дешёвым детерминированным** тестом резолва (`ai/inspector/core` уже парсит директивы и `READ_AND_USE`-цепочки — добавить лок «v1-раскладка → `migration-v1-v2.directive.xml`», «go.mod → go-пресет»); LLM-эвал не нужен |
| Авторинг infra-скоупа / выбор тул-стека | **высокая**: это единственное место, где стек **выбирается**, а перенос делает выбор значимым | добавить в план как `E-G1-infra-authoring` **после** V-05/V-07; до порта покрывать нечего |
| Execute батчем / очередь тикетов | средняя | оставить непокрытым; риск не в переносе |
| Module decomposition end-to-end | средняя | оставить непокрытым (есть юниты `module-specs.test.ts`) |
| Reconcile (`fix`/`from-code`) | средняя–высокая (идея reconcile-гейта из RCA не реализована) | оставить непокрытым в этом плане, зафиксировать как долг |
| Discover-from-code масштаба проекта | низкая для переноса | оставить непокрытым |
| Код-ревью | средняя: `SDD_REVIEW_RECEIPT` — половина бара R-COMPLETE, а самого ревью никто не оценивает | достаточно **механического** факта receipt'а (уже в R-COMPLETE); качество ревью — не эвалим. Оговорка: R-COMPLETE ещё ни разу не давал pass на живом прогоне (см. G3), так что «достаточно» пока не проверено |
| Авторинг interface-скоупа | низкая | оставить непокрытым |
| **Критик / семантическое ревью** | по природе не эвалится детерминированно | оставить; #21 закрывать read-set'ом, а не эвалом |

### 3.2 Сверка покрытия с треками B1–B4

Независимая верификация свела «что есть сегодня» отдельно (по `scenarios.json`, `__tests__`, `scripts/*.sh`, `docs/*.md`, фикстурам cloud-ios) и сверила с планами других треков:

| Группа | LLM-сценарий из референса | Детерминированный лок | Фикстура | Согласие с B7 |
|---|---|---|---|---|
| **G1** non-Node | нет | нет | нет ни одной синтетической (`grep -E "go\.mod\|Package\.swift\|pyproject"` по `provision.ts` — пусто); есть внешняя `fixture-detmig` + `gennady.yaml` | да |
| **G2** sync/ownership | нет и не нужен (спорно, см. B4 ниже) | 10 e2e-кейсов, ни одного про владение; механизма нет | `E2eContext` | да |
| **G3** execution-log / audit | нет (у `slugify-toolchain` нет ни `acceptance`, ни `completion`) | 6 файлов receipt-локов + `R-COMPLETE` 4 both-way | `slugify-toolchain` | да |
| **G4** миграция | нет в `scenarios.json` (фаза `migration` и режим `v1-to-v2` в типах есть) | `migration-grade.test.ts` 7 both-way | `fixture-mig-run` (@`d9de0f7c16`, сброс на `9c04a878b0`), `fixture-detmig` (@`9c04a878b0`, **грязное, уже мигрированное**) | частично — «вторая фикстура / другая точка истории» не подтвердилась |

**Сверка с B1 §6 (VERIFY).** Колонка G1 в исходном B7 перечислена неполно: B1 помечает «G1 = да» также у **V-01** (parity-golden: 5 профилей, байтовое сравнение stdout, `validatePhaseReceipt`), **V-03** (`Gate`/`GateStatus` как данные, «`env-fail` не считается gate-failure, но останавливает ладдер») и **V-15** (директивы + `.hbs` + rules cascade) — эти три добавлены в §3, G1 «Чего нет» выше. Пропуск V-15 был внутренним противоречием: в §4.2 (регрессии) именно V-15 названа «единственной задачей, после которой нужен полный набор LLM-прогонов». Отдельно: и B1, и B7 планируют использовать `fixture-detmig` для V-07/V-08/V-11/E-10 — но её дерево грязное (см. G4 выше), и пункты приёмки E-10 №3 («anystack-проект получает `ready` **без шима**») и №5 («`DerivedData`/`.build` не считаются мутацией дерева») требуют чистого дерева, иначе `verify` под tree-guard откажет с `DIRTY_TREE`. E-10 должен начинаться с приведения фикстуры в воспроизводимое состояние (см. §4.1, E-16).

**Сверка с B2 §3.7 (CHECK/LOG).** B2 перечисляет для G3 шесть сценариев; четыре не отображаются ни в один eval-таск B7:

| B2-сценарий | Отображение в B7 |
|---|---|
| G3-1 полный `execute` двух раундов, receipt у всех фаз | E-09 (частично) + E-05 — но E-09 не требует «нет строк вне словаря», это добавится только после E-05 |
| G3-2 дописать в закрытый раунд → отказ CLI | E-05 «правка закрытого раунда» — есть |
| G3-3 значение из Round 1 неверно в Round 3 → `correction`, копия значения в спеке — находка | **нет таска** |
| G3-4 пустой scope → `SDD_NO_TICKETS_FOUND`, а не «clean» | **нет таска** — смыкается с находкой B7 про R1: «нет находок» ≠ «всё хорошо» |
| G3-5 мигрированный тикет с `## Critic Rounds` → нумерация от лога | E-05 «`nextRoundNumber` по секции» — есть |
| G3-6 фаза `DONE`, написанная `line` вместо `complete` → находка (`SDD_EXECUTION_LOG_PHASE_UNRECEIPTED_DONE`, B2-07) | **нет таска** |

Плюс два миграционных кейса из B2 §2.6 без тасков: тикет с v1-заголовком `| Phase | Kind | Status | Target Files | Deps |`; тикет без `## Phases Overview`. Оба должны попасть в E-06 (полнота мигратора), иначе мигратор молча пропускает фазовые проверки (B2-09/B2-10). Все шесть пропусков внесены как долг в §4.1.

**Сверка с B3 §3.6 (SYNC/OWNERSHIP).** B3 определяет G2 как e2e-корпус из 8 фикстур с бинарной метрикой `assert.deepEqual(treeAfter, expectedTreeAfter)`. Из них в `E-04` отображаются `patched-directive` (№1) и `project-skills` (№3) полностью; `project-owned-registry` — частично (только `knowledge.xml`, без rule-файлов каскада); четыре фикстуры не покрыты вовсе: `stale-package-file` (снят с поставки: удалён; правленный на диске: сохранён с warning — E-04 №4 покрывает только зеркальную половину), **`v1-consumer`** (первый v2-sync **не удаляет ничего** + migration-hint — пересечение G2/G4, и **B3 называет её блокером релиза**, потому что затрагивает потерю чужих данных), `linked-checkout` (CLI из клона без `node_modules/gennady`, SO-8), `surface`-golden (`deployed-surface.golden.txt`, утечка dev-home в содержимом, SO-5). B3 объявляет G2 воротами релиза v2; B7 ставит E-04 как «S, сразу, ни от чего не зависит» — приоритет совпал, но статус «ворот» и блокер `v1-consumer` не были отражены явно. Внесено в §4.1 как долг.

**Сверка с B4 §5.1 (RULES).** Прямое расхождение в двух местах:
1. B4 требует **три** LLM-точки в G1 (все — про **scaffold/rules-cascade**, не про execute): (а) `typescript-rules` не активируется для `.py`/`.go`/`.swift` (активация семантическая, через `<Triggers>`); (б) scaffold python-скоупа кладёт `baseline-rules`+`python-rules`, не кладёт `typescript-rules`; (в) scaffold swift-скоупа без правил идёт по тропе `skip`/`research-and-author`/`defer`, не выдумывает ссылку. Единственный LLM-сценарий G1 у B7 (`E-G1-llm-go`) — про **execute**, ни одна из трёх точек туда не попадает. Rules-cascade-часть G1 сегодня без eval-таска.
2. B4 требует один LLM-эвал в G2 («агент пишет новое правило языка в проектный, а не в пакетный слой»); B7 §3 G2 пишет «LLM не нужен вообще» — прямое расхождение, не снятое (см. G2 выше).
3. B4 требует фикстуры для всех трёх стеков (`pyproject.toml`, `go.mod`, `Package.swift`) — «без новых фикстур G1 нечем измерять». У B7 в плане только `golang-slugify` (E-11); python/swift фикстур нет ни в одном таске.
4. B4 T-7 требует миграцию подавлений на `cloud-ios`/`messenger` — messenger у B7 фигурирует только как опция в вопросах §5, что стоит явно связать (messenger нужен минимум двум трекам).

---

## 4. Предложение по eval-плану

> **Сноска Lead (2026-09-07):** порядок E-06/E-07 в §4.1 и рекомендация Q5(a) заменены решением **L-15**: сначала **E-07** (бар исполнимости red-first — коды в `MIGRATION_CRITICAL_CODES`, размер S), затем **E-06** (полнота мигратора). См. `02-LEAD-DECISIONS.md` L-15 и `61-TASK-BOARD.md` §2.2.


### 4.0 Решения оператора, уже принятые (входят в план как факты, не как вопросы)

- **D-3.** Самомиграция `gennady` (12 скоупов, 127 v1-тикетов) — **обязательный** шаг плана переноса («Шаг 4: миграция `tasks/` v1→v2 + вычистка v1», ответ на вопрос «когда мигрируем архив `tasks/`» — «Финальным проходом, рекомендую»). Из этого следует: **E-14 в §4.1 — обязательный G4-таск, не опция.** Эвал G4 должен ехать на этом прогоне, стоимость которого план и так закладывает.
- **D-4.** `SDD_GROUP_AUDIT_MISSING`/`SDD_GROUP_REVIEW_MISSING` переводятся из WARN в ERROR только **после** того, как (а) мигратор эмитит `PHASE_RECEIPTS:v1` для всего мигрированного корпуса, и (б) пройдена самомиграция `gennady`. До этого момента grandfather-переключатель остаётся включён, и третий пункт приёмки E-09 (§3, G3) действует только на фикстурах, которые уже несут `PHASE_RECEIPTS:v1`.
- **Модели.** В RC-сессии зафиксировано: разрешены только модели семейства `llm-proxy/*` — и для воркера, и для судьи. Это сужает опции вопроса о модели судьи в §5 (Q4) до выбора внутри `llm-proxy`, а не выхода за его пределы.
- **Предпосылки G4**, которые план обязан учитывать: (а) мигратор эмитит `PHASE_RECEIPTS:v1` + 3-колоночные таблицы §5 + секцию `SCOPE_TYPE` — это ровно содержание E-06, без него бар E-07 зафиксирует RED без пользы; (б) песочница эвала использует свежий `dist` — **уже сделано** в `3d5f66a7` (см. H-10 в §2.1), дополнительных действий не требует.

### 4.1 Упорядоченный список задач

`size`: S ≤ 1 фаза-день · M 2–4 · L неделя+. «Цена» — оценка `total` токенов на один прогон по §1.8; «0» = детерминированный, LLM не нужен. Оценки без прямого измерения помечены «(экстраполяция)».

| id | группа | что делает | фикстура | гейты приёмки (в порядке) | цена | size |
|---|---|---|---|---|---|---|
| **E-00** | инфра эвалов | Починить пригодность к CI: агрегированный exit-код у `sdd-flow-eval` (fail/inconclusive любого сценария → exit 1); вернуть `harness.test.ts` отдельным шагом `npm run test:sdd-flow-eval` без c8 в цепочку `check` (не «в коммит-гейт» — исключение из `V2_GATE_EXCLUDED_NAMES` обосновано бюджетом c8); добавить `npm run build` в README/`test:sdd-flow-eval` | — | 90/90 остаются зелёными; новый тест «батч с одним fail даёт exit 1» | 0 | S |
| **E-01** | инфра эвалов | Починить `R1` на реальном репозитории: **один предикат** «0 error(s) при любом числе ворнингов = pass», как уже задокументировано в `cli/cmd/sdd-check/help.ts:92` («0 clean, warnings allowed»); `parseSddCheckResult` сегодня 10/10 раз даёт `'no sdd-check verdict parsed'` на строке «`0 error(s), N warning(s)`» (§1.5, H-13) | замороженная строка вывода `sdd-check`, `fixture-detmig` (только чтение) | both-way юнит на замороженном выводе «0 errors + N warnings»; `inconclusive` перестаёт молча означать fail | 0 | S |
| **E-02** | G3 | Объявить `completion` у `slugify-toolchain` в `scenarios.json` + `acceptance` (сейчас отсутствует) | `slugify-toolchain` | правка + суита зелёная | 0 | S |
| **E-03** | все | **Re-baseline после `3d5f66a7`.** Все round-trip/execute-числа до 07.09 получены на неизвестной сборке (H-10: `materializeLocalCli` делал blanket-skip). Прогнать заново `slugify-toolchain` (execute) и один `infra-*` на свежем dist, записать в `metrics-ledger.jsonl` | `slugify-toolchain`, `infra-makefile` | golden exit 0 (infra); R-COMPLETE (execute, из E-02); 2 pass | ≈ 11 k (infra) + 60–150 k (execute, экстраполяция) ×2 | S |
| **E-04** | G2 | `E-G2-ownership` — 6 both-way кейсов владения в `sync.e2e.test.ts` / `sync-skills.e2e.test.ts` (§3, G2) | e2e-контекст `E2eContext` | все 6 `assert`; `--dry-run` план байт-в-байт равен применённому | 0 | S |
| **E-05** | G3 | `E-G3-log-vocabulary` — модуль `shared/sdd/execution-log.ts` (парсер раундов/фаз/токенов) + both-way тесты: неизвестный токен, правка закрытого раунда, рассинхрон `Reopens`, `nextRoundNumber` по секции, а не по файлу | синтетические тикеты | 4 both-way группы; закрывает #13/#15-остаток/#23 одним модулем | 0 | M |
| **E-06** | G4 | Полнота мигратора: 3-колоночные §5 (встроить существующий `scripts/upgrade-verification-tables.py`, не дублировать), секция `<!--SECTION:SCOPE_TYPE-->`, `PHASE_RECEIPTS:v1` + `COVERAGE_POLICY:v1`, `Structural Owner`/`Owning Spec` в META, не-hyphen анкоры | `fixture-detmig` (детерминированно, без LLM) | `sdd-task` принимает каждый мигрированный тикет; `sdd-state` печатает `SCOPE_TYPE`; `sdd-extract` вытаскивает все анкоры; `sdd-check --all` больше не даёт `SDD_VERIFICATION_TABLE_INVALID` | 0 | M |
| **E-07** | G4 | `E-G4-migration-executable` — третий бар в `migration-grade.ts`: добавить `SDD_VERIFICATION_TABLE_INVALID` (+ проверки `SCOPE_TYPE`/`PHASE_RECEIPTS:v1`) в `MIGRATION_CRITICAL_CODES` — расширение существующего baseline-diff, не новый механизм; заодно поправить докблок `:79` | `fixture-mig-run` | both-way юнит на замороженных выводах; **идёт первым, до E-06** (L-15, red-first — см. сноску Lead) | 0 | S (было M — размер снижен по факту: бар не требует новой проверки `sdd-task`/`sdd-state`, только расширения списка кодов) |
| **E-08** | G4 | Прогон миграции на снапшоте, дающем **новую** информацию — не `fixture-detmig` в текущем виде (та же база, что `fixture-mig-run`, см. §3, G4). Реализуется как первая часть E-14 либо как отдельный третий снапшот по решению §5, Q2 | зависит от Q2 | `MIGRATION` grade pass И executable-бар pass; 2 pass | ≈ 430 k ×2 (медиана §1.8) | M |
| **E-09** | G3 | **Первый живой прогон, где R-COMPLETE даёт pass.** Сегодня в леджере ноль таких (`fc2-baseline`: все четыре completion-сигнала `false`) | `slugify-toolchain` (`--max-observations 30`) | R-COMPLETE pass; R1 чист; нет `SDD_GROUP_*_MISSING` (см. D-4 в §4.0 — действует только на фикстурах с `PHASE_RECEIPTS:v1`); 2 pass | 60–150 k ×2 (экстраполяция) | M |
| **E-10** | G1 | `E-G1-swift-verify` — детерминированная приёмка контракта `gennady.yaml` (§3, G1) | `fixture-detmig` | 5 пунктов приёмки; **зависит от V-07 и от E-16** (фикстура должна быть чистой для пунктов №3/№5) | 0 | S–M |
| **E-11** | G1 | Фикстура `golang-slugify` в `provision.ts` `FIXTURE_FILES` + `golden/verify.sh` (go build/test) | новая | `fixture-coverage.test.ts`-аналог для go (никаких glob-токенов в §5); golden both-way | 0 | M |
| **E-12** | G1 | `E-G1-go-execute` — детерминированный (`sdd-state STACK`, `sdd-task` pickable, `sdd-verify` receipt, `sdd-check` чист) | `golang-slugify` | 4 пункта both-way; **зависит от V-04/V-05/V-06** | 0 | M |
| **E-13** *(переклассифицирована в **диагностику** — 06 §5.2 п.41 + **D-45**; не бар приёмки)* | G1 | `E-G1-llm-go` — единственный LLM-сценарий группы: execute на go-фикстуре. **Из исполнителей `A3` удалена** (следствие D-28/L-14: детерминированные гейты — бар, судья — диагностика); **бар G1 = `E-12` (go) + `E-18` (swift)** | `golang-slugify` | golden exit 0 И R-COMPLETE pass; 2 pass — **как диагностика, вердикт судьи не влияет на агрегированный exit-код** | 30–60 k ×2 (экстраполяция) | M |
| **E-14** | G4 | Самомиграция `gennady` (12 скоупов, 127 v1-тикетов) — **обязательный** таск по решению D-3 (§4.0), не опция | снапшот `main` | `MIGRATION` grade + executable-бар; масштабный тест мигратора; **закрывает E-08** одновременно | оценка широким интервалом: множитель ×3–5 от cloud-ios произволен, честнее ×10 по входу (12 скоупов/127 тикетов против 1/7) → порядок 2–8 M, оговорка обязательна | L |
| **E-15** | роутер | Детерминированный лок маршрутизации на парсере `ai/inspector/core` (v1-раскладка → `migration-v1-v2.directive.xml`; наличие `go.mod` → go-ветка readiness) | директивы как есть | both-way; закрывает поверхность №1 из §1.10 дешёвым способом | 0 | S–M |
| **E-22** *(новая — 06 §5.1 п.21; приёмка переформулирована по **D-39**)* | приёмка, слой A | **Frozen golden-v1 фикстура** (копия v1-корпуса, снимается **до** удаления `tasks/` задачей `E-20`) + ожидаемые codes/severity/exit. Бар — **«новый RC не вводит новых ошибок относительно baseline `GAP-B-1`»**. Прежняя формулировка «не повышает v1-lenient finding до error без явно утверждённого правила» **снята вместе с отменённой `B2-21`** (мягкого режима для v1/mixed нет) | новая frozen-фикстура `golden-v1/**` | прогон на frozen golden-v1 не даёт error, отсутствующих в baseline `GAP-B-1`; ожидаемые codes/severity/exit зафиксированы | 0 | M — Волна 4; зависит от **`GAP-B-1`**, `REL-17`, `E-16`; предпосылка **`E-20`** и **`B2-20`**; критерии **A18/A13/A1** |
| **E-23** *(новая — 06 §5.1 п.22)* | приёмка, слой D | **Adversarial-корпус**: коллизии id, неоднозначные legacy-ссылки, malformed coverage rows, inactive tests, stale receipts. Бар — **«fail closed или явный `unknown`»**; ни один negative case не даёт false closure | новый adversarial-корпус фикстур | каждый adversarial-кейс даёт fail **или** явный `unknown` | 0 | M — Волна 4; зависит от `E-16`, **`B2-22`**; критерии **A18/A19** |
| **GAP-E-1** *(новая — 06 §5.1 п.23; H-15, H-16)* | харнесс | Подключить `readEvents` в живом прогоне **либо** убрать события из evidence и доков (мёртв именно event-канал; две эвристики `waiting` живут без событий, `observer.ts:144-152`); валидировать `phase`/`mode` в `loadScenarios` (`cli.ts:133-150`) **fail-fast, а не через fallback** | `ai/flow-eval/**`: `observer.ts:144-152`, `cli.ts:133-150`, `prompts.ts:76,87` | «опечатка в `phase` → exit≠0 с сообщением»; «опечатка в `mode` → exit≠0, а **не** другой валидный промпт» | 0 | S — Волна 0; критерий **A21** |
| **GAP-E-2** *(новая — 06 §5.1 п.24; **SHOULD, не MUST**)* | харнесс | Таблица бюджетов по фазам (`task` 6 · `execute`/`repair`/`scaffold`/`spec-authoring` 30 · `migration`/round-trip 40–60) и цепочные прогоны RUNBOOK. **Понижена до SHOULD верификацией V-06-GAP:** посылка «результат прогона недоставаем» опровергнута — артефакты переживают teardown, `.results/` описан в трёх доках; дешёвый MUST-остаток перенесён в `GAP-E-5` | `ai/flow-eval/docs/RUNBOOK*`, `scenarios.json` | таблица сверена с фактическими лимитами раннера | 0 | S — Волна 0 (**SHOULD**); зависит от `GAP-E-5` (единый корпус доков) |
| **GAP-E-3** *(снята — **ПОГЛОЩЕНА `GAP-E-5`** по **D-46**)* | доки харнесса | Привести доки к коду: `MIGRATION` grade, докблок `migration-grade.ts:79`, обещания `types.ts:38-39,68-69`, политики-детекторы наблюдателя (`observer.ts:36-63`), развести на `observer.ts:155` зависание от нарушения политики, лимиты evidence (`evidence.ts:38-42`); `--keep`/teardown (`cli.ts:184-189`, `:211-215`); печать `.results/run-<ISO>/summary.json` | — | — | — | **ПОГЛОЩЕНА `GAP-E-5`**: задача целиком документная, а `D-46` заменяет весь корпус доков единой спекой. Формулировки `--keep`/бюджет/`.results` для приёмок `E-10`/`E-12`/`E-14`/`E-18` живут теперь в `GAP-E-5`. Строка сохранена для трассируемости |
| **GAP-E-4** *(новая — 06 §5.1 п.26)* | инфра эвалов | Воспроизводимость раннеров: сценарий миграции живёт **JSON-файлом в репозитории** и становится дефолтом `migration-eval.sh:16`; убрать **все три** литерала `migration-eval.sh` (`:13` `GEN_ROOT` на несуществующий воркtree — из него выводятся `:22`/`:23`; `:16` `SCENARIO`; `:21` `FX` без env-override) и литералы `session-metrics.py:19-21`; те же дефолты проверить в `roundtrip-eval.sh`; `require-developer-repo.test.sh` включить в гейт (`TEST_FILE = /\.test\.ts$/` в `scripts/test-topology.ts:19` шелл-тест не подхватывает). **`fixture` вместе с `directory` в одном сценарии запрещено** | `scripts/{migration-eval.sh,roundtrip-eval.sh,session-metrics.py}`, `scripts/test-topology.ts:19`, новый scenario-JSON | раннер стартует из чистого клона репозитория **без env-переменных**; шелл-тест виден гейту | 0 | S — Волна 0; **предпосылка `E-14` и `E-16`**; критерий **A21** |
| **GAP-E-5** *(новая — **D-46**; владелец трека 50)* | доки харнесса | **Единая eval-спека.** Черновик `_raw/research/R4b-EVAL-SPEC-draft.md` (часть A — человек, часть B — агент) принимается как целевой формат и **заменяет** `ai/flow-eval/docs/AGENT-BRIEF.ru.md`; корпус доков сокращается **19 → README + спека + RUNBOOK + ledger**; вводится **единый словарь правил качества** (`R1`, `MIGRATION`, `R-COMPLETE`) вместо трёх. **Поглощает `GAP-E-3`** целиком | `ai/flow-eval/docs/**` (удаление 15 доков, `AGENT-BRIEF.ru.md` → спека), `README.md`, `RUNBOOK`, ledger | **скрипт-верификатор**: каждая команда и каждый путь в спеке проверены, счётчик `[UNVERIFIED]` = **0**; `README` линкует **все** оставшиеся доки (висячих и несвязанных нет) | 0 | M — Волна 0; критерий **A21**; несёт формулировки `--keep`/бюджет/`.results` для приёмок `E-10`/`E-12`/`E-14`/`E-18` |
| **E-16** | инфра эвалов | **Новое.** Привести `fixture-detmig` и `rt-regen` в воспроизводимое состояние: закоммитить или сбросить 14 незакоммиченных изменений `fixture-detmig`, зафиксировать base-SHA в переменной (`EVAL_FIXTURES_ROOT`), задокументировать, что дерево должно быть чистым для tree-guard. Без этого E-06/E-08/E-10 не воспроизводимы, а E-10 пункты №3/№5 не запустятся вовсе (`DIRTY_TREE`) | `fixture-detmig`, `rt-regen` | фикстуры проходят `git status --porcelain` пусто; `sdd-state`/`verify` не падают на `DIRTY_TREE` | 0 | S |

**Порядок и критический путь.** E-00 → E-01 → E-02 → **E-03 (re-baseline — обязателен до любых выводов)** → **E-16 (привести фикстуры в воспроизводимое состояние — обязателен до E-06/E-08/E-10)**. Дальше независимые ветки:
- G2: E-04 (сразу, ни от чего не зависит);
- G4: E-16 → **E-07 → E-06** (порядок по L-15: сначала бар red-first, затем полнота мигратора — см. сноску Lead выше) → E-14 (обязателен, закрывает и E-08);
- G3: E-05 (независимо) и E-09 (после E-02/E-03);
- G1: E-16 → E-10 (после V-07) → E-11 → E-12 (после V-04/V-05/V-06) → E-13. **Вся ветка G1 упирается в порт VERIFY** и раньше него даёт только E-10 частично.
- E-15 — в любой момент, дешёвый.
- Пропуски из §3.2 (python/swift-фикстуры, rules-cascade LLM-точки G1, LLM-точка G2, `v1-consumer`/`linked-checkout`/`stale-package-file`/`deployed-surface` в E-04, три сценария B2 G3-3/G3-4/G3-6, два миграционных кейса B2) внесены как долг — не в критический путь этой ревизии, но должны быть либо запланированы отдельными тасками, либо явно приняты как исключённые оператором.

**Дополнение порядка после гейта адекватности (06 §5.1/§5.2 + D-38..D-46):**

- **Волна −1 (до всего остального):** `REL-17` (тег `rc-baseline-1` на `227c03a8`) + **`GAP-B-1`** (версионированный baseline находок + zero-new-error). Без них у `E-22` нет точки отсчёта, а у `A1`/`A13` — бара.
- **Волна 0 этого трека дополняется:** `GAP-E-5` (единая eval-спека, **D-46**) → `GAP-E-2` (таблица бюджетов, SHOULD, пишется в тот же корпус); `GAP-E-1` (fail-fast на опечатку `phase`/`mode`; события подключены либо убраны); **`GAP-E-4`** — идёт **до** `E-16` и `E-14`, потому что несёт три мёртвых дефолта `migration-eval.sh` и литералы `session-metrics.py:19-21`.
- **`E-16` сужена** (06 §5.2 п.39): параметризация `EVAL_FIXTURES_ROOT` уже есть; мёртвые дефолты переданы `GAP-E-4`, ребро `E-16 → GAP-E-4` проставлено.
- **`E-14` += `GAP-E-4`, `FO-6`** (воспроизводимый раннер + шаг переписывания шапок `@tasks` → `@spec` по **D-40**).
- **`E-07` += `GAP-B-1`** вместо отменённой `B2-21` (**D-39**): мягкого режима для v1/mixed нет, совместимость — только через мигратора. Порядок `E-07 → E-06` по **L-15** сохраняется (сноска Lead выше в силе).
- **`E-20` += `E-22`** (06 §5.2 п.38): frozen-копия v1-корпуса снимается **до** удаления `tasks/`, иначе слой A приёмки теряет исходный корпус безвозвратно. Формулировка X-9: **v1 удаляется как инструментарий, корпус данных сохраняется как миграционный вход**.
- **`E-10`/`E-12`/`E-18` — в приёмку** (06 §5.2 п.40): `--keep` (там, где нужен прогон инструментов по дереву песочницы), бюджет по таблице `GAP-E-2`, чтение `.results/run-<ISO>/summary.json` как источника результата; сами формулировки живут в **`GAP-E-5`**.
- **Волна 4 дополняется:** `E-22` (слой A) и `E-23` (слой D) — вместе с уже стоявшими `E-17`/`E-18`/`E-19` они закрывают четырёхслойную приёмку `A18`.
- **`E-13` — диагностика, не бар** (**D-45**): из исполнителей `A3` удалена; бар G1 = `E-12` + `E-18`. `V-10` (python) вне релиза по **D-44**, поэтому детерминированного аналога `E-12` для python в плане нет и не требуется.

**Правка после триажа #14 (D-48/D-49), новый трек `V14`:** **`V14-3`** (Волна 4, поверх `E-23`, S) — раздел «инъекция → ожидаемый исход» в `GAP-E-5` + both-way причинный кейс (`injection-golden.test.ts`); закрывает **A21**. **`V14-2d`** (пост-релиз, после `2.0.0-draft`) — правка `prompts.ts:74` (разделить operator decision и agent-owned `pending-operator`) + один сценарий с детерминированной инъекцией дыры в спеке; зависит от `V14-3`, `GAP-E-1`, `GAP-E-5`; критерий **A24** (см. `61-TASK-BOARD.md` §1, трек `V14`).

### 4.2 Регрессии: что гонять до и после каждой задачи переноса

Общая шина (0 токенов, ~35 с) — **перед и после каждой** задачи B1 V-01…V-16:

```
node --import tsx --test <root>/ai/flow-eval/__tests__/*.test.ts     # ожидание: 90/90 (или больше)
npm run test:topology                                                # числа печатаются прогоном, в коде их нет
npm run check                                                        # sdd-verify --profile full
npm run check:directives-fresh && npm run check:directive-budgets && npm run audit:axioms
```

*Правка V-61b:* `scripts/test-topology.ts` **не хранит** ожидаемых количеств тестов — `check` их печатает (`unit=… contract=… local=… external=…`), классификация вычисляется из дерева, а `assertTopology()` проверяет дизъюнктность и полноту, а не числа. Поэтому «ожидание `unit=211`» сравнивать не с чем: **число берётся из фактического прогона и фиксируется в отчёте**, красным считается только исключение классификации (`unclassified`/`overlap`) на новом тест-файле. Прежние числа `unit=211 contract=16 local=51 external=8` (§2.1) — это **измерение** на `227c03a8`, а не хранимое ожидание. Отсутствие владельца у этих чисел — предмет `GAP-2`.

Точечные LLM-регрессии — только там, где задача меняет **текст, который читает агент**, или **ладдер, который он вызывает**:

| Задача переноса (B1) | Что она ломает | Регрессия ПОСЛЕ |
|---|---|---|
| V-01…V-03 (parity, типы `Gate`) | ничего в тексте | только детерминированная шина |
| V-04 (`resolvePreset` + node-пресет) | строки команд ладдера | детерминированная шина + **E-03** (execute на `slugify-toolchain`, 1 прогон): receipt по-прежнему валиден |
| V-05 (детект стека) | `sdd-state`/`sdd-task`/`sdd-verify` видят стек | детерминированная шина; E-10 |
| V-06 ⚑dir (readiness-движок + текст `readiness.directive.hbs`) | **текст директивы** | E-03 + **greenfield execute класса chain10b** (полная цепочка authoring→scaffold→execute вручную/`operator-approve.sh`); плюс снять шим из `rt-regen` и перепрогнать round-trip |
| V-07 (`gennady.yaml`) | конфиг-контракт | E-10 |
| V-08 (anystack в фазовой модели) | ладдер на не-node репо | E-10 + round-trip **без шима** |
| V-09/V-10/V-11 (go/python/swift пресеты) | ладдер по стеку | E-12/E-13 для go; для python/swift — детерминированный аналог E-12 (пока не запланирован, см. §3.2) |
| V-12/V-13/V-14 (issues #9-bonus/#20/#17) | вывод и сужение гейтов | детерминированная шина; receipt не меняется (инвариант И-2 из B1) |
| V-15 ⚑dir ⚑spec (директивы, `.hbs`, cascade) | **весь текст флоу** | обязательно: `check:directives-fresh` + **greenfield chain10b** + E-09 (R-COMPLETE) + E-08/E-14 (миграция). Это единственная задача, после которой нужен полный набор LLM-прогонов |
| V-16 (фасады `verify`/`fix`) | поверхность CLI | детерминированная шина |

**Отдельно:** после **любого** изменения в `ai/directives/sdd-v2/**` или `ai/kit/templates/sdd-v2/**` прогон greenfield-execute обязателен, потому что заявление PROGRESS-REPORT «полный greenfield проходит end-to-end (chain10b)» получено на сборке 4 сентября — до `4bb00f4b` (STEP_6/STEP_7) и до новых команд `sdd-log`. Регрессионного прогона с тех пор **не было**, а H-10 означает, что и round-trip-прогоны шли на неизвестном dist. Это первая дыра, которую закрывает E-03.

### 4.3 Что осталось решить оператору

Три пункта из исходного списка «что должен решить оператор» уже закрыты решениями D-3/D-4 и ограничением моделей (§4.0) — сюда они не дублируются. Оставшиеся два пункта развёрнуты как вопросы в §5:
- потолки стоимости в токенах (`total` на прогон и `cacheRead`, сегодня до 30,5 M и не бюджетируется вовсе) — см. §5, обсуждается вместе с Q2/Q4;
- какие реальные репозитории можно снапшотить сверх обязательной самомиграции `gennady` (messenger?) и правило хранения фикстур (`~/.gennady/eval/cloud-ios/*` вне git, `Tools/Artifactory/.netrc` в дереве) — см. §5, Q2/Q3.

Отдельно, вопрос модели владения при `sync` (нужен для E-04) **не дублируется здесь как отдельный вопрос** — это открытый вопрос B3, раздел D-1; в этом документе он только упомянут как зависимость E-04 (§3, G2).

---

## 5. Вопросы оператору

### Q1. Чем считается «PASS» эвала после этой ревизии?

Факт: 14/14 сохранённых прогонов имеют вердикт судьи `fail`; 13 из них — по исчерпанию бюджета наблюдений (`runner.ts:91-105` → `stuck` → `judge.ts:18`). При этом `MIGRATION` grade дал PASS трижды.

- **(a) Детерминированный гейт — единственный бар; вердикт судьи печатается как диагностика и в приёмке не участвует.** Требует E-00 (агрегированный exit-код по гейтам, а не по судье). — *рекомендация*
- (b) Судья остаётся баром, но исчерпание бюджета переводится в отдельный исход `budget-exhausted` (не `fail`), и прогоны с ним не считаются в статистике. *(Не исключает (a) — оба решения совместимы: даже приняв (a), стоит отдельно завести исход `budget-exhausted`, чтобы диагностика судьи не тонула в шуме от бюджета.)*
- (c) Двойной бар: pass только если И гейт, И судья — тогда надо принять, что почти все длинные сценарии будут fail.
- (d) Оставить как есть, читать rationale руками.

### Q2. Сколько снапшотов реальных репозиториев берём в G4 сверх обязательной самомиграции `gennady` (D-3)?

Факт: самомиграция `gennady` (12 скоупов, 127 v1-тикетов) уже решена как обязательный шаг плана (D-3, §4.0) — это не опция, а данность. `fixture-detmig` **не даёт** второй точки истории cloud-ios: её HEAD (`9c04a878b0`) совпадает с `BASE` у `migration-eval.sh:15`, на котором уже строится `fixture-mig-run`. Цена одного миграционного прогона 196–831 k total; самомиграция `gennady` на порядок дороже.

- **(a) Только обязательная самомиграция `gennady` + существующий `fixture-mig-run`.** Не добавлять новый снапшот cloud-ios, поскольку `fixture-detmig` не даёт новой информации в текущем виде. — *рекомендация как минимум*
- (b) + реально другая точка истории cloud-ios (новый снапшот, отличный от `9c04a878b0`) — закрывает «две разные истории одного репозитория», которую `fixture-detmig` не закрывает сегодня.
- (c) + messenger — другой домен, другой автор спек; нужен также треку B4 (T-7), стоит рассмотреть совместно.
- (d) (b) + (c) — самый полный набор, самый дорогой.

### Q3. Где хранить фикстуры реальных репозиториев?

Факт: `~/.gennady/eval/cloud-ios/*` — вне git-репозитория проекта, на одном хосте; `session-metrics.py:19-21`, `migration-eval.sh:12-13,21`, `roundtrip-eval.sh:19-21,27` зашиты абсолютными путями; в дереве `fixture-detmig` присутствует файл `Tools/Artifactory/.netrc` (имя, характерное для учётных данных); фикстуры сегодня не воспроизводимы из SHA (см. §3, G4 — `fixture-detmig` грязная).

- **(a) Оставить вне репозитория, но параметризовать все скрипты (`EVAL_FIXTURES_ROOT`), добавить в приёмку эвала проверку «фикстура не содержит файлов класса секретов» и требование «фикстура воспроизводима из SHA» (закрывается таском E-16).** — *рекомендация*
- (b) Свести фикстуры в отдельный приватный git-репозиторий с явным манифестом того, что вырезано.
- (c) Держать только сгенерированные синтетические аналоги реальных репозиториев (дешевле и безопаснее, но теряется главная ценность G4 — реальность).

### Q4. Судья: одна модель на воркера и судью — или разделить?

Факт: и воркер, и судья — `llm-proxy/deepseek-v4-flash`; `runner.ts:55-60` явно допускает совпадение моделей («Same model is allowed…»). Стохастичность судьи задокументирована (ложные fail на chain6/10b). Отдельно зафиксировано операторское ограничение (§4.0): разрешены только модели семейства `llm-proxy/*` — любой выбор ниже должен оставаться внутри этого семейства.

- **(a) Оставить одну дешёвую модель, но понизить роль судьи до диагностики (следствие Q1a).** — *рекомендация*
- (b) Судья — более сильная модель из `llm-proxy`; тогда нужен потолок стоимости отдельно на судью.
- (c) Убрать судью совсем из приёмки и оставить только персист rationale (судья как «объяснитель», а не «оценщик»). *(По существу совпадает с Q1(a) — если пройдёт (a) там, (c) здесь становится естественным следствием, а не отдельным решением.)*
- (d) Калибровать судью на замороженном наборе rationale (отложенная задача из PROGRESS-REPORT) — самый дорогой путь.

### Q5. Порядок «полнота мигратора» ↔ «бар исполнимости»?

Факт: грейд сегодня даёт PASS при неисполнимом мигрированном репозитории (2-колоночные §5 → `SDD_VERIFICATION_TABLE_INVALID` ×7, `SCOPE-TYPE` вместо секции, нет `PHASE_RECEIPTS:v1`). После правки диагноза (§3, G4; §4.1, E-07) сам бар — это добавление кодов в `MIGRATION_CRITICAL_CODES`, т.е. задача размера S, а не M.

- **(a) Сначала E-06 (полнота мигратора), потом E-07 (бар) — бар вводится уже зелёным.** — *рекомендация*
- (b) Сначала E-07 (бар как RED-first), потом E-06 — тогда есть механическое доказательство дефекта до фикса (дисциплина «red-first», применённая в `session-metrics.py gate`). *Поскольку бар теперь дешёвый (S, не M), этот вариант стал почти бесплатным — рекомендация (a) не так однозначна, как выглядела раньше.*
- (c) Одной задачей.

---

## 6. Итог верификации

**Что проверялось.** Независимая верификация (V-B7, свежие глаза, read-only) перепроверила ~70 цитат `file:line` из §1–§4 по коду RC-scratch/RC-live, воспроизвела ключевые прогоны (юнит-сюиты, `test:topology`, `sdd-check --all` на `fixture-detmig`, регексп `parseVerdict`), сверила покрытие G1–G4 с планами B1–B4 независимо построенной таблицей и проверила состав `.results/**`/`metrics-ledger.jsonl` напрямую.

**Счёт по цитатам:** 58 подтверждено (дословно или с точным совпадением по существу), 9 сдвинуто на 1–9 строк (факт верен, номер строки исправлен в тексте выше), 3 опровергнуты по существу, 6 числовых обсчётов исправлено.

**Счёт по существу:**

| Проверка | Результат |
|---|---|
| Число сохранённых прогонов | было 13, на деле **14** (`ls -d .results/run-*`); пересчитаны «14/14 fail», «13/14 running» во всех местах §1.8/§2/§4/Q1 |
| «`npm run check` не гоняет flow-eval-suite» | **опровергнуто**: 68/90 кейсов сидят в коммит-гейте через `npm test` (`test-topology.ts`, `TEST_ROOTS` включает `ai`); оценка CI пересмотрена с D на **C−** |
| `harness.test.ts` — размер | было 29 кейсов (унаследовано из A2 §6.7 без проверки), на деле **22** (`# tests 22 # pass 21 # fail 1`) |
| `fixture-detmig` — природа | описывалась как v1-раскладка на диске; на деле HEAD — v1, но **дерево грязное и уже мигрировано** (14 незакоммиченных изменений) |
| `fixture-detmig` — «вторая точка истории» | **опровергнуто**: HEAD фикстуры (`9c04a878b0`) = `BASE` в `migration-eval.sh:15`, та же точка, что уже использует `fixture-mig-run`; E-08 в исходном виде не давал новой информации |
| Диагноз H-13/E-01 | R1 читает реальный вывод корректно; ломается только на строке «0 error(s), N warning(s)», т.к. `✅ clean` печатается лишь при нуле находок (`sdd-check.types.ts:148-151` vs `:164`) — фикс на порядок дешевле изначальной оценки |
| «`sdd-check` молчит про 2-колоночные §5» | **опровергнуто**: 7 × `error: SDD_VERIFICATION_TABLE_INVALID` на реальном прогоне — упрощает E-07 (S вместо M) |
| E-14 (самомиграция `gennady`) | было «опционально»; на деле уже принятое решение оператора (D-3) — переведено в обязательный таск |
| Покрытие G1–G4 vs B1–B4 | добавлены три пропущенные задачи B1 в колонку G1 (V-01/V-03/V-15); зафиксированы 4 пропуска B2 (G3-3/G3-4/G3-6 + 2 миграционных кейса), 4 пропуска B3 (включая релиз-блокер `v1-consumer`), прямое расхождение с B4 по двум LLM-точкам (rules-cascade в G1, владение правилом в G2) и отсутствие python/swift-фикстур |
| Реестр рисков H-1…H-14 | подтверждён как не преувеличенный («~половина провалов» — цитата A3b, не фигура речи); H-14 переписан из «могут разойтись» в «уже разошлись» (два конкретных расхождения найдены) |
| Воспроизводимость | все прогоны этой сессии (юнит-сюиты RC-scratch/RC-live, `test:topology`, регексп `parseVerdict`, `sdd-check --all` на `fixture-detmig`) воспроизведены независимо и совпали до цифры/символа с прогонами аналитика |

**Итоговый вывод не изменился по направлению, но изменился по цене задач.** Харнесс остаётся зрелым на детерминированном слое (A−/A−) и незрелым на слое судьи (C, 14/14 fail); дисциплина «детерминированный гейт — единственный бар, судья — диагностика» подтверждена как единственно рабочая. Три вещи план менял по существу: (1) `E-01`/`E-07` оказались дешевле (S вместо предполагавшегося сбора реальных выводов и нового механизма) — оба дефекта чинятся точечно поверх уже работающих механизмов; (2) `E-08` в исходной форме не давал новой информации и должен быть либо слит с обязательной самомиграцией `gennady` (E-14), либо получить настоящий второй снапшот; (3) объём непокрытого по сверке с B1–B4 оказался больше, чем показывал сам B7 — добавлены явные пропуски (§3.2) и таск-предшественник E-16 (привести грязные фикстуры в воспроизводимое состояние), без которого часть приёмки G1/G4 не запускается вовсе.

Документ ждёт решений оператора по Q1–Q5 (§5); после их принятия упорядоченный список §4.1 (E-00…E-16) может быть напрямую превращён в тикеты `sdd-scaffold`.
