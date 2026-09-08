ВЕРИФИКАЦИЯ — Пачка 4 «Спеки журнала и проверок описывают то, что есть в коде»

Проверяющий: `plan-verifier` (свежие глаза, read-only; единственный записанный файл — этот).
Предмет: ветка `lead/specs-match-code` (`585537ac`), база `f16d7f17` (PR #28), 8 коммитов; отчёты `R-B2-{17,05,03,09,11,14,08,15}.md` + `R-BATCH-04-specs-match-code.md`.
Дерево: `scratchpad/rc-v6` (git status чист, HEAD = `585537ac`). Для контрольных измерений сделан отдельный **scratch-клон** `scratchpad/base-clone` (`git clone --shared`), rc-v6 не менялся.

**Методическая находка, влияющая на все счётчики.** Первая попытка снять базовую точку через `git archive f16d7f17 | tar -x` дала 205/431 вместо 198/431: `SDD_REQUIREMENT_ENTRY_TOO_LONG` (7 находок) грандфазерится против git-HEAD (`checkRequirementBudgetsAgainstBaseline(file, content, getHeadContent(repoRoot, …))`, `shared/sdd/requirement-budget.ts:200-262`), а в дереве без `.git` baseline = `null` и проверка срабатывает на всём. Валидная база — только git-бэкед чекаут. Все числа ниже сняты на `base-clone` c HEAD=`f16d7f17` и на `rc-v6`, одним и тем же бинарём `rc-v6/dist/gennady.js`.

---

## A. Полнота

| Утверждение | Проверка | Вердикт |
|---|---|---|
| `git diff --stat f16d7f17..585537ac` = 38 файлов, +876/−163 | воспроизведено дословно | **ПОДТВЕРЖДЕНО** |
| каждый файл диффа имеет строку в таблице файлов какого-то отчёта | скрипт: basename каждого из 38 файлов ищется в `R-B2-*.md`/сводном | **ПОДТВЕРЖДЕНО** (37/38 дословно; `vcs-mr-client.task-90.md` в `R-B2-15` записан сокращённо «`…task-90.md`» — покрыт) |
| зона Пачки 5 (11 названных файлов) не тронута | `git diff --name-only \| grep -c` по каждому из 11 → 0 | **ПОДТВЕРЖДЕНО** |
| зона Пачки 1 не тронута | пересечение с `5b37a93e` = **`cli/cmd/sdd-check/sdd-check.cmd.ts`**; пробный `git merge --no-commit 5b37a93e` на `585537ac` → «Auto-merging … went well» | **ПОДТВЕРЖДЕНО как безопасное** (файл общий, конфликта нет) |

**Пересечение с `lead/kit-lint` (`61b86fb8`, общая база `f16d7f17`) — 3 файла, и это НЕ только сгенерированные:**

| Файл | Тип | Пробный merge |
|---|---|---|
| `ai/directives/sdd-v2/scaffold.directive.xml` | build output | авто-merge ок (всё равно перегенерируется) |
| `ai/kit/templates/sdd-v2/audit.directive.hbs` | **источник** | **CONFLICT (content)** |
| `ai/kit/axiom/audit/ax-mechanical-via-sdd-check.xml` | **источник** | **CONFLICT (content)** |

Конфликт **смысловой, а не текстовый**: Пачка 5 (T-B6-18) *удаляет* инлайн-`<Axiom id="AX_MECHANICAL_VIA_SDD_CHECK">` из `audit.directive.hbs` и заменяет на `{{> "axiom/audit/ax-mechanical-via-sdd-check"}}`, делая брик единственным домом; Пачка 4 (B2-11) наоборот *расширяет инлайн-копию* и правит брик руками, документируя его как «осиротевший, не подключён ни одним `.hbs`». После мержа Пачки 5 предпосылка B2-11 («брик осиротел») **становится ложной**, а NOTE-комментарии B2-11/B2-03 об осиротелости — неверными.

**Следствие, которое надо снять до мержа обеих:** новый тест `ai/kit/__tests__/audit-mechanical-check-coverage.test.ts` третьим кейсом утверждает, что все семейства кодов названы **в самом `audit.directive.hbs`** (`AX_MECHANICAL_SOURCE = ../templates/sdd-v2/audit.directive.hbs`). После де-инлайнинга Пачки 5 этот кейс **упадёт**. Порядок мержа: взять структуру Пачки 5 (партиал), содержимое Пачки 4 (6 семейств кодов) — в брик; перенаправить третий кейс теста на `ai/kit/axiom/audit/ax-mechanical-via-sdd-check.xml`; удалить оба NOTE про осиротелость.

---

## B. Существо по задачам (доска `61-TASK-BOARD.md §1`, трек `31-TRACK-CHECK-LOG.md`)

**B2-17** (доска `:80`, трек `:637`). 5 выборочных утверждений спеки против кода:
1. `MODES` = 11 (`sdd-log.cmd.ts:62-74`) ↔ `sdd-log.spec.md:25` перечисляет ровно эти 11 — **ПОДТВЕРЖДЕНО**.
2. `parseArgs`-схема = `task/spec/authoring/phase/format/all/changed` (`sdd-check.cmd.ts:1021-1032`) ↔ §5 спеки, строки 124-130, все 7 — **ПОДТВЕРЖДЕНО**.
3. §3-инвентарь: `buildResolvedLine`, `findPhaseBlockBounds`, `setMetaStatus`, `completeSpecAuthoring`, `checkSpecAuthoringDraft`, `resolveAuditGroup`, `buildGroupReceipt`, `upsertGroupReceipt`, `GroupReceiptKind` — все 9 существуют в коде — **ПОДТВЕРЖДЕНО**.
4. `SDD_TASK_ID_COLLISION` назван в постусловии task-DAG (`sdd-check.spec.md:108`) — **ПОДТВЕРЖДЕНО**.
5. Инвариант `sdd-check.spec.md:20`: «exit `2` ⇔ `--all` резолвит ноль тикетов … `--task`/`--spec`/`--changed` этот код не производят» — **ОПРОВЕРГНУТО как биимпликация**: `unknownIdError` (`sdd-check.types.ts:276-291`) возвращает **exit 2** на `--task <неизвестный Task-ID>` (`ERR_CLI_SDD_CHECK_UNKNOWN_ID`). Про *код* `SDD_NO_TICKETS_FOUND` формулировка верна, про exit-код 2 — нет.

**B2-05** (доска `:71`, трек `:629`).
- Пустой прогон: воспроизведено на пустом дереве — `exit 2`, одна ошибка `SDD_NO_TICKETS_FOUND` с внятным текстом («check the [project-root] argument, or scaffold at least one ticket before auditing») — **ПОДТВЕРЖДЕНО**.
- `--task`/`--all` parity на легаси-тикете, `sdd-check.cmd.test.ts` — **82/82/0** (cwd=rc-v6) — **ПОДТВЕРЖДЕНО**.
- **ОПРОВЕРГНУТО**: R-B2-05 §4 сообщает «пре-существующий несвязанный fail (1 из 82), подтверждён `git stash`». С правильным cwd файл даёт **82 pass / 0 fail**. Это был артефакт обходного пути исполнителя (запуск не из корня `rc-v6`), а не дефект репозитория; строка доказательства в отчёте неверна.
- **Не выполнено и не объявлено отклонением**: трек `:629` требует также «`sdd-check --all` печатает счётчик тикетов под грандфазерингом» — в коде нет, в R-B2-05 не упомянуто. (Смягчающее: счётчик — вариант D4.1, открытое решение оператора; но молчание в отчёте — пробел.)
- **P5 выполнен наоборот**: трек `:629` просит «задокументировать exit 2 (`ERR_CLI_SDD_CHECK_UNKNOWN_ID`) в `help.ts:92`». Фактически `help.ts:96` теперь документирует exit 2 **только** как `SDD_NO_TICKETS_FOUND`, а пред-существующий смысл (`ERR_CLI_SDD_CHECK_UNKNOWN_ID`) в help не упомянут вовсе. Код 2 перегружен двумя разными причинами, различить их по exit-коду скрипт не может.

**B2-03** (доска `:68`, трек `:626`).
- Дом словаря: `shared/sdd/execution-log.ts`, `TOKEN_VOCABULARY` = **13 записей**, `correction` есть — **ПОДТВЕРЖДЕНО**.
- Кто читает: единственный **производственный** потребитель — `shared/sdd/templates.ts:7` → `PROJECT_INDEX_SKELETON` → (а) `specs/3-tasks.md`, (б) через партиал `sdd-skeleton-project-index` → `ai/directives/sdd-v2/formats/project-tasks-index.xml:19` (сверено дословно) — **ПОДТВЕРЖДЕНО**. `isVocabularyToken` и `TOKEN_VOCABULARY_TOKENS` не имеют потребителей вне тестов (гейт `yagni` проходит, но «дом» реально работает только через `formatTokenVocabulary()`).
- **ОПРОВЕРГНУТО/пробел**: доска `:68` требует «согласовать `ver`/`yagni`/**`fix`**/`env-fix`». Токена **`fix` в словаре нет**, и в R-B2-03 он не упомянут ни разу. При этом `fix` — живой токен корпуса: **34 строки** вида `- [x] \`<ts>\` fix …` минимум в 6 тикетах (`DA-lazy-asm`, `agent-inbox.task-161`, `inbox-core.task-173`, `cli-alt-opinion.task-{24,25,26}`). Собранная директива теперь заявляет: «a token outside this vocabulary is `EXECUTION_LOG_INCOMPLETE`» — то есть Пачка 4 объявила 34 существующие строки несоответствующими, ничего об этом не сказав.

**B2-09** (доска `:73`, трек `:671`). `matchPhaseOverviewHeader` + `PhaseColumnMap`, чтение по именам заголовка с фолбэком на исторические позиции; `completePhase` больше не индексирует `cells[1]`/`cells[4]`. `ticket.test.ts` 25/25, `check-phases.test.ts` 12/12, `sdd-log.cmd.test.ts` 65/65 — **ПОДТВЕРЖДЕНО**.

**B2-11** (доска `:75`, трек `:673`). `audit.directive.hbs` называет 6 семейств + group receipts; `STEP_1_MECHANICAL.xml` перегенерирован; `ax-task-id-integrity.xml` переведён на heading-форму `sdd-extract <ticket>#audit-rounds`. Тест покрытия `audit-mechanical-check-coverage.test.ts` — **3/3** — **ПОДТВЕРЖДЕНО**. Оговорка про будущее падение третьего кейса — см. §A.

**B2-14** (доска `:78`, трек `:678`). `templates.ts:1363` Handoff = 4 поля; оба сгенерированных потребителя (`formats/task-ticket-structure.xml:147`, `scaffold.directive.xml:289`) несут 4 поля; рантайм `COMPLETE_HANDOFF_PAYLOAD_RE` (`sdd-log.types.ts:252-253`) требует ровно 4; `COMPLETE_HANDOFF_SKELETONS` держит оба варианта (обратная совместимость) — **ПОДТВЕРЖДЕНО**.

**B2-08** (доска `:72`, трек `:670`). Дифф `ax-reopen-format.xml` содержит все четыре правки: канонический `| ID | Kind | Deps | Status |`; обязательная строка в `PHASES_OVERVIEW`; две формы по D-20; `[~] IN_PROGRESS` вместо `[ ] TODO` — **ПОДТВЕРЖДЕНО**.
**Остаточное противоречие (ОПРОВЕРГНУТО «форма реопена согласована целиком»)**: `reconcile.directive.hbs:123-126` по-прежнему гласит «**Always append a new Round** per `AX_REOPEN_FORMAT`, even for a one-line fix» — тогда как сама аксиома теперь разрешает `#### P<N> — re-run:` внутри ещё открытого Round. Директива и аксиома, на которую она ссылается, учат разному; в правку попали только три `TODO→IN_PROGRESS`, фраза про «always new Round» не тронута и в R-B2-08 не разобрана.

**B2-15** (доска `:79`, трек `:679`).
- Дифф по `tasks/**` прочитан целиком: 3 переименования (`task-35→184`, `task-45→185`, `task-88→186`) с правкой Meta Task-ID и H1; `cli-sync.task-53.md` `TSK-45→TSK-185`; `infra-npm-publish/README.md` — ребро mermaid и строка трекера; `task-{89,90,91,92}` `TSK-88→TSK-186`. Больше ничего. **«Чистки ради зелёного» сверх названного нет** (D-39 соблюдён): битая строка трекера `| [TSK-44...` оставлена как есть; `@tasks:`-заголовки кода не тронуты; пред-существующие `SDD_DEP_UNRESOLVED` на «`None (чистый API-контракт)`»/парентетике не «починены» — **ПОДТВЕРЖДЕНО**.
- `specs/3-tasks.md` — заменены ровно строки 11-12. Обратить внимание: правка Baseline Completion Rule **нормативная** («every phase `[x]`» → «every phase `[x]` **with a current CLI-owned verification receipt**», выпало «verification commands run with exit recorded»). Это ресинк с генератором, т.е. осознанное принятие v2-правила, но это больше, чем «рассинхрон словаря» из строки доски — в R-B2-15 названо, но без акцента.
- `sdd-check --all` → **0 `SDD_TASK_ID_COLLISION`** — **ПОДТВЕРЖДЕНО**.
- **Пробел**: после переименования `TSK-184` и `TSK-186` не имеют строки ни в одном Tracker Index (в их scope-каталогах README вообще нет) → 2 новых `SDD_TRACKER_MISSING_ROW`. Ранее они были замаскированы коллизией (строка близнеца резолвилась по ID). Для `infra-npm-publish` исполнитель строку трекера обновил, для двух других — нет и не объяснил.

---

## C. Гейт `gate:sdd-check-baseline` — КРАСНЫЙ

Воспроизведено дословно (exit 1):
```
[sdd-check-zero-new-error] FAIL — 2 error(s) not present in the baseline (ai/flow-eval/.baseline/sdd-check-227c03a8.json):
  NEW ERROR: SDD_DEP_UNRESOLVED            tasks/vcs/vcs-mr-client/vcs-mr-client.task-186.md
  NEW ERROR: SDD_VERIFICATION_TABLE_INVALID tasks/vcs/vcs-mr-client/vcs-mr-client.task-186.md
```
Обе — **до**: `tasks/vcs/vcs-mr-client/vcs-mr-client.task-88.md`; **после**: `…task-186.md`. Наличие обеих пар в baseline под старым путём проверено чтением `sdd-check-227c03a8.json` (commit `227c03a8`, tag `rc-baseline-1`, 334 находки) — **ПОДТВЕРЖДЕНО, это чистый артефакт переименования, не регрессия**. Ключ сравнения — пара (code, file) без строки (`sdd-check-baseline-compare.ts`, `pairKey`).

### Варианты

**(1) Ребейзлайн решением оператора (D-38).** Семантически самый чистый: путь в baseline устарел после законного переименования. Стоимость — одна команда генератора (`ai/flow-eval/scripts/generate-sdd-check-baseline.ts`) на новом коммите + новое имя артефакта/тега. Требует оператора: и по тексту гейта, и по D-38 это не полномочие Lead.

**(2) B2-15 без переименования файла — ИЗМЕРЕНО, РАБОТАЕТ.** Коллизия Task-ID разрешается правкой **только** `- **Task-ID:**` и H1 внутри файла: ни одна проверка не связывает номер в имени файла с Meta Task-ID (`checkTaskIdGrammar`, `check.ts:895-902`, валидирует только строку Task-ID; `SDD_TASK_ID_GRAMMAR` гейтится по v2-**имени** `*.task.<ID>.md`, а не по номеру). Эксперимент в `base-clone`: `585537ac` + `git mv …task-186.md …task-88.md` (Meta остаётся `TSK-186`), затем `sdd-check --all . --format json` из корня и сравнение по правилу гейта:
```
errors 192  warns 434  collisions 0   NEW vs baseline: []   ← гейт ЗЕЛЁНЫЙ
```
Достаточно откатить **одно** переименование (`vcs-mr-client`): у `task-35`/`task-45` пред-существующих *ошибок* в baseline не было, их переименование добавляет только warn, а warn гейт не роняет никогда. Цена — расхождение «имя файла ↔ Task-ID» на одном легаси-v1-именованном тикете (читаемость), функционально безвредно.

**(3) Научить гейт переименованиям (git rename detection) — не рекомендую.** Модуль сравнения намеренно чистый («no filesystem or process access here, so the verdict is provably deterministic»), а rename detection требует `git diff --find-renames <baseline.commit>..HEAD`, то есть ремап путей пришлось бы вносить в `sdd-check-zero-new-error.ts` (~40-60 строк + тесты). Риски: (а) baseline-коммит `227c03a8` должен быть достижим в CI-клоне (shallow clone ломает); (б) переименованный **и одновременно испорченный** файл проходит под маской rename — гейт теряет смысл именно там, где он нужен; (в) это изменение контракта GAP-B-1/D-38, т.е. само требует решения оператора и принадлежит владельцу GAP-B-1, не Пачке 4.

### Предупреждения: 431 → 434 (+3), а не «432 → 434 (+2)»

Измерено одним бинарём на git-бэкед базе `f16d7f17` (`base-clone`) и на `585537ac` (`rc-v6`): **база 198 error / 431 warn**, **голова 192 error / 434 warn**. Сводный отчёт и все восемь per-task отчётов пишут «432 warning(s)» на базе — **ОПРОВЕРГНУТО** (число из отчётов не воспроизводится; вероятная причина — прогоны исполнителя из чужого cwd в обход песочницы).

Три новых предупреждения (полный set-diff находок):
1. `specs/cli/sdd-log/sdd-log.spec.md: warn: SDD_MODULE_OVERSIZED — Entity Inventory has 26 entities (> 20)` — следствие **B2-17** (§3-инвентарь дополнен утилитами). **Ни в одном отчёте не упомянуто.** Допустимо (advisory, `AX_HIERARCHICAL_SPECS`), но должно быть объявлено: spec-first задача сама завела advisory-долг на декомпозицию `sdd-log.spec.md`.
2. `tasks/cli/update-check/update-check.task-184.md: warn: SDD_TRACKER_MISSING_ROW (TSK-184)` — следствие **B2-15**, ранее маскировалось коллизией.
3. `tasks/vcs/vcs-mr-client/vcs-mr-client.task-186.md: warn: SDD_TRACKER_MISSING_ROW (TSK-186)` — то же.

### Ошибки: −6, но состав в отчётах неверен

Отчёты: «−6, ровно 3 коллизии × 2 находки». Фактический set-diff: ушли **3** `SDD_TASK_ID_COLLISION` (`model.task-35`, `state.task-45`, `dbc-linter.task-88`) **и 3** `SDD_TRACKER_STATUS_DRIFT` (`tasks/agent-mon-cli/README.md`, `tasks/dbc/README.md`, `tasks/infra-npm-publish/README.md`); две ошибки (`SDD_DEP_UNRESOLVED`, `SDD_VERIFICATION_TABLE_INVALID`) переехали с `task-88` на `task-186`. Итог −6 верен, **объяснение — нет**: разрешение коллизий попутно сняло 3 дрифта трекера в двух не тронутых пачкой README (эффект в плюс, но не заявленный).

---

## D. Регрессии (все команды перезапущены мной, `npm --prefix rc-v6`)

| Команда | Мой результат | Отчёт | Вердикт |
|---|---|---|---|
| `npm test` | `# tests 3593 # pass 3583 # fail 0 # cancelled 0 # skipped 10`, exit 0 | 3593/3583/0 | **ПОДТВЕРЖДЕНО** |
| `npm run check` | `[sdd-verify] ✅ ALL PASS (5/5)` (type-check, test:coverage, lint, format, yagni), exit 0 | 5/5 | **ПОДТВЕРЖДЕНО** |
| `npm run build` | exit 0 | ок | **ПОДТВЕРЖДЕНО** |
| `sdd-check --all rc-v6` | `192 error(s), 434 warning(s) across 212 file(s)`, exit 1 | 192/434 | **ПОДТВЕРЖДЕНО** |
| `npm run check:directives-fresh` | `✓ ai/directives/** matches a fresh rebuild.` | ок | **ПОДТВЕРЖДЕНО** |
| `npm run audit:sdd-templates` | `✓ halt-activation audit clean — 33 template(s) + 33 assembled directive(s)`; `✓ every lazy directive … within budget` | не заявлено | **ПОДТВЕРЖДЕНО (сверх отчёта)** |
| `gate:sdd-check-baseline` | FAIL, 2 ошибки | FAIL, 2 ошибки | **ПОДТВЕРЖДЕНО** |

Точечные сюиты (cwd=rc-v6): `audit-mechanical-check-coverage` 3/3, `execution-log` 11/11, `templates` 42/42, `ticket` 25/25, `sdd-check.cmd` **82/82**, `sdd-log.cmd` 65/65, `check-phases` 12/12 — все зелёные.

---

## E. Смысл директив (`git diff f16d7f17..585537ac -- ai/directives ai/kit/templates`)

Прочитан весь дифф (7 файлов). Смысловых изменений ровно три, все привязаны к задачам:
1. `AX_MECHANICAL_VIA_SDD_CHECK` (`audit.directive.hbs` → `STEP_1_MECHANICAL.xml`): в bullet `--task` добавлены `SDD_TASK_ID_GRAMMAR`, `BDD_NEGATIVE`, `BDD_TRACE`, `COVERAGE_POLICY` (4 кода), `PHASE_RECEIPT` (2 кода); в `--all` — group receipts. **B2-11.**
2. Handoff-плейсхолдер +`deviations` в `formats/task-ticket-structure.xml:147` и `scaffold.directive.xml:289` — оба деривированы из одной правки `templates.ts`. **B2-14.**
3. `reconcile.directive.hbs` — три инлайн-`TODO`→`IN_PROGRESS` (:126, :150, :182) + перегенерированный `reconcile.directive.xml` с новым текстом `AX_REOPEN_FORMAT`. **B2-08.**
Плюс одна строка словаря токенов в `formats/project-tasks-index.xml:19` (**B2-03**).
**Скрытых смысловых изменений вне задач нет** — ПОДТВЕРЖДЕНО. Единственная содержательная претензия — не изменённое там, где следовало: `reconcile.directive.hbs:123` «Always append a new Round» (см. §B, B2-08).

---

## Итог

**Блокирующее (2):**
1. **Красный `gate:sdd-check-baseline`.** Сам по себе — не регрессия (доказано), но в текущем виде PR не может стать зелёным без решения: либо оператор даёт ребейзлайн (D-38), либо применяется вариант 2 (измеренно зелёный).
2. **Пересечение с `lead/kit-lint` — реальный конфликт в двух файлах-источниках** + падение третьего кейса нового теста B2-11 после мержа Пачки 5. Мержить обе пачки без плана (§A) нельзя.

**Неблокирующее, но требует правки (5):**
3. `fix` — токен, названный строкой доски B2-03, отсутствует в `TOKEN_VOCABULARY`, тогда как 34 живые строки журнала его используют; отчёт молчит. Нужно либо добавить, либо явно вынести в решение оператора рядом с D1 (`ver`).
4. Exit-код 2 перегружен: `help.ts:96` документирует только `SDD_NO_TICKETS_FOUND`, а пред-существующий `ERR_CLI_SDD_CHECK_UNKNOWN_ID` (тоже exit 2) выпал из help; инвариант `sdd-check.spec.md:20` как биимпликация ложен. Правка — 2 строки help + ослабление формулировки инварианта.
5. `reconcile.directive.hbs:123` противоречит новой `AX_REOPEN_FORMAT` («always new Round» vs две формы по D-20).
6. Отчётные числа: база = 198/**431**, delta warn = **+3** (третье — `SDD_MODULE_OVERSIZED` на `sdd-log.spec.md`, следствие B2-17); состав −6 = 3 коллизии + **3 `SDD_TRACKER_STATUS_DRIFT`**, а не «3×2». Править `R-BATCH-04` и `R-B2-15`/`R-B2-17`.
7. `R-B2-05` §4: «пре-существующий fail» не воспроизводится (82/82) — артефакт cwd, строку доказательства снять. Плюс не объявленное отклонение: счётчик грандфазеринга из трека `:629` не реализован.

**Подтверждено:** полнота диффа и покрытие таблицами файлов; изоляция от зоны Пачки 5 и безопасность пересечения с Пачкой 1; существо всех восьми задач против строк доски и трека 31 (кроме пунктов 3-5); соблюдение D-39 в B2-15 и D-38 в отношении baseline (файл `.baseline/*.json` не редактировался); `npm test` 3593/3583/0, `check` 5/5, `build`, `sdd-check --all` 192/434, свежесть директив, `audit:sdd-templates`; отсутствие скрытых смысловых правок директив.

**Рекомендация: PR после правок** (пункты 3-7 малы и лежат внутри файлов самой Пачки 4; пункты 1-2 — решения Lead/оператора). Возвращать пачку не за что: восемь задач сделаны по существу, доказательства воспроизводятся, единственный красный гейт объяснён и имеет зелёный обход.

**Рекомендация Lead по гейту: вариант 2.** Откатить одно переименование `tasks/vcs/vcs-mr-client/vcs-mr-client.task-186.md` → `…task-88.md`, оставив внутри `Task-ID: TSK-186` (зависимости в `task-{89,90,91,92}` уже указывают `TSK-186` и не меняются). Измерено: 192/434, 0 коллизий, **0 новых ошибок против baseline** — гейт зелёный без вмешательства оператора и без правки `.baseline/*.json`. Вариант 3 отклонить.

**Что спросить у оператора (2 вопроса, оба короткие):**
- «Коллизия `TSK-88` разрешена. Оставить (а) имя файла `vcs-mr-client.task-88.md` при `Task-ID: TSK-186` — гейт зелёный сейчас, ценой расхождения имя↔ID на одном легаси-тикете; или (б) переименование файла и тогда авторизовать ребейзлайн `ai/flow-eval/.baseline/sdd-check-227c03a8.json` на новом коммите (D-38)?»
- «Токен `fix` (34 живые строки журнала) — добавить в `TOKEN_VOCABULARY` рядом с `ver`/`yagni`/`env-fix`/`correction`, или оставить вне словаря сознательно (тогда B2-04 позднее заведёт находки на эти 34 строки)?» — это D1-смежное решение, Lead его не закрывает.
