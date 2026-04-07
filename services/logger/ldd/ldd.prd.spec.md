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
| Output targets (`stdout`, `stderr`, `console`, `file`) | external | Получают log output через нормализованный `LddOutput` contract и его factory-адаптеры.                              |
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

## FILE STRUCTURE

- `services/logger/ldd/index.ts` — stable public import point для `#logger/ldd`; реэкспортирует только public API.
- `services/logger/ldd/ldd.ts` — основной public contract surface: `LDD`, public builders, public data contracts, output factory surface.
- `services/logger/ldd/ldd-runtime.ts` — internal runtime owner для active frame, context switching, pending operations и single-emission rules.
- `services/logger/ldd/ldd-sink.ts` — formatter/sink orchestration layer; превращает `LddRecord` в presentation output и fan-out-ит запись в configured outputs.
- `services/logger/ldd/ldd-output.ts` — normalized output contracts и factory adapters для `stdout/stderr`, `console`, `file`.
- `services/logger/ldd/ldd.prd.spec.md` — contract-first PRD для реализации.
- `services/logger/ldd/ldd.tests.spec.md` — BDD acceptance spec для QA и implementation verification.
- `services/logger/ldd/ldd.prd.log.md` — execution log изменений PRD и архитектурных решений.

---

## GOLDEN EXAMPLES

Purpose:

- зафиксировать нормативные usage-паттерны public API;
- показать не только синтаксис вызова, но и диагностическое намерение каждой записи;
- дать следующему AI-агенту и человеку-исполнителю canon examples для code review и implementation review.

Rules:

- комментарии вида `AI-Intent:` являются частью примеров и описывают, зачем конкретная запись нужна для machine-reconstructable диагностики;
- если в примере вызов сделан без `.msg`, это означает, что сам факт lifecycle milestone важнее, чем prose message;
- если в примере вызов сделан без `state`, это означает, что запись нужна без фиксации state transition;
- эти примеры нормативны для intended usage, даже если конкретные доменные имена в реальном приложении будут другими.

### Golden Example 1: Top-Level File Bootstrap

**Вариант без scope**
```ts
import { LDD } from '#logger/ldd';

// Всё логирование имеет cju 
LDD.debug('boot', 'Process', {argv: process.argv});

// Содержимое argv полезно только для глубокой диагностики ветвления, поэтому это именно debug.
const args = process.argv.slice(2);
const env = process.env;
LDD.info('parse', 'Parsed args & env', {args, env});
```

```ts
import { LDD } from '#logger/ldd';

// Логируем запуск скрипта с аргументами запуска
LDD.debug('Bootstrap', {argv: process.argv});

// AI-Intent: top-level executable file должен открыть явный root slice,
// чтобы bootstrap не падал в synthetic context и весь запуск CLI был восстановим как одна цепочка.
await LDD.scope('CliMain', async () => {
  // 
  LDD.info({ state: 'boot' });

  const argv = process.argv.slice(2);

  // AI-Intent: содержимое argv полезно только для глубокой диагностики ветвления, поэтому это именно debug.
  log.debug({ state: 'argv-captured' }).msg`argv=${argv}`;

  if (!process.env.APP_CONFIG) {
    // AI-Intent: приложение уходит в degraded startup path, но не падает;
    // warning нужен как side-effect log даже без prose message.
    log.warn({ state: 'config-defaulted', returnValue: undefined });
  }

  await runCli(argv);

  // AI-Intent: оператору нужна одна финальная человекочитаемая success line;
  // state transition здесь не нужен, потому что завершение видно из target/path и самого message.
  log.info().msg`CLI finished successfully`;
});
```

### Golden Example 2: Top-Level Function

```ts
import { LDD } from '#logger/ldd';

// Добавляем декоратор чтобы все вложенные логи начинались с "[resolveInputPath]"
@LDD.fn('resolveInputPath')
function resolveInputPath(argv: string[]): string {
  // Мы не логируем вход, потому что его логируем декоратор, он сам создает лог на
  // - вход: [idle → invoke] <RedactedArgs>
  // - выход в зависимости от результата:
  //    - успех: [<state> → exit-ok] <RedactedReturnValue>
  //    - ошибка: [<state> → exit-err] <ErrorMessage> <RedactedErrorDetail>

  if (argv.length === 0) {
    // Тут мы создаем не просто запись в лог, но и помечаем, что тут мы вернули значение чтобы получить:
    //   LOG: [<state> → fallback] Input path was not provided <RedactedReturnValue>
    // В это случае декоратор не добавляет дополнительный exit-ok
    return LDD.warn('fallback', 'Input path was not provided').ret('./input/default.json');
  }

  if (argv[0] === '--broken') {
    // LOG: [<state> → invalid-argv] Unsupported argv combination <RedactedErrorCause>
    // В это случае декоратор не добавляет дополнительный exit-err
    throw LDD.error(
      'invalid-argv',
      new Error('Unsupported argv combination', {cause: argv}),
    );
  }

  // Обычный выход с debug уровнем без дополнительного сообщения
  // LOG: [<state> → exit-ok] <RedactedReturnValue>
  return argv[0];

  // Чтобы изменить уровень логирования, можно использовать и state
  return LDD.info('done', 'Resolved patch').ret(argv[0]);
  // LOG: [<state> → done] Resolved patch <RedactedReturnValue>
}

// Пример вызова без аргументов:
resolveInputPath();
// [0:1] [debug] [resolveInputPath] [idle → invoke] {args: []}
// [1:2] [warn]  [resolveInputPath] [invoke → fallback] Input path was not provided {ret: './input/default.json'}
```

### Golden Example 3: Nested Function in React Component

```tsx
import { LDD } from '#logger/ldd';

type CheckoutFormProps = {
  checkoutId: string;
};

function CheckoutForm({ checkoutId }: CheckoutFormProps) {
  const log = LDD.scope('CheckoutForm');

  // AI-Intent: render-шум нельзя логировать без причины;
  // здесь оставлен только один debug discriminator, который объясняет ветвление UI.
  log.debug().msg`checkout=${checkoutId}`;

  const handleSubmit = async () =>
    log.scope('handleSubmit').run(async (submitLog) => {
      // AI-Intent: nested handler должен жить в child scope,
      // чтобы AI отделял render path от user action path.
      submitLog.info({ state: 'submit-started' });

      try {
        const result = await submitOrder(checkoutId);

        // AI-Intent: success message должна быть пригодна и для человека, и для реконструкции outcome.
        submitLog.info({ state: 'submit-succeeded' }).msg`Order ${result.orderId} created`;
      } catch (cause) {
        const error = cause instanceof Error ? cause : new Error(String(cause));

        // AI-Intent: thrown error нельзя подменять новым экземпляром;
        // сюда добавляется только бизнес-контекст конкретного submit action.
        throw submitLog.error({
          state: 'submit-failed',
          error,
        }).msg`Checkout ${checkoutId} failed during submit`;
      }
    });

  return <button onClick={() => void handleSubmit()}>Pay</button>;
}
```

### Golden Example 4: Class and Methods

```ts
import { LDD } from '#logger/ldd';

type ImportSummary = {
  imported: number;
  skipped: number;
};

@LDD.class('ImportService')
class ImportService {
  constructor(private readonly repo: ImportRepository) {}

  @LDD.method({
    redactArgs: (sourcePath) => ({ sourcePath }),
    redactReturn: (summary) => ({ imported: summary.imported, skipped: summary.skipped }),
  })
  async importFile(sourcePath: string): Promise<ImportSummary> {
    // AI-Intent: operator-facing start message нужна перед дорогим IO,
    // чтобы потом можно было связать долгую операцию с конкретным source.
    LDD.info({ state: 'reading-source' }).msg`Import requested for ${sourcePath}`;

    const rows = await this.readRows(sourcePath);

    // AI-Intent: row count нужен для deep diagnostics и performance triage, поэтому это debug.
    LDD.debug({ state: 'rows-loaded' }).msg`rows=${rows.length}`;

    if (rows.length === 0) {
      // AI-Intent: controlled empty-source branch не является error,
      // но warning должен быть связан с фактическим fallback return.
      return LDD.warn({
        state: 'empty-source',
        returnValue: { imported: 0, skipped: 0 },
      }).msg`Source file is empty`;
    }

    return this.persistRows(rows);
  }

  @LDD.method()
  private async persistRows(rows: CsvRow[]): Promise<ImportSummary> {
    // AI-Intent: иногда prose не нужен;
    // state-only info достаточно, чтобы привязать downstream DB records к фазе persistence.
    LDD.info({ state: 'persisting' });

    try {
      return await this.repo.save(rows);
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));

      // AI-Intent: infrastructure failure должен быть поднят как terminal error
      // с доменным контекстом, но без замены исходного thrown instance.
      throw LDD.error({
        state: 'persist-failed',
        error,
      }).msg`Failed to persist ${rows.length} rows`;
    }
  }
}
```

---

## STRUCTURE OF CHANGES

### Component `services/logger/ldd/ldd.ts`

Purpose:

- экспортировать весь public API домена `LDD`;
- содержать только public contracts, доступные прикладному коду;
- не заставлять потребителей импортировать internal runtime или output adapters напрямую.

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
  - `output?: LddOutput` — single normalized output target для всех emitted records.
  - `outputs?: LddOutput[]` — fan-out список normalized outputs; каждая record должна быть отправлена во все outputs списка.
- Preconditions:
  - `redactMsgArg` обязан возвращать строку;
  - `level` обязан быть допустимым значением `LddLevel`.
  - одновременно `output` и `outputs` задавать нельзя.
- Postconditions:
  - новый config применяется ко всем последующим emissions;
  - уже созданные records не меняются задним числом.
- Side effects:
  - обновляет global runtime configuration.

`LddOutputEntry`

- Purpose:
  - normalized payload, который runtime передаёт в output layer.
- Fields:
  - `level: LddLevel` — уровень записи, который output может использовать для routing.
  - `record: LddRecord` — structured payload той же самой записи.
- Invariants:
  - `record` является единственным canonical source of truth для semantic event;
  - output layer не должен менять `record` перед отправкой в target.

`LddOutput`

- Purpose:
  - normalized output contract для runtime fan-out.
- Methods:
  - `write(entry: LddOutputEntry): void | Promise<void>` — записывает одну normalized record entry в конкретный target.
- Preconditions:
  - `entry.record` уже полностью собран runtime-ом.
- Postconditions:
  - target получает ровно одну запись для каждого вызова `write`.

`LikeStdout`

- Purpose:
  - capability contract для stream-like target, совместимого со `stdout`.
- Methods:
  - `write(chunk: string): boolean | void` — записывает строковый chunk.

`LikeStdErr`

- Purpose:
  - capability contract для stream-like target, совместимого со `stderr`.
- Methods:
  - `write(chunk: string): boolean | void` — записывает строковый chunk.

`LikeConsole`

- Purpose:
  - capability contract для console-like target с routing по level.
- Methods:
  - `debug?(message?: unknown, ...args: unknown[]): void` — target для `debug`, если поддерживается.
  - `info?(message?: unknown, ...args: unknown[]): void` — target для `info`, если поддерживается.
  - `warn?(message?: unknown, ...args: unknown[]): void` — target для `warn`, если поддерживается.
  - `error?(message?: unknown, ...args: unknown[]): void` — target для `error`, если поддерживается.
  - `log?(message?: unknown, ...args: unknown[]): void` — fallback target, если специализированный level method отсутствует.

`LikeFile`

- Purpose:
  - capability contract для file-like writer без привязки к конкретной файловой API.
- Methods:
  - `write(chunk: string): boolean | void` — записывает строковый chunk в файл или file-like sink.
  - `flush?(): void | Promise<void>` — опционально форсирует сброс буфера.
  - `close?(): void | Promise<void>` — опционально закрывает ресурс.

`FileOutputConfig`

- Purpose:
  - declarative config для file output, если output factory сама открывает file target.
- Fields:
  - `path: string` — путь до файла назначения.
  - `append?: boolean` — если `true`, запись идёт в append mode; если `false`, поведение определяется реализацией factory.
  - `createIfMissing?: boolean` — если `true`, файл создаётся при отсутствии.
  - `encoding?: 'utf8'` — кодировка записи; для первого slice достаточно `utf8`.

`LddOutputFactory`

- Purpose:
  - создавать normalized `LddOutput` из разных kinds of targets.
- Methods:
  - `fromStdout(target: LikeStdout | LikeStdErr): LddOutput` — создаёт output для stream-like stdout/stderr target.
  - `fromConsole(target: LikeConsole): LddOutput` — создаёт output с routing по `level` в console-like target.
  - `fromFile(target: LikeFile | FileOutputConfig): LddOutput` — создаёт output для file-like writer или path-based file config.

`LddContextFrame`

- Purpose:
  - внутренняя и частично наблюдаемая модель одного active execution frame.
- Fields:
  - `tid: string` — stable identifier всей root call chain.
  - `frameId: string` — unique identifier именно этого frame entry.
  - `parentFrameId?: string` — identifier вызывающего frame.
  - `target: string` — canonical name текущего logical target, например `Slugify#create`.
  - `pathSegments: string[]` — ordered path от root до текущего `target`.
  - `depth: number` — текущая nesting depth в 1-based модели.
  - `enteredAt: number` — timestamp входа во frame в `epoch milliseconds`.
  - `currentState: string` — текущее logical state, которое runtime считает актуальным для этого frame.
  - `contextStatus: 'active' | 'synthetic'` — origin контекста: обычный или synthetic fallback.
- Invariants:
  - `depth` является 1-based величиной;
  - root frame всегда имеет `depth = 1`;
  - `pathSegments.length === depth`;
  - последний элемент `pathSegments` равен `target`;
  - в рамках одного `tid` все `frameId` уникальны;
  - synthetic frame может быть только root frame.
- Examples:
  - root frame:
    - `target = 'Import'`
    - `pathSegments = ['Import']`
    - `depth = 1`
  - child frame:
    - `target = 'Parse'`
    - `pathSegments = ['Import', 'Parse']`
    - `depth = 2`

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
  - `depth: number` — observed nesting depth в той же 1-based модели, что и у `LddContextFrame`.
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
  - `returnValue: TReturn` — value для inline `return` ergonomics, если потребитель выбирает форму `warn(...).msg\`...\``.
- Postconditions:
  - если warning flow завершается через `.msg\`...\``, builder возвращает именно `returnValue`;
  - если `.msg\`...\`` не использован, `returnValue` остаётся входным значением вызывающего кода и runtime его не извлекает автоматически.

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
- реэкспортировать output factory для создания normalized outputs.

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

##### `LDD.output: LddOutputFactory`

- Purpose:
  - предоставить public access к factory-методам создания outputs.
- Inputs:
  - отсутствуют.
- Outputs:
  - `LddOutputFactory` — набор factory methods для `stdout`, `stderr`, `console` и `file`.
- Invariants:
  - `LDD.output` не хранит mutable emission state;
  - factory methods создают normalized `LddOutput`, пригодный для передачи в `LddConfig`.

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
  - если active frame существует, создаётся новый child logger от него;
  - если active frame отсутствует, создаётся новый root logger с `depth = 1`;
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
  - отсутствуют.
- Postconditions:
  - вызов `LDD.debug(...)` или `LDD.info(...)` возвращает builder и регистрирует pending log operation;
  - pending operation должна быть автоматически flushed через runtime microtask queue или эквивалентный deferred-flush mechanism в конце текущего synchronous turn, если не была отменена runtime-ошибкой;
  - если `.msg\`...\`` не вызывался до flush, emission использует пустой `message` или отсутствие `message`;
  - если `.msg\`...\`` вызывался до flush, emission использует собранный `message`;
  - каждая логическая операция `debug/info` эмитит ровно одну record соответствующего уровня;
  - если active frame отсутствует, создаётся synthetic root frame.
- Invariants:
  - manual `debug/info` используют ту же схему `LddRecord`, что и automatic decorator records.
- Side effects:
  - factory call регистрирует pending emission;
  - `.msg\`...\`` только обогащает pending operation сообщением; доставка записи определяется configured output layer.

##### `LDD.warn<TReturn>(input: LddWarnInput<TReturn>): LddWarnBuilder<TReturn>`

- Purpose:
  - подготовить warning record с optional inline `return` ergonomics через `.msg\`...\``.
- Inputs:
  - `input: LddWarnInput<TReturn>` — состояние и возвращаемое значение.
- Outputs:
  - `LddWarnBuilder<TReturn>` — builder, возвращающий `TReturn`.
- Preconditions:
  - отсутствуют.
- Postconditions:
  - вызов `LDD.warn(...)` возвращает builder и регистрирует pending warning operation;
  - если `.msg\`...\`` не вызывался до flush, emission использует пустой `message` или отсутствие `message`;
  - если `.msg\`...\`` вызывался до flush, emission использует собранный `message`;
  - каждая логическая операция `warn` эмитит ровно одну `warn` record;
  - `.msg\`...\`` если вызван, возвращает `returnValue`;
  - отсутствие `.msg\`...\`` не даёт runtime-способа автоматически вернуть `returnValue` в expression position;
  - если для `warn` path включён global policy, он обязан быть выведен.
- Invariants:
  - `returnValue` не модифицируется runtime.
- Side effects:
  - factory call регистрирует pending emission;
  - `.msg\`...\`` только обогащает pending operation сообщением.

##### `LDD.error(input: LddErrorInput): LddPreparedError`

- Purpose:
  - подготовить throw-compatible error carrier с LDD metadata.
- Inputs:
  - `input: LddErrorInput` — state metadata и исходный `Error`.
- Outputs:
  - `LddPreparedError` — throwable object, который может быть выброшен напрямую.
- Preconditions:
  - прямой `throw LDD.error(...)` поддерживается только внутри LDD-managed boundary: `@LDD.method`, `@LDD.fn`, `LDD.scope(name, run)` или `log.run(fn)`;
  - если нужен message, отличный от `error.message`, надо использовать `.msg\`...\`` до `throw`.
- Postconditions:
  - сам вызов `LDD.error(...)` ничего не эмитит;
  - `.msg\`...\`` не эмитит record немедленно, а только переопределяет `message` будущей записи и возвращает тот же throwable object для немедленного `throw`;
  - при пересечении LDD-managed boundary ошибка должна быть эмитирована ровно один раз и повторно выброшена.
- Invariants:
  - исходный экземпляр ошибки не заменяется;
  - повторная emission одной и той же подготовленной ошибки запрещена.
- Side effects:
  - emission происходит только на LDD-managed boundary при перехвате выброшенной prepared error.

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
  - `msg` опционален;
  - если `msg` используется, он разрешён только как tagged-template entrypoint.
- Postconditions:
  - вызов `.msg\`...\`` собирает итоговый `message`;
  - отсутствие вызова `.msg\`...\`` не отменяет emission самого логического события;
  - pending operation flush-ится runtime-ом в конце текущего synchronous turn.
- Invariants:
  - plain function-call вроде `builder.msg('x')` обязан бросать `TypeError`;
  - каждая `${...}` interpolation проходит через global `redactMsgArg`;
  - static fragments шаблона не изменяются.
- Side effects:
  - отсутствуют на этапе сборки сообщения; emission определяется lifecycle pending operation соответствующего уровня.

##### `LddWarnBuilder<TReturn>`

- Purpose:
  - собрать tagged-template message для `warn` и вернуть `returnValue`.
- Public API:
  - `get msg(): (strings: TemplateStringsArray, ...values: unknown[]) => TReturn`
- Postconditions:
  - `.msg\`...\`` собирает `message` для будущей `warn` record;
  - `.msg\`...\`` возвращает исходный `returnValue`.
- Invariants:
  - если `.msg\`...\`` не был вызван, builder не предоставляет automatic extraction `returnValue`;
  - pending warning flush-ится runtime-ом в конце текущего synchronous turn.

##### `LddPreparedError`

- Purpose:
  - быть throw-compatible carrier-объектом для `Error` и LDD metadata.
- Public API:
  - `error: Error` — исходный error object, который должен остаться доступным для повторного throw.
  - `get msg(): (strings: TemplateStringsArray, ...values: unknown[]) => LddPreparedError`
- Postconditions:
  - `.msg\`...\`` сохраняет override message и возвращает тот же object для немедленного `throw`;
  - `.msg\`...\`` не эмитит record самостоятельно.
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
- нормализовать single `output` и plural `outputs` в единый fan-out execution path.

Invariants:

- active frame не хранится как mutable public object;
- простая и взаимная recursion создают новый `frameId` на каждый вход;
- при любом выходе из LDD-managed boundary previous frame восстанавливается.

### Component `services/logger/ldd/ldd-sink.ts`

Purpose:

- рендерить flat log line и передавать normalized `LddOutputEntry` в configured outputs.

consumer: `LDD` runtime и output targets.

Contract:

- Inputs:
  - `record: LddRecord` — полностью собранная structured record.
- Outputs:
  - отсутствуют.
- Postconditions:
  - sink создаёт `LddOutputEntry` из `record` без добавления новых canonical business fields;
  - каждый configured output получает одну и ту же normalized entry;
  - human-readable text форматируется внутри sink или output adapter-а как presentation artifact и не становится частью `LddRecord` или `LddOutputEntry`;
  - если `emitPathByLevel[level] === true`, path рендерится в presentation output;
  - если `emitPathByLevel[level] !== true`, path не рендерится в presentation output, но остаётся в `record.pathSegments`.
- Invariants:
  - formatter не меняет business content `record`;
  - formatter сам вычисляет `[prevState -> state]`, не читая отдельное поле `transition`.

### Component `services/logger/ldd/ldd-output.ts`

Purpose:

- инкапсулировать normalized output contracts и adapters для разных targets.

consumer: `LDD.setup`, runtime fan-out и прикладной код, создающий outputs через factory.

Contracts:

- `LddOutputEntry`
  - runtime-normalized entry для output layer.
- `LddOutput`
  - normalized writer interface для одного target.
- `LddOutputFactory`
  - public factory surface для создания outputs.
- `LikeStdout | LikeStdErr`
  - stream-like targets.
- `LikeConsole`
  - console-like target с routing по level.
- `LikeFile | FileOutputConfig`
  - file-like writer или path-based file config.

Factory behavior:

- `fromStdout(target)`
  - получает `entry.record`, рендерит presentation text через shared formatter и пишет результат в stream-like target;
  - допускает использование как для `stdout`, так и для `stderr`.
- `fromConsole(target)`
  - route-ит presentation text и `entry.record` в level-specific method (`debug/info/warn/error`) или fallback `log`;
  - первым аргументом передаёт presentation text, вторым — `entry.record`.
- `fromFile(target)`
  - рендерит presentation text из `entry.record` и пишет его в file-like target или создаёт file writer из `FileOutputConfig`.

### Emission Matrix

Purpose:

- устранить неоднозначность между factory call, `.msg\`...\`` и runtime flush / error boundary semantics.

| API | Factory call emits immediately? | Registers pending operation? | `.msg\`...\`` required? | `.msg\`...\`` emits immediately? | Flush trigger | Returns |
| --- | --- | --- | --- | --- | --- |
| `LDD.debug(...)` | no | yes | no | no | end of current synchronous turn | `LddTextLogBuilder` |
| `LDD.info(...)` | no | yes | no | no | end of current synchronous turn | `LddTextLogBuilder` |
| `LDD.warn(...)` | no | yes | no | no | end of current synchronous turn | `LddWarnBuilder<TReturn>` |
| `LDD.warn(...).msg\`...\`` | no | yes | optional | no | end of current synchronous turn | `TReturn` |
| `LDD.error(...)` | no | no | no | no | LDD-managed error boundary | `LddPreparedError` |
| `LDD.error(...).msg\`...\`` | no | no | optional | no | LDD-managed error boundary | `LddPreparedError` |

Rules:

- Для `debug`, `info` и `warn` factory call регистрирует pending operation, но не эмитит record немедленно.
- Для `debug`, `info` и `warn` `.msg\`...\`` является optional message builder и не является обязательным trigger-ом emission.
- Для `debug`, `info` и `warn` runtime обязан flush-ить pending operation в конце текущего synchronous turn.
- Под `end of current synchronous turn` понимается ближайшая runtime-controlled flush point после завершения текущего sync stack, до начала следующего пользовательского логического шага того же execution context.
- Для Node.js/TypeScript reference implementation таким flush mechanism должен быть `queueMicrotask(...)` или эквивалентная microtask scheduling primitive.
- Для `warn` inline `return` ergonomics гарантируется только формой `warn(...).msg\`...\``; без `.msg` warning остаётся side-effect logging operation.
- Для `error` единственный supported emission trigger — пересечение LDD-managed error boundary подготовленной ошибки.
- Под `LDD-managed error boundary` понимаются только wrapper boundaries, создаваемые `@LDD.method`, `@LDD.fn`, `LDD.scope(name, run)` и `log.run(run)`.
- Для `error` вызов `.msg\`...\`` меняет только текст сообщения будущей `error` record.

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

**consumer**: `LDD`, decorators, `LddScopeLogger`, output layer.

**depends**: none.

**tests**: [t1-runtime-setup](ldd.tests.spec.md#t1-runtime-setup)

ТЗ:

- реализовать `LddConfig`, `LddContextFrame`, `LddRecord`, `LddLogInput`, `LddWarnInput`, `LddErrorInput`, `LddWrapOptions`, `LddOutputEntry`, `LddOutput`, `LikeStdout`, `LikeStdErr`, `LikeConsole`, `LikeFile`, `FileOutputConfig`, `LddOutputFactory`;
- выбрать async-safe механизм хранения active frame;
- поддержать `currentState` внутри frame;
- запретить различение `void` и `undefined` на runtime.

Acceptance criteria:

- synthetic context корректно маркируется;
- root frame имеет `depth = 1`;
- child frame с двумя сегментами имеет `depth = 2`;
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
- реэкспортировать `LDD.output` как public factory surface;
- реализовать `LddScopeLogger` как immutable bound logger;
- исключить inheritance `LddScopeLogger` от `LDD`.

Acceptance criteria:

- static и bound methods дают один и тот же `LddRecord`;
- `scope -> scope -> scope` работает без ambient-context leakage;
- `LDD.active` read-only.
- `LDD.setup` принимает normalized `output` или `outputs`, но не оба сразу.

### LDD-3: Message Builders and Control-Flow Helpers

**purpose**: Реализовать builders `msg`, включая tagged-template-only semantics, return flow через `warn` и throw-compatible flow через `error`.

**consumer**: прикладной код и AI-диагностический агент.

**depends**: `LDD-1`, `LDD-2`.

**tests**: [t5-message-builder](ldd.tests.spec.md#t5-message-builder)

ТЗ:

- реализовать `LddTextLogBuilder`, `LddWarnBuilder`, `LddPreparedError`;
- все `${...}` прогонять через `redactMsgArg`;
- при падении `redactMsgArg` подставлять sentinel `'<ldd:redact-failed>'`;
- plain function-call для `msg` запрещён.

Acceptance criteria:

- `debug/info` регистрируют pending operation и корректно flush-ятся без вызова `.msg\`...\``;
- `debug/info` используют `.msg\`...\`` только как optional message builder;
- `warn(...)` корректно flush-ится и без вызова `.msg\`...\`` как side-effect logging operation;
- `warn(...).msg\`...\`` возвращает `returnValue`;
- `error(...)` сам по себе не эмитит record;
- `error(...).msg\`...\`` возвращает тот же throw-compatible object и не эмитит record;
- повторная emission одной и той же prepared error невозможна.

### LDD-4: Decorators and Automatic Lifecycle

**purpose**: Закрыть automatic logging scenario для classes, methods и functions.

**consumer**: сервисы приложения и CLI-команды.

**depends**: `LDD-1`, `LDD-2`, `LDD-3`.

**tests**: [t4-decorators](ldd.tests.spec.md#t4-decorators)

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

### LDD-5: Output Layer, Entrypoint and Acceptance Coverage

**purpose**: Финализировать output format, public entrypoint и acceptance coverage по контрактам.

**consumer**: прикладной код, output targets, QA.

**depends**: `LDD-1`, `LDD-2`, `LDD-3`, `LDD-4`.

**tests**: [t3-output-factories](ldd.tests.spec.md#t3-output-factories), [t6-recursion-and-errors](ldd.tests.spec.md#t6-recursion-and-errors)

ТЗ:

- реализовать standard sink и formatter;
- реализовать output adapters для `fromStdout`, `fromConsole`, `fromFile`;
- стабилизировать import `#logger/ldd`;
- проверить, что BDD покрывает manual scope, decorators, prepared error, recursion, synthetic context, message redaction, path emission и output routing.

Acceptance criteria:

- path рендерится только по `emitPathByLevel`;
- `fromStdout` создаёт output для stream-like target;
- `fromConsole` route-ит запись по `level`;
- `fromFile` создаёт file output из writer или `FileOutputConfig`;
- `line` или иной presentation text не становится canonical field в `LddRecord` или `LddOutputEntry`;
- `#logger/ldd` доступен как public entrypoint;
- по test spec можно проверить все public contracts.

---

## ACCEPTANCE CRITERIA

- [ ] В PRD описаны не только components, но и их public contracts: inputs, outputs, preconditions, postconditions, invariants и side effects.
- [ ] Public API `LDD` реализуем без скрытых допущений и без привязки к конкретному языку, кроме зафиксированных JS/TS semantics tagged template и decorator lifecycle.
- [ ] `LddConfig` поддерживает output configuration через normalized `LddOutput`, а не через узкий ad-hoc `sink`.
- [ ] Flat log содержит достаточно данных, чтобы AI-агент восстановил nested calls, manual scopes, recursion, results и errors.
- [ ] `LDD.active`, `LDD.scope`, ambient methods и bound logger methods образуют один непротиворечивый contract.
- [ ] Output layer поддерживает как минимум `stdout/stderr`, `console` и `file` через factory-based adapters.
- [ ] `.msg\`...\`` является optional message builder, а не обязательным условием emission.
- [ ] `warn(...).msg\`...\`` сохраняет ergonomics `return`, а `warn(...)` без `.msg` остаётся корректным side-effect logging call.
- [ ] `throw LDD.error(...)` и `throw LDD.error(...).msg\`...\`` сохраняют ergonomics `throw` без duplicate emission.
- [ ] Recursive calls различимы по `frameId` и `parentFrameId`, даже если `target` и `pathSegments` повторяются по именам.
- [ ] Отсутствующий ambient context никогда не замалчивается: runtime создаёт synthetic frame и помечает его в `LddRecord`.
- [ ] Base semantics `depth` зафиксирована как 1-based и проверяется на примерах root/child frame.
- [ ] Emission lifecycle для `debug/info/warn/error` однозначно задан через `Emission Matrix`, `pending operation` и `flush point`.
- [ ] PRD содержит golden examples для top-level file, top-level function, nested React handler и class/method usage с `AI-Intent` комментариями для `debug/info/warn/error`, с `state` и без него, с `.msg` и без него.
