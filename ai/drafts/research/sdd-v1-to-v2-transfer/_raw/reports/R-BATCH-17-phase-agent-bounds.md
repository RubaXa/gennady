СВОДНЫЙ ОТЧЁТ — Пачка 17 «Фазовый агент не выходит за свои файлы и умеет остановиться»

СТАТУС: DONE, 4/4 задач, 0 стопов. + правки верификатора V-BATCH-17 применены (1 код-фикс, см. «§ Правки по V-BATCH-17» в конце).

Рабочее дерево: `rc-v6` (`/private/tmp/claude-503/.../scratchpad/rc-v6`), ветка `lead/phase-agent-bounds`.

**База ветки (переписано по правке верификатора V-BATCH-17 — прежняя формулировка ошибочно утверждала, что PR #30 ещё не влит).** Ветка `lead/phase-agent-bounds` основана на `61b86fb8` (`fix(T-B6-23): critic-protocol restores the correct confusion triage` — голова PR #30, Пачка 5). PR #30 влит в `codex/sdd-v2-rc52-followup` **2026-09-08 19:21:19 UTC**, а первый коммит этой пачки (`70361d49`) датирован 19:42 UTC — то есть база уже была влита ДО старта пачки, а не после. Проверено: `git merge-base --is-ancestor 61b86fb8 origin/codex/sdd-v2-rc52-followup` → YES; `git diff --stat origin/codex/sdd-v2-rc52-followup...HEAD` уже даёт ровно 5 коммитов этой пачки (11 файлов, +224/−32 после довеска V-BATCH-17 ниже) без какого-либо ребейза. Ребейз перед PR НЕ ТРЕБУЕТСЯ и ничего не сократит — сокращать нечего.

---

## Что это и зачем (простыми словами)

Фазовый агент — модель, которую диспетчер запускает на одну фазу тикета — должна знать две вещи: (1) какие свои файлы она чинит, а какие чужие поломки не её забота, и какие bash-команды вообще разрешены; (2) когда упираться и звать оператора вместо того, чтобы импровизировать или бесконечно повторять одну и ту же неудачную попытку. Аудит трека 40 (раздел D7) и issue akkrat #19 нашли: оба инварианта существовали как аксиомы-файлы, но НИ ОДИН шаблон их не подключал — фазовый агент физически не мог их прочитать; комментарий в скрипте, который должен был это ловить, сам врал про то, что уже подключено; git был запрещён агенту трижды подряд, даже для теста guard-скрипта, которому нужен throwaway git-репозиторий; а цикл «диспетчер редиспатчит после правки» не имел правила остановки на повторяющемся наборе находок.

Четыре задачи чинят это:
1. **T-B6-12** — фазовый агент получает границу «свои файлы vs чужие», список разрешённых команд и объявленную остановку `H_BLOCKED`.
2. **T-B6-27** — лживый комментарий про то, что якобы уже подключено, исправлен целиком (обе фиктивные половины).
3. **ISS-8** — агенту, который тестирует guard-скрипт, разрешён СВОЙ временный git-репозиторий — строго в `.claude/tmp/`, без доступа к реальному репозиторию.
4. **T-B6-16** — если диспетчер повторно получает тот же самый блокирующий набор находок без нового доказательства, цикл останавливается вместо бесконечных попыток.

---

## Таблица «файл → смысл»

| Файл | Задача | Смысл | Чем доказано |
|---|---|---|---|
| `ai/kit/templates/sdd-v2/phase-execution-protocol.directive.hbs` | T-B6-12 | Подключены `ax-permitted-bash-commands`/`ax-blocker-escalation`; объявлены `H_BLOCKED`+`H_OUT_OF_PHASE_WRITE`; ERROR OWNERSHIP дословно в STEP_1_ORIENT | `audit:halts`, `check:directive-budgets`, `stateless-sdd-flow-contract.test.ts` |
| `ai/kit/audit-halt-activation.mjs` | T-B6-27 | Удалены 2 фиктивные записи `ALLOWLIST_CROSS_DIRECTIVE_REFS` (обе лгали про несуществующие подключения) | `audit:halts` зелен до/после (записи были инертны) |
| `ai/kit/audit-halt-activation.mjs` | V-BATCH-17 (правка верификатора) | `H_ID_RE`/`AX_ID_RE` были объявлены с `/g` и переиспользовались и для `.test()`, и для `matchAll` — `.test()` двигал `lastIndex`, который затем наследовал `matchAll` через тот же объект, из-за чего часть текста директивы могла остаться несканированной; разделены на non-global (для `.test()`) и `_G_RE` (для `matchAll`) пары | синтетический до/после-репро (два упоминания `H_` подряд → было видно только второе, стало — оба); `audit:halts` на HEAD — 33+33, 0 нарушений |
| `ai/kit/axiom/process/ax-permitted-bash-commands.xml` | ISS-8 | +безусловный `git status --porcelain`; +throwaway-фикстура строго в `.claude/tmp/<fixture>/`; §5-граница не расширена | ручное чтение против #19; `audit:halts`/`check:directive-budgets` |
| `ai/kit/axiom/process/ax-re-dispatch.xml` | T-B6-16 | +правило: повтор блокирующего набора без нового evidence → `H_NO_PROGRESS` | ручное чтение; `audit:halts` |
| `ai/kit/templates/sdd-v2/execute.directive.hbs` | T-B6-16 | Подключён `ax-re-dispatch`; `H_NO_PROGRESS` объявлен и использован в STEP_6_AUDIT_REVIEW | `audit:halts`, `check:directive-budgets` |
| `ai/directives/sdd-v2/phase-execution-protocol.directive.xml` + `phase-execution-protocol/steps/STEP_{1,2,3}_*.xml` | T-B6-12, ISS-8 | Пересобранные производные шаблона (не редактировались вручную) | `check:directives-fresh` |
| `ai/directives/sdd-v2/execute.directive.xml` | T-B6-16 | Пересобранная производная шаблона | `check:directives-fresh` |
| `ai/inspector/core/__tests__/parse-directive.test.ts` | T-B6-16 (побочно) | Снапшот halt-id для `execute.directive.xml` дополнен `H_NO_PROGRESS` — вне зоны брифа, необходимое следствие (см. R-T-B6-16.md «Отклонения») | сам тест зелен |

Полные таблицы, точные проценты/номера строк — в `R-T-B6-12.md`, `R-T-B6-27.md`, `R-ISS-8.md`, `R-T-B6-16.md`.

---

## Схема «было → стало» (весь контур пачки)

### Было

```mermaid
flowchart TB
  AXPBC["ax-permitted-bash-commands.xml — 0 шаблонов"]
  AXBE["ax-blocker-escalation.xml — 0 шаблонов"]
  AXRD["ax-re-dispatch.xml — 0 шаблонов"]
  PEP["phase-execution-protocol.directive.hbs — БЕЗ HaltConditions"]
  EXE["execute.directive.hbs — БЕЗ H_NO_PROGRESS, цикл может повторяться бесконечно"]
  MJS["audit-halt-activation.mjs — 2 лживые записи в allowlist"]
  GITBAN["git запрещён фазе трижды подряд, даже для guard-теста (#19)"]
  style AXPBC fill:#611,stroke:#f66,color:#fff
  style AXBE fill:#611,stroke:#f66,color:#fff
  style AXRD fill:#611,stroke:#f66,color:#fff
  style MJS fill:#611,stroke:#f66,color:#fff
  style GITBAN fill:#611,stroke:#f66,color:#fff
```

### Стало

```mermaid
flowchart TB
  AXPBC["ax-permitted-bash-commands.xml + fixture-исключение (ISS-8)"] --> PEP
  AXBE["ax-blocker-escalation.xml"] --> PEP
  PEP["phase-execution-protocol.directive.hbs — HaltConditions: H_BLOCKED, H_OUT_OF_PHASE_WRITE (T-B6-12)"]
  AXRD["ax-re-dispatch.xml + provable-progress правило"] --> EXE
  EXE["execute.directive.hbs — HaltConditions: +H_NO_PROGRESS (T-B6-16)"]
  MJS["audit-halt-activation.mjs — 2 лживые записи удалены (T-B6-27)"] -.-> PEP
  PEP --> HALTS["npm run audit:halts — 33+33, clean"]
  EXE --> HALTS
  MJS --> HALTS
  style PEP fill:#163,stroke:#3a3,color:#fff
  style EXE fill:#163,stroke:#3a3,color:#fff
  style MJS fill:#163,stroke:#3a3,color:#fff
  style HALTS fill:#163,stroke:#3a3,color:#fff
```

---

## Доказательства (числа — итоговые, на финальном состоянии всех 5 коммитов, включая V-BATCH-17 код-фикс)

| Команда | Результат | Exit |
|---|---|---|
| `npm --prefix rc-v6 test` | `# tests 3605 / pass 3595 / fail 0 / cancelled 0 / skipped 10` (duration 42.6s) | 0 |
| `npm --prefix rc-v6 run check` (sdd-verify --profile full) | `ALL PASS (5/5)`: type-check 5.4s, test:coverage 68.1s, lint 23.7s, format 9.3s, yagni 1.5s | 0 |
| `npm --prefix rc-v6 run build:directives && npm --prefix rc-v6 run check:directives-fresh` | «Generated 55 directive(s)»; «✓ ai/directives/** matches a fresh rebuild»; `git status --short` пуст после сборки | 0 |
| `npm --prefix rc-v6 run audit:sdd-templates` (fresh + audit:axioms + audit:contracts + audit:halts + check:directive-budgets) | все 5 под-гейтов «✓ clean» / «✓ within budget»; `audit:halts` — 33 template(s) + 33 assembled directive(s), 0 нарушений | 0 |
| `npm --prefix rc-v6 run gate:sdd-check-baseline` | «no error outside the baseline (baseline commit 227c03a8..., tag rc-baseline-1)» | 0 |

**Замечание о нестабильности `npm test` (наблюдение верификатора V-BATCH-17, не воспроизведено в этом прогоне).** Верификатор отметил, что первый из трёх его прогонов `npm test` дал `# tests 3543 / fail 1 / cancelled 5` при 107с против 44с у зелёных прогонов — профиль (усечённое число тестов + `cancelled`) соответствует известной недетерминированности `node --test` раннера (аналитическая задача `REL-15`), не изменениям этой пачки. Мой собственный прогон после довеска V-BATCH-17 — чисто с первого раза (3605/3595/0/0, 42.6с); повторные прогоны для подтверждения нестабильности не запускались (не входит в ПРИЁМКУ бустрапа V-BATCH-17).

Каждый из 5 коммитов ТАКЖЕ прошёл `pre-commit` целиком (тот же набор гейтов) без `--no-verify`, в порядке, зафиксированном ниже.

**5 коммитов (по порядку, локальные, НИЧЕГО не запушено):**
| # | SHA | Тема |
|---|---|---|
| 1 | `70361d49` | T-B6-12 — permitted-command list, blocker escalation, H_BLOCKED |
| 2 | `e5e9a9b1` | T-B6-27 — halt-activation script comment fix (2 fabricated entries dropped) |
| 3 | `6b60f7e9` | ISS-8 — throwaway-fixture exception to the phase-agent git ban |
| 4 | `6de96024` | T-B6-16 — H_NO_PROGRESS on repeated blocking finding set |
| 5 | `b55f7cac` | V-BATCH-17 (код-фикс верификатора) — audit-halt-activation regexes no longer share /g lastIndex state |

`git diff --stat 61b86fb8..HEAD` (HEAD = `b55f7caca40fc132283894384371fa331bb3c1dc`) — 11 файлов, +224/−32 (было +207/−27 до довеска V-BATCH-17, +17/−5 от коммита 5).

---

## Приёмка (по пунктам брифа)

| Пункт | Статус |
|---|---|
| T-B6-12: границы собраны как аксиомы, объявлена остановка «заблокирован», «phase worker owns failures only inside its own Target Files» — грепается | ВЫПОЛНЕНО |
| T-B6-27: комментарий исправлен целиком, `audit:halts` зелен | ВЫПОЛНЕНО |
| ISS-8: именованное исключение для черновикового репозитория (текст аксиома) | ВЫПОЛНЕНО (текст); поведенческая приёмка через группы эвалов G1/G3 (`50-TRACK-EVAL.md` §3 — уточнено по правке верификатора V-BATCH-17: это группы, а не идентификаторы сценариев) и код-сторона (`cli/cmd/sdd-verify/workspace-mutation.ts:101,138` — `EXCLUDED_TOOL_DIRS` не игнорирует `.claude/tmp/**`; `ax-stale-after-pivot-verification` сборка) — НЕ ВЫПОЛНЕНО, вне зоны/инструментария этой пачки; закрывать строку ISS-8 на доске с оговоркой «текстовая часть; приёмка G1/G3 — за треком EVAL», см. `R-ISS-8.md` |
| T-B6-16: повтор блокирующего набора без нового evidence останавливает цикл, «halts on repeated finding set with no new evidence» — грепается | ВЫПОЛНЕНО (только правило останова; both-way про запись вердикта — сознательно НЕ реализовано, за отложенной темой §3.4 по риску батча; уточнено по правке верификатора V-BATCH-17 — запись `[verdict: pending-operator]` уже сегодня корректно сбрасывает счётчик как «genuinely new edit», но явная письменная оговорка про этот сценарий в `ax-re-dispatch.xml` пока отсутствует, владелец — V14-2a, см. `R-T-B6-16.md`) |
| `npm test` | ВЫПОЛНЕНО, 0 fail |
| `npm run check` | ВЫПОЛНЕНО, ALL PASS 5/5 |
| `npm run build:directives && npm run check:directives-fresh` | ВЫПОЛНЕНО |
| `npm run audit:sdd-templates` | ВЫПОЛНЕНО |
| `npm run gate:sdd-check-baseline` | ВЫПОЛНЕНО |

---

## Стопы

**Ноль.** Пре-коммит хук один раз потребовал вторую попытку (T-B6-12: первая версия правки STEP_3_VERIFY сломала regex-тест из-за переноса строки внутри искомой фразы — исправлено формулировкой, не логикой; см. `R-T-B6-12.md` §4 «Отклонение 3»). Задача T-B6-16 дополнительно потребовала правки файла вне списка «трогать» (`ai/inspector/core/__tests__/parse-directive.test.ts`) — механическое следствие нового halt-id, не поведенческое изменение, задокументировано отдельно (`R-T-B6-16.md` §4 «Отклонение 1»). Ни один из пяти классов безусловной остановки (`70-ORCHESTRATION-PROTOCOL.md` § «Условия безусловной остановки») не сработал.

---

## Отклонения от брифа (сводно, детали — в отчётах по задаче)

1. **T-B6-12** — файловый скоуп сужен до актуального (`62-BATCH-QUEUE.md`/`61-TASK-BOARD.md` §1), а не полной таблицы `40-TRACK-DIRECTIVES-SKILLS.md` §5.1: `ax-phase-scope-lock.xml` НЕ редактирован, ERROR OWNERSHIP вписан прозой в `phase-execution-protocol.directive.hbs` вместо библиотечного аксиома — не нарушает буквальный список «трогать», даёт требуемую строку-доказательство.
2. **T-B6-12** — побочно закрыт предсуществующий дефект: `H_OUT_OF_PHASE_WRITE` был упомянут `ax-phase-scope-lock` без строки в `HaltConditions` (таблицы не было вовсе до этого коммита); добавлена строка. Уточнено по правке верификатора V-BATCH-17: нарушение существовало уже на базе `61b86fb8`, а гейт `audit:halts` его молча пропускал (не падал) — причина найдена и исправлена отдельно, см. «§ Правки по V-BATCH-17».
3. **T-B6-27** — исправлены ОБЕ фиктивные записи комментария (диапазон брифа `:135-141` в дереве после T-B6-27 занимал `:138-150`, а после V-BATCH-17 код-фикса сместился на `:150-167` — и покрывал обе), не только первую половину, названную в `40-TRACK` D7.4 как предмет именно T-B6-12/T-B6-27.
4. **ISS-8** — код-сторона #19 (snapshot-исключение `.claude/tmp/**`, сборка `ax-stale-after-pivot-verification`) осталась НЕ закрытой — файлы вне зоны брифа (`shared/**`, `cli/**`) и вне списка задач Пачки 17.
5. **T-B6-16** — both-way про запись `[verdict: pending-operator]` сознательно не реализован (механизма записи ещё нет в дереве; явно отложено на V14-2e согласно риск-примечанию батча); правка снапшот-теста инспектора вне зоны — необходимое следствие нового halt-id.

**Открытые вопросы Lead (дополнено строками доски из V-BATCH-17 §B/«Итог»):**
- Нужна ли отдельная будущая задача на код-сторону #19 (пп. (a)/(b) из `R-ISS-8.md` «Отклонение 2»)? Для пункта (a) верификатор уже сформулировал готовую строку доски `ISS-8b` (S) — см. «§ Правки по V-BATCH-17» ниже.
- Нужна ли отдельная правка `ax-phase-scope-lock.xml`, чтобы ERROR OWNERSHIP жил в библиотечном аксиоме, а не только прозой в `phase-execution-protocol.directive.hbs` (T-B6-12 «Отклонение 1»)? `40-TRACK-DIRECTIVES-SKILLS.md:779` (§4.4) называет домом D7.2 именно этот файл; строка D7.2 в §1.7 формально остаётся «НЕТ» по этому адресу до переноса.
- Кто владеет явной оговоркой «запись вердикта `[verdict: pending-operator]` в тикет — это genuinely new edit, поэтому `H_NO_PROGRESS` не должен считать её попыткой без прогресса» в `ax-re-dispatch.xml`? Верификатор называет владельцем задачу V14-2a; строку на доску добавляет Lead.
- ISS-8 на доске закрывать только с оговоркой «текстовая часть выполнена; приёмка через группы эвалов G1/G3 — за треком EVAL».

---

## Команды пуша для Lead

```
git -C <lead-worktree или rc-v6> push origin lead/phase-agent-bounds
gh pr create --base codex/sdd-v2-rc52-followup --head lead/phase-agent-bounds \
  --title "Пачка 17: фазовый агент не выходит за свои файлы и умеет остановиться" \
  --body-file ai/drafts/research/sdd-v1-to-v2-transfer/_raw/reports/R-BATCH-17-phase-agent-bounds.md
```
(Ветка основана на `61b86fb8` — голове PR #30, влитого в `codex/sdd-v2-rc52-followup` ДО старта этой пачки (2026-09-08 19:21:19 UTC против первого коммита пачки в 19:42 UTC). Ребейз перед PR не требуется: `git diff --stat origin/codex/sdd-v2-rc52-followup...HEAD` уже даёт ровно 5 коммитов этой пачки. `git merge-tree` против `origin/codex/sdd-v2-rc52-followup` и всех открытых PR (#33, #36, #37) — конфликтов нет, пересечение файловых множеств пустое.)

---

## § Правки по V-BATCH-17

Применены правки независимого верификатора (`V-BATCH-17.md`, `plan-verifier`, свежие глаза) — один код-фикс (решение Lead — включить в пачку) плюс текстовые правки отчётов. Ветка/дерево не менялись помимо этого.

**Код-фикс (новый 5-й коммит, `b55f7cac`).** `fix(kit): audit-halt-activation regexes no longer share /g lastIndex state`. Находка верификатора: `ai/kit/audit-halt-activation.mjs:107` объявлял `H_ID_RE`/`AX_ID_RE` с флагом `/g`, а `.test()` (было `:279`,`:299` до сдвига номеров, актуально `:296`,`:316` после исправления) двигал `lastIndex` того же объекта, который затем наследовал `matchAll` (`:256-257` до правки) — часть текста директивы могла остаться несканированной, гейт мог молча пропустить упоминание halt-id. Исправление: `H_ID_RE` — non-global, только для `.test()`; `H_ID_G_RE`/`AX_ID_G_RE` — global, только для `matchAll`; неиспользуемый non-global `AX_ID_RE` убран, чтобы не оставлять мёртвый код. Диф: 1 файл, +17/−5.

Доказательство (синтетический repro, до/после, вне рабочего дерева — `/private/tmp/.../scratchpad/lastindex-repro/repro.mjs`):
```
BUGGY  (one shared /g regex for .test() and matchAll): [ 'H_BAR' ]
FIXED  (separate non-global .test() + separate /g matchAll): [ 'H_FOO', 'H_BAR' ]
```
До фикса теряется первое из двух подряд идущих упоминаний одного вида id; после — видны оба. На HEAD (`b55f7cac`) `npm run audit:halts` → «✓ halt-activation audit clean — 33 template(s) + 33 assembled directive(s) checked.», exit 0 — скрытых нарушений сегодня нет. Коммит прошёл `pre-commit` целиком (5/5, включая `test:coverage`), без `--no-verify`.

**Правки отчётов (без кода, без новых коммитов — это markdown-артефакты вне `tasks/**`/`specs/**`):**
| Файл | Правка |
|---|---|
| `R-BATCH-17-phase-agent-bounds.md` (этот файл) | Переписан абзац «База ветки» и хвост «Команд пуша» (PR #30 был влит ДО старта пачки, не после; ребейз не нужен); обновлены таблица коммитов (5-й), diff-stat (11 файлов, +224/−32), таблица «файл→смысл» (+ строка про V-BATCH-17 фикс), приёмка ISS-8/T-B6-16, отклонения пп. 2-3, открытые вопросы Lead, добавлен этот раздел |
| `R-T-B6-12.md` | Mermaid «стало»: `STEP_1_ORIENT.hbs:24-37` и т.п. (несуществующие файлы) заменены на реальные `phase-execution-protocol.directive.hbs:25-38/39-47/48-58`; §4 «Отклонение 1» — снята неточность «доска не называет `ax-phase-scope-lock.xml` вовсе» (называет в колонке «Задача», не называет в колонке «Файлы»); §4 «Отклонение 2» — переформулировано: `H_OUT_OF_PHASE_WRITE` нарушение существовало на базе `61b86fb8`, гейт его молча пропускал (причина — lastIndex-баг, исправлен отдельно) |
| `R-T-B6-16.md` | Sequence-diagram участник `execute.directive.hbs:19,42-44` заменён на реальные `:22,42,179-183`; §4 «Отклонение 2» — снято утверждение «текст сформулирован достаточно обще»; добавлено точное объяснение (запись вердикта — genuinely new edit, счётчик сбрасывается корректно уже сегодня) и указан владелец недостающей явной оговорки — задача V14-2a |
| `R-T-B6-27.md` | Mermaid-узел `audit-halt-activation.mjs:135-141` заменён на актуальный `:150-167` (диапазон сдвинулся дважды — после самого T-B6-27 и после V-BATCH-17 код-фикса); §3 п.1 — вывод `grep -n '{{>' review-lifecycle.directive.hbs` приведён целиком (6 строк с номерами, было 4 без номеров) |
| `R-ISS-8.md` | Адрес код-стороны #19 заменён с несуществующего `phase-run.ts:326-361` на реальный `cli/cmd/sdd-verify/workspace-mutation.ts:101,138` (`EXCLUDED_TOOL_DIRS`); формулировка «Сценарии G1/G3 (`ai/flow-eval/scenarios.json`)» снята как вводящая в заблуждение (G1/G3 — группы эвалов из `50-TRACK-EVAL.md` §3, не идентификаторы сценариев); добавлена оговорка про закрытие строки ISS-8 на доске и упомянута готовая строка `ISS-8b` |

**Строки доски (заводит/добавляет Lead — вне зоны и списка «трогать» этого коммита, `tasks/**`/`61-TASK-BOARD.md` не редактировались):**
1. `ISS-8b` (S) — снапшот `sdd-verify` игнорирует `.claude/tmp/**`; готовая формулировка строки — в `V-BATCH-17.md` §B «ISS-8».
2. Неблокирующая задача (S) на lastIndex-дефект — **уже закрыта этим коммитом** (`b55f7cac`), заводить не нужно; при желании завести тест-кейс в `ai/kit/__tests__/audit-halt-activation.test.ts` (директива без `<HaltConditions>`, упоминающая halt собранного аксиома) отдельным довеском.
3. Явная оговорка про запись вердикта — не новый evidence в `ax-re-dispatch.xml`: расширить «Файлы» задачи `V14-2c` либо явный пункт в `V14-2e`; владелец — `V14-2a`.
4. Перенос абзаца ERROR OWNERSHIP в `ax-phase-scope-lock.xml` (§4.4 трека 40) — неблокирующе, строка D7.2 до этого остаётся «НЕТ» по своему адресу.
5. ISS-8 на доске — закрывать с оговоркой «текстовая часть; приёмка через группы эвалов G1/G3 — за треком EVAL».

**Финальная приёмка после довеска (весь профиль, синхронно, дерево `rc-v6`):**
| Команда | Результат | Exit |
|---|---|---|
| `npm test` | `# tests 3605 / pass 3595 / fail 0 / cancelled 0 / skipped 10` (42.6s) | 0 |
| `npm run check` | `ALL PASS (5/5)`: type-check 5.4s, test:coverage 68.1s, lint 23.7s, format 9.3s, yagni 1.5s | 0 |
| `npm run build:directives && npm run check:directives-fresh` | «Generated 55 directive(s)»; «✓ matches a fresh rebuild»; `git status --short` пуст | 0 |
| `npm run audit:sdd-templates` | fresh + axioms 28 + contracts 28+33 + halts 33+33 + budgets — все «✓» | 0 |
| `npm run gate:sdd-check-baseline` | «OK — no error outside the baseline (baseline commit 227c03a8..., tag rc-baseline-1)» | 0 |

Все пять — ВЫПОЛНЕНО, exit 0. `git status --short` в дереве `rc-v6` пуст на момент завершения (нет незакоммиченных изменений).

**Отклонения от брифа V-BATCH-17:** нет — все 4 текстовых правки применены буквально по адресам, указанным верификатором; код-фикс сделан ровно в названном файле (`ai/kit/audit-halt-activation.mjs`), строки таблицы доски НЕ заведены этим коммитом (по инструкции — заводит Lead, `tasks/**`/`61-TASK-BOARD.md` вне зоны и списка «трогать»).

**Команды пуша для Lead (без изменений от основного раздела выше — 5-й коммит уже включён в ветку `lead/phase-agent-bounds`):**
```
git -C <lead-worktree или rc-v6> push origin lead/phase-agent-bounds
gh pr create --base codex/sdd-v2-rc52-followup --head lead/phase-agent-bounds \
  --title "Пачка 17: фазовый агент не выходит за свои файлы и умеет остановиться" \
  --body-file ai/drafts/research/sdd-v1-to-v2-transfer/_raw/reports/R-BATCH-17-phase-agent-bounds.md
```
