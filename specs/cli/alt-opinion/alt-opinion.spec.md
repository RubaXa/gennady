# alt-opinion: Module Specification

## scope-type

product

## module-type

command (cli/cmd/alt-opinion/)

## 1. Purpose

Команда `gennady alt-opinion` — получение альтернативных мнений от AI-моделей на переданный артефакт с опциональным синтезом.

## 2. Entity Inventory

| Entity                 | Source                | Purpose                                                                              |
| ---------------------- | --------------------- | ------------------------------------------------------------------------------------ |
| `AltOpinionProvider`   | alt-opinion.types.ts  | Union: `'llmproxy' \| 'openrouter'`                                                  |
| `AltOpinionModel`      | alt-opinion.types.ts  | Дескриптор модели: provider, model, promptPath?                                      |
| `AltOpinionResult`     | alt-opinion.types.ts  | Discriminated union: success с content или error                                     |
| `AltOpinionReport`     | alt-opinion.types.ts  | Агрегированный отчёт: results, exitCode, synthContent?                               |
| `AltOpinionParsedArgs` | alt-opinion.types.ts  | Распарсенные CLI-аргументы                                                           |
| `AltOpinionModelPort`  | alt-opinion.types.ts  | DI-интерфейс для AI-вызовов: `generate(prompt) → { content, usage?, finishReason? }` |
| `AltOpinionTelemetry`  | alt-opinion.types.ts  | Метрики вызова: wallMs, promptTokens?, completionTokens?, finishReason?              |
| `AltOpinionCmdDeps`    | alt-opinion.cmd.ts    | DI-зависимости CLI-обвязки: stdinContent, readFile                                   |
| `run`                  | alt-opinion.cmd.ts    | CLI entry point: парсинг, создание провайдеров, вызов runner, форматирование вывода  |
| `RunAltOpinionDeps`    | alt-opinion-runner.ts | DI-зависимости раннера                                                               |
| `parseAltOpinionArgs`  | alt-opinion-parser.ts | Парсер CLI-аргументов с :: синтаксисом                                               |
| `runAltOpinion`        | alt-opinion-runner.ts | Ядро: параллельный опрос + синтез                                                    |
| `queryModel`           | alt-opinion-runner.ts | Внутренний helper: вызов одной модели                                                |
| `sanitizeArtifact`     | alt-opinion-runner.ts | Санитизация от prompt injection                                                      |

## 3. Public Surface (Contracts)

### parseAltOpinionArgs

```
(rawArgs: string[], opts?: { stdinContent?: string }) => AltOpinionParsedArgs
```

- Парсит --model, --synthModel, --file, --modelPrompt, --synthPrompt, --strict
- Валидирует provider, ::-синтаксис, взаимоисключение stdin/--file
- Бросает Error с понятным сообщением при невалидных аргументах

### AltOpinionModelPort

```typescript
interface AltOpinionModelPort {
  generate(
    prompt: string
  ): Promise<{
    content: string;
    usage?: { promptTokens: number; completionTokens: number };
    finishReason?: string;
  }>;
}
```

### AltOpinionTelemetry

```typescript
type AltOpinionTelemetry = {
  wallMs: number;
  promptTokens?: number;
  completionTokens?: number;
  finishReason?: string;
};
```

### AltOpinionResult

Расширен полем `telemetry?: AltOpinionTelemetry`.

### runAltOpinion

```
(args: AltOpinionParsedArgs, deps: RunAltOpinionDeps) => Promise<AltOpinionReport>
```

- Параллельный опрос моделей через Promise.allSettled
- При --synthModel: собирает успешные мнения → синтез → только синтез-блок
- Ошибка/таймаут → описание в блоке, не прерывает остальные
- --strict: exit 1 при любой ошибке; без: exit 1 только если все упали

## 4. Architecture

```
cli/cmd/alt-opinion/
├── index.ts                    # import './alt-opinion.cmd.ts'
├── alt-opinion.cmd.ts          # CLI-обвязка (TSK-24)
├── alt-opinion.types.ts        # Типы (TSK-23 P1)
├── alt-opinion-parser.ts       # Парсер (TSK-23 P1)
├── alt-opinion-runner.ts       # Ядро (TSK-23 P2)
├── prompts/
│   ├── default-opinion.prompt.md   # Дефолтный промпт мнения (TSK-24)
│   └── default-synth.prompt.md     # Дефолтный промпт синтеза (TSK-24)
└── __tests__/                  # Тесты (TSK-25)
```

**Note:** Дефолтные промпты зашиты как константы в `alt-opinion-runner.ts` (D-004). Файлы в `prompts/` — опциональный механизм переопределения, не обязательны для v1.

## 5. Dependencies

- `ai` (^6.0.116) — Vercel AI SDK, бандлится Vite
- `@ai-sdk/openai` (^3.0.41) — провайдер для llmproxy/OpenRouter
- `#logger` — сервис логирования

## 6. Decision Log

### D-004 — Embedded prompts as constants

- **Status:** active
- **Recorded:** session Discovery, cli, refine (alt-opinion), TSK-23
- **Why:** Дефолтные промпты зашиты как TypeScript-константы в runner, а не вынесены в файлы `prompts/`. Это позволяет избежать файлового I/O для дефолтного случая и упрощает бандлинг (Vite инлайнит строки). Файлы `prompts/` — опциональный override для пользователя через `--modelPrompt`/`--synthPrompt`.
- **Risk accepted:** При изменении дефолтных промптов потребуется изменение кода и пересборка. Пользовательские промпты через файлы не затронуты.

### D-005 — Telemetry in opinion blocks

- **Status:** active
- **Recorded:** session Discovery, cli, refine (alt-opinion telemetry), TSK-26
- **Why:** Каждый opinion-блок (включая синтез) завершается строкой `<!--TELEMETRY wall=<N>ms tokens=<prompt>/<completion> reason=<finishReason>-->`. `AltOpinionModelPort.generate()` возвращает `{ content, usage?, finishReason? }` вместо сырой строки. Wall time меряется через `performance.now()` до/после вызова порта. При отсутствии usage строка содержит только wall и reason.
- **Risk accepted:** Телеметрия опциональна — если провайдер не возвращает usage, блок формируется без токенов. Формат телеметрии — HTML-комментарий для machine-readable парсинга без нарушения markdown-рендеринга.
