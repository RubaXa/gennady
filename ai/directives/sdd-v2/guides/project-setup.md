# Настройка проекта под SDD v2

> Когда нужно: `gennady sdd-state .` показал `READINESS=not-ready` — нет обязательных npm-скриптов, и флоу остановился, не найдя чем верифицировать код.

SDD v2 поддерживает только Node.js. Проект обязан объявить в `package.json#scripts` восемь точных «кирпичей» readiness:

| скрипт          | назначение                                                                   |
| --------------- | ---------------------------------------------------------------------------- |
| `type-check`    | проверка типов без эмита (`tsc --noEmit`); принимается написание `typecheck` |
| `test`          | прогон тестов                                                                |
| `test:coverage` | тесты с покрытием, пишет отчёт в `coverage/`                                 |
| `format`        | форматтер в режиме **проверки** — read-only, без записи                      |
| `format:fix`    | форматтер в режиме записи — обязан нести `--write`/`--fix`/`--autofix`       |
| `lint`          | линт, **в цепочке которого вызывается `gennady` lint** (DbC), read-only      |
| `lint:fix`      | автофикс линтера — обязан нести `--write`/`--fix`/`--autofix`                |
| `fix`           | единая whole-project починка: `format:fix`, затем `lint:fix`, с roots здесь  |

Ключевая пара — `format` / `format:fix` (и так же `lint` / `lint:fix`): проверяющий скрипт не должен ничего переписывать, а чинящий обязан. Скрипт `format`, который на самом деле пишет (`prettier --write .`), — ошибка конфигурации, а не мелочь: лестница использует его как read-only ступень финального вердикта.

Фаза передаёт `sdd-verify` точные Target Files через проектные repair bricks. Поэтому реальные `format:fix`/`lint:fix` объявляются как command prefixes: write-switch стоит последним, а цели добавляет вызывающий. Статическая проверка честно ловит shell-chain и очевидные `.`/directory/glob operands, но не может универсально отличить точечный baked target от tool config/subcommand. Обязательный whole-project `fix` сам передаёт широкие roots. Затем types/tests запускаются один раз.

## Минимальный пример

```json
{
  "scripts": {
    "type-check": "tsc --noEmit",
    "test": "node --import tsx --test",
    "test:coverage": "c8 --reporter=json node --import tsx --test",
    "format": "prettier --check .",
    "format:fix": "prettier --write",
    "lint": "gennady lint src/",
    "lint:fix": "eslint --fix",
    "check": "npx gennady sdd-verify --profile full",
    "fix": "npm run format:fix -- . && npm run lint:fix -- src/"
  }
}
```

`lint` может достигать `gennady` напрямую или через `npm run <x>`-цепочку — это и проверяет sdd-state (`lint→gennady`).

## Три уровня готовности

`sdd-state` различает три состояния, а не два:

- `not-ready` — каких-то кирпичей нет вовсе (включая public `fix`), `format`/`lint` пишут, repair leaf не мутирует/содержит очевидный broad target, либо `fix` нарушает formatter→linter order. Кодовые фазы не идут.
- `provisional` — все восемь объявлены, но часть из них — заглушки. Bootstrap/config/doc-фазы и `scaffold` идут; кодовые фазы ждут реальные инструменты.
- `ready` — все восемь реальные. Только здесь исполняются кодовые фазы.

Заглушки — легальный промежуточный шаг: они позволяют разложить проект по спекам и нарезать тикеты до того, как выбран тулинг. Заменяет их infra-флоу, и `sdd-state` печатает список оставшихся заглушек — это и есть его список работ.

## Проверка

```bash
gennady sdd-state .
```

`[READINESS]` покажет `✔` по каждому требуемому скрипту, `lint→gennady ✔` и итоговую строку `READINESS=ready` (либо `provisional` со списком заглушек).

Если тулинга ещё нет вообще — заведите infrastructure-scope: `gennady` → роутер → infra-флоу (ставит TS / тест-раннер / линт / формат целиком, со спекой). Этот гайд — быстрый фикс под уже существующий тулинг.
