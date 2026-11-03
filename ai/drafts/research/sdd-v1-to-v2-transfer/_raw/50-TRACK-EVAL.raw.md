# Часть I — B7-eval-track (аналитик)

# B7 — трек EVAL: зрелость и покрытие flow-eval-харнесса, минимальные эвалы под план переноса

**Источники фактов.** Два чекаута ветки `codex/sdd-v2-rc52-followup`:

| Обозначение | Путь | HEAD |
|---|---|---|
| **RC-scratch** | `…/scratchpad/rc-v6` | `11291af5` (без `dist/`, `?? .npm-ci-done`) |
| **RC-live** | `/Users/k.lebedev/Developer/gennady/.claude/worktrees/sdd-v2-rc52-followup` | `3d5f66a7`, дерево **чистое**, `dist/gennady.js` собран, есть `ai/flow-eval/.results/**` (13 прогонов + `metrics-ledger.jsonl`) |

Все `file:line` ниже — по **RC-live** (`3d5f66a7`), если не указано иное. Фикстуры: `/Users/k.lebedev/.gennady/eval/cloud-ios/{fixture-detmig, fixture-mig-run, rt-regen, bench-smoke}` (read-only).
Прочитано до начала: A2 §6, A3b §3.1–3.4/§6, A4 «Сводная таблица», B1 §6.

---

## 1. Анатомия харнесса (факты)

### 1.1 Что такое «сценарий»

`SddEvalScenario` — `ai/flow-eval/types.ts:5-27`: `id` (`:7`), `intent` (`:9`), `phase` (`:15`), `mode` (`:17`), опциональные `fixture`, `directory`, `scale` (`:19`), `acceptance` (`:21`) и — с `95329c19` — `completion?: { artifact; ticket; spec }` (`:26`). Всё остальное (модель, бюджет наблюдений, concurrency) — флаги CLI, не поле сценария.

Референсный файл `ai/flow-eval/scenarios.json` — **7 сценариев** (58 строк): `fibonacci-library` (`spec-authoring`/`full-spec-to-approval-1`/`scale: function`), `tic-tac-toe` (`scaffold`/`actual-tickets-to-approval-2`), `slugify-toolchain` (`execute`/`canonical-execute`, **без `acceptance`**), `broken-specs-repair` (`repair`/`fix-to-clean`), `infra-log-summary` · `infra-rotate-logs` · `infra-makefile` (`task`/`brief-to-artifact`).

**Тип-пространство больше файла сценариев.** `types.ts:29-40` — 7 фаз; `:42-71` — 11 режимов; `:73-…` — 14 `SddEvalFixtureId`; `provision.ts` поставляет все 14 `FIXTURE_FILES`. `scenarios.json` задействует **5 фаз / 5 режимов / 7 фикстур**. Не покрыты референсным файлом: фазы `brownfield`, `migration`; режимы `modify-code-delta`, `fix-code-delta`, `recover-spec`, `delta-to-spec`, `modify-via-spec`, `v1-to-v2`; 7 brownfield-фикстур. Они существуют, детерминированно протестированы golden'ом, но **ни один LLM-сценарий их не гоняет из референса** — только вручную или через `scripts/migration-eval.sh` / `scripts/roundtrip-eval.sh`, которые генерируют сценарий на лету (`roundtrip-eval.sh:79-100` `write_scenario()`).

### 1.2 Фазы, режимы, промпты

`ai/flow-eval/prompts.ts:7-36` — `PHASE_PROMPTS` по 7 фазам; `:41-51` — `BROWNFIELD_MODE_PROMPTS` (mode ветвит только внутри `brownfield`; для остальных фаз `mode` в промпт попадает лишь строкой `Selected phase: …; selected mode: …`, `:61`). `:66-73` — `headlessOperator`-контракт (запрет интерактивных вопросов, запрет `--help`/`--version`/`redirect`/чтения `node_modules/gennady`, запрет самоодобрения границы). `composeSddPhasePrompt` требует `directory` (`:60`) и заворачивает всё в `appendSddSessionBoundary` (`shared/sdd/session-boundary.ts`).

### 1.3 Как исполняется прогон (и главный структурный факт)

`cli.ts` → `provisionScenarioDirectories` → `SddEvalRunner.runAll` (батчи по `concurrency`, `runner.ts:154-167`) → на сценарий одна OpenCode-сессия (`runner.ts:66-70`) → `SddEvalObserver.collect` (`runner.ts:82-89`) → `judge.evaluate` (`runner.ts:137-151`).

Дефолты кода — `runner.ts:25-34`: `baseUrl http://localhost:4096`, worker `openai/gpt-5.6-luna`, judge `openai/gpt-5.6-sol`, `concurrency 3`, `observeEveryMs 300 000`, `stuckAfter 1`, `maxObservations 6`, `tailLimit 20`. Реально гоняли `llm-proxy/deepseek-v4-flash` для обеих ролей (README «Defaults (code) vs what we run»).

**Исчерпание бюджета наблюдений = провал по построению.** `runner.ts:90-101`: если наблюдений набралось `>= maxObservations`, а статус не `completed`/`error` и `stuck` не выставлен — раннер сам зовёт `abort`, помечает последнее наблюдение `stuck: true` и добавляет ошибку `'observation budget exceeded'`. Это `state` уходит судье (`runner.ts:141-147`), а рубрика судьи (`judge.ts:18`) прямо говорит: «A stuck or unfinished worker … is a failure». **Следствие:** на длинных реальных сценариях (migration, round-trip) вердикт судьи детерминирован бюджетом, а не качеством. Подтверждение — §1.8.

### 1.4 Контракт судьи и его слабости

`judge.ts:12-28` `composeJudgePrompt` посылает ровно: инструкцию про первую строку + рубрику (`:18`), `INTENT`, `ACCEPTANCE` (если есть), `STATE` (`{status, stuck, waiting, errors}`), `DIFF`, `EVENTS`, `BOUNDED_TAIL`. Никогда — промпт воркера, полный транскрипт, внутренности раннера. Судья — отдельная сессия (`judge.ts:48-73`), модель отдельным флагом.

`parseVerdict` (`judge.ts:38-45`): регексп `/^\s*(?:[*_`]{0,2})?(?:(?:verdict|вердикт)\s*[:：]\s*)?(pass|fail|inconclusive)\b/m`; нет строки — `inconclusive`, никогда не догадка по прозе.

Известные слабости (факты, не мнения):
1. **Префикс `VERDICT:` опционален** в регекспе, а флаг `/m` даёт совпадение по **любой** строке. Первое совпадение по всему тексту побеждает → рационале, начавшееся с абзаца «Fail conditions were…» или «Pass rate…» без первой строки-вердикта, будет прочитано как вердикт. Класс дефекта тот же, что у убитого fallback `/ошиб|fail/`, только уже.
2. **Рубрика не проверяет завершённость по SDD**: в ней нет `DONE`, нет `audit`, нет receipt'ов (`judge.ts:18` — полный текст рубрики). Именно это H1 из `docs/flow-verification-redesign.md`; закрыто механически (R-COMPLETE), не в рубрике.
3. **Вердикт печатается только от судьи.** `cli.ts:234`: `const verdict = result.judge?.verdict ?? 'worker-error'`. Детерминированные правила ложатся в поле `quality` артефакта (`cli.ts:259, 263, 271`) и печатаются отдельной строкой, но **не сливаются в вердикт**.
4. **Прогон не имеет агрегированного кода возврата.** `process.exitCode = 1` в `cli.ts` только в `main().catch` (`cli.ts:307`). Батч, где все сценарии `fail`, завершается кодом 0. Гейтить CI по `sdd-flow-eval` сегодня нечем.
5. Стохастичность подтверждена документами и транскриптами (A3b §6): ложный fail на `scaffold` chain6/10b при чистой механике; осцилляция pass/fail из-за неполной симуляции approval (лечилось `operator-approve.sh`).

### 1.5 Детерминированные гейты — что есть на HEAD

| Гейт | Где | Бар | Как включается |
|---|---|---|---|
| **R1** (структурная целостность) | `quality-gate.ts:28-35` (`parseSddCheckResult`, чистая), `:42-59` (`checkR1Structure` — запускает `node_modules/.bin/gennady sdd-check --all .` в песочнице) | `clean` → pass; `N error(s)` → fail с числом; иначе → **fail** `'no sdd-check verdict parsed'` | автоматически для фаз, что «производят спеки»: `cli.ts:240-249` — не `task`, и для `brownfield` только spec-режимы |
| **MIGRATION** | `migration-grade.ts` (`computeMigrationGrade:84-…`), вызов `cli.ts:250-261` | `pass = flowV2 && criticalIntroduced.length === 0` (`:97`); `MIGRATION_CRITICAL_CODES = {SDD_BROKEN_SPEC_REF, SDD_BROKEN_SPEC_ANCHOR, ERR_CLI_SDD_CHECK_READ_FAILED}` (`:31-36`); остальной рост находок → `backlog` (`:103`), не провал. Baseline снимается `captureBaseline` до воркера (`cli.ts:199-201`) | автоматически при `phase === 'migration'` |
| **R-COMPLETE** (новое, `95329c19`) | `quality-gate.ts:63-84` (`CompletionSignals`), `:86-103` (`parseCompletion`, чистая), `:114-128` (`CompletionTargets`), `:130-143` (`checkCompletion` — читает файлы с диска); вызов `cli.ts:266-274` | нет артефакта → fail `'declared artifact was not produced'`; артефакт есть, но нет `**Status:** [x]`, закрытого раунда `- [x] \`…\` DONE` внутри `<!--SECTION:EXECUTION_LOG-->`, `SDD_AUDIT_RECEIPT` или `SDD_REVIEW_RECEIPT` на owning-спеке → fail со списком отсутствующего | **opt-in**: только если у сценария есть `completion` (`cli.ts:270`). В `scenarios.json` его нет ни у одного сценария; объявлен только в `scripts/roundtrip-eval.sh:92-96` |
| **`session-metrics.py gate`** | `scripts/session-metrics.py:80-98` (`state_metrics`), `:186-207` (`gate`) | RED, если `guard_written`, но `ticket_status` не `[x]`, либо нет закрытого раунда, либо нет `SDD_AUDIT_RECEIPT`/`SDD_REVIEW_RECEIPT` | вкручен в `scripts/roundtrip-eval.sh` |
| **golden `verify.sh`** | по фикстуре (`task`, `brownfield`) | exit 0 | руками/через тесты |
| **`roundtrip-grade.sh`** | `scripts/roundtrip-grade.sh:22-46` | «soft» балл 82-пробного бенча: проба зачтена, если совпал **exit-код** И дерево не изменилось; «нет в выводе: …» — отдельный wording-gap, не провал (`:35-45`); плюс не-поведенческие факторы (`:62-70`) | руками |

Три замечания по этим гейтам:

- **R-COMPLETE и `session-metrics.py gate` — два независимых воплощения одного правила.** Питоновский вариант жёстко зашит на cloud-ios (`session-metrics.py:81-83`: пути `Tools/check-swiftlint-exceptions.sh`, `specs/infra-base/infra-base.task.IB-script.md`, `specs/infra-base/infra-base.spec.md`) и на хост (`:19-21`: `DB = ~/.local/share/opencode/opencode.db`, `GEN = /Users/k.lebedev/Developer/gennady/.claude/worktrees/sdd-v2-rc52-followup`). TS-вариант параметризован сценарием. Дублирование логики → риск расхождения барьеров.
- **R1 на реальном репозитории не работает.** Во всех 10 прогонах на cloud-ios `quality` = `R1/false — no sdd-check verdict parsed` (§1.8). То есть на единственных «реальных» сценариях R1 не дал ни положительного, ни отрицательного сигнала — он дал «парсер не понял» и это посчиталось провалом.
- **R2/R3/R4/R5/R6 из `QUALITY-RULES.ru.md` в код не вписаны**: `grep -n "rule: '"` по `ai/flow-eval/*.ts` даёт только `R1`, `MIGRATION`, `R-COMPLETE`.

### 1.6 Что реально доказывает «PASS» по фазам

| Фаза (сценарий) | Что подтверждает pass | Чего pass **не** подтверждает |
|---|---|---|
| `spec-authoring` (`fibonacci-library`) | судья счёл артефакты соответствующими `acceptance`; R1 = `sdd-check --all` чист | семантическое качество декомпозиции; что Approval #1 действительно «pending» механически (проверяет только судья по прозе); масштабы кроме `function` |
| `scaffold` (`tic-tac-toe`) | судья + R1 | что тикеты **исполнимы** (`sdd-task` их принимает) — не проверяется; DAG-консистентность |
| `execute` (`slugify-toolchain`) | судья **без `acceptance`** (поле отсутствует) → фактически «судья по intent'у»; R1 | завершённость по SDD (`DONE`, закрытый раунд, receipt'ы) — только если добавить `completion`; корректность кода (нет golden для execute — R2 не реализован) |
| `repair` (`broken-specs-repair`) | R1 чист + судья; бар в `acceptance` совпадает с R1 | что фикс не сломал смысл спеки |
| `task` ×3 | независимый `golden/verify.sh` exit 0 — **самый крепкий бар в харнессе** (both-way залочен `infra-golden.test.ts`) | ничего про SDD-флоу (по промпту «no SDD ceremony») |
| `brownfield` (все 5 режимов) | только детерминированный golden в юнит-тестах; LLM-прогоны были, но вне `scenarios.json` | воспроизводимость как сценария; R1 применяется только к spec-режимам |
| `migration` (cloud-ios) | **`MIGRATION` grade**: `FLOW_VERSION=v2` + ноль внесённых критических находок | что мигрированный репозиторий **исполним** (см. §3, G4: 2-колоночные §5, `SCOPE-TYPE`, нет `PHASE_RECEIPTS:v1`); вердикт судьи здесь всегда `fail` (§1.8) |
| round-trip (`RT-cloud-ios-IB-script`) | `roundtrip-grade.sh` soft-балл против эталона + (с `95329c19`) R-COMPLETE | что фазовые гейты что-то проверяли — в фикстуре `rt-regen/package.json` `type-check`/`test`/`test:coverage`/`format` = `node -e "process.exit(0)"` (readiness-шим), т.е. `sdd-verify` в этом прогоне гонял no-op'ы |

### 1.7 Планка воспроизводимости

Формальная дисциплина документирована в `QUALITY-RULES.ru.md:10-16`: **оба исхода** каждого правила должны воспроизводимо проходить и падать («both-way»). Это выполнено для детерминированных гейтов (см. suite ниже: `parseSddCheckResult (R1, both outcomes)`, `checkCompletion (R-COMPLETE, both outcomes, from disk)`, `brownfield-*-golden … (both outcomes reproducible)`, `infra-golden … (both outcomes reproducible)`).

Для **LLM-прогонов** формальной планки в коде/доках нет; рабочая планка сессии — «2 pass» (A3b §6: authoring 1/4→5/6, `scaffold` 2/2, `execute` 2/2, migration r5/r6/rtbase 3/3, recover N≈3). `R5` («воспроизводимость исхода ≥ порога на N») в `QUALITY-RULES.ru.md:27` помечена как итерация 5 и **не реализована**: батч-замер clean-rate в `cli.ts` отсутствует.

### 1.8 Цена и токены — измерено по `.results/**` (не по докам)

Все 13 сохранённых прогонов, `summary.json` каждого `run-*`:

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

Четыре вывода, которых нет в докладах:

1. **13/13 прогонов — вердикт судьи `fail`**, включая три, где `MIGRATION` grade = PASS (r5/r6/rtbase). «migration r5/r6 PASS» — это **детерминированный грейд**, а судья на них сказал fail. 12/13 прогонов имеют `status: running` — то есть закончились исчерпанием бюджета наблюдений, что по `runner.ts:90-101` + `judge.ts:18` = автоматический fail. Единственный `completed` (fc2) получил fail по существу: судья прочитал признание воркера («phase cannot be marked DONE and the ticket stays `TODO`», см. `rt-regen/.sdd-eval-judge.RT-cloud-ios-IB-script.md`) — то есть единственный «настоящий» вердикт судьи был правильным, но опирался на прозу воркера, а не на диск.
2. **`cost` = 0 во всех прогонах** — `llm-proxy` не отдаёт стоимость. Денежных лимитов харнесс измерить не может; ограничивать можно только токенами.
3. **`cacheRead` — главная величина и она нигде не бюджетируется**: от 1,17 M до **30,5 M** токенов на прогон, что на 1–2 порядка больше `total`. `total` в `evidence.readUsage` явно не включает cache-read (см. столбцы), поэтому любые «токен-экономики» в докладах занижают реальный трафик.
4. Порядок величин по фазам (из `EXPERIMENTS-LOG.ru.md`, совпадает с таблицей): `task` ≈ 10–32 k total; brownfield-дельта ≈ 10 k; recover V2 ≈ 10,8 k (reason 334) против V1 129 k (reason 68 k); repair 25–79 k; authoring baseline in ≈ 83 k, total ≈ 136 k; migration 196 k–831 k; round-trip 98 k–248 k. `EXPERIMENTS-LOG.ru.md:8-10`: «~93–95 % токенов — ВХОД + reasoning, запись ~5 %».

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

Два факта про CI из этих прогонов:

- **Suite требует собранный `dist/`** (`provision.ts:1127` `findGennadyRoot`), но `README.md` («Fake-backed regression suite») обещает «no OpenCode server needed» и о `npm run build` молчит. Один кейс из 90 — фактически интеграционный.
- **`harness.test.ts` исключён из коммит-гейта.** `scripts/test-topology.ts:25-36` `V2_GATE_EXCLUDED_NAMES` содержит `'harness.test.ts'` с обоснованием «под c8 детерминированно превышает бюджет offline-гейта». А `test:sdd-flow-eval` не встречается ни в `cli/`, ни в `shared/`, ни в `scripts/` — значит `npm run check` (= `sdd-verify --profile full`, `package.json:78`) **не гоняет flow-eval-suite вообще**. 29 самых содержательных кейсов харнесса живут вне любого автоматического гейта.

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

Плюс к этому списку (моя проверка):

9. **non-Node стеки** — ноль тестов и ноль сценариев; единственный Swift-артефакт в репозитории — `ai/flow-eval/docs/swiftlint-toolchain-setup.md` (61 строка, ручная записка), а swift/go/python-фикстур в `provision.ts` нет;
10. **ownership при `sync`/`sync-skills`** — `cli/__tests__/e2e/sync.e2e.test.ts` (6 кейсов) и `sync-skills.e2e.test.ts` (4 кейса) проверяют только «first run / repeat unchanged / --dry-run / фильтр / несуществующий подкаталог / нет dev-machine-путей». **Ни одного кейса «локально изменённый файл сохраняется»** и «проектный скилл не удаляется». `grep -rn "preserved|manifest" cli/cmd/sync/*.ts cli/cmd/sync-skills/*.ts` — пусто, т.е. и механизма нет (регресс против `main` `f74c8c1d` и issue #9.4 / #24);
11. **критик/семантическое ревью** — по природе (A2 §6.7);
12. **чейн-режим** (authoring→scaffold→execute одним прогоном) в харнессе отсутствует: `cli.ts`/`runner.ts` не знают про зависимости между сценариями; chain1–chain14 гонялись вручную;
13. **`inconclusive` не отличается от `fail`** ни в отчёте, ни в артефакте — агрегата вердиктов нет вовсе.

---

## 2. Оценка зрелости

Шкала: **A** — можно опираться как на доказательство · **B** — годно как сигнал, требует ручной интерпретации · **C** — работает только в руках автора · **D** — заявлено, но не работает.

| Измерение | Оценка | Доказательство |
|---|---|---|
| **Детерминизм (юнит-слой)** | **A−** | 90/90 кейсов, 16 сюит, 34,9 с на HEAD `3d5f66a7` (§1.9). Both-way дисциплина соблюдена на каждом реализованном правиле (`quality-gate.test.ts:12,32`, `brownfield-golden.test.ts`, `brownfield-spec-golden.test.ts` 19 кейсов, `infra-golden.test.ts`, `migration-grade.test.ts` 7). Минус: один кейс требует `dist/` (интеграционный внутри «fake-backed» сюиты) |
| **Детерминизм (гейты прогона)** | **B** | Реализовано 3 правила из 7 заявленных: `R1`, `MIGRATION`, `R-COMPLETE`. `R2/R3/R4/R5/R6` — нет `rule:` в коде. `R1` на реальном репозитории 10/10 раз дал `'no sdd-check verdict parsed'` (§1.8) → на cloud-ios детерминированного структурного сигнала фактически нет. `R-COMPLETE` — opt-in и объявлен ровно у одного сценария (`roundtrip-eval.sh:92-96`) |
| **Судья** | **C** | 13/13 прогонов `fail`; 12 из них — по исчерпанию бюджета (`runner.ts:90-101` → `stuck` → рубрика `judge.ts:18`), т.е. вердикт не о качестве. Рубрика не знает про `DONE`/audit/receipt'ы. Вердикт не сливается с детерминированными гейтами (`cli.ts:234`). `parseVerdict` допускает совпадение по любой строке без префикса `VERDICT:`. Единственный содержательный fail (fc2) построен на **признании воркера в прозе**, а не на диске |
| **Реалистичность фикстур** | **B/D** — двойная оценка | **B** для синтетики: 14 фикстур, у всех node-проектов есть `c8` + `scripts/test-coverage.mjs` без glob-токенов (залочено `fixture-coverage.test.ts`, причина — фингерпринт receipt'а отвергает `GLOB_META`). **D** для «реального» слоя: единственный реальный репозиторий — cloud-ios, и он проходит execute только через **readiness-шим** `rt-regen/package.json`, где `type-check`/`test`/`test:coverage`/`format` = `node -e "process.exit(0)"`. Значит фазовые гейты round-trip-прогона были no-op'ами, а `sdd-verify` не проверил ничего; реальную проверку делал внешний 82-пробный бенч |
| **Наблюдаемость / телеметрия** | **B+** | `evidence.ts:244-296` `readUsage` суммирует **воркер + дочерние сессии** и включает `cacheRead` (`:283`); `evidence.ts:169-184` тянет ограниченный прогресс дочерних воркеров в tail (`child:<label>:<role>`, `:125`). Артефакты персистятся: `.results/run-*/summary.json` + `judge.md` + снимки спек (`cli.ts:275-300`). Минусы: `cost` всегда 0 (llm-proxy), `cacheRead` не бюджетируется, `session-metrics.py:38-42` читает **только топ-сессию** (`WHERE p.session_id=?`) → tool-calls субагентов в леджере не видны |
| **Стоимость** | **B−** | Токены измеряются точно и per-run; денежная стоимость — нет (`cost: 0` ×13). Порядок величин известен и стабилен (§1.8). Но: `cacheRead` до 30,5 M на прогон, ограничителя нет; в леджере ровно **одна** запись (`fc2-baseline`), т.е. non-regression-сравнение пока не с чем делать |
| **Документация для нового человека** | **C+** | `RUNBOOK.ru.md` (211) даёт полную процедуру поднятия сервера и чтения наблюдений; `WRITING-EVALS.ru.md` (158) — как добавить эвал. Но: `README.md` «Documentation map» перечисляет 4 документа из 15 (нет `QUALITY-RULES.ru.md`, `ROADMAP.ru.md`, `EXPERIMENTS-LOG.ru.md`, `INFRA-TASKS-RESEARCH.ru.md`, `P9-*.md`, всех четырёх `docs/*.md`); `ROADMAP.ru.md:63` заявляет «Итог (все цели закрыты)» и `suite 71/71` — устарело на 19 кейсов и на весь миграционный/round-trip трек; `types.ts:38-39` обещает грейд миграции «sdd-state=v2 + sdd-check clean», что прямо противоречит `migration-grade.ts` (baseline-diff); `README.md` не упоминает необходимость `npm run build` перед suite |
| **Пригодность к CI** | **D** | (а) `sdd-flow-eval` не имеет агрегированного exit-кода — батч из одних `fail` завершается 0 (`cli.ts:307`); (б) `harness.test.ts` (29 кейсов) исключён из коммит-гейта `scripts/test-topology.ts:36`; (в) `test:sdd-flow-eval` не входит в `npm run check`; (г) LLM-часть требует уже поднятого OpenCode-сервера и хостовых артефактов (Swift 6.2 в `~/Library/Developer/Toolchains`, `TMPDIR` без хвостового слэша, `~/.gennady/eval/cloud-ios/*`), `session-metrics.py:19-21` зашит на абсолютные пути одного хоста |
| **Изоляция песочниц** | **A−** | `provisionScenarioDirectories` + `assertUniqueScenarioDirectories`; наблюдатель прерывает прогон, если воркер читает установленные бандлы Gennady или зондирует CLI через redirect (`harness.test.ts`: «aborts immediately when a worker reads installed Gennady bundles», «aborts an SDD CLI probe wrapped in stderr redirection»); `sandbox-lifecycle.ts` + авто-teardown после ENOSPC-инцидента; `sandbox.test.ts`: «clean never touches non-sandbox directories». С `3d5f66a7` закрыта последняя дырка — stale dist в переиспользуемой песочнице |

### 2.1 Реестр рисков — «харнесс сам был источником примерно половины провалов»

Список из A3b §6 + `3d5f66a7`, каждый пункт с текущим статусом. Это **не** исторический курьёз: он задаёт, сколько прогонов надо считать невалидными и какие защиты обязательны в новых эвалах.

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
| H-10 | **stale `dist` в переиспользуемой песочнице** — `materializeLocalCli` делал blanket-skip при наличии `dist` | **все rt2–rt7 и fc1/fc2 гонялись на том dist, что лёг первым**, а не на текущем; изменения `execute.directive` STEP_6/7 и новых команд `sdd-log` воркер мог не видеть | закрыто `3d5f66a7` (+ `roundtrip-eval.sh` теперь делает `npm run build` перед прогоном). **Все round-trip-числа до 07.09 надо считать «на неизвестной сборке»** |
| H-11 | фикстуры с path-кэшами (worktree vs clone) | несопоставимые прогоны | частично; дисциплина, не тест |
| H-12 | исчерпание бюджета → `stuck` → авто-fail судьи | 12/13 прогонов получили вердикт от бюджета, не от качества | **открыто** (см. §1.3, §1.8) |
| H-13 | `R1`-парсер не понимает вывод `sdd-check` на реальном репозитории | 10/10 cloud-ios-прогонов: `quality R1: FAIL — no sdd-check verdict parsed` | **открыто** |
| H-14 | два независимых воплощения completion-правила (`quality-gate.ts` vs `session-metrics.py`) | барьеры могут разойтись | **открыто** |

**Честный итог зрелости.** Детерминированный слой харнесса — рабочий инструмент уровня A. Слой LLM-прогонов сегодня даёт **один** надёжный вид доказательства: «независимый golden/бенч сказал да» (фазы `task`, `brownfield`, round-trip-бенч) и «frozen grade сказал да» (`MIGRATION`). Вердикт судьи как отдельный сигнал — **не пригоден к использованию без ручного чтения rationale**. Всё, что называлось «PASS» на реальном репозитории, было PASS детерминированного грейда при `fail` судьи.

---

## 3. Покрытие по группам G1–G4

Принцип оператора: **один минимальный эвал на ГРУППУ похожих проблем**, а не на пункт. Ниже по каждой группе: что есть сегодня (сценарий / детерминированный тест / фикстура), чего нет, минимальный добавляемый эвал (форма фикстуры, приёмка — сначала детерминированные гейты, судья вторым), зависимости и как работа RC-сессии это меняет.

### G1 — non-Node стек: execute + verify (go/swift)

**Что есть.**
- Фикстур non-Node **нет**: `provision.ts` `FIXTURE_FILES` — 14 фикстур, все node/bash; ни одной с `go.mod`, `Package.swift`, `pyproject.toml`.
- Детерминированных тестов non-Node **нет**. Единственный Swift-артефакт в репозитории — `ai/flow-eval/docs/swiftlint-toolchain-setup.md` (ручная записка про Swift 6.2 + rpath-шим + `TMPDIR` без хвостового слэша).
- Единственный «стековый» прогон, что был: round-trip cloud-ios — но он проходил через readiness-шим (`rt-regen/package.json`), где 4 из 6 npm-гейтов = `node -e "process.exit(0)"`. **Стековая верификация в этом прогоне не выполнялась ни разу.**
- Реальная фикстура-заготовка есть и она хороша: `fixture-detmig` содержит `gennady.yaml` с `stack.use: [anystack]` и тремя `extraGates` — `swiftlint` (`cwd: MRCloudApp`, `argv: [mise, exec, --, swiftlint, lint, --strict]`, `timeout: 10m`, два правила `envFail` с `outputMatches`/`exitCodeMatches`/`hint`, `fixer`) и далее xcodebuild-гейты. Это готовый контракт приёмки для порта конфига.
- Внешний бенч (`roundtrip-grade.sh`, 82 пробы) — единственная работающая **поведенческая** проверка на Swift-репозитории, но он про качество скрипта-сторожа, не про verify-ладдер.

**Чего нет.** Всего, что B1 §6 помечает колонкой G1: детект стека (V-05), пресеты (V-04/V-08/V-09/V-10/V-11), readiness-движок (V-06), `gennady.yaml`-контракт (V-07), `when`-сужение (V-12), `--only/--skip` (V-13), вывод зелёного гейта (V-14). Плюс из A4: #9.2 (orphan-скан только `ts/tsx/js`), #17, #19, #20, #9-bonus.

**Минимальный эвал G1 — `E-G1-go-execute` (детерминированный, БЕЗ LLM) + `E-G1-swift-verify` (детерминированный, на реальной фикстуре).**

| | `E-G1-go-execute` | `E-G1-swift-verify` |
|---|---|---|
| Форма фикстуры | новая `SddEvalFixtureId` `golang-slugify` в `provision.ts` `FIXTURE_FILES`: `go.mod`, `internal/slugify/slugify.go` + `_test.go`, одна scope-спека + один тикет с 3-колоночной §5 (`Command \| Required by \| Role`), `PHASE_RECEIPTS:v1`, `COVERAGE_POLICY:v1`, **без `package.json`** | `fixture-detmig` как есть (read-only clone), плюс её `gennady.yaml` |
| Приёмка (гейты, по порядку) | 1) `sdd-state` печатает `STACK=golang` (или что решит V-05); 2) `sdd-task` выдаёт тикет как pickable без `EXECUTION_READY=no`; 3) `sdd-verify --task … --phase P1` строит ладдер из go-пресета и пишет валидный `SDD_PHASE_RECEIPT`; 4) `sdd-check --all` чист. Всё — `assert` в `shared/sdd/__tests__` + `cli/cmd/sdd-verify/__tests__`, both-way (негатив: репозиторий без `go.mod` не получает go-ладдер) | 1) 3 `extraGates` из `gennady.yaml` распарсились без потери `envFail`/`timeout`/`cwd`/`fixer`; 2) неизвестный ключ → exit 4; 3) anystack-проект получает `ready` **без шима**; 4) гейт с непересекшимися `when`-globs печатает видимый `skipped`; 5) `DerivedData`/`.build` не считаются мутацией дерева |
| Судья | **не нужен** — обе проверки детерминированные | **не нужен** |
| Цена | 0 токенов | 0 токенов (swiftlint не запускаем — проверяем резолв гейтов, не их исполнение; `--plan`) |
| Размер | M (фикстура + 2 набора тестов) | S–M |

**LLM-часть G1** — ровно один сценарий, и он же снимает главный вопрос переноса: `E-G1-llm-go` = `phase: 'execute'`, `mode: 'canonical-execute'`, фикстура `golang-slugify`, `completion: { artifact, ticket, spec }` (т.е. **R-COMPLETE обязателен**), плюс независимый `golden/verify.sh` (go build + go test). Приёмка: golden exit 0 **И** R-COMPLETE pass; вердикт судьи — только как диагностика. Стоимость по аналогии с `slugify-toolchain`: порядок 30–60 k total.

**Зависимости.** `E-G1-go-execute` и вся LLM-часть **блокированы портом VERIFY** (B1: V-04 → V-05 → V-06 как минимум; без V-06 non-node проект не достигнет `EXECUTION_READY` и `sdd-task` жёстко заблокирует impl-фазу — `sdd-task.cmd.ts:123`, `:459-487`). `E-G1-swift-verify` частично можно ставить раньше: пункты 1–2 (парсинг `gennady.yaml`) зависят только от V-07.

**Что меняет работа RC-сессии.** Ничего напрямую (Lead запретил трогать `sdd-verify`/`readiness.ts`). Косвенно — `3d5f66a7` делает возможным честный прогон на свежей сборке, а `95329c19` даёт готовый механический бар завершённости, который в G1 надо просто объявить.

### G2 — sync / ownership

**Что есть.**
- `cli/__tests__/e2e/sync.e2e.test.ts` — 6 кейсов: «sync directives on first run», «report unchanged on repeat run», «--dry-run», «filter by subdirectory», «fail on nonexistent subdirectory», «not contain dev-machine paths in synced directives».
- `cli/__tests__/e2e/sync-skills.e2e.test.ts` — 4 кейса: «install skills on first run», «unchanged on repeat», «--dry-run», «filter by skill name».
- Запускаются только `npm run test:e2e` (`GENNADY_E2E=1`), в коммит-гейт не входят (`test-topology.ts` `external`-класс, 8 файлов).

**Чего нет.** Ни одного кейса про **владение**: нет «локально изменённый файл сохраняется», нет «проектный скилл не удаляется», нет «`knowledge.xml` проектный не перетирается». Механизма тоже нет: `grep -rn "preserved|manifest" cli/cmd/sync/*.ts cli/cmd/sync-skills/*.ts` — пусто. Это прямые регрессы против `main` (#9.4 — манифест владения `62172906`; #24 — `preserved` для `knowledge.xml` `f74c8c1d`) и открытый #11.

**Минимальный эвал G2 — `E-G2-ownership` (детерминированный e2e, БЕЗ LLM).** Один тест-файл, 6 кейсов both-way, дописывается в уже существующие `sync.e2e.test.ts` / `sync-skills.e2e.test.ts` (инфраструктура `E2eContext` уже есть):
1. директива, изменённая локально после `sync`, при повторном `sync` **сохраняется** (или отклоняется с явной ошибкой — по решению оператора, см. §5);
2. `ai/directives/knowledge.xml` проекта не перетирается (позитив) и перетирается при `--force` (негатив);
3. проектный скилл, которого нет в пакете, после `sync-skills` **остаётся**;
4. скилл, который был поставлен пакетом и удалён из пакета, после `sync-skills` **удаляется** (зеркальная сторона — чтобы правило не выродилось в «никогда не удалять»);
5. `--dry-run` печатает ровно те же решения, что применит реальный прогон (байтовое сравнение плана);
6. директивы, которые директивы зовут (`~/.claude/skills/…` vs `<cwd>/.claude/skills/`), резолвятся из того места, куда `sync-skills` реально положил.

Приёмка — только `assert`; **LLM не нужен вообще**. Цена 0. Размер S. Зависимость: решение оператора о модели владения (манифест как в `main` vs «preserved»-список).

### G3 — целостность execution-log и конвенций: execute → audit → critic

**Что есть.**
- Детерминированно: `shared/sdd/__tests__/group-receipt.test.ts`, `group-receipt.cmd.test.ts`, `group-receipt.check.test.ts`, `phase-receipt.test.ts`, `phase-receipt-check.test.ts`, `audit-group.test.ts`; коды `SDD_GROUP_AUDIT_MISSING` / `SDD_GROUP_REVIEW_MISSING` (**WARN**, с grandfather'ом по `PHASE_RECEIPTS:v1` у всех членов группы), аксиомы `AX_GROUP_AUDIT_LEAVES_A_RECEIPT` / `AX_GROUP_REVIEW_LEAVES_A_RECEIPT`.
- На уровне эвала: **`R-COMPLETE`** (`95329c19`) — ровно та проверка, которой не хватало: артефакт есть ⇒ обязаны быть `[x] DONE`, закрытый раунд, `SDD_AUDIT_RECEIPT` и `SDD_REVIEW_RECEIPT`. 4 both-way кейса.
- `session-metrics.py gate` — то же правило, зашитое на cloud-ios; и `compare` (non-regression: `steps`/`tool_calls_total`/`reasoning_tokens` не растут, completion-сигналы не падают).
- Единственный «пойманный» пропуск аудита до этого был **стохастическим**: судья прочитал прозу воркера (fc2-рационале).

**Чего нет.**
- **Живого прогона, где STEP_6 действительно исполнился и receipt'ы легли.** Все 13 сохранённых прогонов — `fail`; в леджере одна запись `fc2-baseline` со `round_closed: false, impl_receipt: false, audit_receipt: false, review_receipt: false`. То есть R-COMPLETE ещё **никогда не давал pass на живом прогоне**.
- Словаря токенов Execution Log (`intro`/`decision`/`tried`/`discovery`/`insight`/`verified`/`ver`/`BLOCKED`/`DONE`) `sdd-check` не проверяет вовсе → #13, #15-остаток, #23 открыты.
- Критик не видит конвенций скоупа (`tasks/README.md` / `3-tasks.md`) → #21; провенанс в Handoff отсутствует → #22.
- Никакого эвала на **код-ревью** (поверхность 4 из §1.10).

**Минимальный эвал G3 — `E-G3-execute-audit-review` (один LLM-сценарий + один детерминированный лок).**

- Фикстура: **`slugify-toolchain` как есть** — уже существует, дешёвая, уже гоняется. Добавить в `scenarios.json` поля `acceptance` (сейчас его нет!) и `completion: { artifact: 'src/slugify.ts', ticket: <путь тикета>, spec: <путь спеки> }`.
- Промпт остаётся `PHASE_PROMPTS.execute` — важно, чтобы сценарий не подсказывал про аудит: проверяем, доводит ли **сама директива** до STEP_6 и receipt'ов.
- Приёмка (по порядку): 1) **R-COMPLETE pass** (жёсткий бар); 2) R1 `sdd-check --all` чист; 3) `sdd-check --all` не содержит `SDD_GROUP_AUDIT_MISSING`/`SDD_GROUP_REVIEW_MISSING`; 4) вердикт судьи — диагностика. Негативная сторона (both-way) уже залочена юнит-тестами `checkCompletion`.
- Бюджет: `--max-observations` надо поднять с 6 хотя бы до 20–30 (иначе H-12: бюджет = fail). Цена по порядку `execute`-прогона: 60–150 k total.
- Плюс детерминированный лок `E-G3-log-vocabulary` (0 токенов): новый модуль-парсер Execution Log (`shared/sdd/execution-log.ts` по A4 §перекрёстные связи п.3) + тесты both-way на неизвестный токен, правку закрытого раунда, рассинхрон `Reopens`. Закрывает #13/#15/#23 одним модулем.

**Зависимости.** Нужен grandfather-переключатель: пока `SDD_GROUP_*_MISSING` — WARN и гасятся отсутствием `PHASE_RECEIPTS:v1`, третий пункт приёмки бессмыслен на любой не-эталонной фикстуре. Решение WARN→ERROR — за оператором (открытый вопрос 4 из A3b §7).

**Что меняет работа RC-сессии.** Меняет радикально: `95329c19` — это и есть ядро приёмки G3. Осталось (а) объявить `completion` у `slugify-toolchain` в `scenarios.json`, (б) поднять бюджет, (в) сделать один прогон, который **не** упрётся в бюджет.

### G4 — миграция v1 → v2 на реальном снапшоте

**Что есть.**
- Полноценный контролируемый раннер: `scripts/migration-eval.sh run|status|grade` — сбрасывает `fixture-mig-run` через `git worktree add -b <br> <fx> <base>`, накрывает v2-директивы оверлеем (`:35`), снимает v1-baseline (`flow`/`hist`), гоняет с `MAX_OBS=40`, `--observe-every-ms 90000`, `--stuck-after 4`, `--concurrency 1`.
- Замороженный грейд `migration-grade.ts` + 7 both-way юнит-кейсов.
- Результаты: 3 PASS грейда из 7 прогонов (r5, r6, rtbase); 2 FAIL до фикса STEP_7 (`SDD_BROKEN_SPEC_REF`), 2 «R1-эры» до появления грейда (§1.8).
- Вторая реальная фикстура наготове: `fixture-detmig` (v1-раскладка: `tasks/infra-base/infra-base.IB-001…IB-007.md` + `tasks/README.md` + 4 спеки + `gennady.yaml`).

**Чего нет.**
1. **Сценария в `scenarios.json`** — фаза `migration` и режим `v1-to-v2` объявлены в типах, но референсного сценария нет; всё держится на bash-скрипте с абсолютными путями одного хоста.
2. **Бара «мигрированный репозиторий исполним»**. Это главный пробел G4 и он подтверждён: грейд PASS при том, что (а) §5-таблицы 2-колоночные (`Command | Required by`) → `sdd-task` даёт `SDD_VERIFICATION_TABLE_INVALID` ×7, а `sdd-check` молчит; (б) `<!--SCOPE-TYPE: infrastructure-->` вместо секции `<!--SECTION:SCOPE_TYPE-->` → `sdd-state` «SCOPE_TYPE is not found»; (в) нет `<!--PHASE_RECEIPTS:v1-->` и `COVERAGE_POLICY:v1` → group-receipt enforcement grandfather-ится в ноль; (г) нет `Structural Owner`/`Owning Spec` в META, hyphen-анкоры не извлекаются `sdd-extract`.
3. Второго и третьего снапшота (messenger, сам `gennady`). Про `gennady`: репозиторий, который поставляет v2, сам на v1 — `sdd-state` даёт `FLOW_VERSION=v1`, 127 v1-тикетов в `tasks/`, 1 v2-тикет (A2 §7). Это идеальный третий снапшот и одновременно проверка «съест ли мигратор 12 скоупов».
4. Фазы fold-back знания из execution-log в спеку (решение 44) — доказана руками, не автоматизирована.

**Минимальный эвал G4 — `E-G4-migration-executable` (усиление существующего, не новый).** Три изменения, ни одно не требует нового LLM-прогона сверх одного:
1. **Добавить в грейд третий бар: «мигрированный репозиторий исполним»** — детерминированно, 0 токенов: после миграции `sdd-task --task <любой тикет>` и `sdd-state` должны дать `ok` (сейчас `SDD_VERIFICATION_TABLE_INVALID`, «SCOPE_TYPE is not found»). Реализация — в `migration-grade.ts` рядом с `MIGRATION_CRITICAL_CODES`, both-way юнит-кейсы на замороженных выводах. **Это и есть «минимальный эвал на группу»**: он один валит все четыре формата-пробела (а)–(г).
2. **Перенести сценарий из bash в `scenarios.json`** (`id: MIG-cloud-ios-infra`, `phase: migration`, `mode: v1-to-v2`, `fixture` — новый id, читающий снапшот из переменной), чтобы фикстура/хост перестали быть частью скрипта. Иначе миграционный эвал не воспроизводим ни у кого, кроме автора.
3. **Прогнать на втором снапшоте.** Минимум — `fixture-detmig` (тот же cloud-ios, но другая точка истории: 7 тикетов IB-001…IB-007 в v1-раскладке, `9c04a878b0`). Дальше по решению оператора — `gennady` сам (12 скоупов, 127 тикетов) как масштабный тест.

Приёмка: `MIGRATION` grade pass **И** новый executable-бар pass; судья не участвует (на migration он всегда `fail` по бюджету — §1.8). Цена одного прогона: 196–831 k total, медиана ≈ 430 k (§1.8) — **самый дорогой класс эвала**. Размер: пункт 1 — S, пункт 2 — S, пункт 3 — по прогону M.

**Зависимости.** Пункт 1 требует, чтобы мигратор действительно научился эмитить 3-колоночные §5, секцию `SCOPE_TYPE` и `PHASE_RECEIPTS:v1` — иначе новый бар просто зафиксирует RED. Порядок обязателен: **сначала полнота мигратора, потом бар**. Скрипт `scripts/upgrade-verification-tables.py` уже существует (снимал «стену 1» вручную) — при реализации не дублировать, а встроить в `sdd-migrate`.

### 3.1 Триаж восьми непокрытых поверхностей флоу (из A2 §6.7) под план переноса

| Поверхность | Важность для плана переноса | Решение |
|---|---|---|
| Маршрутизация роутера / `LOGIC_SWITCH` | **высокая**: перенос VERIFY добавляет ветвление по стеку именно в роутер/readiness-директиву (B1 V-15 ⚑dir). Ошибка маршрута = молчаливый неверный путь | покрыть **дешёвым детерминированным** тестом резолва (`ai/inspector/core` уже парсит директивы и `READ_AND_USE`-цепочки — добавить лок «v1-раскладка → `migration-v1-v2.directive.xml`», «go.mod → go-пресет»); LLM-эвал не нужен |
| Авторинг infra-скоупа / выбор тул-стека | **высокая**: это единственное место, где стек **выбирается**, а перенос делает выбор значимым | добавить в план как `E-G1-infra-authoring` **после** V-05/V-07; до порта покрывать нечего |
| Execute батчем / очередь тикетов | средняя | оставить непокрытым; риск не в переносе |
| Module decomposition end-to-end | средняя | оставить непокрытым (есть юниты `module-specs.test.ts`) |
| Reconcile (`fix`/`from-code`) | средняя–высокая (идея reconcile-гейта из RCA не реализована) | оставить непокрытым в этом плане, зафиксировать как долг |
| Discover-from-code масштаба проекта | низкая для переноса | оставить непокрытым |
| Код-ревью | средняя: `SDD_REVIEW_RECEIPT` — половина бара R-COMPLETE, а самого ревью никто не оценивает | достаточно **механического** факта receipt'а (уже в R-COMPLETE); качество ревью — не эвалим |
| Авторинг interface-скоупа | низкая | оставить непокрытым |
| **Критик / семантическое ревью** | по природе не эвалится детерминированно | оставить; #21 закрывать read-set'ом, а не эвалом |

---

## 4. Предложение по eval-плану

Дисциплина, которую предлагаю принять до первой задачи (иначе план будет мерить шум):

- **Планка приёмки любого эвала = детерминированный гейт. Судья — диагностика, никогда не бар.** Основание: 13/13 прогонов `fail`, 12 из них по бюджету (§1.8, H-12).
- **Каждое правило — both-way**, как уже принято в `QUALITY-RULES.ru.md:10-16`: позитивный артефакт проходит, негативный воспроизводимо падает. Для новых правил both-way делается юнит-тестом на чистой функции (образец — `parseCompletion` / `checkCompletion`), а не прогоном.
- **Планка воспроизводимости LLM-прогона — 2 pass** (рабочая планка сессии), но она применима только там, где есть детерминированный бар; на migration это `MIGRATION` grade, на `task`/`brownfield`/G1-go — `golden/verify.sh`, на execute — `R-COMPLETE`.
- **`--max-observations` — параметр приёмки, а не удобства.** 6 (дефолт `runner.ts:32`) хватает только фикстурам класса `task`. Для execute — от 20, для migration — 40 (как в `migration-eval.sh:19`), для round-trip — 150 (как в fc2).

### 4.1 Упорядоченный список задач

`size`: S ≤ 1 фаза-день · M 2–4 · L неделя+. «Цена» — оценка `total` токенов на один прогон по §1.8; «0» = детерминированный, LLM не нужен.

| id | группа | что делает | фикстура | гейты приёмки (в порядке) | цена | size |
|---|---|---|---|---|---|---|
| **E-00** | инфра эвалов | Починить пригодность к CI: агрегированный exit-код у `sdd-flow-eval` (fail/inconclusive любого сценария → exit 1), вернуть `harness.test.ts` в коммит-гейт (или отдельным шагом `npm run check`), добавить `npm run build` в README/`test:sdd-flow-eval` | — | 90/90 остаются зелёными; новый тест «батч с одним fail даёт exit 1» | 0 | S |
| **E-01** | инфра эвалов | Починить `R1` на реальном репозитории: `parseSddCheckResult` сегодня 10/10 раз даёт `'no sdd-check verdict parsed'` на cloud-ios (§1.8, H-13). Собрать реальные выводы `sdd-check --all` с cloud-ios и `gennady`, расширить парсер, both-way | `fixture-detmig`, `rt-regen` (только чтение вывода) | both-way юнит на 3 замороженных реальных выводах; `inconclusive` перестаёт молча означать fail | 0 | S |
| **E-02** | G3 | Объявить `completion` у `slugify-toolchain` в `scenarios.json` + `acceptance` (сейчас отсутствует) | `slugify-toolchain` | правка + суита зелёная | 0 | S |
| **E-03** | все | **Re-baseline после `3d5f66a7`.** Все round-trip/execute-числа до 07.09 получены на неизвестной сборке (H-10: `materializeLocalCli` делал blanket-skip). Прогнать заново `slugify-toolchain` (execute) и один `infra-*` на свежем dist, записать в `metrics-ledger.jsonl` | `slugify-toolchain`, `infra-makefile` | golden exit 0 (infra); R-COMPLETE (execute, из E-02); 2 pass | ≈ 11 k (infra) + 60–150 k (execute) ×2 | S |
| **E-04** | G2 | `E-G2-ownership` — 6 both-way кейсов владения в `sync.e2e.test.ts` / `sync-skills.e2e.test.ts` (§3, G2) | e2e-контекст `E2eContext` | все 6 `assert`; `--dry-run` план байт-в-байт равен применённому | 0 | S |
| **E-05** | G3 | `E-G3-log-vocabulary` — модуль `shared/sdd/execution-log.ts` (парсер раундов/фаз/токенов, scoped по `EXECUTION_LOG`) + both-way тесты: неизвестный токен, правка закрытого раунда, рассинхрон `Reopens`, `nextRoundNumber` по секции, а не по файлу | синтетические тикеты | 4 both-way группы; закрывает #13/#15-остаток/#23 одним модулем | 0 | M |
| **E-06** | G4 | Полнота мигратора: 3-колоночные §5 (встроить существующий `scripts/upgrade-verification-tables.py`, не дублировать), секция `<!--SECTION:SCOPE_TYPE-->`, `PHASE_RECEIPTS:v1` + `COVERAGE_POLICY:v1`, `Structural Owner`/`Owning Spec` в META, не-hyphen анкоры | `fixture-detmig` (детерминированно, без LLM) | `sdd-task` принимает каждый мигрированный тикет; `sdd-state` печатает `SCOPE_TYPE`; `sdd-extract` вытаскивает все анкоры | 0 | M |
| **E-07** | G4 | `E-G4-migration-executable` — третий бар в `migration-grade.ts`: «мигрированный репозиторий исполним» + перенос сценария из bash в `scenarios.json` | `fixture-mig-run` | both-way юнит на замороженных выводах; **зависит от E-06** | 0 | S |
| **E-08** | G4 | Прогон миграции на **втором** снапшоте с новым баром | `fixture-detmig` | `MIGRATION` grade pass И executable-бар pass; 2 pass | ≈ 430 k ×2 | M |
| **E-09** | G3 | **Первый живой прогон, где R-COMPLETE даёт pass.** Сегодня в леджере ноль таких (`fc2-baseline`: все четыре completion-сигнала `false`) | `slugify-toolchain` (`--max-observations 30`) | R-COMPLETE pass; R1 чист; нет `SDD_GROUP_*_MISSING`; 2 pass | 60–150 k ×2 | M |
| **E-10** | G1 | `E-G1-swift-verify` — детерминированная приёмка контракта `gennady.yaml` (§3, G1) | `fixture-detmig` | 5 пунктов приёмки; **зависит от V-07** | 0 | S–M |
| **E-11** | G1 | Фикстура `golang-slugify` в `provision.ts` `FIXTURE_FILES` + `golden/verify.sh` (go build/test) | новая | `fixture-coverage.test.ts`-аналог для go (никаких glob-токенов в §5); golden both-way | 0 | M |
| **E-12** | G1 | `E-G1-go-execute` — детерминированный (`sdd-state STACK`, `sdd-task` pickable, `sdd-verify` receipt, `sdd-check` чист) | `golang-slugify` | 4 пункта both-way; **зависит от V-04/V-05/V-06** | 0 | M |
| **E-13** | G1 | `E-G1-llm-go` — единственный LLM-сценарий группы: execute на go-фикстуре | `golang-slugify` | golden exit 0 И R-COMPLETE pass; 2 pass | 30–60 k ×2 | M |
| **E-14** | G4 | (опционально, по решению оператора) миграция **самого `gennady`** — 12 скоупов, 127 v1-тикетов | снапшот `main` | `MIGRATION` grade + executable-бар; масштабный тест мигратора | ≈ 1–3 M (масштаб ×3–5 от cloud-ios) | L |
| **E-15** | роутер | Детерминированный лок маршрутизации на парсере `ai/inspector/core` (v1-раскладка → `migration-v1-v2.directive.xml`; наличие `go.mod` → go-ветка readiness) | директивы как есть | both-way; закрывает поверхность №1 из §1.10 дешёвым способом | 0 | S–M |

**Порядок и критический путь.** E-00 → E-01 → E-02 → **E-03 (re-baseline — обязателен до любых выводов)**. Дальше три независимых ветки:
- G2: E-04 (сразу, ни от чего не зависит);
- G4: E-06 → E-07 → E-08 → (E-14 по решению);
- G3: E-05 (независимо) и E-09 (после E-02/E-03);
- G1: E-10 (после V-07) → E-11 → E-12 (после V-04/V-05/V-06) → E-13. **Вся ветка G1 упирается в порт VERIFY** и раньше него даёт только E-10 частично.
- E-15 — в любой момент, дешёвый.

### 4.2 Регрессии: что гонять до и после каждой задачи переноса

Общая шина (0 токенов, ~35 с) — **перед и после каждой** задачи B1 V-01…V-16:

```
node --import tsx --test <root>/ai/flow-eval/__tests__/*.test.ts     # ожидание: 90/90 (или больше)
npm run test:topology                                                # unit=211 contract=16 local=51 external=8
npm run check                                                        # sdd-verify --profile full
npm run check:directives-fresh && npm run check:directive-budgets && npm run audit:axioms
```

Точечные LLM-регрессии — только там, где задача меняет **текст, который читает агент**, или **ладдер, который он вызывает**:

| Задача переноса (B1) | Что она ломает | Регрессия ПОСЛЕ |
|---|---|---|
| V-01…V-03 (parity, типы `Gate`) | ничего в тексте | только детерминированная шина |
| V-04 (`resolvePreset` + node-пресет) | строки команд ладдера | детерминированная шина + **E-03** (execute на `slugify-toolchain`, 1 прогон): receipt по-прежнему валиден |
| V-05 (детект стека) | `sdd-state`/`sdd-task`/`sdd-verify` видят стек | детерминированная шина; E-10 |
| V-06 ⚑dir (readiness-движок + текст `readiness.directive.hbs`) | **текст директивы** | E-03 + **greenfield execute класса chain10b** (полная цепочка authoring→scaffold→execute вручную/`operator-approve.sh`); плюс снять шим из `rt-regen` и перепрогнать round-trip |
| V-07 (`gennady.yaml`) | конфиг-контракт | E-10 |
| V-08 (anystack в фазовой модели) | ладдер на не-node репо | E-10 + round-trip **без шима** |
| V-09/V-10/V-11 (go/python/swift пресеты) | ладдер по стеку | E-12/E-13 для go; для python/swift — детерминированный аналог E-12 |
| V-12/V-13/V-14 (issues #9-bonus/#20/#17) | вывод и сужение гейтов | детерминированная шина; receipt не меняется (инвариант И-2 из B1) |
| V-15 ⚑dir ⚑spec (директивы, `.hbs`, cascade) | **весь текст флоу** | обязательно: `check:directives-fresh` + **greenfield chain10b** + E-09 (R-COMPLETE) + E-08 (миграция). Это единственная задача, после которой нужен полный набор LLM-прогонов |
| V-16 (фасады `verify`/`fix`) | поверхность CLI | детерминированная шина |

**Отдельно:** после **любого** изменения в `ai/directives/sdd-v2/**` или `ai/kit/templates/sdd-v2/**` прогон greenfield-execute обязателен, потому что заявление PROGRESS-REPORT «полный greenfield проходит end-to-end (chain10b)» получено на сборке 4 сентября — до `4bb00f4b` (STEP_6/STEP_7) и до новых команд `sdd-log`. Регрессионного прогона с тех пор **не было**, а H-10 означает, что и round-trip-прогоны шли на неизвестном dist. Это первая дыра, которую закрывает E-03.

### 4.3 Что должен решить оператор (входит в план как блокирующее)

1. **Модели.** Разрешён ли только `llm-proxy/*` (сегодня `llm-proxy/deepseek-v4-flash` и воркер, и судья) — или судья может быть другой/сильнее? Сейчас судья = та же дешёвая модель, что воркер, и это вероятная часть его стохастичности.
2. **Потолки стоимости.** `cost` = 0 во всех прогонах (llm-proxy не отдаёт цену), значит потолок можно задать только в токенах. Нужны два числа: потолок `total` на один прогон и потолок `cacheRead` (сегодня до 30,5 M и не бюджетируется вовсе).
3. **Какие реальные репозитории можно снапшотить.** cloud-ios уже используется (два снапшота). Нужны разрешения на: messenger; сам `gennady` (E-14). Плюс правило хранения: сегодня фикстуры лежат в `~/.gennady/eval/cloud-ios/*` вне git-репозитория проекта и содержат `Tools/Artifactory/.netrc` — файл с именем, характерным для учётных данных. **Это надо явно решить до расширения набора снапшотов.**
4. **Модель владения при `sync`** (нужна для E-04): манифест как в `main` (`62172906`) или список `preserved` (`f74c8c1d`)?
5. **`SDD_GROUP_AUDIT_MISSING`/`SDD_GROUP_REVIEW_MISSING`: WARN→ERROR и граница grandfather'а** — без решения третий пункт приёмки E-09 не имеет силы.

---

## 5. Вопросы оператору

### Q1. Чем считается «PASS» эвала после этой ревизии?

Факт: 13/13 сохранённых прогонов имеют вердикт судьи `fail`; 12 из них — по исчерпанию бюджета наблюдений (`runner.ts:90-101` → `stuck` → `judge.ts:18`). При этом `MIGRATION` grade дал PASS трижды.

- **(a) Детерминированный гейт — единственный бар; вердикт судьи печатается как диагностика и в приёмке не участвует.** Требует E-00 (агрегированный exit-код по гейтам, а не по судье). — *моя рекомендация*
- (b) Судья остаётся баром, но исчерпание бюджета переводится в отдельный исход `budget-exhausted` (не `fail`), и прогоны с ним не считаются в статистике.
- (c) Двойной бар: pass только если И гейт, И судья — тогда надо принять, что почти все длинные сценарии будут fail.
- (d) Оставить как есть, читать rationale руками.

### Q2. Сколько снапшотов реальных репозиториев берём в G4 и какие?

Факт: сегодня один репозиторий (cloud-ios) в двух точках истории; `gennady` сам на v1 (127 v1-тикетов, 12 скоупов) — идеальный масштабный снапшот. Цена одного миграционного прогона 196–831 k total.

- (a) Только cloud-ios, две точки (`fixture-mig-run` + `fixture-detmig`) — минимум, закрывает «две разные истории одного репозитория». — *моя рекомендация как минимум*
- (b) cloud-ios ×2 + `gennady` сам (E-14) — добавляет масштаб (12 скоупов вместо 1) и самопроверку продукта. Дорого (≈1–3 M), но это единственный способ узнать, переживёт ли мигратор проект, а не один скоуп.
- (c) cloud-ios ×2 + messenger — добавляет другой домен и другого автора спек.
- (d) Все три.

### Q3. Где хранить фикстуры реальных репозиториев?

Факт: `~/.gennady/eval/cloud-ios/*` — вне git-репозитория проекта, на одном хосте; `session-metrics.py:19-21` и `migration-eval.sh:13,21` зашиты абсолютными путями; в дереве `fixture-detmig` присутствует файл `Tools/Artifactory/.netrc` (имя, характерное для учётных данных).

- (a) Оставить вне репозитория, но параметризовать все скрипты (`EVAL_FIXTURES_ROOT`) и добавить в приёмку эвала проверку «фикстура не содержит файлов класса секретов». — *моя рекомендация*
- (b) Свести фикстуры в отдельный приватный git-репозиторий с явным манифестом того, что вырезано.
- (c) Держать только сгенерированные синтетические аналоги реальных репозиториев (дешевле и безопаснее, но теряется главная ценность G4 — реальность).

### Q4. Каким гейтом закрывать G1 до порта VERIFY?

Факт: `E-G1-go-execute`/`E-G1-llm-go` блокированы V-04…V-06; сегодня non-node проект не достигает `EXECUTION_READY`, а `sdd-task.cmd.ts:459-487` жёстко блокирует impl-фазы.

- (a) Ничего из G1 не гонять до V-06; поставить E-10 (парсинг `gennady.yaml`) сразу после V-07 как первый сигнал. — *моя рекомендация*
- (b) Сделать go-фикстуру и E-11/E-12 **сейчас** как «красный» набор (все ассерты падают) — тогда порт VERIFY будет двигать конкретное число зелёных тестов. Дороже по времени, но даёт измеримый прогресс переноса.
- (c) Расширить readiness-шим (как в `rt-regen`) на go-фикстуру и гонять LLM-эвал уже сейчас — быстро, но повторяет ошибку round-trip: фазовые гейты станут no-op'ами и эвал ничего не докажет.

### Q5. Судья: одна модель на воркера и судью — или разделить?

Факт: и воркер, и судья — `llm-proxy/deepseek-v4-flash`; `runner.ts:53-60` явно допускает совпадение моделей. Стохастичность судьи задокументирована (ложные fail на chain6/10b).

- (a) Оставить одну дешёвую модель, но понизить роль судьи до диагностики (следствие Q1a). — *моя рекомендация*
- (b) Судья — более сильная модель из `llm-proxy`; тогда нужен потолок стоимости отдельно на судью.
- (c) Убрать судью совсем из приёмки и оставить только персист rationale (судья как «объяснитель», а не «оценщик»).
- (d) Калибровать судью на замороженном наборе rationale (отложенная задача из PROGRESS-REPORT) — самый дорогой путь.

### Q6. Порядок «полнота мигратора» ↔ «бар исполнимости»?

Факт: грейд сегодня даёт PASS при неисполнимом мигрированном репозитории (2-колоночные §5 → `SDD_VERIFICATION_TABLE_INVALID` ×7, `SCOPE-TYPE` вместо секции, нет `PHASE_RECEIPTS:v1`).

- (a) Сначала E-06 (полнота мигратора), потом E-07 (бар) — бар вводится уже зелёным. — *моя рекомендация*
- (b) Сначала E-07 (бар как RED-first), потом E-06 — тогда есть механическое доказательство дефекта до фикса (и это ровно та дисциплина «red-first», что применена в `session-metrics.py gate`).
- (c) Одной задачей.


# Часть II — V-B7 (независимый верификатор)

# V-B7 — независимая верификация B7 (трек EVAL)

**Что проверял.** `scratchpad/B7-eval-track.md` (453 строки). Свои источники: RC-scratch `scratchpad/rc-v6` @ `11291af5` (прогоны тестов, прогоны `sdd-check`/`sdd-state`), содержимое блобов RC-live через `git -C <worktree> show 3d5f66a7:<path>` (95329c19 и 3d5f66a7 проверены отдельно), `.results/**` RC-live (чтение), фикстуры `~/.gennady/eval/cloud-ios/{fixture-detmig,fixture-mig-run,rt-regen,bench-smoke}` (`git log`/`ls-tree`/`git status`), отчёты A2 §6.7/§7, A3b §6, B1 §6, B2 §3.7, B3 §3.6, B4 §5.1, транскрипт решений оператора. LLM-эвалы не запускал, tracked-файлы не менял.

---

## § Итог

B7 — самый плотно фактурированный из трековых документов: из ~70 проверяемых `file:line` **подтверждено верно 58**, **сдвинуто на 1–3 строки 9** (сам факт при этом верен), **опровергнуто по существу 3**, плюс **6 числовых обсчётов**. Все ключевые механизмы (бюджет наблюдений → авто-fail, контракт судьи, три реализованных гейта, both-way дисциплина, токен-таблица) воспроизведены независимо и совпали до цифры. Оценки зрелости в целом обоснованы.

Существенные правки (по убыванию цены ошибки):

1. **Прогонов 14, а не 13.** `ls -d .results/run-*` = 14, и сама таблица §1.8 содержит 14 строк. Значит «13/13 fail» → **14/14 fail**, «12/13 `status: running`» → **13/14**. Ошибка тиражирована в §1.8, §2 (три строки), §4, Q1.
2. **§1.9 «`npm run check` не гоняет flow-eval-suite вообще» — ОПРОВЕРГНУТО.** `npm test` = `test-topology.ts deterministic`, `TEST_ROOTS = ['ai','cli','services','shared']` (`scripts/test-topology.ts:19`), `deterministic` = unit+contract+local+external минус `V2_GATE_EXCLUDED_NAMES` (`:216-219`, `:164`). То есть **68 из 90 кейсов flow-eval сидят в коммит-гейте**; вне гейта только `harness.test.ts`. И «`test:sdd-flow-eval` не встречается в `scripts/`» неверно — встречается в `scripts/test-topology.ts:34`.
3. **`harness.test.ts` — 22 кейса, не 29.** Прогон: `# tests 22 # pass 21 # fail 1`. Цифра 29 унаследована из A2 §6.7 без проверки (там же ошибочная сумма «46»). Вывод §1.9/§2 «29 самых содержательных кейсов вне любого гейта» → **22**.
4. **`fixture-detmig` — не v1-снапшот, а уже мигрированное грязное дерево.** `git status --porcelain` = 14 записей: 7 × `RM tasks/infra-base/infra-base.IB-00N.md -> specs/infra-base/infra-base.task.IB-<slug>.md`, `D tasks/README.md`, `D tasks/infra-base/README.md`, `M specs/infra-base/infra-base.spec.md`, `?? specs/infra-base/infra-base.3-tasks.md`, `?? migration/`, `?? ai/directives/sdd-v2/`. Описание в §3 G4 («v1-раскладка: `tasks/infra-base/infra-base.IB-001…IB-007.md` + `tasks/README.md`») относится к HEAD-коммиту, но не к тому, что лежит на диске.
5. **`fixture-detmig` — тот же снапшот, что база миграционного прогона.** HEAD `fixture-detmig` = `9c04a878b0`; `migration-eval.sh:15` `BASE="${BASE:-9c04a878b0}"`. Значит E-08 («прогон миграции на **втором** снапшоте», ≈430 k ×2) идёт на **той же точке истории** — «другая точка истории» опровергнута, и заявленной новой информации задача не даёт.
6. **Диагноз H-13/E-01 неверен, а фикс — на порядок дешевле.** `parseSddCheckResult` прекрасно читает реальный вывод: прогнал `sdd-check --all` на `fixture-detmig` (25 errors/141 warnings/13 files) → `{"rule":"R1","pass":false,"detail":"25 sdd-check error(s)"}`. Дыра в другом: `✅ clean — N file(s) checked` печатается только при `findings.length === 0` (`cli/cmd/sdd-check/sdd-check.types.ts:148-151`), а «`0 error(s), 141 warning(s)`» (`:164`) парсер трактует как отсутствие вердикта — проверено: `no sdd-check verdict parsed`. То есть R1 валит **любой репозиторий с нулём ошибок и хотя бы одним ворнингом**, хотя `help.ts:92` прямо говорит «0 clean (warnings allowed)». Фикс — один предикат, а не «собрать три реальных вывода и расширить парсер».
7. **«`sdd-check` молчит» про 2-колоночные §5 — ОПРОВЕРГНУТО**, и это упрощает E-07. Прогон на `fixture-detmig` даёт **7 × `error: SDD_VERIFICATION_TABLE_INVALID`**. Значит «третий бар исполнимости» можно не изобретать: достаточно внести `SDD_VERIFICATION_TABLE_INVALID` (и проверки `SCOPE_TYPE`/`PHASE_RECEIPTS:v1`) в `MIGRATION_CRITICAL_CODES` (`migration-grade.ts:31-35`) — размер S вместо M, и бар получается из уже существующего механизма baseline-diff.
8. **E-14 (самомиграция `gennady`) помечена «опционально, по решению оператора» — противоречит уже принятому решению.** В транскрипте: вопрос «Когда мигрируем архив `tasks/` v1→v2 (127 тикетов, 11 скоупов)?» → ответ «Финальным проходом (рекомендую)»; отдельно выбран путь «Шаг 4: миграция `tasks/` v1→v2 + вычистка v1». Миграция самого `gennady` — обязательный шаг плана переноса; эвал G4 должен ехать на этом прогоне (стоимость уже уплачена планом), а не быть опцией (b) в Q2. Формально решения с меткой ровно «D-3» в доступных мне отчётах нет — фиксирую по содержанию.

Остальные 8 групп находок — в § Правки к B7.

---

## § Факты (проверка §1)

Легенда: **OK** — подтверждено дословно · **OK/±N** — факт верен, номер строки сдвинут · **ЧАСТИЧНО** · **НЕВЕРНО**.

| # | Утверждение B7 | Вердикт | Что показала проверка |
|---|---|---|---|
| 1 | `types.ts:5-27` `SddEvalScenario`; `:7 id`, `:9 intent`, `:15 phase`, `:17 mode`, `:19 scale`, `:21 acceptance`, `:26 completion` | **OK** | все семь номеров точны |
| 2 | `types.ts:29-40` — 7 фаз; `:42-71` — 11 режимов; 14 `SddEvalFixtureId` | **OK** | фазы 30-39, режимы 42-70 (последняя строка диапазона — пустая), id 73-105 = ровно 14 |
| 3 | `provision.ts` поставляет все 14 `FIXTURE_FILES` | **OK** | `FIXTURE_FILES: Record<SddEvalFixtureId, …>` (`:807`) — тип покрывает все 14 |
| 4 | `scenarios.json` — 7 сценариев, 58 строк, `slugify-toolchain` **без `acceptance`** | **OK** | 58 строк, 7 объектов; у `slugify-toolchain` полей `acceptance`/`completion` нет |
| 5 | Не покрыты референсом: фазы `brownfield`/`migration`; режимы `modify-code-delta`, `fix-code-delta`, `recover-spec`, `delta-to-spec`, `modify-via-spec`, `v1-to-v2`; 7 brownfield-фикстур | **OK** | пересчитал по файлу: задействовано 5 фаз / 5 режимов / 7 фикстур |
| 6 | `roundtrip-eval.sh:79-100` `write_scenario()` генерирует сценарий на лету | **OK/+3** | `write_scenario()` = `:82-102` |
| 7 | `prompts.ts:7-36` `PHASE_PROMPTS`; `:41-51` `BROWNFIELD_MODE_PROMPTS`; `:61` строка `Selected phase: …; selected mode: …`; `:66-73` `headlessOperator`; `:60` требование `directory` | **OK** | все пять — дословно; запреты `--help`/`--version`/redirect/`node_modules/gennady` — `:70`, запрет самоодобрения — `:72-73` |
| 8 | `runner.ts:25-34` дефолты (`localhost:4096`, `openai/gpt-5.6-luna`, `openai/gpt-5.6-sol`, concurrency 3, 300 000 ms, stuckAfter 1, maxObservations 6, tailLimit 20) | **OK** | дословно; README `:58-63` «Defaults (code) vs what we run» подтверждает `llm-proxy/deepseek-v4-flash` для обеих ролей |
| 9 | `runner.ts:90-101`: бюджет исчерпан → `abort` + `stuck: true` + ошибка `'observation budget exceeded'` | **OK/+1..+4** | блок = `:91-105`; текст ошибки дословно (`:103`) |
| 10 | `runner.ts:154-167` батчи по concurrency; `:66-70` одна сессия на сценарий; `:82-89` observer; `:137-151` судья; `:141-147` `state` судье | **OK/±2** | `runAll` `:156-167`; `createSession` `:67-70`; observer `:83-90`; `judge.evaluate` `:139-151`; state `{status, stuck, waiting, errors}` `:142-147` — состав полей точен |
| 11 | `judge.ts:12-28` состав промпта судьи; `:18` рубрика «A stuck or unfinished worker … is a failure»; рубрика не знает `DONE`/audit/receipt'ов | **OK** | дословно; в рубрике нет ни `DONE`, ни `audit`, ни `receipt` |
| 12 | `judge.ts:38-45` `parseVerdict`, регексп воспроизведён | **OK** | символ в символ |
| 13 | §1.4.1: префикс `VERDICT:` опционален, `/m` → совпадение по любой строке; «Fail conditions were…» читается как вердикт | **OK (воспроизведено)** | прогнал регексп: `"…\nFail conditions were not met…"` → `fail`; `"Rationale:\nPass rate … 100%"` → `pass` |
| 14 | §1.4.2: H1 из `docs/flow-verification-redesign.md` | **OK** | `:16-17`: «Judge rubric never checks DONE/audit. The one catch was stochastic (worker narrated "stays TODO")» |
| 15 | `cli.ts:234` `const verdict = result.judge?.verdict ?? 'worker-error'` | **OK** | дословно |
| 16 | `cli.ts:307` `process.exitCode = 1` только в `main().catch`; агрегированного кода возврата нет | **OK/+9** | единственный `process.exitCode = 1` — `:316`; `process.exit(130)` — `:192`; агрегата действительно нет |
| 17 | R1 включается для фаз, «производящих спеки» (`cli.ts:240-249`): не `task`, для `brownfield` — только spec-режимы | **OK** | `brownfieldSpecMode` `:241-245`, `producesSpecs` `:246-249` |
| 18 | `quality-gate.ts:28-35` `parseSddCheckResult` (чистая), `:42-59` `checkR1Structure` через `node_modules/.bin/gennady`; бар `clean`/`N error(s)`/`no sdd-check verdict parsed` | **OK** | `:28-36` и `:43-60`; три исхода дословно |
| 19 | MIGRATION: `computeMigrationGrade:84`, `:97` `pass = flowV2 && criticalIntroduced.length === 0`, `MIGRATION_CRITICAL_CODES` `:31-36`, backlog `:103`, `captureBaseline` `cli.ts:199-201` | **OK** | все пять точны (набор кодов — `SDD_BROKEN_SPEC_REF`, `SDD_BROKEN_SPEC_ANCHOR`, `ERR_CLI_SDD_CHECK_READ_FAILED`) |
| 20 | R-COMPLETE: `quality-gate.ts:63-84` `CompletionSignals`, `:86-103` `parseCompletion`, `:114-128` `CompletionTargets`, `:130-143` `checkCompletion`; вызов `cli.ts:266-274`, opt-in `:270` | **OK/±7** | `CompletionSignals` = `:62-74` (`:76-85` — докблок `parseCompletion`), `CompletionTargets` = `:113-121`; `parseCompletion` `:86-102`, `checkCompletion` `:130-143`, `cli.ts:266-274`/`:270` — дословно |
| 21 | Бар R-COMPLETE: нет артефакта → `'declared artifact was not produced'`; иначе требуются `**Status:** [x]`, `- [x] \`…\` DONE` внутри `<!--SECTION:EXECUTION_LOG-->`, `SDD_AUDIT_RECEIPT` и `SDD_REVIEW_RECEIPT` на owning-спеке | **OK** | `:87-101`, `:133-141` — дословно (все четыре сигнала обязательны, каждый отсутствующий перечисляется) |
| 22 | R-COMPLETE объявлен только в `roundtrip-eval.sh:92-96`; в `scenarios.json` — ни у одного сценария | **OK/+1** | блок `completion` = `:93-97`; в `scenarios.json` `completion` отсутствует; в сохранённом `.results/rt-execute.scenario.json` (прогон до 95329c19) его тоже нет |
| 23 | `session-metrics.py:80-98` `state_metrics`, `:186-207` `gate`; RED-условия | **ЧАСТИЧНО** | `state_metrics` = `:81-99`; **`gate` = `:164-186`**, а `:189-209` — это `main()`. RED-условия описаны верно дословно (`:170-178`) |
| 24 | `session-metrics.py:19-21` абсолютные пути, `:81-83` пути cloud-ios, `:38-42` только топ-сессия (`WHERE p.session_id=?`) | **OK/±1** | `:19-21` дословно; пути `:82-84`; запрос `:38-42` (`p.session_id=?`) — да, субагенты не видны |
| 25 | `roundtrip-grade.sh:22-46` soft-балл (exit-код + неизменённое дерево), `:35-45` wording-gap, `:62-70` не-поведенческие факторы, `:9` `TMPDIR=/tmp` | **OK** | все четыре точны; «frozen golden 82 probes» — `:49` |
| 26 | «R2/R3/R4/R5/R6 из `QUALITY-RULES.ru.md` в код не вписаны»: `grep "rule: '"` даёт только `R1`, `MIGRATION`, `R-COMPLETE` | **OK** | grep по `3d5f66a7:ai/flow-eval/*.ts` — ровно эти три (+`rule: 'R1'` в `sandbox-lifecycle.test.ts`) |
| 27 | `QUALITY-RULES.ru.md:10-16` both-way дисциплина; `:27` R5 «≥ порога на N», итерация 5, не реализована | **OK** | дословно; батч-замера clean-rate в `cli.ts` действительно нет |
| 28 | §1.8 таблица 14 строк: verdict/status/in/out/reasoning/cacheRead/total/cost/quality | **OK по данным** | все 14 строк совпали до токена с `summary.json`; `cost` = 0 везде; `cacheRead` 1 170 048 … 30 549 248 |
| 29 | «`total` не включает cache-read» | **OK** | `evidence.ts:285` `acc.total += input + output + reasoning`; арифметика сходится (179837+23885+88305 = 292027) |
| 30 | «13/13 fail», «12/13 `running`» | **НЕВЕРНО (счёт)** | 14 прогонов: **14/14 fail**, **13 `running` + 1 `completed`** (fc2) |
| 31 | fc2 — единственный `completed`, судья прочитал признание воркера в прозе | **OK** | `.results` подтверждает `status: completed`; H1 в `flow-verification-redesign.md:16-17` описывает тот же случай |
| 32 | Один `metrics-ledger.jsonl` — запись `fc2-baseline`, все completion-сигналы `false` | **OK** | 1 строка: `ticket_status "[ ] TODO"`, `round_closed/impl_receipt/audit_receipt/review_receipt` = `false` |
| 33 | §1.8.4 порядки величин из `EXPERIMENTS-LOG.ru.md`: `task` 10–32 k; brownfield-дельта ≈10 k; recover V2 10,8 k (reason 334) vs V1 129 k (reason 68 k); repair 25–79 k; authoring in≈83 k / total≈136 k; migration 196 k–831 k; round-trip 98 k–248 k | **OK** | `:29` (83k→49k, total 136k), `:54/:64` (32235), `:102-105` (10926/10878), `:89` (~10k), `:9/:14` (25271 / 78877), `:170` (129381→10790, reason 68249→334); migration/round-trip — из моей выгрузки `.results` |
| 34 | `EXPERIMENTS-LOG.ru.md:8-10` «~93–95 % токенов — ВХОД + reasoning, запись ~5 %» | **OK** | дословно |
| 35 | §1.9 RC-scratch: `# tests 84 # suites 14 # pass 83 # fail 1`, `not ok 14 - provisioner gives fixture scenarios unique isolated directories`, `gennady dist is missing at …/dist; run npm run build first` | **OK (воспроизведено)** | мой прогон совпал построчно, включая имя кейса и текст ошибки |
| 36 | Делта 84→90 = +4 от `95329c19` (`checkCompletion (R-COMPLETE, both outcomes, from disk)`, 4 кейса) и +2 от `3d5f66a7` (`provision-gennady.test.ts`: «materializes the local built dist and a bin shim that execs it», «REFRESHES a stale sandbox dist on re-provision (no blanket skip)») | **OK** | диффы коммитов дают ровно эти 4+2 кейса и +2 `describe`; 84+6=90, 14+2=16 — цифра 90/16 выводится арифметически |
| 37 | `provision.ts:1127` `findGennadyRoot` требует собранный `dist/` | **OK** | текст ошибки взят из этой функции; кейс единственный интеграционный в «fake-backed» сюите |
| 38 | `npm run test:topology` → `unit=211 contract=16 local=51 external=8`, `observed=227 black-box=59` | **OK (воспроизведено)** | вывод совпал символ в символ |
| 39 | `scripts/test-topology.ts:25-36` `V2_GATE_EXCLUDED_NAMES` с `'harness.test.ts'` и обоснованием «под c8 детерминированно превышает бюджет offline-гейта» | **OK** | `:25-37`, `harness.test.ts` — `:36`; обоснование дословно |
| 40 | «`test:sdd-flow-eval` не встречается ни в `cli/`, ни в `shared/`, ни в `scripts/` → `npm run check` не гоняет flow-eval-suite вообще; 29 кейсов вне любого гейта» | **НЕВЕРНО** | встречается в `scripts/test-topology.ts:34`; `package.json:51` `"test": "…test-topology.ts deterministic"`, `TEST_ROOTS` включает `ai` (`:19`), `deterministic` = unit+contract+local+external (`:216-219`) минус исключения (`:164`) → **68/90 кейсов в гейте**; вне — только `harness.test.ts` (**22** кейса) |
| 41 | `README.md` обещает «no OpenCode server needed» и молчит про `npm run build` | **OK** | `:65-71`; слова `npm run build` в README нет (косвенно `:24` «copies the built SDD (`dist/**`…)») |
| 42 | `package.json:78` `check` = `sdd-verify --profile full` | **OK** | дословно |
| 43 | `ROADMAP.ru.md:63` «Итог (все цели закрыты)» + `suite 71/71` | **OK/±4** | `:63` — заголовок дословно; «flow-eval suite 71/71» — на `:59`. Разрыв 90−71 = 19 подтверждён |
| 44 | `types.ts:38-39` обещает грейд миграции «sdd-state=v2 + sdd-check clean» — противоречит `migration-grade.ts` | **OK** | `:37-38` и `:68-69` — оба места; противоречие реально |
| 45 | README «Documentation map» перечисляет 4 документа из 15 | **ЧАСТИЧНО** | в `ai/flow-eval/**` **14** `.md` (10 в корне + 4 в `docs/`); карта перечисляет 4 (+`operator-approve.sh`, не документ). Верная формула — «4 из 14»; перечень отсутствующих в B7 верен и даёт ровно 10 |
| 46 | `RUNBOOK.ru.md` 211 строк, `WRITING-EVALS.ru.md` 158, `docs/swiftlint-toolchain-setup.md` 61 | **OK** | 211 / 158 / 61 |
| 47 | `evidence.ts:244-296` `readUsage` суммирует воркера + дочерние сессии, `:283` `cacheRead`; `:169-184` прогресс детей; `:125` `child:<label>:<role>` | **OK/±6** | докблок `:243-249`, функция `:250-…`; `:283` `acc.cacheRead += n(info.tokens.cache?.read)`; дети — `:291-296`; `:125` дословно |
| 48 | `ai/flow-sim` — 13 md, ни одного npm-скрипта | **OK** | 13 файлов; `grep flow-sim package.json scripts` — пусто (совпадает с A2 §6.8) |
| 49 | `sync.e2e.test.ts` — 6 кейсов (перечислены), `sync-skills.e2e.test.ts` — 4 | **OK** | все 10 заголовков совпали дословно |
| 50 | `grep -rn "preserved\|manifest" cli/cmd/sync/*.ts cli/cmd/sync-skills/*.ts` — пусто, механизма владения нет | **OK** | по этим глобам пусто; единственное совпадение во всём поддереве — комментарий в `cli/cmd/sync/__tests__/sync.cmd.test.ts:276` |
| 51 | 8 непокрытых поверхностей по A2 §6.7 | **OK** | A2 §6.7 даёт ровно эти 8 (роутер, infra-авторинг, interface-авторинг, код-ревью, reconcile, discover-from-code, батч-execute, module decomposition) |
| 52 | `fixture-coverage.test.ts` лочит `c8` + `scripts/test-coverage.mjs` без glob-токенов, причина — `GLOB_META` в фингерпринте receipt'а | **OK** | файл дословно подтверждает оба пункта и обе исторические регрессии (chain8/chain9) |
| 53 | `rt-regen/package.json` — readiness-шим, `type-check`/`test`/`test:coverage`/`format` = `node -e "process.exit(0)"` | **OK** | и на диске, и в `scripts/roundtrip-readiness-shim.package.json`; `lint`/`format:fix`/`lint:fix` при этом настоящие (`gennady lint`) |
| 54 | `migration-eval.sh`: `worktree add -b <br> <fx> <base>`, оверлей v2-директив `:35`, `MAX_OBS=40` `:19`, `--observe-every-ms 90000 --stuck-after 4 --concurrency 1` | **OK** | `:31-35`, `:19`, `:47-48` — дословно |
| 55 | §4 «для round-trip — 150 (как в fc2)» | **OK** | логи: `roundtrip-fc1.log`/`fc2.log` — `--max-observations 150`, `rt7` — 120, `migration-r6` — 40 (дефолт скрипта `MAX_OBS=60`) |
| 56 | `fixture-detmig`: `gennady.yaml` c `stack.use: [anystack]`, три `extraGates`, у `swiftlint` — `cwd: MRCloudApp`, `argv: [mise, exec, --, swiftlint, lint, --strict]`, `timeout: 10m`, два `envFail` с `outputMatches`/`exitCodeMatches`/`hint`, `fixer` | **OK** | 247 строк, `- id:` = `swiftlint` (`:23`), `build` (`:97`), `unit-tests` (`:155`); все перечисленные поля на месте |
| 57 | `Tools/Artifactory/.netrc` в дереве фикстуры | **OK** | присутствует в `ls-tree` |
| 58 | §3 G4: у мигрированного дерева 2-колоночные §5 → `SDD_VERIFICATION_TABLE_INVALID` ×7; `<!--SCOPE-TYPE: infrastructure-->` вместо секции; нет `PHASE_RECEIPTS:v1`/`COVERAGE_POLICY:v1`; `sdd-state` «SCOPE_TYPE is not found» | **OK (воспроизведено)** | мой прогон на `fixture-detmig`: `| Command | Required by |` в 7/7 тикетах; ровно 7 × `error: SDD_VERIFICATION_TABLE_INVALID`; `<!--SCOPE-TYPE: infrastructure-->` в строке 1 спеки; 0 файлов с `PHASE_RECEIPTS:v1`, 0 с `COVERAGE_POLICY:v1`; `sdd-state` → `FLOW_VERSION=v2`, `AUTHORING_SCOPE_DIAG=infra-base scope 'infra-base': SCOPE_TYPE is not found`, `EXECUTION_READY=no` |
| 59 | «а `sdd-check` молчит» (про 2-колоночные §5) | **НЕВЕРНО** | `sdd-check --all` даёт их как **error** ×7. Итог прогона: `[sdd-check] 25 error(s), 141 warning(s) across 13 file(s)`; гистограмма: `SDD_BDD_COVERAGE_ROW_UNPARSED` 63w, `SDD_LANGUAGE_CALQUE` 60w, `SDD_TABLE_CELL_TOO_LONG` 13w, `SDD_DEP_UNRESOLVED` 9e, `SDD_VERIFICATION_TABLE_INVALID` 7e, `SDD_BDD_SCENARIO_UNTESTED` 6e, `SDD_BROKEN_SPEC_ANCHOR` 5w, по 1e — `SDD_TABLE_CELL_MULTI_SENTENCE`, `SDD_PORTAL_ORPHAN_SPEC`, `SDD_BDD_MISSING_NEGATIVE` |
| 60 | `sdd-task.cmd.ts:123`, `:459-487` жёстко блокируют impl-фазу без `EXECUTION_READY` | **OK, с оговоркой** | `:123` `pickable = readiness.executionReady ? graphPickable : queuePickable`; `:461-487` — блок для всех `kind` вне `UNGATED_KINDS = ['bootstrap','config','doc']`. Оговорка: есть исключение `:464-478` (infra-queue exemption для тикетов, которые сами строят отсутствующие гейты) — «жёстко» верно для go-фикстуры, но не абсолютно |
| 61 | G3-локи: `group-receipt.test.ts`, `group-receipt.cmd.test.ts`, `group-receipt.check.test.ts`, `phase-receipt.test.ts`, `phase-receipt-check.test.ts`, `audit-group.test.ts`; коды WARN + grandfather по `PHASE_RECEIPTS:v1`; аксиомы `AX_GROUP_AUDIT_LEAVES_A_RECEIPT`/`AX_GROUP_REVIEW_LEAVES_A_RECEIPT` | **OK, пути неточны** | все шесть файлов существуют, но 3 из них — не в `shared/sdd/__tests__`: `cli/cmd/sdd-check/__tests__/group-receipt.check.test.ts`, `cli/cmd/sdd-check/__tests__/phase-receipt-check.test.ts`, `cli/cmd/sdd-log/__tests__/group-receipt.cmd.test.ts`. `severity: 'warn'` — `group-receipt.ts:316`, grandfather-маркер `<!--PHASE_RECEIPTS:v1-->` — `:24-25`, `:82-87`; аксиомы — `execute.directive.xml:57`, `:77` |
| 62 | A2 §7: `gennady` сам на v1 — 127 v1-тикетов, 12 скоупов, 1 v2-тикет | **OK** | A2 §7.1 подтверждает (138 файлов в `tasks/`, 127 тикетов, 12 скоуп-каталогов, 1 `*.task.<ID>.md`) |
| 63 | H-10: `roundtrip-eval.sh` теперь делает `npm run build` перед прогоном (фикс `3d5f66a7`) | **OK** | `:112-113` `npm --prefix "$GEN_ROOT" run build … || exit 2`; диффом добавлено именно в `3d5f66a7` |
| 64 | «Все round-trip-числа до 07.09 надо считать на неизвестной сборке» | **OK** | `3d5f66a7` датирован 2026-09-07 08:13, все 14 прогонов — 05–06.09; диff `provision.ts` подтверждает blanket-skip до фикса |

**Новое (в B7 отсутствует).**

- `migration-grade.ts:79` в докблоке обещает «Pass = repo is v2 AND no migration-introduced **ERROR-severity** findings», а код (`:96-97`) фильтрует только 3 кода из `MIGRATION_CRITICAL_CODES`. Внутренний дрейф дока против кода — в ту же копилку, что `types.ts:38-39`; при правке E-07 надо править и докблок.
- `README.md:29` описывает `scenarios.json` как «The reference scenarios (authoring, scaffold, execute, repair)» — три `task`-сценария не упомянуты. Ещё один пункт к оценке «Документация C+».
- `session-metrics.py` пишет `impl_receipt` (`SDD_PHASE_RECEIPT` в тикете, `:96`), но **не гейтит** его; `checkCompletion` про impl-receipt не знает вовсе. Плюс python-гейт при **отсутствующем** артефакте даёт GREEN (все проверки внутри `if s["guard_written"]`, `:170`), а `checkCompletion` — FAIL `'declared artifact was not produced'`. То есть H-14 надо переписать: барьеры **уже разошлись**, а не «могут».

---

## § Зрелость (проверка §2)

Оценки по девяти измерениям я перепроверил на своих прогонах. Семь из девяти считаю обоснованными, две требуют правки.

| Измерение | B7 | Моя | Комментарий |
|---|---|---|---|
| Детерминизм (юнит-слой) | A− | **A−** | подтверждено: 84/84 (RC-scratch, кроме dist-кейса), 90/16 выводится арифметически; both-way на каждом реализованном правиле подтверждён по заголовкам (`quality-gate.test.ts:12,32`, `brownfield-spec-golden` 19, `migration-grade` 7, `infra-golden` 3) |
| Детерминизм (гейтов прогона) | B | **B** | оценка та же, **аргумент другой**: R1 не «не понимает вывод», а не имеет исхода для «0 errors + warnings» (см. § Итог п.6). Формулировка «3 правила из 7 заявленных» — сконструирована: в `QUALITY-RULES.ru.md` бэклог из **6** правил (R1, R3, R6, R2, R4, R5), реализовано из них **1**; `MIGRATION` и `R-COMPLETE` — вне бэклога. Точнее: «1 из 6 бэклоговых + 2 внебэклоговых» |
| Судья | C | **C** | подтверждено и усилено: дефект `parseVerdict` воспроизведён прогоном регекспа; 14/14 fail (не 13/13); рубрика без `DONE`/audit |
| Реалистичность фикстур | B/D | **B/D**, D усилить | к аргументу «readiness-шим» добавляется: обе «реальные» фикстуры невоспроизводимы — `fixture-detmig` держит 14 незакоммиченных изменений (уже мигрированное дерево), `rt-regen` живёт на eval-ветке `eval/run/roundtrip/regen` с 5 eval-коммитами. Ни одна из них не описывается своим HEAD |
| Наблюдаемость / телеметрия | B+ | **B+** | подтверждено дословно, включая слепоту к субагентам (`session-metrics.py:38-42`) — тот же вывод независимо сделан в A3b §6 |
| Стоимость | B− | **B−** | подтверждено (`cost` = 0 ×**14**, ледждер 1 запись). Отдельно: оценка «execute 60–150 k» **ни на чём не основана** — ни одного execute-прогона в `.results` нет, `EXPERIMENTS-LOG.ru.md` execute-тоталов не содержит (только «execute ~28 tool-calls», `PROGRESS-REPORT.ru.md:97`). Надо помечать как экстраполяцию между `task` (~32 k) и authoring (~136 k) |
| Документация | C+ | **C+** | подтверждено; «4 из 15» → «4 из 14»; добавить `README.md:29` |
| Пригодность к CI | **D** | **C−** | пункт (в) опровергнут: flow-eval-suite (68/90) входит в коммит-гейт через `npm test`. Пункты (а) агрегированный exit-код, (б) `harness.test.ts` вне гейта (22 кейса), (г) хостовая привязка LLM-части — стоят. С одним из трёх аргументов опровергнутым «D» становится завышенно-строгой |
| Изоляция песочниц | A− | **A−** | заголовки локов проверены дословно (`observer aborts immediately when a worker reads installed Gennady bundles`, `observer aborts an SDD CLI probe wrapped in stderr redirection`, `SDK evidence includes bounded untracked artifacts omitted by OpenCode session.diff`, `clean never touches non-sandbox directories`) |

### Реестр рисков §2.1 — сверка с A3b и `EXPERIMENTS-LOG`

Источник указан верно. A3b §6 (`:223`) даёт дословно: «харнесс сам был источником ~половины провалов (untracked diff, парсер вердикта, approval-симуляция, ENOSPC, стёртый лог, backticks, mise-сеть, TMPDIR `//`)» — это ровно **H-1…H-8** B7, один к одному и в том же порядке. H-9 (`probes.sh` в `golden/`) и H-11 (path-кэши фикстур) тоже присутствуют в A3b («фикстуры с path-кэшами (worktree vs clone)»). H-10 корректно атрибутирован `3d5f66a7` (диффом подтверждено). H-12/H-13/H-14 — собственные выводы B7, и все три обоснованы фактами (H-13 — с неверным диагнозом, см. выше).

Итого: реестр **не преувеличен** и «~половина провалов» — не фигура речи, а цитата собственного отчёта сессии. Единственная правка по существу: H-14 из «могут разойтись» в «уже разошлись» (три конкретных расхождения перечислены выше).

«Честный итог зрелости» (§2, конец) — согласен полностью, с поправкой на 14/14.

---

## § Покрытие G1–G4 и сверка с B1–B4

### Независимый вывод «что есть сегодня»

Свёл сам из `scenarios.json` (7 сценариев), `__tests__` (10 файлов / 84 кейса в RC-scratch, 12 / 90 в RC-live), `scripts/*.sh` (4 раннера), `docs/*.md` (4), фикстур cloud-ios (4 worktree):

| Группа | LLM-сценарий из референса | Детерминированный лок | Фикстура | Совпадает с B7? |
|---|---|---|---|---|
| **G1** non-Node | нет | нет | нет ни одной (`grep -E "go\.mod\|Package\.swift\|pyproject"` по `provision.ts` — пусто); есть внешняя `fixture-detmig` + `gennady.yaml` | **да** |
| **G2** sync/ownership | нет и не нужен | 10 e2e-кейсов, ни одного про владение; механизма нет | `E2eContext` | **да** |
| **G3** execution-log / audit | нет (у `slugify-toolchain` нет ни `acceptance`, ни `completion`) | 6 файлов receipt-локов + `R-COMPLETE` 4 both-way | `slugify-toolchain` | **да**, но см. правку про chain10b |
| **G4** миграция | нет в `scenarios.json` (фаза `migration` и режим `v1-to-v2` в типах есть) | `migration-grade.test.ts` 7 both-way | `fixture-mig-run` (@`d9de0f7c16`, сброс на `9c04a878b0`), `fixture-detmig` (@`9c04a878b0`, **грязное, уже мигрированное**) | **частично**: «вторая фикстура / другая точка истории» опровергнута |

Зависимости, которые B7 называет, я подтвердил эмпирически:

- **G1 ← порт VERIFY.** `sdd-state` на `fixture-detmig` даёт `READINESS=not-ready (missing: package.json, type-check, test, test:coverage, format, format:fix, lint, lint:fix, fix, gennady (not installed))`, `EXECUTION_READY=no`. Это ровно то, что описывает `roundtrip-readiness-shim.package.json` («a Swift/iOS repo can never reach EXECUTION_READY»). Блокировка impl-фаз — `sdd-task.cmd.ts:461-487`. Вывод B7 верен.
- **G4 ← полнота мигратора.** Подтверждено четырьмя измерениями (см. § Факты №58). Порядок «сначала полнота мигратора, потом бар» обоснован; но реализация бара дешевле, чем предложено (§ Итог п.7).

### Сверка с B1 §6 (VERIFY)

- **Колонка G1 перечислена неполно.** B7 приводит V-04/V-05/V-06/V-07/V-08/V-09/V-10/V-11/V-12/V-13/V-14. В B1 колонка «G1 = да» стоит **также** у **V-01** (parity-golden: 5 профилей, байтовое сравнение stdout, `validatePhaseReceipt`), **V-03** (`Gate`/`GateStatus` как данные, «`env-fail` не считается gate-failure, но останавливает ладдер») и **V-15** (директивы + `.hbs` + rules cascade). Пропуск V-15 — внутреннее противоречие B7: в §4.2 именно V-15 объявлена «единственной задачей, после которой нужен полный набор LLM-прогонов».
- B1 сам называет `fixture-detmig` внешней фикстурой для V-07/V-08/V-11 — то есть **и B1, и B7 планируют на фикстуре, чьё дерево грязное**. Для V-07 (парсинг `gennady.yaml`) это безразлично, но пункты приёмки E-10 №3 («anystack-проект получает `ready` **без шима**») и №5 («`DerivedData`/`.build` не считаются мутацией дерева») требуют чистого дерева: `verify` под tree-guard отказывается работать с `DIRTY_TREE` (это прямо написано в шапке `gennady.yaml` фикстуры). E-10 надо начинать с «привести фикстуру в воспроизводимое состояние» (закоммитить миграционный результат в eval-ветку или сбросить).
- Обратного расхождения нет: все 14 задач B1 с G1 отображаются в E-10…E-13 плюс «детерминированная шина», кроме python/swift-фикстур (см. B4 ниже).

### Сверка с B2 §3.7 (CHECK/LOG)

B2 перечисляет для G3 шесть сценариев. Отображение на E-05/E-09:

| B2 | В B7 | Комментарий |
|---|---|---|
| G3-1 полный `execute` двух раундов: нет строк вне словаря, `Reopens` = число `triggered-reopen`, у всех фаз receipt | E-09 (частично) + E-05 | E-09 не требует «нет строк вне словаря» — это добавится только после E-05 |
| G3-2 дописать в закрытый раунд → отказ CLI | E-05 «правка закрытого раунда» | **есть** |
| G3-3 значение из Round 1 неверно в Round 3 → `correction`, старая строка «разрешённая», копия значения в спеке — находка | **нет** | пропуск |
| G3-4 пустой scope → `SDD_NO_TICKETS_FOUND`, а не «clean» | **нет** | пропуск, и он смыкается с собственной находкой B7 про R1: «нет находок» ≠ «всё хорошо» |
| G3-5 мигрированный тикет с `## Critic Rounds` → нумерация от лога | E-05 «`nextRoundNumber` по секции» | **есть** |
| G3-6 фаза `DONE`, написанная `line` вместо `complete` → находка | **нет** | пропуск (`SDD_EXECUTION_LOG_PHASE_UNRECEIPTED_DONE`, B2-07) |
| G4-добор: тикет с v1-заголовком `\| Phase \| Kind \| Status \| Target Files \| Deps \|`; тикет без `## Phases Overview` | **нет** | оба должны быть в E-06 (полнота мигратора), иначе мигратор молча пропускает все фазовые проверки (B2-09/B2-10) |

Итого: **4 расхождения** — три сценария G3 и два миграционных кейса G4 из B2 не отображаются ни в один eval-таск B7.

### Сверка с B3 §3.6 (SYNC/OWNERSHIP)

B3 определяет G2 как e2e-корпус из **8 фикстур** с бинарной метрикой `assert.deepEqual(treeAfter, expectedTreeAfter)` по `<path>\tsha256`. E-04 — 6 `assert`, дописанных в существующие файлы. Расхождения:

| B3 фикстура | В E-04 | Комментарий |
|---|---|---|
| `greenfield` | нет (есть существующий «first run») | покрыто существующими кейсами |
| `patched-directive` | E-04 №1 | **есть** |
| `project-owned-registry` (Swift-реестр + `coding/swift-rules.xml`) | E-04 №2 (частично: только `knowledge.xml`) | rule-файлы каскада не покрыты |
| `stale-package-file` (снят с поставки: удалён; правленный на диске: сохранён с warning) | **нет** | E-04 №4 покрывает только зеркальную половину («снят с поставки → удаляется») |
| `project-skills` | E-04 №3 | **есть** |
| `v1-consumer` (первый v2-sync **не удаляет ничего** + migration-hint; пересечение **G2/G4**) | **нет** | пропущен, хотя B3 называет G2 блокером релиза именно из-за потери чужих данных |
| `linked-checkout` (CLI из клона без `node_modules/gennady`) | **нет** | SO-8 |
| `surface` golden (`deployed-surface.golden.txt`, утечка dev-home в **содержимом**) | **нет** | SO-5; в E-04 есть только существующий кейс «не содержит dev-machine-путей» |

Плюс: B3 объявляет G2 **воротами релиза v2** («G2 обязана быть зелёной до релиза»), B7 ставит E-04 как «S, сразу, ни от чего не зависит» — приоритет совпал, статус ворот не отражён. И метрика: B3 требует полного сравнения дерева по хэшам, B7 — 6 точечных `assert` (кейс №5 «байтовое сравнение плана» ближе всего).

### Сверка с B4 §5.1 (RULES)

Прямое противоречие в двух местах:

1. **B4 требует три LLM-точки в G1**: (а) `typescript-rules` **не** активируется для `.py`/`.go`/`.swift` (активация семантическая — `<Triggers>` исполняет модель); (б) scaffold python-скоупа кладёт `baseline-rules` + `python-rules` и не кладёт `typescript-rules`; (в) scaffold swift-скоупа без правил идёт по тропе `skip`/`research-and-author`/`defer`, а не выдумывает ссылку. Единственный LLM-сценарий G1 у B7 — `E-G1-llm-go` (**execute** на go-фикстуре). Ни одна из трёх точек B4 туда не попадает: все три — про **scaffold/каскад правил**, а не про execute. **Вся rules-cascade-часть G1 не имеет eval-таска в B7.**
2. **B4 требует один LLM-эвал в G2** («агент, которому сказали добавить правило для нового языка, пишет его в проектный слой, а не в пакетный»). B7 §3 G2 пишет «**LLM не нужен вообще**». Прямое расхождение.
3. **Фикстуры.** B4: «нужны python-репозиторий (`pyproject.toml`), go-репозиторий (`go.mod`), swift-репозиторий (`Package.swift`) … Без новых фикстур G1 нечем измерять — это предпосылка, а не часть задачи». B1 V-10/V-11 тестируют детект по `pyproject.toml` и `Package.swift|*.xcworkspace`. У B7 в плане только `golang-slugify` (E-11); python/swift упомянуты одной фразой в §4.2 («детерминированный аналог E-12»), таска нет. **Двух фикстур из трёх в плане нет.**
4. B4 T-7 требует «миграцию подавлений на фикстурах `cloud-ios`/`messenger`» — messenger у B7 только в вопросе Q2(c). Не противоречие, но messenger нужен минимум двум трекам, и это стоит сказать в Q2.

### Триаж §3.1 — замечаний нет

Восемь поверхностей соответствуют A2 §6.7 один к одному, приоритеты («роутер — высокая, потому что порт VERIFY добавляет ветвление именно в роутер/readiness») обоснованы. Единственное: решение по код-ревью («достаточно механического факта receipt'а») опирается на R-COMPLETE, который живого pass ещё не давал, — то есть «достаточно» пока не проверено ни разу.

---

## § План eval (проверка §4)

**Минимальность.** Заявка «один эвал на группу» выдержана формально, но не фактически: G1 получает 4 таска (E-10…E-13), G3 — 3 (E-02, E-05, E-09), G4 — 4 (E-06…E-08, E-14), G2 — 1. Это правильнее, чем буквальная «одна штука на группу», но тогда стоит переименовать принцип в «один **бар** на группу», иначе §3 и §4 расходятся.

**Детерминированность приёмки.** Выдержана честно: из 16 тасков **11 имеют цену 0**, судья нигде не является баром, во всех LLM-тасках приёмка — golden/R-COMPLETE/MIGRATION. Это правильное следствие 14/14 fail. Дисциплина «both-way юнит-тестом на чистой функции, а не прогоном» — прямо соответствует `QUALITY-RULES.ru.md:15-16`.

**`--max-observations` как параметр приёмки** — поддерживаю, цифры сверены с логами (task 6–8, migration 40, round-trip 120–150).

**Цены.**

| Оценка B7 | Проверка |
|---|---|
| E-03 «≈11 k (infra)» | **сходится**: `infra-makefile`-класс измерен 10926/10878 (`EXPERIMENTS-LOG:102-105`) |
| E-08/E-14 «≈430 k», «медиана ≈430 k» | **сходится**: 7 миграционных прогонов, медиана 442 442, диапазон 196 547–831 583 |
| E-13 «30–60 k» (go execute) | **не выведено**, но правдоподобно (аналог `task`+ = 32 k) |
| E-03/E-09 «60–150 k» (execute) | **не выведено ни из чего**: execute-прогонов в `.results` нет, execute-тоталов в докладах нет. Пометить как экстраполяцию |
| E-14 «≈1–3 M (×3–5 от cloud-ios)» | множитель произволен; при 12 скоупах и 127 тикетах против 1 скоупа / 7 тикетов масштаб ближе к ×10 по входу. Оценку надо давать интервалом с явной оговоркой |

**Регрессии.** Общая шина (`__tests__` + `test:topology` + `check` + `check:directives-fresh`/`check:directive-budgets`/`audit:axioms`) — воспроизводима, я прогнал две из четырёх строк, обе совпали. Greenfield-execute после изменения директив включён и обоснован верно: заявление PROGRESS-REPORT о chain10b действительно старше `4bb00f4b` (STEP_6/STEP_7). Таблица «задача → что ломает → регрессия ПОСЛЕ» соответствует B1 §6 по составу задач.

**Чего в плане не хватает.**

1. **Самомиграция `gennady` — не опция.** См. § Итог п.8. E-14 надо перевести из «опционально» в обязательный G4-таск, привязанный к Шагу 4 плана, и убрать соответствующую опцию из Q2 (оставив только «сколько cloud-ios-точек добавляем сверх этого»).
2. **`fixture-detmig` не приведена в воспроизводимое состояние.** Ни один таск (E-06/E-08/E-10) не начинается с фиксации состояния фикстуры, хотя её дерево грязное на 14 записей и содержит результат прошлого детерминированного прогона миграции. Нужен таск-предшественник размера S: закоммитить/сбросить, зафиксировать base-SHA в переменной, и только потом мерить.
3. **Второй **настоящий** снапшот отсутствует.** Поскольку `fixture-detmig` = `9c04a878b0` = база `fixture-mig-run`, E-08 в текущем виде не даёт нового сигнала. Варианты: (а) взять реально другую точку истории cloud-ios; (б) messenger; (в) сам `gennady` (и он всё равно обязателен по п.1). E-08 как написан — самый дорогой таск с нулевой новой информацией.
4. **python- и swift-фикстуры** (требование B4 и предпосылка B1 V-10/V-11) — тасков нет.
5. **Rules-cascade LLM-точки G1** (три штуки из B4 §5.1) — тасков нет.
6. **G2-фикстуры `v1-consumer`, `linked-checkout`, `stale-package-file`, `deployed-surface` golden** (B3 §3.6) — в E-04 не входят; `v1-consumer` — блокер релиза по B3.
7. **G3-сценарии B2 G3-3/G3-4/G3-6** и **два миграционных кейса G4** из B2 §2.6 — тасков нет.
8. **Messenger-снапшот** нужен как минимум двум трекам (B4 T-7 и G4), но в плане присутствует только как вариант ответа в Q2.
9. **E-01 в текущей формулировке решает не ту задачу** (см. § Итог п.6): нужен один предикат «0 error(s) при наличии warnings = pass» + both-way кейс на замороженной строке `[sdd-check] 0 error(s), N warning(s) across M file(s)`, а не сбор реальных выводов.
10. Мелочь: E-00 предлагает «вернуть `harness.test.ts` в коммит-гейт» — но исключение обосновано бюджетом под c8 (`test-topology.ts:31-35`). Дешевле и честнее: отдельный шаг `npm run test:sdd-flow-eval` в `check`-цепочке без c8, что B7 и предлагает как альтернативу — надо сделать её основной.

---

## § Вопросы (проверка §5)

| # | Форма | Дубли | Замечания |
|---|---|---|---|
| Q1 «Чем считается PASS» | 4 опции, рекомендация есть | нет | Хорошо поставлен. Факт поправить: 14/14. Опция (b) («`budget-exhausted` как отдельный исход») сильнее, чем кажется: она устраняет H-12 механически и совместима с (a) — стоит сказать, что (a)+(b) не взаимоисключающи |
| Q2 «Сколько снапшотов в G4» | 4 опции | нет | **Мис-фрейминг**: (a) «Только cloud-ios, две точки (`fixture-mig-run` + `fixture-detmig`) — минимум, закрывает две разные истории одного репозитория» — это **одна и та же точка** (`9c04a878b0`). Опцию надо переписать. И `gennady` (b) уже решён оператором — не опция |
| Q3 «Где хранить фикстуры» | 3 опции, рекомендация есть | нет | Хорошо поставлен, факты подтверждены (`~/.gennady/eval/cloud-ios/*` вне репо; `session-metrics.py:19-21`, `migration-eval.sh:12-13,21`, `roundtrip-eval.sh:19-21,27` — абсолютные пути; `Tools/Artifactory/.netrc` в дереве). Добавить в приёмку (a) ещё и «фикстура воспроизводима из SHA» — сегодня это не так |
| Q4 «Модель владения при sync» (§4.3 п.4) | 2 опции | **дубль B3 D-1** (4 опции) | И хуже сформулирован: в `main` `preserved` для `knowledge.xml` (`f74c8c1d`) и манифест скиллов (`62172906`) — **не альтернативы**, а две разные поверхности (SO-1 и SO-2 у B3). Вопрос надо снять в пользу B3 D-1 и просто сослаться на него |
| Q5 «Судья: одна модель или разделить» | 4 опции, рекомендация | нет | Хорошо поставлен; факт `runner.ts:53-60` → фактически `:55-60` (комментарий «Same model is allowed…»). Опция (c) фактически совпадает с Q1(a) — стоит их связать явно |
| Q6 «Порядок полнота↔бар» | 3 опции | нет | Хорошо поставлен. С учётом того, что бар получается добавлением кодов в `MIGRATION_CRITICAL_CODES`, вариант (b) «RED-first» становится почти бесплатным (S), и рекомендация (a) уже не так очевидна — это стоит сказать в тексте вопроса |

Отдельно: §4.3 («что должен решить оператор») и §5 («вопросы оператору») пересекаются на 3 из 5 пунктов (модели ↔ Q5, потолки/снапшоты ↔ Q2/Q3, WARN→ERROR — только в §4.3). Стоит слить в один список, иначе оператор отвечает дважды. Пункт «`SDD_GROUP_AUDIT_MISSING`/`SDD_GROUP_REVIEW_MISSING`: WARN→ERROR» вопросом не оформлен вовсе, хотя блокирует приёмку E-09, — и он дублирует открытый вопрос B2 §3.9 п.2 (grandfathering как постоянное состояние: маркер `<!--PHASE_RECEIPTS:v1-->` не несёт **ни один** тикет RC).

---

## § Правки к B7

**Блокирующие (меняют выводы или цену задач).**

1. §1.8, §2 (три строки), §4.2, Q1: **13 → 14** прогонов; «13/13 fail» → «14/14 fail»; «12/13 running» → «13/14 running». Таблица §1.8 уже содержит 14 строк — исправить только текст.
2. §1.9, §2 «Пригодность к CI (в)»: удалить утверждение «`npm run check` не гоняет flow-eval-suite вообще». Верно: `npm test` = `test-topology.ts deterministic`, `TEST_ROOTS` содержит `ai`, режим гоняет unit+contract+local+external минус `V2_GATE_EXCLUDED_NAMES` → **68 из 90** кейсов в гейте; вне гейта только `harness.test.ts`. Оценку CI пересмотреть с **D** на **C−**. E-00 переформулировать: «вернуть `harness.test.ts` отдельным шагом без c8», агрегированный exit-код оставить как есть (он остаётся главной дырой).
3. §1.9, §2, §1.10: **`harness.test.ts` = 22 кейса**, не 29 (прогон: tests 22 / pass 21 / fail 1). Цифра 29 (и сумма 46) унаследована из A2 §6.7 — там она тоже неверна.
4. §3 G4 «Что есть», п. про `fixture-detmig`: заменить описание. Фикстура — **не** v1-раскладка, а **грязное уже мигрированное дерево** (14 записей `git status`: 7 `RM tasks/… -> specs/…task.IB-<slug>.md`, `D tasks/README.md`, `D tasks/infra-base/README.md`, `M …infra-base.spec.md`, `?? …infra-base.3-tasks.md`, `?? migration/`, `?? ai/directives/sdd-v2/`). HEAD = `9c04a878b0`.
5. §3 G4 п.3 и E-08 и Q2(a): убрать «другая точка истории». `fixture-detmig` HEAD = `9c04a878b0` = `migration-eval.sh:15` `BASE`. E-08 в нынешнем виде тратит ≈430 k ×2 без новой информации — либо взять реально другой снапшот, либо слить с E-14.
6. §1.5 (третье замечание), §2.1 H-13, E-01: заменить диагноз. R1 читает реальный вывод корректно (`25 error(s)` → `25 sdd-check error(s)`, проверено на `fixture-detmig`); ломается он на «`0 error(s), N warning(s)`», потому что `✅ clean — N file(s) checked` печатается только при `findings.length === 0` (`cli/cmd/sdd-check/sdd-check.types.ts:148-151` vs `:164`). Фикс — один предикат («0 ошибок при любом числе ворнингов = pass», как в `cli/cmd/sdd-check/help.ts:92`) + both-way кейс на замороженной строке. Размер E-01 остаётся S, но содержание другое.
7. §1.6 (строка `migration`), §3 G4 «Чего нет» п.2(а), E-06/E-07: убрать «а `sdd-check` молчит». `sdd-check --all` на `fixture-detmig` даёт **7 × `error: SDD_VERIFICATION_TABLE_INVALID`** (итог: 25 errors / 141 warnings / 13 files). Следствие для E-07: «третий бар» = добавить `SDD_VERIFICATION_TABLE_INVALID` (плюс отсутствие секции `SCOPE_TYPE` и `PHASE_RECEIPTS:v1`) в `MIGRATION_CRITICAL_CODES` (`migration-grade.ts:31-35`) — S, через уже работающий baseline-diff, без нового механизма. Заодно поправить докблок `migration-grade.ts:79`, который обещает «no migration-introduced ERROR-severity findings».
8. E-14 и Q2: самомиграция `gennady` — **обязательный** таск G4, а не опция. Решение оператора уже есть: «Когда мигрируем архив `tasks/` v1→v2 (127 тикетов, 11 скоупов)?» → «Финальным проходом (рекомендую)» + выбранный путь «Шаг 4: миграция `tasks/` v1→v2 + вычистка v1». Эвал должен ехать на этом прогоне.
9. §4.1: добавить таск-предшественник (S) «привести `fixture-detmig` и `rt-regen` в воспроизводимое состояние (SHA + чистое дерево + `EVAL_FIXTURES_ROOT`)». Без него E-06/E-08/E-10 не воспроизводимы, а E-10 пункты 3 и 5 вообще не запустятся под tree-guard (`DIRTY_TREE`).
10. §4.1: добавить тасками пропуски из B1/B2/B3/B4 — python- и swift-фикстуры; три LLM-точки rules-cascade из B4 §5.1; LLM-точку G2 из B4 («куда агент пишет новое правило») **или** явно зафиксировать несогласие с B4; G2-фикстуры `v1-consumer` (блокер релиза по B3), `linked-checkout`, `stale-package-file`, `deployed-surface` golden; G3-сценарии B2 G3-3/G3-4/G3-6; два миграционных кейса из B2 §2.6.
11. §3 G1: дополнить перечень колонки G1 из B1 §6 задачами **V-01**, **V-03**, **V-15** (все три помечены «да»). V-15 особенно — B7 сам в §4.2 называет её единственной задачей, требующей полного набора LLM-прогонов.
12. Q4 (§4.3 п.4): снять как дубль B3 D-1 и как мис-фрейминг («манифест **vs** `preserved`» — это SO-1 и SO-2, разные поверхности, не альтернативы). Q2(a) переписать (см. п.5).

**Не блокирующие (точность).**

13. §3 G3 «Чего нет»: уточнить первый пункт. Живой прогон с `Status: [x] DONE` + квитанциями P1/P2 + `sdd-verify P2` ALL PASS 3/3 + judge pass 2/2 **был** — chain10b (`PROGRESS-REPORT.ru.md:70-73`). Не было живого прогона с **групповыми** `SDD_AUDIT_RECEIPT`/`SDD_REVIEW_RECEIPT` и с `R-COMPLETE`. Как написано сейчас, база занижена.
14. §2.1 H-14: «могут разойтись» → «уже разошлись»: (а) при отсутствии артефакта `session-metrics.py` `gate` даёт GREEN (все проверки под `if s["guard_written"]`, `:170`), а `checkCompletion` — FAIL `'declared artifact was not produced'`; (б) python пишет `impl_receipt` (`SDD_PHASE_RECEIPT`, `:96`), но не гейтит; TS о нём не знает.
15. §2 «Детерминизм (гейтов прогона)»: «3 правила из 7 заявленных» → «из 6 правил бэклога `QUALITY-RULES.ru.md` (R1, R2, R3, R4, R5, R6) реализовано 1 (R1); `MIGRATION` и `R-COMPLETE` реализованы вне бэклога и в него не внесены».
16. §2 «Документация»: «4 документа из 15» → «из 14» (10 в корне `ai/flow-eval` + 4 в `docs/`). Добавить пункт: `README.md:29` описывает `scenarios.json` как «(authoring, scaffold, execute, repair)», умалчивая три `task`-сценария.
17. §2 «Стоимость» и E-03/E-09: помечать «60–150 k» как экстраполяцию — измеренных execute-прогонов нет ни в `.results`, ни в `EXPERIMENTS-LOG.ru.md` (есть только «execute ~28 tool-calls», `PROGRESS-REPORT.ru.md:97`). E-14 «≈1–3 M» — множитель ×3–5 произволен, при 12 скоупах/127 тикетах против 1/7 честнее ×10 по входу с явной оговоркой.
18. §3 G1 и §2 «Реалистичность фикстур»: `rt-regen/package.json` — 4 no-op из **8** скриптов; `lint`/`format:fix`/`lint:fix` вызывают настоящий `gennady lint`. Формулировка «4 из 6 npm-гейтов» требует ссылки на состав readiness-контракта.
19. §3 G3 «Что есть»: поправить пути — `group-receipt.check.test.ts` и `phase-receipt-check.test.ts` лежат в `cli/cmd/sdd-check/__tests__`, `group-receipt.cmd.test.ts` — в `cli/cmd/sdd-log/__tests__`, а не в `shared/sdd/__tests__`.
20. §3 G1 «Зависимости»: у `sdd-task` есть исключение `:464-478` (infra-queue exemption) — «жёстко заблокирует» верно для go-фикстуры, но формулировку стоит уточнить, иначе E-12 может быть спроектирован в обход бара.
21. Номера строк (факт верен, ссылка сдвинута): `runner.ts` — `runAll` `:156-167`, бюджет `:91-105`, судья `:139-151`, наблюдатель `:83-90`, «Same model is allowed» `:55-60`; `cli.ts:307` → `:316`; `roundtrip-eval.sh` `write_scenario` `:82-102`, `completion` `:93-97`; `session-metrics.py` `gate` **`:164-186`** (не `:186-207`), `state_metrics` `:81-99`, пути `:82-84`; `quality-gate.ts` `CompletionSignals` `:62-74`, `CompletionTargets` `:113-121`; `ROADMAP.ru.md` «suite 71/71» на `:59`; `types.ts` фазы `:30-39`, режимы `:42-70`.
22. §5/§4.3: слить в один список (3 из 5 пунктов §4.3 дублируют Q2/Q3/Q5) и оформить «WARN→ERROR для `SDD_GROUP_*_MISSING`» как полноценный вопрос с опциями — он блокирует приёмку E-09 и дублирует открытый вопрос B2 §3.9 п.2 (маркер `<!--PHASE_RECEIPTS:v1-->` не несёт ни один тикет RC, то есть grandfathering выключил проверки на всём корпусе).
23. §3 «Принцип оператора: один минимальный эвал на ГРУППУ» — переименовать в «один **бар** на группу»: фактически G1 получает 4 таска, G3 — 3, G4 — 4. Иначе §3 и §4.1 читаются как противоречащие друг другу.
