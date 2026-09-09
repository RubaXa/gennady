ВЕРИФИКАЦИЯ — Пачка 20 «Ревью и критик ограничены и читают владельца тикета» (T-B6-03, ISS-10, T-B6-05, T-B6-20)

Проверяющий: `plan-verifier` (свежие глаза, только чтение кода).
Дата: 2026-09-09.
Проверяемое: ветка `lead/review-critic-bounds`, 4 коммита поверх `origin/codex/sdd-v2-rc52-followup` (`c9b58636`), дерево `rc-w3`.
Отчёты исполнителя: `_raw/reports/R-BATCH-20-review-critic-bounds.md`, `R-T-B6-03.md`, `R-ISS-10.md`, `R-T-B6-05.md`, `R-T-B6-20.md`.
Требования: `62-BATCH-QUEUE.md` «### Пачка 20»; `61-TASK-BOARD.md` §1 строки 36, 164, 166, 176; `40-TRACK-DIRECTIVES-SKILLS.md` §1.1 (D1), §1.3 (D3.3, D3.5, D3.6), §5 строки 836/838/848; `20-ISSUES-VERDICTS.md` §«## #21»; `06-ADEQUACY-GAP.md` §5.2 п.46a. Источник v1: `/Users/k.lebedev/Developer/gennady` @ `d37d5910`.

# ВЕРДИКТ: ВЕРНУТЬ

Три из четырёх задач по существу выполнены (T-B6-03 в части `AX_CAP_5`, T-B6-05, T-B6-20 в объявленном суженном объёме). Возврат вызван двумя блокирующими находками: **ISS-10 не работает на реальных артефактах репозитория** (5 из 6 вызовов `sdd-extract` по названным якорям падают), и **T-B6-03 собрал в критика отменённую редакцию `AX_DEFAULT_ACCEPT`**, которую сам v1 заменил коммитом с названием «bound critic convergence loop» — то есть правило, работающее против заголовка пачки. Обе правки локальны (два `.hbs` + пересборка), но требуют решения, а не механической замены строки.

---

## 1. Что перезапущено мной (все команды — синхронно, дерево `rc-w3`, не менялось)

| № | Команда | Мой фактический вывод | Exit | Совпадает с отчётом |
|---|---|---|---|---|
| 1 | `git -C <tree> diff --stat c9b58636..HEAD` | 9 файлов, 211 insertions, 24 deletions | 0 | да |
| 2 | `npm --prefix <tree> run check:directives-fresh` | `✓ ai/directives/** matches a fresh rebuild.` | 0 | да |
| 3 | `npm --prefix <tree> run audit:sdd-templates` | `✓ axiom-activation / contract-activation / halt-activation audit clean` + `✓ every lazy directive … within budget.` | 0 | да |
| 4 | `npm --prefix <tree> test` | `# tests 3645 # pass 3637 # fail 0 # cancelled 0 # skipped 8` (32.9 с, с первой попытки) | 0 | да (строка 6 отчёта) |
| 5 | `node --import tsx --test ai/kit/__tests__/review-critic-bounds.test.ts ai/kit/__tests__/deps.test.ts` | `# tests 42 # pass 42 # fail 0` | 0 | да (13 кейсов нового файла + 29 `deps`) |
| 6 | `node --import tsx --test cli/__tests__/directive-tool-contract/directive-tool-contract.test.ts` | `# tests 45 # pass 45 # fail 0` | 0 | да (строка 2 отчёта) |
| 7 | `npm --prefix <tree> run gate:sdd-check-baseline` | `OK — no error outside the baseline (baseline commit 227c03a8…, tag rc-baseline-1)` | 0 | да (строка 8 отчёта) |
| 8 | `git -C <tree> status --porcelain` | пусто | 0 | да |

`npm run check` (строка 7 отчёта, «флаки под нагрузкой») я не перезапускал: `npm test` и `gate:sdd-check-baseline` прошли начисто с первой попытки, `test:coverage`-флак исполнителя не воспроизвёлся и на код пачки не указывает. Претензий к этому пункту нет.

**Заявленные исполнителем аксиомы действительно были «висячими» до пачки** — перепроверено:
`git -C <tree> grep -ln "ax-cap-5\|ax-dispatch-via-batch\|ax-default-accept\|ax-polish-mode" c9b58636 -- ai/kit/templates` → пусто; на `HEAD` → три шаблона. ПОДТВЕРЖДЕНО.

**Конфликтов по файлам с открытыми PR нет** — перепроверено `gh pr view <n> --json files` для #38, #40, #41, #42, #43: пересечения с девятью файлами пачки — ноль. Отдельно отмечу в пользу исполнителя: `20-ISSUES-VERDICTS.md` §#21 предписывал класть тест ISS-10 в `ai/kit/__tests__/stateless-sdd-flow-contract.test.ts`, а этот файл входит в PR #41 — уход в новый файл `review-critic-bounds.test.ts` был правильным решением, а не самоволием. ПОДТВЕРЖДЕНО.

---

## 2. Находки

### БЛОКИРУЮЩИЕ

**B-1. ISS-10: названные якоря не существуют ни в одном формате tasks-index — 5 из 6 вызовов падают на реальных файлах.**
`ai/kit/templates/sdd-v2/critic-protocol.directive.hbs:14` (собрано в `ai/directives/sdd-v2/critic-protocol.directive.xml:31`) предписывает критику вытянуть `## Conventions` и `## Decision Log`. Канонические заголовки в форматах — с квалификатором уровня, буквального `## Decision Log` нет нигде:
- `ai/directives/sdd-v2/formats/project-tasks-index.xml:16` `## Project-Wide Conventions (declared once, inherited)`, `:36` `## Decision Log (project task level)`;
- `ai/directives/sdd-v2/formats/scope-tasks-index.xml:35` `## Decision Log (scope task level)` (секции `## Conventions` в формате нет вообще);
- `ai/directives/sdd-v2/formats/module-tasks-index.xml:27` `## Decision Log (module-task level)`, `:30` `## Conventions`.

Воспроизведение (перебор всех трёх реальных tasks-index репозитория × два якоря):
```
for f in $(find <tree>/specs -name "*.3-tasks.md" -o -name "3-tasks.md"); do
  for a in conventions decision-log; do node --import tsx <tree>/cli/index.ts sdd-extract "$f#$a"; done; done
```
Результат: `TOTAL ok=1 fail=5`. Падают: `#conventions` и `#decision-log` в `specs/3-tasks.md`; оба в `specs/ai-skills/ai-skills.3-tasks.md`; `#decision-log` в `specs/ai-skills/directive-assembly/directive-assembly.3-tasks.md`. Ошибка — `ERR_CLI_SDD_EXTRACT_ANCHOR_NOT_FOUND`, exit 2, с текстом «Do not dispatch a phase agent until anchors are in place», то есть жёсткий стоп внутри read-only критика, для которого директива не даёт никакого fallback.

**Единственный успешный вызов даёт не конвенции, а указатель.** `sdd-extract "…/directive-assembly.3-tasks.md#conventions"` возвращает ровно одну строку: конвенции «объявлены один раз в `specs/3-tasks.md` и наследуются здесь — не повторяются». То есть даже на модульном уровне, где якорь работает, критик по построенному read-set получает ноль конвенций.

**Требование `20-ISSUES-VERDICTS.md` §#21 «Что требуется в v2» выполнено не полностью:** там названы `## Conventions`/`## Decision Log` владельца **и `specs/3-tasks.md#CONVENTIONS`**, плюс проверяемое условие «rendered critic-protocol содержит `3-tasks.md`». Проверка: `grep -rn "3-tasks" ai/directives/sdd-v2/critic-protocol.directive.xml ai/kit/templates/sdd-v2/critic*.hbs` → **0 совпадений**. Проектный `specs/3-tasks.md` — фактический дом конвенций (именно туда указывает модульная секция) — в read-set не попал. ОПРОВЕРГНУТО утверждение сводного отчёта «критик … читает решения и конвенции владельца тикета».

**Замок цементирует дефект.** `ai/kit/__tests__/review-critic-bounds.test.ts:96-98` проверяет наличие подстрок `## Conventions`/`## Decision Log` в тексте директивы. Тест зелёный ровно потому, что сверяет прозу с собой; ни один тест не проверяет, что якорь разрешается хоть на одном реальном файле. Это тот самый «формально, а не по существу».

Правка (требует решения, не sed): либо (а) назвать в директиве якоря по факту формата — три квалифицированных варианта Decision Log + `## Project-Wide Conventions` — и добавить `specs/3-tasks.md` в read-set; либо (б) ввести в `sdd-extract` именованный логический якорь (`CONVENTIONS`, `DECISION_LOG`) по образцу уже существующего `VISION`/`MODULE_VISION` — это правка `cli/cmd/sdd-extract/**`, вне зоны пачки, значит отдельная задача; либо (в) обязать роутер класть пути механически (`sdd-task --task-scope` знает owning spec — прямо предложено в §#21). Плюс к любому варианту — тест, который реально запускает `sdd-extract` на фикстуре tasks-index каждого из трёх уровней.

**B-2. T-B6-03: в критика собрана отменённая редакция `AX_DEFAULT_ACCEPT`, отменённая в v1 именно ради ограничения цикла.**
Кирпич `ai/kit/axiom/critic/ax-default-accept.xml:2` несёт текст «Uncertain → ACCEPT. Cost of rejecting real finding > cost of accepting marginal one.». В v1 на `d37d5910` (источник переноса) `ai/directives/sdd/critic.directive.xml:17` читается прямо противоположно: «Uncertainty alone is NOT a blocking finding. ACCEPT only an artifact gap that passes AX_FINDING_EVIDENCE. A preference, alternative design, missing local convention, or question without concrete breakage → REJECT as blocking…».
Проверка происхождения: `git -C /Users/k.lebedev/Developer/gennady log --all -S"Cost of rejecting real finding" -- ai/` → текст кирпича соответствует состоянию **до** коммита `d6065c36` `fix(sdd): bound critic convergence loop` (2026-08-31), который его заменил. Кирпич к тому же уронил v1-оговорку «Applies to CLARIFYING findings … For ADDITIVE findings it inverts», то есть шире даже дореформенного v1.
Новая проза активации `ai/kit/templates/sdd-v2/critic-protocol.directive.hbs:17` («an uncertain candidate finding defaults to ACCEPT: the cost of losing a real finding outweighs the cost of one marginal false positive») сталкивается в одном и том же `<Action>` с `AX_CONFUSION_BUG` («triage every point of confusion … only `ARTIFACT_GAP` may [become a finding]») и с `AX_UNCERTAINTY_IS_SIGNAL` («uncertainty alone is not a verdict»), собранными в том же файле (`ai/directives/sdd-v2/critic-protocol.directive.xml:8, 10-21`). Итог: пачка, чей заголовок — «ревью ограничено», одной рукой ставит cap, другой включает правило, гонящее раунды.
Отдельно — **владелец не тот**: в v1 `ACCEPT`/`REJECT` — словарь шага `2_EVALUATE` оркестратора (`d37d5910:ai/directives/sdd/critic.directive.xml:130-135`), который распоряжается находкой. В v2 аксиома положена в read-only-воркера `critic-protocol`, чей выход — `CLEAN | findings`; слова `ACCEPT` в этой директиве больше нигде нет, оно не определено.
Воспроизведение: `git -C /Users/k.lebedev/Developer/gennady show d6065c36 -- ai/directives/sdd/critic.directive.xml | grep DEFAULT_ACCEPT` — виден `-`/`+` ровно этой замены.
Правка: либо перенести текст кирпича на актуальную v1-редакцию (`d37d5910`) и переактивировать в оркестраторе (`review-lifecycle` STEP_3 / `critic.directive.hbs`), либо снять `ax-default-accept` из этой пачки и завести отдельную задачу «выбрать каноническую редакцию AX_DEFAULT_ACCEPT» с записью в Decision Log. Кейс `review-critic-bounds.test.ts:70-74` менять вместе с решением.

### НЕБЛОКИРУЮЩИЕ

**N-1 (major). `AX_ISOLATION` не тронут и теперь противоречит `STEP_1_READ`.** `ai/directives/sdd-v2/critic-protocol.directive.xml:4` по-прежнему заканчивается «No other files, no full dependent specs», а `:31` предписывает читать ещё два раздела третьего документа. `20-ISSUES-VERDICTS.md` §#21 требовал расширить именно `AX_ISOLATION` (кирпич `ai/kit/axiom/critic/ax-isolation.xml`, включён `critic-protocol.directive.hbs:4`). Отчёт `R-ISS-10.md` §3 объясняет это «вне зоны трогать», но кирпич не принадлежит ни одному открытому PR — проверено по спискам файлов #38/#40/#41/#42/#43. Правка: расширить `ax-isolation.xml` явным исключением для двух названных секций.

**N-2 (major). `AX_POLISH_MODE` обещает шире механизма — канала `polish` нет.** `ai/directives/sdd-v2/critic-protocol.directive.xml:37` требует от воркера «only when the operator asked for polish», но `grep -rn "polish" ai/directives/sdd-v2/` даёт совпадения **только внутри самого `critic-protocol`**: диспетчер `review-lifecycle.directive.xml:33-45` поля `polish` в промпт воркера не кладёт. В v1 это было механизмом: `d37d5910:ai/directives/sdd/critic.directive.xml:104` (шаг `0_RESOLVE` определяет режим) и `:117` (`Polish: <on|off>` в теле dispatch). При переносе механизм потерян, осталось обещание. Правка: добавить `Polish: <on|off>` в перечень того, что STEP_2_INDEPENDENT_REVIEW передаёт ревьюеру, и кейс в тест.

**N-3 (major). Счётчик `AX_CAP_5` не имеет долговечного дома и запрещён соседней прозой.** `review-lifecycle.directive.xml:57-58` требует «count every STEP_2 dispatch across the whole review», при этом `:44-45` того же файла запрещает «create multi-round critic bookkeeping», а `AX_STATELESS_FLOW` (`ai/kit/axiom/process/ax-stateless-flow.xml`) объявляет спеки/тикеты/Git полным состоянием продолжения и «never required to resume» для scratch. Маркеры approval #1 хранят `pending|approved`, номера раунда — нет. Следствие: при возобновлении в новой сессии счётчик молча обнуляется, и cap перестаёт быть замком. В v1 счётчик имел артефактный дом — секция `## Critic Rounds` в самом артефакте (`d37d5910:ai/directives/sdd/critic.directive.xml`, Mission: «On CLEAN: delete `## Critic Rounds`»); v2 в этом месте слабее v1. Правка/остаток: назвать долговечный носитель счётчика (строка в Decision Log ревьюируемой спеки или поле маркера approval #1) — кандидат в отдельную задачу.

**N-4 (major). ISS-10 «измерено» не имеет выходного слота.** `critic-protocol.directive.xml:31` требует «record the extracted line count for each as part of this call's own accounting», но формат отчёта критика (`:37` — severity, artifact/anchor, violated contract, evidence, remediation) поля read-set-учёта не содержит; `review-lifecycle.directive.xml:39-40` («returns `CLEAN` or at most five … findings») тоже. Приёмка `06-ADEQUACY-GAP.md` §5.2 п.46a требует «объём вставки ограничен **и измерен**» — «ограничен» достигнуто структурно, «измерено» пока не наблюдаемо ни оператором, ни тестом. НЕ ПРОВЕРЯЕМО в текущем виде. Правка: добавить в `STEP_3_REPORT` обязательную строку `read-set: <файл>#<якорь> — N строк` и кейс на неё.

**N-5 (medium). `AX_DISPATCH_VIA_BATCH` ссылается на несуществующий шаг.** `ai/directives/sdd-v2/reconcile.directive.xml:142` (тело аксиомы) — «checks them at **STEP_7**»; последний шаг `reconcile` — `STEP_6_VERIFY` (`:324`), `STEP_7` в файле отсутствует. Проза активации на `:288` говорит правильно («STEP_6_VERIFY»), то есть директива противоречит сама себе. Источник — дословный перенос из v1 `fix.directive.xml`, где `STEP_7_EXECUTE`/`STEP_9_VERIFY` (`d37d5910:ai/directives/sdd/fix.directive.xml:286,310`). Правка одной строкой в `ai/kit/axiom/process/ax-dispatch-via-batch.xml:6`. Воспроизведение: `grep -n "STEP_7\|<Step id=" ai/directives/sdd-v2/reconcile.directive.xml`.

**N-6 (medium). Mermaid «стало» сводного отчёта: два ребра не соответствуют коду.**
- `ScopeEtAl["scope/module/infra/interface"] -->|"review-lifecycle.directive.xml:196"| RL` — (а) файл имеет 85 строк, строки 196 не существует; (б) `grep -rn "review-lifecycle.directive.xml" ai/directives/sdd-v2/scope.directive.xml ai/directives/sdd-v2/module.directive.xml` → **пусто**: `scope` и `module` этот файл не загружают вовсе. Реальные загрузчики — ровно три: `infra.directive.xml:485`, `interface.directive.xml:271`, `reconcile.directive.xml:298`.
- `Rec -->|"STEP_2_PROBE"| CP` — `reconcile.directive.xml:200-208` (`STEP_2_PROBE`) говорит «Dispatch the critic on the affected spec», но `critic-protocol` не называет; `grep -rn "critic-protocol" ai/directives/sdd-v2` даёт единственного загрузчика — `review-lifecycle.directive.xml:37`. Стрелка не является вызовом.
- Мелко: `RL -->|"STEP_2_INDEPENDENT_REVIEW:31"|` — шаг на `:28` в `.hbs` и `:33` в `.xml`; в `R-T-B6-03.md` §2 блок `AX_CAP_5` указан как `review-lifecycle.directive.hbs:63-70`, фактически `57-63`. Верное: `router.directive.hbs:122-123` ✓, `reconcile.directive.hbs:189` ✓.

**N-7 (medium). Ложное обоснование в коде.** `ai/kit/__tests__/deps.test.ts:81-82` — комментарий: reconcile «had carried no conduct include at all before this task». Фактически `reconcile.directive.hbs` до пачки уже включал `axiom/process/ax-operator-dialogue-style` — один из пяти аксиомов набора D1 (`40-TRACK-DIRECTIVES-SKILLS.md:81-82`). Проверка: `git -C <tree> show c9b58636:ai/kit/templates/sdd-v2/reconcile.directive.hbs | grep ax-operator-dialogue-style` → есть. Комментарий надо поправить на «не нёс `AX_PROGRESSIVE_DISCLOSURE`».

**N-8 (medium). T-B6-20: собственный новый владелец закрыт на 2 из 5.** Сужение объёма обосновано и мной подтверждено — механическая проверка присутствия пяти аксиомов D1 по 15 владельцам:
```
AX_OPERATOR_DIALOGUE_STYLE       нет у: scope module scaffold execute critic
AX_NO_PROCESS_NARRATION          нет у: scope module scaffold execute critic audit code-review reconcile
AX_PROGRESSIVE_DISCLOSURE        нет ни у кого (закрыто)
AX_DIVERGE_BEFORE_RECOMMEND      нет у: discover-from-code migration-v1-v2 recover-from-code scope module scaffold execute critic audit code-review reconcile
AX_READER_WITHOUT_SESSION_CONTEXT нет у: migration-v1-v2 readiness scope module scaffold execute critic reconcile
```
Расширение `REQUIRED_CONDUCT` до пяти действительно потребовало бы `execute.directive.hbs` (PR #38) и `scope`/`module.directive.hbs` (PR #41) — стоп-условие сработало бы правомерно. ПОДТВЕРЖДЕНО. Но `reconcile` — файл **этой** пачки, и ему недостаёт трёх из пяти (`AX_NO_PROCESS_NARRATION`, `AX_DIVERGE_BEFORE_RECOMMEND`, `AX_READER_WITHOUT_SESSION_CONTEXT`); добавить их можно было без выхода из зоны. Правка дешёвая — три `{{> …}}` в `reconcile.directive.hbs` + пересборка.

**N-9 (low, информационно). Побочный эффект пересборки шире, чем «дедуп».** `ai/directives/sdd-v2/readiness.directive.xml` не просто получил имя в строке Inherited — он **потерял собственное определение** `AX_PROGRESSIVE_DISCLOSURE` (было `:243-250`, стало наследование от `reconcile`). Механика корректна (`ai/kit/delta-assembly.ts:186-190` берёт пересечение по всем входящим рёбрам, а `readiness` загружает только `reconcile.directive.xml:187`), и `check:directives-fresh` это держит; но `readiness` теперь не самодостаточен, и любой будущий второй загрузчик без этой аксиомы её потеряет. Формулировка отчёта «механический эффект пересборки (дедуп „уже в контексте“)» верна, но не сообщает, что тело аксиомы из файла ушло. Достаточно уточнить формулировку в отчёте.

### ПОДТВЕРЖДЕНО (без замечаний)

- **T-B6-03, часть `AX_CAP_5`.** `review-lifecycle.directive.hbs:11` (include), `:57-63` (активация в `STEP_3_RECONCILE`) — цикл ограничен, три диспозиции названы дословно (`CLEAN` / `CONTINUE THROUGH ROUND N` / `RESTART: reason`), «вердикт ревьюера сам по себе не разрешает продолжение» присутствует. Соответствует доске (`61:164`) и `40:836`, и богаче v1 (`d37d5910:ai/directives/sdd/critic.directive.xml:14` — «Max 5 rounds … flag MAX_ROUNDS»): добавлена явная операторская диспозиция. С оговоркой N-3 о долговечности счётчика.
- **T-B6-05.** `reconcile.directive.hbs:60` + `:185-195`: reopen диспетчится через `execute.directive.xml` одним BATCH; «no reconcile-only audit flag», «execute remains the sole owner … audit and code-review», «never dispatches a second review». Перепроверено сплошным `grep -n "audit\|code-review" ai/directives/sdd-v2/reconcile.directive.xml` — ни одного места, где reconcile заводит собственный аудит; `:336` дополнительно запрещает «catch-all second audit/code-review». Заголовочный тезис «reconcile не заводит собственный аудит» — ПОДТВЕРЖДЁН. Отмечу для честности: смысловая часть запрета существовала в базе до пачки, вклад коммита — именование аксиомы и явный BATCH-контур; это соответствует формулировке `40:838` («`AX_DISPATCH_VIA_BATCH` собран в reconcile»), претензии нет.
- **T-B6-20 (в объявленном объёме).** `deps.test.ts:98` — 15-я запись `reconcile.directive.xml`; `reconcile.directive.hbs:34` — include. Тест реально падает при отвязке (см. §3).
- **Форма вызова `sdd-extract <file>#<anchor>` существует и работает.** `cli/cmd/sdd-extract/sdd-extract.types.ts:206-231` (`toHeadingOutcome`); успешный прогон на реальном файле приведён в B-1. Отклонение №3 сводного отчёта (обёртка в `<ToolLiteral role="delegated">` по требованию `directive-tool-contract.test.ts`) — обосновано, тест перезапущен мной: 45/45.
- **Таблица «файл → смысл»** сводного отчёта покрывает все 9 файлов из `git diff --stat`; расхождений нет.
- **Все 8 команд-доказательств** сводного отчёта, которые я мог перезапустить, воспроизвелись (§1).

---

## 3. Регрессионные замки: упадут ли тесты, если аксиому отвязать

| Аксиома | Замок | Держит |
|---|---|---|
| `AX_CAP_5` | `review-critic-bounds.test.ts:45` (`<Axiom id="AX_CAP_5">` в собранном файле), `:49-52` (активация внутри `STEP_3_RECONCILE`), `:55-59` (три диспозиции), `:62-65` | да — снятие `{{> "axiom/process/ax-cap-5"}}` убирает тело из `.xml`, и первый же `assert.match` падает; `check:directives-fresh` не даёт разойтись `.hbs` и `.xml`, `audit:axioms` ловит объявление без активации |
| `AX_DEFAULT_ACCEPT` / `AX_POLISH_MODE` | `:71-74`, `:77-80`, `:83-87` | да, тем же механизмом |
| `AX_DISPATCH_VIA_BATCH` | `:107-110`, `:112-118` | да |
| `AX_PROGRESSIVE_DISCLOSURE` у `reconcile` | `deps.test.ts:100-107` | да, но проверка удовлетворяется и **строкой наследования** «Inherited from the loading directive», а не только определением (см. N-9) |
| ISS-10 (read-set критика) | `:93-105` | **формально да, по существу нет** — все три кейса сверяют прозу с прозой; ни один не запускает `sdd-extract`, поэтому замок зелёный при неработающих якорях (B-1) |

Общая оценка: замки текстовые (сверяют форму собранной директивы), что для директивного слоя нормально и соответствует практике репозитория; единственный содержательный пробел — ISS-10, где нужен исполняемый кейс.

---

## 4. Предлагаемые правки (по убыванию приоритета)

1. **B-1** — переделать read-set ISS-10 под фактические якоря форматов (`## Project-Wide Conventions`, `## Decision Log (project task level|scope task level|module-task level)`), добавить `specs/3-tasks.md` в read-set, и завести кейс, который реально вызывает `sdd-extract` на фикстуре каждого уровня. Альтернатива с логическим якорем (`CONVENTIONS`/`DECISION_LOG` по образцу `VISION`) — отдельная задача с зоной `cli/cmd/sdd-extract/**`.
2. **B-2** — решить, какая редакция `AX_DEFAULT_ACCEPT` каноническая, и записать решение; при выборе актуальной v1-редакции — переписать `ai/kit/axiom/critic/ax-default-accept.xml`, перенести активацию к оркестратору, поправить `critic-protocol.directive.hbs:17` и кейс `:77-80`.
3. **N-1** — расширить `ai/kit/axiom/critic/ax-isolation.xml` явным исключением для двух секций владельца (иначе директива противоречит сама себе).
4. **N-2** — вернуть поле `Polish: <on|off>` в диспетч `review-lifecycle.directive.hbs` STEP_2 + кейс.
5. **N-5** — `ai/kit/axiom/process/ax-dispatch-via-batch.xml:6`: `STEP_7` → `STEP_6_VERIFY`.
6. **N-4** — добавить строку учёта read-set в `STEP_3_REPORT` + кейс (закрывает п.46a приёмки по слову «измерено»).
7. **N-8** — добавить `reconcile` недостающие три conduct-аксиомы (зона пачки, конфликтов нет).
8. **N-6, N-7, N-9** — правки в отчётах/комментарии: убрать `scope`/`module` и строку `:196` из mermaid, убрать ребро `Rec → CP`, поправить комментарий `deps.test.ts:81-82`, уточнить формулировку про `readiness`.

Коммиты `1da11d89` (T-B6-05) и `467ab3f3` (T-B6-20) правок по существу не требуют — при переработке ветки их можно сохранить как есть.

---

## 5. Остатки для доски

| Куда | Что записать |
|---|---|
| `61-TASK-BOARD.md` строка 36 (`ISS-10`) | Статус ← «В РАБОТЕ»; в примечание: «якоря `## Conventions`/`## Decision Log` не существуют в форматах tasks-index (квалификаторы уровня); `specs/3-tasks.md#CONVENTIONS` не в read-set; приёмка `06 §5.2 п.46a` в части „измерено“ не закрыта — нужен слот в отчёте критика» |
| `61-TASK-BOARD.md` строка 164 (`T-B6-03`) | В примечание: «`AX_CAP_5` закрыт; `ax-default-accept` собран в дореформенной редакции v1 (отменена `d6065c36`) — нужен вердикт по канонической редакции» |
| Новая задача (трек 40 / T-B6) | **«Каноническая редакция `AX_DEFAULT_ACCEPT` и её владелец»** — выбрать между текстом `d37d5910` и текстом кирпича; активировать у оркестратора, а не у read-only-воркера. S. |
| Новая задача (трек 40 / T-B6) | **«Долговечный носитель счётчика раундов `AX_CAP_5`»** — сегодня счётчик противоречит `AX_STATELESS_FLOW` и запрету bookkeeping в `review-lifecycle` STEP_2; в v1 роль играла секция `## Critic Rounds`. S. |
| Новая задача (трек 40 / T-B6, кандидат в пачку 21) | **«`Polish: <on|off>` — механизм, а не обещание»**: поле в диспетче `review-lifecycle` STEP_2. XS. |
| Новая задача (трек 40, зона `cli/**`) | **«Логические якоря `CONVENTIONS`/`DECISION_LOG` в `sdd-extract`»** по образцу `VISION`/`MODULE_VISION` — снимает зависимость директив от буквальных заголовков. S. Зависит от согласования с владельцами `cli/cmd/sdd-extract/**`. |
| `61-TASK-BOARD.md` строка 176 (`T-B6-20`) | Зафиксировать: закрыт один владелец (`reconcile`) при `REQUIRED_CONDUCT` из одного элемента; полное закрытие D1 (5 аксиомов × 15 владельцев) остаётся и требует зоны `execute`/`scope`/`module` — то есть после слияния PR #38 и #41. Приложить измеренную матрицу пропусков из N-8. |
| `40-TRACK-DIRECTIVES-SKILLS.md` §1.1 | Отметить, что `AX_PROGRESSIVE_DISCLOSURE` теперь у всех 15 владельцев (D1 закрыт на 1/5), остальные четыре — открыты. |

---

## 6. Итог

**Блокирующее (2).**
1. B-1 — ISS-10 не работает на реальных артефактах: 5 из 6 вызовов `sdd-extract` по названным в директиве якорям падают `ERR_CLI_SDD_EXTRACT_ANCHOR_NOT_FOUND`, единственный успешный возвращает указатель вместо конвенций; `specs/3-tasks.md` из требования `20-ISSUES §#21` в read-set не попал; замок сверяет прозу с прозой и потому зелёный.
2. B-2 — T-B6-03 собрал в критика редакцию `AX_DEFAULT_ACCEPT`, отменённую в v1 коммитом `d6065c36` «bound critic convergence loop», и активировал её в read-only-воркере, где слово `ACCEPT` не определено; она противоречит `AX_CONFUSION_BUG` и `AX_UNCERTAINTY_IS_SIGNAL` в том же `<Action>` и работает против заголовка пачки.

**Неблокирующее (9).** N-1 `AX_ISOLATION` не расширен и противоречит `STEP_1_READ`; N-2 `polish` — обещание без канала в диспетче; N-3 счётчик `AX_CAP_5` без долговечного дома и против `AX_STATELESS_FLOW`; N-4 «измерено» без выходного слота; N-5 `STEP_7` вместо `STEP_6_VERIFY` в теле `AX_DISPATCH_VIA_BATCH`; N-6 два ложных ребра и битая строка `:196` в mermaid «стало»; N-7 ложное обоснование в комментарии `deps.test.ts`; N-8 `reconcile` закрыт на 2 из 5 conduct-аксиомов при доступной зоне; N-9 `readiness` потерял собственное определение аксиомы (описано в отчёте неполно).

**Подтверждено.** `AX_CAP_5` собран и применён с явной операторской диспозицией (T-B6-03 в этой части выполнен); T-B6-05 выполнен — reconcile диспетчит reopen одним execute-BATCH и нигде не заводит собственный аудит; T-B6-20 выполнен в объявленном суженном объёме, сужение обосновано и мной перепроверено измерением (расширение действительно упёрлось бы в PR #38/#41); форма вызова `sdd-extract <file>#<anchor>` существует и работает; все четыре аксиомы до пачки были висячими; конфликтов по файлам с PR #38/#40/#41/#42/#43 — ноль; таблица «файл → смысл» покрывает все 9 файлов диффа; восемь команд-доказательств перезапущены мной и воспроизвелись (`npm test` — 3645/3637/0/8, `check:directives-fresh`, `audit:sdd-templates`, `gate:sdd-check-baseline` — все зелёные с первой попытки, дерево чисто).
