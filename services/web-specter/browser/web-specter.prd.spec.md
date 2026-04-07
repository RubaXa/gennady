# WS-001: web-specter

Этот PRD задаёт исполнимую спецификацию `services/web-specter` и минимальной CLI-обвязки `gennady web-specter`.
Документ намеренно language-agnostic: публичные контракты описаны через назначение, поля, инварианты и side effects, а не через синтаксис конкретного языка.

---

## PRIMARY GOAL

Запустить управляемую browser debug session и без ручного копирования отдать разработчику или AI-агенту живой browser log, который сохраняет auth-related state между запусками и достаточно точен для последующей трассировки и сравнения расхождений.

---

## CONSUMERS

| Consumer                             | Type     | Relationship                                                                                                                         |
| ------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Разработчик                          | external | Запускает `gennady web-specter --url=...`, воспроизводит проблему и сразу получает читаемый browser log без ручного копирования.    |
| AI-диагностический агент             | external | Потребляет live stdout log или file log, чтобы восстановить ход браузерного сценария и найти место расхождения.                    |
| CLI-команда `web-specter`            | internal | Использует `WebSpecterService` как ядро, рендерит snapshot events в текст и доставляет их в stdout или файл.                        |
| `WebSpecterService`                  | internal | Координирует browser resolution, managed profile, browser runtime, event projection, filter pipeline и lifecycle session.           |
| `WebSpecterBrowserLocator`           | internal | Находит подходящий Chrome-family browser по fixed resolution policy или возвращает понятную startup error.                          |
| `WebSpecterProfileStore`             | internal | Даёт сервису путь к одному managed debug profile и обеспечивает reuse auth-related state между сессиями.                            |
| `WebSpecterBrowserRuntime`           | internal | Запускает Chrome, делает clean session start, отслеживает root tab и все session tabs, поставляет browser-originated events.       |
| `WebSpecterEventProjector`           | internal | Превращает live browser payload в immutable snapshot events, пригодные для фильтрации, рендера и последующего сравнения.           |
| `WebSpecterFilterPipeline`           | internal | Убирает шум из snapshot events до передачи потребителю.                                                                              |
| `WebSpecterTextRenderer`             | internal | Преобразует snapshot event в flat log line с `[tab:<id>]`, пригодную для чтения человеком и AI-агентом.                            |
| Stdout или file sink CLI-команды     | external | Получает итоговые строки лога в порядке наблюдения.                                                                                  |

---

## DEV AGENT INSTRUCTIONS

- `Coding rules`: `.ai/agents/agent-typescript-devgen.xml` (репозиторный default, так как оператор не переопределил путь при финализации).
- `QA code rules`: `.ai/agents/agent-qa-code.rules.xml`.
- `LDD rules`: `services/logger/ldd/ldd.prd.spec.md`.
- `Execution log`: `services/web-specter/web-specter.prd.log.md`.
- `Test spec`: `services/web-specter/web-specter.tests.spec.md`.

---

## FILE STRUCTURE

### `services/web-specter/`

- `web-specter.ts`
  - Purpose: public entrypoint домена `web-specter`; здесь живут public contracts и exports.
- `web-specter-service.ts`
  - Purpose: orchestration entrypoint, который запускает session runtime, связывает internal components и fail-fast завершает startup path при ошибке до создания session.
- `web-specter-browser-locator.ts`
  - Purpose: resolve browser executable по fixed resolution policy.
- `web-specter-profile-store.ts`
  - Purpose: управлять одним managed persistent debug profile.
- `web-specter-browser-runtime.ts`
  - Purpose: запускать Chrome, делать clean session start и отслеживать lifecycle page tabs.
- `web-specter-event-projector.ts`
  - Purpose: snapshot browser payload в immutable `WebSpecterEvent`.
- `web-specter-filter.ts`
  - Purpose: filter pipeline и regex helper builders.

### `cli/cmd/web-specter/`

- `index.ts`
  - Purpose: entrypoint CLI-команды.
- `web-specter.cmd.ts`
  - Purpose: разобрать CLI args, стартовать `WebSpecterService`, подписаться на session events.
- `web-specter-render.ts`
  - Purpose: рендерить startup diagnostics и snapshot events в нормализованные flat log lines и доставлять их в stdout или файл.

### Existing files to update

- `cli/gennady.ts`
  - Purpose: зарегистрировать команду `web-specter`.
- `cli/AGENTS.md`
  - Purpose: зафиксировать новую CLI-команду и её назначение.

### Tests

- `services/web-specter/__tests__/`
  - Purpose: сервисные и session-level тесты.
- `cli/cmd/web-specter/__tests__/`
  - Purpose: CLI rendering and delivery tests.

---

## STRUCTURE OF CHANGES

### Component `services/web-specter/web-specter.ts`

Purpose:

- экспортировать весь public API домена `web-specter`;
- держать public data contracts в одном месте;
- не заставлять потребителя импортировать internal runtime files напрямую.

consumer: CLI-команда `web-specter` и другие будущие диагностические инструменты.

#### Data Contract `WebSpecterInitConfig`

- Purpose:
  - определить поведение service instance, которое общее для всех последующих session запусков.
- Fields:
  - `browserExecutablePath`
    - Purpose: optional explicit executable path, который принудительно задаёт конкретный browser binary.
  - `browserChannel`
    - Purpose: optional browser channel hint, используемый только если `browserExecutablePath` не задан.
  - `profileStorePath`
    - Purpose: optional directory path, где должен жить managed debug profile.
  - `defaultFilters`
    - Purpose: default filter set, автоматически применяемый ко всем сессиям, если session config не переопределяет его.
- Preconditions:
  - если `browserExecutablePath` задан, путь обязан указывать на запускаемый browser executable.
  - если `browserChannel` задан, он обязан быть одним из поддерживаемых Chrome-family channels first slice.
- Postconditions:
  - init config применяется ко всем будущим `startSession` вызовам этого instance.
- Invariants:
  - browser resolution order фиксирован как `explicit executable path -> explicit channel -> autodetect supported installed browser -> startup error`.
  - first slice не требует обязательного ручного пути до браузера в типовом случае.
  - один service instance не может держать более одной active session одновременно.

#### Data Contract `WebSpecterStartConfig`

- Purpose:
  - определить поведение конкретной debug session.
- Fields:
  - `url`
    - Purpose: абсолютный URL, который должен быть открыт в root tab в начале сессии.
  - `filters`
    - Purpose: session-specific filters, которые уточняют или переопределяют default filtering policy.
- Preconditions:
  - `url` обязан быть корректным абсолютным URL.
- Postconditions:
  - config применяется только к запускаемой сессии.
  - отсутствие session-specific filters означает использование `defaultFilters` service instance.
- Invariants:
  - first slice не выставляет cleanup mode как публично настраиваемую опцию.
  - first slice всегда делает один и тот же cleanup: очищает только HTTP/browser network cache перед открытием root tab.

#### Data Contract `WebSpecterStartupDiagnosticEntry`

- Purpose:
  - описать один machine-readable шаг startup lifecycle, который CLI может превратить в нормализованную startup log line даже если session не была создана.
- Fields:
  - `phase`
    - Purpose: startup phase marker, например `browser-resolution`, `browser-selected`, `profile-ready`, `browser-launch`, `root-tab-open`.
  - `status`
    - Purpose: outcome marker для этой фазы.
  - `strategy`
    - Purpose: strategy hint для browser resolution, если шаг относится к поиску браузера, например `explicit-executable`, `explicit-channel`, `autodetect`.
  - `path`
    - Purpose: filesystem path до browser executable или managed profile, если он известен на этом шаге.
  - `channel`
    - Purpose: browser channel, если выбор делался по каналу.
  - `reason`
    - Purpose: краткое текстовое объяснение результата или ошибки.
- Preconditions:
  - `phase` и `status` обязаны быть заполнены у каждого startup diagnostic entry.
- Postconditions:
  - entry самодостаточен для text rendering одной startup log line.
- Invariants:
  - startup diagnostics ordered и отражают реальный порядок шагов запуска;
  - entry не зависит от существования `WebSpecterSession`;
  - `status` обязан быть одним из фиксированных значений `attempt`, `selected`, `ready`, `failed`.

#### Data Contract `WebSpecterStartupFailure`

- Purpose:
  - быть fail-fast startup error contract для случаев, когда browser executable не удалось разрешить, browser process не удалось запустить или root tab не удалось открыть.
- Fields:
  - `phase`
    - Purpose: startup phase, на которой произошёл terminal failure.
  - `message`
    - Purpose: человекочитаемое объяснение ошибки.
  - `diagnostics`
    - Purpose: ordered список `WebSpecterStartupDiagnosticEntry`, накопленный до момента падения.
  - `causeMessage`
    - Purpose: краткое описание исходной низкоуровневой причины, если она доступна.
- Preconditions:
  - error создаётся только для startup path до создания `WebSpecterSession`.
- Postconditions:
  - caller получает достаточно данных, чтобы залогировать весь startup path и завершить процесс без создания полуживой session.
- Invariants:
  - `WebSpecterStartupFailure` не превращается в `WebSpecterSessionResult`;
  - startup failure исключает создание session object.

#### Data Contract `WebSpecterFilterSet`

- Purpose:
  - сгруппировать filter predicates по семействам событий без жёсткой привязки к CLI или browser runtime internals.
- Fields:
  - `any`
    - Purpose: predicates, которые применяются ко всем snapshot events.
  - `console`
    - Purpose: predicates для console events.
  - `network`
    - Purpose: predicates для `request`, `response`, `requestfailed`.
  - `frame`
    - Purpose: predicates для frame lifecycle events.
  - `tab`
    - Purpose: predicates для `popup` и `page.close`.
- Preconditions:
  - каждый predicate обязан возвращать boolean decision, где `true` означает `event passes further`, а `false` означает `event is dropped`.
- Postconditions:
  - predicates применяются в deterministic order: сначала `any`, затем family-specific filters.
- Invariants:
  - фильтрация идёт по snapshot event fields, а не по live browser objects.
  - filter pipeline не зависит от text rendering stage.

#### Data Contract `WebSpecterEvent`

- Purpose:
  - быть единым transport-neutral snapshot одной browser активности, пригодным для text rendering и программного diff.
- Common fields:
  - `kind`
    - Purpose: semantic class события.
  - `time`
    - Purpose: machine-sortable timestamp для стабилизации порядка событий.
  - `datetime`
    - Purpose: человекочитаемая временная отметка для текстового лога.
  - `tabId`
    - Purpose: идентифицировать вкладку или окно, которому принадлежит событие.
  - `openerTabId`
    - Purpose: идентифицировать вкладку-источник текущего tab lineage; для root tab значение обязано быть `null`.
  - `pageId`
    - Purpose: идентифицировать page source внутри session runtime даже при совпадающих URL.
  - `frameId`
    - Purpose: идентифицировать frame, если событие относится к frame lifecycle или network request внутри frame.
  - `url`
    - Purpose: relevant URL события, если он обязателен или полезен для этого event kind.
  - `text`
    - Purpose: готовый flat payload для console-like событий.
  - `level`
    - Purpose: console severity.
  - `method`
    - Purpose: HTTP method для request-related событий.
  - `resourceType`
    - Purpose: browser resource type, например `document`, `fetch`, `xhr`.
  - `status`
    - Purpose: HTTP status для response events.
  - `failureText`
    - Purpose: причина сетевого сбоя для requestfailed events.
  - `parentFrameId`
    - Purpose: связать frame с его родителем.
- Preconditions:
  - common fields `kind`, `time`, `datetime`, `tabId`, `openerTabId`, `pageId` обязаны присутствовать у каждого emitted event.
- Postconditions:
  - event самодостаточен для text rendering без повторного обращения к browser runtime.
- Invariants:
  - event immutable после emission.
  - event описывает ровно один semantic occurrence.
  - event не содержит live Puppeteer objects или иные runtime handles.
  - `time` всегда сериализуется как integer epoch milliseconds in UTC.
  - `datetime` всегда сериализуется как ISO-8601 UTC string с суффиксом `Z`.

##### Event Kind Matrix

Все event kinds обязаны содержать common fields `kind`, `time`, `datetime`, `tabId`, `openerTabId`, `pageId`.

| Kind             | Required fields beyond common     | Optional fields             | Purpose                                                                 |
| ---------------- | --------------------------------- | --------------------------- | ----------------------------------------------------------------------- |
| `console`        | `level`, `text`                   | `url`, `frameId`            | Передать browser console message в flat, читаемом для AI формате.       |
| `request`        | `url`, `method`, `resourceType`   | `frameId`                   | Показать исходящий browser request.                                     |
| `response`       | `url`, `status`, `resourceType`   | `frameId`                   | Показать результат request, достаточный для трассировки network flow.   |
| `requestfailed`  | `url`, `resourceType`, `failureText` | `method`, `frameId`       | Показать сбой network request.                                          |
| `frameattached`  | `frameId`                         | `parentFrameId`, `url`      | Показать появление нового frame.                                        |
| `framenavigated` | `frameId`, `url`                  | `parentFrameId`             | Показать смену frame URL.                                               |
| `framedetached`  | `frameId`                         | `parentFrameId`, `url`      | Показать удаление frame из дерева.                                      |
| `popup`          | none                              | `url`                       | Показать создание нового session tab/window.                            |
| `page.close`     | none                              | `url`                       | Показать закрытие tracked tab/window.                                   |

#### Data Contract `WebSpecterSessionResult`

- Purpose:
  - дать terminal summary сессии после закрытия event stream.
- Fields:
  - `startedAt`
    - Purpose: wall-clock time начала session.
  - `endedAt`
    - Purpose: wall-clock time завершения session.
  - `eventCount`
    - Purpose: количество событий, прошедших filter pipeline и реально отданных потребителю.
  - `tabCount`
    - Purpose: количество tabs/windows, вошедших в данную сессию.
  - `endReason`
    - Purpose: объяснить, почему уже созданная сессия завершилась, например `all-tabs-closed`, `stop-requested`, `browser-crashed`.
- Preconditions:
  - result запрашивается только после terminal state либо через API, которое само дожидается terminal state.
- Postconditions:
  - result стабилен и не меняется задним числом.
- Invariants:
  - summary не заменяет event log и не теряет причинную структуру trace.

#### Public Class `WebSpecterService`

- Purpose:
  - быть единственной public entrypoint домена `web-specter`.
- Inputs:
  - `initConfig: WebSpecterInitConfig` — общая конфигурация browser resolution, managed profile и default filters.
- Outputs:
  - service instance, готовый запускать debug sessions.
- Preconditions:
  - init config валиден для локальной среды выполнения.
- Postconditions:
  - создание instance само по себе не запускает browser process.
- Invariants:
  - service instance не держит активную session до вызова `startSession`.
- Side effects:
  - отсутствуют на этапе создания instance.

##### `WebSpecterService.startSession(config: WebSpecterStartConfig): WebSpecterSession`

- Purpose:
  - запустить новую browser-backed diagnostic session.
- Inputs:
  - `config: WebSpecterStartConfig` — описание начального URL и session-specific filters.
- Outputs:
  - `WebSpecterSession` — active session contract с live event stream и terminal result.
- Preconditions:
  - managed debug profile существует или может быть создан.
  - browser executable может быть разрешён по fixed resolution policy.
  - у данного service instance нет другой active session в момент вызова.
- Postconditions:
  - найден browser executable по fixed resolution policy;
  - запущен отдельный browser process с managed debug profile;
  - выполнен clean session start без восстановления старых tabs;
  - очищен только HTTP/browser network cache;
  - открыт root tab по `config.url`;
  - started session начинает эмитить live snapshot events.
- Errors or special control flow:
  - если startup path не может успешно завершиться до создания активной session, метод обязан завершиться `WebSpecterStartupFailure`;
  - в этом случае `WebSpecterSession` не создаётся вообще;
  - caller получает ordered startup diagnostics через `WebSpecterStartupFailure.diagnostics`;
  - если у service instance уже есть active session, метод обязан завершиться явной ошибкой конкуренции и не запускать второй browser process.
- Invariants:
  - first slice не attach’ится к живому обычному Chrome пользователя;
  - first slice использует один persistent managed debug profile;
  - first slice не буферизует весь trace до завершения сессии перед отдачей потребителю;
  - first slice не сериализует несколько session запусков внутри одного service instance автоматически.
- Side effects:
  - создаёт или открывает managed profile;
  - запускает внешний browser process;
  - инициирует browser network activity.

#### Public Interface `WebSpecterSession`

- Purpose:
  - представить активную session как live stream событий и terminal lifecycle.
- Fields:
  - `events`
    - Purpose: async iterator or equivalent live stream, который отдаёт `WebSpecterEvent` по мере наблюдения после projection и filtering.
  - `done`
    - Purpose: future/promise terminal state, разрешающийся в `WebSpecterSessionResult`.
- Preconditions:
  - session создаётся только через успешный `WebSpecterService.startSession`.
- Postconditions:
  - после создания session event stream начинает отдавать события без ожидания terminal state.
- Invariants:
  - каждое событие отдаётся не более одного раза;
  - порядок событий соответствует порядку наблюдения после projection и filtering;
  - после terminal state новых событий больше нет.
- Side effects:
  - отсутствуют у самого контракта; side effects принадлежат browser runtime и `stop()` path.

##### `WebSpecterSession.stop(): void | Promise<void>`

- Purpose:
  - принудительно завершить session раньше естественного закрытия всех tracked tabs.
- Inputs:
  - отсутствуют.
- Outputs:
  - completion signal без полезного payload.
- Preconditions:
  - repeated calls допустимы.
- Postconditions:
  - browser process корректно закрывается либо переводится в terminal shutdown path;
  - `done` становится resolveable.
- Invariants:
  - `stop()` идемпотентен.
- Side effects:
  - завершает browser runtime и закрывает event stream.

##### `WebSpecterSession.result(): WebSpecterSessionResult | Promise<WebSpecterSessionResult>`

- Purpose:
  - вернуть terminal summary сессии.
- Inputs:
  - отсутствуют.
- Outputs:
  - `WebSpecterSessionResult`.
- Preconditions:
  - API само дожидается завершения, если session ещё не закрыта.
- Postconditions:
  - повторные вызовы возвращают эквивалентный terminal result.
- Invariants:
  - result не открывает новый browser runtime и не меняет состояние сессии.
- Side effects:
  - отсутствуют.

#### Public Function `createRegexFilter`

- Purpose:
  - собрать filter predicate из массива `RegExp` без вынесения regex-matching logic в каждый call site.
- Inputs:
  - набор `RegExp`;
  - selector function, которая для конкретного event возвращает одно значение или список значений для сопоставления.
- Outputs:
  - filter predicate, совместимый с `WebSpecterFilterSet`.
- Preconditions:
  - selector не должен выбрасывать исключение на штатных полях события.
- Postconditions:
  - любой `RegExp` match приводит к `false`, то есть к подавлению события как шумового;
  - отсутствие match оставляет событие проходящим дальше по pipeline.
- Invariants:
  - helper работает только по snapshot event data;
  - helper не знает о CLI, file sinks или browser runtime handles.
- Side effects:
  - отсутствуют.

### Component `services/web-specter/web-specter-browser-locator.ts`

Purpose:

- найти запускаемый Chrome-family browser для first slice без обязательного ручного пути в типовом случае.

consumer: `WebSpecterService`.

Responsibilities:

- принять explicit executable path, если он задан;
- иначе принять explicit browser channel, если он задан;
- иначе попытаться autodetect supported installed browser;
- если ничего не найдено, вернуть понятную startup error с описанием способов override.

Invariants:

- resolution order фиксирован и не зависит от CLI rendering concerns;
- explicit executable override имеет приоритет над autodetect.

### Component `services/web-specter/web-specter-profile-store.ts`

Purpose:

- хранить и подготавливать один managed persistent debug profile;
- отделить reusable auth-related browser state от обычного Chrome пользователя;
- исключить случайное использование default Chrome profile как supported foundation.

consumer: `WebSpecterService`.

Responsibilities:

- создать managed profile при первом запуске;
- возвращать canonical path профиля при следующих запусках;
- обеспечивать reuse cookies, localStorage, IndexedDB и аналогичного auth-related state между сессиями;
- не удалять auth-related state при штатном session startup cleanup.

Invariants:

- first slice поддерживает ровно один managed profile;
- profile сохраняет auth-related state между сессиями;
- profile не считается disposable per-run artifact.

### Component `services/web-specter/web-specter-browser-runtime.ts`

Purpose:

- инкапсулировать запуск Chrome через `puppeteer-core`;
- делать clean session start;
- отслеживать lifecycle root tab и всех session tabs.

consumer: `WebSpecterService`.

Responsibilities:

- запустить Chrome с resolved browser executable и managed debug profile;
- применить startup behavior, исключающее восстановление старых tabs from previous browser session;
- перед открытием root tab очистить только HTTP/browser network cache;
- открыть root tab по `config.url`;
- отслеживать все `page` targets, созданные внутри browser process после старта session;
- эмитить terminal signal, когда tracked tab set становится пустым.

Invariants:

- first slice слушает только `page`-targets;
- non-page targets вроде service workers и extension pages не входят в event stream по умолчанию;
- tracked tabs получают стабильный `tabId` на время жизни session;
- чистый запуск не уничтожает persistent auth-related state.

### Component `services/web-specter/web-specter-event-projector.ts`

Purpose:

- превратить live browser payload в immutable `WebSpecterEvent`;
- снять только поля, нужные для logging, filtering и later diff;
- зафиксировать единый event schema first slice.

consumer: `WebSpecterService`, `WebSpecterFilterPipeline`, CLI-команда `web-specter`.

Responsibilities:

- snapshot console payload в flat text form;
- snapshot request/response/requestfailed payload;
- snapshot frame lifecycle payload;
- snapshot popup and page-close payload;
- присвоить `tabId`, `pageId`, `frameId` и timestamps;
- соблюдать `Event Kind Matrix` как часть public contract.

Invariants:

- projector не экспортирует live Puppeteer objects наружу;
- projector не делает file I/O и не знает про stdout/file delivery.

### Component `services/web-specter/web-specter-filter.ts`

Purpose:

- реализовать filter pipeline и helper builders для конфигурируемого suppression policy.

consumer: `WebSpecterService`, CLI-команда `web-specter`.

Responsibilities:

- применить `any` filters ко всем событиям;
- затем применить family-specific filters;
- отдать deterministic pass/drop decision;
- экспортировать `createRegexFilter` и минимальные sugar helpers first slice.

Invariants:

- filter pipeline работает только с snapshot events;
- filter pipeline не зависит от text rendering stage;
- отсутствие custom filters не ломает emission path.

### Component `cli/cmd/web-specter/`

Purpose:

- дать оператору входную точку `npx gennady web-specter --url=...`;
- использовать `WebSpecterService` как ядро;
- доставлять live text log либо в stdout, либо в файл.

consumer: разработчик и AI-оператор.

#### Public CLI Contract `gennady web-specter`

- Purpose:
  - запустить browser diagnostic session и вывести AI-first flat text log.
- Inputs:
  - `--url`
    - Purpose: обязательный root URL для старта session.
  - `--file`
    - Purpose: optional file path для записи итогового лога вместо stdout.
- Outputs:
  - live text log stream с префиксами `[tab:<id>]`;
  - terminal process exit status.
- Preconditions:
  - `--url` обязателен.
- Postconditions:
  - если `--file` не задан, команда пишет log lines в stdout по мере их поступления;
  - если `--file` задан, команда пишет те же строки в указанный файл в том же порядке;
  - если startup path завершился ошибкой до создания session, команда пишет startup diagnostic lines в тот же выбранный sink и завершает процесс non-zero;
  - при ошибке запуска process возвращает non-zero exit status и понятное error message.
- Invariants:
  - stdout является default delivery mode first slice;
  - file output является явным opt-in через `--file`;
  - команда не знает о Puppeteer internals больше, чем нужно для передачи service config и получения session events;
  - команда не решает, какие browser events слушать, она только настраивает и потребляет сервис;
  - startup failure не создаёт “полуживую” session и не переводится в `SessionResult`;
  - first slice поддерживает только один файловый флаг `--file`; альтернативные spellings и псевдонимы не являются частью контракта.
- Side effects:
  - пишет log lines в stdout или файл;
  - flush’ит каждую отрендеренную строку сразу после рендера, не дожидаясь завершения session;
  - завершает process после terminal state session и завершения pending output flush.

#### Public CLI File Sink Policy

- Purpose:
  - зафиксировать детальное поведение file-mode, чтобы разные реализации не расходились по записи, кодировке и ошибкам.
- Contract:
  - `--file <path>` включает file-mode и заменяет stdout как основной sink для startup diagnostics и session event lines.
  - если target file уже существует, first slice обязан открыть его в `truncate and rewrite` режиме, а не `append`.
  - output encoding обязана быть `UTF-8`.
  - если parent directory не существует, реализация обязана попытаться создать её перед открытием файла.
  - если parent directory или file path не могут быть созданы или открыты на запись, команда обязана завершиться non-zero fail-fast до session startup.
- Invariants:
  - file sink получает те же строки в том же порядке, что и stdout mode;
  - file sink policy не меняет core service contract и не влияет на event emission order.

#### Public CLI Log Line Contract

- Purpose:
  - зафиксировать нормализованный текстовый формат, чтобы разные реализации рендерили совместимый AI-first trace.
- Line families:
  - `startup diagnostic line`
    - Purpose: логировать startup lifecycle до появления `WebSpecterSession`.
    - Required prefix: `[startup:<phase>] [status:<status>]`
    - Optional ordered segments: `[strategy:<strategy>] [channel:<channel>] [path:<path>] [reason:<reason>]`
    - Invariants:
      - startup lines не используют `[tab:...]`, потому что session source ещё может не существовать;
      - startup lines идут в порядке накопления `WebSpecterStartupDiagnosticEntry`.
  - `session event line`
    - Purpose: логировать уже наблюдаемую browser activity.
    - Required prefix: `[tab:<tabId>] [opener:<null|id>] [<event-family.event-kind>]`
    - Ordered family-specific segments and payload:
      - `console`: `[tab:<tabId>] [opener:<null|id>] [console.<level>] <text>`
      - `request`: `[tab:<tabId>] [opener:<null|id>] [network.<resourceType>.request] [<method-lower>] <url>`
      - `response`: `[tab:<tabId>] [opener:<null|id>] [network.<resourceType>.response] [status:<status>] <url>`
      - `requestfailed`: `[tab:<tabId>] [opener:<null|id>] [network.<resourceType>.failed] [reason:<failureText>] <url>`
      - `frameattached`: `[tab:<tabId>] [opener:<null|id>] [frame.attached] [frame:<frameId>] [parent:<null|id>] <url?>`
      - `framenavigated`: `[tab:<tabId>] [opener:<null|id>] [frame.navigated] [frame:<frameId>] [parent:<null|id>] <url>`
      - `framedetached`: `[tab:<tabId>] [opener:<null|id>] [frame.detached] [frame:<frameId>] [parent:<null|id>] <url?>`
      - `popup`: `[tab:<tabId>] [opener:<null|id>] [tab.popup] <url?>`
      - `page.close`: `[tab:<tabId>] [opener:<null|id>] [tab.closed] <url?>`
- Invariants:
  - one rendered line represents one startup diagnostic entry or one emitted event;
  - segment order фиксирован и не меняется между sinks;
  - отсутствие optional значения рендерится как `null` только в тех сегментах, где это явно предусмотрено контрактом.

Required changes:

- добавить `cli/cmd/web-specter/index.ts`;
- добавить `cli/cmd/web-specter/web-specter.cmd.ts`;
- добавить `cli/cmd/web-specter/web-specter-render.ts`;
- зарегистрировать команду в `cli/gennady.ts`;
- обновить `cli/AGENTS.md`.

### Explicit Exclusions

Purpose:

- зафиксировать, что first slice сознательно не обещает.

consumer: dev-агент и будущий архитектор, чтобы не расширять объём скрытыми ожиданиями.

Exclusions:

- attach к живому обычному Chrome пользователя;
- поддержка нескольких managed profiles;
- Safari, Firefox и иной multi-browser support;
- capture пользовательских действий вроде click, input, scroll, focus;
- configurable cleanup modes beyond fixed first-slice HTTP/browser network cache clear;
- auto-generated file naming как default CLI behavior;
- наблюдение за non-page browser targets по умолчанию.

---

## WORKPLAN

### WS-01: Public Service Contract

- **purpose**: зафиксировать public API домена `web-specter`, startup failure contract, session contract и event schema в language-agnostic форме.
- **consumer**: CLI-команда `web-specter`, будущие сервисы-диагносты.
- **depends**: none.
- **tests**: [ws-tests-public-service-contract](web-specter.tests.spec.md#ws-tests-public-service-contract), [ws-tests-session-result-contract](web-specter.tests.spec.md#ws-tests-session-result-contract), [ws-tests-event-kind-required-fields](web-specter.tests.spec.md#ws-tests-event-kind-required-fields), [ws-tests-startup-failure-creates-no-session](web-specter.tests.spec.md#ws-tests-startup-failure-creates-no-session), [ws-tests-reject-second-active-session](web-specter.tests.spec.md#ws-tests-reject-second-active-session), [ws-tests-time-format-contract](web-specter.tests.spec.md#ws-tests-time-format-contract).

ТЗ:

- создать public entrypoint `services/web-specter/web-specter.ts`;
- экспортировать `WebSpecterService`, `WebSpecterInitConfig`, `WebSpecterStartConfig`, `WebSpecterFilterSet`, `WebSpecterEvent`, `WebSpecterSession`, `WebSpecterSessionResult`, `WebSpecterStartupDiagnosticEntry`, `WebSpecterStartupFailure`, `createRegexFilter`;
- не экспортировать internal runtime classes как часть public API;
- зафиксировать `Event Kind Matrix` как часть public contract.

Критерии приёмки:

- public contracts не протекают live Puppeteer objects наружу;
- все поля публичных data contracts имеют явно описанное назначение;
- event schema однозначен для каждого `kind`;
- startup failure contract однозначно описывает fail-fast path без создания session object;
- повторный `startSession` на active service instance имеет однозначный error contract.

### WS-02: Browser Resolution, Managed Profile And Clean Startup

- **purpose**: реализовать browser autodetection, managed debug profile и clean session start.
- **consumer**: `WebSpecterService`, разработчик, которому нужен persistent auth-related browser state без ручной настройки в типовом случае.
- **depends**: WS-01.
- **tests**: [ws-tests-browser-resolution-order](web-specter.tests.spec.md#ws-tests-browser-resolution-order), [ws-tests-start-managed-session](web-specter.tests.spec.md#ws-tests-start-managed-session), [ws-tests-clean-start-with-no-restored-tabs](web-specter.tests.spec.md#ws-tests-clean-start-with-no-restored-tabs), [ws-tests-preserve-auth-clear-http-cache-only](web-specter.tests.spec.md#ws-tests-preserve-auth-clear-http-cache-only), [ws-tests-cli-logs-startup-lifecycle](web-specter.tests.spec.md#ws-tests-cli-logs-startup-lifecycle), [ws-tests-startup-status-enum-is-fixed](web-specter.tests.spec.md#ws-tests-startup-status-enum-is-fixed).

ТЗ:

- создать `WebSpecterBrowserLocator` с fixed resolution order `explicit executable -> explicit channel -> autodetect -> startup error`;
- создать `WebSpecterProfileStore` для одного persistent managed profile;
- запускать Chrome через `puppeteer-core` с этим profile path;
- не восстанавливать старые tabs from previous session;
- перед открытием root tab очищать только HTTP/browser network cache;
- не уничтожать cookies, localStorage, IndexedDB и иное auth-related state.

Критерии приёмки:

- типовой запуск работает без обязательного ручного указания browser path;
- explicit override имеет приоритет над autodetect;
- clean startup не приводит к восстановлению старых tabs;
- cache cleanup не требует переавторизации сам по себе;
- startup path логируется диагностическими строками до первого session event или до fail-fast завершения;
- startup status vocabulary не дрейфует за пределы `attempt`, `selected`, `ready`, `failed`.

### WS-03: Snapshot Event Projection And Filtering

- **purpose**: превратить browser-originated payload в immutable snapshot events и дать конфигурируемую фильтрацию шума.
- **consumer**: CLI-команда `web-specter`, AI-диагностический агент.
- **depends**: WS-01, WS-02.
- **tests**: [ws-tests-project-console-and-network-events](web-specter.tests.spec.md#ws-tests-project-console-and-network-events), [ws-tests-event-kind-required-fields](web-specter.tests.spec.md#ws-tests-event-kind-required-fields), [ws-tests-filter-noise-with-regex-helper](web-specter.tests.spec.md#ws-tests-filter-noise-with-regex-helper).

ТЗ:

- проецировать first-slice events: `console`, `request`, `response`, `requestfailed`, `frameattached`, `framenavigated`, `framedetached`, `popup`, `page.close`;
- сериализовать console payload в flat text;
- соблюдать fixed `Event Kind Matrix`;
- фильтровать snapshot events через predicates и regex helper.

Критерии приёмки:

- события самодостаточны для text rendering;
- фильтрация работает до рендера строки;
- event shape не зависит от CLI implementation.

### WS-04: Session Lifecycle And Multi-Tab Trace

- **purpose**: зафиксировать live-stream semantics, учёт tabs/windows и завершение сессии.
- **consumer**: разработчик, CLI-команда `web-specter`, AI-диагностический агент.
- **depends**: WS-02, WS-03.
- **tests**: [ws-tests-track-session-tabs](web-specter.tests.spec.md#ws-tests-track-session-tabs), [ws-tests-end-when-last-tab-closes](web-specter.tests.spec.md#ws-tests-end-when-last-tab-closes).

ТЗ:

- считать частью session все `page` tabs/windows, созданные в нашем browser process после `startSession`;
- присваивать каждому tracked tab стабильный `tabId`;
- эмитить события live, а не только после завершения session;
- завершать session, когда tracked tab set стал пустым;
- поддержать принудительный `stop()`.

Критерии приёмки:

- interleaved multi-tab trace можно восстановить по `tabId`;
- закрытие одного tab не завершает session, если остаются другие tracked tabs;
- terminal result содержит `eventCount`, `tabCount` и `endReason`.

### WS-05: CLI Delivery And Text Rendering

- **purpose**: предоставить оператору команду `gennady web-specter` и live AI-first log delivery.
- **consumer**: разработчик и AI-оператор.
- **depends**: WS-01, WS-03, WS-04.
- **tests**: [ws-tests-cli-streams-to-stdout-by-default](web-specter.tests.spec.md#ws-tests-cli-streams-to-stdout-by-default), [ws-tests-cli-writes-file-when-file-is-set](web-specter.tests.spec.md#ws-tests-cli-writes-file-when-file-is-set), [ws-tests-cli-file-mode-truncates-and-uses-utf8](web-specter.tests.spec.md#ws-tests-cli-file-mode-truncates-and-uses-utf8), [ws-tests-cli-creates-parent-directories-for-file-mode](web-specter.tests.spec.md#ws-tests-cli-creates-parent-directories-for-file-mode), [ws-tests-cli-fails-fast-when-file-path-is-unwritable](web-specter.tests.spec.md#ws-tests-cli-fails-fast-when-file-path-is-unwritable), [ws-tests-cli-flushes-live-output](web-specter.tests.spec.md#ws-tests-cli-flushes-live-output), [ws-tests-cli-renders-normalized-log-line-format](web-specter.tests.spec.md#ws-tests-cli-renders-normalized-log-line-format), [ws-tests-cli-fails-fast-on-startup-error](web-specter.tests.spec.md#ws-tests-cli-fails-fast-on-startup-error).

ТЗ:

- добавить CLI-команду `web-specter` с обязательным `--url` и optional `--file`;
- рендерить события в flat text lines с `[tab:<id>]`;
- рендерить startup diagnostics в fixed `[startup:<phase>] ...` format;
- по умолчанию писать строки в stdout;
- при `--file` писать те же строки в файл в том же порядке;
- flush’ить каждую строку по мере рендера;
- в file-mode использовать `truncate and rewrite`, `UTF-8` и auto-create missing parent directories;
- при startup failure завершать процесс non-zero без создания session output tail;
- завершать command process после terminal state session и завершения pending output flush.

Критерии приёмки:

- команда доступна через `cli/gennady.ts` и отражена в `cli/AGENTS.md`;
- stdout является default mode;
- file output требует явного `--file`;
- текстовый лог читаем человеком и пригоден для AI-сравнения;
- log-line format нормализован и детерминирован для startup и session lines;
- file sink policy детерминирована и не допускает drift между реализациями.

---

## ACCEPTANCE CRITERIA

- [ ] Реализация запускает managed browser debug session и без ручного копирования отдаёт live browser log разработчику или AI-агенту.
- [ ] Persistent managed profile сохраняет auth-related state между сессиями и не использует default user Chrome profile как рабочую основу.
- [ ] Browser resolution policy фиксирована как `explicit executable -> explicit channel -> autodetect -> startup error`.
- [ ] Startup failure завершает запуск fail-fast до создания session object и отдаёт ordered startup diagnostics для логирования.
- [ ] Каждая новая session стартует cleanly, без восстановления старых tabs from previous browser session.
- [ ] Перед каждой сессией очищается только HTTP/browser network cache, не уничтожая cookies, localStorage, IndexedDB и иное auth-related state.
- [ ] Session stream покрывает first-slice события `console`, `request`, `response`, `requestfailed`, `frameattached`, `framenavigated`, `framedetached`, `popup`, `page.close`.
- [ ] Для каждого event kind соблюдается fixed schema из `Event Kind Matrix`.
- [ ] `time` сериализуется как epoch milliseconds integer, а `datetime` как ISO-8601 UTC string.
- [ ] Каждое emitted event содержит стабильный `tabId`, достаточный для восстановления multi-tab trace.
- [ ] Filter pipeline поддерживает predicates и regex-based helper без привязки к text rendering stage.
- [ ] Session events доставляются как live stream, а не как post-hoc buffered dump после завершения сессии.
- [ ] Повторный `startSession` на service instance с уже активной session завершается явной ошибкой конкуренции и не запускает второй browser process.
- [ ] CLI-команда `gennady web-specter --url=...` по умолчанию пишет live log в stdout.
- [ ] При передаче `--file` CLI пишет тот же log в файл, сохраняя порядок событий и не меняя service core contract.
- [ ] Startup diagnostic lines и session event lines соответствуют фиксированному нормализованному формату рендера.
- [ ] File-mode использует UTF-8, truncate-and-rewrite, пытается создать отсутствующие директории и fail-fast завершается при недоступном пути.
- [ ] Все public contracts домена `web-specter` реализованы без дрейфа относительно PRD: поля, обязательность, error paths, lifecycle semantics и log line grammar совпадают со спецификацией.
- [ ] Реализация соответствует `Coding rules` и `QA code rules` из DEV AGENT INSTRUCTIONS: структура файлов, экспортов, типов, ошибок и тестов не противоречит этим правилам.
- [ ] Startup path, session lifecycle, terminal transitions и error branches логируются в LDD-compatible форме: порядок событий детерминирован, причина перехода не теряется, а лог достаточен для AI-first reconstruction execution slice.
