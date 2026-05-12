## Цель

LDD (Log-Driven Development) — это context-aware AI-to-AI логирование для machine-reconstructable execution slice: оно связывает записи вызовов с аргументами, результатами, состояниями, рекурсией и путём ошибок, сохраняя для разработчика простой API без ручного управления scope.

- `state` фиксирует переходы и фазы исполнения как модель поведения системы.
- `ai_to_ai_log_intent` фиксирует “зачем это залогировано, чтобы что” и дополняет `state`.
- В результате intent становится частью наблюдаемой диагностики и предпочтительнее комментария: он живёт рядом с фактом (log record), попадает в плоский лог и в structured payload, и позволяет AI реконструировать причинно-следственную цепочку без чтения всего кода.

## Концепт

Базовое API LDD: `LDD.<level>(<state>, <ai_to_ai_log_intent>?, <detail_object>?)`.
Формат лога: `[<parent_id>:<log_id>] [<scope>] [<prev_state> → <state>] (<ai_to_ai_log_intent>)? (<detail_object>)?`.

Где:

- `scope` — по умолчанию `-` (корень), задается через `LDD.scope/fn/class/method`.
  - Можно открыть scope через callback: `await LDD.scope('Name', async () => { ... })`.
  - Можно получить scoped logger без callback: `const log = LDD.scope('Name')`.
  - Вложенные scope формируют цепочку через `/` (например: `CheckoutForm/handleSubmit`).
  - Scope с callback имеет “страховочный” auto-exit по тем же правилам, что и `LDD.fn`/`LDD.method` (см. `ret` ниже).
  - Для методов класса scope форматируется как `<ClassName>#<MethodName>` (например: `ImportService#importFile`).
- `LDD.fn(name, options?)` — декоратор для функций; `options` по смыслу такой же, как у `LDD.method(options?)` (redactArgs/redactReturn и т.п.).
- `LDD.class(name)` — декоратор для классов; добавляет скрытое поле `_ldd` (описание и logger).
  - Logger берется из `this._logger`, если он есть, иначе используется глобальный.
- `prev_state` — работает в рамках parent/scope, начинается со `idle`
- `detail_object` — все значения по умолчанию проходят как redacted (safe-by-default), чтобы случайно не утечь секретами.
  - Чтобы передать значение “как есть”, оборачивай его в `LDD.unsafeValue(value)` и используй только для явно безопасных данных.
- `ret` — зарезервированный ключ в `detail_object`, который добавляет `.ret(value)`.
  - Для return: `.ret(returnValue)` помечает, что happy-path outcome уже явно залогирован.
  - Для throw: `.ret(error)` помечает, что error outcome уже явно залогирован.
  - Если декоратор/Scope-wrapper видит, что последняя запись внутри scope содержит `ret`, он не добавляет дополнительный synthetic exit-log.
- `LDD.fn` / `LDD.method` — декораторы, которые логируют вход/выход как safety-net.
  - Happy path: разработчик сам логирует возврат/ошибку и использует `.ret(...)` → декоратор не дублирует выход.
  - Safety net: если `.ret(...)` не было, декоратор добавляет synthetic exit-log на return/throw.
- `ai_to_ai_log_intent` — короткий intent для AI-to-AI логирования: зачем это залогировано, чтобы что?
  - Должен дополнять `state`, а не дублировать его.
  - Должен быть стабильным (без динамических значений и без “prose”), чтобы по нему можно было группировать события.
  - Рекомендуемая длина: 3–8 слов, до 80 символов (лучше до 60).
  - Язык: только English. Важно: ёмко, однозначно, без лишней пунктуации.

### Runtime model

LDD хранит execution slice как дерево вложенных boundary-областей и линейную последовательность records внутри них.

- Execution slice обозначается `tid` (необязательно рендерится в flat line, но присутствует в structured record).
- `log_id` — монотонно растущий идентификатор записи внутри одного `tid`.
- `parent_id` — идентификатор boundary-записи, относительно которой строится локальная цепочка:
  - `0` означает root execution slice без явного boundary.
  - если код работает внутри `LDD.scope(name, run)` / `log.run(run)` / `@LDD.fn` / `@LDD.method`, то `parent_id` у вложенных записей указывает на `log_id` boundary-записи (входа), которая открыла эту область.
- `context_status` — `active | synthetic`.
  - Если `LDD.<level>(...)` вызывается без active frame, runtime создаёт synthetic root frame и помечает его как `synthetic`.

### Path and depth

- Structured record должен содержать `pathSegments` и `depth`.
- Инварианты:
  - `depth` — 1-based.
  - `pathSegments.length === depth`.
  - synthetic frame может быть только root frame.

### Scope inheritance

- `scope` наследуется внутри boundary-области и расширяется при `scope('Child')`.
- Вложенные scope рендерятся как цепочка через `/` (например: `CheckoutForm/handleSubmit`).
- Для методов класса scope форматируется как `<ClassName>#<MethodName>` (например: `ImportService#importFile`).

### State and prev_state

- `prev_state` вычисляется в рамках `(parent_id, scope)` и начинается с `idle`.
- `state` задаётся вызовом `LDD.<level>(state, ...)` или синтетически добавляется boundary-wrapper-ом.
- Boundary-wrapper-ы используют синтетические состояния для lifecycle:
  - вход: `invoke`
  - успешный выход: `exit-ok`
  - выход через ошибку: `exit-err`

### Time

Structured record должен содержать:

- `time` (ISO) для сортировки и корреляции.
- Для boundary-wrapper-ов допускается вычислять и сохранять `duration` как `now - enteredAt` на terminal exit record.

---

## Примеры

### База

```ts
import { LDD } from '#logger/ldd';

LDD.debug('boot', 'Process', { argv: process.argv });
// LOG(debug): [0:1] [-] [idle → boot] Process {argv: <RedactedArgvArray>}

// Содержимое argv полезно только для глубокой диагностики ветвления, поэтому это именно debug.
const args = process.argv.slice(2);
const env = process.env;
LDD.info('parse', 'Capture args/env snapshot', { args, env });
// LOG(info): [0:2] [-] [boot → parse] Capture args/env snapshot {args: <RedactedArgsArray>, env: <RedactedEnvObject>}
```

### SCOPE

```ts
import { LDD } from '#logger/ldd';

// Логируем запуск скрипта с аргументами запуска
LDD.debug('boot', 'Capture argv snapshot', { argv: process.argv });
// LOG(debug): [0:1] [-] [idle → boot] Capture argv snapshot {argv: <RedactedArgvArray>}

// top-level executable file должен открыть явный root slice,
// чтобы bootstrap не падал в synthetic context и весь запуск CLI был восстановим как одна цепочка.
await LDD.scope('CliMain', async () => {
  LDD.info('start', 'Enter CLI root scope');
  // LOG(info): [<parent_id>:<log_id>] [CliMain] [idle → start] Enter CLI root scope

  const argv = process.argv.slice(2);

  // содержимое argv полезно только для глубокой диагностики ветвления, поэтому это именно debug.
  LDD.debug('argv-parsed', 'Normalize argv for routing', { argv });
  // LOG(debug): [<parent_id>:<log_id>] [CliMain] [start → argv-parsed] Normalize argv for routing {argv: <RedactedArgsArray>}

  if (!process.env.APP_CONFIG) {
    // приложение уходит в degraded startup path, но не падает;
    // warning нужен как side-effect log даже без prose message.
    LDD.warn('config-missing', 'Degraded startup: missing APP_CONFIG');
    // LOG(warn): [<parent_id>:<log_id>] [CliMain] [argv-parsed → config-missing] Degraded startup: missing APP_CONFIG
  }

  await runCli(argv);

  // нужен финальный маркер успешного завершения цепочки;
  // отдельный state transition здесь не нужен: само событие "done" закрывает цепочку.
  LDD.info('done', 'CLI finished');
  // LOG(info): [<parent_id>:<log_id>] [CliMain] [<prev_state> → done] CLI finished
});
```

### FUNCTION

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
  // Эти правила одинаковые для `LDD.fn` и `LDD.method`, и та же схема применяется для `LDD.scope(name, callback)`:
  // если последняя запись внутри scope содержит `ret`, то дополнительный synthetic exit-log не нужен.

  if (argv.length === 0) {
    // Тут мы создаем не просто запись в лог, но и помечаем, что тут мы вернули значение чтобы получить:
    //   LOG(warn): [<state> → fallback] Input path was not provided <RedactedReturnValue>
    // В это случае декоратор не добавляет дополнительный exit-ok
    return LDD.warn('fallback', 'Input path was not provided').ret('./input/default.json');
    // ВАЖНО: ".ret(<value>)" модифицирует детали лога и добавляет в них "ret" ключ с <value>
  }

  if (argv[0] === '--broken') {
    // LOG(error): [<state> → invalid-argv] Unsupported argv combination <RedactedErrorCause>
    // В это случае декоратор не добавляет дополнительный exit-err
    throw LDD.error('invalid-argv', 'Reject unsupported argv').ret(
      new Error('Unsupported argv combination', {cause: argv}),
    );
  }

  // Обычный выход с debug уровнем без дополнительного сообщения
  // LOG(debug): [<state> → exit-ok] <RedactedReturnValue>
  return argv[0];

  // Чтобы изменить уровень логирования, можно использовать и state
  return LDD.info('done', 'Resolved patch').ret(argv[0]);
  // LOG(info): [<state> → done] Resolved patch <RedactedReturnValue>
}

// Пример вызова без аргументов:
resolveInputPath();
// LOG(debug): [0:1] [resolveInputPath] [idle → invoke] {args: []}
// LOG(warn):  [1:2] [resolveInputPath] [invoke → fallback] Input path was not provided {ret: './input/default.json'}
```

### COMPONENTS

```tsx
import { LDD } from '#logger/ldd';

type CheckoutFormProps = {
  checkoutId: string;
};

function CheckoutForm({ checkoutId }: CheckoutFormProps) {
  const log = LDD.scope('CheckoutForm');

  // render-шум нельзя логировать без причины;
  // здесь оставлен только один debug discriminator, который объясняет ветвление UI.
  log.debug('render', 'Checkout form discriminator', { checkoutId });
  // LOG(debug): [<parent_id>:<log_id>] [CheckoutForm] [idle → render] Checkout form discriminator {checkoutId: <RedactedCheckoutId>}

  const handleSubmit = async () => {
    const submitLog = log.scope('handleSubmit');

    // nested handler должен жить в child scope,
    // чтобы AI отделял render path от user action path.
    submitLog.info('submit-started', 'Capture submit context', { checkoutId });
    // LOG(info): [<parent_id>:<log_id>] [CheckoutForm/handleSubmit] [idle → submit-started] Capture submit context {checkoutId: <RedactedCheckoutId>}

    try {
      const result = await submitOrder(checkoutId);

      submitLog.info('submit-succeeded', 'Record submit outcome', { orderId: result.orderId });
      // LOG(info): [<parent_id>:<log_id>] [CheckoutForm/handleSubmit] [submit-started → submit-succeeded] Record submit outcome {orderId: <RedactedOrderId>}
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));

      // thrown error нельзя подменять новым экземпляром;
      // сюда добавляется только бизнес-контекст конкретного submit action.
      throw submitLog.error('submit-failed', 'Attach checkout context', { checkoutId }).ret(error);
      // LOG(error): [<parent_id>:<log_id>] [CheckoutForm/handleSubmit] [submit-started → submit-failed] Attach checkout context {checkoutId: <RedactedCheckoutId>, ret: <RedactedError>}
    }
  };

  return <button onClick={() => void handleSubmit()}>Pay</button>;
}
```

### CLASS METHODS

```ts
import { LDD } from '#logger/ldd';

type ImportSummary = {
  imported: number;
  skipped: number;
};

@LDD.class('ImportService')
class ImportService {
  constructor(private readonly repo: ImportRepository) {}

  // LDD.method логирует вход/выход метода так же, как LDD.fn; если внутри метода уже был `.ret(...)`, то exit-log не дублируется.
  @LDD.method()
  protected async _persistRows(rows: CsvRow[]): Promise<ImportSummary> {
    // LOG(debug): [<parent_id>:<log_id>] [ImportService#_persistRows] [idle → invoke] {args: {rows: <RedactedRowsArray>}}

    try {
      return await this.repo.save(rows);
    } catch (cause) {
      // castError нужен, чтобы привести cause к Error (если он не Error), не потеряв стек, и при этом добавить fallback message.
      const error = LDD.castError(cause, new Error(`Failed to persist rows: ${cause}`, { cause }));

      // infrastructure failure должен быть поднят как terminal error
      // с доменным контекстом, но без замены исходного thrown instance.
      throw LDD.error('persist-failed', 'Annotate persistence error').ret(error);
      // LOG(error): [<parent_id>:<log_id>] [ImportService#_persistRows] [persisting → persist-failed] Annotate persistence error {ret: <RedactedError>}
    }
  }

  // redactArgs/redactReturn нужны, чтобы явно зафиксировать, какие поля мы хотим видеть в логах входа/выхода метода.
  // По умолчанию LDD сам делает safe-by-default redaction; эти хуки позволяют сузить форму и при необходимости точечно
  // пометить отдельные значения как safe-to-log через LDD.unsafeValue(...).
  @LDD.method({
    redactArgs: (sourcePath: string) => ({ sourcePath }),
    redactReturn: (summary: ImportSummary) => ({
      imported: summary.imported,
      skipped: summary.skipped,
    }),
  })
  async importFile(sourcePath: string): Promise<ImportSummary> {
    // LOG(debug): [<parent_id>:<log_id>] [ImportService#importFile] [idle → invoke] {args: {sourcePath: <RedactedSourcePath>}}

    const rows = await this.readRows(sourcePath);

    // row count нужен для deep diagnostics и performance triage, поэтому это debug.
    LDD.debug('rows-loaded', 'Measure import batch size', { rowCount: rows.length });
    // LOG(debug): [<parent_id>:<log_id>] [ImportService#importFile] [invoke → rows-loaded] Measure import batch size {rowCount: <RedactedRowCount>}

    if (rows.length === 0) {
      // controlled empty-source branch не является error,
      // но warning должен быть связан с фактическим fallback return.
      return LDD.warn('empty-source', 'Empty source; return fallback').ret({
        imported: 0,
        skipped: 0,
      });
      // LOG(warn): [<parent_id>:<log_id>] [ImportService#importFile] [rows-loaded → empty-source] Empty source; return fallback {ret: {imported: 0, skipped: 0}}
    }

    // Здесь отдельный лог не нужен: дальнейшая работа продолжается в другом scope (`ImportService#_persistRows`),
    // а вход/выход этого метода будет зафиксирован декоратором `@LDD.method()`.
    return this._persistRows(rows);
  }
}
```
