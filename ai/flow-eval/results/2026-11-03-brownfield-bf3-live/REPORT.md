# BF3: восемь живых попыток и окончательный вывод

**Механические исправления обоснованы; универсального улучшения автономности, качества
траектории, стоимости или скорости не доказано.** Восемь попыток завершены, замен0.
Новых прогонов «до зелёного» не запускаем.

Проверенный продукт: candidate `e24ce33eeada13b666df116a903c15568af504cc`,
baseline `6e19167e0c756b5e136dd3a9e5a597280c78c2e9`.
Модель везде — `llm-proxy/deepseek-v4-flash`. Изменения измерителя после кампании
помечены отдельно и не подменяют выполненный код или старые оценки.

## Что исправило независимое ревью

F1–F7 подтверждены с оговорками: роли не являются аутентификацией;
проверка пути — point-in-time, не атомарная защита всей файловой системы.
Дополнительно найдены и исправлены четыре реальных дефекта:

| ID     | Исправление                                                                                        | Причинная проверка                             |
| ------ | -------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| BF-R8  | Inventory видит exported destructuring и реальные binding names, не ключи/initializers             | RED6fail →23/23; настоящий CLI reverse         |
| BF-R9  | JS разбирается JavaScript grammar, TypeScript-аннотации в `.js` отклоняются даже при DbC exception | RED5fail →10/10; установленный CLI проверен    |
| BF-R10 | Явно пустая File Mapping не превращается в отсутствие карты и обход каталога                       | RED2fail →7/7                                  |
| BF-R11 | Handoff сохраняет literal brackets; `[...].tsx` не считается scaffold placeholder                  | RED5fail →149/149; полный двухфазный reference |

Предварительный штатный commit прошёл5377 executed /5369 passed /0failed /8skipped,
coverage и pre-push PASS. Архивы, baseline и запреты V1 не ослаблены.

## База → кандидат по каждому случаю

Токены ниже — input+output+reasoning, без cacheRead/cacheWrite.
Время — primary flow; у E4 оно включает промежуточное завершение P1 хостом,
а не только работу модели. Внешний judge и reflection считаются отдельно.

| Случай                       | Итог базы                                              | Итог кандидата                                           |  Токены Б→К | Вызовы Б→К | Время Б→К, с |
| ---------------------------- | ------------------------------------------------------ | -------------------------------------------------------- | ----------: | ---------: | -----------: |
| E1, простая задача           | Артефакт/owner PASS                                    | Артефакт/owner PASS; лишние широкие чтения               | 34179→41915 |      19→20 |    60,5→91,4 |
| E2, язык комментариев        | Остановлен при поиске реализации пакета                | Настройка согласована отдельно, применена, lint PASS     | 14293→12819 |      10→10 |    20,5→40,6 |
| E3, предложение исключения   | Остановлен до lint/proposal                            | Остановлен до lint/proposal                              | 13049→10228 |       8→10 |    10,2→15,6 |
| E4, literal route и две фазы | Известный отказ Verify на пути с `[]`; честный blocker | Верный код, P1 PASS, но P2 Verify не завершён до бюджета | 40179→44979 |      16→25 |  192,2→544,8 |

**В E1 экономии нет:** описательно +22,6% некэшированных токенов,
+5,3% вызовов, +51,1% времени на единственной паре. Причинную или универсальную
деградацию по одному прогону не выводим. Другие пары не сопоставимы для экономии:
ранняя остановка или разные достигнутые этапы не являются выигрышем.
Полных квалифицированных пар для доказательства неухудшения траектории0.

## Два ограничения оценивания, разобранные независимо

1. **E2 raw judge FAIL сохранён.** Судья смешал начала отсчёта времени.
   Фактическая правка началась через2325мс ПОСЛЕ отдельного host approval;
   source/прочие настройки сохранены, повторный lint0. Независимый вывод
   objective/consent PASS записан отдельной проекцией, исходная оценка не изменена.
2. **E3 — policy-censored, не плохое готовое предложение.** Ограничитель режет
   чтение installed package metadata/docs/shim; metadata сама по себе не доказывает
   чтение реализации. До substantive lint/proposal оба агента не дошли.
   Живое доказательство canonical pending отсутствует; его нельзя заменить unit PASS.

E4 baseline judge PASS означает корректное сообщение блокера, не закрытую задачу.
У candidate код и оба owner корректны, но canonical P2 PASS отсутствовал.
В старой кампании часть настоящего tool stderr сохранилась лишь отпечатком;
она не восстанавливается из саморефлексии модели.

## Что показала проверка среды после кампании

В том же sandbox эталонный запуск через системный Git достиг50-секундного
предела с xcrun-cache EPERM. Единственная замена — PATH с реальным Git toolchain —
дала P1 Verify PASS4,6с, host complete0,94с, P2 Verify PASS7,49с.
Права sandbox не расширялись. Это доказанный дефект условий измерения;
он не доказывает единственную причину всей старой задержки без утраченного stderr.

После восьми попыток исправлены только измеритель и его контроли:
одна временная шкала согласия, bounded private output capture с redaction,
реальный Git, qualification под тем же profile, безопасная публичная проекция.
Новые model calls0; target14/14, dedicated strict TypeScript PASS,
повторная no-model qualification8/8 за68,3с с настоящим полным E4 lifecycle.
Старые восемь результатов не переоценивались. [Детали](measurement-fixes.json).

## Затраты всей серии

| Этап                     | Некэшированные токены |
| ------------------------ | --------------------: |
| Восемь primary attempts  |                211641 |
| Восемь независимых judge |                 49988 |
| Восемь reflection        |                175961 |
| Всего                    |            **437590** |

Primary cacheRead1305984; primary tool calls118. CacheRead не спрятан в «экономии».
API/HTTP request count не измерялся и не равен tool calls. Provider reported cost0
не является бесплатностью; денежная стоимость без подтверждённого тарифа неизвестна.
Это расходы серии, не effect size. Reflection оказалась заметной статьёй расходов;
её полезность/сокращение не проверялись отдельной гипотезой.

## Полная траектория и масштаб

Все118 действий разобраны отдельно:76 required,14 supporting,20 redundant,
8 unknown/mixed. Это независимая семантическая оценка наблюдаемых действий,
не причинное доказательство, что удаление20 вызовов улучшит качество.
[Порядок действий и обоснования](TRAJECTORIES.md), [исходные проекции](independent/).
Обнаружены лишние обходы каталогов, package discovery, история Git без указанного
пробела; batching сам по себе не делает составной вызов обоснованным.
SDK timestamps годятся для наблюдаемого порядка, не для точного command latency.

Installed CLI performance:72 процесса,0modelcalls; first process и5warm отдельно,
не OS-cold-cache. Реальные3007 declarations:119,1→118,9мс;50k:224,9→229,0мс,
ровно1исходник/7776bytes и3metadata. Нет обхода всех исходников и общего speed win.
[Полный замер](installed-performance-final.json).

## Очистка и граница решения

Все8 attempt roots и общий root удалены:744093179logicalbytes; общий dependency
cohort сохранён. Дополнительно удалён временный coverage542186552bytes,
сохранён проверенный gzip. Raw/source/diff реального проекта остаются локально
вне Git; публичны scalar/hash-проекции и синтетический harness.

**Принимаем исправления корректности, подтверждённые причинными контролями.**
Не принимаем утверждение об общем ускорении или автономном закрытии всех сценариев.
Этот исследовательский цикл завершён; дополнительные primary attempts требуют
нового явного протокола/разрешения. BF4 — один перенос в GitLab после ревью этого
этапа — ещё не выполнен. Merge и npm publication этим отчётом не разрешаются.

Сырые machine outcomes: [report.json](report.json), [protocol.json](protocol.json).
Независимое толкование: [comparison.json](comparison.json).
Исполненный до исправления измерителя код сохранён в `harness/`, новый no-model
reference — в `post-campaign-harness/`. Их хеши различаются честно и проверяются.

### Завершающий этап: стоимость самого гейта

После двух таймаутов общего unit-step исправляем измеренные затраты, а не
повторяем гейт в ожидании свободного хоста. Это отдельные изменения ПОСЛЕ
восьми живых попыток: старые результаты не являются их live-валидацией.

- Verify выбирает contract-lint leaf: compiler/format 2→1, contract lint 1→1;
  семь обязательных узлов и standalone lint сохранены. Политика 5/5, соседи 51/51.
- WorkspaceGuard продолжает читать/хешировать каждый исходник и проверять пути.
  Совпадающий payload копируется в независимый inode с COPYFILE_FICLONE request
  и проверкой SHA; fallback обычного копирования разрешён. На 1000×8192B и
  шести шагах buffer writes 7007→1001, 57.34→8.19MB; дополнительно прочитано/
  захешировано 49.15MB destination. Physical disk writes не измерялись. Один
  замер 24.53→15.52s, Git timing тоже менялся: общего ускорения не выводим.
  Guard suite 25/25, включая повреждённый blob, symlink, rollback/chmod и
  same-size/same-mtime mutation.
- Black-box partition использует один свежий Vite build, проверяемый по всем
  source/output SHA до/после. Unit/contract coverage остаётся исходниковым.
  Два tiny-fixture запроса: 1.92/2.26s source против 0.50/0.77s dist, stdout
  совпал. Provenance/partition/env 6/6. Реальный контроль честно красный:
  sdd-verify 3/3 за8.08s, sdd-task превысил standalone30s; failure посчитан,
  manifest удалён. Общий hook использует ранее разрешённый file floor120s.
- Исследовательские архивы не входят в TSC program. Recorded replay1.4s,
  archive read≈0.18s и2 Git processes: это не причина многоминутного таймаута.

Новых model calls0. Числа и ограничения: resource-costs.json в пакете BF3.
Общий step deadline600000ms, список обязательных тестов и assertions сохранены.
Обычный завершающий hook/push ещё предстоит; PASS заранее не заявляется.

Первый оптимизированный hook выявил новую ошибку подготовки CLI bundle:
createTestEnvironment передавал NODE_ENV=test сборщику Vite, отчего optional
React DevTools попадал в bundle и build падал. Это дефект нового harness, не
таймаут/ошибка модели. Исправлено только окружение builder: production;
test-процессы по-прежнему test. Causal spawned-builder regression проверяет
одинаковые выходные bytes/digest при inherited test/production и неизменность
caller env; focused7/7 PASS. Красный hook сохранён отдельно; старые8 attempts
не изменены, model calls0. Следующий обычный hook выполняется после реальной
production-сборки из inherited test.

Следующий hook честно остановился на TS7053 и конкурентной annotation-правке
сабагента: WorkspaceGuard обнаружил mutation и восстановил index bytes.
В финальный staged набор включена явная NodeJS.ProcessEnv annotation;
последний отдельный tsc с ней exit0. До нового запуска все reviewers переведены
в read-only. Красный запуск не объявляется PASS и сохраняется отдельно.
Реальная production-сборка из test env уже PASS20.83s, output digest совпал
с прежним обычным production-build. Новых model calls0.

Повторный полный hook прошёл type-check32.7s/lint33.1s/format140.2s,
но node:unit снова достиг600000ms (744.5s включая завершение guard).
Частичный TAP сохранил395 top-level records, not-ok0; это НЕ PASS полного
корпуса. Нового слепого повтора не было. Профилирование выделило53 повторных
Node/TSXстарта в V1 fixture core,22acceptance вызова sourceCLI в обход bundle
и110Git setup процессов в22testcovфикстурах, где Git не участвует.
Сохранены classifiers, protected paths, tests/assertions и реальные root/
invalid-policy CLI controls. Новый symlink-entry regression1/1 PASS;
capability удаляется из env product children.

Targeted три suites:37PASS и1file timeout(E22), не GREEN. Inventory15/15
61.9s против прежних103.4s, testcov22/22 83.5s против54.7s — несинхронные
host-замеры не доказывают общий speedup. E22 child позже оставил полный JSON.
Один отдельный no-model CPU/child-process профиль на том же scratch подтвердил
212files/199errors/432warnings,273Git subprocesses:68repository probes,
68HEAD probes,67path lookups,67blob reads и дополнительные операции.
Новая узкая гипотеза: читать baseline спецификаций одним pinnedHEAD batch,
с exact-byte сравнением старой/новой CLI-диагностики, без глобального cache.
Полный hook повторится только после причинной квалификации этих изменений.

### Завершающая причинная квалификация ресурсных изменений

- Пакетный baseline:12/12 PASS, root TypeScript0. Один pinnedHEAD, literal
  NUL-paths, OID/body-size framing, bounded32KiB/128-path и64MiB/512-object
  chunks, без глобального кеша. Проверены смена HEAD между вызовами и1000
  virtual long-path protocol records (не1000физических файлов). Старые
  strict/single readers сохранены. Независимый read-only review: blockers0.
- Реальный E22:Git273→8, JSON403292bytes побайтово совпал, тот же
  fileCount212/errors199/warnings432 иexit1. Новый wall2.415s — один
  описательный замер; исходный CPU-profiler имел дополнительную инструментализацию,
  host/cache не зафиксированы, универсального speedup не выводим.
- Первый pipe diagnostic был RED:65536bytes вместо403292. Это привело к
  отдельному реальному фиксу прежнего process.exit до окончания async stdout.
  Новый RED/GREEN:120synthetic specs,65536→242917bytes,валидный JSON
  pipe=regularfd, прежний exit1; все120файлов сохранены. Никаких проверок
  не отключено. Строгий test-file TypeScript также прошёл после исправления
  устаревшего diagnostic-only built.issue→built.notDone (assertion неизменен).
- Одна свежая production-сборка4.115s, точный E22 control и весь acceptance
  corpus10/10 PASS7.612s; source/output hashes проверены, manifest удалён,
  новых model calls0. Старый E22 fd-протокол и frozen contract не изменены.
- Проверили и НЕ внедряли: broad перенос6pure/fake suites в другой pool
  (42/42 qualification, но недостаточный выигрыш для расширения scope);
  новый cached sanitizer (точечный CPU profile2.05s, generic regex≈5ms,
  не причина600s). Никакого blanket classifier исключения не добавлено.

После этой квалификации — один обычный полный hook/push. Все авторы остановили
запись в source. Default/file/global deadlines и обязательный corpus сохранены.
Восемь live попыток относятся к e24, новые ресурсные/product исправления имеют
только описанную deterministic/no-model валидацию; общей победы модели нет.
