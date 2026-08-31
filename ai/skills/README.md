# ai/skills — AI-навыки для агентов

12 навыков (8 SDD + agent-inbox + opencode-get-session + prd-interview + workspace-permission-setup) для Specification-Driven Development и настройки автономной среды.

> `workspace-permission-setup` мигрирован в хранилище из `~/.claude/skills` — теперь под git и деплоится через `sync-skills`.

---

## Типовые сценарии (Use Cases)

### 1. Спроектировать новый модуль с нуля

```bash
npx gennady sync-skills
```

Затем в агенте: «@sdd создай проект» → «@sdd спроектируй scope vcs-client» → «@sdd разбей vcs-client на модули». Дальше happy-path идёт внутри SDD flow: integrated review scope + всех module specs → scaffold feasibility critic + Gate 2 → automatic `sdd-execute` в той же сессии. Отдельный `@sdd-critic` — on-demand проверка, а не обязательная ступень этого пути.

Router — единственная дверь для routing/session policy. `@sdd` передаёт ему свободный intent;
stateful direct entries `@sdd-scaffold` / `@sdd-execute` / `@sdd-critic` / `@sdd-reconcile`
передают forced intent. Каждый связывает единственный начальный `sdd-state` с result alias
`routerState`; router потребляет эти exact bytes и не повторяет initial call. Refresh допустим только
после подтверждённой preflight-мутации. Результат такой ветки буферизуется до выбора совместимой session
или успешного `open`, поэтому первый not-ready прогон не вызывает `log` раньше создания session.

| Шаг | Навык | Что делает |
| --- | ----- | ---------- |
| 1 | `sdd` | Инициализирует портал, проектирует/эволюционирует scope, декомпозирует на модули и проводит integrated review scope + всех module specs |
| 2 | `sdd-scaffold` | Генерирует DAG тасков, запускает feasibility critic, проводит Gate 2 и автоматически передаёт управление execute в той же сессии |
| 3 | `sdd-execute` | Исполняет один таск или всю pickable-очередь: dispatch фаз → audit → code-review |
| on-demand | `sdd-critic` | Проверяет bounded target-set отдельно от happy-path: до пяти автоматических раундов; CLEAN завершает раньше; после пятого продолжение возможно только по точной авторизации оператора |

### 2. Выполнить задачу (одну или всю очередь)

```
@sdd-execute TSK-03
@sdd-execute всю очередь
```

Или: «выполни следующую», «execute pickable», «выбери что делать дальше», «выполни всю очередь».

Один навык на оба режима: LOGIC-SWITCH на intent (Task-ID / `next` / `batch`/`all`/`queue`) решает — одиночный таск или вся pickable-очередь. Параллельный dispatch разрешён только когда одновременно не пересекаются Target Files и различаются next-worker session keys `(spec, kind)`; иначе таски сериализуются. Навык читает таск(и), диспатчит фазы одну за другой, закрывает round, диспатчит fresh-eyes audit + code-review.

Пустой `/sdd-execute` — это запрос карты выбора, а не неявный `next`: после обязательной карточки
router показывается shortlist из execution map и выполнение ждёт явного выбора. `next` / `pick`
автовыбирает задачу только когда pickable-строка ровно одна; несколько строк останавливаются с
`H_AMBIGUOUS_TASK` и путями тикетов.

### 3. Проверить качество спеки / таска

```
@sdd-critic проверь спеку cli/cli.spec.md
@sdd-critic проверь таск TSK-03
```

Многораундовая критика следует lifecycle, загружаемому навыком; cap и continuation не дублируются в README.

### 4. Продолжить / доработать существующую спеку

```
@sdd добавь sync-skills в cli
@sdd измени архитектуру на event-driven
```

Через тот же роутер: intent = evolve-scope, режим (refine / pivot) автоопределяется из формулировки.

### 5. Проверить целостность SDD-воркфлоу

```
@sdd-check
```

Read-only: проверяет связность спек, синхронизацию трекеров, полноту execution-логов, консистентность DAG.

### 6. Аудит завершённой задачи

```
@sdd-audit TSK-05
```

Fresh-eyes: читает таск + спеку + git diff, механический линтинг, верификация правил. Фидинги роутятся в артефакты (правки спек, переоткрытие тасков).

### 7. Починить после ревью / sdd-check

```
@sdd-reconcile найди и исправь проблемы из sdd-check
```

Два авто-детектируемых режима: `fix` (фидинги/баг/ревью — код неверен) и `from-code` (код обогнал спеку). Классифицирует фидинги, согласовывает с оператором, исполняет фиксы, переоткрывает таски, back-sync спек/тасков, верифицирует.

### 8. Спроектировать инфраструктурный или интерфейсный скоуп

```
@sdd спроектируй infra-golang
```

Тот же роутер: scope-type=infrastructure/interface форсируется из intake, дальше — bootstrap tooling'а (package manager, type-checker, linter, formatter, test runner, git hooks, CI) или контрактов интерфейса.

---

## Execution-паттерны

| Паттерн | Как работает | Навыки |
| ------- | ----------- | ------ |
| **Router-fronted stateful entry** | Один `sdd-state` → exact `routerState` → router + free/forced intent → единая session policy → lazy owner | sdd, sdd-scaffold, sdd-execute, sdd-critic, sdd-reconcile |
| **Direct directive activation** | Извлечь bounded intent → загрузить v2-директиву → выполнить план без stateful chain | sdd-audit, sdd-code-review |
| **Execute owner** | После router планирует таск(и) → dispatch фаз (typed Handoff) → audit + code-review; сам код не пишет | owner-директива sdd-execute |
| **Read-only verifier** | Саморефлексия + механические проверки через `npx gennady sdd-check --all [project-root]`. Код не пишет | sdd-check |

---

## Структура навыка

```
ai/skills/<name>/
├── SKILL.md          # YAML frontmatter (name, description, compatibility) + markdown body
├── scripts/          # опционально: bash/js утилиты
└── *.prompt.md       # опционально: кастомные промпты
```

---

## Синхронизация в проекты

```bash
# Синхронизировать все навыки
npx gennady sync-skills

# Предпросмотр
npx gennady sync-skills --dry-run

# Конкретный навык
npx gennady sync-skills sdd-execute
```

Навыки деплоятся из `ai/skills/` → `.claude/skills/` проекта. Пути нормализуются: dev-пути (`~/Developer/gennady/...`) заменяются на продуктовые.

---

## Связанные спеки

- `specs/ai-skills/ai-skills.spec.md` — общая спека библиотеки
- `specs/ai-skills/skill-contract/skill-contract.spec.md` — контракт навыка
- `specs/ai-skills/sdd-skills/sdd-skills.spec.md` — SDD-навыки
