# Миграция SDD v1 → v2

Детерминированный, верифицируемый runbook. Каждый шаг: что делать (тул ИЛИ ручной рецепт) + как проверить. Запускать из корня проекта. Всё под git — откат всегда возможен.

> Когда нужно: `gennady sdd-state .` показал `FLOW_VERSION=v1` (есть `tasks/`) — роутер остановился (`H_V1_REPO`) и привёл сюда.

Легенда: 🤖 — детерминированный шаг (тул/команда) · ✍️ — семантический (суждение оператора/агента) · ✅ — проверка.

---

## Что меняется

- `tasks/<scope>/<module>.task-NN.md` → co-located `specs/<scope>/<module>/` + индексы `*.3-tasks.md`
- Task-ID: `TSK-NN` (или `<ACR>-NNN` в других репо) → `<ACR>-<slug>` (семантический)
- v1-тикеты получают `<!--SECTION:-->` якоря (v2-тулы их требуют)
- operator-проза → плоский инженерный русский

## Что НЕ трогаем

- `D-NNN` (decision-id, spec-local) — остаются
- `FR-NN` / `NFC-NN` / `AB`/`DC`/… (требования/критерии/сценарии в спеках) — остаются (опц. phase-2 reformat в BDD `<ACR>-REQ-N`)
- `UTF-8`, `UTF-16` и пр. — это НЕ id, не заменять

---

## Шаг 0 — baseline ✅

Зафиксировать исходное состояние (для сравнения в конце):

```bash
gennady sdd-state .                                   # FLOW_VERSION=v1, READINESS=...
grep -rhoE '\bTSK-[0-9]+' specs tasks cli shared services ai | sort -u | wc -l   # сколько уник. task-id
```

## Шаг 1 — якоря 🤖 (тул готов)

v1-тикеты без `<!--SECTION:-->` невидимы v2-тулам. Заякорить:

```bash
gennady sdd-migrate anchors --all .            # DRY-RUN: что заякорит / что skip (уже заякорено)
gennady sdd-migrate anchors --all . --write    # применить
```

✅ Проверка:

```bash
gennady sdd-check --all      # баланс якорей должен быть clean
```

Голые тикеты заякорятся; newer-с-якорями — `skip` (идемпотентно).

## Шаг 2 — slug-map ✍️ (семантика, вручную/агентом)

Для каждого уникального task-id дать осмысленный slug. Формат `migration-map.tsv` (TAB-разделитель, `<старый-id>\t<ACR>-<slug>`):

```
TSK-31	cat-vcs-url
TSK-49	lint-resolve-targets
TSK-55	orient
TSK-35	agent-mon-model-contracts
TSK-27	vcs-client-types
```

Правила:

- `<ACR>` — акроним scope/модуля (`cat`, `lint`, `orient`, `vcs-client`, …); `<slug>` — короткая фича из `Meta.Purpose` тикета, kebab-case.
- slug **уникален в рамках scope** (это и есть Slug Registry; одинаковый slug в двух ветках = «одна фича»).
- Источник истины — `Meta.Purpose` каждого тикета:
  ```bash
  for f in $(find tasks -name '*.task-*.md'); do
    grep -m1 'Task-ID:' "$f"; grep -m1 'Purpose:' "$f"; echo "---"
  done
  ```
  Пример (реальный): TSK-31 «флаг `--url` в `cat`: MR/PR → файлы» → `cat-vcs-url`.

## Шаг 3 — замена id 🤖/✍️

**Тул-режим `sdd-migrate ids --map migration-map.tsv` — в разработке.** Пока ручной рецепт (детерминированный, безопасный):

```bash
# Заменяем ТОЛЬКО точные id из map, по словогранице (\b) — поэтому UTF-8 и частичные совпадения НЕ затрагиваются.
while IFS=$'\t' read -r old new; do
  [ -z "$old" ] && continue
  grep -rlE "\b${old}\b" specs tasks cli shared services ai 2>/dev/null \
    | xargs -I{} sed -i '' -E "s/\b${old}\b/${new}/g" {}
done < migration-map.tsv
```

> ⚠️ НИКОГДА не заменять по общему паттерну `TSK-[0-9]+` вслепую — только конкретные id из map со словогранью. Иначе риск задеть чужое.

✅ Проверка (ноль исходных task-id):

```bash
grep -rhoE '\bTSK-[0-9]+' specs tasks cli shared services ai | sort -u    # должно быть пусто
gennady sdd-check --all                                                    # ссылки/структура clean
```

## Шаг 4 — структурный переезд 🤖/✍️ (move + индексы)

**Тул-режим `sdd-migrate move` — в разработке.** Пока рецепт:

- Перенести каждый `tasks/<scope>/<module>/*.task-*.md` (теперь заякоренный, с slug-id) в co-located `specs/<scope>/<module>/` через `git mv` (имя файла — по slug).
- Из `tasks/<scope>/README.md`-трекеров собрать индексы `specs/<scope>/<scope>.3-tasks.md` и `specs/<scope>/<module>/<module>.3-tasks.md` (формат — `MODULE_TASKS_INDEX_STRUCTURE` / `SCOPE_TASKS_INDEX_STRUCTURE`).
- Удалить опустевшее `tasks/`.

✅ Проверка:

```bash
gennady sdd-state .          # FLOW_VERSION должен стать v2 (нет tasks/)
```

## Шаг 5 — язык ✍️ (семантика)

Operator-проза (Vision, тикеты, отчёты, halt-сообщения, тела BDD-сценариев) → плоский инженерный русский:

- без метафор и англо-калек: «текст», не «проза»; «сохранить узел», не «реифицировать»; «подтверждение», не «аппрув».
- код, id, статус-токены, BDD-ключевые-слова, пути — на English.
- коротко и прямо; убрать украшательства.

Найти кандидатов на чистку (англицизмы-транслит):

```bash
grep -rniE 'аппрув|реифиц|пайплайн|чек(ать|нуть)|фиксить|дроп(ать|нуть)' specs
```

✅ Проверка — ревью оператором (это судительный шаг, не автоматический).

## Шаг 6 — финальная верификация ✅

```bash
gennady sdd-state .          # FLOW_VERSION=v2 · READINESS=ready
gennady sdd-check --all      # clean
grep -rhoE '\bTSK-[0-9]+|\.task-[0-9]+\.md' specs cli shared services ai    # пусто (нет старых id/имён)
```

Готово, когда все три зелёные.

---

## Заметки

- Сетап скриптов (если `READINESS=not-ready`) — выполняет живой флоу `readiness.directive.xml` (двери уходят в него сами; отдельный гайд-файл не нужен).
- `sed -i ''` — синтаксис BSD/macOS; на GNU/Linux — `sed -i`.
- Шаги 1, 3, 6 — детерминированы и проверяемы тулами; 2, 4(частично), 5 — требуют суждения. Тул-режимы `ids`/`move` заменят ручные рецепты по мере готовности (см. `ai/sdd-v2-plan.md`).
