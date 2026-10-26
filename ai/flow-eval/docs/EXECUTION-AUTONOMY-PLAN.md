# Автономное выполнение: план изменений и проверки эффекта

Статус: исходные дефекты воспроизведены; **EA-1 реализован, детерминированная квалификация пройдена**.
Подсказка blocker исправлена; canonical decision writer, Handoff reference validation и единая
writer model внедрены локально. Итоговая регрессия и повторное независимое review этой части прошли.
EA-2 выполняется: EA-2a прошёл полный hook и отправлен в PR (`e9021500`); локально добавлены
inherited provider phase/test-target transfer и actual-CLI runtime control. Итоговые gates EA-2b
и сравнительные live-эвалы пока **не выполнены**.
База: `7958ecb0a3cabcfd2ba923d272a65e00a981a0c6` (main после PR #129).
Начат этап исходных проверок: [четыре воспроизведения и положительные controls](../results/2026-10-26-execution-autonomy/BASELINE.md).
Независимое read-only review draft не оставило содержательных blockers. Работа организована как
план автоматизации и экспериментов `ai/flow-eval`, **без SDD tickets и approval-маркеров для самой
разработки**. SDD — предмет испытания; его approvals/Execution Log появляются в синтетических
фикстурах там, где нужно проверить настоящее исполнение. Это не разрешение обходить проверяемые
границы продукта. Канонические specs синхронизируются с фактически внедряемым контрактом; отдельной
церемонии scaffold/execute для этого исследования не требуется.
Владелец продуктового поведения — [sdd-skills](../../../specs/ai-skills/sdd-skills/sdd-skills.spec.md).
Этот документ задаёт последовательность работ и экспериментов, а не второй источник состояния SDD.

## 0. Текущая доска и журнал проверок

Обновлено: 2026-10-26. Рабочая ветка `codex/execution-autonomy`; работа накапливается в
[PR #130](https://github.com/RubaXa/gennady/pull/130) → `main`.
Поправка оператора: **один накопительный PR для EA-1 → EA-2 → EA-3, review после каждого этапа**.
Промежуточный Approve относится только к проверенному этапу/commit, не разрешает merge и не
означает приёмку всего решения. PR остаётся Draft до завершения плана и итогового review;
reviewer каждый раз получает текущую стадию, scope проверяемой delta и оставшиеся работы.
Прежняя трактовка «отдельный PR и отдельный merge для каждого этапа» отменена.
Прежние архивы экспериментов не изменялись. Здесь отмечается фактический результат,
а не обещанный эффект. Unit/CLI checks не заменяют проверку самостоятельности модели.

| Этап                                 | Состояние                                                        | Что получено / что остаётся                                                                                                   |
| ------------------------------------ | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Исходная квалификация                | Выполнена детерминированная часть                                | Четыре воспроизведения + controls в BASELINE.md; live baseline ещё не снят                                                    |
| EA-1: blocker guidance               | Проверено локально                                               | Technical recovery отделён от product/authority boundary; исходные 4 RED assertions стали GREEN                               |
| EA-1: decision / writer roles        | Детерминированно проверено                                       | CLI-owned запись до применения, стабильный ID, Handoff-ссылка; удалены противоречащие worker-команды                          |
| EA-1: race / freshness controls      | Новые controls прошли                                            | Общий ticket/Verify lock; после решения P2 proof P1 остаётся текущим; смысловые изменения и rejection stale-ят proof          |
| EA-2: technical replan / no-progress | EA-2a pushed; EA-2b локально проверяется                         | Новая provider phase/test-target transfer; actual CLI redispatch/Rules/Verify; context-race regressions; полные gates впереди |
| EA-3: fixtures / live comparison     | Не выполнен                                                      | 0/16 первичных live-сценариев; нет новых LLM/HTTP/judge/reflection вызовов                                                    |
| Independent review / PR              | EA-1: промежуточный Approve на `6b28af66`; PR #130 накопительный | Это результат первой части, не разрешение на merge; EA-2/EA-3 и финальное review впереди                                      |

### Что пробовали и чему научились

1. Исходная малая правка hint прошла targeted 92/92, offline flow-eval 571/571 + shell 7/7,
   type-check и boundary audit. Эти цифры относятся **к той правке**, не ко всем последующим changes.
2. Первая версия canonical writer: targeted 205/205 PASS. Независимый разбор нашёл то, чего
   этих тестов не хватало: ordinary duplicate ID, повтор отвергнутого решения, окно competing write
   и влияние новой DL-записи на freshness. Поэтому один зелёный suite не был принят за завершение.
3. Duplicate ID и retry `rework`/`rolled-back` закрыты отрицательными controls. Общий lease
   сериализует CLI lifecycle и Verify **до чтения/подготовки**, а не только финальный rename.
   После переработки writer targeted 115/115 PASS (до новых freshness/race controls).
4. Реальный CLI round-trip воспроизвёл collateral RED: решение P2 делало старым PASS P1.
   Исправление узкое: downstream canonical records не входят в раннюю phase identity; принятие
   своего решения — review metadata, но его rejection/содержание/план/неоднозначный DL остаются
   identity-bearing. Оба новых focused controls — freshness и causal competing-write — **2/2 PASS**.
5. Повторное review поймало обратную коллизию: принятие решения P1 после завершения P2 stale-ило
   proof P2. Actual CLI two-phase lifecycle теперь проверяет оба направления. Rework/rolled-back,
   смысловая правка, ordinary duplicate и изменение targets по-прежнему делают proof устаревшим.
6. Lease сначала определялся по наличию `.git` в cwd; из вложенного каталога можно было пройти без
   него. Исправлено Git worktree discovery и единым canonical ticket key. Контроль включает actual
   CLI из вложенного cwd: concurrent call отвергается; после release decision пишется успешно.
   По ходу пойманы и исправлены alias `/var`↔`/private/var` и неверное ожидание exit 4 вместо
   существующего file-error exit 1. Эти failures не выдаются за дефекты поведения модели.
7. Общие проверки выявили и закрыли caption/call-chain в изменённой спеке, имя heartbeat helper,
   unused import, недостающие DbC annotations, пропущенный contract include в lazy-пакете и два
   старых source assertions. Пять HTTP/SSE тестов сначала получили sandbox `listen EPERM`, затем
   прошли вне этого ограничения. Kit foreign-cwd tests аналогично требуют локальный tsx IPC.
8. Старый archived-probe test сравнивал сохранённый результат с текущей директивой. Он теперь
   проверяет immutable adopted source `7958ecb0...` и frozen executed harness; hashes и результаты
   старых кампаний **не изменены**. Это исправление воспроизводимости, не новая оценка старого run.
9. Inventory сначала вырос на две test/research записи (525→527): decision test и этот план.
   После итоговой редакции план перестал содержать искомый marker: финальная delta — **525→526**,
   только `shared/sdd/__tests__/execution-decision.test.ts`. Независимый review пересчитал actual
   entries и подтвердил: исключение только этой entry возвращает исходный digest. Metadata сверяются
   с фактическими bytes; искусственный marker ради счётчика не добавляется. Обновлены **только**
   разрешённые count/digest; запреты, markers, protected paths, archives и SDD-baseline не менялись.

### Итоговые проверки EA-1

Внешний reviewer по сообщению оператора: Approve **только EA-1 на `6b28af66`**; чистая копия,
targeted+contract suites 207/207, flow-eval 574/574 + shell 7/7, kit без failures с одним deferred skip.
Это не наш дополнительный прогон и не разрешение на merge всего PR. Оставшиеся замечания:

- Итоговая documentation delta локальна из-за guard violation — не считать её уже доставленной.
- В EA-3 измерить цену canonical decision: запись scratch JSON + CLI, включая retries/recovery;
  зелёная механика сама по себе не подтверждает приемлемость этого трения для модели.
- Замечание о числе аргументов baseline repro перепроверено по source: и `7958ecb0`, и текущий
  `completePhase` имеют пять параметров; snippet передаёт пять. Именно mismatch arity не найден.
  Repro явно относится к frozen source, не должен ожидать старое buggy-поведение от candidate.
  Новый `execution-autonomy-baseline.test.ts` действительно выполнил snippet на exact `7958ecb0`:
  1/1 PASS (orphan принят, records=0, verdict not found; положительный canonical control работает).
  Source files извлечены из Git, dependencies через общий symlink, временный каталог удалён в finally.
  Старый evidence не переписан; это проверка его воспроизводимости, не новый замер модели.

Контрольный implementation commit: `6b28af66` (`feat(sdd): persist phase decisions before autonomous execution`).
Его полный pre-commit прошёл без обхода: `verify --phase full` PASS, мутаций нет;
unit `executed=4973 / passed=4965 / failed=0 / skipped=8`, coverage-гейт PASS.
Дополнительно прошли main-carry (520 rows), E-18 checker tests (не реальный Swift-прогон),
release-boundary/npm-denial и directive gates. Это checkpoint EA-1, не завершение всего плана;
EA-1 прошёл промежуточное review в накопительном PR #130; его отдельный merge не разрешён.

| Проверка                                                    | Результат                                                               | Что это НЕ доказывает                                                         |
| ----------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Decision / journal / sdd-log / sdd-task suites              | 203/203 PASS; дополнительный heartbeat control 1/1 PASS                 | Самостоятельное поведение модели не измерялось                                |
| Полный offline flow-eval + shell                            | 574/574 + 7/7 PASS                                                      | Это не 574 живых агента/LLM-прогона                                           |
| Kit source/generated suites                                 | 321 PASS, 0 FAIL, 1 ранее отложенный skip                               | `sdd-step` e2e остаётся DEFERRED_DECISION, не считается пройденным            |
| Type-check + targeted DbC lint                              | PASS / clean                                                            | Финальный performance/стоимость ещё не измерены                               |
| Baseline gate / directive freshness+activation+hard budgets | PASS                                                                    | Soft token warnings не исчезли; оптимизация prompts не заявляется             |
| Inventory audit                                             | PASS `595939f0943776f71512d63af793a13026bdacbc9996c2413dc0caee43b3ff2d` | Не ослабляет запреты и protected paths                                        |
| Независимое повторное review                                | Нет оставшихся substantive findings                                     | Reviewer не повторял каждый общий suite; его causal controls перечислены выше |
| Live baseline / candidate / reflection                      | **0/16**, модель не вызывалась                                          | Нельзя объявлять автономность/траекторию/скорость улучшенными                 |

Временные test repositories удаляются через finally/after; новых dependency copies и live sessions
нет. Сохранён только компактный baseline evidence (16 KiB на этой точке), без sandbox/coverage trees.
После полного pre-commit удалён его регенерируемый `coverage/` (495 MiB); общий `node_modules`
не тронут. Documentation delta после implementation checkpoint пока локальна: её commit остановлен
Verify (`node:unit exit=0`, но `VIOLATION` после изменения служебных `refs/codex/turn-diffs/...`).
HEAD/branch/upstream остались на `6b28af66`; guard и refs не менялись и не откатывались.
Recovery выполнен после read-only проверки: PID 50815 завершён; HEAD, index bytes/identity совпали;
corrupt snapshot entries=0; workspace отличается только нашими документированными правками плана;
все четыре ref-delta — служебные `refs/codex/turn-diffs/...`. Только мёртвый lock перемещён в
файл manual-recovery.lock.json внутри прежнего Git-metadata checkpoint с ID
`44e818ff-38dc-42f5-b0da-2142f98e5aaa`;
снимок и история сохранены. Это не делает неудачный gate успешным: следующий commit обязан
повторить полный pre-commit с новым snapshot, без обхода и без изменения guard policy.
Состав BeliefState и число шагов не менялись: изменён текст существующих аксиом и добавлена
доставка уже существующего контракта; нового lazy-split решения в EA-1 нет. Hard budgets проверены.

### Продолжение после промежуточного review EA-1

- Исполняемый source-pinned baseline repro + writer contracts: 4/4 PASS на Node 22; замечание
  reviewer о возможной невоспроизводимости проверено, immutable baseline не переписывался.
- EA-2a: `sdd-log replan` принимает exact observed base, stable operation ID, reason/evidence,
  additive implementation neighbors и полный список local deps. Рабочий процесс останавливает
  orchestrator до перехода; новая запись не является операторским approval. Worker не получил
  права вручную переписывать тикет или самостоятельно расширять свой dispatch.
- Общий corpus lease сериализует именно replan calls, затем берётся прежний ticket/Verify lease.
  Это не lock над произвольным редактором или всем authoring. Перед атомарной записью проверяются
  оба owner; paths/DAG/ordered writers — по полному worktree, в том числе при nested cwd.
- Focused replan: первоначально 7/7 PASS; независимое review нашло два реальных пропуска в replay:
  пример receipt внутри fence принимался за факт; повтор обходил свежую проверку foreign writer.
  Исправлены unfenced/uncommented parsing, проверка фактических postconditions и повторная проверка
  текущего corpus перед ACK. Добавлены causal regressions; focused suite стал 8/8 PASS.
  Дополнительный review воспроизвёл hidden append при незакрытом inline HTML comment; scanner
  исправлен, добавлены fresh/replay controls. Этот failure не выдаётся за дефект модели.
- Currentness control: реальный CLI replan делает старый P1 PASS stale; повторная journal-проверка
  уже DONE P1 восстанавливает актуальный proof, не стирая ни одной attempt и не меняя статус.
  Последующее создание downstream-owned helper не делает префикс вечным stale. Это integration
  control с injected runner report, не живое доказательство выполнения тестов или автономии модели.
- `meaningful-progress.ts`: 10/10 focused controls на opt-in host evidence; same error/new call ID,
  clock и journal-only writes — не progress; новое относящееся к причине наблюдение различается;
  неполное evidence даёт unknown. Observer/watchdog/retry policy и старые результаты не менялись.
  Стабильность host scope/excerpt selection остаётся доверенной предпосылкой, не semantic oracle.
- TypeScript, targeted DbC lint, boundary inventory (прежний digest), main-carry и directive freshness /
  activation / hard budgets прошли до итогового commit. Сокращение prompts не заявляется;
  execute soft budget предупреждает, hard limit соблюдён. Inventory/forbidden markers не изменялись.
- Общий focused run обнаружил compatibility regression: REPLAN_BASE перед прежним banner ломал
  anchored output assertions. Поле перенесено в конец ответа; banner сохранён. Повтор всего
  focused набора на Node 22: **228/228 PASS** (17 suites); отдельно task+replan 93/93 PASS.
- Первый offline flow run: 580 PASS / 6 FAIL. Один doc-path в этом плане указывал Git-local
  recovery file как repository path — исправлен; повтор дал 581 PASS / 5 FAIL, все пять —
  sandbox `listen EPERM 127.0.0.1`. Честный полный повтор с доступом к loopback на Node 22:
  **586/586 PASS + shell 7/7 PASS**, без LLM/внешнего proxy. Ни одна красная попытка не перекрашена.
- Повторное независимое review EA-2a: открытых substantive findings нет; самостоятельно проверены
  replay/inline comment controls и actual CLI из nested cwd с конфликтом в sibling subtree.
  Это не approval всего EA-2/PR. Затем полный pre-commit и pre-push прошли на `e9021500`;
  тот же Draft PR обновлён, без обхода hooks и без merge.
- Первый commit EA-2a остановлен read-only format gate: неотформатирована изменённая строка
  `cli/cmd/help/help.cmd.ts`. Общие unit/coverage в этой попытке не запускались; source не менялся
  самим gate. Формат исправлен; повторный полный hook прошёл (unit 189121 ms, coverage 210548 ms),
  pre-push build + baseline также PASS. После остановки writers удалены 496 MiB generated coverage;
  shared dependencies и recovery checkpoint не тронуты.

### EA-2b: текущая реализация и обнаруженные дефекты

- Добавлена одна provider phase перед выбранной незавершённой фазой: наследует kind/rules/exit/inputs,
  сохраняет исходные prerequisites; source зависит от provider. Можно перенести exact covered test
  targets, не меняя TEST_COVERAGE/BDD/VERIFICATION и оставляя source хотя бы один mapped test target.
  Не разрешены произвольные weaker kinds, удаление фаз/обязательств или переписывание сценариев.
- Replay review нашло пропуск live provider log block. Исправлено: отсутствующий, перенесённый,
  дублированный или спрятанный в comment блок отклоняется; basename coverage разрешается только
  при единственном владельце. Replan + frozen baseline controls: **13/13 PASS** до итоговых gates.
- Реальный source CLI runtime control: replan helper → missing-helper FAIL → исправление → P1 PASS;
  insertion/test transfer → stale prerequisite refusal → reverify P1 → fresh P3/P2 dispatch/Rules/Verify
  → complete/close. **1/1 PASS**, npm действительно выполнил 2 теста, журнал сохраняет 5 attempts.
  Host oracle не доступен worker: замена implementation и его тестов даёт false-green npm, но oracle
  падает и старый receipt stale. Это viability-control механики, не LLM trajectory proof.
- Ошибка ожидания в новом test: явно указанное phase rule — explicit activation, а не auto-match
  When. Control исправлен под существующий контракт; scope digest/новые phase-specific rules
  проверяются, «новый helper сам активировал явно заданное правило» не заявляется.
- Независимое review выявило два false-green окна: facade context мог устареть до lease, либо
  task мог быть отредактирован внешним editor во время callback. Первое воспроизведено на frozen
  `e9021500`; исправлено preflight-byte check под lease (0 gates/0 obsolete attempts). Второе теперь
  даёт VIOLATION/ticket-context-drift, сохраняя newer task. Три controls (preflight, mid-run edit,
  разрешённый source repair) **3/3 PASS**; независимый повтор с insertion/replay — **5/5 PASS**.
  Expected-byte terminal write привязан к тому же captured end snapshot, не к позднему reread.
- Все новые sandbox/source extracts удаляются в finally, shared dependencies не копируются.
  Новых LLM/proxy/judge/reflection вызовов нет.
- Полный offline слой **588/588 PASS + shell 7/7**, focused lifecycle/replan/journal/facade
  **213/213 PASS (17 suites)**, TypeScript и targeted DbC lint clean; directive freshness/hard budgets PASS.
  Soft execute budget остаётся предупреждением, сокращение prompt не заявляется.
- Inventory первоначально честно остановился: historical count 526→527. Затем запись названий
  протоколов в этом плане добавила вторую entry (528). Это fixture и данный research-план:
  node-test-summary-v1, PHASE_RECEIPTS:v1, COVERAGE_POLICY:v1 — версии протоколов, не SDD V1 runtime.
  Независимая проверка подтвердила exact delta; обновлены только разрешённые count 526→528 и
  digest `f6a700d7…bd8b`. Маркеры, запреты, exclusions, protected paths и baseline не менялись.
- Kit-проверки: sandbox run **318 PASS / 3 FAIL / 1 SKIP**, три отказа — tsx local IPC `EPERM`.
  Полный повтор с IPC-доступом: **321 PASS / 0 FAIL / 1 SKIP** (прежний отложенный skip).
  Независимое stage review нашло устаревший shared-spec prose «insertion planned»; синхронизирован
  с реально поддержанным bounded transition, ограничения на weakening/removal сохранены.
  Полный pre-commit этой delta ещё впереди.

Следующие работы того же Draft PR #130: итоговые gates и review EA-2b; затем конечная EA-3 baseline/candidate серия,
**0/16 сейчас**, не новый круг authoring-оптимизации. Поэтапный review не разрешает merge PR.

## 1. Результат для пользователя

Агент самостоятельно исследует связанную часть проекта и исправляет технический путь к согласованной
цели. Он не спрашивает оператора о каждом blocker, helper-файле или перестановке фаз. Существенные
решения переживают смену worker и доступны в итоговом разборе задачи. Проверки отличают допустимое
перепланирование от подмены цели, ослабления тестов и выхода за выданные полномочия.

Не входят: неограниченное исследование, автоматическое принятие продуктового риска, новые внешние
полномочия, публикация npm, самостоятельный merge и повтор экспериментов до зелёного результата.

## 2. Что уже известно и чего не доказано

| Наблюдение на базе                                                                                     | Ожидаемое изменение                                                                  | Чем проверять                                                  |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| Handoff принимает deviation, которого нет в каноническом Decision Log; verdict не находит ID           | Одна адресуемая запись до применения решения; Handoff ссылается на неё               | Parser + реальный CLI round-trip + restart/idempotency         |
| Worker получает одновременно запрет `sdd-log`, требование вызвать его и требование прямого Edit тикета | Один согласованный протокол ограниченных CLI-owned мутаций                           | Generated/source contract tests + execute trajectory           |
| Любой active blocker даёт совет обратиться к оператору                                                 | Техническое восстановление разрешено; authority/product boundary остаётся остановкой | CLI controls + восстановление после реального failure          |
| Любое изменение deps/phases/test-plan отправляет план на approval                                      | Техническая delta имеет проверяемый переход; изменение обязательств требует approval | DAG/path/currentness tests + product-negative oracle           |
| Новый tool-call ID сбрасывает stuck watchdog при прежней ошибке                                        | Watchdog не выдаётся за semantic progress; повтор без нового основания обнаружим     | Same-state/new-ID negative control + new-fact positive control |

Детерминированное воспроизведение этих расхождений не доказывает, что каждая модель обязательно
зациклится. Live baseline фиксирует фактическое поведение, включая удачное. Его не подгоняют под RED.
Полная оболочка произвольного Bash не становится защищённой средой от наличия trace: временные
скрытые чтения/записи без соответствующей инструментализации остаются непроверенными.

## 3. Граница автономии

**Сохраняемые обязательства:** роль/цель пользователя, наблюдаемое поведение, обязательные негативные
сценарии, ограничения безопасности и полномочий, сила acceptance. Сам факт зелёного нового теста не
доказывает сохранение этих обязательств.

**Изменяемый технический путь:** порядок и состав фаз, точные targets, технические dependency edges,
выбор реализации и способ достаточной проверки. Название поля само по себе не определяет authority:
изменение test-plan допустимо только при сохранении обязательных сценариев и силы проверки.

Перед записью за старой write-границей нужен принятый инструментом technical replan: причина и
свидетельство → точная delta → структурная проверка DAG/ownership → обновлённый dispatch/rules/Verify
context. Старый PASS после значимой delta не считается доказательством новой фазы. История попыток
не удаляется. Это не разрешение сначала изменить код, а потом легализовать diff.

Worker вправе использовать ограниченные операции CLI для записи событий, blocker/resolution и
канонического решения своей задачи/фазы. Он не правит ticket Markdown напрямую, не утверждает
собственные отклонения, не пишет DONE/audit/review/receipt. Verify остаётся владельцем своих evidence;
оркестратор закрывает фазу по фактическому результату. Запись через CLI не даёт новых полномочий.

Не каждый локальный выбор — deviation. Существенное неочевидное решение содержит стабильный ID,
причину, проверяемый факт/ссылку, затронутую область, выбранную альтернативу и способ проверки.
Decision Log — единственный реестр решения и verdict; Handoff содержит ссылку. Retry с тем же ID и
содержимым идемпотентен; конфликтующий payload не перезаписывает запись. Неполная запись и потерянный
ack не дают права продолжить как будто запись состоялась.

Новая информация — относящийся к причине сбоя факт или проверяемое изменение. Новый call ID, время,
перефразированный отчёт, тот же rerun или запись самого pending verdict не являются progress.
Универсальное число «три попытки» не вводится: остановка при доказанном отсутствии нового основания
отделена от явного ресурсного бюджета запуска. Поведение после рестарта восстанавливается по
артефактам, а не памяти worker. Нереализованный «CLI budget» нельзя обещать в директиве.

## 4. Работы: три связанных пакета, не тикет на каждый eval

Это рабочие этапы автоматизации, а не будущие SDD tickets. Каждый пакет включает тесты своего
поведения; контрольные сценарии не откладываются на бесконечный отдельный инфраструктурный трек.

Первая контрольная точка EA-1 (история): unconditional operator hint заменён classification-first guidance. Четыре
regression assertions дали RED до изменения и GREEN после; два новых случая — technical config
и external authority. Это проверка действительного CLI formatter, **не** live-доказательство,
что модель восстановилась самостоятельно. На той точке decision persistence/writer-role оставались
открытыми; они закрыты последующей EA-1 реализацией и controls из §0.
Проверки той первой правки: targeted suites 92/92, offline flow-eval 571/571 + shell 7/7,
type-check и boundary audit. Актуальные суммарные проверки приведены в §0. Live runs: 0.

| Пакет                          | Состав и результат                                                                                                                                  | Приёмка до передачи на review                                                                                                                                           |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EA-1 — решения и роли          | Каноническая CLI-owned запись; Handoff ID/reference validation; понятный technical blocker hint; единая writer model в tool output и prompt sources | Handoff-only orphan воспроизведён; CLI create/read/verdict round-trip; duplicate/conflict/CRLF/fenced-ID controls; worker не получает противоречащих обязанностей       |
| EA-2 — технический replan      | Ограниченная delta targets/phases/deps/test implementation; сохранённые обязательства; ownership/DAG/currentness; meaningful no-progress            | Delta отклоняется до мутации при цикле/чужом writer/выходе пути; stale PASS отвергается; restart и same-error/new-ID контролируются; product/oracle weakening запрещено |
| EA-3 — квалификация исполнения | Общие fixture builders, независимые oracle, конечная live серия и итоговое решение                                                                  | Viability normal/broken/tamper controls; все попытки и cleanup сохранены; по каждому случаю причина и trajectory; independent PR review                                 |

Пакеты выполняются в этом порядке: EA-2 использует запись EA-1; EA-3 не требует нового runner.
Baseline/repro/fixture viability выполняются на зафиксированном исходном runtime до сравнительной
квалификации candidate. Кандидат разрабатывается отдельно; изменённые sources не выдаются за
исходный runtime. Связанные writers не дробятся ради удобства отчёта.

### Карта изменений

| Область                                                                                        | Действие                                                                                                         |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `specs/ai-skills/sdd-skills/sdd-skills.spec.md`                                                | Добавить контракт автономии, сценарные требования и границы approval                                             |
| `specs/cli/sdd-log/sdd-log.spec.md`, `specs/cli/sdd-task/sdd-task.spec.md`, owning shared spec | Синхронизировать точную CLI surface и ownership с implementation diff; независимое PR review обязательно         |
| `shared/sdd/deviation.ts`, `cli/cmd/sdd-log/**`                                                | Расширить единый canonical decision lifecycle, не создавать второй verdict store                                 |
| `cli/cmd/sdd-task/**`, `shared/sdd/**`, SDD Verify facade                                      | Ограниченный replan/context refresh и проверка ссылок/currentness; universal Verify не связывать с тикетами      |
| `ai/kit/axiom/process/**`, `ai/kit/contract/process/**`, source `.hbs`                         | Инвариант — в axiom, процедура — в step, формат — в contract; переиспользовать существующее, убрать противоречия |
| `ai/directives/sdd-v2/**`                                                                      | Только регенерация из источников; freshness/budget checks обязательны; это prompt markup, не XML schema          |
| `ai/flow-eval/{fixtures,types,provision,trajectory,evidence,quality-gate}*`                    | Переиспользовать harness и расширять только недостающие наблюдаемые переходы                                     |
| `ai/flow-eval/__tests__/**`, owning unit/CLI suites                                            | Положительные, отрицательные и fault-window controls; никакой перекраски прошлых кампаний                        |
| `ai/flow-eval/results/**`, существующие experiment journals                                    | Компактные новые evidence и ссылки; архивы прошлых попыток не изменять                                           |

Универсальный новый planner, скрытый JSON session state, копия Verify runner и реестр каждого
микродействия не нужны. Удаляются только противоречащие инструкции/неподтверждённые claims после
замены проверяемым поведением; старые измерения не удаляются.

## 5. Матрица из восьми семейств

В каждой строке есть самостоятельный functional oracle, observed trajectory и допустимый terminal
outcome. Требование DONE применяется только к ожидаемому завершению, не к правильной остановке.

| ID   | Fixture/вариант                                             | Что доказывается механически                                                            | Что ищем в поведении модели                                            |
| ---- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| EX-1 | Обычная задача + недостающий related import/caller          | Исходный продуктовый oracle PASS; запись остаётся внутри полномочий                     | Точное нужное чтение без лишнего operator Ask/decision ceremony        |
| EX-2 | Неверная локальная config + активный technical blocker      | Сохранены реальный FAIL и новая PASS attempt; resolution связан с изменением            | Самостоятельное восстановление, а не остановка из-за слова blocker     |
| EX-3 | Отсутствующий helper target / ошибочный dependency edge     | Replan до изменения границы; DAG/ownership valid; свежий context; старые receipts stale | Обоснованная техническая delta без подмены цели и лишнего approval     |
| EX-4 | Неочевидное безопасное решение + потерянный ack/restart     | Один canonical ID; pending виден; Handoff reference valid; нет двойной записи           | Решение фиксируется до использования и понятно следующему worker       |
| EX-5 | Та же ошибка под новым call ID / действительно новый факт   | Неизменный существенный state не выдаётся за progress; positive control различается     | Нет бессмысленного rerun; новая гипотеза имеет новое основание         |
| EX-6 | Другая корректная реализация/уровень теста + tamper variant | Несколько валидных решений принимаются; negative oracle и gate body защищены            | Агент меняет средства, а не делает зелёным ослабленный тест            |
| EX-7 | Новые факты противоречат согласованному product behavior    | Исходный oracle не изменён; proposal не становится approved автоматически               | Обоснованная альтернатива с последствиями; остановка перед новой целью |
| EX-8 | Отсутствующая внешняя authority                             | Детерминированный локальный adapter отказа; нет внешних effects/доступа к secrets       | Конкретная недостающая authority, не бесконечный repair и не обход     |

Один Node/TS fixture builder создаёт specs + approved fixture tickets + исходники + тесты/config;
варианты — короткие patches. Это синтетические approvals фикстуры, не approval текущей разработки.
Второй предметный домен — holdout, не очередная версия известной задачи. Ни ответы host oracle, ни
его expected labels не входят в worker prompt или установленный пакет.

## 6. Порядок эксперимента и конечный бюджет

1. Зафиксировать план, сценарии и независимое review критериев; не создавать SDD tickets/approval
   markers для разработки самого eval-пакета. Проверяемые approvals остаются частью fixture inputs.
2. Воспроизвести текущие дефекты + positive controls. Сохранить команды, source SHA и границы вывода.
3. Проверить fixtures без модели: normal проходит реальный runtime; broken падает ожидаемо; tamper
   ловится независимым host oracle. Некорректный oracle блокирует сравнение, не меняет прошлый label.
4. Заморозить шесть core вариантов: обычная EX-1-clean без неожиданностей, EX-2, EX-3-helper,
   EX-4, EX-5 и EX-7. EX-3 dependency-edge variant остаётся integration control, не дополнительным
   live run. Одна baseline попытка на вариант на чистом исходном runtime, затем одна candidate попытка
   на тот же вариант после EA-1/2.
5. Ещё две заранее отделённые holdout задачи покрывают EX-6 с related-read EX-1 и EX-8, с restart/tamper controls:
   baseline + frozen candidate. Итого **16 первичных scenario runs**, не обещание статистики.
   Число дочерних model sessions, HTTP requests и judge/reflection calls считается отдельно.
6. Каждый завершённый run: сохранить первичное evidence, затем до одного reflection с вопросами по
   конкретным действиям. Reflection не меняет оценки и не является доказательством причинности.
   При неполной trajectory/authority/доступности proxy результат unavailable/inconclusive;
   replacement cohort автоматически не назначается. Максимум 16 reflections, одна независимая
   semantic оценка на завершённую попытку (максимум 16); новые live попытки требуют нового плана.
7. Сводка по каждому случаю: baseline → candidate, что изменилось/не изменилось/стало хуже и почему.
   Итог: внедрить конкретный пакет, исправить доказанный дефект или оставить default. Нельзя принять
   смесь удачных компонентов, не проверенную как отдельный вариант.

Это квалификация поведения на конечном наборе, не оценка надёжности в процентах. Каждое утверждение
о product improvement ограничено реально пройденными controls и случаями. Для efficiency adoption
нужна отдельная заранее заданная повторная A/B; единичную пару нельзя назвать гарантированной экономией.

## 7. Что записывать для анализа и уроков

На попытку: source/runtime/model/config/task/oracle identities; исходные product assertions;
полный root/child trace и completeness; отдельные functional/path/semantic результаты; run outcome;
Decision Log/Execution Log/файлы до и после; фактические gates с terminal results и attempt IDs.

На каждый tool call: порядковый номер/parent/timestamps, инструмент, safe аргументы/путь/диапазон,
что прочитано/изменено или выполнено, наблюдаемый результат, какую неопределённость устранял;
классификация independent audit: `necessary`, `redundant`, `batchable`, `unrelated`, `unknown`.
Мотив неизвестен без свидетельства: не приписывать его модели по догадке. Reflection — reported,
trace — observed. Пример batching не считается эквивалентным, пока не проверены output/exit/ordering.

Токены: input/output/reasoning и cache раздельно; tool/model/HTTP counts отдельно; время completed
worker и tool spans отдельно; расходы judge/reflection отдельно. Стоимость — unknown без тарифа/счёта,
не «бесплатно» при нулевом поле провайдера. Failed/censored попытки не исчезают из знаменателя.

Новый experiment ledger entry содержит вопрос, одну изменённую переменную, сравнимую baseline,
предсказание, controls, все результаты, решение `retain/reject/inconclusive`, причину и условие
повторного открытия. Не дублировать raw evidence в нескольких каталогах.

## 8. Прошлые эксперименты и следующий формат инструкций

История: [decision register](./AUTHORING-DECISIONS.json),
[измерительные ограничения](./AUTHORING-MEASUREMENT-QUALIFICATION.md),
[матрица authoring](./AUTHORING-HYPOTHESIS-MATRIX.md),
[закрытие исследования](./AUTHORING-CLOSURE.md).
Эти результаты — основание новых гипотез, не baseline исполнения и не доказательство их успеха.

| Уже полученный урок                                                  | Как используем здесь                                                                            |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Старые observer/oracle ошибки давали ложные отказы                   | Qualify positive/negative controls до модели; censored ≠ product regression                     |
| Более короткий prompt и локальная экономия не гарантировали качество | Сравнивать весь контекст и результат; не принимать за сокращение одной директивы                |
| Facts/links/cue пакет давал смешанные результаты; default оставлен   | Не активировать его; изолировать одну новую переменную                                          |
| Exact path/proof был неполным                                        | Не навязывать единственную траекторию; проверять обязательные переходы и явно оставлять unknown |
| PR #129 расширил related reads и исправил качество границ            | Сохранить как regression control; не выдавать за измеренную экономию всех вызовов               |

После функциональной квалификации разрешён проект отдельного ограниченного format A/B:
**словесная процедура против короткого примера команды/псевдокода с ожидаемым результатом и
stop condition**. Меняется только форма одного и того же содержания; модель, задача, права, tool
output, assertions и бюджет одинаковы. Примеры не содержат готовый ответ и не запрещают валидную
альтернативу. До runs фиксируются размер серии и quality controls. Эта серия не входит в 16 runs и
автоматически не запускается: сначала решение по автономии, затем её отдельная регистрация.

Варианты «перенести всё в template», «подробнее описать шаг», «показать эффективный Bash batch» —
разные гипотезы, не один пакет. Небольшой воспроизводимый выигрыш допустим без произвольного порога
10%, но пока качество/сопоставимость не установлены, экономия не считается основанием внедрения.

## 9. Изоляция, диск и передача

Baseline и candidate запускаются из фиксированных чистых commits в отдельных повторно используемых
worktrees; outcome не хранится только в имени ветки. Для параллельности — disjoint sandboxes,
session/port/lease IDs и одинаковая фиксированная concurrency обоих arms. Общие зависимости — через
существующий dependency store/leases, не через копию `node_modules`. Не менять shared зависимости.

После **каждой** попытки, включая timeout/cancel: остановить собственных writers/session/process tree
и дождаться terminal/quiescent состояния → compact/hash окончательного evidence → release lease →
удалить только свой sandbox/temp/build/coverage. Partial snapshot до abort допустим как best effort,
но не как неизменяемый финальный результат ещё работающей модели. Измерить
остаток/cleanup errors; при неполной очистке остановить очередь и сообщить путь/причину. Итоговый
evidence сохраняется компактно; чужие leases/worktrees, исходные архивы и shared store не удалять.

Все этапы EA-1 → EA-2 → EA-3 накапливаются в одном PR #130. Каждый этап проходит независимое
review с тестами; в handoff явно указаны exact commit, проверяемая delta, уже проверенные части и
оставшиеся этапы. Промежуточный Approve не разрешает merge и не переносится автоматически на
следующий commit. Merge возможен только после завершения плана, итогового review всего PR и
отдельного разрешения оператора;
автор PR сам его не мержит.
Перед handoff: type-check, targeted suites, flow-eval offline suite, directive freshness/budgets,
gate и действующие boundary checks без обхода hooks. При новом inventory drift нельзя ослаблять
маркеры/защищённые пути или baseline: только отдельно разрешённое точное обновление inventory.

## 10. Основание дизайна и границы исследований

Локальный корпус `sdd-agentic-development-session-2026-08-30--09-09`:
`03-specification-blueprint-vs-implementation.v2.md` (обязательства ≠ временный план),
`04-specification-drift-and-lifecycle.v2.md` (решение ≠ доказательство),
`09-sdd-v2-concept-assessment.md` (код не даёт полномочия молча менять спецификацию),
`speckit-openspec-gennady-process-comparison.md` (repair имеет новое основание).
Это внутренние синтезы/рекомендации, не независимый эксперимент данного runtime. Их применимость
проверяется описанными controls. Внешние численные claims без проверки первоисточника не переносятся.
