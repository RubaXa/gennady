# RC-001: remote-console

Этот PRD задаёт исполнимую спецификацию для `services/remote-console` и CLI-команды `gennady remote-console`.
Документ фиксирует минимальный production slice: browser client дублирует logging-вызовы `console` в локальный или проксированный HTTP endpoint, а server runtime печатает нормализованный поток в `stdout` и умеет завершаться по команде клиента.

---

## PRIMARY GOAL

Дать разработчику и AI-агенту способ без ручного копирования получить browser console log в локальный `stdout`, сохранив обычное поведение страницы и сведя интеграцию к `remoteConsoleClient.connect(console, {url, tabId?, branch?})` на клиенте и `npx gennady remote-console` на CLI.

---

## CONSUMERS

| Consumer                          | Type     | Relationship                                                                                                                                                                |
| --------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Разработчик                       | external | Запускает `npx gennady remote-console`, при необходимости передаёт `--url`, открывает страницу и получает live console log в терминале без ручного копирования из devtools. |
| AI-диагностический агент          | external | Потребляет нормализованный `stdout` поток `"[console.<level>] ..."` для последующего анализа ошибок и расхождений.                                                          |
| Browser page runtime              | external | Вызывает `remoteConsoleClient.connect(console, {url, tabId?, branch?})`, чтобы дублировать logging calls в remote sink, не ломая локальный console UX.                      |
| Browser lifecycle                 | external | Даёт lifecycle signal ухода со страницы; клиент обязан использовать его для auto-disconnect и unload-safe доставки финального shutdown signal.                              |
| CLI-команда `remote-console`      | internal | Парсит аргументы, стартует server core, печатает startup diagnostics и при `--url` открывает браузер с activation query flag.                                               |
| `RemoteConsoleClient`             | internal | Monkey-patch logging methods, буферизует записи, сериализует аргументы, выполняет throttled HTTP flush и публикует `console.__remote__.disconnect()`.                       |
| `RemoteConsoleHttpServer`         | internal | Принимает единый HTTP endpoint с envelope-командами `logs` и `disconnect`, передаёт payload в stdout writer и shutdown controller.                                          |
| `RemoteConsoleStdoutWriter`       | internal | Превращает входящие log items в flat строки `"[console.<level>] <...args>"` в детерминированном формате.                                                                    |
| `RemoteConsoleShutdownController` | internal | Координирует controlled shutdown server runtime после команды `disconnect`.                                                                                                 |

---

## DEV AGENT INSTRUCTIONS

- `Coding rules`: `ai/agents/agent-typescript-devgen.xml`.
- `QA code rules`: `ai/agents/agent-qa-code.rules.xml`.
- `Execution log`: `services/remote-console/remote-console.prd.log.md`.
- `Test spec`: `services/remote-console/remote-console.tests.spec.md`.

---

## FILE STRUCTURE

### `services/remote-console/`

- `remote-console.ts`
  - Purpose: public entrypoint домена; экспортирует public contracts и стартовые фабрики без утечки internal file layout.
- `client/remote-console-client.ts`
  - Purpose: public browser-side runtime; подключает patching, batching, serialization, manual disconnect и unload-safe auto-disconnect lifecycle.
- `client/remote-console-client.types.ts`
  - Purpose: держать public client-facing contracts домена `remote-console` в одном месте.
- `client/remote-console-client-serializer.ts`
  - Purpose: минимальная и безопасная сериализация console arguments в transport payload.
- `server/remote-console-server.ts`
  - Purpose: public server entrypoint; стартует HTTP server runtime и отдаёт lifecycle handle.
- `server/remote-console-server.types.ts`
  - Purpose: contracts server options, command envelope и lifecycle result.
- `server/remote-console-stdout-writer.ts`
  - Purpose: нормализованный text rendering для `stdout`.

### `cli/cmd/remote-console/`

- `index.ts`
  - Purpose: entrypoint CLI-команды.
- `remote-console.cmd.ts`
  - Purpose: parse CLI args, стартовать `RemoteConsoleHttpServer`, опционально открыть URL через `open`.

### Existing files to update

- `cli/gennady.ts`
  - Purpose: зарегистрировать команду `remote-console` и динамический импорт её entrypoint.
- `cli/cmd/help/help.cmd.ts`
  - Purpose: показать новую команду в help output.
- `cli/AGENTS.md`
  - Purpose: зафиксировать новую CLI-команду и её назначение.
- `package.json`
  - Purpose: зависимости менять не нужно; пакет `open` уже есть и остаётся выбранной библиотекой для браузерного запуска.

### Tests

- `services/remote-console/__tests__/remote-console-client.test.ts`
  - Purpose: client patching, batching, serialization, error-degrade semantics.
- `services/remote-console/__tests__/remote-console-server.test.ts`
  - Purpose: HTTP command handling, stdout formatting, shutdown semantics.
- `cli/cmd/remote-console/__tests__/remote-console.cmd.test.ts`
  - Purpose: CLI args, startup output, browser-opening path and URL mutation.

---

## STRUCTURE OF CHANGES

### Component `services/remote-console/remote-console.ts`

Purpose:

- экспортировать весь public API домена `remote-console`;
- дать стабильную точку входа для CLI и browser consumer;
- не заставлять потребителя импортировать internal runtime modules напрямую.

consumer: CLI-команда `remote-console` и browser integrations.

#### Public Contract `remoteConsoleClient`

- Purpose:
  - предоставить browser-facing API для подключения remote logging к существующему `console`.
- Exports:
  - `connect(consoleLike, config)`.
- Inputs:
  - `consoleLike`
    - Purpose: объект с logging methods `log`, `info`, `warn`, `error`, `debug`, который будет patch target.
  - `config.url`
    - Purpose: единый HTTP endpoint, куда клиент шлёт все remote actions.
  - `config.tabId`
    - Purpose: optional source tag, чтобы сервер или будущие потребители могли понять источник лога.
  - `config.branch`
    - Purpose: optional source branch tag, чтобы в подключении и логах было видно целевую ветку клиента.
- Outputs:
  - optional connection handle допустим, но не обязателен для first slice; обязательный runtime effect — появление `console.__remote__.disconnect`.
- Preconditions:
  - `config.url` обязан быть корректным абсолютным URL.
  - `consoleLike` обязан поддерживать logging methods first slice.
- Postconditions:
  - локальное поведение `console` сохранено;
  - remote batching scheduler активен;
  - `consoleLike.__remote__.disconnect` доступен после успешного подключения;
  - повторный `connect` на уже подключённый target не переподключает runtime и пишет один warning;
  - при успешном `connect` клиент буферизует служебный `info`-event подключения с `tabId` и `branch`;
  - client подписан на unload lifecycle trigger first slice для auto-disconnect path.
- Invariants:
  - client patching не должен влиять на return semantics оригинального `console`;
  - transport failure не ломает локальный logging path;
  - duplicate connect не создаёт двойной отправки;
  - один flush не выполняется параллельно с другим;
  - первый отказ transport логируется локально один раз, последующие молча игнорируются;
  - connect-event должен формироваться один раз на одно успешное подключение target;
  - ручной `console.__remote__.disconnect()` и auto-disconnect через unload path разделяют один shutdown state и не должны инициировать два независимых shutdown sequence.
- Side effects:
  - monkey patch logging methods;
  - создаёт interval flush каждые 5 секунд;
  - делает HTTP POST на `config.url`;
  - подписывается на browser lifecycle event first slice;
  - пишет локальный warning/error при duplicate connect или потере sink.

#### Public Contract `startRemoteConsoleServer`

- Purpose:
  - поднять HTTP server runtime для приёма remote console команд и выдачи нормализованного `stdout`.
- Inputs:
  - `options.port`
    - Purpose: локальный порт server runtime.
  - `options.host`
    - Purpose: optional bind host; по умолчанию loopback-safe host для локального инструмента.
  - `options.exitCode`
    - Purpose: optional process exit code after remote disconnect.
- Outputs:
  - server lifecycle handle с минимумом управления: доступный `url`, `close()` для локального shutdown и состояние запуска.
- Preconditions:
  - порт должен быть свободен и bindable в текущем runtime.
- Postconditions:
  - единый HTTP endpoint принимает команды `logs` и `disconnect`;
  - server lifecycle handle отражает фактический runtime endpoint.
- Invariants:
  - server обрабатывает только один логический endpoint first slice;
  - `disconnect` завершает runtime controlled path, а не abrupt kill без cleanup;
  - невалидный request не должен ронять process напрямую.
- Side effects:
  - открывает listening socket;
  - пишет startup and runtime diagnostics в локальный `stdout`/`stderr`;
  - вызывает `process.exit(exitCode)` после обработанного shutdown path.

### Component `services/remote-console/client/remote-console-client.ts`

Purpose:

- реализовать browser-side orchestration: patching, queueing, flush scheduling и disconnect lifecycle;
- хранить lifecycle state одного active connection на один console target;
- не смешивать transport details сервера с форматированием локального console;
- зафиксировать unload-safe shutdown semantics без ложного обещания абсолютной сетевой доставки.

consumer: browser page runtime.

#### Data Contract `RemoteConsoleClientConnectConfig`

- Purpose:
  - определить поведение одного browser connection.
- Fields:
  - `url`
    - Purpose: единый endpoint для `logs` и `disconnect`.
  - `tabId`
    - Purpose: optional source marker для payload.
  - `branch`
    - Purpose: optional source branch marker для payload и connect-event.
- Preconditions:
  - `url` обязан быть абсолютным и пригодным для `fetch`.
- Postconditions:
  - config применяется к одному active connection.
- Invariants:
  - first slice не делит logging traffic по нескольким endpoints;
  - transport contract не требует knowledge о host/port отдельно от URL;
  - first slice не вводит retry queue, persistent queue, acknowledgement protocol или reconnect state machine.

#### Data Contract `RemoteConsoleLogEntry`

- Purpose:
  - быть transport-neutral snapshot одного console call.
- Fields:
  - `level`
    - Purpose: logging level из множества `log`, `info`, `warn`, `error`, `debug`.
  - `timestamp`
    - Purpose: machine-sortable time marker для стабильного порядка внутри batch.
  - `args`
    - Purpose: ordered serialized argument list.
  - `tabId`
    - Purpose: optional source marker, если он был задан на уровне connection.
  - `branch`
    - Purpose: optional source branch marker, если он был задан на уровне connection.
- Preconditions:
  - `level` обязан быть одним из поддерживаемых logging levels first slice.
- Postconditions:
  - entry самодостаточен для server-side stdout rendering.
- Invariants:
  - entry не содержит live browser handles;
  - порядок `args` совпадает с исходным console call.

#### Data Contract `RemoteConsoleSerializedArg`

- Purpose:
  - минимально и безопасно перенести аргумент console call через JSON payload.
- Fields:
  - `kind`
    - Purpose: coarse-grained category `primitive` или `tagged`.
  - `text`
    - Purpose: flat string representation для stdout.
  - `tag`
    - Purpose: optional `Object.prototype.toString` tag для complex values.
- Preconditions:
  - serializer обязан всегда возвращать renderable representation.
- Postconditions:
  - server может печатать значение без повторной объектной инспекции.
- Invariants:
  - primitives сериализуются в человекочитаемый текст;
  - complex values first slice сериализуются минимум до `tag`, даже если полноценно не JSON-safe;
  - serializer не должен бросать наружу из-за циклов, `BigInt`, `Symbol`, DOM nodes или `Error`.

#### Runtime Contract `unload-safe delivery`

- Purpose:
  - зафиксировать проверяемую семантику “гарантии доставки” для shutdown path без подмены её обещанием абсолютной сетевой гарантии.
- Trigger:
  - first slice использует `pagehide` как основной lifecycle event для auto-disconnect.
  - ручной `console.__remote__.disconnect()` остаётся отдельным публичным entrypoint и использует тот же shutdown path.
- Delivery strategy:
  - client обязан использовать browser-native unload-safe policy в фиксированном порядке `navigator.sendBeacon` -> `fetch(..., { keepalive: true })`.
  - если финальный flush payload не помещается или `sendBeacon` недоступен, допускается деградация до `fetch keepalive`.
  - если полный flush хвоста буфера невозможен, клиент всё равно обязан отправить `disconnect` через максимально надёжный доступный unload-safe механизм.
- Meaning of guarantee:
  - в рамках этого PRD “гарантия доставки” означает обязанность клиента использовать browser-supported unload-safe transport, предназначенный для отправки сигнала при закрытии или уходе со страницы.
  - absolute delivery, retries после unload, acknowledgement protocol и persist queue не входят в scope first slice.
- Postconditions:
  - при `pagehide` client автоматически инициирует shutdown path;
  - если в буфере есть неотправленные логи, client сначала пытается отправить их через ту же unload-safe policy, затем отправляет `disconnect`.
- Invariants:
  - auto-disconnect не должен срабатывать повторно после уже начатого shutdown path;
  - `visibilitychange` first slice не является trigger для shutdown, чтобы не завершать сервер при временной потере видимости вкладки;
  - `beforeunload` допустим только как совместимый fallback hook, а не как основной контрактный trigger.

### Component `services/remote-console/server/remote-console-server.ts`

Purpose:

- принять единый HTTP endpoint;
- распарсить envelope-команды;
- делегировать рендеринг в stdout writer и shutdown lifecycle.

consumer: CLI-команда `remote-console`.

#### Data Contract `RemoteConsoleCommandEnvelope`

- Purpose:
  - унифицировать transport payload для всех client actions first slice.
- Fields:
  - `type`
    - Purpose: command discriminator; first slice допускает `logs` и `disconnect`.
  - `tabId`
    - Purpose: optional logical source marker.
  - `items`
    - Purpose: ordered list log entries для команды `logs`.
- Preconditions:
  - `type` обязателен у любого request body.
  - `items` обязательны и непусты только для `logs`.
- Postconditions:
  - envelope самодостаточен для dispatch на нужный handler.
- Invariants:
  - first slice использует один endpoint и envelope-dispatch вместо route fan-out;
  - `disconnect` не требует `items`.

#### Runtime Contract `logs command handling`

- Purpose:
  - превратить batch log entries в плоский terminal output.
- Inputs:
  - ordered `RemoteConsoleLogEntry[]`.
- Outputs:
  - отдельная `stdout` line на каждый entry.
- Preconditions:
  - обработчик получает уже parsed and validated envelope.
- Postconditions:
  - строки выводятся в порядке элементов payload.
- Invariants:
  - ошибка в одном entry не должна ломать весь server process;
  - writer не обращается к исходным browser objects.
- Side effects:
  - запись в `process.stdout`.

#### Runtime Contract `disconnect command handling`

- Purpose:
  - корректно завершить runtime после remote client signal.
- Inputs:
  - `disconnect` envelope.
- Outputs:
  - terminal shutdown result.
- Preconditions:
  - команда может прийти в любой момент после старта сервера.
- Postconditions:
  - server прекращает принимать новые запросы;
  - процесс завершается через `process.exit(exitCode)`.
- Invariants:
  - перед shutdown path не требуется наличие active client session;
  - повторный `disconnect` после начала shutdown не должен порождать второй shutdown path.
- Side effects:
  - закрытие listening socket;
  - завершение процесса.

### Component `services/remote-console/server/remote-console-stdout-writer.ts`

Purpose:

- изолировать text rendering policy от HTTP и lifecycle concerns;
- гарантировать стабильный flat output format, пригодный для разработчика и AI-агента.

consumer: `RemoteConsoleHttpServer`.

#### Rendering Contract `stdout line format`

- Purpose:
  - зафиксировать deterministic textual form каждого log entry.
- Inputs:
  - `RemoteConsoleLogEntry`.
- Outputs:
  - строка вида `"[console.<level>] <arg1> <arg2> ..."` с сохранением исходного порядка аргументов.
- Preconditions:
  - каждый аргумент уже сериализован в flat printable representation.
- Postconditions:
  - один entry соответствует одной строке.
- Invariants:
  - primitives печатаются как текст;
  - complex values печатаются через минимальный descriptor, полученный на клиенте;
  - формат не зависит от платформенных util.inspect различий.

### Component `cli/cmd/remote-console/remote-console.cmd.ts`

Purpose:

- быть единственной CLI-обвязкой вокруг server core;
- не дублировать server runtime logic внутри CLI;
- опционально открыть user browser с activation query flag.

consumer: разработчик.

#### CLI Contract `npx gennady remote-console`

- Purpose:
  - стартовать server runtime и сообщить оператору endpoint.
- Inputs:
  - `--port`
    - Purpose: optional explicit port override.
  - `--host`
    - Purpose: optional bind host override.
  - `--url`
    - Purpose: optional page URL, который нужно открыть в default browser после старта сервера.
- Outputs:
  - startup diagnostics в stdout/stderr;
  - running server process.
- Preconditions:
  - аргументы должны парситься существующим parse-args подходом проекта.
- Postconditions:
  - при наличии `--url` CLI открывает URL с query flag `__remote_console__=1`;
  - open path использует библиотеку `open`, уже присутствующую в проекте.
- Invariants:
  - CLI не знает transport internals beyond public server API;
  - query mutation не должна уничтожать существующие query params или hash fragment.
- Side effects:
  - старт server process;
  - опциональный запуск default browser через `open`.

#### Technology Decision `browser opening library`

- Chosen:
  - пакет `open`.
- Why:
  - по состоянию на 5 апреля 2026 пакет актуален, имеет свежий релиз `10.2.0`, явно предназначен для command-line tools and scripts, уже есть в `devDependencies` и решает именно задачу “open URL in default browser”.
- Rejected:
  - `default-browser`
    - Reason: полезен для определения браузера, но не заменяет само открытие URL.
  - ad-hoc platform-specific shell commands
    - Reason: увеличивают platform coupling и снижают предсказуемость по сравнению с mature cross-platform package.

---

## WORKPLAN

### RC-001-W1: Public contracts and domain skeleton

- **purpose**: создать доменную структуру `services/remote-console`, public entrypoint и language-agnostic contracts клиента и сервера.
- **consumer**: CLI-команда `remote-console` и browser integrations.
- **depends**: none.
- **tests**: [rc-tests-public-contracts](remote-console.tests.spec.md#rc-tests-public-contracts), [rc-tests-client-connect-config-contract](remote-console.tests.spec.md#rc-tests-client-connect-config-contract), [rc-tests-server-command-envelope-contract](remote-console.tests.spec.md#rc-tests-server-command-envelope-contract).

ТЗ:

- Ввести public exports для client и server без утечки internal file layout.
- Зафиксировать contracts для `connect`, `startRemoteConsoleServer`, envelope и serialized args.

Критерии приёмки:

- Публичные импорты стабильны и достаточны для CLI и browser consumer.
- Внутренние детали не требуются для типового использования домена.

### RC-001-W2: Browser client runtime

- **purpose**: реализовать patching logging methods, batching, safe serialization, degrade-on-failure и `console.__remote__.disconnect()`.
- **consumer**: browser page runtime.
- **depends**: `RC-001-W1`.
- **tests**: [rc-tests-patch-preserves-local-console](remote-console.tests.spec.md#rc-tests-patch-preserves-local-console), [rc-tests-batch-flush-every-five-seconds](remote-console.tests.spec.md#rc-tests-batch-flush-every-five-seconds), [rc-tests-disconnect-best-effort-flush](remote-console.tests.spec.md#rc-tests-disconnect-best-effort-flush), [rc-tests-duplicate-connect-warns-once](remote-console.tests.spec.md#rc-tests-duplicate-connect-warns-once), [rc-tests-transport-failure-degrades-locally](remote-console.tests.spec.md#rc-tests-transport-failure-degrades-locally), [rc-tests-serializer-never-throws](remote-console.tests.spec.md#rc-tests-serializer-never-throws), [rc-tests-pagehide-triggers-auto-disconnect](remote-console.tests.spec.md#rc-tests-pagehide-triggers-auto-disconnect), [rc-tests-unload-prefers-sendbeacon-then-keepalive](remote-console.tests.spec.md#rc-tests-unload-prefers-sendbeacon-then-keepalive), [rc-tests-unload-flushes-buffer-before-disconnect](remote-console.tests.spec.md#rc-tests-unload-flushes-buffer-before-disconnect).
- **tests**: [rc-tests-patch-preserves-local-console](remote-console.tests.spec.md#rc-tests-patch-preserves-local-console), [rc-tests-connect-emits-source-event](remote-console.tests.spec.md#rc-tests-connect-emits-source-event), [rc-tests-batch-flush-every-five-seconds](remote-console.tests.spec.md#rc-tests-batch-flush-every-five-seconds), [rc-tests-disconnect-best-effort-flush](remote-console.tests.spec.md#rc-tests-disconnect-best-effort-flush), [rc-tests-duplicate-connect-warns-once](remote-console.tests.spec.md#rc-tests-duplicate-connect-warns-once), [rc-tests-transport-failure-degrades-locally](remote-console.tests.spec.md#rc-tests-transport-failure-degrades-locally), [rc-tests-serializer-never-throws](remote-console.tests.spec.md#rc-tests-serializer-never-throws), [rc-tests-pagehide-triggers-auto-disconnect](remote-console.tests.spec.md#rc-tests-pagehide-triggers-auto-disconnect), [rc-tests-unload-prefers-sendbeacon-then-keepalive](remote-console.tests.spec.md#rc-tests-unload-prefers-sendbeacon-then-keepalive), [rc-tests-unload-flushes-buffer-before-disconnect](remote-console.tests.spec.md#rc-tests-unload-flushes-buffer-before-disconnect).

ТЗ:

- Patch only `log`, `info`, `warn`, `error`, `debug`.
- Сохранять исходное локальное поведение каждого метода.
- Буферизовать записи и отправлять batch не чаще одного раза в 5 секунд.
- На `disconnect` сделать best-effort flush и затем отправить shutdown command.
- На `pagehide` автоматически инициировать тот же shutdown path.
- Для unload-safe delivery использовать фиксированную стратегию `sendBeacon -> fetch keepalive`, без retries и persist queue.

Критерии приёмки:

- Локальный console остаётся рабочим даже при transport failure.
- Duplicate connect не создаёт двойной patch и пишет только warning.
- Serializer устойчив к non-JSON-safe значениям.
- Auto-disconnect на `pagehide` отправляет shutdown signal через unload-safe transport policy.

### RC-001-W3: Server runtime and stdout formatting

- **purpose**: реализовать единый HTTP endpoint, envelope dispatch, stdout writer и controlled shutdown path.
- **consumer**: CLI-команда `remote-console` и downstream terminal consumers.
- **depends**: `RC-001-W1`.
- **tests**: [rc-tests-server-prints-normalized-lines](remote-console.tests.spec.md#rc-tests-server-prints-normalized-lines), [rc-tests-server-single-endpoint-dispatch](remote-console.tests.spec.md#rc-tests-server-single-endpoint-dispatch), [rc-tests-server-disconnect-shutdown](remote-console.tests.spec.md#rc-tests-server-disconnect-shutdown), [rc-tests-invalid-request-does-not-crash-process](remote-console.tests.spec.md#rc-tests-invalid-request-does-not-crash-process).

ТЗ:

- Поднять HTTP server с единым endpoint и JSON envelope.
- Для `logs` печатать одну строку на один entry.
- Для `disconnect` выполнять controlled shutdown и `process.exit(exitCode)`.

Критерии приёмки:

- Output format стабилен и не зависит от util.inspect.
- Невалидный request не валит сервер неконтролируемо.

### RC-001-W4: CLI integration and browser opening

- **purpose**: зарегистрировать новую команду CLI, связать её с server core и добавить optional browser opening path.
- **consumer**: разработчик.
- **depends**: `RC-001-W3`.
- **tests**: [rc-tests-cli-registers-command](remote-console.tests.spec.md#rc-tests-cli-registers-command), [rc-tests-cli-opens-url-with-activation-flag](remote-console.tests.spec.md#rc-tests-cli-opens-url-with-activation-flag), [rc-tests-cli-preserves-existing-query-and-hash](remote-console.tests.spec.md#rc-tests-cli-preserves-existing-query-and-hash), [rc-tests-cli-no-open-when-url-absent](remote-console.tests.spec.md#rc-tests-cli-no-open-when-url-absent).

ТЗ:

- Обновить `cli/gennady.ts`, `cli/cmd/help/help.cmd.ts`, `cli/AGENTS.md`.
- Реализовать `npx gennady remote-console --url="<url>"`.
- Для browser opening использовать `open`.

Критерии приёмки:

- Команда видна в help и реально запускает server core.
- URL mutation детерминированна и не ломает остальные части URL.

---

## ACCEPTANCE CRITERIA

- [ ] Реализация достигает PRIMARY GOAL: разработчик может поднять `remote-console`, подключить browser client и получить browser console log в локальном `stdout` без ручного копирования.
- [ ] Public contracts `remoteConsoleClient.connect` и `startRemoteConsoleServer` реализованы без дрейфа относительно этого PRD, включая `Inputs`, `Outputs`, `Preconditions`, `Postconditions`, `Invariants` и `Side effects`.
- [ ] Browser client patchит только `log`, `info`, `warn`, `error`, `debug`, сохраняет локальное поведение `console` и не создаёт двойную отправку при повторном `connect`.
- [ ] Browser client при успешном `connect` добавляет один служебный `info`-event подключения в remote stream с `tabId` и `branch` (или `unknown`, если не заданы), чтобы stdout показывал кто подключился и с какой ветки.
- [ ] Client flush semantics соответствует fixed throttling policy: batch отправляется не чаще одного раза в 5 секунд и `disconnect` делает best-effort flush до shutdown command.
- [ ] Browser client подписывается на `pagehide` как на основной lifecycle trigger auto-disconnect и использует тот же shutdown path, что и ручной `console.__remote__.disconnect()`.
- [ ] Семантика “гарантии доставки” для unload-path реализована как fixed browser-native policy `navigator.sendBeacon -> fetch keepalive`; absolute guarantee, ack protocol, retries и persist queue не добавляются в first slice.
- [ ] При `pagehide` клиент пытается отправить хвост буфера через unload-safe policy до отправки `disconnect`; если полный flush невозможен, shutdown signal всё равно отправляется максимально надёжным доступным способом.
- [ ] Serializer никогда не роняет клиент из-за complex or non-JSON-safe values и всегда выдаёт printable representation с минимальным type signal для complex values.
- [ ] Server принимает единый endpoint с envelope-dispatch, печатает строки в формате `"[console.<level>] <...args>"` и не зависит от platform-specific object inspection.
- [ ] Команда `disconnect` завершает server controlled path и приводит к `process.exit(exitCode)` без второго конкурентного shutdown path.
- [ ] CLI-команда `remote-console` зарегистрирована в `cli/gennady.ts`, отражена в help и использует server core из `services/remote-console/server`, а не дублирует runtime logic.
- [ ] При переданном `--url` CLI открывает browser через `open`, добавляя query flag `__remote_console__=1` без потери существующих query params и hash fragment.
- [ ] Реализация соответствует `Coding rules` из `ai/agents/agent-typescript-devgen.xml`.
- [ ] Тесты соответствуют `QA code rules` из `ai/agents/agent-qa-code.rules.xml` и покрывают не только happy path, но и duplicate connect, transport failure, invalid requests и shutdown semantics.
