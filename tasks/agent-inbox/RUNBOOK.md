# RUNBOOK: добивка agent-inbox v2 до MVP (для dev-агента)

> Контекст: спеки v2 в `specs/agent-inbox/`, DAG в `tasks/agent-inbox/`. Сделано и
> заверифицировано: TSK-156…161 (ядро), 162/163/166 (волна, закоммичена). Осталось:
> 167 → 164-P3 → 165 → финальная приёмка. Цикл работы: выполняешь ОДИН тикет →
> оператор передаёт результат архитектору на перепроверку → следующий тикет.

## Дисциплина цикла (обязательная, по болезненному опыту)

1. Один тикет за раз. Ничего вне Target Files тикета (AX_PHASE_SCOPE_LOCK).
2. После КАЖДОЙ фазы: `npm run type-check` → scoped тесты фазы → `npm run lint:contracts` → `npx prettier --check <файлы>`.
3. Запуск тестов — **только явными списками файлов** (`npm test -- <файлы>`); директорный вызов даёт ложный fail (quirk раннера).
4. Execution Log — по ходу, реальные ts; Handoff-строка в конце фазы.
5. Коммит после моей верификации (не раньше); pre-commit должен быть зелёным — красный гейт чинить, не обходить.
6. Встретил pre-existing баг/флейк — НЕ чинить молча и НЕ блокироваться молча: зафиксировать в логе `discovery` и эскалировать оператору.
7. Живые прогоны — только реальный режим (AGENTS.md visual-proof): скриншот каждой ключевой точки с подписью, что он доказывает.

## Порядок исполнения

### Шаг 1 — TSK-167: test-suite health (ПЕРВЫМ, всё остальное стоит на нём)

Тикет: [agent-inbox.task-167.md](agent-inbox.task-167.md).
Почему первым: полная сьюита не завершается (>10 мин против 33с) — без зелёного гейта нельзя принимать 164/165.
Суть: `npm test` = быстрые (≤120с, 0 fail); `npm run test:integration` = тяжёлые (`*.integration.test.ts`, serve/full-flow) с `--test-concurrency=2`; 5 v1-легаси падений — skip с причиной и ссылкой D-216 (доказано pre-existing на a1adf97, уйдут с v1-модулями).
Самопроверка: 3 прогона `npm test` зелёные ≤120с + `npm run test:integration` зелёный + `lint:contracts` clean.
Выход: гейт зелёный → сообщить оператору → моя перепроверка.

### Шаг 2 — TSK-164 P3: dashboard e2e + ВИЗУАЛЬНЫЙ PROOF

Тикет: [agent-inbox.task-164.md](agent-inbox.task-164.md) (P1/P2 сделаны; осталась фаза P3).
Принятое отклонение (фиксирую решением): UI собран консолидированными файлами (`dashboard-v2-ui.tsx`/`dashboard-v2-api.ts`/`v2-types.ts`) вместо раскладки по 15 компонентам — **принято для MVP**, состав компонентов по спеке §4 сохранён внутри файлов; записать в Execution Log как `decision`.
Суть P3: поднять serve на seed-фикстурах TSK-166 (`seedMr` — 2 МР в заданных состояниях, temp stateDir), пройти e2e: фазы загрузки → доска без мерцания → карточка A со всеми полями → лента (виджеты) → decision flow → dryrun-маркер.
Самопроверка: `npx playwright test --config=e2e/inbox-serve/playwright.dashboard-v2.config.ts` зелёный + `npm run inbox-serve:build` зелёный.
**Обязательный визуальный proof:** скриншот КАЖДОЙ стадии (фазы, доска, карточка, лента, виджет находок развёрнутый, decision-бар, чат), с подписью что доказывает. Это первый живой артефакт v2 — без него P3 не закрыта.
Выход: P3 [x] → тикет DONE → моя перепроверка.

### Шаг 3 — TSK-165: eval-харнесс + метрики датасета

Тикет: [agent-inbox.task-165.md](agent-inbox.task-165.md).
Суть: `gennady inbox eval --mr <url> [--runs] [--report]`; 10 прогонов с измеримыми критериями (спека inbox-eval §2); parallel — на seed-паре; метрики из журнала (accept-rate/edit-rate/time-to-decision, n на capability); eval-report.json + trend.jsonl.
Самопроверка: unit по харнессу + `gennady inbox eval --help` exit 0 + критерии PASS/FAIL реально вычисляются (не «всегда pass»).
Выход: моя перепроверка.

### Шаг 4 — Финальная приёмка MVP (не тикет — прогон)

1. Реальный запуск: `npm run dev inbox serve` (реальный GitLab, реальный ~/.gennady).
2. Пройти S1–S8 на реальном МР (по корневой спеке §2): загрузка → доска с ролями без ручных актов → пайплайн до синтеза → виджеты → decision → effect (dry-run) → журнал/лента консистентны.
3. Визуальный пакет: скриншоты каждого S по правилу AGENTS.md.
4. Краш-тест: SIGKILL → рестарт → доска идентична (crash_recovery).
5. Результат → оператору; расхождения → новые тикеты через sdd-fix.

## Карта «что где лежит» (быстрый вход агента)

- Спеки: корень `specs/agent-inbox/agent-inbox.spec.md` → модули (§3 со ссылками); UX — `inbox-dashboard/ux-*.md`, токены — `design-system.md`.
- Тикеты: `tasks/agent-inbox/agent-inbox.task-*.md`; трекер — `tasks/agent-inbox/README.md`.
- Тест-инфра: `services/agent-inbox/test/` (seed/cassettes/contract-suite/dto-factories).
- Известные ловушки: директорный вызов тестов (ложный fail) · `npm run inbox-serve:build` перед любым UI-прогоном · pre-commit нельзя обходить · `.codex-agent-status/` не коммитить.
