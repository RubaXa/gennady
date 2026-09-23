# Миграция SDD v1 → v2 перед синхронизацией

`gennady sync` и `gennady sync-skills` устанавливают полный обычный SDD v2 runtime. Они не смешивают
его с живым V1 layout: если в корне существует `tasks/`, обе команды завершаются с кодом 1 до записи.
Для перехода служит отдельный transactional bootstrap внутри `sdd-migrate`.

## Почему sync не мигрирует проект сам

Синхронизация знает, какими пакетными файлами она владеет, но не может выбрать semantic owner,
новые Task ID или назначение старого тикета. `.claude/skills/.gennady-synced` помогает отличать
установленные sync файлы от проектных; он не доказывает, что спецификации и тикеты уже мигрированы.

## Воспроизводимый путь

Работайте в чистой ветке и сохраняйте generated migration layer в репозитории:

```bash
npx gennady sdd-migrate bootstrap .
npx gennady sdd-migrate bootstrap . --write
npx gennady sdd-state . # FLOW_VERSION=v1, но локальный migration runtime уже свежий
npx gennady sdd-migrate plan .
npx gennady sdd-migrate plan . --write
npx gennady sdd-migrate plan . --verify
```

Bootstrap берёт assets из того же установленного npm package, чей CLI запущен: ставить старые skills
через sync заранее не нужно. Он удаляет только V1 runtime, доказанный ownership-манифестом или exact
SHA-256 известного последнего V1 package snapshot, и устанавливает полный текущий набор
`ai/directives/sdd-v2/**` + `ai/skills/**`. `specs/**`, `tasks/**` и код проекта не являются target.
Неизвестная версия, локально изменённый runtime, лишний helper или symlink дают `BLOCKED` до первой
записи: сохраните локальные изменения отдельно и повторите bootstrap; автоматического угадывания нет.

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

Dry-run остаётся обязательным предпросмотром. Обычный sync не обходит V1-защиту: его очередь наступает
только после штатного последнего `move`, удалившего опустевший `tasks/`.
