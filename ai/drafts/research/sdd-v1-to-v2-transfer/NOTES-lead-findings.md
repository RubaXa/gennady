# Рабочие заметки Lead — факты, проверенные лично (2026-09-06)

> Черновик; после верификации переносится в тематические документы.

## Топология веток (git, проверено)

| Ветка | HEAD | Отношение |
|---|---|---|
| `origin/main` (v1, заморожен) | `8bb38477` (0.9.0-next.3) | baseline аудита |
| `codex/sdd-v2-rc52-followup` (RC, PR #25 → база `sdd-v2-readiness-105d19`) | `11291af5` (0.8.4) | merge-base с main `46c6d616`; RC впереди 532 (до движения) / позади main 115 |
| `origin/sdd-v2-readiness-105d19` (PR #6 → main) | — | RC = readiness + 118 коммитов; readiness не содержит ничего сверх RC |
| `sdd-v2-inbox-transplant` (worktree focused-ptolemy; сессия «SDD: v2 + v1») | `020a0df7` (2026-08-27) | merge-base с RC `47020fda`; **19 коммитов НЕ в RC** (harness S1, IPC-flake fix, explicit root в 8 SDD-командах, Step 0/1 инфра-фиксы `680ce22a`, трансплант agent-inbox `165697d6` + 14 срезов декомпозиции) |
| `recover-sdd-v2` (главный checkout `~/Developer/gennady`) | `0336c1ab` | main+PR#5+переработка agent-inbox; 320 впереди / 40 позади main |

Проверка содержимого: фиксы Step 1 (`680ce22a`) в RC **отсутствуют по содержанию** (vite chmod, bundle-smoke, deployed-surface golden, lint.cmd guard, README install-from-source, `overrides`), но **большинство из них есть в main** (`5c5a1f6a`-класс: vite.config.ts:50 `chmodSync 0o755`, `5697f027` smoke, `f66a77ee` sync-skills excludes, `7d48149d` golden, `478e7319` lint.cmd, `3461d2fd` README) → попадают в инвентарь A1 как часть 115 коммитов. Уникально для транспланта и НЕ в main: `overrides` (npm audit), `35a31942` explicit root в SDD-командах (в RC тестах 9 файлов с `process.chdir`, в транспланте 0), `51195c48` IPC-flake, agent-inbox из recover.

## Документы сессии «SDD: v2 + v1» (найдены на диске, untracked)

`/Users/k.lebedev/Developer/gennady/.claude/worktrees/focused-ptolemy-0fdb52/merge-plan/` (копия в scratchpad): README (DL-1..DL-28), 01-verify-and-stack (A.1–A.10), 02-agent-inbox, 03-main-fixes (C.1–C.6), 04-v1-purge, BACKLOG, CONFLICTS, entry/step-5-verify (фазы 5.1–5.7), entry/step-2E, step-2G. Фактура датирована 2026-08-26/27; main тогда был `8e378ad3` (next.9) — с тех пор +29 коммитов (PR #8, #10, #12, #14, #18, de-Node rules, knowledge.xml project-owned, single-source facts, release hardening).

## Реальные проекты

- **cloud-ios** (`~/Developer/cloud-ios`, master без SDD; ветка akkrat `origin/ap/CLOUDIOS-NOISSUE-swiftlint-exceptions-infra-base` @ `c28e1753d8`, 2026-09-02): v1-раскладка `tasks/infra-base/infra-base.IB-001..007.md` (path-based Task-ID), `specs/{core,infra-base,module-scaffold,testing}`, `gennady.yaml` (`stack.use: [anystack]`, extraGates swiftlint/xcodebuild/unit-tests с `envFail`, `fixer`, `cwd`, `timeout`), проектные правила `ai/directives/coding/{swift,objc}-rules.xml`, `infra/swiftlint-setup.xml`, свой `knowledge.xml`; синхронизированные v1-скиллы (incl. alt-opinion) и bash-скрипты `sdd-execute/scripts/*`. RC-сессия уже держит eval-worktrees: `~/.gennady/eval/cloud-ios/{fixture-detmig (v1), fixture-mig-run (v2 после sdd-migrate: specs/infra-base/infra-base.task.IB-*.md + migration/*.migration.md), rt-regen, bench-smoke}`.
- **messenger** (`~/Developer/messenger`): gennady 0.8.1; 206 spec-файлов, 159 v1-тикетов в `tasks/<scope>/`, Task-ID смешанные (`TSK-N` ×2058 упоминаний и path-based `TSK-VMEN-N`, `TSK-TDRHO-N`, …); `ai/directives/{sdd,coding,testing,infra,language,perf-auditor}` + `knowledge.xml`; `.claude/skills` — полный набор v1 + `alt-opinion`, `lang-lint`.
- **gennady RC self-hosting**: `tasks/` v1-раскладка, 127 `*.task-*.md` в 10 скоупах; `specs/3-tasks.md` фиксирует (PROJECT-TASKS-D-1): мигрирован только `ai-skills/directive-assembly`; остальные скоупы — legacy v1.

## Наблюдения для вопросов оператору

1. Ветка `sdd-v2-inbox-transplant` (Steps 0–2 плана «SDD: v2 + v1») не в RC. Инфра-фиксы Step 1 придут через инвентарь main; **трансплант agent-inbox из recover** — вне SDD-переноса? Решение оператора.
2. RC self-hosting сам ещё на v1-раскладке `tasks/` (Step 4 старого плана не выполнен) — это и есть первая реальная миграция V1→V2 «на себе»; предложить как приёмочный сценарий G4 (наряду с cloud-ios и messenger).

## Зависимости от RC-сессии (2026-09-07)

- **G4 предусловие «зелёного» R-COMPLETE**: (а) `sdd-migrate` должен эмитить `PHASE_RECEIPTS:v1` (и полную v2-схему тикета: 3-колоночные §5-таблицы, секция `SCOPE_TYPE`), иначе group-receipt enforcement grandfather-ится OFF на мигрированных тикетах; (б) sandbox воркера flow-eval должен использовать текущий собранный gennady (команда `sdd-log audit-receipt`) — RC-сессии разрешено сделать (б) внутри provision.ts / sandbox-lifecycle с детерминированным тестом.
- RC HEAD после push: `95329c19` (R-COMPLETE quality rule). Разрешённый периметр RC до брифов: только flow-eval.
- 2026-09-07: RC закоммитила `3d5f66a7 fix(flow-eval): sandbox always gets the fresh local dist` (предпосылка (б) G4 выполнена; тест `ai/flow-eval/__tests__/provision-gennady.test.ts` 2/2; `npm run check` 5/5). Ветка ahead 1 от origin — push ждёт решения оператора (вопрос в ближайший раунд). RC на паузе.

## Перезапуск сессии (2026-09-07 ~12:53 MSK)

- Предыдущий процесс Lead завершился на лимите API (сброс 12:50). Сохранено: все отчёты A1–A4, B1–B7, V-A1..V-A4, V-B1 в scratchpad; коммит `defe1058` (skeleton + docs 10/12/20 в raw-форме); чистый `20-ISSUES-VERDICTS.md` дописан и закоммичен; чистый `10-MAIN-DELTA.md` был оборван на §2 — дописывается; `11-V2-STATE.md` и чистый `12-SESSIONS-DIGEST.md` не были созданы — пишутся.
- Запущены верификаторы V-B2..V-B7 (Opus/Sonnet) — до них треки 31–50 остаются ЧЕРНОВИКАМИ.
- V-B1 (verify): рекомендация A′ выживает; но (1) без `package.json` receipt не пишется вовсе (`phase-receipt.ts:1127-1233`) → нужна задача V-04a «per-preset environmentState» до anystack/swift; (2) `--only/--skip` нельзя пускать в фазовый путь (ломает валидатор receipt); (3) `gennady fix`-фасад без `RepairMutationBoundary` делает receipt ложным; (4) steelman B: обязательный per-gate timeout/SIGKILL/`requires` есть только в main.
- V-A2: A2 достоверен (117/26/4/5); материальный пропуск — `TEST_ROOTS` без `utils/` и `test/` → 25 тест-файлов вне `npm test`; `H_ASK_WITHOUT_CARD` не объявлен ни в одной директиве (обход аудита аллоулистом).
