# LDD-001: LDD Contract Spec

Этот PRD задаёт реализационно-независимую спецификацию `LDD` для `services/logger/ldd`.
По этому документу другой агент должен суметь реализовать компонент без устных пояснений и без привязки к конкретному языку реализации, пока соблюдены public contracts, invariants и side effects.

---

## PRIMARY GOAL

Поставить context-aware logging, которое автоматически связывает записи вызовов в machine-reconstructable execution slice с аргументами, результатами, состояниями, рекурсией и путём ошибок, сохраняя для разработчика простой API без ручного управления scope.

---

## CONSUMERS

| Consumer                                          | Type     | Relationship                                                                                                        |
| ------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------- |
| Сервисы приложения и CLI-команды                  | external | Используют `LDD` как public API для автоматического и ручного context-aware logging.                                |
| AI-диагностический агент                          | external | Читает flat logs и structured payload, чтобы восстанавливать call chain, arguments, results, states и errors.       |
| Sink в `console/stdout`                           | external | Получает итоговую строку лога и structured `LddRecord` вторым аргументом.                                           |
| Decorators `@LDD.class`, `@LDD.method`, `@LDD.fn` | internal | Открывают и закрывают execution frame, автоматически эмитят lifecycle records и восстанавливают предыдущий context. |
| `LddScopeLogger`                                  | internal | Даёт bound logger object для ручных nested scope.                                                                   |
| `LDD` runtime context                             | internal | Хранит active frame, global config и emission policy.                                                               |

---

## DEV AGENT INSTRUCTIONS

- `Coding rules`: `.ai/agents/agent-typescript-devgen.xml`
- `QA code rules`: `.ai/agents/agent-qa-code.rules.xml`
- `Execution log`: `services/logger/ldd/ldd.prd.log.md`
- `Test spec`: `services/logger/ldd/ldd.tests.spec.md`

---

## STRUCTURE OF CHANGES

### Component `services/logger/ldd/ldd.ts`

Purpose:

- экспортировать весь public API домена `LDD`;
- содержать только public contracts, доступные прикладному коду;
- не заставлять потребителей импортировать internal runtime или sink напрямую.

consumer: сервисы приложения и CLI-команды.

#### Data Contracts

`LddLevel`

- Purpose:
  - перечисление logging levels.
- Values:
  - `'debug'` — подробная диагностическая запись для development и глубокого анализа.
  - `'info'` — штатная информирующая запись о ходе исполнения.
  - `'warn'` — запись о нежелательном, но контролируемом отклонении.
  - `'error'` — запись о терминальном или почти терминальном сбое.
- Invariants:
  - уровни упорядочены как `debug < info < warn < error`;
  - global `level` запрещает emission для уровней ниже configured threshold.

`LddConfig`

- Purpose:
  - global runtime configuration.
- Fields:
  - `level: LddLevel` — global emission threshold; записи с уровнем ниже порога эмититься не должны.
  - `emitPathByLevel: Partial<Record<LddLevel, boolean>>` — per-level policy, определяющая, нужно ли рендерить `path` в human-readable log line.
  - `redactMsgArg: (value: unknown) => string` — global serializer/redactor для `${...}` interpolation внутри tagged-template `msg`.
  - `sink?: (line: string, record: LddRecord) => void` — финальный emission hook, который получает готовую log line и structured record.
- Preconditions:
  - `redactMsgArg` обязан возвращать строку;
  - `level` обязан быть допустимым значением `LddLevel`.
- Postconditions:
  - новый config применяется ко всем последующим emissions;
  - уже созданные records не меняются задним числом.
- Side effects:
  - обновляет global runtime configuration.

`LddContextFrame`

- Purpose:
  - внутренняя и частично наблюдаемая модель одного active execution frame.
- Fields:
  - `tid: string` — stable identifier всей root call chain.
  - `frameId: string` — unique identifier именно этого frame entry.
  - `parentFrameId?: string` — identifier вызывающего frame.
  - `target: string` — canonical name текущего logical target, например `Slugify#create`.
  - `pathSegments: string[]` — ordered path от root до текущего `target`.
  - `depth: number` — текущая nesting depth.
  - `enteredAt: number` — timestamp входа во frame в `epoch milliseconds`.
  - `currentState: string` — текущее logical state, которое runtime считает актуальным для этого frame.
  - `contextStatus: 'active' | 'synthetic'` — origin контекста: обычный или synthetic fallback.
- Invariants:
  - `pathSegments.length === depth`;
  - последний элемент `pathSegments` равен `target`;
  - в рамках одного `tid` все `frameId` уникальны;
  - synthetic frame может быть только root frame.

`LddRecord`

- Purpose:
  - единый structured payload одной log record.
- Fields:
  - `datetime: string` — absolute wall-clock timestamp в ISO format.
  - `time: number` — numeric timestamp в `epoch milliseconds`, пригодный для сортировки и анализа.
  - `level: LddLevel` — logging level текущей записи.
  - `tid: string` — identifier root call chain.
  - `frameId: string` — identifier текущего frame.
  - `parentFrameId?: string` — identifier caller frame.
  - `target: string` — logical node, который создал запись.
  - `pathSegments: string[]` — полный path от root до текущего target.
  - `depth: number` — observed nesting depth.
  - `prevState?: string` — state до перехода.
  - `state: string` — state после перехода.
  - `args?: unknown` — serialized invocation arguments.
  - `returns?: unknown` — serialized return value.
  - `error?: unknown` — serialized error payload.
  - `message?: string` — finalized text message записи.
  - `contextStatus: 'active' | 'synthetic'` — status контекста, в котором запись была создана.
- Invariants:
  - field `transition` отсутствует; human-readable transition вычисляется только из `prevState` и `state`;
  - `returns` и `error` взаимоисключающие для одной record;
  - одна record описывает одно semantic event.

`LddLogInput`

- Purpose:
  - input contract для `debug` и `info`.
- Fields:
  - `state?: string` — optional target state, в которое должен перейти active frame перед emission этой записи.
- Preconditions:
  - если `state` задано, оно обязано быть непустой строкой.

`LddWarnInput<TReturn>`

- Purpose:
  - input contract для `warn`.
- Fields:
  - `state?: string` — optional target state, которое будет зафиксировано в emitted record.
  - `returnValue: TReturn` — value, которое builder обязан вернуть после `.msg\`...\``.
- Postconditions:
  - после успешного вызова `.msg\`...\``возвращается именно`returnValue`.

`LddErrorInput`

- Purpose:
  - input contract для `error`.
- Fields:
  - `state?: string` — optional target state, которое должно попасть в error record.
  - `error: Error` — исходный error object, который должен быть сохранён и повторно выброшен.
- Preconditions:
  - `error` обязан быть объектом ошибки.

`LddWrapOptions`

- Purpose:
  - local overrides для `@LDD.method` и `@LDD.fn`.
- Fields:
  - `name?: string` — optional override для `target`, если автоматическое имя нельзя вывести корректно.
  - `redactArgs?: (...args: unknown[]) => unknown` — local redaction hook для captured invocation args.
  - `redactReturn?: (value: unknown) => unknown` — local redaction hook для return value.
- Preconditions:
  - в первом delivery slice все redact hooks работают через `unknown`, без усложнения generic decorator contracts.

#### Public Class `LDD`

Purpose:

- быть единственной public entrypoint домена;
- предоставлять global setup, ambient logging API, decorator factories и manual scopes.

consumer: сервисы приложения и CLI-команды.

##### `LDD.setup(config: LddConfig): void`

- Purpose:
  - заменить global runtime configuration.
- Inputs:
  - `config: LddConfig` — новая полная конфигурация runtime.
- Outputs:
  - `void` — результат отсутствует.
- Preconditions:
  - повторные вызовы допустимы и полностью заменяют прошлую конфигурацию.
- Postconditions:
  - последующие emissions используют новый config;
  - active frame не сбрасывается только из-за `setup`.
- Invariants:
  - `setup` сам по себе не эмитит log record.
- Side effects:
  - обновляет global runtime configuration.

##### `LDD.active: LddScopeLogger | undefined`

- Purpose:
  - получить bound logger для текущего active frame.
- Inputs:
  - отсутствуют.
- Outputs:
  - `LddScopeLogger | undefined` — logger snapshot текущего frame либо `undefined`, если active frame отсутствует.
- Postconditions:
  - возвращаемый logger отражает snapshot active frame на момент чтения.
- Invariants:
  - потребитель не может присвоить новое значение в `LDD.active`;
  - `LDD.active` никогда не возвращает mutable runtime store напрямую.
- Side effects:
  - отсутствуют.

##### `LDD.scope(name: string): LddScopeLogger`

- Purpose:
  - создать child scope logger без активации ambient context.
- Inputs:
  - `name: string` — имя нового logical scope.
- Outputs:
  - `LddScopeLogger` — дочерний bound logger.
- Preconditions:
  - `name` непустой.
- Postconditions:
  - создаётся новый child logger от active frame либо новый root logger;
  - ambient context не меняется.
- Invariants:
  - chaining `scope -> scope -> scope` только накапливает `pathSegments`.
- Side effects:
  - отсутствуют.

##### `LDD.scope<TResult>(name: string, run: (log: LddScopeLogger) => TResult | Promise<TResult>): TResult | Promise<TResult>`

- Purpose:
  - создать scope и временно сделать его active на время callback.
- Inputs:
  - `name: string` — имя logical scope.
  - `run: (log: LddScopeLogger) => TResult | Promise<TResult>` — callback, исполняемый внутри этого scope.
- Outputs:
  - `TResult | Promise<TResult>` — результат callback без изменения значения.
- Postconditions:
  - на время callback новый scope становится ambient `LDD.active`;
  - после завершения callback предыдущий active frame восстанавливается всегда.
- Invariants:
  - утечка active context за границы callback запрещена.
- Side effects:
  - временно переключает active frame;
  - при выбросе подготовленной ошибки `LddPreparedError` обязан эмитить terminal `error` record ровно один раз перед повторным выбросом исходной ошибки.

##### `LDD.debug(input?: LddLogInput): LddTextLogBuilder`

##### `LDD.info(input?: LddLogInput): LddTextLogBuilder`

- Purpose:
  - подготовить text log builder для `debug` или `info`.
- Inputs:
  - `input?: LddLogInput` — optional state transition metadata.
- Outputs:
  - `LddTextLogBuilder` — builder для tagged-template message.
- Preconditions:
  - builder должен быть потреблён через `.msg\`...\``.
- Postconditions:
  - `.msg\`...\`` эмитит ровно одну record соответствующего уровня;
  - если active frame отсутствует, создаётся synthetic root frame.
- Invariants:
  - manual `debug/info` используют ту же схему `LddRecord`, что и automatic decorator records.
- Side effects:
  - `.msg\`...\`` эмитит record в sink.

##### `LDD.warn<TReturn>(input: LddWarnInput<TReturn>): LddWarnBuilder<TReturn>`

- Purpose:
  - подготовить warning record и вернуть `returnValue` через `.msg\`...\``.
- Inputs:
  - `input: LddWarnInput<TReturn>` — состояние и возвращаемое значение.
- Outputs:
  - `LddWarnBuilder<TReturn>` — builder, возвращающий `TReturn`.
- Preconditions:
  - builder должен быть потреблён в том же expression, где нужен `return`.
- Postconditions:
  - `.msg\`...\``эмитит ровно одну`warn` record;
  - `.msg\`...\``возвращает`returnValue`;
  - если для `warn` path включён global policy, он обязан быть выведен.
- Invariants:
  - `returnValue` не модифицируется runtime.
- Side effects:
  - `.msg\`...\`` эмитит record.

##### `LDD.error(input: LddErrorInput): LddPreparedError`

- Purpose:
  - подготовить throw-compatible error carrier с LDD metadata.
- Inputs:
  - `input: LddErrorInput` — state metadata и исходный `Error`.
- Outputs:
  - `LddPreparedError` — throwable object, который может быть выброшен напрямую.
- Preconditions:
  - прямой `throw LDD.error(...)` поддерживается только внутри LDD-managed boundary: `@LDD.method`, `@LDD.fn`, `LDD.scope(name, run)` или `log.run(fn)`;
  - если нужен message, отличный от `error.message`, надо использовать `.msg\`...\``до`throw`.
- Postconditions:
  - сам вызов `LDD.error(...)` не обязан немедленно эмитить record;
  - при пересечении LDD-managed boundary ошибка должна быть эмитирована ровно один раз и повторно выброшена;
  - `.msg\`...\``переопределяет`message`записи и возвращает тот же throwable object для немедленного`throw`.
- Invariants:
  - исходный экземпляр ошибки не заменяется;
  - повторная emission одной и той же подготовленной ошибки запрещена.
- Side effects:
  - emission происходит либо при `.msg\`...\`` в immediate mode, либо на LDD-managed boundary при перехвате выброшенной prepared error.

##### `LDD.class(name: string): ClassDecorator`

- Purpose:
  - привязать class identity к automatic logging и обернуть constructor.
- Inputs:
  - `name: string` — canonical class name для формирования `target`.
- Outputs:
  - `ClassDecorator` — decorator, применимый к классу.
- Preconditions:
  - `name` должен быть стабильным identifier класса.
- Postconditions:
  - constructor логируется как `ClassName#constructor`;
  - methods класса получают стабильную class identity.
- Invariants:
  - business behavior constructor-а не меняется, кроме logging wrapper.
- Side effects:
  - оборачивает constructor.

##### `LDD.method(options?: LddWrapOptions): MethodDecorator`

- Purpose:
  - автоматически открыть execution frame вокруг method call и эмитить lifecycle records.
- Inputs:
  - `options?: LddWrapOptions` — local name override и redaction hooks.
- Outputs:
  - `MethodDecorator` — decorator для class method.
- Postconditions:
  - на входе эмитится `idle -> invoked`;
  - при success эмитится terminal `returns`;
  - при failure эмитится terminal `error`;
  - previous frame восстанавливается в `finally`.
- Invariants:
  - любой вызов decorated method создаёт новый `frameId`;
  - при recursion `tid` остаётся root-level, а `frameId` остаются уникальными.
- Side effects:
  - открывает и закрывает execution frame;
  - перехватывает и повторно выбрасывает ошибки.

##### `LDD.fn(name: string, options?: LddWrapOptions): FunctionDecorator`

- Purpose:
  - автоматически открыть execution frame вокруг free function call и эмитить lifecycle records.
- Inputs:
  - `name: string` — canonical function name.
  - `options?: LddWrapOptions` — local overrides.
- Outputs:
  - `FunctionDecorator` — decorator для free function.
- Postconditions:
  - contract совпадает с `LDD.method`, кроме отсутствия class identity.
- Invariants:
  - free functions и methods эмитят один и тот же `LddRecord` shape.
- Side effects:
  - те же, что у `LDD.method`.

#### Public Class `LddScopeLogger`

Purpose:

- дать bound logger для manual nested scope;
- позволить писать `scope -> scope -> scope` без обращения к global mutable state.

consumer: сервисы приложения и CLI-команды.

Observable Properties:

- `tid: string` — identifier root call chain.
- `frameId: string` — identifier current bound frame.
- `parentFrameId?: string` — identifier caller frame.
- `target: string` — canonical target текущего scope.
- `pathSegments: string[]` — path от root до current scope.
- `depth: number` — current nesting depth.

Invariants:

- экземпляр `LddScopeLogger` immutable;
- чтение свойств не меняет runtime;
- все logging methods на `LddScopeLogger` обязаны эмитить записи того же формата, что и static methods `LDD`.

##### `log.scope(name: string): LddScopeLogger`

- Purpose:
  - создать child logger от текущего bound frame.
- Inputs:
  - `name: string` — child scope name.
- Outputs:
  - `LddScopeLogger` — новый bound logger.
- Postconditions:
  - новый logger имеет тот же `tid`, новый `frameId`, текущий `frameId` как `parentFrameId` и расширенный `pathSegments`.
- Side effects:
  - отсутствуют.

##### `log.run<TResult>(run: (log: LddScopeLogger) => TResult | Promise<TResult>): TResult | Promise<TResult>`

- Purpose:
  - временно активировать bound logger как ambient context.
- Inputs:
  - `run: (log: LddScopeLogger) => TResult | Promise<TResult>` — callback, исполняемый внутри bound frame.
- Outputs:
  - `TResult | Promise<TResult>` — результат callback.
- Postconditions:
  - текущий logger становится ambient `LDD.active` только на время callback.
- Side effects:
  - временно переключает active frame.

##### `log.debug(input?: LddLogInput): LddTextLogBuilder`

##### `log.info(input?: LddLogInput): LddTextLogBuilder`

##### `log.warn<TReturn>(input: LddWarnInput<TReturn>): LddWarnBuilder<TReturn>`

##### `log.error(input: LddErrorInput): LddPreparedError`

- Purpose:
  - эмитить запись относительно frame текущего bound logger.
- Inputs:
  - идентичны соответствующим static methods `LDD`.
- Outputs:
  - идентичны соответствующим static methods `LDD`.
- Invariants:
  - bound logger не зависит от текущего значения `LDD.active`, если используется напрямую.

#### Public Builders

##### `LddTextLogBuilder`

- Purpose:
  - собрать tagged-template message для `debug/info`.
- Public API:
  - `get msg(): (strings: TemplateStringsArray, ...values: unknown[]) => void`
- Preconditions:
  - `msg` разрешён только как tagged-template entrypoint.
- Postconditions:
  - вызов `.msg\`...\``собирает итоговый`message` и эмитит одну record.
- Invariants:
  - plain function-call вроде `builder.msg('x')` обязан бросать `TypeError`;
  - каждая `${...}` interpolation проходит через global `redactMsgArg`;
  - static fragments шаблона не изменяются.
- Side effects:
  - эмитит record в sink.

##### `LddWarnBuilder<TReturn>`

- Purpose:
  - собрать tagged-template message для `warn` и вернуть `returnValue`.
- Public API:
  - `get msg(): (strings: TemplateStringsArray, ...values: unknown[]) => TReturn`
- Postconditions:
  - `.msg\`...\``эмитит одну`warn` record;
  - `.msg\`...\``возвращает исходный`returnValue`.

##### `LddPreparedError`

- Purpose:
  - быть throw-compatible carrier-объектом для `Error` и LDD metadata.
- Public API:
  - `error: Error` — исходный error object, который должен остаться доступным для повторного throw.
  - `get msg(): (strings: TemplateStringsArray, ...values: unknown[]) => LddPreparedError`
- Postconditions:
  - `.msg\`...\``сохраняет override message и возвращает тот же object для немедленного`throw`.
- Invariants:
  - объект можно выбросить напрямую;
  - исходный экземпляр ошибки сохраняется;
  - один и тот же `LddPreparedError` не может быть emitted повторно.

### Component `services/logger/ldd/ldd-runtime.ts`

Purpose:

- инкапсулировать хранение active frame и правила context switching;
- быть единственным владельцем mutable runtime state.

consumer: public class `LDD` и decorators.

Required responsibilities:

- хранить global config;
- хранить active frame через async-safe propagation mechanism;
- создавать root frame и child frame;
- поддерживать `currentState` для каждого active frame;
- обеспечивать single emission для `LddPreparedError`.

Invariants:

- active frame не хранится как mutable public object;
- простая и взаимная recursion создают новый `frameId` на каждый вход;
- при любом выходе из LDD-managed boundary previous frame восстанавливается.

### Component `services/logger/ldd/ldd-sink.ts`

Purpose:

- рендерить flat log line и передавать structured payload в sink.

consumer: `LDD` runtime и конечный sink в `console/stdout`.

Contract:

- Inputs:
  - `record: LddRecord` — полностью собранная structured record.
- Outputs:
  - отсутствуют.
- Postconditions:
  - sink получает flat log line и `record`;
  - если `emitPathByLevel[level] === true`, path рендерится рядом с записью;
  - если `emitPathByLevel[level] !== true`, path не рендерится в строке, но остаётся в `record.pathSegments`.
- Invariants:
  - formatter не меняет business content `record`;
  - formatter сам вычисляет `[prevState -> state]`, не читая отдельное поле `transition`.

### Component `services/logger/ldd/index.ts`

Purpose:

- быть стабильной public import point для `#logger/ldd`.

consumer: прикладной код.

Contract:

- exports public API домена `LDD`;
- не exports internal runtime details, не предназначенные для прикладного использования.

---

## WORKPLAN

### LDD-1: Data Contracts and Runtime Model

**purpose**: Зафиксировать структуры данных, frame invariants и runtime behavior для nested и async calls.

**consumer**: `LDD`, decorators, `LddScopeLogger`, sink.

**depends**: none.

**tests**: [t1-runtime-setup](ldd.tests.spec.md#t1-runtime-setup)

ТЗ:

- реализовать `LddConfig`, `LddContextFrame`, `LddRecord`, `LddLogInput`, `LddWarnInput`, `LddErrorInput`, `LddWrapOptions`;
- выбрать async-safe механизм хранения active frame;
- поддержать `currentState` внутри frame;
- запретить различение `void` и `undefined` на runtime.

Acceptance criteria:

- synthetic context корректно маркируется;
- `pathSegments.length === depth`;
- `currentState` обновляется только runtime-ом;
- data frame отделён от bound logger object.

### LDD-2: Public API `LDD` and `LddScopeLogger`

**purpose**: Реализовать contract-first API, полностью описанный в `STRUCTURE OF CHANGES`.

**consumer**: сервисы приложения и CLI-команды.

**depends**: `LDD-1`.

**tests**: [t2-scoped-logger](ldd.tests.spec.md#t2-scoped-logger)

ТЗ:

- реализовать `LDD.setup`, `LDD.active`, оба overload для `LDD.scope`, ambient logging methods;
- реализовать `LddScopeLogger` как immutable bound logger;
- исключить inheritance `LddScopeLogger` от `LDD`.

Acceptance criteria:

- static и bound methods дают один и тот же `LddRecord`;
- `scope -> scope -> scope` работает без ambient-context leakage;
- `LDD.active` read-only.

### LDD-3: Message Builders and Control-Flow Helpers

**purpose**: Реализовать builders `msg`, включая tagged-template-only semantics, return flow через `warn` и throw-compatible flow через `error`.

**consumer**: прикладной код и AI-диагностический агент.

**depends**: `LDD-1`, `LDD-2`.

**tests**: [t4-message-builder](ldd.tests.spec.md#t4-message-builder)

ТЗ:

- реализовать `LddTextLogBuilder`, `LddWarnBuilder`, `LddPreparedError`;
- все `${...}` прогонять через `redactMsgArg`;
- при падении `redactMsgArg` подставлять sentinel `'<ldd:redact-failed>'`;
- plain function-call для `msg` запрещён.

Acceptance criteria:

- `debug/info` эмитят record через `.msg\`...\``;
- `warn(...).msg\`...\``возвращает`returnValue`;
- `error(...).msg\`...\`` возвращает тот же throw-compatible object;
- повторная emission одной и той же prepared error невозможна.

### LDD-4: Decorators and Automatic Lifecycle

**purpose**: Закрыть automatic logging scenario для classes, methods и functions.

**consumer**: сервисы приложения и CLI-команды.

**depends**: `LDD-1`, `LDD-2`, `LDD-3`.

**tests**: [t3-decorators](ldd.tests.spec.md#t3-decorators)

ТЗ:

- реализовать `@LDD.class`, `@LDD.method`, `@LDD.fn`;
- гарантировать `idle -> invoked` на входе;
- гарантировать `returns` или `error` на выходе;
- гарантировать восстановление previous frame в `finally`;
- гарантировать корректную recursion через unique `frameId`.

Acceptance criteria:

- constructor логируется как `ClassName#constructor`;
- `redactArgs` и `redactReturn` применяются только к своим целям;
- прямой `throw LDD.error(...)` внутри LDD boundary эмитит одну terminal record.

### LDD-5: Sink, Entrypoint and Acceptance Coverage

**purpose**: Финализировать output format, public entrypoint и acceptance coverage по контрактам.

**consumer**: прикладной код, `console/stdout` sink, QA.

**depends**: `LDD-1`, `LDD-2`, `LDD-3`, `LDD-4`.

**tests**: [t5-recursion-and-errors](ldd.tests.spec.md#t5-recursion-and-errors)

ТЗ:

- реализовать standard sink и formatter;
- стабилизировать import `#logger/ldd`;
- проверить, что BDD покрывает manual scope, decorators, prepared error, recursion, synthetic context, message redaction и path emission.

Acceptance criteria:

- path рендерится только по `emitPathByLevel`;
- `#logger/ldd` доступен как public entrypoint;
- по test spec можно проверить все public contracts.

---

## ACCEPTANCE CRITERIA

- [ ] В PRD описаны не только components, но и их public contracts: inputs, outputs, preconditions, postconditions, invariants и side effects.
- [ ] Public API `LDD` реализуем без скрытых допущений и без привязки к конкретному языку, кроме зафиксированных JS/TS semantics tagged template и decorator lifecycle.
- [ ] Flat log содержит достаточно данных, чтобы AI-агент восстановил nested calls, manual scopes, recursion, results и errors.
- [ ] `LDD.active`, `LDD.scope`, ambient methods и bound logger methods образуют один непротиворечивый contract.
- [ ] `warn(...).msg\`...\``сохраняет ergonomics`return`, а `throw LDD.error(...)`и`throw LDD.error(...).msg\`...\``сохраняют ergonomics`throw` без duplicate emission.
- [ ] Recursive calls различимы по `frameId` и `parentFrameId`, даже если `target` и `pathSegments` повторяются по именам.
- [ ] Отсутствующий ambient context никогда не замалчивается: runtime создаёт synthetic frame и помечает его в `LddRecord`.
