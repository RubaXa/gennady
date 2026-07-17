# agent-inbox Cascade Table

## Tasks

| Task-ID | Status                   | Depends On                            | Title                                                                                                                                             |
| ------- | ------------------------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| TSK-80  | DONE                     | —                                     | Директивы agent-inbox (TYPO + suggestion + SKILL.md)                                                                                              |
| TSK-90  | DONE                     | —                                     | Config-инфраструктура: файл + загрузка/сохранение/валидация                                                                                       |
| TSK-91  | DONE                     | TSK-90                                | Structured config signal в `inbox` и `inbox-context`                                                                                              |
| TSK-92  | DONE                     | TSK-90                                | Подкоманда `gennady inbox config`                                                                                                                 |
| TSK-93  | DONE                     | —                                     | Worktree reuse + 7-дневный TTL (без явной очистки агентом)                                                                                        |
| TSK-94  | DONE                     | TSK-91                                | inbox-context format v2 + дельта коммитов                                                                                                         |
| TSK-95  | DONE                     | —                                     | Unified `--url` interface + удаление legacy команд из SKILL.md                                                                                    |
| TSK-96  | DONE                     | TSK-95                                | `vcs-discussions` фильтры `--my` и `--with-drafts`                                                                                                |
| TSK-97  | DONE                     | TSK-95                                | `vcs-draft-note --delete-all`                                                                                                                     |
| TSK-98  | DONE                     | TSK-94, TSK-96                        | Директива `update-review.directive.xml`                                                                                                           |
| TSK-99  | DONE                     | TSK-96, TSK-98                        | Self-review author + ReactionMatrix                                                                                                               |
| TSK-100 | DONE                     | TSK-95                                | Валидация постинга в `vcs-reply`                                                                                                                  |
| TSK-101 | DONE                     | —                                     | Защита от prompt injection + AX_UNTRUSTED_MR_CONTENT                                                                                              |
| TSK-102 | DONE                     | TSK-91, TSK-94, TSK-95                | `inbox-review-plan` command + `H_NO_REVIEW_PLAN` gate                                                                                             |
| TSK-103 | DONE                     | TSK-102                               | `inbox-review-plan --scaffold`/`--validate`: документный конвейер                                                                                 |
| TSK-104 | DONE                     | TSK-103                               | Документный конвейер в скиллах + пивот «ничего на диск»                                                                                           |
| TSK-105 | DONE                     | TSK-109                               | inbox-mocks: фабрики мок-данных                                                                                                                   |
| TSK-106 | DONE                     | TSK-105                               | inbox-api: + artifact endpoints, generic action (пивот D-86)                                                                                      |
| TSK-107 | DONE                     | TSK-105, TSK-106                      | inbox-dashboard: + браузер артефактов, ActionPanel (пивот D-86)                                                                                   |
| TSK-108 | DONE                     | TSK-107, TSK-114                      | inbox-dashboard: e2e тесты (Playwright)                                                                                                           |
| TSK-109 | DONE                     | TSK-90–TSK-94 (DONE)                  | inbox-core: перенос CLI-логики состояния в модуль + AuditLog                                                                                      |
| TSK-110 | DONE                     | TSK-109                               | inbox-core: VcsInboxPort + Mock + Real                                                                                                            |
| TSK-111 | DONE                     | TSK-105                               | inbox-opencode: + агентный режим (tools, toolCalls, минуты)                                                                                       |
| TSK-112 | DONE                     | TSK-111                               | inbox-opencode: OpenCodeReal агентная сессия + tool-call лог                                                                                      |
| TSK-113 | IN_PROGRESS (Reopens: 1) | TSK-109,110,111,116; Round 2: TSK-134 | inbox-roles: reviewer-граф (3 ветки), thread-механика, дедуп, effect-executor (пивот D-86); Round 2 — session↔болванка + ToolPolicy (D-118…D-123) |
| TSK-114 | DONE                     | TSK-105, TSK-107                      | inbox-visual-testing: ARIA snapshots + layout helpers                                                                                             |
| TSK-115 | DONE                     | TSK-106,109,110,111,113               | inbox-serve: entry point + DI bootstrap + OpenCode spawn                                                                                          |
| TSK-116 | DONE                     | —                                     | services/ai-kit: компиляция system prompt из AIKit-директив                                                                                       |
| TSK-117 | TODO                     | TSK-115                               | inbox-serve: real-smoke (ручной golden-прогон)                                                                                                    |
| TSK-118 | DONE                     | TSK-113                               | inbox-eval: детерминированное ядро (diff-hunk + гейты G1–G10 + отчёт)                                                                             |
| TSK-119 | DONE                     | TSK-121,118                           | inbox-eval: драйвер эвала поверх реального serve run-mode                                                                                         |
| TSK-120 | DONE                     | TSK-119,107                           | inbox-eval: e2e-харнесс + wait-render + скрины (фикстура; real-proof §7 → TSK-122)                                                                |
| TSK-121 | DONE                     | TSK-113,115                           | serve run-mode: прогон списка MR через реальный граф (dry-run) + замыкание связки                                                                 |
| TSK-122 | DONE                     | TSK-121,113,107,120                   | реальный e2e: 4 разрыва закрыты (host/артефакты-на-диск/BoardReal/live-дашборд); §7 → 123/124                                                     |
| TSK-123 | TODO                     | TSK-122                               | live-дашборд тикает scheduler → реальный MR рендерит диаграмму + скрин (§7 real-proof, B1)                                                        |
| TSK-124 | DONE                     | TSK-122                               | разбор+фикс: session-узлы графа падают SESSION_ERROR против рабочего opencode (B2)                                                                |
| TSK-125 | TODO                     | —                                     | тест-tmp agent-inbox под `~/.gennady` (убрать `os.tmpdir` из границы инструмента)                                                                 |
| TSK-126 | DONE                     | TSK-109,110,111,112                   | inbox-chat: ChatSession + ContextAssembler + транскрипт-персистентность                                                                           |
| TSK-127 | DONE                     | TSK-126                               | inbox-chat: MutationApplier (revision-CAS + snapshot/undo)                                                                                        |
| TSK-128 | DONE                     | TSK-109                               | inbox-chat: ChatGc (TTL-уборка chats/ + snapshots/)                                                                                               |
| TSK-129 | DONE                     | TSK-106,126,127                       | inbox-api: ChatRouter + MutateRouter + SseHub (Review Chat HTTP↔SSE мост)                                                                         |
| TSK-130 | DONE                     | TSK-107,129                           | inbox-dashboard: ChatPanel + SelectionPill + ViewSwitch + split-layout (Review Chat UI)                                                           |
| TSK-131 | TODO                     | TSK-130,108,132,133                   | inbox-dashboard: e2e Review Chat (Playwright)                                                                                                     |
| TSK-132 | DONE                     | TSK-126,130                           | inbox-chat + inbox-dashboard: ContextChip.origin end-to-end (file:line, not bare text)                                                            |
| TSK-133 | DONE                     | TSK-129,130,132                       | inbox-serve + inbox-api + inbox-dashboard: live integration wiring (Review Chat actually served)                                                  |
| TSK-134 | TODO                     | —                                     | inbox-core: mrShape + инъекция `## Контекст` в трек-болванки (D-118…D-123 refine)                                                                 |
| TSK-136 | TODO                     | TSK-134                               | services/ai-kit: динамическая сборка директив из ai/kit (селектор + аксиомы-кирпичи)                                                              |
| TSK-137 | TODO                     | TSK-113 (Round 2), TSK-134            | inbox-roles: ArtifactValidator injection-coverage grounding                                                                                       |

## Динамическая сборка директив + инъекция контекста (D-118…D-123, refine 2026-07-17)

Продолжение TSK-116/TSK-113 под валидацию телеметрией трассы !602 (~29 round-trips/линза). Границы
refine — ТОЛЬКО session-узлы Role Engine ветки `review_needed` (track/security/code) + `synthesize`
(§5.3.1 agent-inbox.spec.md). Ветки `reply_needed`/`update-review`/author и CLI-конвейер (AI-05) — вне
scope, остаются на статике.

| Task-ID           | Что делает                                                                                                                                                    | Владеет                                                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| TSK-134           | mrShape (6 флагов) + инъекция `## Контекст` в трек-болванки, ограниченная файлами трека                                                                       | inbox-core                                                                                                                                    |
| TSK-113 (Round 2) | session исполняет свою болванку и возвращает результат (без write-tool); ToolPolicy per lens; zero-tools synthesize reconcile; materializeReviewJson под D-99 | inbox-roles (reopen, не новый тикет — TSK-113 уже владеет reviewer.role.ts/role-instance.ts/role-node.ts, см. Decision Log в tasks/README.md) |
| TSK-136           | Селектор `(sessionType, track, mrShape)` из ai/kit (hbs + аксиомы-кирпичи), взамен статичного NODE_DIRECTIVE_MAP для review_needed+synthesize                 | services/ai-kit                                                                                                                               |
| TSK-137           | ArtifactValidator: injection-coverage-ledger взамен tool-call сверки для injection-сессий                                                                     | inbox-roles                                                                                                                                   |

**Порядок исполнения:** TSK-134 (root) → { TSK-113 Round 2, TSK-136 } (параллельно, файлы не пересекаются) → TSK-137 (после TSK-113 Round 2 закрыт).

## Rewrite queue (D-86)

D-86 (reviewer-флоу = паритет с CLI) — по факту полный реврайт serve-контракта, не пивот.
Пять тикетов переписаны начисто под канонические спеки (чистый `TODO`, фазы = новый контракт,
Round 1). Существующий код Round-1 (SessionPool, http-server, board-provider mock и т.п.)
дорабатывается фаза-сабагентами, не выбрасывается. Спеки — канон.

| Task-ID | Что делает (новый контракт)                                                                                                                                                                        | Канон-спека     |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| TSK-111 | opencode: агентный режим (`createSession(cwd,tools)`, `prompt` по завершению хода, `toolCalls`, timeout-минуты); мок симулирует tool-call лог                                                      | inbox-opencode  |
| TSK-112 | OpenCodeReal: агентная сессия + `toolCalls` из телеметрии SDK; repro «45 КБ one-shot в пустой dir виснет → с worktree+тулами завершается»                                                          | inbox-opencode  |
| TSK-113 | reviewer-граф (3 ветки), `prep`-узел, `ArtifactValidator` (coverage ledger + tool-call сверка), `EffectExecutor` (дедуп + все vcs-\*), author-граф + FIX_TASK.md, раунды-в-файлах, NFC-SV-07/08/09 | inbox-roles     |
| TSK-106 | `ArtifactRouter` (list/read артефактов), `BoardProviderPort.listArtifacts/readArtifact`, generic `action` (post/approve/redispatch/skip)                                                           | inbox-api       |
| TSK-107 | `ArtifactBrowser`/`ArtifactView`/`ActionPanel`, рендер md+mermaid (из ai/inspector/web), статус-карточки = узел графа, нотификация сразу                                                           | inbox-dashboard |

**Порядок исполнения (слои):** Layer 0 — `TSK-111`, `TSK-106` (файлы не пересекаются);
Layer 1 — `TSK-112`, `TSK-113`, `TSK-107` (разные модули). `TSK-117` (golden-прогон, manual)
— финал после 113+115.

Запуск: скилл `sdd-execute-batch` (оркестратор строит слои, диспатчит фаза-сабагентов
параллельно по слою, закрывает audit'ом). Не CLI-команда.

## Dependency Graph

```
TSK-80 ───────────────────────── DONE
TSK-90 ──┬── TSK-91 ── TSK-94 ──┬── TSK-98 ── TSK-99
         └── TSK-92             │              │
TSK-93 ─────────────────────────┤              │
TSK-95 ──┬── TSK-96 ────────────┤              │
         ├── TSK-97             │              │
         └── TSK-100            │              │
TSK-101 ────────────────────────┘              │
TSK-102 ── (TSK-91, TSK-94, TSK-95) ──────────┘
TSK-102 ── TSK-103 ── TSK-104 (документный конвейер)

=== Serve Mode (new) ===
TSK-109 (core state — перенос CLI) ── TSK-105 (mocks) ──┬── TSK-106 (api) ── TSK-107 (dashboard + harness) ── TSK-108 (e2e)
                                                         ├── TSK-111 (opencode mock) ── TSK-112 (opencode real)
                                                         └── TSK-114 (visual-testing) ────────────────┘
TSK-109 ── TSK-110 (VCS)

TSK-116 (ai-kit) ── TSK-113 (roles) ← TSK-109, TSK-110, TSK-111

TSK-115 (serve bootstrap) ← TSK-106,109,110,111,113
TSK-117 (real-smoke) ← TSK-115

=== Dynamic directive assembly + context injection (D-118…D-123) ===
TSK-134 (mrShape + context-injection, inbox-core) ──┬── TSK-113 Round 2 (session↔болванка + ToolPolicy, inbox-roles)
                                                     └── TSK-136 (ai-kit selector)
TSK-113 Round 2 ── TSK-137 (ArtifactValidator injection-coverage, inbox-roles)
```
