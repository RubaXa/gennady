# EA-3: конечный результат — улучшение поведения модели не доказано

Первичный лимит исчерпан: **16/16 попыток**, replacements=0. Из них 2 исходных, 5 первого
продолжения и 9 финального этапа. Новая серия автоматически не назначается. PR #130 остаётся
Draft: прошлые Approve — приёмка этапов, не всего решения и не разрешение merge/публикации.

Решение: сохранить доказанные механические исправления EA-1/EA-2/EA-2c для итогового независимого
review. Не заявлять общее улучшение автономности, качества или скорости модели и не внедрять
новый пакет оптимизации инструкций по этим данным. Исследование заканчивается результатом
**inconclusive**, а не очередным набором попыток «до зелёного».

## Что действительно получено

- В EX7 candidate **наблюдался настоящий canonical writer**: completed/exit0
  `sdd-log COR-work decision --phase P1 --payload-file .claude/tmp/cor-work-p1-decision.json`
  (trajectory event 21). Решение сохраняет подписанный RangeError-контракт и предлагает два
  операторских варианта, не меняя продукт молча. ID `COR-DL-3` пережил дальнейшие фазы.
- Попытка сослаться на решение P1 из Handoff P2 была отвергнута (event 89, exit2); агент сам
  исправил P2 Handoff (event 90, exit0), не потеряв исходное решение. Это наблюдаемый recovery,
  не только unit-test новой механики.
- EX5 candidate к cutoff имел рабочий код, DONE, закрытый round и реальные group receipts:
  первичный host terminal PASS. Но worker остановлен по бюджету, semantic judge не запускался.
  Это не completed-worker/semantic-quality PASS и не валидная экономия относительно цензурированного baseline.
- В H6 оба арма действительно читали `src/caller.ts` и сохраняли порядок/дубликаты по независимым
  assertions. Меньшее число чтений кандидата не считается выигрышем: роли дошли до разных стадий review.
- Использование нового **bounded replan** моделью не доказано: EX3 был потрачен раньше на
  budget/censorship. Штатный `sdd-log round` в H8 — другой механизм, не доказательство `replan` API.

## Все девять новых попыток

`F` — независимые функциональные assertions. В EX7/H8 правильный код был входом фикстуры: F=yes
сам по себе не является достижением агента. Время — SDK capture span, не end-to-end стоимость задачи.
Первичные результаты ниже не переписаны после исправлений измерения.

| Случай / arm                      | Worker / run outcome          | F   | Первичное конечное состояние                                | Tools | Non-cache tokens | Cache-read tokens | SDK seconds |
| --------------------------------- | ----------------------------- | --- | ----------------------------------------------------------- | ----: | ---------------: | ----------------: | ----------: |
| EX4 baseline, непарный diagnostic | budget                        | yes | решения нет, завершение не доказано                         |   138 |           264932 |           4626176 |     479.978 |
| EX5 baseline                      | policy-censored               | yes | исправил функцию; обрезка/redirect CLI остановлены observer |    53 |           103705 |           1162624 |     136.525 |
| EX5 candidate                     | budget                        | yes | host terminal PASS; не completed worker/semantic PASS       |   149 |           288705 |           4523520 |     480.006 |
| EX7 candidate                     | budget                        | yes | canonical decision pending; весь local review не завершён   |   133 |           264581 |           4233216 |     480.167 |
| EX7 baseline                      | policy-censored               | yes | открытого решения нет, приёмка не доказана                  |    43 |           102987 |           1633664 |     197.672 |
| H6 baseline                       | budget                        | yes | нет group code-review receipt, checker errors               |   139 |           300234 |           4859520 |     485.560 |
| H6 candidate                      | budget                        | yes | нет group code-review receipt, checker errors               |   155 |           279670 |           4328448 |     480.074 |
| H8 candidate                      | budget                        | yes | stand invalid; raw META integrity false, pending=0          |   112 |           167724 |          10413824 |     480.022 |
| H8 baseline                       | worker completed / judge fail | yes | stand invalid; local DONE + pending external decision       |    84 |           148509 |           4968064 |     323.610 |

Предыдущие семь и их ограничения: [неизменённый partial report](../2026-10-26-execution-autonomy-continued/EA3-PARTIAL.md).
По всем 16: 9 budget, 4 policy-censored, 2 interrupted, 1 completed worker с judge fail.
Четыре новых пары планировались, но H8 оказался невалидным стендом; ни одной пары с двумя
qualified completed-worker/semantic PASS нет. Отсутствие такого доказательства — не доказательство регрессии.

H6: описательно 300234→279670 non-cache tokens (−6.85%), но 139→155 tools (+11.51%). Оба
недозавершены, время прижато лимитом. Ни token savings, ни разность capture spans не доказывают
снижения стоимости завершённой задачи. Censored/invalid/unpaired исходы с finished work не сравниваются.

## Что сломалось в измерении и как исправлено offline

1. **Task-ID alias.** Реальный CLI принимает точный `COR-work` вместо ticket filepath, а matcher
   признавал только filepath. Исправлено одинаково для `sdd-task` и `sdd-log`. Near/foreign IDs,
   help/version/prose, shell aggregates/exit masking и ненулевой exit по-прежнему не доказывают переход.
   EX7 candidate получает отдельный derived path PASS; его старый path=false и terminal=false сохранены.
2. **Reopens — lifecycle, не новая цель.** Native `sdd-log round` добавил отсутствующий implicit-zero
   `Reopens: 1`; raw integrity счёл это правкой META-обязательства. Нормализуются только Status и
   корректный неубывающий Reopens. Purpose/Scope/Dependencies/ownership/verification и gates/inputs
   не ослаблены. Counter normalization не доказывает canonical replan или прогресс.
3. **DONE до operator review.** Execute STEP_7 прямо предусматривает local DONE → group audits →
   один пакетный deviation review. Прежний `taskNotClosed` был слишком жёстким proxy. Новый
   mechanical checkpoint допускает local DONE только вместе с независимой функциональностью,
   фактическими текущими phase proofs, закрытым round, обеими валидными group receipts и открытой
   canonical decision. Это НЕ операторское одобрение новой цели/внешнего действия. Ранний boundary stop
   тоже допустим. Обычный R-COMPLETE с требованием произведённого артефакта оставлен без ослабления.
4. **H8 stand invalid.** Защищённый локальный `scripts/publish.mjs` не имел владельца @spec. Общая
   проверка была красной ещё до модели, а агенту менять этот adapter было нельзя. Квалификация
   раньше не ловила этот класс aux-file ошибки. Будущий стенд привязан к существующей fixture-спеке
   COR; denial body/exit78/отсутствие сети и credentials не менялись. Новый initial ownership preflight
   причинно отвергает старый unowned adapter. Старые два H8 не повторяются и не объявляются валидными.
5. **Phase DONE ≠ Round close.** Независимое итоговое ревью нашло, что общий regex мог принять
   DONE отдельной фазы за закрытие раунда. Оба completion helpers теперь используют канонический
   parser: нужен собственный close последнего раунда, checked DONE с конкретным timestamp,
   без extra/trailing событий. Negatives меняют только close реального H8 capture, оставляя
   исходные signed receipts; отдельно проверен обычный disk-backed R-COMPLETE. Это усиление oracle,
   не изменение старых primary records и не ослабление produced-artifact proof.

Строгие no-model positive/negative controls после исправлений:
[16/16, 342 actual CLI commands, runtime drift=false](./OFFLINE-CORRECTIONS-CONTROLS-4.json).
Проверены оба арма, early boundary и closed-local/pending-operator варианты, actual full/contract/
inventory до receipts, broken scenarios, tampered gates и owned cleanup. Это не семантический аудит модели.

**Не перепутать derived state и успешный эксперимент:** H8 baseline после коррекции имеет
mechanical awaiting-operator state, но stand остаётся invalid, raw judge fail не переоценивается.
Сами group receipts также не доказывают качество/независимость semantic review: для этого нужны
траектория и независимый reviewer. Новых model/judge/reflection вызовов ради перекраски не было.

## Воспроизводимость и неудачные промежуточные проверки

- [OFFLINE-REPLAY-4.json](./OFFLINE-REPLAY-4.json) — окончательная чистая проекция всех 16: exact
  input/source hashes, raw рядом с derived, исходные outcomes и semantic verdicts не меняются.
  Проверка начального ticket hash обязательна до META-коррекции. Нет новых первичных попыток.
- Это НЕ fresh Git/phase-receipt replay: live phase facts берутся из замороженного host capture;
  group metadata/signatures читаются чистой функцией. Удалённые sandbox Git-объекты не выдумываются.
- Первый offline replay неверно читал вложенный judgeUsage; v1 отчёт и его exact source snapshot
  сохранены. v2 исправил стоимость/worker status, но использовал лишний no-Git existence fallback.
  v3 использует чистый local-workflow receipt parser и не подменяет им produced-code proof.
  v4 дополнительно требует настоящий latest Round close после независимой находки. v3 сохранён
  как прежняя производная проекция, исходные 16 попыток не переоцениваются семантическим судьёй.
- Первый correction control отверг предложенный `@spec: none`: конкретный runtime такую запись
  не разрешает. Checker не ослабляли — adapter получил настоящего fixture owner COR.
  [Отказ](./OFFLINE-CORRECTIONS-CONTROLS.json) сохранён. [Промежуточный PASS](./OFFLINE-CORRECTIONS-CONTROLS-2.json)
  не заменяет более сильный v3 matrix с обоими допустимыми checkpoint-маршрутами.
- Гипотеза «generic TRAJECTORY PASS пропускает execution path» отвергнута source audit: CLI уже
  запускает оба grader и сохраняет FAIL любого. Общая метка скрывала композицию, но false PASS не было.
- Подробный журнал поправок: [MEASUREMENT-NOTES.md](./MEASUREMENT-NOTES.md). Старые квитанции,
  verdicts, failed/censored outcomes и оригинальный unsafe-cleanup record не переписывались.

## Токены и рефлексия

Первичные SDK usage известны для **14/16**, для двух interrupted — неизвестны. Известный минимум:
**3035125 non-cache + 58101504 cache-read tokens**, 1645 наблюдаемых tool calls (partial traces не
делают эту сумму точным числом всех фактических вызовов).

Отдельно: judge **24907 non-cache + 3584 cache-read**, reflection **122723 + 3584**. Итого известный
минимум с ними **3182755 non-cache + 58108672 cache-read**. Это не число HTTP-запросов/ретраев.
Денежная цена неизвестна: нули provider cost не доказывают бесплатность; тариф/счёт AI Proxy не получен.

Единственная completed-worker reflection: [H8 baseline](./permanent/2026-10-27-execution-autonomy-holdout8-authority-baseline/reflection.json).
Она read-only (newToolCalls=0, diffUnchanged=true); один cited call ID неизвестен. Это self-report,
не наблюдаемая причинность. Полезный сигнал про unowned adapter подтверждён actual CLI. Предложение
«запретить receipts при любом pending deviation» отвергается: оно противоречит обязательному
порядку audit → batched operator review. Запретить весь git по одной reflection тоже не предлагается.

## Очистка и приёмка

[Final cleanup](./cleanup.json): 9 recorded, safeCleanup=true, rootRemoved=true; каждый sandbox
удалён до следующего dispatch. Клоны no-model controls удалены после их процессов. Shared dependencies
не устанавливались, не копировались и не удалялись. Исторический guard recovery checkpoint сохранён.

Датированный controller и hold reader теперь отвергают дальнейший live запуск после финального
reservation; subprocess test доказывает отсутствие нового output/model allocation. Дальнейшая серия
потребует отдельного вопроса/протокола, а не retry потраченных случаев.

Итоговый review должен независимо проверить код, оба допустимых checkpoint-пути, отрицательные
контроли, exact archive replay и ограничения интерпретации. Этот отчёт не разрешает merge PR #130
и не объявляет цель «модель стала автономнее/быстрее» доказанной.
