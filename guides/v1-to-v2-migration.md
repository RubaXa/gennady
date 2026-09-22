# Миграция SDD v1 → v2 перед синхронизацией

`gennady sync` и `gennady sync-skills` устанавливают SDD v2. Они не смешивают новый runtime со
старым layout: если в корне проекта существует каталог `tasks/`, обе команды завершаются с кодом 1
до записи файлов.

## Почему sync не мигрирует проект сам

Синхронизация знает, какими пакетными файлами она владеет, но не может выбрать semantic owner,
новые Task ID или назначение старого тикета. `.claude/skills/.gennady-synced` помогает отличать
установленные sync файлы от проектных; он не доказывает, что спецификации и тикеты уже мигрированы.

## Воспроизводимый путь

Работайте в чистой ветке и сохраняйте generated migration layer в репозитории:

```bash
npx gennady sdd-migrate plan .
npx gennady sdd-migrate plan . --write
npx gennady sdd-migrate plan . --verify
```

Заполните созданный `migration/README.md` и карты, получите требуемое подтверждение оператора, затем
выполняйте перечисленные там `anchors`, `ids` и `move` шаги. Каждая команда сначала запускается без
`--write`; запись разрешается только после чистого dry-run. Не удаляйте `tasks/` вручную: штатный
последний `move` удаляет опустевший layout после своих preflight-проверок.

## Условие завершения

```bash
npx gennady sdd-state .
npx gennady sdd-check --all .
npx gennady sdd-migrate plan . --verify
```

Продолжайте только когда state сообщает `FLOW_VERSION=v2`, `tasks/` отсутствует, проверка V2 чиста,
а повторный migration dry-run является no-op. После этого безопасно выполнить:

```bash
npx gennady sync --dry-run
npx gennady sync
npx gennady sync-skills --dry-run
npx gennady sync-skills
```

Dry-run остаётся обязательным предпросмотром изменений sync, но не является обходом V1-защиты.
