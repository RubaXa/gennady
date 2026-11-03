ВЕРИФИКАЦИЯ — Пачка 18 «Аксиомы живут в одном доме и ни одна не висит в воздухе» (T-B6-24, T-B6-25, T-B6-11, GAP-3, T-B6-19; T-B6-02 отложена)

Проверяющий: `plan-verifier` (свежие глаза, только чтение).
Дата: 2026-09-10.
Проверяемое: ветка `lead/axioms-one-home`, 5 коммитов (`edeb71c3`, `ae42e356`, `40935c63`, `15b10585`, `7db7e1de`) поверх `2f726c3a` (`lead/reopen-by-cause`, PR #48), дерево `rc-v6` (рабочее дерево чистое, мною не изменялось).
Отчёты исполнителя: `_raw/reports/R-BATCH-18-axioms-one-home.md`, `R-T-B6-24.md`, `R-T-B6-25.md`, `R-T-B6-11.md`, `R-GAP-3.md`, `R-T-B6-19.md`.
Требования: `62-BATCH-QUEUE.md` «### Пачка 18»; `61-TASK-BOARD.md` §1 строки 163, 166, 178, 183, 184, 250, 256; `40-TRACK-DIRECTIVES-SKILLS.md` §1.4 (D4.1, D4.4–D4.7), §4.1 (Q1); решения L-9 (гибрид c), L-25, L-23, L-10, D-49, L-16; контекст `_raw/V-BATCH-05.md`, `_raw/V-BATCH-15.md` (F-5), `_raw/V-BATCH-20.md` (B-2). Источник v1: `/Users/k.lebedev/Developer/gennady` @ `d37d5910`.

Метод изоляции: для измерений «до» и для мутаций сделаны два `--shared`-клона дерева `rc-v6` в скрэтчпаде (`base-v6` @ `2f726c3a`, `mut-v6` @ `7db7e1de`); дерево `rc-v6` не мутировалось, после каждой мутации `git status --porcelain` в клоне пуст.

# ВЕРДИКТ: ВЕРНУТЬ

Четыре из пяти задач по существу выполнены и доказаны сильнее, чем в отчётах: GAP-3 — настоящая декларация остановки, а не переклейка исключения (проверено в обе стороны); T-B6-24 — область линта реально расширена (мутация видна на HEAD и невидима на базе); T-B6-11 — текст `AX_SEVERITY_TAGGING` побайтово равен v1; T-B6-19 — все числа сходятся, таблица 83 файлов полна.

Возврат вызван одной блокирующей находкой: **пачка одновременно подключила в одну и ту же директиву аудита два взаимоисключающих утверждения о том, кто ставит `[x] DONE`** — v2-семантику group-audit (`AX_AUDIT_HOOK`, T-B6-25) и дореформенную v1-фразу «the orchestrator sets `[x] DONE` on PASS» (`AX_SEVERITY_TAGGING`, T-B6-11). Это ровно класс дефекта L-25 / `V-BATCH-20` B-2, только внесённый заново и в одном коммите с его противоположностью. Правка локальна (один абзац), но требует решения Lead, потому что L-25 предписывает дословный v1-текст.

Плюс два серьёзных неблокирующих: новый гейт `lintUncollectedAxiomFiles` молча допускает четвёртое состояние «подключена И помечена черновиком» (воспроизведено), и пачка вносит **новые** конфликты слияния с двумя открытыми ветками, которых на базе не было.

---

## 1. Что перезапущено мной (все команды — синхронно, exit-коды мои)

| # | Команда | Где | Результат | Совпало с отчётом |
|---|---|---|---|---|
| 1 | `npm test` | `rc-v6` | exit 0 — `# tests 3732 / # pass 3724 / # fail 0 / # skipped 8` | да, дословно |
| 2 | `npm run check` | `rc-v6` | exit 0 — `[sdd-verify] ✅ ALL PASS (5/5)` (type-check 30.2s, test:coverage 46.0s, lint 8.9s, format 2.1s, yagni 0.6s) | да |
| 3 | `npm run gate:sdd-check-baseline` | `rc-v6` | exit 0 — `OK — no error outside the baseline (227c03a8, tag rc-baseline-1)` | да |
| 4 | `npm run check:directives-fresh` | `rc-v6` | exit 0 — `✓ ai/directives/** matches a fresh rebuild.` | да |
| 5 | `npm run audit:axioms` | `rc-v6` | exit 0 — `✓ … 28 template(s) checked` | да |
| 6 | `npm run audit:contracts` | `rc-v6` | exit 0 — `✓ … 28 template(s) + 33 assembled + 54 contract file(s) …` | да |
| 7 | `npm run audit:halts` | `rc-v6` | exit 0 — `✓ halt-activation audit clean — 33 template(s) + 33 assembled directive(s)` | да |
| 8 | `npm run check:directive-budgets` | `rc-v6` | exit 0 — `✓ every lazy directive … within budget` | да |
| 9 | `npm run build:directives` (режим записи) | `mut-v6` | exit 0, после прогона `git status --porcelain` пуст — сгенерированное закоммичено и свежо | да |
| 10 | `node --experimental-strip-types ai/kit/build-directives.ts --check` | `rc-v6` / `base-v6` | оба exit 0, оба `Checked 55 directive(s).`, оба `⚠ 35 dangling axiom(s)` | да (35 → 35) |
| 11 | `node --test ai/kit/__tests__/lint-axioms.test.ts` | `rc-v6` | `# tests 30 / # pass 30 / # fail 0` | да |
| 12 | `node --test ai/kit/__tests__/stateless-sdd-flow-contract.test.ts` | `rc-v6` | `# tests 21 / # pass 21` (19 после `40935c63` + 2 от GAP-3) | да, счёт сходится |
| 13 | `node --test ai/kit/__tests__/audit-halt-activation.test.ts` | `rc-v6` | `# tests 4 / # pass 4` | да (21+4 = 25) |

### 1.1 Числа пачки — пересчитаны своим скриптом, не на глаз

Скрипт-зонд (`scratchpad/probe.mjs`): обходит `ai/kit/axiom/{process,spec,audit,scaffold,boundary,critic,truth,interview}/**/*.xml`, собирает все `{{> "axiom/…"}}` из `ai/kit/templates/sdd-v2/**/*.hbs`, классифицирует каждый файл. Один и тот же скрипт прогнан по клону базы и по HEAD.

| Метрика | `base-v6` @ `2f726c3a` | `rc-v6` @ `7db7e1de` | Заявлено | Вердикт |
|---|---|---|---|---|
| SDD-релевантных аксиом всего | **181** | **181** | 181 | ПОДТВЕРЖДЕНО |
| подключено (`{{> }}`) | **97** | **98** | 97 → 98 | ПОДТВЕРЖДЕНО |
| помечено `status="draft"` и не подключено | **0** | **83** | 0 → 83 | ПОДТВЕРЖДЕНО |
| ни то ни другое | **84** | **0** | 84 → 0 | ПОДТВЕРЖДЕНО |
| подключено **и** помечено `draft` | 0 | 0 | не заявлено | см. F-2 (дыра гейта) |
| `dangling axiom(s)` (обратное направление) | **35** | **35** | 35 → 35 | ПОДТВЕРЖДЕНО |
| записей `…::H_ASK_WITHOUT_CARD` в `ALLOWLIST_CROSS_DIRECTIVE_REFS` | **2** (`root.directive`, `scope.directive`) | **0** | 2 → 0 | ПОДТВЕРЖДЕНО |
| размер `KNOWN_DANGLING_AXIOM_REFS` | **39** | **35** | «только сокращается» (L-10) | ПОДТВЕРЖДЕНО: снято 5 (4× `AX_AUDIT_HOOK`, 1× `AX_REACTION_IS_A_TOOL_CALL`), добавлено 1 (`AX_CONTRACT_BUDGET`) — см. F-4 |

### 1.2 Полнота таблиц файлов

`git diff --stat 2f726c3a..HEAD` → **101 файл**. Разложение: 7 сгенерированных `ai/directives/sdd-v2/**` + 2 теста + 3 файла `ai/kit/*.{ts,mjs}` + 3 `.hbs` + 3 аксиомы T-B6-11 + 83 аксиомы T-B6-19 = 101. Каждый имеет строку в §1 одного из пяти отчётов. **ПОДТВЕРЖДЕНО.**

Отдельно сверена таблица 83 файлов `R-T-B6-19.md` §1.2: `git diff --name-only 7db7e1de^..7db7e1de -- ai/kit/axiom` даёт 83 пути; все 83 получили `+ status="draft"`; множество путей в отчёте **побайтово совпадает** с множеством изменённых (`diff` пуст). **ПОДТВЕРЖДЕНО.**

### 1.3 Мутационные проверки (все — в клоне `mut-v6`/`base-v6`, с восстановлением)

| # | Мутация | Ожидание | Факт |
|---|---|---|---|
| M1 | Внедрена висячая ссылка `` `AX_VERIFIER_PROBE_ONLY` `` в `ai/directives/testing/node-test.xml` | линт красный на HEAD | **exit 1**, `✗ 1 undefined axiom reference(s) … testing/node-test.xml: AX_VERIFIER_PROBE_ONLY` |
| M1′ | Та же мутация в клоне базы `2f726c3a` | линт слеп до T-B6-24 | **exit 0**, 0 находок — расширение области реально, а не притворно |
| M2 | Снят `{{> "axiom/process/ax-audit-hook"}}` из `audit.directive.hbs` | красный | **exit 1**, `✗ 4 undefined axiom reference(s)`: `audit`, `code-review`, `execute`, `scaffold` |
| M3a | Удалена строка `` | `H_ASK_WITHOUT_CARD` | `` из **сгенерированного** `router.directive.xml` | красный | **exit 1**, `⚠ 1 halt-activation violation(s) … mentioned … but not a row` |
| M3b | То же для `root.directive.xml` | красный | **exit 1**, та же диагностика — декларация несущая в обеих директивах |
| M4 | Снят `status="draft"` с `ai/kit/axiom/spec/ax-dx-first.xml` | красный | **exit 1**, `✗ 1 axiom file(s) neither collected … spec/ax-dx-first.xml: AX_DX_FIRST` |
| M5 | Проставлен `status="draft"` на **подключённой** `ax-audit-hook.xml` | ожидалось «красный» | **exit 0, зелёный** — см. F-2 |

---

## 2. Находки

### БЛОКИРУЮЩИЕ

**B-1 (MAJOR). Директива аудита получила два взаимоисключающих правила о том, кто ставит `[x] DONE` — обе стороны внесены этой же пачкой.**

- `ai/directives/sdd-v2/audit/steps/STEP_1_MECHANICAL.xml:108` (подключено `ae42e356`, T-B6-25, из `ai/kit/axiom/process/ax-audit-hook.xml`): «A ticket closes on its own phase gates — `[x] DONE` is mechanical close, not verification… `sdd-task --audit-group <ticket>` … returns `due` once every ticket in the group is `[x] DONE`».
- `ai/directives/sdd-v2/audit/steps/STEP_2_SEMANTIC.xml:180` и `ai/directives/sdd-v2/code-review.directive.xml:211` (внесено `40935c63`, T-B6-11, дословно из v1): «This matters because the status is consumed mechanically: **the orchestrator sets `[x] DONE` on PASS**».

В v2 это физически невозможно: к моменту, когда аудит вообще запускается, все тикеты группы **уже** `[x] DONE` — это и есть его триггер. Обе фразы теперь лежат в шаговых пакетах одной директивы `audit.directive`, и обе описывают одну и ту же механическую подстановку статуса.

Воспроизведение:
```
grep -rn 'sets `\[x\] DONE` on' ai/directives/          # STEP_2_SEMANTIC.xml:180, code-review.directive.xml:211
grep -rn 'mechanical close, not verification' ai/directives/   # STEP_1_MECHANICAL.xml:108
git show 2f726c3a:ai/kit/axiom/audit/ax-severity-tagging.xml   # 13-строчный снимок, этой фразы не было
```

Почему это не «просто дословный перенос»: замок 40-TRACK §1.4 просит ровно три вещи — «таблица вычисления + confidence-правило + кап проектных находок». Последний абзац v1 («This matters because…») в D4.1/D4.4–D4.7 **не входит** и был импортирован сверх задания; именно он и несёт v1-механику, отменённую в v2. Это тот же класс, что L-25 / `V-BATCH-20` B-2 (дореформенный текст кирпича), но внесённый заново.

Ни один из пяти отчётов эту коллизию не называет; `R-T-B6-25.md` §4 п.2 обсуждает расхождение v1/v2 у `ax-audit-hook`, но не замечает, что следующая задача пачки внесла в ту же директиву противоположное v1-утверждение.

Правка — см. §4, требует решения Lead (L-25 предписывает дословность).

### НЕБЛОКИРУЮЩИЕ

**F-2 (MAJOR). Новый гейт допускает четвёртое состояние: «подключена И помечена черновиком».**

`ai/kit/lint-axioms.ts:325`+ (`lintUncollectedAxiomFiles`) проверяет `подключена ИЛИ draft`: строка `if (connectedPartials.has(partialKey)) continue;` стоит **до** проверки `status="draft"`, поэтому метка на подключённом файле не вызывает ни ошибки, ни предупреждения. Воспроизведено (M5): `status="draft"` на подключённой `ax-audit-hook.xml` → `build-directives.ts --check` **exit 0**.

Это не теория. Уже открытые ветки подключают партиалы, которые пачка 18 только что пометила черновиками:

| Ветка | Добавляет `{{> }}` для | Файл сейчас `status="draft"` |
|---|---|---|
| `lead/promises-not-wider` (PR #45/#21) | `critic/ax-polish-mode`, `process/ax-dispatch-via-batch`, `process/ax-cap-5`, `critic/ax-default-accept` | да, все 4 |
| `lead/review-critic-bounds` | те же 4 | да |
| `lead/spec-authoring` (PR #41) | `spec/ax-refine-module-preserves-contracts` | да |
| `lead/phase-agent-bounds` (PR #38) | `process/ax-re-dispatch`, `process/ax-permitted-bash-commands` | да, обе |

После этих слияний семь файлов будут одновременно собраны и помечены черновиками, и ни один гейт этого не заметит. `R-T-B6-19.md` §4 прямо благословляет такой исход («метку можно снять или оставить, гейт пропустит оба варианта») — то есть заявленный инвариант «третьего состояния больше не существует незаметно» деградирует в «четвёртое существует и незаметно».

Воспроизведение: `perl -pi -e 's|<Axiom id="AX_AUDIT_HOOK">|<Axiom id="AX_AUDIT_HOOK" status="draft">|' ai/kit/axiom/process/ax-audit-hook.xml && node --experimental-strip-types ai/kit/build-directives.ts --check; echo $?` → `0`.

**F-3 (MAJOR). Пачка вносит новые конфликты слияния, которых на базе не было.**

`git merge-tree --write-tree` в обе стороны:

| Против ветки | На базе `2f726c3a` | На `lead/axioms-one-home` | Вывод |
|---|---|---|---|
| `lead/phase-agent-bounds` (#38) | КОНФЛИКТ (`STEP_2_IMPLEMENT.xml`, `phase-execution-protocol.directive.hbs`) | тот же конфликт | **предсуществующий**; `ai/kit/audit-halt-activation.mjs` — `Auto-merging`, **чисто** (опасение брифа снято) |
| `lead/spec-authoring` (#41) | КОНФЛИКТ (`ai/kit/lint-axioms.ts`) | тот же конфликт | **предсуществующий**, но пачка 18 переписала ту же область (`KNOWN_DANGLING_AXIOM_REFS` разбит на два массива) — разрешение стало объёмнее |
| `lead/promises-not-wider` (#45/#21) | **ЧИСТО** | **КОНФЛИКТ** `ai/kit/axiom/critic/ax-default-accept.xml` | **внесён пачкой 18** |
| `lead/review-critic-bounds` | **ЧИСТО** | **КОНФЛИКТ** `ai/kit/axiom/critic/ax-default-accept.xml` | **внесён пачкой 18** |
| `lead/migrator-red-first` (#22) | ЧИСТО | ЧИСТО | пересечений нет |

Причина обоих новых конфликтов — одна строка: T-B6-19 дописала `status="draft"` в тот самый тег `<Axiom id="AX_DEFAULT_ACCEPT">`, который обе ветки переписывают целиком под каноническую редакцию L-25. Разрешение тривиально (брать версию ветки, метка становится ненужной), но это ровно тот файл, который L-25 закрепил за пачкой 20, и порядок слияния теперь имеет значение.

**F-4 (MINOR). В постоянный аллоулист записана недостоверная причина — тот самый класс лжи в комментарии, который GAP-3 в этой же пачке исправлял.**

`ai/kit/lint-axioms.ts:262-270` (комментарий к `STATIC_TREE_DANGLING_REFS`) и `R-T-B6-24.md` §3/§4 утверждают: «`typescript-rules.xml`, на который она ссылается, в репозитории не существует» / «names a rule file (`typescript-rules.xml`) that does not exist anywhere in this repo».

Факт: файл существует — `ai/directives/coding/typescript-rules.xml`, причём `coding` входит в новый `STATIC_DIRECTIVE_DIRS`, то есть он в расширенной области линта. Более того, соседний id, процитированный в той же строке (`ai/directives/agent-inbox/contract-interrogation.directive.xml:33-34`), — `AX_BASE_CONTRACT_SHAPE` — там определён (`typescript-rules.xml:187`) и потому не висит. Висит только `AX_CONTRACT_BUDGET`, которого нет нигде в репозитории.

Сама запись аллоулиста нужна и верна по эффекту; ложна её мотивировка, и вместе с ней — квалификация «дефект чужого дерева `agent-inbox`»: отсутствующий id принадлежит общему файлу правил `ai/directives/coding/typescript-rules.xml`, а не `agent-inbox`.

Воспроизведение: `find ai -name typescript-rules.xml` → `ai/directives/coding/typescript-rules.xml`; `grep -rn 'AX_BASE_CONTRACT_SHAPE' ai/directives/coding/typescript-rules.xml` → `:187`; `grep -rn 'AX_CONTRACT_BUDGET' ai cli shared` → только цитата и строка аллоулиста.

**F-5 (MINOR). Устаревшая самоссылка в тексте самого гейта.**

`ai/kit/audit-halt-activation.mjs:346` в подсказке при провале всё ещё пишет: «belongs in `ALLOWLIST_CROSS_DIRECTIVE_REFS` instead, documented like the existing `root/scope -> router H_ASK_WITHOUT_CARD` entries» — обе эти записи GAP-3 удалила. Строка не мёртвая: она печатается в реальном выводе (наблюдал в прогонах M3a/M3b). Читатель отсылается к образцу, которого нет.

**F-6 (MINOR). Замок D4.1 выполнен не там, где просил план; шаг, вычисляющий вердикт, таблицу не несёт.**

40-TRACK §1.4 требует: «кейс … rendered `STEP_3_ROUTE.xml` содержит „LOW never causes FAIL“ и „project-scope finding capped at MINOR“». Фактически все четыре восстановленных куска лежат только в `ai/directives/sdd-v2/audit/steps/STEP_2_SEMANTIC.xml:141-186`. `STEP_3_ROUTE.xml` — шаг, который по `audit.directive.xml:246` подгружается отдельным `READ_AND_USE_DIRECTIVE` и в строках 16-36 сам «Compute and return» вердикт — **не содержит** ни таблицы, ни фразы «print which row matched», ни капа `MINOR`, и **ни разу не цитирует** `AX_SEVERITY_TAGGING` (`grep -c AX_SEVERITY_TAGGING …/STEP_3_ROUTE.xml` → `0`, и на базе, и на HEAD). Вместо переноса аксиомы исполнитель переписал замок под факт (сканирует весь каталог `audit/**`) — `R-T-B6-11.md` §3, «Замечание по методологии замка».

Смягчающее: пачка ничего не ухудшила (размещение в `STEP_2_SEMANTIC` было и на базе), а шаги аудита идут подряд в одной сессии, так что текст, скорее всего, в контексте. Но приёмочная формулировка доски «вердикт из напечатанной таблицы строгости» выполнена по корпусу, а не в точке применения, и **D4.1 остаётся ЧАСТИЧНО**. Дополнительно: три буллета `STEP_3_ROUTE` дублируют таблицу — по существу они с ней согласованы (проверено построчно), то есть это дублирование, не противоречие.

**F-7 (MINOR). «Область расширена на всё дерево директив» — сильнее факта.**

`ai/kit/lint-axioms.ts:301`: `const STATIC_DIRECTIVE_DIRS = ['infra', 'testing', 'architecture', 'coding', 'agent-inbox']` — жёсткий список из пяти имён, а не обход `ai/directives/**`. Сегодня он покрывает все существующие каталоги (`ls ai/directives/` → те же пять + `sdd-v2` + файл `knowledge.xml`), но верхнеуровневый файл `ai/directives/knowledge.xml` не сканируется вовсе, и новый каталог будет пропущен молча. Живой дыры нет: `grep -o 'AX_[A-Z0-9_]*' ai/directives/knowledge.xml` → пусто.

**F-8 (MINOR). Неточные `file:line` в mermaid-диаграммах отчётов.**

Стрелки-вызовы сверены с кодом; ошибочны три подписи:

| Отчёт | Написано | Факт |
|---|---|---|
| `R-T-B6-25.md` §2 | `execute.directive.xml:60` | `:67` — на всех трёх коммитах (`2f726c3a`, `ae42e356`, `7db7e1de`) |
| `R-T-B6-25.md` §2 | `{{> }} audit.directive.hbs:8` | `:24` — и на `ae42e356`, и на HEAD |
| `R-T-B6-24.md` §2 | `lint-axioms.ts:322` | `:321` на `edeb71c3`, `:325` на HEAD |

Прочие стрелки диаграмм проверены и соответствуют реальным вызовам/ссылкам: `build-directives.ts:177-178` (`edeb71c3`) действительно склеивает `[...rendered, ...staticDirectiveFiles]`; `code-review.directive.xml:6`, `audit.directive.xml:8`, `scaffold/steps/STEP_1_DERIVE.xml:31`, `audit/steps/STEP_1_MECHANICAL.xml:86` — реальные упоминания `AX_AUDIT_HOOK`; определение — `audit/steps/STEP_1_MECHANICAL.xml:107`.

**F-9 (MINOR, к перечитыванию доски). `status="draft"` легитимизировал сироту, которую GAP-K-3 велит починить или удалить.**

`61-TASK-BOARD.md:188` (GAP-K-3): «Четвёртая копия инверсии D3.4 в файле-сироте `ai/kit/axiom/**/ax-isolation-signal.xml`: **исправить или удалить сироту** (недостижим из сборки)». T-B6-19 вместо этого проставила ему `status="draft"`, то есть объявила недостижимость нормой. По L-9 (c) формально допустимо, но механическое давление, на которое опиралась GAP-K-3, снято.

### ПОДТВЕРЖДЕНО (без замечаний)

1. **GAP-3 — настоящая декларация, а не «добавили и оставили».** На базе `H_ASK_WITHOUT_CARD` встречался ровно один раз во всём `ai/directives/` — как ссылка `root.directive.xml:190` на объявление, которого нет; таблица `<HaltConditions>` роутера содержала только `H_AMBIGUOUS_INTENT`/`H_SPEC_NOT_APPROVED`/`H_V2_INVALID`/`H_WRONG_REPO`; запись `scope.directive::H_ASK_WITHOUT_CARD` была мертва (0 упоминаний в `scope.directive.{hbs,xml}`). Комментарий скрипта «declared and fires only in `router.directive.hbs`» был ложью. Теперь: собственные строки в `router.directive.xml:326` и `root.directive.xml:172`, процитированы в `STEP_0_STATE` (`router.directive.xml:338`) и `STEP_1_VISION` (`root.directive.xml:191`); обе записи аллоулиста удалены; `audit:halts` зелёный **без** записей; удаление любой из двух строк красит гейт (M3a/M3b). `grep -c H_ASK_WITHOUT_CARD ai/kit/lint-axioms.ts` → `0` (у линта нет исключения под этот класс, как требует строка доски 250).
2. **L-23 не нарушен.** `root.directive.hbs` 285 → 286 строк, `root.directive.xml` 526 → 527. `check:directive-budgets` зелёный и на базе, и на HEAD; ни один монолит не вышел из warn-режима.
3. **T-B6-11 — текст действительно актуальная редакция v1, отменённых редакций нет.** Тело `AX_SEVERITY_TAGGING` из `ai/kit/axiom/audit/ax-severity-tagging.xml` побайтово равно блоку из `d37d5910:ai/directives/sdd/audit.directive.xml` (`diff` пуст с точностью до отступа открывающего тега). Строка `RULE_FILE_INCOMPLETE` в `ax-finding-routing.xml` и пункт `rule-file-fix` в `ax-findings-as-proposals.xml` — тоже дословно v1. Проверка L-25 доведена до конца, а не остановлена на `git log` по одному файлу: `d37d5910` **не является** предком локального `main` (`merge-base --is-ancestor` → NO, blob'ы разные), поэтому сверено с самим `main`: все пять восстановленных фрагментов присутствуют в `main:ai/directives/sdd/audit.directive.xml`, а блок `AX_SEVERITY_TAGGING` на `main` **идентичен** блоку на `d37d5910`. Отменённой редакции нет — в отличие от `AX_DEFAULT_ACCEPT`/`d6065c36`. `git log -S 'the orchestrator sets `[x] DONE` on'` по v1 → единственный коммит `ac2e9d73` (введение).
4. **T-B6-25 — 5 ссылок, все разрешены.** Упоминаний `AX_AUDIT_HOOK` в `ai/directives/**` ровно 5 (`code-review:6`, `execute:67`, `audit.directive:8`, `audit/steps/STEP_1_MECHANICAL:86`, `scaffold/steps/STEP_1_DERIVE:31`) плюс определение `STEP_1_MECHANICAL:107`. Снятие партиала (M2) даёт 4 висячих ссылки по числу директив верхнего уровня — связь несущая. Приёмочная формулировка «закрытие раунда сопровождается обязательным хуком аудита» читается в собранной директиве в её v2-редакции («`due` → dispatch the group audit», «asks the tool for the moment, never eyeballs it»), то есть по группе, а не по раунду — расхождение честно объявлено в `R-T-B6-25.md` §4 п.2. Как самостоятельное расхождение это принимается; его последствие для T-B6-11 — B-1.
5. **T-B6-24 — область линта расширена по существу, а не за счёт аллоулиста.** M1/M1′ дают чистое «до/после» на одной и той же мутации. Пример доски «3 ссылки `AX_BLOCKER_ESCALATION`» действительно устарел независимо от пачки: `{{> "axiom/process/ax-blocker-escalation"}}` стоит в `phase-execution-protocol.directive.hbs:14` **и на базе тоже**, определение — `phase-execution-protocol.directive.xml:38`; отклонение в `R-T-B6-24.md` §4 честное. Пять статичных каталогов действительно не генерируются: `ls ai/kit/templates/` → единственный `sdd-v2`.
6. **T-B6-19 — критерий выборки Q1 воспроизводим,** дублей id среди 181 файла нет (`grep … | sort | uniq -d` пуст; `ax-severity.xml` несёт `AX_SEVERITY`, не `AX_SEVERITY_TAGGING` — «двух домов у одного id» не образовалось).
7. **Черновики с владельцем на доске (выборка по всем 83, не по 10).** Механическая сверка имён файлов с `61-TASK-BOARD.md` §1 даёт 10 файлов, у которых есть задача-владелец, обязанная их подключить: `process/ax-deviation-self-resolve` → **V14-2a**; `process/ax-permitted-bash-commands` → **ISS-8**, **T-B6-12**; `process/ax-re-dispatch` → **T-B6-16**, **V14-2a**; `audit/ax-task-id-integrity` → **B2-11**; `scaffold/ax-rules-load-from-phase-block` и `scaffold/ax-rules-resolution-hard-fail` → **T-5**; `boundary/ax-isolation-signal` → **GAP-K-3** (см. F-9); `boundary/ax-ssot-traceability` → **T-B6-13**; `critic/ax-default-accept` и `critic/ax-polish-mode` → **T-B6-03**. Плюс `process/ax-cap-5` — по тексту той же строки T-B6-03 (`AX_CAP_5`). По L-9 (c) `draft` для них допустим — но ровно они и делают F-2 материальной: сняв метку никто не обязан, и гейт не напомнит.
8. **`AX_CONTRACT_BUDGET` действительно не определён нигде** — запись аллоулиста по эффекту обоснована (претензия только к её мотивировке, F-4).
9. **T-B6-02 корректно отложена.** `module.directive.hbs` принадлежит `lead/spec-authoring` (PR #41) — подтверждено `git diff --name-only` по этой ветке. Строка доски 166 («ОТЛОЖЕНА до слияния PR #41; остаток пачки 18») брифом не переоткрывалась.
10. **Стопы §4 отчёта пачки** (двойное падение `npm run check` в pre-commit, класс L-26 тип Б) — **НЕ ПРОВЕРЯЕМО** ретроспективно; мои три независимых прогона `npm run check`/`npm test` прошли с первого раза, что с версией «конкуренция за хост, не регресс» согласуется.

---

## 3. Регрессионные замки: упадут ли тесты, если инвариант отвязать

| Замок | Файл | Мутация | Падает? |
|---|---|---|---|
| «каждая аксиома либо использована, либо draft» | `build-directives.ts` `START_FAIL_ON_UNCOLLECTED_AXIOM_FILES` | снять `status="draft"` (M4) | **да**, exit 1 |
| та же, обратная сторона | там же | пометить `draft` подключённую (M5) | **нет** — F-2 |
| «висячие ссылки вне `sdd-v2` видны» | `build-directives.ts` + `collectStaticDirectiveFiles` | M1 | **да**, exit 1 |
| «`ax-audit-hook` собран» | тот же гейт | M2 | **да**, exit 1 (4 находки) |
| «`H_ASK_WITHOUT_CARD` объявлен» | `audit-halt-activation.mjs` | M3a / M3b | **да**, exit 1 в обе стороны |
| «вердикт из напечатанной таблицы строгости» | `stateless-sdd-flow-contract.test.ts` | — | тест есть и зелёный, но сканирует весь `audit/**`, а не `STEP_3_ROUTE` (F-6) |
| «`RULE_FILE_INCOMPLETE` → `rule-file-fix`» | там же | — | точное регексп-совпадение по всей восстановленной строке — сильный замок |
| «аллоулист не вернёт указатель-в-никуда» | там же, GAP-3 кейс | — | `assert.doesNotMatch(/'(root\|scope)\.directive::H_ASK_WITHOUT_CARD'/)` — сильный замок |

---

## 4. Предлагаемые правки (по убыванию приоритета)

1. **B-1.** Убрать из `ai/kit/axiom/audit/ax-severity-tagging.xml` последний абзац v1 («This matters because the status is consumed mechanically: the orchestrator sets `[x] DONE` on PASS, remediates a progressing FAIL…») **либо** переписать его под v2-механику группы (вердикт аудита разблокирует зависимые спеки, а не ставит `[x] DONE`). Абзац не входит в D4.1/D4.4–D4.7, поэтому первый вариант не ослабляет замок. Решение за Lead, потому что L-25 предписывает дословный v1-текст: нужна явная запись «этот абзац — v1-механика, отменённая в v2 group-audit; исключение из дословности». Пересобрать `build:directives`, добавить кейс в `stateless-sdd-flow-contract.test.ts`: собранная `audit.directive` **не** содержит `sets \`[x] DONE\` on PASS`.
2. **F-2.** В `lintUncollectedAxiomFiles` (`ai/kit/lint-axioms.ts`) поменять порядок: сначала проверять `status="draft"`, и если файл при этом подключён — считать нарушением («метка черновика на собранной аксиоме»). Иначе через три слияния метка станет ложью на семи файлах. Добавить кейс-мутацию в `lint-axioms.test.ts`.
3. **F-3.** Зафиксировать порядок слияния: `lead/promises-not-wider` / `lead/review-critic-bounds` разрешают конфликт `ax-default-accept.xml` в свою пользу (их редакция каноническая по L-25), метку `status="draft"` при этом снять — после правки 2 это станет обязательным механически.
4. **F-4.** Переписать мотивировку записи `AX_CONTRACT_BUDGET` в `ai/kit/lint-axioms.ts:262-270` и §3/§4 `R-T-B6-24.md`: `typescript-rules.xml` существует (`ai/directives/coding/typescript-rules.xml`) и определяет соседний `AX_BASE_CONTRACT_SHAPE` (`:187`); отсутствует именно `AX_CONTRACT_BUDGET`, и владелец — общий файл правил `coding/`, а не дерево `agent-inbox`.
5. **F-5.** `ai/kit/audit-halt-activation.mjs:346` — заменить пример «root/scope -> router `H_ASK_WITHOUT_CARD` entries» на живой (например, `H_UNFORMATTED_ASK`, как уже сделано в шапке).
6. **F-8.** Исправить три `file:line` в mermaid `R-T-B6-25.md` / `R-T-B6-24.md`.

---

## 5. Остатки для доски

1. **`61-TASK-BOARD.md:256`, V14-2a — доказательство стало пустым.** Записано: «`npm run audit:sdd-templates` зелёный **при удалённой** записи `'root.directive::H_ASK_WITHOUT_CARD'` из аллоулиста `ai/kit/audit-halt-activation.mjs:122`». GAP-3 эту запись удалила совсем — «удалить» больше нечего. Переформулировать: «зелёный **без** записи `…::H_ASK_WITHOUT_CARD` в `ALLOWLIST_CROSS_DIRECTIVE_REFS` (проверено: удаление собственной строки `H_ASK_WITHOUT_CARD` из `router.directive.xml` или `root.directive.xml` красит гейт)».
2. **`61-TASK-BOARD.md:183`, T-B6-24 — колонка примечаний устарела.** «ловит 3 ссылки `AX_BLOCKER_ESCALATION` вне дерева» неверно: аксиома была подключена до пачки. Заменить на воспроизводимую мутацию (висячая ссылка в `ai/directives/testing/*.xml` → красный гейт; та же мутация на базе — зелёный).
3. **D4.1 остаётся ЧАСТИЧНО (F-6).** Нужна строка-владелец: перенести `{{> "axiom/audit/ax-severity-tagging"}}` в блок, попадающий в `STEP_3_ROUTE`, либо явно записать в `40-TRACK-DIRECTIVES-SKILLS.md` §1.4, что замок D4.1 сознательно ослаблен до «в корпусе `audit/**`», с обоснованием.
4. **GAP-K-3 перечитать (F-9)** — её формулировка «исправить или удалить сироту» больше не согласуется с тем, что сирота теперь легально помечена черновиком.
5. **Порядок слияния с PR #41** (`lead/spec-authoring`): конфликт `ai/kit/lint-axioms.ts` предсуществующий, но пачка 18 переписала ту же область; T-B6-02 стартует только после этого слияния.
6. **`ai/kit/axiom/audit/ax-drift-taxonomy.xml`, строка `EXECUTION_LOG_INCOMPLETE`** — беднее v1 на токены `sdd check` `[LOG]`; вне D4.4–D4.7, владельца на доске нет (честно отмечено в `R-T-B6-11.md` §4). Строку на доску или явное «не переносим».
7. **`ai/directives/knowledge.xml` и будущие каталоги вне `STATIC_DIRECTIVE_DIRS`** (F-7) — сегодня безвредно, но список жёсткий; либо обходить `ai/directives/**` минус `sdd-v2`, либо записать ограничение явно.

---

## 6. Итог

**Блокирующее — 1:** B-1 — собранная директива аудита содержит два взаимоисключающих правила о том, кто ставит `[x] DONE`; обе стороны внесены этой пачкой (`STEP_1_MECHANICAL.xml:108` против `STEP_2_SEMANTIC.xml:180` и `code-review.directive.xml:211`). Абзац-источник не требовался замком D4.1/D4.4–D4.7. Требует решения Lead по L-25.

**Неблокирующее — 8:** F-2 (гейт допускает «подключена И draft»; воспроизведено; материализуется на 7 файлах после слияния четырёх открытых веток), F-3 (два новых конфликта слияния на `ax-default-accept.xml`, которых на базе не было), F-4 (ложная мотивировка в постоянном аллоулисте), F-5 (устаревшая подсказка в тексте гейта), F-6 (D4.1 остаётся ЧАСТИЧНО; замок переписан под факт), F-7 (жёсткий список каталогов вместо `ai/directives/**`), F-8 (три неточных `file:line` в mermaid), F-9 (`draft` легитимизировал сироту GAP-K-3).

**Подтверждено:** все числа пачки пересчитаны мной независимым скриптом и совпали — 181 всего, 97 → 98 подключено, 84 → 0 неразмеченных, 0 → 83 черновиков, dangling 35 → 35, аллоулист `H_ASK_WITHOUT_CARD` 2 → 0, `KNOWN_DANGLING_AXIOM_REFS` 39 → 35 (только сокращение по L-10). Все 13 перезапущенных команд зелёные и совпали с отчётом дословно, включая `npm test` `3732/3724/0 fail/8 skipped` и `npm run check` `ALL PASS (5/5)`. Все 101 файл `git diff --stat` покрыты таблицами отчётов; таблица 83 файлов совпадает с диффом побайтово. Текст `AX_SEVERITY_TAGGING` побайтово равен актуальной редакции v1 и на `d37d5910`, и на типе `main` — отменённых редакций нет (L-25 выполнено). GAP-3 — настоящая декларация: гейт зелёный без записи аллоулиста и красный при удалении любой из двух строк. Расширение области линта доказано чистой мутацией «до/после». Бюджеты (L-23) не задеты. `ai/kit/audit-halt-activation.mjs` с PR #38 сливается чисто.

**Вердикт: ВЕРНУТЬ** — на одну правку (B-1) с решением Lead и, желательно в том же заходе, правку F-2, которая иначе обесценивает главный инвариант пачки уже на ближайших трёх слияниях.

---

## Повторная проверка

Проверяющий: `plan-verifier` (свежие глаза, только чтение). Дата: 2026-09-10.
Проверяемое: ветка `lead/axioms-one-home`, **9** коммитов поверх `2f726c3a` (PR #48); правки по вердикту — `d06bd5e5` (B-1/L-27), `764e7f42` (F-2, F-4), `682d338e` (F-3), `86fe23f4` (F-5). Дерево `rc-v6` чистое на `682d338e`, мною не изменялось; все мутации — в `--shared`-клонах `mut-v6`/`base-v6` с восстановлением (`git status --porcelain` пуст после каждой).
Основание: решение Lead **L-27** (`02-LEAD-DECISIONS.md:40`) — `[x] DONE` пишет `sdd-log complete` фазового агента, вердикт аудита записывается отдельно в `## Audit Rounds`; абзац v1 «orchestrator sets `[x] DONE` on PASS» не переносится.

# ВЕРДИКТ ПОВТОРНОЙ ПРОВЕРКИ: ПРИНЯТЬ

Блокирующая B-1 закрыта по существу и защищена работающим замком. Все четыре заявленные правки подтверждены. Открыты две новые МИНОРНЫЕ находки (F-10, F-11) — документационные, слияние не держат.

### Таблица «находка → статус»

| Находка | Статус | Доказательство (перезапущено мной) |
|---|---|---|
| **B-1** (блокирующая) | **ЗАКРЫТА** | `grep -rn 'sets \`\[x\] DONE\` on' ai/directives/` → **0 совпадений** (exit 1). Во всех трёх собранных файлах (`audit/steps/STEP_2_SEMANTIC.xml:185`, `code-review.directive.xml:227`, `audit/steps/STEP_1_MECHANICAL.xml:108`) осталось одно правило, и оно согласовано: «`[x] DONE` is already the phase's mechanical close» ⟷ «`[x] DONE` is mechanical close, not verification». Взаимоисключающих правил больше нет. |
| B-1 — соответствие L-27 | **ПОДТВЕРЖДЕНО** | Формулировка кирпича: «on PASS the audit records the round verdict; `[x] DONE` is already the phase's mechanical close» — дословно модель L-27. Помечена `<!-- v2 close model (L-27) -->` в теле и абзацем-исключением в шапке `ai/kit/axiom/audit/ax-severity-tagging.xml`. |
| B-1 — дословность остального (L-25) | **ПОДТВЕРЖДЕНО** | `diff -w` тела аксиомы против `d37d5910:ai/directives/sdd/audit.directive.xml:88-130` (строки 1–38, т.е. всё, кроме переписанного абзаца) — **пуст**. Задет ровно один абзац, как и заявлено. |
| B-1 — регресс-тест держит | **ПОДТВЕРЖДЕНО (мутация M7)** | В клоне вернул v1-фразу в кирпич → `build:directives` → `not ok 3 - the assembled audit directive no longer claims the orchestrator sets \`[x] DONE\` on PASS (L-27)`, `# fail 1`, exit 1. На немутированном клоне те же файлы: `# tests 56 / # pass 56 / # fail 0`. Замок двусторонний (`doesNotMatch` v1-фразы + `match` новой). |
| **F-2** — гейт красный на «подключена И `draft`» | **ЗАКРЫТА (мутация M5′)** | `status="draft"` на подключённой `ax-audit-hook.xml` → `build-directives.ts --check` **exit 1**: `✗ 1 axiom file(s) fail the collected-or-draft-or-pending invariant … process/ax-audit-hook.xml: AX_AUDIT_HOOK — connected by a {{> }} include AND marked status="draft"`. До правки на этом же входе было exit 0. |
| **F-2** — гейт красный на «подключена И в `PENDING_IN_OPEN_PR`» | **ЗАКРЫТА (мутация M6)** | Добавил `{{> "axiom/critic/ax-default-accept"}}` в `critic-protocol.directive.hbs` (имитация слияния PR #45/#49) → **exit 1**: `critic/ax-default-accept.xml: AX_DEFAULT_ACCEPT — connected by a {{> }} include AND still listed in PENDING_IN_OPEN_PR — its PR merged; delete the stale entry`. Сокращение списка обеспечено механически, не памятью. |
| **F-2** — список `PENDING_IN_OPEN_PR` = ровно 7 файлов открытых веток | **ПОДТВЕРЖДЕНО** | Вывел независимо: объединение `{{> "axiom/…"}}` по `ai/kit/templates/sdd-v2` для веток минус набор HEAD (114 партиалов). Результат — ровно те же 7 ключей, что в `lint-axioms.ts`. Атрибуция по PR совпадает построчно: #45 `lead/review-critic-bounds` и #49 `lead/promises-not-wider` → `critic/ax-default-accept`, `critic/ax-polish-mode`, `process/ax-cap-5`, `process/ax-dispatch-via-batch`; #41 `lead/spec-authoring` → `spec/ax-refine-module-preserves-contracts`; #38 `lead/phase-agent-bounds` → `process/ax-re-dispatch`, `process/ax-permitted-bash-commands`. Локальные вершины веток **побитово равны** `headRefOid` из `gh pr view` для всех четырёх PR. Проверены и **все остальные 7 открытых PR** (#48, #46, #43, #42, #40, #26, #25) — ни один не подключает новых аксиом, список полон. |
| **F-3** — `ax-default-accept.xml` побайтово равен базе | **ПОДТВЕРЖДЕНО** | `md5` файла на `2f726c3a` и на HEAD — `e2674702d3888722eb7f419795d7f480` в обоих случаях, `cmp` чист. Файл не входит в `git diff --name-only 2f726c3a HEAD`. Мотивировка вынесена в значение карты `PENDING_IN_OPEN_PR`, как заявлено. |
| **F-3** — `git merge-tree` чист | **ПОДТВЕРЖДЕНО** | `merge-tree --write-tree HEAD lead/promises-not-wider` → exit 0 **CLEAN**; то же для `lead/review-critic-bounds` → exit 0 **CLEAN**. Оба новых конфликта, внесённых пачкой, сняты; поведение совпало с базой `2f726c3a`. Предсуществующие конфликты не изменились: #41 — `ai/kit/lint-axioms.ts`, #38 — `STEP_2_IMPLEMENT.xml` + `phase-execution-protocol.directive.hbs`, одинаково на базе и на HEAD. |
| **F-4** | **ЗАКРЫТА** | Каждое утверждение нового комментария (`lint-axioms.ts:262-277`) перепроверено: `ai/directives/coding/typescript-rules.xml` существует; `AX_BASE_CONTRACT_SHAPE` определён там же (`:187`); `coding` входит в `STATIC_DIRECTIVE_DIRS` (`:309`); `AX_CONTRACT_BUDGET` во всём репозитории встречается только в цитате `agent-inbox/contract-interrogation.directive.xml:33` и в самой строке аллоулиста. Ложная квалификация «дефект дерева `agent-inbox`» снята и в коде, и в `R-T-B6-24.md:49`. |
| **F-5** | **ЗАКРЫТА ФОРМАЛЬНО / ЧАСТИЧНО** | Мёртвая самоссылка снята: подсказка `audit-halt-activation.mjs:346` указывает на `critic/interview-protocol/root -> H_UNFORMATTED_ASK`, и эти три записи в `ALLOWLIST_CROSS_DIRECTIVE_REFS` действительно существуют (`:143-145`). Но пример выбран неудачно — см. **F-10**. |
| **F-8** | **ЧАСТИЧНО** | Три названные подписи исправлены и сверены с кодом: `execute.directive.xml:67` ✓, `audit.directive.hbs:24` ✓, `lint-axioms.ts:332` (`collectStaticDirectiveFiles`) ✓. Но в той же диаграмме остались другие неточности — см. **F-11**. |
| F-6, F-7, F-9 | **НЕ ИСПРАВЛЕНЫ, ЧЕСТНО ОБЪЯВЛЕНО** | `R-BATCH-18-axioms-one-home.md` §7 помечает их «НЕ исправлено» с причиной; F-6 и остатки перенесены в §9. Претензий нет: все три — правки доски/трека, вне зоны `rc-v6`. |

### Числа — пересчитаны своим скриптом (`scratchpad/probe2.mjs`), не на глаз

Скрипт независимо обходит `ai/kit/axiom/{process,spec,audit,scaffold,boundary,critic,truth,interview}/**/*.xml`, собирает `{{> "axiom/…"}}` из всего корпуса шаблонов и разбирает список `PENDING_IN_OPEN_PR` прямо из исходника `lint-axioms.ts`.

| Метрика | Заявлено | Измерено мной | Вердикт |
|---|---|---|---|
| SDD-релевантных аксиом всего | 181 | **181** | ПОДТВЕРЖДЕНО |
| подключено (`{{> }}`) | 98 | **98** | ПОДТВЕРЖДЕНО |
| `status="draft"` и не подключено | 76 | **76** | ПОДТВЕРЖДЕНО |
| в `PENDING_IN_OPEN_PR` и не подключено | 7 | **7** | ПОДТВЕРЖДЕНО |
| сумма | 181 | **98 + 76 + 7 = 181** | ПОДТВЕРЖДЕНО |
| ни в одном из трёх состояний | 0 | **0** | ПОДТВЕРЖДЕНО |
| пересечения («подключена И draft», «подключена И pending») | 0 | **0 / 0** | ПОДТВЕРЖДЕНО |
| размер карты `PENDING_IN_OPEN_PR` | 7 | **7** | ПОДТВЕРЖДЕНО |
| дублей id среди 181 | нет | **нет** | ПОДТВЕРЖДЕНО |
| `dangling axiom(s)` база → HEAD | 35 → 35 | **35 → 35** | ПОДТВЕРЖДЕНО (`build-directives.ts --check` в клоне базы и в `rc-v6`) |
| файлов `git diff --name-only 2f726c3a..HEAD` | — | **100** = 85 аксиом + 7 сгенерированных + 3 `.hbs` + 3 `ai/kit/*.{ts,mjs}` + 2 теста | было 101; стало 100 ровно потому, что `ax-default-accept.xml` вернулся к базе (F-3) — согласовано |
| файлов в 4 правочных коммитах | — | **16**, каждый имеет строку в `R-BATCH-18-axioms-one-home.md` §7 | ПОДТВЕРЖДЕНО |

### Гейты — перезапущены мной синхронно в `rc-v6`, exit-коды мои

| Команда | Результат | Exit |
|---|---|---|
| `npm test` | `# tests 3737 / # pass 3729 / # fail 0 / # skipped 8` (было 3732/3724/0/8 — ровно +5 новых кейсов: 1 замок B-1 + 4 кейса F-2) | **0** |
| `npm run check:directives-fresh` | `✓ ai/directives/** matches a fresh rebuild.` — сгенерированные файлы синхронны с кирпичами | **0** |
| `npm run audit:sdd-templates` | все 5 подгейтов зелёные (`check:directives-fresh`, `audit:axioms` 28 шаблонов, `audit:contracts` 28+33+54, `audit:halts` 33+33, `check:directive-budgets`) | **0** |
| `npm run audit:contracts` | `✓ contract-activation audit clean` | **0** |
| `npm run gate:sdd-check-baseline` | `OK — no error outside the baseline (rc-baseline-1)` | **0** |
| `git status --porcelain` в `rc-v6` | пусто, HEAD = `682d338e` | — |

### Новые находки (обе МИНОРНЫЕ, неблокирующие)

**F-10 (MINOR). Правка F-5 заменила мёртвый пример на пример того же класса: `H_UNFORMATTED_ASK` не объявлен ни одной строкой `<HaltConditions>` нигде в репозитории.**

`ai/kit/audit-halt-activation.mjs:344-347` объясняет, что `ALLOWLIST_CROSS_DIRECTIVE_REFS` — для «a deliberate reference to ANOTHER directive's own **already-declared** halt», и приводит образцом `critic/interview-protocol/root -> H_UNFORMATTED_ASK`. Записи аллоулиста существуют (`:143-145`), поэтому формально F-5 закрыта. Но самого объявления нет:

```
grep -rn 'H_UNFORMATTED_ASK' ai | grep -v audit-halt-activation.mjs
  ai/directives/sdd-v2/root.directive.xml:108              # предложение из контракта
  ai/directives/sdd-v2/interview-protocol.directive.xml:301 # то же предложение
  ai/kit/contract/process/question-format.xml:21            # источник предложения
grep -rn '^\s*| *`H_UNFORMATTED_ASK`' ai   # → пусто: строки-объявления нет
grep -c 'H_UNFORMATTED_ASK' ai/directives/sdd-v2/critic.directive.xml   # → 0
```

То есть: (а) образец указывает на halt, которого не объявляет ни одна директива — ровно та форма, которую GAP-3 в этой же пачке устраняла для `H_ASK_WITHOUT_CARD`; (б) запись `critic.directive::H_UNFORMATTED_ASK` мертва — в `critic.directive.xml` этого id нет вовсе; (в) пояснение «a halt declared once, **fired from several directives** via a shared contract partial» противоречит и шапке самого скрипта (`:26-27` «declared and fires only in `router.directive.hbs`» — что тоже неверно: в таблице роутера этого id нет), и смыслу аллоулиста («a pointer, **not** a local re-raise»). Читатель, поверив подсказке, добавит в аллоулист halt, который директива поднимает у себя — то есть ровно то, что гейт обязан ловить.

Смягчающее: сама несогласованность **предсуществующая** — записи `:143-145` и `ALLOWLIST_UNUSED_HALT_IDS`-запись `H_UNFORMATTED_ASK` есть и на базе `2f726c3a`; пачка 18 её не вносила, а лишь выбрала в качестве образца. Правка: либо взять живым образцом действительно объявленный halt (например, `review-lifecycle.directive::H_BLOCKED` — `H_BLOCKED` объявлен в `phase-execution-protocol.directive.hbs`), либо завести отдельную строку доски на разбор `H_UNFORMATTED_ASK` (класс V14-2a).

**F-11 (MINOR). В mermaid «СТАЛО» `R-T-B6-24.md` §2 два узла называют `ai/kit/lint-axioms.ts` с номерами строк, принадлежащими `ai/kit/build-directives.ts`; ещё два числа устарели относительно HEAD.**

| Узел | Написано | Факт |
|---|---|---|
| `B2` («БЫЛО») | `lintUndefinedAxiomRefs`, `ai/kit/lint-axioms.ts:171 (до правки)` | `:171` — это `build-directives.ts:171` на базе `2f726c3a` (вызов). Определение в `lint-axioms.ts` на базе — `:157` |
| `A3` | `build-directives.ts:178`, `[...rendered, ...staticDirectiveFiles]` | верно на `edeb71c3`; на HEAD это `build-directives.ts:181` (`:180` — вызов `collectStaticDirectiveFiles`) |
| `A4` | `lintUndefinedAxiomRefs`, `ai/kit/lint-axioms.ts:180 (build-directives.ts)` | не совпадает ни с чем: определение — `lint-axioms.ts:172`, вызов — `build-directives.ts:181`; `lint-axioms.ts:180` — пустая строка |

Узел `A2` (`lint-axioms.ts:332`) при этом верен, поэтому диаграмма смешивает два файла под одной подписью. Стрелки как связи (вызов/включение) верны — неверны только координаты. Правка: привести все подписи к одному файлу и к состоянию `682d338e`.

### Итог повторной проверки

**Блокирующее — 0.** B-1 закрыта: взаимоисключающих правил о `[x] DONE` в собранных `STEP_2_SEMANTIC.xml`, `code-review.directive.xml`, `STEP_1_MECHANICAL.xml` больше нет; формулировка дословно соответствует L-27; остальной текст аксиомы остался побайтово v1 (`diff -w` пуст); регресс-замок проверен мутацией и падает при возврате v1-фразы.

**Неблокирующее — 2 новых:** F-10 (образец в подсказке `audit-halt-activation.mjs:346` указывает на halt `H_UNFORMATTED_ASK`, не объявленный ни одной `<HaltConditions>`; несогласованность предсуществующая, но выбрана образцом этой правкой), F-11 (четыре неточных `file:line` в mermaid `R-T-B6-24.md` §2). Обе — документационные, слияние не держат. Ранее открытые F-6, F-7, F-9 остаются как есть и честно объявлены в отчёте §7/§9 как правки доски/трека.

**Подтверждено:** F-2 закрыта в обе стороны воспроизводимыми мутациями (гейт красный и на «подключена И draft», и на «подключена И pending»); список `PENDING_IN_OPEN_PR` выведен мной независимо и совпал ровно — 7 файлов, атрибуция по PR #45/#49/#41/#38 построчно верна, локальные вершины веток равны `headRefOid` этих PR, остальные 7 открытых PR аксиом не подключают. F-3 закрыта: `ax-default-accept.xml` побайтово равен базе (`md5 e2674702…`), `merge-tree` против `lead/promises-not-wider` и `lead/review-critic-bounds` — чист, как и на базе; предсуществующие конфликты #41/#38 не изменились. F-4 закрыта в коде и в отчёте, каждое утверждение новой мотивировки перепроверено. Числа сошлись: 181 = 98 + 76 + 7, пересечений и дублей нет, dangling 35 → 35. Все пять гейтов (`npm test` 3737/3729/0 fail/8 skipped, `check:directives-fresh`, `audit:sdd-templates`, `audit:contracts`, `gate:sdd-check-baseline`) зелёные, дерево `rc-v6` чисто на `682d338e`.

**Вердикт: ПРИНЯТЬ** — пачка 18 готова к PR. F-10 и F-11 закрыть попутно или отдельной строкой доски; слияние они не держат. Обязательное условие §8 отчёта (снятие записей `PENDING_IN_OPEN_PR` после слияния PR #45/#49, #41, #38) обеспечено механически — гейт покраснеет `pending-but-connected`, проверено мутацией M6.
