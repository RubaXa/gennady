# Полный план работ по eval-харнессу (все цели — навигация)

Мой рабочий TODO для непрерывной автономной работы: полный список целей, пройденных и оставшихся.
Двигаюсь сверху вниз, статусы обновляю сразу. ✅ сделано · 🟡 сейчас здесь · ⬜ впереди.
Дисциплина: реальные прогоны + детерминированные тесты; оба исхода воспроизводимы (both-way golden);
prepare/clean окружения — скриптами (node fs/path), не руками; коммит через полный гейт, без `--no-verify`.

---

## A. ДОСТИГНУТЫЕ ЦЕЛИ

- ✅ **A1 Инфра-набор** (phase `task`): E-infra-1 log-summary, E-infra-2 rotate-logs, E-infra-3 makefile.
  Объективный golden, both-way `infra-golden.test` 9/9, реальные прогоны PASS. В PR (`d8afa21e`).
- ✅ **A2 Brownfield дельта-ветки** (phase `brownfield`): E-bf-delta (`modify-code-delta`),
  E-bf-bugfix (`fix-code-delta`). Реальные прогоны golden PASS; both-way `brownfield-golden.test` 6/6.
  В PR (`fcdee206`).
- ✅ **A3 H3 — A/B промпта `task`** (words↔example): отрицательный результат зафиксирован (промпт не
  токен-рычаг на дешёвой задаче). В PR (`87b7b063`).
- ✅ **A4 Инструмент lint↔prettier**: `npm run fix` был неидемпотентен (DbcTsLinter autofix ломал
  prettier-формат). Причина (2 дефекта) найдена, фикс (общий reindent), непротиворечивость доказана
  на 11 файлах + `dbc-ts-linter.prettier-idempotency.test` (5) + снапшоты 153/153. Коммит `fix(dbc-linter)`.
- ✅ **A5 Адекватность spec-golden**: golden проверяет ПОЛЬЗУ (перечень функц. требований ≥3 + error/edge),
  both-way `brownfield-spec-golden.test` 13/13.
- ✅ **A6 Каркас spec-веток построен**: типы (phase `brownfield` + modes recover-spec/delta-to-spec/
  modify-via-spec), промпты (ветвление по mode), фикстуры (recover/delta-to-spec/via-spec), golden.
  Тесты зелёные. (в рабочем дереве, не закоммичено — ждёт рабочего процесса recover.)

## B. РАСШИРЕННЫЕ ЦЕЛИ — процесс `module code → module spec` (главная активная линия)

- ✅ **B1 Диагностика** — причина ДОКАЗАНА транскриптом: baseline читает root/scope/router.directive.xml
  (22 tool-calls, artifact=none) — тонет в greenfield-ceremony chain, не доходя до Write.
- ✅ **B2 Процесс code→spec** (прямой, без ceremony) РАБОТАЕТ: V2 → golden PASS, sdd-check clean,
  reasoning 68249→334 (×200), total 129381→10790 (×12), msgs 20→5. Промпт recover-spec = direct.
- ✅ **B3 Матрица наличия артефактов** (portal/scope/module × есть/нет/partial): both-way 19/19;
  промпт matrix-aware. Реальные прогоны — все golden PASS: S0 (пусто) PASS/clean; S1 (scope есть,
  module нет) PASS, agent добавил module под scope, scope цел (R1 FAIL — нюанс неканоничной фикстурной
  scope-спеки, не процесса); S2 (partial) PASS/clean, дополнил chars сохранив lines/words. Регрессия
  S0 на matrix-промпте — PASS. (S3 multi-module — опц. позже.)
- ⬜ **B4 ≥10 вариаций промпта/траектории**: V1 baseline FAIL, V2 direct PASS зафиксированы. Осталось
  провести изолирующие вариации (skill-lite/few-shot/anti-loop/verbose/combo), фиксируя деградации.
- ✅ **B5 delta-to-spec / via-spec** на direct-процессе — оба golden PASS + sdd-check clean (~11–13k).

## C. СКВОЗНЫЕ / ИНФРАСТРУКТУРНЫЕ ЦЕЛИ

- ✅ **C1 Детерминированный prepare/clean окружения СКРИПТАМИ** (node fs/path), не ручным bash —
  `ai/flow-eval/scripts/sandbox.ts` (prepare/clean/--dry), покрыт `sandbox.test` 5/5 (изолированный
  TMPDIR, не трогает активные прогоны; не трогает не-sandbox директории).
- ⬜ **C2 Токен-экономика**: считать input+output+reasoning; цель — профитная траектория без циклов.
- ✅ **C3 Воспроизводимость обоих исходов** — both-way golden на каждый критерий (инфра/дельта/спеки).
- ⬜ **C4 Правила качества R1–R6** (enterprise-зрелость: структура, независимый golden, mech-гейты,
  трассируемость, воспроизводимость, типизированные ошибки) — поддерживать по мере роста.

## D. ФИНАЛ

- ⬜ **D1** впитать победивший recover-процесс; весь `npm run check` зелёный; всё запушено; самосводка.

---

Сейчас: B1 (диагностический прогон в фоне) ∥ C1 (скрипт окружения). Дальше: B1→B2→(B4 вариации)→B3→B5→D1.
