# Настройка проекта под SDD v2

> Когда нужно: `gennady sdd-state .` показал `READINESS=not-ready` — нет обязательных npm-скриптов. Роутер остановился (`H_NOT_READY`) и привёл сюда.

SDD v2 поддерживает только Node.js. Проект обязан объявить в `package.json#scripts` **точные** имена (sdd-state проверяет точное совпадение — без угадывания `type-check`/`tsc`/и т.п.):

| скрипт          | назначение                                                   |
| --------------- | ------------------------------------------------------------ |
| `typecheck`     | проверка типов без эмита (`tsc --noEmit`)                    |
| `test`          | прогон тестов                                                |
| `test:coverage` | тесты с покрытием                                            |
| `lint`          | линт, **в цепочке которого вызывается `gennady` lint** (DbC) |
| `format`        | форматирование, **которое фиксит** (не только проверяет)     |

## Минимальный пример

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "node --import tsx --test",
    "test:coverage": "c8 node --import tsx --test",
    "lint": "npm run format && npm run typecheck && gennady lint cli/ shared/",
    "format": "prettier --write ."
  }
}
```

`lint` должен достигать `gennady` напрямую или через `npm run <x>`-цепочку — это и проверяет sdd-state (`lint→gennady`).

## Проверка

```bash
gennady sdd-state .       # должно стать READINESS=ready
```

`[READINESS]` покажет `✔` по каждому требуемому скрипту и `lint→gennady ✔`.

## Полный бутстрап (новый проект)

Если тулинга ещё нет вообще — заведите infrastructure-scope: `gennady` → роутер → infra-флоу (ставит TS / тест-раннер / линт / формат целиком, со спекой). Этот гайд — быстрый фикс под уже существующий тулинг.
