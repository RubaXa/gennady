# Покрытие SDD в существующем проекте

Решение оператора от 2026-10-27: одна вычисляемая карта обязательств из спецификаций, тикетов и
наблюдаемых файлов. Никакого перечня исключений, снимка бесхозных файлов или режима миграции.
Обычный код вне заявленного покрытия не требует `@spec`. Заголовок подтверждает владельца,
но не заменяет декларацию и не доказывает успешное выполнение проверок.

## Конечные этапы

| Этап | Изменение                                                                  | Приёмка                                                                                                                      | Статус                                                                  |
| ---- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| SC1  | Общий pure-резолвер, контракт, негативные тесты и performance-квалификация | Предсказуемая карта и происхождение каждой строки; нулевые записи/процессы в core; независимое ревью                         | Approve SC1; переход к SC2 разрешён                                     |
| SC2  | Один файловый адаптер и проекции orient/sdd-check                          | Портал/скоуп/модуль/фаза используют одну карту; точные структурные связи, безопасные пути, ошибки чтения не теряются         | Approve SC2 (`00631595`); SC3 разрешён                                  |
| SC3  | Подготовка и завершение фаз, аудит и инструкции                            | Без заголовка можно начать; без нужного заголовка нельзя закончить; удаление/чужой владелец/ослабление проверок не дают PASS | Реализован; offline 686/686 + shell7/7; ожидает штатных гейтов и review |
| SC4  | Реальный полигон, конечная парная серия и итоговый review                  | Честный результат baseline/candidate, функциональность и границы целы; performance измерен; cleanup выполнен                 | Не начат                                                                |

Каждый этап передаётся на независимое ревью до начала следующего. Первый Draft PR создаётся
с SC1; последующие этапы не считаются уже одобренными. Merge и публикация этим планом не разрешены.
Работа закончена после четырёх этапов и итогового ревью; новой исследовательской серии автоматически нет.

## Контракт карты

- Структурные дети портала/скоупа, File Mapping модулей и точные write/delete targets тикетов
  собираются с происхождением. Произвольная ссылка или read-input не назначает владельца.
- Владелец — реализационная спека, не автоматически портал или Owning Spec чужого тикета.
  Конфликт деклараций/заголовков не исправляется молча.
- Authoring/preflight допускают pending ownership. Phase exit проверяет только обязательства
  выбранной фазы, audit — выбранное полное покрытие. Pending не выдаётся за завершённый coverage PASS.
- Новый target может временно расширить карту; к аудиту он должен быть в File Mapping.
- Планируемый отсутствующий файл, фактическое удаление и неожиданная пропажа различаются.
  Непрочитанный/небезопасный путь — ошибка, не пустая успешная карта.
- Удаление заголовка не убирает декларацию; прежний заголовок из Git — дополнительное доказательство,
  а не долговечный отдельный реестр.
- Карта не создаёт Verify evidence и не сужает произвольный typecheck/test. Гейты выполняются
  в области, которую умеет доказать проектный preset; фактическая область попадает в report.
- Standalone Verify остаётся независимым от SDD и без записи в тикеты. Attempt journal,
  семантика A13/D-4, read-only migration boundaries и npm lock сохраняются.

## Детерминированные проверки

Проверяем: пустой проект; тысячи незаявленных файлов; портал с двумя модулями; независимый read-input;
один write-target; отсутствие/дубликат/неразрешимый/чужой заголовок; два владельца; удаление заголовка;
отсутствующий future target; отсутствующий required target; явное удаление; пропажа без tombstone;
cycle/duplicate ID/битый child/path escape/unsafe path; неполный adapter input; устойчивый порядок
и отсутствие мутации входов. Фазовый PASS не должен означать project PASS.

SC1 проверяет контракт core, не прохождение действующего CLI. SC2/SC3 добавляют реальные CLI
контроли: правильный исходник проходит, удаление заголовка и поломка функции причинно дают FAIL.
Нельзя заменить настоящие команды fabricated receipts или одним совпадением строки запуска.

## Реальный полигон и производительность

Octavius: `/Users/k.lebedev/Developer/octavius`, исходная чистая ревизия
`2bb9a8039e5479634f8dfb5a6d234d0991278ace`; 4048 tracked paths, 3007 code files, tracked specs отсутствуют.
Исходный checkout не редактируется. Для SC4 — отдельные изолированные ветки/checkout от exact commit:
без SDD, только портал, модуль и задача. Сборочные артефакты/зависимости не дублируются;
read-only данные и общие зависимости не удаляются. Реальные случаи Александра добавляются после
получения точных входов и версии; они не считаются заранее воспроизведёнными.

SC1 измеряет отдельно сбор списка tracked paths и работу core над этими путями, без чтения
исходников Octavius и без LLM. Это не измерение установленного CLI. SC2/SC3 дополняют замером actual
CLI: cold/warm elapsed, CPU, peak RSS, metadata/source reads и bytes. Фазовый запрос не должен
читать все 3007 исходников; metadata собираются один раз за invocation, без per-file rescan.
Дополнительно масштабирование 1k/10k/50k деклараций; никаких случайных timing assertions в unit.
Числа и сравниваемые revisions сохраняются; ускорение не объявляется по одному шумному замеру.

## Конечная серия модели

Только после SC1–SC3 review и квалификации стенда: четыре случая, baseline/candidate,
**8 primary attempts, replacements=0**. Случаи: маленькая задача среди незаявленного кода;
большой File Mapping и маленькая фаза; чужой/удалённый заголовок; future/deleted/missing paths.
Baseline — main `b4e444164d217c13f880648fe0a6b9c9f0150775`, candidate — clean reviewed commit.
Только `llm-proxy/deepseek-v4-flash`; конфигурация, бюджет и oracle одинаковы. До запуска фиксируются
точные task/fixture hashes и ограничения. Отправка непубличных исходников Octavius во внешний
AI Proxy требует отдельного подтверждения; локальные инструменты/performance такого отправления не делают.

Каждая попытка сохраняет commands/results/diff, правила и Verify proof, required/лишние действия,
нарушения границ, terminal outcome, tokens/cache/tool calls/time и независимую оценку результата.
Не более одной bounded reflection на попытку; её расход учитывается отдельно. Budget/censored/error
не заменяются и не считаются экономией. До модели controls должны ловить missing header и broken source.
После каждой попытки: compact evidence → остановка собственных writers → cleanup временных путей,
shared dependencies остаются. Ошибка cleanup останавливает очередь.

Приёмка — задача может начать и закончить свою фазу без массовой разметки проекта, а неправильное
владение и сломанная функциональность действительно блокируются. Общий выигрыш модели может остаться
не доказанным; это не повод бесконечно повторять серию. Итог: принять механические изменения либо
отклонить конкретную часть с причиной, результаты сохранить и закончить.

## Результаты этапов

SC1: контракт и pure-core реализованы; 18/18 unit/no-model controls PASS, TypeScript PASS.
Существующий orient adapter воспроизводит отказ без `@spec`; это ещё не исправление CLI.
Фаза core допускает pending подготовку, требует заголовок на выходе, не требует разметки
постороннего исходника. Temp fixture удалена в finally. Live calls: 0/8.

Read-only Octavius benchmark сохранён в
[SC1 results](../results/2026-10-27-sdd-coverage-sc1/README.md). Первые два результата показывают
реальный дефект кандидата: буквальный route path с квадратными скобками ошибочно отклонялся.
Добавлен negative/positive control; common path adapter не ослаблен, SC2 обязан доказать безопасное
различие literal path и pattern при работе с такими реальными файлами. Прежние результаты не менялись.
Финальная проекция 3007 деклараций/одного наблюдения: median1.25ms; synthetic1k/10k/50k —
median1.68/14.54/77.73ms. Peak RSS342736KiB относится ко всему повторному 50k benchmark,
не к одному фазовому запросу. Actual installed CLI пока не измерен; общего выигрыша не заявляем.
Независимый review: Approve SC1; разрешён SC2, но не merge реквеста и не SC3.

SC2 добавляет явный read-only режим `orient --coverage` / `sdd-check --coverage` над одним
адаптером. Выбор: весь заявленный проект, `--spec <ID|path>` (включая `specs/README.md`) либо
`--task <ID|path> --phase <ID>`. `--stage` выбирает ownership-границу, не запускает фазу;
по умолчанию audit. Обычные `--all`/`--changed`, lifecycle dispatch/complete и директивы пока
не переключены — это SC3, после review SC2. Query не создаёт receipts и не означает Verify PASS.

Портал — структурная точка входа с зарезервированной query-идентичностью `PROJECT-PORTAL`,
не реализационный владелец. Дети берутся только из Scopes/Module Map membership, не из
произвольных ссылок/примеров/комментариев и dependency prose. File Mapping — явные
декларации списка «- `repo/path`: purpose»; примеры внутри fenced blocks/комментариев не входят в карту.
Реальная фаза без write targets имеет пустую ownership-проекцию; неизвестная фаза — ошибка.
Упорядоченные write/delete обязательства не смешиваются со всей историей одновременно.

SC2 не вставляет комментарии в JSON и другие неподдержанные header-форматы: они дают явный
`UNSUPPORTED_HEADER_FORMAT`, а не ложное доказательство владения. Решение представления таких
артефактов проверяется отдельно до lifecycle cutover SC3. Проекция не является переписью всех
незаявленных исходников; changed/header-positive наблюдения подключаются в SC3 без долговечного реестра.

SC2 controls: 32/32 (17 core + 1 сохранённый исходный brownfield control + 14 новых adapter/CLI).
TypeScript и targeted contract lint PASS. Полный eval-набор: 685/685 + shell7/7 при разрешённом
localhost; первый sandbox-прогон дал680/685 из-за пяти `listen EPERM`, тесты не менялись.
Реальные CLI входы orient/sdd-check дают одинаковый JSON;
без заголовка preflight разрешён как pending, strict ownership boundary возвращает exit 1, после
канонического заголовка — exit 0. Это тест query-диагностики, не закрытие настоящей фазы.
Git batch выявляет снятие/пропажу заголовка; literal-bracket path и прежний строгий default policy
покрыты. Metadata examples/comments и dependency links не становятся ownership declarations.

[SC2 performance](../results/2026-10-27-sdd-coverage-sc2/README.md): actual compiled CLI, 18 initial,
36 intermediate и36 final no-model процессов. Последний пересъём после исправления маршрута
`--coverage=true` (теперь exit2, а не fallback в обычный orient). Final warm median: no-SDD108.59ms,
portal97.95ms, real3007/phase167.15ms, synthetic1k/10k/50k155.61/140.39/217.81ms.
В фазе всегда один source-read, metadata один раз. First-process peak RSS150.05MiB при50k.
Все три серии сохранены отдельно; ускорение и монотонное время не заявлены на шумном host.
Все три собственные временные копии удалены, оригинал Octavius/общие зависимости не менялись.
Live calls: 0/8. До независимого Approve SC2 к SC3 не переходим; PR остаётся Draft.

Полный штатный commit-гейт: сначала остановил неотформатированные новые JSON-отчёты (исправлено
только whitespace, parsed-data SHA256 не менялись). Следующий unit-прогон остановился на30s
`test-topology.test.ts`, а не на coverage feature. Тот же файл отдельно21/21 за20.83s. Убрана
повторная подготовка одинаковых read-only topology/spawn probes внутри теста:21/21 за13.38s.
Возвращаются копии snapshot-результатов; mutation/failure probes остаются свежими. Ни один assertion,
deadline, concurrency или production-runner не ослаблен. Полный штатный гейт повторяется перед push.

### SC3 подготовка перед переключением

Reviewer подтвердил SC2 на `00631595`; замечание help закрывается явным «query, not a gate».
Единственный адаптер перенесён из CLI в `shared/sdd/coverage-repository.ts`, без дублирования.
JSON получает declaration-backed ownership и проверку JSON.parse, без комментариев; audit всё ещё
требует File Mapping. Отдельный негативный контроль запрещает применить такое представление к `.ts`.
Канонический shared parser читает только начальный заголовок, не `@spec` после кода.
Targeted controls: 36/36, включая help-контроль; type-check PASS. Это не доказательство
завершения настоящей фазы. После отмены пробного lifecycle-cutover прежние suites снова 187/187 PASS.

Пробное прямое подключение к lifecycle отклонено до коммита: 133/187 lifecycle controls PASS,
54 FAIL. У стендов есть минимальные тикеты без полного ownership-контекста; кроме того, адаптер
SC2 требует явный Owning Spec, тогда как действующий V2 audit-group также использует точную
filename-привязку `<name>.task.<ID>.md → <name>.spec.md`. В реальном дереве `00631595`
узкий адаптер дал 128 INVALID_TASK, 73 INVALID_MAPPING, 3 INVALID_PATH и один
HEADER_OWNER_CONFLICT; ещё 47 PLANNED_FILE — pending, не ошибка. Это диагностика совместимости
адаптера с действующими декларациями, не 252 доказанных дефекта исходников.

Эвристический выбор source-root по первому ASCII-дереву также отклонён: он не является достаточным
доказательством repo-relative пути. Production lifecycle, обычные --all/--changed и Verify оставлены
без изменения; неудачные пробы не выдаются за принятый cutover. Архивы, baseline и запреты не менялись.

На момент preparatory-коммита оставалось внутри SC3: квалифицировать точную V2 filename-привязку и существующие формы File Mapping;
закрыть безопасное чтение changed/header-positive evidence; обновить стенды до реальных метаданных;
затем подключить dispatch/Verify/complete/close/audit, включая повторную проверку после repair и
позднее удаление target. Нужны причинные реальные CLI PASS/FAIL, JSON и масштабирование. Только
после отдельного Approve SC3 разрешён SC4; live остаётся 0/8, PR остаётся Draft.

### SC3 независимая перепроверка findings

Независимые проверки core, метаданных и read-boundary подтвердили реальные ошибки резолвера и
адаптера. Прежнее описание «несовместимость форматов» было неполным. Исправления покрыты причинными
RED→GREEN контролями; данные прошлых кампаний, baseline и правила eradication-аудита не менялись.

| Finding                                    | Вывод и исправление                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Отсутствует Owning Spec                    | Реальный баг адаптера. Используется та же pure filename-привязка, что у audit-group. Явное поле проверяется на точное совпадение, не заменяется Scope/произвольными Spec References.                                                                                                                                                 |
| Inline Target Files / no-write placeholder | Реальный баг молчаливого пропуска. Однозначные inline/nested paths и пояснения читаются; известная no-write метка даёт ноль обязанностей. Directory/conditional-remove prose даёт INVALID_PHASE, а не пустой PASS или расширенные полномочия.                                                                                        |
| Foreign targets / previous headers         | Реальные scope/ownership-баги core. Один scoped targetMap применяется во всех циклах; prior header больше не становится текущим владельцем.                                                                                                                                                                                          |
| Нерелевантный child / неизвестный owner    | Phase не обходит чужое поддерево; project/spec аудит его по-прежнему видит. Неизвестный write/delete owner даёт один адресный UNRESOLVED_SPEC.                                                                                                                                                                                       |
| Declared reserved paths / Git batch        | Реальная недоговорённость read-boundary. Шесть reserved segments теперь явно запрещены reader-контрактом; исключённые/unsafe/unsupported paths не читаются ни из worktree, ни через Git. Safe missing сохраняет prior evidence.                                                                                                      |
| Пустая read-only фаза                      | Не баг: отсутствие write-обязанностей, не Verify PASS. Добавлен лёгкий позитивный unit для phaseContexts.                                                                                                                                                                                                                            |
| JSDoc / interleaved comment                | Blanket-разрешение JSDoc нарушило бы действующую защиту от prose examples. Общий migration parser не менялся. Обычный license-комментарий поддержан; declaration JSDoc (включая leading /\*_ @license _/) остаётся консервативно неподдержанным. Interleaved line-comment не теряет @spec — исходная формулировка не воспроизвелась. |

Повторный независимый просмотр нашёл ещё два дефекта: whole-line HTML masking мог скрыть явный
чужой/повторный Owning Spec; missing unsupported artifact обходил format-policy через Git prior.
Оба исправлены. HTML masking сохраняет видимые prefix/suffix и не теряет File Mapping с inline
комментариями. Узкие новые контроли сначала 0/3, после исправления зелёные. Повторные независимые
вердикты corrective-части: Approve; это не Approve полного SC3.

Targeted suite: 126/126 (core + adapter + brownfield + canonical ticket/audit-group/header parser).
Отдельные новые RED: core 5 отказов; adapter 6 отказов; повторный атакующий проход 3 отказа.
Закрыты gaps WRITE_DELETE_CONFLICT, phaseContexts, unknown write/delete owner, INVALID_SPEC и
header-only MAPPING_REQUIRED. На реальных телах AI-fasttest/AI-cutover: no-write распознан, а
условные удаления/директории честно отвергаются; исторические тикеты не редактировались.

До завершения SC3 остаются квалификация прочих File Mapping форм, changed/header-positive discovery
и реальное подключение stage-aware dispatch/Verify/complete/close/audit с причинными CLI-контролями
и performance. Основной runtime, универсальный Verify и охранные границы не переключались этой
коррекцией. SC4 не запущен (0/8), PR остаётся Draft, merge/npm publication не разрешены.

### SC3 lifecycle — реализация и квалификация 2026-10-28

После Approve corrective `82e031cc` карта подключена к dispatch (preflight), facade Verify
(preflight и повторный phase-exit под lease после repair), complete, close и положительному
group audit receipt. Это текущие локальные изменения, не уже одобренный следующий этап.
Standalone Verify не читает SDD, реальные проектные гейты не сужаются по карте.

- Один канонический parser Target/Deleted Files используется runtime и reader; inline и nested
  формы не расходятся. Directory/условное `remove` prose по-прежнему не становятся authority.
- File Mapping поддерживает точные repo-relative colon/dash bullets и таблицы с явной колонкой
  File/Path. Source-root по ASCII-дереву не угадывается. Уникальный реализационный mapping имеет
  приоритет перед структурным владельцем тикета; конфликт не исправляется автоматически.
- Обычные `--all`/`--changed` проверяют coherence заявленных/header-positive исходников, не требуют
  массово размечать остальной код и явно говорят, что полный ownership audit не выполнялся.
  `--all --authoring` допускает новый pending заголовок; снятый/чужой остаётся ошибкой.
- JSON проверяется синтаксически без комментариев. Поддержанный закрытый набор не-source артефактов
  (Markdown/markup/config/style и перечисленные ignore-файлы) подтверждается точной декларацией и
  безопасным существованием без чтения содержимого или Git blob. Неизвестный формат не получает PASS.
- Close ограничен финальными выходами своего тикета; будущие outputs других тикетов проверяет
  group audit. Существующий output DONE-тикета не исчезает из membership: отсутствие File Mapping
  по-прежнему блокирует audit. Старые отсутствующие outputs не возвращаются как новые write duties.
- Текущий tracked delete-target может существовать при dispatch, но обязан отсутствовать перед
  Verify. Более позднее объявленное удаление не должно делать предыдущий attempt stale; прочие
  изменения остаются identity-bearing. Literal bracket paths не являются glob.

Причинный backend/CLI контроль проходит настоящие команды: 100 незаявленных файлов не мешают
начать фазу; gate PASS без заголовка даёт phase VIOLATION; поломка функции даёт реальный gate FAIL;
repair, снявший заголовок, также блокируется. После восстановления проходят Verify→complete→close.
Будущий output не блокирует close, но блокирует положительный group audit; удаление File Mapping
после DONE также блокирует audit. Первоначальный импорт self-executing CLI ошибочно завершал
test-файл до assertions: стенд исправлен на subprocess, доказательством считаются только два
реально зарегистрированных и исполненных brownfield subtests, не ранний суммарный счётчик.

Первая полная offline-серия дала 680/686: выявлены host-фикстуры без canonical Spec-ID и лишнее
новое глобальное предупреждение по историческим планам. Host-фикстуры приведены к V2-контракту,
глобальное planner-warning убрано из coherence (strict selected audit сохранён). Frozen/raw
corpora не менялись; отдельный повтор frozen acceptance — 9/9. Финальный полный повтор, performance
и штатные commit-гейты ещё ожидаются; live SC4 остаётся 0/8. Общий выигрыш модели не заявляется.

Проверка собранного runtime затем выявила дополнительные host-пробелы, скрытые старым `dist`:
reference-controls не декларировали единственный сценарный test-file в File Mapping, а mutable
slugify harness записывал реализацию и тест без canonical `@spec`. Исправлена только подготовка
текущих host-контролей; frozen fixture inputs, 16 старых попыток и их verdict не менялись.
Отдельная qualification execution-autonomy audit+fixture после исправления — 9/9.
Промежуточный параллельный build сломал одну копию dist (entry/chunk mismatch); это ошибка порядка
проверки, не feature PASS/FAIL. Дальнейшие повторы выполняются только на неподвижном bundle.

Zero-new-error впервые честно выявил восемь declaration/header расхождений существующего проекта:
четыре update-check заголовка ещё ссылались на CLI вместо CLI-UPDATE-CHECK; shared sync dependencies
были ошибочно перечислены как ownership sync-skills; module-local `index.ts` в agent-run принимался
за root entrypoint. Исправлены точные заголовки/декларации: shared-файлы принадлежат SHARED,
agent-run paths явно repo-relative, composition root остаётся у AGENT-RUN-OPENCODE.
Повтор `gate:sdd-check-baseline` — PASS без изменения baseline/архивов/guard policy.

SC3 actual CLI performance: 36 no-model процессов; 3007 real declarations / one phase —
median129.36ms, один source-read; 50k declarations — median226.85ms, один source-read.
Собственная shared-копия удалена (`safeCleanup=true`), оригинал Octavius и общие зависимости целы.
Это квалификация bounded I/O, не доказательство ускорения модели и не реализация частных кейсов Александра.

Финальный повтор на неподвижном bundle: **686/686 + shell7/7 PASS**, TypeScript PASS,
targeted production contract lint PASS, journal27/27 (включая позднее literal-bracket deletion),
audit/fixture9/9 и harness23/23. Не складываем пересекающиеся suites в новый «общий» счётчик.
Расширенный `lint --include-tests` дополнительно показал 12 старых thin-region замечаний в
update-check tests (функционально изменён только owner header); не выдаём этот дополнительный
эксперимент за PASS и не удаляем assertions/anchors ради него. Штатная lint-политика не изменена.

Финальная source/hash-bound performance-серия после formatting/contracts сохранена отдельно
(`cli-performance-final.json`): median117.51ms для3007/phase и222.23ms для50k, один source-read;
первоначальные129.36/226.85ms не перезаписаны. В сумме72 no-model процесса, оба cleanup=true.
Время относится к read-only query, не к полному Verify/работе модели. Перед отправкой выполняется
обычный commit/push pipeline без bypass; его фактический результат и SHA передаются reviewer.
Следующее разрешённое действие после отправки — независимый **SC3 review**, не merge и не SC4.

Первый штатный pre-commit был RED на local unit-подмножестве: прежние black-box bootstrap/dispatch/
repair стенды не содержали canonical Spec-ID и phase-output headers. Стенды обновлены явно, без
универсальной авто-разметки/обхода production checks. Дополнительно bootstrap воспроизвёл реальный
пробел форматов: `.nvmrc`/`.npmrc` теперь declaration/stat-only (содержимое, включая возможные npm
credentials, не читается и не выводится). Позитивный adapter control утверждает sourceReads=0 и
priorBytes=0. `.env`/unknown formats не разрешены; source-extension registry не расширен.
Полный штатный гейт повторяется; первый RED не считается успешным коммитом.

Следующий полный `npm test` исполнил5172:5161 passed,3 failed,8 skipped. Все три оставшихся отказа
были статическими контрактами старых instruction calls (`orient --file` / grammar без --coverage /
scaffold --all без --authoring). Контракты синхронизированы с действительным CLI; добавлен позитивный
и негативный контроль coverage grammar (mixed selectors/output, duplicate flags, invalid stage).
Узкий повтор core-consumers/Action-schema/coverage adapter — **84/84 PASS**. Негативы не удалены.

Окончательная performance-квалификация после bootstrap поправки — `cli-performance-lifecycle.json`:
real3007/phase103.44ms,50k267.19ms, один source-read. Список sourceHashes включает shared ticket
parser, source-format policy и header parser. Все три серии сохранены (108 процессов,0 model calls,
cleanup=true); различие noisy timing не объявляется выигрышем. Последний полный commit pipeline
остаётся обязательным перед отправкой; его итог — в reviewer handoff.
