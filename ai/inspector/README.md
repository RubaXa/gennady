# ai/inspector

Инструмент-инспектор SDD-флоу: читает реальные `ai/skills/*/SKILL.md` и `ai/directives/sdd-v2/*.directive.xml`, строит дерево трейса (что грузится, какие тулы зовутся, как работают `LOGIC_SWITCH` и `READ_AND_USE`) и показывает его в браузере с разворачиванием веток.

**Не через SDD.** Это обычный инструмент: парсер на TS + статический UI. Цель — увидеть, как реально работают скилы и директивы, и где они кривые.

## Архитектура

```
ai/inspector/
├── core/                  # чистый TS, без DOM — парсер + модель
│   ├── model.ts           # TraceNode — узел дерева, который рисует UI
│   ├── parse-directive.ts # *.directive.xml → дерево (теги по порядку, аксиомы, halt, шаги, READ_AND_USE, switch)
│   ├── parse-skill.ts     # SKILL.md → узлы загрузчика (GATHER/PREFLIGHT/EMBODY)
│   ├── resolve.ts         # рекурсивный разворот READ_AND_USE (стоп на циклах)
│   └── __tests__/         # node:test на реальных файлах
├── generate.ts            # core по всем скилам → web/trace.json
├── web/                   # чистый HTML + ESM JS: список скилов → дерево трейса
└── e2e/                   # Playwright: открыть, развернуть, проверить + скриншот
```

Поток: `generate.ts` гоняет `core` по реальным файлам → `web/trace.json`. UI читает JSON и рисует дерево. Парсер — общий (любой скил/директива); где спотыкается — это и есть находка аудита.

## Стек

- TypeScript, запуск через `tsx` (как весь репо). Без отдельного `package.json`.
- Парсер: тесты `node:test` (`node --import tsx --test ai/inspector/core/__tests__/*.test.ts`).
- UI: чистый HTML + ES-модульный JS (без фреймворка и сборщика).
- E2E/визуал: Playwright (`@playwright/test`) — headless + скриншоты.

## Команды

```
# разбор + генерация модели
npx tsx ai/inspector/generate.ts            # → ai/inspector/web/trace.json
# юнит-тесты парсера
node --import tsx --test ai/inspector/core/__tests__/*.test.ts
# e2e (после: npm i -D @playwright/test && npx playwright install chromium)
npx playwright test ai/inspector/e2e
```
