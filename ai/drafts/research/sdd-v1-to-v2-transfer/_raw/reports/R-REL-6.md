ОТЧЁТ 61 §1 — REL-6: `yaml` devDependency зафиксирован точной версией `2.9.0`

СТАТУС: DONE

Рабочее дерево: `rc-w2`. Ветка `lead/release-package` (см. R-REL-2.md за деталями создания).

КОММИТ (локальный, НИЧЕГО не запушено):
- `591ccb8c805522411eab88e015f32c925c8a1de5` fix(REL-6): exact-pin yaml devDependency to 2.9.0

---

## 1. Файлы

| Путь | Тип | Смысловое изменение | Чем доказано |
|---|---|---|---|
| `package.json` | правка | `"yaml": "^2.9.0"` → `"yaml": "2.9.0"` (devDependencies) — точный пин вместо диапазона, т.к. `yaml` бандлится в `dist` (инвариант P6). | `npm run build:publish` (build+build:types+prepare-publish-artifacts) успешен; `node_modules/yaml/package.json` резолвится в ровно `2.9.0`. |
| `package-lock.json` | правка | Зеркальная строка в `packages[""].devDependencies` синхронизирована с package.json. Точечная правка вручную (НЕ через `npm install --package-lock-only`) — та команда потянула ~66 несвязанных строк опциональных `@tailwindcss/oxide-wasm32-wasi` под-транзитивов, которых не было в текущем lockfile; отброшено как посторонний шум, не относящийся к REL-6. | `git diff --stat` — 2 файла, по 1 изменённой строке каждый (см. ниже); `npm run build:publish` подтверждает, что резолв не сломан. |

`git diff --stat origin/codex/sdd-v2-rc52-followup lead/release-package -- package.json package-lock.json`:
```
 package-lock.json | 2 +-
 package.json      | 2 +-
 2 files changed, 2 insertions(+), 2 deletions(-)
```
2 файла из диффа — 2 строки таблицы. Совпадает.

---

## 2. Архитектура было / стало

### Было — диапазон допускает дрейф версии между установками

```mermaid
flowchart LR
  PKG["package.json devDependencies:\n\"yaml\": \"^2.9.0\""]
  LOCK["package-lock.json:\nyaml resolved 2.9.0 (сегодня)"]
  BUNDLE["vite build → bundled into dist/*.js"]
  PKG -.->|"^2.9.0 допускает 2.9.x/2.x при следующем npm install без lock"| LOCK
  LOCK --> BUNDLE
```

### Стало — точный пин, инвариант P6 восстановлен

```mermaid
flowchart LR
  PKG["package.json devDependencies:\n\"yaml\": \"2.9.0\" (точно)"]
  LOCK["package-lock.json:\nyaml resolved 2.9.0"]
  BUNDLE["vite build → bundled into dist/*.js"]
  PKG -->|"точный пин, дрейфа нет"| LOCK
  LOCK --> BUNDLE
```
Узлы: `package.json:121` (`"yaml": "2.9.0"`), `package-lock.json:60` (зеркало в `packages[""].devDependencies`).

---

## 3. Доказательства (команды из ПРИЁМКИ, фактический вывод, exit-код)

**1. `build:publish` smoke (заявленный критерий приёмки — «пакет собирается с ровно этой версией»).**
```
$ npm --prefix rc-w2 run build:publish
✓ built in 2.81s
> build:types
> tsc -p tsconfig.types.json && node --import tsx scripts/normalize-dts-imports.ts
(dist/index.d.ts создан)
$ node -e "console.log(require('rc-w2/node_modules/yaml/package.json').version)"
2.9.0
```
exit 0. ВЫПОЛНЕНО.

**2. Полный прогон `npm run check` на коммите.**
```
[sdd-verify] ✅ ALL PASS (5/5)
  ✅ type-check (4.4s)  ✅ test:coverage (42.1s)  ✅ lint (2.6s)  ✅ format (1.7s)  ✅ yagni (0.6s)
```
exit 0. ВЫПОЛНЕНО.

**3. Коммит через `pre-commit` целиком, без `--no-verify`.**
```
$ git -C rc-w2 commit -m "fix(REL-6): ..."
✅ Pre-commit passed
[lead/release-package 591ccb8c] fix(REL-6): exact-pin yaml devDependency to 2.9.0
 2 files changed, 2 insertions(+), 2 deletions(-)
```
exit 0. ВЫПОЛНЕНО.

---

## 4. Отклонения, открытые вопросы, команды пуша

**Отклонения:**
- `npm install --package-lock-only` был опробован первым и отброшен — он подтянул ~66 строк несвязанных опциональных `@tailwindcss/oxide-wasm32-wasi` под-зависимостей (платформенно-специфичные, ранее отсутствовавшие в закоммиченном lockfile этого окружения), не имеющих отношения к `yaml`. Вместо этого правка сделана точечно вручную в обеих строках (`package.json` + зеркало в `package-lock.json`), т.к. установленная версия уже фактически была `2.9.0` — резолву неоткуда было измениться.

**Команды пуша для Lead** — см. сводный отчёт `R-BATCH-02-release-package.md`.
