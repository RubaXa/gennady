ОТЧЁТ 61/SO-14 — восемь имён команд разведены в help (Пачка 9)

СТАТУС: DONE

Рабочее дерево: `rc-v6`, ветка `lead/surface-locks`.

КОММИТ (локальный, НИЧЕГО не запушено):
- `9f61c159` feat(SO-14): disambiguate eight similarly-named CLI commands in help

---

## 1. Файлы

| Путь | Тип | Смысловое изменение | Чем доказано |
|---|---|---|---|
| `cli/cmd/orient/help.ts` | правка | Добавлена строка: «Not `sdd-orient` (that one navigates specs/design, not code — .spec.md graphs).» перед `Usage:`. | grep-замок ниже + ручной прогон `--help`. |
| `cli/cmd/sdd-migrate/help.ts` | правка | Добавлены 2 строки: «Not `sync`/`sync-skills` (unrelated: those mirror the npm package into the current project) — sdd-migrate rewrites this repository's own SDD artifacts.» | То же. |
| `cli/cmd/sdd-sync/help.ts` | правка | Добавлены 2 строки: «Not `sync`/`sync-skills` (those mirror ai/directives/ai/skills from the npm package) — sdd-sync never touches package files, only tracker rows for one ticket.» | То же. |
| `cli/cmd/sync/help.ts` | правка | Добавлены 3 строки: «Not `sync-skills` (…) and not `sdd-sync` (unrelated: propagates one ticket Status into `*.3-tasks.md` trackers).» | То же. |
| `specs/cli/cli.spec.md` | правка | §9.1 модуль-карта: `sync-skills` дополнен фразой размежевания с `sync`/`sdd-sync`; добавлены две отсутствовавшие строки-предмета — `sdd-sync` (tracker-status/rollup) и `sdd-migrate` (детерминированная миграция v1→v2, не sync и не back-sync). | Регресс-тест п.2 ниже. |
| `cli/cmd/help/__tests__/command-name-disambiguation.test.ts` | новый | Grep-замок: для 7 конкретных имён (`sync`, `sync-skills`, `sdd-sync`, `sdd-migrate`, `orient`, `sdd-orient`, `agents-rules`) в двух поверхностях — мастер-листинг `cli/cmd/help/help.cmd.ts` и модуль-карта `cli.spec.md` §9.1 — извлекает описание и требует: (1) все 7 присутствуют и ни одна пара описаний не совпадает дословно; (2) отложенное имя `sdd-rules` отсутствует в обеих поверхностях. | `node --import tsx --test cli/cmd/help/__tests__/command-name-disambiguation.test.ts` — 2/2 (см. §3). |

`git show --stat 9f61c159`: 6 файлов изменены, 140 insertions(+), 1 deletion(-) — совпадает.

**Важное наблюдение:** мастер-листинг `cli/cmd/help/help.cmd.ts` уже содержал все 7 имён с различающимися описаниями (унаследовано из предыдущих пачек, не трогалось в SO-14) — новый lock подтверждает это состояние, не требуя правки самого файла.

---

## 2. Архитектура было / стало

### Было — четыре `*sync*`-имени и три `*orient*`-имени без явного размежевания

```mermaid
flowchart LR
  U["Пользователь: npx gennady sdd-sync --help"]
  H1["cli/cmd/sdd-sync/help.ts — 'Propagate a ticket Status into the *.3-tasks.md trackers' (без cross-ref)"]
  CONF["Читается как ЧАСТЬ package-sync-семейства (sync/sync-skills) — T-B6-28"]
  U --> H1 --> CONF
  style CONF fill:#611,stroke:#f66,color:#fff
```

### Стало — каждое из 8 имён (7 конкретных + отложенный `sdd-rules`) — один явный предмет

```mermaid
flowchart LR
  U["Пользователь: npx gennady sdd-sync --help"]
  H1["cli/cmd/sdd-sync/help.ts:11-13 — явный 'Not sync/sync-skills … sdd-sync never touches package files'"]
  MAP["specs/cli/cli.spec.md §9.1 — sdd-sync описан как tracker-rollup, sdd-migrate как детерминированная миграция репозитория"]
  LOCK["cli/cmd/help/__tests__/command-name-disambiguation.test.ts — читает help.cmd.ts + cli.spec.md, требует 7 уникальных описаний и отсутствие sdd-rules"]
  U --> H1
  H1 --> MAP
  MAP --> LOCK
  LOCK -->|"assert.deepEqual(missing, []) + assert.deepEqual(overlaps, [])"| PASS["PASS"]
  style PASS fill:#163,stroke:#3a3,color:#fff
```
Узлы: `cli/cmd/help/help.cmd.ts:31,34,40,42,49,51,53` (7 строк мастер-листинга, без правок в этой задаче), `specs/cli/cli.spec.md` §9.1 (2 новые строки-предмета), 4 файла `help.ts` (по одной cross-ref фразе каждый).

---

## 3. Доказательства (ПРИЁМКА: «grep-замок: каждое из восьми имён в help описано одной строкой без пересечения»)

```
$ node --import tsx --test --experimental-test-module-mocks cli/cmd/help/__tests__/command-name-disambiguation.test.ts
✔ command name disambiguation (SO-14) > describes each of the four *sync*-shaped and three *orient*-shaped names as one distinct subject in `npx gennady help`
✔ command name disambiguation (SO-14) > describes each of the same seven names as one distinct subject in the cli module map
# pass 2, # fail 0
```
exit 0. **ВЫПОЛНЕНО.** (Восьмое имя, `sdd-rules`, — отложенная тема реестра правил §3.1; в help не пишется, как и требует бриф; лок явно это проверяет вторым `assert.doesNotMatch` в каждом `it`.)

---

## 4. Отклонения и открытые вопросы

Нет отклонений. `agents-rules` (будущее переименование в `agents-orient` — T-10) в этой задаче НЕ переименовывалось — брифом не требовалось, T-10 остаётся отдельной задачей. `sync-skills`/`sdd-orient`/`agents-rules` не имеют собственных `--help` cross-ref строк (у `sync-skills` и `agents-rules` вообще нет отдельного `help.ts` — их справка живёт только в мастер-листинге и `cli.spec.md`, оба уже покрыты локом); это не пробел брифа, а структурное свойство CLI.

Координация зафиксирована в брифе и подтверждена кодом: `T-B6-28` (тот же словарь `sdd-sync`) и `T-10` (`agents-rules`→`agents-orient`) не пересекаются файлами с этим коммитом.

Команда пуша для Lead: `git -C rc-v6 push origin lead/surface-locks` (единый push всей пачки 9).
