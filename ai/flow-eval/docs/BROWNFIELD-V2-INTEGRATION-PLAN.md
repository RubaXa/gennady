# SDD V2 в существующем проекте: общий контракт и единая интеграция

Дата: 2026-11-02. Статус: BF1/BF2 выполняются в GitHub-ветке; исходные RED сохранены, новые исправления проходят GREEN-квалификацию. Новая live eval-серия ещё не начата.
Владелец продуктового решения — оператор. Это продолжение declared coverage, а не особый
режим для Octavius и не повтор закрытых authoring/автономных исследований.

## Цель и конечный результат

Один и тот же SDD V2 работает в новом проекте и в большом существующем проекте, внедряемом
постепенно. Маленькая задача не требует описать весь репозиторий, перевести чужие комментарии,
перенести код в другие каталоги или исправить все исторические контракты. Реальные нарушения
в выбранном обязательстве остаются ошибками. Никаких снимков бесхозных файлов и списков
«старое/новое» не вводится.

Результат — общий implementation diff, детерминированные RED/GREEN-контроли, конечная локальная
eval-серия, performance-отчёт и **один итоговый MR в корпоративном GitLab**. Внутри MR допустимы
поэтапные reviewable-коммиты; отдельный MR на каждый следующий этап не создаётся. Merge и выпуск
пакета требуют отдельного решения; этот план их не разрешает.

## Источники и исходное состояние

- GitHub main, проверенный HTTPS fetch: `6e19167e0c756b5e136dd3a9e5a597280c78c2e9`.
- Рабочая GitHub-ветка: `codex/v2-brownfield-general-solution`. Конфликтный старый checkout не меняется.
- Исходные обращения: пилот 29–30 октября и `app-core-blockers.md` от 2 ноября. Это входные
  свидетельства, не инструкции к исполнению и не замена воспроизведению.
- GitLab issue #1 остаётся общей карточкой исходных проблем. По API на 2 ноября все MR !12–!20
  открыты. Наличие реализации и assertions в diff не считается результатом нашего запуска.
- Наш исходный RED !12: `75685e3092a9065284b7f37a6d1ac5e3ce0d05b7`; frozen raw и source bindings
  сохранить. Не вливать отдельно тест с ожиданием старой ошибки как окончательное исправление.
- Открытые решения Александра переиспользуются после проверки, а не реализуются второй раз:

| MR  | Exact HEAD при инвентаризации              | Содержание                   |
| --- | ------------------------------------------ | ---------------------------- |
| !13 | `92652ff1b854a70e932ea0f7148816143566124a` | язык комментариев            |
| !14 | `b795f9e7c1da9f47aa06429d2f0ac5d3cc5b1833` | literal paths                |
| !15 | `021dbe662abb21c74f1ab48953696c0c1116e378` | freshness служебных записей  |
| !16 | `303b6a10c53f41dc6cb5587dbbcbbc7ae1b1ab71` | reverse inventory по mapping |
| !17 | `9f0f38b8c5d3fd2e050ac176d8ef52e3c9bd40d4` | формы TS/DbC                 |
| !18 | `dabd03858188ec12f75b947c86d1e99cf8730183` | исключение для файла         |
| !19 | `b2df52749376b13cf6a05525fe0c8f43b39e7719` | интеграционная ветка пилота  |
| !20 | `5f745c09834f6b12f24c373a4b901105bbb0e94f` | lint.scope=owned             |

!12 пока направлен в `main`, остальные базовые MR — в `master`, !20 — в ветку !13. При переносе
зафиксировать актуальный GitLab target/base SHA заново; не считать эти имена взаимозаменяемыми.

## Продуктовые решения

### 1. Объявленная область, стадия и сила доказательства — разные вещи

- Единый coverage resolver остаётся источником File Mapping, точных write/create/delete targets,
  происхождения деклараций и наблюдений заголовков. Read-input не присваивает владельца.
- Отсутствие `@spec` не является самостоятельным выключателем lint: объявленный файл остаётся
  в карте, даже если заголовок удалили. Неверный/чужой/неразрешимый owner не исправляется молча.
- Authoring проверяет спецификацию и показывает ещё не материализованные обязательства.
  Preflight допускает предусмотренные pending headers/future targets. Phase-exit требует точное
  владение и проверки результатов выбранной фазы.
- Аудит задачи доказывает её заявленную область. Полный аудит модуля/проекта доказывает полную
  выбранную карту. Нельзя автоматически потребовать полный module adoption при закрытии одной
  задачи на существующем коде; нельзя и назвать частичный аудит полным. Это явное согласование
  lifecycle-контракта, а не скрытое игнорирование ошибок полного аудита.
- Незаявленные соседи не становятся SDD-обязательствами из-за общего каталога. Проверки самого
  проекта (компилятор, ESLint, тесты) сохраняют собственную обоснованную область и не сужаются
  автоматически до Target Files. Standalone Verify независим от SDD.
- SDD-команды по умолчанию выбирают область из контекста задачи/спеки; отдельный brownfield-флаг
  не нужен. Явно запрошенный standalone lint каталога не должен незаметно менять смысл.
  `lint.scope: owned` допустим как явная project policy для таких общих запусков, не обязательная
  плата за начало работы через SDD. Значения и default документируются и тестируются отдельно.

### 2. Inventory — по декларации, с честной полнотой

Модуль не равен каталогу. Reverse inventory получает полный набор его File Mapping, а не union
соседних каталогов и не только diff задачи. Различать: mapping отсутствует; mapping полный;
mapping повреждён; есть отсутствующие/неподдержанные файлы; есть точечные исключения.
Фильтрация не превращает последние состояния в «mapping отсутствует» и не запускает внезапный
directory fallback. Partial symbol proof никогда не называется полным reverse PASS.

### 3. Возможности языка — общая явная политика

Согласовать source selection для coverage, lint, audit и Verify repair. Для семейства JS/TS
проверить `.js`, `.jsx`, `.mjs`, `.cjs`, `.ts`, `.tsx`, `.mts`, `.cts`, ESM/CommonJS и выбор соответствующей grammar.
JS-файл из mapping нельзя ни слепо отправить в TS-only lint, ни молча отбросить. Отсутствующая
возможность адаптера даёт точную диагностику о недоказанной проверке; настройка не может
«починить» отсутствующий парсер. Другие языки сохраняют честно обозначенную точность своих адаптеров.

DbC принимает `this`, destructuring, callable exports, допустимые tooling-комментарии и TS/TSX
синтаксис. Для returns различать явный void / явный non-void / неизвестный без аннотации; не
обещать type inference, которого нет. Отдельно согласовать обязательность тегов, не ослаблять
её незаметно внутри parser fix. Autofix не теряет написанные контракты. Внешний `@see` и
внутренний symbol reference — разные формы ссылок с разной валидацией.

### 4. Исключение — точное и проверяемое, а не blanket disable

Для реестров и аналогичных data-файлов разрешить обоснованное исключение конкретных DbC/inventory
обязательств, сохраняя ownership, синтаксис/компиляцию, проектные тесты и проверку самой аннотации.
Сначала проверить, достаточно ли существующего Decision Log/конфига; отдельную систему waiver
не строить. Точный синтаксис итогового маркера закрепляется контрактом до GREEN.

Ссылка на Decision Log должна разрешаться в каноническую запись, совпадать с файлом/набором
исключаемых проверок и удовлетворять действующей политике полномочий. Строка вида `AC-DL-14`
и восемь символов причины сами по себе не доказывают разрешение. Worker не может выдать себе
новое право ослабить проверки. Удалённое/отклонённое/чужое решение и текстовый пример маркера
исключение не включают. Результат показывает exempted checks и основание; это не полный PASS.
Reverse inventory корректно учитывает declared entities исключённого файла, не притворяется,
что файл экспортирует ноль сущностей. Ограничение «не добавлять новые флаги» либо проверяется
отдельным контрактом, либо честно остаётся пояснением, а не заявленной машинной гарантией.

### 5. Freshness и literal paths чинятся на общем уровне

- Один канонический attempt journal. Не возвращать второй конкурирующий receipt как обход.
- Нормализовать только writer-owned status/rollup поля и валидные служебные receipt-блоки,
  используя структурные правила writer/parser. Не исключать целиком specs, индексы или тикеты;
  не маскировать произвольные `N/M` в других таблицах. Требования, план, decisions, rules,
  config, lockfile, тесты и product bytes продолжают влиять на identity.
- Точное имя с `[]` не превращается в glob ни на одном следующем шаге. Проверить existing,
  create и delete/tombstone paths, а не только lstat существующего файла. Явный literal API
  отличается от pattern API. Traversal/symlink/root/regular-file ограничения сохраняются.

### 6. Настройка объясняется инструментом и согласуется агентом

Использовать существующие ошибки/JSON-вывод, orient и Verify plan; новую платформу диагностики
или отдельный обязательный wizard не вводить. Общий диагностический контракт содержит:

1. устойчивый код и конкретную причину;
2. фактическую область и что осталось недоказанным;
3. эффективное значение настройки, источник и precedence;
4. минимальный предлагаемый config diff и объяснение последствий, если настройка применима;
5. точную команду повторной проверки; отсутствие settings fix, если это дефект инструмента.

Для языка переиспользовать `lint.commentLanguage: en|ru|any`. Для общего lint — согласованный
`lint.scope`. Precedence соответствует реальному loader: repo `.gennadyrc` > `gennady.yaml` >
HOME `.gennadyrc`; nested cwd и конфликт источников квалифицируются на установленном CLI.
Предложение изменения не должно показывать секреты или переписывать несвязанные секции.

Агент: читает диагностику → объясняет изменение и запрашивает согласие, когда меняется project
policy → при согласии применяет ровно этот diff → перепроверяет эффективную настройку и исходную
команду. Отказ не вызывает самовольное изменение, бесконечные повторы или перевод комментариев.
Если настройка уже подходит, повторного вопроса нет. Если разрешённый change не действует из-за
override, агент объясняет источник, а не сообщает ложное «исправлено». Это проверяется и тестами,
и траекторией. Пользователю не требуется самостоятельно искать решение в документации.

### 7. Полный исходный scope issue #1 не теряется

В новый отчёт вошли не все исходные пункты. Кроме !13–!20, остаются:

- **P6, ранняя обратная связь по mapping нового теста:** preflight/scaffold сообщает точный
  будущий MAPPING_REQUIRED с владельцем до дорогой фазы. Pending будущего файла допустим;
  read-only query сам не правит спецификацию и не расширяет worker write-scope.
- **P7, большие результаты Vitest:** required stats извлекаются из runner-owned file/stream
  с ограниченной памятью и проверяемым происхождением, а не из обрезанного stdout. Сохраняются
  exit code, failed/cancelled counters и полнота. Исходный RED — synthetic JSON 1 539 029 bytes
  против policy-output cap 1 MiB; это не запуск 4000 настоящих тестов. Не поднимать лимит
  вслепую, не отключать required stats. Stale report, symlink/escape, malformed/truncated/missing
  output не могут дать PASS.

В BF0 ledger отдельно сопоставить P1–P7 из issue #1 и новые parser/registry/JS проблемы с
коммитами/контролями. Новый общий план заменяет прежний порядок исполнения, но не удаляет
исходные findings и не объявляет их закрытыми одним наличием агрегирующей ветки.

## Пять конечных этапов в одной рабочей ветке

| Этап | Изменение и review point                                              | Критерий завершения                                             | Сейчас                                                    |
| ---- | --------------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------- |
| BF0  | План, exact исходники, карта переносимых изменений                    | один план; ограничения и исходные RED сохранены                 | оператор разрешил выполнение; план опубликован в Draft MR |
| BF1  | Контракты/диагностика, синтетические RED, квалификация oracle         | каждый defect причинно воспроизведён; ошибки стенда отделены    | начат: baseline build, 17 unmet assertions; не завершён   |
| BF2  | Общие исправления и GREEN, переиспользование !13–!20                  | весь deterministic matrix проходит; негативы не ослаблены       | выполняется; целевая матрица 598/598, full gate впереди   |
| BF3  | Installed-package lifecycle, большой репозиторий, конечные live evals | воспроизводимые результаты, ясный вердикт, cleanup              | не начат                                                  |
| BF4  | GitHub фиксация и один итоговый GitLab MR                             | parity ledger, чистый GitLab clone, итоговое независимое review | Draft MR !23 создан; transfer/parity acceptance впереди   |

Каждый этап фиксируется коммитами с результатом и передаётся на review в том же реквесте.
Следующий этап начинается после review предыдущего; это не разрешение merge всего MR.
В журнале указывать: SHA/команды/исход/ограничения/cleanup/следующий шаг. Не писать PASS по наличию
теста. Обязательного SDD-ticket scaffold для исследования собственного SDD нет.

## Детерминированная матрица

| ID     | Положительный сценарий                                              | Обязательный отрицательный контроль                                                             |
| ------ | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| BF-T01 | новый проект без конфига, новая реализация по спеке                 | missing/foreign owner и broken function блокируют нужный exit                                   |
| BF-T02 | тысячи незаявленных файлов, portal-only/authoring, маленькая задача | declared target без header не исчезает; pending не превращается в полный аудит                  |
| BF-T03 | два модуля в общей директории, full mapping inventory               | чужие exports не присоединяются; неполная/битая карта не даёт полного reverse PASS              |
| BF-T04 | JS/TS семейства, ESM/CommonJS, .ts type assertion/TSX JSX           | syntax error/unsupported capability не скрываются, repair выбирает ту же область                |
| BF-T05 | this/destructuring/arrows/returns/tooling-comments, lint и autofix  | extra/wrong param, explicit void mismatch, содержимое контракта не теряется                     |
| BF-T06 | реестр с валидным scoped exception                                  | fake/rejected/foreign decision, пример маркера, удалённый header, broken code остаются ошибками |
| BF-T07 | sync/complete/audit/review не протухают proof                       | изменения требований/decision/test-plan/code/tests/config/rules/lockfile stale-ят proof         |
| BF-T08 | нормализация writer-owned таблиц/receipt                            | семантическая дробь в иной колонке, malformed receipt и смена числа задач не скрываются         |
| BF-T09 | literal bracket route: all/files/changed/create/delete/repair       | glob expansion, traversal, symlink и directory не принимаются как точные файлы                  |
| BF-T10 | эффективные ru/en/any, конфликт YAML/rc, nested cwd                 | неизвестные ключи/значения дают actionable отказ; неверный источник не объявляется победившим   |
| BF-T11 | config suggestion → согласие → минимальный diff → повтор            | отказ, отсутствие ответа и override не дают самовольного patch или ложного успеха               |
| BF-T12 | task audit vs full module/project audit                             | task PASS не повышается до полного покрытия; scope явно сохранён в proof/report                 |

Дополнительно обязательны два семейства из исходной issue:

| ID     | Положительный сценарий                                      | Обязательный отрицательный контроль                                                                   |
| ------ | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| BF-T13 | новый test target получает ранний actionable mapping notice | read-only query не редактирует spec; готовая реализация без обязательной декларации не проходит audit |
| BF-T14 | большой реальный runner report с согласованными counters    | stale/symlink/truncated report, exit failure и failed/cancelled tests не дают ложный PASS             |

Контроли должны пользоваться реальным CLI и canonical lifecycle; receipts не фабрикуются вместо
исполнения гейтов. Host-заданные решения в fixture маркируются входом, а не достижением модели.
RED записи не переписываются; GREEN — новая проверка/проекция. Parser, header и config тесты
не подменяют installed-package испытание. Пока это требования к будущим тестам, не выполненные tests.

## Локальные эвалы: ровно одна конечная серия

Предельный план — **8 primary attempts: 4 случая × baseline/candidate; replacements=0**. Он заменяет
предварительный план четырёх P1/P2 попыток с учётом расширенного скоупа, а не добавляет восемь
поверх него. До dispatch сверить
реестр reservations: потраченная попытка не получает новую жизнь. Если попытки уже были, их
семантика/fixture version сохраняются отдельно; протокол фиксирует фактически доступные позиции.

| Случай | Что должен сделать агент                                                                                         | Что измеряем                                                                      |
| ------ | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| BF-E1  | обычная задача в новом проекте без config ceremony                                                               | корректность, отсутствие новых ненужных действий                                  |
| BF-E2  | существующий большой mixed JS/TS проект, общий каталог, диагностика языка; согласованный scripted operator reply | точная область; понятный config diff и согласие; нет массовой разметки/перевода   |
| BF-E3  | существующий реестр, явное основание исключения                                                                  | уважение полномочий; видимость исключений; broken source всё равно не проходит    |
| BF-E4  | bracket route и двухфазное закрытие через sync/audit/review                                                      | реальные gates и актуальный canonical proof без ручного patch/reverify workaround |

Синтетические задания и независимые функциональные oracle; не привязывать логику к словам
`Octavius`, `app/helpers` или определённым именам функций. Octavius — дополнительный приватный
полигон масштаба, не единственный эталон. Config consent/refusal/override проходят все варианты
детерминированно, а live отражает ограниченный scripted ответ; модель не выдаёт операторский ACK.

До серии: exact baseline/candidate/package/harness/fixtures/source/model hashes, одинаковые
бюджеты и observer policy, no-model qualification всех случаев с correct/broken controls.
Baseline для серии выбрать из зафиксированных GitHub/GitLab исходных revisions до новых fixes;
выбор и совместимость harness зафиксировать до dispatch. Разные версии не смешивать в один baseline.
Только локальный AI Proxy / `deepseek-v4-flash`; CI eval jobs и новые live-попытки для «добить до зелёного»
не создаются. При pre-dispatch дефекте стенда квалифицировать стенд до старта, а не расходовать очередь.

Для каждой попытки сохранить timeline с загруженными directives/rules, Read/Write/Bash/CLI calls,
результатами и независимой классификацией необходимости (required/redundant/unknown), artifact diff,
Verify proof/scope, config proposal/consent/actual diff, functional/semantic verdict, tokens/cache,
tool calls/API requests, elapsed. Не приравнивать tool calls к HTTP requests. Денежную стоимость
считать только по достоверному тарифу/usage; неизвестную цену так и обозначить. Одна bounded
reflection после попытки разрешена в заранее включённом бюджете и учитывается отдельно.

Итог в чате — короткая baseline→candidate таблица по каждому случаю и решение: принять/исправить/
не доказано. Censored/budget/error не считать экономией. Общая статистическая non-inferiority
на четырёх парах не заявляется. Механический correctness fix принимается по причинным controls,
даже если модельный эффект inconclusive; неуспех конкретного сценария нельзя замолчать.

## Масштаб и очистка

- На 1k/10k/50k деклараций и реальном репозитории измерить first process и warm elapsed, peak RSS,
  source/metadata reads и bytes. First process не называть OS cold cache.
- Карта строится один раз на invocation. Нет per-file обхода всех specs; header-probe действительно
  ограничивает bytes чтения, а не делает slice после полного readFile. Большой task-index/registry
  не порождает мегабайты повторяющейся диагностики: bounded summary + детальная машинная запись.
- Числовой performance budget и размер выборки фиксируются в BF1 до candidate measurements;
  запрещён произвольный post-hoc порог экономии. Полный standalone check может оставаться full.
- Одна рабочая source-ветка и ограниченная очередь. Зависимости/build cache общие, без копий.
  Тяжёлые проверки последовательно; модельные попытки по одной. До запуска проверить свободный
  диск и оценку требуемого temporary footprint; недостаток места сообщается до model dispatch.
- После каждой попытки: durable compact evidence → остановка собственных writers → удаление
  owned sandbox/install/coverage → проверка rootRemoved и bytes freed. Неудачная очистка
  останавливает очередь. Основной checkout, общие deps/cache и evidence не удаляются.
- Private исходники, пути, credentials, исходные diff Octavius не отправляются в публичный GitHub.
  Публичны generic harness, synthetic fixtures и очищенные hash-bound проекции; private replay
  остаётся отдельно. Raw/model outcomes исторических серий не переоцениваются задним числом.

## GitHub → один итоговый GitLab MR

1. В GitHub-ветку перенести отобранные general source/test/doc changes из exact MR heads;
   вести список source MR/SHA → destination commit/path → kept/modified/rejected + причина.
   Предыдущий author credit и исходные RED сохраняются. Корпоративные release/CI/package-name
   различия не переносить как случайную часть общей feature. GitHub remote push — только
   проверенный публичный состав без private evidence.
2. Зафиксировать staged contract changes и deterministic GREEN, затем BF3 evidence на clean
   candidate. Штатные commit/push gates без bypass. Архивные объекты и baseline не переписывать;
   необходимые currentProof tuple updates сверять отдельно в пределах разрешений, а не делать
   массовый refresh, чтобы скрыть изменение защиты.
3. На актуальной целевой GitLab ветке собрать одну owned integration branch с general patch и
   необходимой адаптацией корпоративного package name/entrypoint. Не перезаписывать чужую !19
   и не делать force push. Проверить, можно ли использовать !19 по согласованному ownership;
   иначе создать один новый итоговый MR и обозначить !19 superseded после сохранения состава.
4. В чистом клоне GitLab установить собранный пакет и воспроизвести deterministic/installed
   controls. Отчёт сравнивает general code и оправданные platform deltas, package exports,
   CLI commands, eval scripts, directives/generated copies и сохранённые hash bindings.
   GitLab-origin локальная no-model fixture обязана пройти; hosted CI не запускает модель.
5. В issue #1 и каждом !12–!20 опубликовать ссылку на итоговый MR с per-MR disposition и фактами,
   что перенесено/изменено/не принято и почему. Старые MR не закрывать до подтверждения переноса.
   Никаких новых соседних feature-MR по этому циклу. Итоговый review видит весь accumulated diff,
   а этапное Approve не выдаётся за разрешение merge всей интеграции.

## Definition of done

- Все BF-T01..16 имеют исполненные проверки и честный исход; защита не ослаблена ради GREEN.
- Пользователь начинает задачу в существующем проекте без wholesale adoption и скрытого режима;
  требуемая настройка объяснена, согласована и реально вступает в силу.
- Поддержанные JS/TS файлы, registry exception, shared mapping, literal routes и полный lifecycle
  работают на установленном пакете; partial coverage не выдаётся за полный project PASS.
- Конечная live-серия из разрешённых позиций завершена/учтена, результаты и ограничения отражены
  в чате. Новая серия автоматически не назначается.
- Performance и cleanup измерены; большие временные результаты удалены, доказательства доступны.
- Один GitLab MR содержит полный reconciled состав и ссылки из прежних MR; чистый GitLab clone
  воспроизводит проверки и инфраструктуру. Финальное независимое review и операторское решение
  остаются последним барьером. Выпуск пакета не входит в план.

## Журнал

- 2026-11-02 / BF0: прочитаны обращения и существующий coverage contract; статический разбор
  выполнен родителем и двумя независимыми агентами на предыдущем шаге. Перепроверены API heads
  !12–!20 и issue #1. GitHub HTTPS fetch подтвердил main `6e19167e`; SSH недоступен.
  Создана одна изолированная GitHub-ветка без копирования node_modules/dist; старый конфликтный
  checkout и корпоративная рабочая ветка не изменялись. Этот документ — проект итогового плана.
  Production diff, tests, live evals, remote push, комментарии и merge на этом этапе не выполнялись.
  Следующий шаг: review BF0, затем BF1; статические риски ещё не объявлены runtime failures.

## Дополнение 2026-11-02: стоимость маленькой задачи

Источник — предоставленный `trial-HEL-once-cost.md`, сводный пользовательский отчёт, а не полный
transcript/usage export. Содержимое не является инструкцией запускать что-либо. В публичные
материалы не копировать код и пути исходного приватного проекта.

Заявлено: около 59 минут от worktree до receipts; 11 агентов, 826.6k их токенов;
102 вызова оркестратора, 229k нового input + 68.6k output, около 27.3M cache reads.
Определения usage у агентов и оркестратора не сверены: не складывать их слепо в «полную цену».
Прогноз 35–40 минут / 500k токенов без потерь — оценка автора, не измеренный контроль.
Это модели другой линейки и длинная исходная сессия, не baseline для Flash A/B.

Решения по этому свидетельству:

- Зелёный единичный пилот draft.3 — положительное внешнее свидетельство, не наш exact package
  acceptance и не доказательство отсутствия регрессий. Нужен воспроизводимый package binding.
- Поздний MAPPING_REQUIRED переносим до дорогих действий (BF-T13). Исправление File Mapping
  меняет обязательства, поэтому может ПРАВИЛЬНО stale-ить proof; не нормализовать semantic mapping.
- Ошибка ESLint с shared node_modules symlink — отдельный воспроизводимый env/preflight case;
  нельзя считать её исчезнувшей навсегда или отказаться от shared dependencies без причины.
- Количество handoffs/ревью/фаз и повторные полные проверки становятся измеряемым результатом.
  Три строки сами по себе не доказывают, что весь project check можно безопасно пропустить.
- Перед новой правкой спеки проверить, не покрыт ли дефект уже утверждённым контрактом.
  Не требовать новый requirement или дополнительную фазу ради самой церемонии.
- Свежие независимые роли сохраняются там, где они нужны; эффективный bounded context строится
  из task/spec/rules и evidence references, без наследования всей истории оркестратора.
  Оптимизация текста/снятие независимого review не считается автоматически полезной.
- Повторный Verify можно избежать только при доказанной применимости canonical proof к тем же
  obligations/plan/config/rules/source/runtime. Иначе нужен реальный прогон. Новый generic cache
  с ослабленным identity не вводить; сначала посчитать фактические дубликаты и existing reuse.

Добавить два семейства в ту же матрицу, без новых этапов или модельной серии:

| ID     | Положительный сценарий                                                                            | Отрицательный контроль                                                                                               |
| ------ | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| BF-T15 | worktree с общими symlink dependencies: ESLint и другие инструменты видят правильный project root | неверный root/config даёт раннюю actionable env-диагностику, не скрытый PASS и не перепись проекта                   |
| BF-T16 | точный учёт critical path, обязательных checks, повторов, handoffs и context loads                | reuse не переносит PASS через semantic mapping/config/test/source drift; неполные измерения не объявляются экономией |

В существующих BF-E1..4 фиксировать дополнительно: время до первой полезной правки, proposal/review
и операторские ожидания отдельно, model/tool/verification интервалы без двойного суммирования
перекрывающихся работ, причины каждого reverify и handoff. Вывод — что необходимо, что можно
устранить, что ещё unknown. Автоматически увеличивать число primary attempts не разрешено.

Кандидатные механизмы для BF2: ранняя metadata-проверка; env readiness; минимальный достаточный
контекст роли; устранение только доказанных дубликатов Verify. Каждый принятый механизм имеет
отдельные deterministic controls; если эффекта не доказано, сохраняется исходное поведение.
Финальный отчёт не должен называть один час или 35–40 минут нормой без измерения и объяснения
стоимости. В новом проекте обычный путь без дополнительных настроек остаётся контролем.

### Ход BF1 (реальные результаты, не GREEN)

GitLab integration ref при fetch: `2ed10506f8fe42903a37145853aac6bee7c5313e`,
owned-scope ref: `339196086a04e1dc84c2c757f59dd5d566687191`.
Они новее первоначальной таблицы; прежние observations не удаляются. Добавлены исправления
validated receipts/tracker columns, mapping diagnostics, marker grammar и JS inventory.
Их статическое наличие не выдаётся за наш runtime PASS.

GitHub baseline build прошёл за 4.41s; node_modules — symlink на общий store.
Импортированы только source-bound tests/helper и frozen RED, product-код ещё не изменён.
Первый node:test: 13 tests, 1 passed, 12 failed; 9 assertion failures (route, freshness и
7 DbC cases), 3 загрузочных отказа из-за отсутствующего test-only process-budget helper.
Последние три — дефект переноса стенда, НЕ продуктовые RED. Helper перенесён с exact GitLab
master; повторяются только не стартовавшие suite, старый исход сохраняется отдельно.
Model calls: 0. Live evals не начаты. Прохождение полного гейта и GREEN не заявлены.

Повтор после восстановления test-only helper: 8 tests / 0 passed / 8 failed,
exit1, 3275ms, без загрузочных ошибок. Это ожидания новых mapping/JS/owned-scope контрактов
на старом продукте, не восемь независимых багов. В сумме 17 неудовлетворённых runtime assertions
в двух запусках; старые три loading failures не прибавляются. Все fixtures удаляются finally;
modelCalls=0. Эти результаты ещё не покрывают всю BF-T01..16 матрицу.

### Единый Draft MR опубликован

[GitLab !23](https://gitlab.corp.mail.ru/mail-core/gennady/-/merge_requests/23),
source `codex/v2-brownfield-integration` → `master`, exact inherited HEAD
`2ed10506f8fe42903a37145853aac6bee7c5313e`. В описании опубликован полный план и текущий
RED-прогресс. Это owned branch от !19, не force-push в ветку автора и не новый GREEN-коммит.
В !12–!20 и issue #1 опубликованы и read-back проверены ссылки/состав; исходные реквесты
не закрыты и не одобрены. Дальнейшие коммиты и этапные результаты накапливаются в !23.
Новая публикация пакета, merge, ручной CI job и model dispatch не выполнялись.
После RED-проверок оставшихся pilot/DbC fixture roots не обнаружено; общий dependency store
и baseline dist сохранены для следующего этапа, временный coverage не создавался.

### Продолжение BF1/BF2 в GitHub-ветке

Перенесён general patch из !19@2ed10506 без package/release/protected-proof metadata;
49 source/test/doc paths, точные provenance и отличия GitHub/GitLab баз записаны в integration ledger.
Семь файлов сохраняют оправданные отличия баз (включая package-version строки); побайтовая
тождественность всех файлов не заявляется. Frozen исходные RED не менялись.

Повтор тех же ранее RED tests: **18/18 PASS**, source CLI, не установленный candidate.
Дополнительные causal RED: large Vitest process 1/2; early mapping 1/2; config guidance 0/2.
После изменений: Vitest process + existing executor **19/19**, JSON adversarial **17/17**,
preflight mapping + existing coverage **63/63**, config guidance + existing suites **11/11**.
Независимое статическое review streaming parser не нашло ложный PASS, потребовало adversarial
controls; отдельное review нашло canonical-header skip и неоднозначные config sources/hints.
Исправлены canonical bounded ownership reads (4KiB, uncertain=>keep), nested config target и
структурная provenance; выбранные regression+loader suites **20/20**.

File exception теперь требует accepted canonical module decision с точным файлом и check scope;
набор из real CLI authority negatives и component tests **8/8 PASS**. Это не криптографическое
доказательство личности оператора: существующая модель authority/review сохраняется. Host-выданное
разрешение в component test помечено входом; реальные CLI tests отдельно отвергают fake/pending/
rejected/foreign-file decisions. За пределами исключения проверки остаются обязательными.

Все числа — фактические локальные no-model runs, некоторые suites пересекаются и не складываются
в независимый общий count. Новые source hashes/full gate/final review/installed candidate и live
серия ещё впереди. Baseline dist сохранён отдельно hash-bound до следующей сборки; зависимости
общие. Модельные вызовы **0**. BF2 и весь реквест не завершены; далее JS/capability consistency,
остальные негативы, синхронизация specs/directives и штатные общие gates.

### BF2: независимое review и причинные дополнения

- Общая выбранная regression-матрица: **598/598**, 41 test files, Node 22.19.0,
  concurrency 2, 47.53 s. Полный unit/pre-commit это ещё не заменяет. Type-check и весь
  production contract lint прошли. Suites пересекаются с прежними измерениями; counts не суммировать.
- Исправлен advisory owner lookup: портал README не обязателен; небезопасный specs-root не читается.
- CommonJS replacement не сохраняет старые exports; property `default` не заменяет export object.
  Новая default-property регрессия сначала 9/10, после исправления CJS+process controls 15/15.
- Required Vitest JSON парсится bounded stream только из stdout. Ненулевой exit, timeout,
  malformed/truncated JSON и stderr-only counters не дают PASS. Отдельный RED выявил zero-exit
  с failed counters (4/5); теперь это FAIL, а не ложный PASS.
- Config parser preview мог раскрывать часть значения. Уточнённый synthetic-secret контроль
  воспроизвёл 11/12; сообщения теперь сохраняют синтаксис/позицию, без raw value preview.
- Scoped exceptions привязаны к declaration-owner + согласованному header; canonical decision
  обязан быть уникальным (включая ordinary duplicate ID). Отдельные dbc-only/inventory-only
  контроли сохраняют вторую проверку. Дополнительные authority/config/inventory suites 25/25.
- Untouched mapped files могут оставаться pending в global coherence; выбранный ownership audit
  строгий. Независимое review дополнительно обнаружило ignored-new edge: отсутствие в diff не
  доказывает неизменность. Pending теперь требует batch HEAD-membership и отсутствия source diff;
  отдельный RED сохранён, GREEN 15/15. Никакого сохраняемого списка исключений не создано.
- Literal lifecycle: deletion/create/RuleSnapshot controls 76/76. Создание отсутствующего bracket
  route проходило ещё до исправления; новый дефект был в tombstones и Git pathspec. Staged и
  unstaged удаления используют exact literal Git baseline; glob-сосед его не подменяет.
- Из GitLab master выборочно возвращены общие eval fixes: isolated endpoint, observer redirection
  attribution и canonical durable spec export при сохранении scratch для recovery. 39/39 no-model
  controls; источник и точные хэши — eval-portability-source.json. CI/release/raw истории не перенесены.
- Проверка SDD baseline обнаружила устаревшую ссылку текущей BDD-декларации на прежнее имя test case.
  Декларация JS/TS capability согласована с реальным новым case; Execution Log этого тикета сохранён
  побайтово, SHA256 4a2064511180d6e9769d62725b2218bdb3d2c482255f5704a0080276f8f8296b.
  Сам baseline не менялся. Повтор zero-new-error gate: PASS; baseline сохранён.
- Независимая проверка inventory: 1058→1062 entries, 0 removed/reclassified, только два historical
  JSON и две versioned-protocol regression suites. Обновлены только два счётчика и digest;
  forbidden/markers/protected/classifiers не менялись. Frozen-main manifest/objects не изменяются.

Модельные вызовы по-прежнему **0/8**. Следующая review-точка: full штатные gates и BF2 diff,
затем квалифицированный installed-package BF3; перенос новых commits в GitLab остаётся BF4.

### BF2: полный gate, первая интеграционная проверка

Штатный commit остановлен, bypass не выполнялся. Первый отказ: comment-density (одна лишняя
строка в регионе; исправлена). Следующий full Verify прошёл type/lint/format, но unit упал:
устаревший docs-path пример, ожидание JS-исключения в group-scope, repair-adapter fixtures и
два 30-секундных file-level timeout. Это отдельные найденные ограничения полной матрицы;
они не заменены прежними зелёными target counts. До устранения причин коммит и BF2 acceptance
не состоялись. Таймауты не повышаются вслепую; модельные прогоны не запускаются.

### BF2: интеграционные отказы устранены, повтор full gate впереди

- Docs checker и согласованные JS/TS target expectations: **108/108**. Baseline не менялся.
- Repair fixtures получили честные header/DbC для служебных JS-исходников. Дополнительно найдена
  product-недоделка: Node repair всё ещё hardcode-ил TS-only. Он теперь использует общий predicate;
  supported MJS требует реальный process, не WAIVED. Реальный CLI **5/5**, adapter unit **31/31**.
- Таймаутящие bootstrap/composition suites последовательно прошли **13/13**, 22.5s суммарно
  (11.66s и 10.53s). Причина конкретного slowdown не объявляется CPU starvation без доказательств.
  Три full-flow CLI suites теперь выполняются отдельной serial-группой с **прежним 30s deadline**;
  остальной local pool остаётся 2, прочие tiers и 120/360s budgets неизменны. Topology RED→GREEN:
  **22/22**, включая exactly-once и один observed c8 pass. Ничего не исключено из обязательной проверки.
- Настоящий установленный Vitest 3.2.4 выдал **3 120 824 bytes** JSON. Correct test→PASS,
  broken test→FAIL; счётчики 1/1 и 0/1 подтверждены executor. Обычный policy cap **1 048 576**
  не повышен. Reusable `qualify-vitest-stream.ts` принимает явный локальный пакет, не устанавливает
  зависимости и не читает исходники проекта; native config loader/cache в собственном tmp root.
  Exact source/run hashes — installed-vitest-stream.json. Это no-model control, не primary live attempt.
- Две оставшиеся после timeout фикстуры удалены только после доказательства принадлежности по
  wrapper-ссылке на нашу worktree: 1 017 581 bytes. Общие dependencies не удалены.
- AI Proxy metadata endpoint отвечает HTTP200 и объявляет exact `deepseek-v4-flash`.
  Проверен только список моделей; исходники/задачи ещё не отправлялись, dispatch **0/8**.

Далее: повтор штатного commit gate над этими исправленными bytes; при PASS — stage review,
затем BF3. Никакого переноса новой реализации в GitLab или публикации пакета пока не было.

### BF2: shared dependency boundary и финальная диагностика

Full gate-3 прошёл прежние timeout/JS regressions, но остановился в installed eval fixtures:
корпоративный общий node_modules содержал не соответствующий GitHub lock набор, включая лишние
пакеты. Dependency guard не ослаблялся. Готового полного совпадения в уже доступных checkout нет.
Подготовлен **один** общий cohort по exact GitHub package-lock и tracked .npmrc (существующая
peer policy проекта). Первый off-root install не видел .npmrc и дал ERESOLVE; исходный отказ
сохранён, затем применён именно конфиг проекта без --force/нового peer override. Npm ci: 697
пакетов, 8s; 0 installed-lock mismatch. Источник/lockfile/корпоративный checkout не изменены.
Наша worktree подключена symlink, копий на каждый прогон нет. После пересборки два ранее
упавших installed-runtime набора **9/9 PASS**, 40.8s. Exact hashes — dependency-qualification.json.
Прежние raw/RED не переоценены; финальный gate перепроверяет код с согласованным toolchain.
До live baseline и candidate будут собраны с этим же cohort; старый build archive сохраняется
отдельно и не будет незаметно объявлен новой парой. Модельных запусков по-прежнему 0/8.

Tool diagnostics теперь объясняет и `lint.scope`: при реальном missing-header в effective all
условно предлагает owned, показывает источник/minimal diff/consent/recheck. Объявленные файлы
не скрываются. Real-CLI RED2/3 → config/guidance GREEN **9/9**; независимое статическое review
не нашло нового skip/config-write/override дефекта. Это завершение исходного диагностического
контракта, не включение owned по умолчанию.
