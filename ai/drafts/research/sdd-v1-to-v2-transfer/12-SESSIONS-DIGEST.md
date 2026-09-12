# 12 — Дайджест сессий «SDD: v2 + v1» и «SDD v2 RC v6»: что выработано, что устарело

> Статус: ВЕРИФИЦИРОВАНО (A3a + V-A3a, A3b + V-A3b; правки применены)

**Как читать.** Это компакт-версия двух дайджестов + двух независимых верификаций. Полная raw-форма
(с дословными цитатами, позициями в транскриптах, построчными обоснованиями каждой проверки) —
`_raw/12-SESSIONS-DIGEST.raw.md`. Здесь: там, где дайджест и верификатор расходятся, приведён вердикт
верификатора; факты, которые никто не перепроверял против сегодняшнего кода, помечены
`(не перепроверено)`.

**Главные выводы.**
- «SDD: v2 + v1» (26–27.08) — план `merge-plan/` (DL-1…DL-28), Шаги 0–2 выполнены на ветке
  `sdd-v2-inbox-transplant`, которая **не в RC**; agent-inbox — отдельный трек. Дизайн verify
  Engine↔Preset↔Detector переносим на уровне идей; весь grounded-слой (номера строк, «node-пресет =
  копия GATES», `harness/`) устарел: RC заменил fingerprint на `workspace-mutation.ts`, ввёл гейт
  `fix`/`target-repair`, receipt-контракт, `REQUIRED_SCRIPTS` = 8. Три закрывающих вопроса дизайна —
  без ответа оператора, вошли в открытый реестр.
- «SDD v2 RC v6» (2–6.09) — снятие зажимов флоу, `ai/flow-eval` (7 сценариев в `scenarios.json` +
  детерминированные гейты), миграционный eval на cloud-ios (r5/r6/rtbase PASS), round-trip (стены
  1–3), flow-verification redesign → group receipts (`4bb00f4b`), R-COMPLETE — по верификации уже
  **закоммичен** (`95329c19`, 07.09 00:08Z), ветка ушла на `3d5f66a7`. Самозаявленные разрывы v2 —
  вход для будущих треков (мигратор-полнота, порт adaptive verify/plugins/anystack, flow-verification).

---

# Часть A — «SDD: v2 + v1» (26–27.08.2026)

Источник: транскрипт `c9ec7dcb-506b-4c71-87a6-902bac38b1f6.jsonl`, плановые документы
`scratchpad/merge-plan-v2plus1/**`. Worktree сессии: `focused-ptolemy-0fdb52`, ветка
`sdd-v2-readiness-105d19` (HEAD на старте `47020fda`, на фиксации плана `35a31942`);
`origin/main` тогда — `8e378ad3` (v0.8.4-next.9); `recover-sdd-v2` — `0336c1ab`.

## A.0 Кратко

Две фазы. **Фаза A** (26.08 13:41→~17:15) — исследование трёх веток (`origin/main` с PR#5,
`recover-sdd-v2`, целевая v2) пятью Sonnet-подагентами, живой план `merge-plan/` (README + 01–04 +
CONFLICTS + entry/step-5), решения оператора через `AskUserQuestion`, критика workflow'ом
`plan-step-critique`, независимый аудит синхронности документов. **Фаза B** (26.08 17:16→27.08
~06:30) — исполнение воркером «SDD: v2 + v1 // Dev»: Шаг 0+1 (`680ce22a`), Шаг 2 — трансплант
agent-inbox (`165697d6`, ветка `sdd-v2-inbox-transplant`), декомпозиции 2E (`pipeline-runtime.ts`
1965→607) и 2G (`role-instance.ts` 1774→1180), инцидент с зомби-процессами, затем **пивот
оператора**: декомпозиция — крен, в BACKLOG; фокус — Шаг 5 (verify). Последнее сообщение сессии
(27.08 14:45) — эскиз архитектуры **Engine ↔ Preset ↔ Detector** с тремя открытыми вопросами;
ответов оператора в транскрипте нет.

Предшествующая сессия (13:40–13:41) прервана после трёх git-команд (worktree оказался на `35a31942`,
не на заявленном `47020fda`); полезной работы не содержит.

## A.1 Таймлайн (пивоты)

| # | Время (UTC) | Событие | Результат |
|---|---|---|---|
| 1 | 26.08 13:41 | Постановка: worktree `focused-ptolemy-0fdb52`, изучить `main`(PR#5) и `recover-sdd-v2`, «не merge, а переосмысление», 5 подагентов | 5 отчётов (PR#5, v2-story, main non-PR5, recover agent-inbox, v1-purge) |
| 2 | 13:51 | Живой документ пофайлово: as-is/rework/drop/kill; только по-русски | `merge-plan/README.md`,`01`–`04` (13:53–13:59) |
| 3 | 14:09 | **Пивот #1**: verify — последним | **DL-1** |
| 4 | 14:14 | Инфографика v2 vs PR#5 | вердикт «две половины одного, срастить» (DL-3) |
| 5 | 14:19 | Единый целевой флоу с разметкой источника | подагент по `harness/` → **DL-2/DL-4** |
| 6 | 14:31 | «node-как-стек по образцу golang»; режим AskUserQuestion | ядро будущего дизайна пресетов |
| 7–13 | 14:37–16:50 | Серия Ask по объёму Шагов 1–4, DONE-семантике, wip `PipelineRuntime`, `style.ts`/`picocolors`, миграции `tasks/` | DL-5…DL-24 (см. A.2) |
| 8 | 15:31 | **Пивот #2**: план = живые entry-points, независимый критик каждого шага | workflow `plan-step-critique` → `CONFLICTS.md` (C1–C8, H1–H6, L1–L7) |
| 14 | 16:58 | Независимая проверка синхронности документов | 13 находок, исправлены |
| 15 | 17:16 | Старт исполнения: воркер «SDD: v2 + v1 // Dev» | Шаг 0 blocked → Шаг 1 (1a–1h) |
| 16 | 17:45 | Форматтер + sync + максимальная гигиена npm audit | коммит **`680ce22a`** (Шаг 0+1) |
| 17–19 | 18:34–20:43 | wip control-plane по тестам, `npm run check` вопрос, инцидент зомби-процессов, yagni-исключение agent-inbox | DL-25…DL-27, коммит **`165697d6`** (2A–2D) |
| 20–21 | 20:57–27.08 04:51 | Декомпозиция 2E, затем 2G | 2E: 8 коммитов 1965→607; 2G: 6 коммитов 1774→1180 |
| 22 | 27.08 05:53 | **Пивот #3**: стоп декомпозиции — крен, в BACKLOG | `BACKLOG.md` (B-1…B-3) |
| 24–25 | 06:14→14:43 | Шаг 5 пофайлово; порядок и охват | `entry/step-5-verify.md` §10 (фазы 5.1–5.7); **Р-42**: исполнять сейчас, два пресета |
| 26 | 14:45 | Архитектура Engine/Preset/Detector + 3 вопроса | **ответов нет — конец транскрипта** |

**Пивоты итого:** (1) verify последним (DL-1, позже отменено таймингом Р-42); (2) план = живые
entry-points + стратегическое закрытие конфликтов (DL-24); (3) стоп декомпозиции agent-inbox →
BACKLOG, фокус на Шаг 5 «сейчас».

## A.2 Решения оператора Р-1…Р-42

Верификация V-A3a: **42/42 найдены, 41 CONFIRMED, 1 CONFIRMED с дефектом кросс-ссылки** (см. правку
ниже), 0 REFUTED. Формат: контекст → суть → куда легло (DL-*).

| Р | Время | Суть | → |
|---|---|---|---|
| 1 | 13:41 | Не `git merge`, пофайловый разбор; ветки всегда актуальны (`git fetch --all --prune`) | протокол §1 |
| 2 | 13:51 | Живой документ as-is/rework/drop/kill; только по-русски | структура `merge-plan/` |
| 3 | 14:09 | Verify (PR#5) — последним; инфра-фиксы main — Шаг 1, не verify | **DL-1** |
| 4 | 14:14 | Не может решить про ENV_FAIL без разбора `harness/` | подагент → **DL-2, DL-4** |
| 5 | 14:19 | Фиксировать всё в документах; единый флоу с разметкой источника | **DL-3** |
| 6 | 14:31 | «node как стек по образцу golang» | кандидат O-1/O-5, ядро пресетов |
| 7 | 14:31 | Решения через `AskUserQuestion`, независимое мнение, смотреть «сверху» | режим работы |
| 8 | 14:37 | Объём Шага 1: все подтверждённые баги + свежий `npm audit fix` | **DL-5** |
| 9 | 14:41 | `1e22e8ad` («[x] DONE = audited») — принятый дизайн v2, не трогаем | **DL-6** |
| 10 | 14:41 | Свежие CVE — чинить сейчас, в Шаге 1 | DL-5 |
| 11 | 14:44 | Объём Шага 2: «абсолютно всё» — чек-аут + тюн, включая `tasks/agent-inbox` | **DL-7** |
| 12 | 14:50 | wip `PipelineRuntime` (1965 строк) — «мерж = улучшение», декомпозировать | **DL-8** |
| 13 | 14:52 | Отдельная интеграционная ветка | **DL-9** |
| 14 | 14:52 | `picocolors`/`yocto-spinner` — «тоже полезные вещи» | пересмотр (см. Р-16) |
| 15 | 14:57 | Скилл `session-context-recover` — забрать отдельным пунктом | DL-10 (часть), CONFLICTS C5 |
| 16 | 14:58 | Принцип: решать по существу, не по ветке; «не проглатывать молча» | **DL-11** |
| 17 | 15:04 | `style.ts`: recover-версия лучше — «наша ветка отстала от лучших решений» | **DL-10** (+picocolors, yocto-spinner) |
| 18 | 15:14 | Список «не берём» — нужны две колонки берём/не берём/почему/что теряем | виджет `take_vs_skip_ledger_main` |
| 19 | 15:18 | Карта берём(11)/не берём(9) — согласен, фиксируем | **DL-14** (+DL-12, DL-13) |
| 20 | 15:24 | Миграция `tasks/` — финальным проходом; `sync-skills` — сейчас | **DL-15** (Шаг 4), **DL-16** (Шаг 0) |
| 21 | 15:31 | План — живые точки входа; независимый критик каждого шага | workflow `plan-step-critique`, CONFLICTS.md; → **DL-24** |
| 22 | 15:38, 15:55 | Поиск дыр и плохо изученных веток; закрывать конфликты стратегически, по рычагам | CONFLICTS §E (L1–L7), **DL-17**, **DL-18** |
| 23 | 16:01 | L5/H1: agent-inbox — экспериментальная фича, изолировать как в ветках-источниках | **DL-19** |
| 24 | 16:01 | L6 отвергнута формулировка; модель оператора: гейты → autofix → готовый результат | перефразировка |
| 25 | 16:05 | autofix vs откат — «в Go тоже есть fmt»; критика или ресёрч | подагент → **DL-20** (per-gate `mutationPolicy`, checkpoint) |
| 26 | 16:23 | Детализировать: секвенс с реальными командами для node и другого языка | виджет `verify_mutation_policy_node_go` |
| 27 | 16:28 | Как конфигурируется: конфиг main vs наш | `01` §A.10 |
| 28 | 16:37 | O-2: конфиг пересмотреть — `stack:`→? `argv` массив или `cmd` строка? ресёрч | **DL-21** |
| 29 | 16:40 | Почитать треды PR через `gh`, Sonnet-агент | подагент «Read PR#5 threads» |
| 30 | 16:50 | Грязное дерево — решить сейчас, независимая оценка плюсов/минусов, конфигурируемо | **DL-22** (two-path hybrid) |
| 31 | 16:50 | Пресеты: любой стек — предустановленный YAML внутри Геннадия, автодетект | **DL-23** (O-6); ⚠ переопределено Р-42 |
| 32 | 16:50 | Весь контекст зашить в шаг — новая сессия восстановит | **DL-24**, `entry/step-5-verify.md` |
| 33 | 16:58 | Независимая проверка синхронности документов | аудит — 13 находок, README §11 |
| 34 | 17:16 | Запускай воркер «SDD: v2 + v1 // Dev», step by step, следи | старт исполнения |
| 35 | 17:45 | Шаг 0: форматтер+sync; npm audit — максимальная гигиена, дай команды; делаем коммит | `680ce22a` |
| 36 | 18:35 | wip control-plane: реализовать 2 модуля по тестам | **DL-25** |
| 37 | 20:10–20:34 | «зачем `npm run check` на не-v2 репо?» → принято; правило watchdog >10 мин — прибивать, трассировать | модель «воркер извлекает, оркестратор коммитит» |
| 38 | 20:43 | Исключить agent-inbox из yagni | **DL-27** |
| 39 | 20:57 / 04:51 | 2E: декомпозиция сейчас (по 1 файлу); затем `role-instance.ts` (1774) | 2E, **DL-28**; 2G |
| 40 | 27.08 05:53 | **СТОП**: крен, тратим токены не туда — всё в backlog | `BACKLOG.md` |
| 41 | 06:03 | Что сделано, где остановились, что впереди | карта состояния |
| 42 | 06:14 | Шаг 5: как верно сделать — точки изменений пофайлово | `entry/step-5-verify.md` §10 |
| 43 | 14:43 | Исполнять СЕЙЧАС (отменяет тайминг DL-1); охват: два пресета nodejs и golang, пресет — исполняемый скрипт, кастом-конфиг детектим/откладываем, тесты старого поведения на новых технологиях | итоговая формулировка охвата Шага 5 |

Примечание по нумерации: сквозная нумерация Р-1…Р-42 в исходном дайджесте местами объединяет
несколько решений в одной записи (Р-6/Р-7, Р-9/Р-10, Р-22/Р-23, Р-29/Р-30/Р-31 сидят в одном
сообщении оператора) — в таблице выше решения развёрнуты построчно, отсюда видимое смещение номеров
относительно оригинала; по существу решений 42, все найдены.

Не отвечено оператором (конец транскрипта): три закрывающих вопроса финального сообщения (см. A.4.7).

**Правка верификации.** В исходном дайджесте формулировка «пресет — исполняемый скрипт» была ошибочно
приписана к «Р-38» (это решение «2E: декомпозиция сейчас») — на деле уточнение сделано в последнем
решении по Шагу 5 (`[3254]`, 14:43:23Z, здесь — «43»). Цитата решения 35 у дайджеста звучала как «идём
по плану» — дословно оператор сказал «делаем коммит и **исследуем** по плану».

## A.3 Плановые документы и открытые вопросы

Все файлы жили в `merge-plan/` (worktree `focused-ptolemy-0fdb52`), в `.gitignore` («план на диске, не
в product-истории») — копии только в scratchpad.

- **`README.md`** (264 стр., правка 26.08 22:34) — шапка: суть, состояния веток, топология merge-base
  (`46c6d616` main↔v2, `72e853fd` recover↔v2 = TSK-177, `0e1b1ed5` main↔recover), Decision Log
  DL-1…DL-28, живой трекер §10, журнал перепроверок §11. **Не отражает** 2E-финал в трекере (хотя §11
  фиксирует), 2G, BACKLOG, пивот 27.08, решение «Шаг 5 сейчас».
- **`01-verify-and-stack.md`** (396 стр.) — область A: пофайловая раскладка PR#5, вердикт
  «две половины», целевой флоу, O-1…O-5, mutation-policy + checkpoint + DL-22, конфиг (§A.10).
  Авторитетен по дизайну до 26.08 17:10; §A.4 частично устарел.
- **`02-agent-inbox.md`** (175 стр.) — область B: TSK-178→183 (recover), стратегия транспланта
  (§B.7), worklist (§B.8: граница, deps, 6 manual-merge точек, 6 H-файлов декомпозиции). Исполнен в
  `165697d6` (2A–2D); тюн-пункты 2E/2G сделаны частично, 2F (спеки from-code) не начат.
- **`03-main-fixes.md`** (86 стр.) — область C: забираем (exec-bit, smoke, sync-skills, docs),
  superseded, решения (`1e22e8ad`→DL-6), леджер свежих коммитов main. Исполнено в `680ce22a`.
- **`04-v1-purge.md`** (107 стр.) — область D: канон v2, подтверждённая чистка, остаток `tasks/`
  (127 тикетов, 11 скоупов), KILL-лист. Миграция `tasks/` (Шаг 4) **не начата**.
- **`CONFLICTS.md`** (88 стр.) — итог `plan-step-critique`: C1–C8, H1–H6, 10 sequencing-предупреждений,
  §E рычаги L1–L7 (L5 — керстоун «честный green»).
- **`entry/step-5-verify.md`** (122 стр.; §10 добавлен 27.08 06:24) — единственный self-contained
  entry-point Шага 5: цель, механизм (DL-20/21), реестр вопросов, §10 исполняемый чеклист фаз 5.1–5.7.
  **Не содержит** финальной архитектуры Engine/Preset/Detector (она только в чате 14:45).
- **`entry/step-2E-…md`**, **`entry/step-2G-…md`**, **`BACKLOG.md`** (B-1 остаток `role-instance.ts`,
  B-2 god-файлы `bootstrap.ts` 1369/`inbox-review-plan.cmd.ts` 1240/`opencode.real.ts` 1231/
  `reviewer.role.ts` 1204, B-3 хвост 2E).

### Реестр открытых вопросов — последний известный статус

| ID | Вопрос | Статус |
|---|---|---|
| O-1 | Охват стеков: node+anystack сейчас или node+golang сразу | пересмотрено 43: **два пресета nodejs и golang** сразу |
| O-2 | Конфиг `verify:`/`verify.gates[]`/`argv|cmd`/`mutationPolicy` | дизайн готов (DL-21); поддержку конфига **откладываем** (43) |
| O-3 | Имя глагола: `gennady verify/fix` как обёртка vs `sdd-verify` | открыт, не обсуждался |
| O-4 | halt-фундамент vs RUN-ALL; нужен ли non-halting режим | открыт; в финальном эскизе не упомянут |
| O-5 | Полная плагин-машинерия vs только резолвер | лин: только резолвер; «пресет = исполняемый модуль» частично реоткрывает |
| O-6 | Пресет-модель | DL-23 «YAML как данные» → **43 меняет**: исполняемый TS-модуль |
| DL-22 грязное дерево | (a)/(b)/(c) | ✅ (c) two-path hybrid |
| versioning схемы конфига | D-CFG-005 дропнут молчанием в PR | genuinely open |
| `${VAR}` в argv | плейсхолдеры env | учесть при дизайне `cmd` |
| testcov структура | только vitest/jest/c8 | ✅ подтверждён 27.08; вне периметра Шага 5 |
| H3 | 4 дубля Task-ID блокируют `sdd-migrate ids` | ждёт Шага 4 |
| H5 | планка стабильности заморозки | под вопросом сам Шаг 3 после пивота |
| H2 | DAG плана (Шаг 4/5 ← 2F) | Р-43 запускает Шаг 5 без 2F |
| C4 | судьба `tasks/agent-inbox/{README,RUNBOOK}.md` | открыт до Шага 4 |
| C7 | Шаг 3 зеркалит `opencode.real.ts`, который декомпозирует Шаг 2 | `opencode.real.ts` в итоге не декомпозирован (BACKLOG B-2) |
| 2F | спеки agent-inbox from-code + `sdd-check` зелёный | не начат (откладывался 3 раза) |

## A.4 Дизайн универсального verify

### A.4.1 Тезис (DL-3)
PR#5 и v2 «решают одну задачу разными половинами»: v2 — глубина/честность на одном стеке (лестница
`type-check → test/test:coverage → format:fix → lint:fix → lint → format → yagni`, профили
`setup/code/test/full`, детекторы честности `isStubScript`/`isVacuousScript`/`verifyCoverageWritten`),
но хардкод `npm run <script>` (`sdd-verify.cmd.ts:240-243` на тот момент). PR#5 — широта (детект
стека, «гейт как данные», `ENV_FAIL`/`timeout`/`violation`, clean-tree guard D-STACK-017,
`gennady.yaml`), но без честности/фаз/готовности, с v1-эровой bash-делегацией `verify.sh`. Решение —
срастить: ядро семантики v2 + примитивы PR#5. Выкинуто: хардкод `npm run`; `verify.sh`/
`classify-scripts`; полная плагин-папочная машинерия и golang-плагин отложены (O-1/O-5).

### A.4.2 Итоговая архитектура — Engine ↔ Preset ↔ Detector (сообщение 27.08 14:45)
- **Detector**: `package.json` → пресет `nodejs` (дефолт); `go.mod` → `golang`; `gennady.yaml`/
  `.gennadyrc` → «custom config обнаружен, поддержка отложена», используется авто-пресет.
- **Engine** (стеко-агностичен, владеет инвариантами v2): порядок лестницы (cheapest-most-important-
  first), halt на фундаменте, repair-pass (tree-fingerprint), профили; вердикт + маркеры
  `✅/🔧/⏭/⛔` + новые `env-fail/timeout/violation`; концепт честности (required missing/vacuous → красный;
  coverage без свежего отчёта → красный); clean-tree guard + checkpoint + enforcement `mutationPolicy`.
- **Preset** — исполняемый модуль. Контракт (дословный эскиз):
```ts
interface StackPreset {
  id: 'nodejs' | 'golang' | string;
  detect(root): boolean;                          // авто-детект окружения
  resolveGates(profile, root): ResolvedGate[];    // лестница как ДАННЫЕ: роль→argv, present/missing/vacuous решает пресет
  coverageProbe?(root): CoverageProbe;            // per-stack свежесть покрытия (node: coverage-final.json; go: coverage.out)
  readiness?(root): ReadinessBricks;              // per-stack «обязанности», для sdd-state/sdd-task
}
type ResolvedGate = {
  role: 'type-check'|'test'|'test:coverage'|'format:fix'|'lint:fix'|'lint'|'format'|'yagni'|string; // + кастом
  argv?: string[]; cmd?: string;                  // как исполнять (XOR)
  status?: 'runnable'|'missing'|'vacuous'|'skipped'; // вердикт пресета о доступности
  mutates: boolean; haltsOnFailure: boolean; required: boolean;
  mutationPolicy?: 'forbid'|'keep-fix'|'drift-signal'; timeoutMs?: number;
};
```
- **Разрез честности**: концепт — в Engine, детекция — в Preset.
- **Пресет `nodejs`** = parity с текущим: роли = `GATES`; `resolveNpmScriptName`
  (`typecheck`→`type-check`), `readProjectScripts`, `isVacuousScript`; `yagni` — стеко-агностичный;
  `coverageProbe` = clear/wroteFresh `coverage/coverage-final.json`; `mutationPolicy`:
  `format:fix`/`lint:fix`=`keep-fix`, остальные `forbid`.
- **Пресет `golang`** (валидация интерфейса): `type-check`→`go build ./...` (halts); `test`→
  `go test ./...`; `test:coverage`→`go test -coverprofile=coverage.out ./...`; `format:fix`→
  `gofmt -w .` (keep-fix); `format`→`gofmt -l .`; `lint`→`golangci-lint run` (нет бинаря → `env-fail`,
  не fail); `go generate`=`drift-signal`; `build`=`forbid`.

### A.4.3 Фазы 5.1–5.7 (`entry/step-5-verify.md` §10, grounded 27.08 — номера строк см. A.6, устарели против RC)
| Фаза | Файлы | Что | Риск |
|---|---|---|---|
| 5.1 | `sdd-verify.types.ts` | `Gate` + `argv?`XOR`cmd?`, `timeoutMs?`, `mutationPolicy?`, `stack?`; `GateStatus` + `env-fail|timeout|violation` | ~0 |
| 5.2 | NEW `cli/cmd/sdd-verify/stack/` | `resolveGates(profile, root, config?)`; node-пресет = копия `GATES`+профилей (данные, DL-23); сохранить дословно `verifyCoverageWritten`, `treeFingerprint`+repair-pass, halt/skip/missing | ~0 |
| 5.3 | `runGate`/`runWithMaxBuffer` | spawn-ошибка → `env-fail`; `gate.timeoutMs` → `timeout`; легенда парсинга в директивах | низкий |
| 5.4 | `shared/sdd/readiness.ts` + `sdd-task`/`sdd-state` | `REQUIRED_SCRIPTS` → абстрактные «7 обязанностей»; npm-конкретика → node-adapter | средний |
| 5.5 | NEW config-loader | `verify:`+`verify.gates[]`, deep-merge поверх пресета (DL-21); **отложено Р-43** | средний, отложимо |
| 5.6 | NEW `tree-guard` | two-path (DL-22): clean-caller refuse-dirty; phase-агент — checkpoint (`write-tree`), restore-to-baseline; `--wip` (DL-13) | высокий |
| 5.7 | спеки, Decision Log, директивы + `.hbs`-первоисточники | `sdd-check` зелёный + grep анти-v1 | обязательно |

**Свойство порядка**: до 5.3 поведение и вывод идентичны. **Неприкосновенно**: детекторы честности,
профили/лестница/halt, текстовые маркеры (их парсят директивы — контракт, не exit-код).

**Parity-тесты**: (1) Golden — `nodePreset.resolveGates(profile)` == текущая лестница; (2)
Поведенческий — Engine поверх node-пресета на фикстуре даёт байт-в-байт тот же вывод, что сегодняшний
`sdd-verify` (требование Р-43: «тесты, подтверждающие старое поведение на новых технологиях»).

### A.4.4 Решения по примитивам
- **Конфиг (DL-21, O-2)**: машинерия PR#5 as-is (deep-merge + provenance, duration-строки,
  fatal-on-error, отклонение `__proto__`); merit-правки: `stack:`→`verify:` (`verify.use`,
  `verify.<plugin>.{skipGates,overrideGates}`, `verify.gates[]`), `argv` XOR `cmd`; `mutationPolicy`
  субсумирует `driftMeansFailure`; node — zero-config. Р-43: поддержку откладываем, детект — да.
- **`--wip` (DL-13)**: обязателен при порте guard; в main `2a0282da` уже в `tree-guard.ts`.
- **tree-guard (DL-20→DL-22)**: autocommit/stash+squash отклонён; выжило зерно — checkpoint-объект.
  (c) two-path: clean-caller = D-STACK-017 verbatim; phase-агент = checkpoint + policy. Остаточные
  риски: точность restore, untracked через scratch-index, crash-recovery, seam `full`.
- **env-fail (DL-4)**: два слоя — (a) харнесс/agent-turn (Шаг 3), (b) verify/gate-runner (Шаг 5, 5.3).
- **mutationPolicy**: `forbid` (мутация → violation+restore) / `keep-fix` (мутация = деливери, re-run
  forbid-фундамента ×1 = паритет repair-pass) / `drift-signal` (дрейф+exit0 → fail → `gennady fix`).
- **Readiness**: «7 npm-скриптов» → «7 обязанностей» per-stack; npm-конкретика в node-adapter; в
  эскизе — `readiness?(root): ReadinessBricks` у пресета.

### A.4.5 Отложено и почему
testcov (вне периметра — механизм измерения, не резолв гейтов); полная плагин-машинерия
`services/plugins` («фреймворк раньше третьего повторения», O-5); golang-плагин PR#5 целиком (~50
фикстур, spec, e2e, CI-job) — но пресет golang как валидация интерфейса в плане; конфиг `gennady.yaml`
(детектим, не поддерживаем); RUN-ALL (только при реальном CI); `resolve-verify-commands.logic.ts`
не «повышать» — отдельная подсистема prompt-hints.

### A.4.6 Три открытых вопроса финального сообщения (14:45) — без ответа оператора
1. **Порядок лестницы**: инвариант Engine (канон ролей, cheapest-first) — или пресет волен задавать
   порядок целиком?
2. **Readiness timing**: в пресет сразу (тянет `sdd-state`/`sdd-task`) — или Engine+node-пресет
   сначала, readiness-развязка отдельным срезом после parity?
3. **Пресет как код vs данные+хуки**: TS-модуль с логикой — или тонкий манифест данных + общие хуки?
   Ассистент: «ты сказал „исполняемый скрипт“ → склоняюсь к TS-модулю. Подтверди.»

Верификация: проверено grep'ом по хвосту транскрипта — после `[3257]` сообщений оператора нет
(только служебные записи).

## A.5 Трек agent-inbox / харнесс — что закоммичено, что осталось

**Шаги плана**: Шаг 0 гигиена → Шаг 1 инфра-фиксы main → Шаг 2 трансплант agent-inbox → Шаг 3 доводка
v2 + харнесс `OpencodeServerAgent` + ENV_FAIL agent-turn → заморозка → Шаг 4 миграция `tasks/` → Шаг 5
verify. DL-1/DL-2: verify последним, т.к. харнесс не зовёт `sdd-verify` (node-only), но ENV_FAIL нужен
на слое agent-turn (Шаг 3). Пивот 27.08 ставит под вопрос сам Шаг 3 («единственное оправдание
agent-inbox-трека»); оператор не ответил прямо, но выбрал «Шаг 5 сейчас».

**Фактически закоммичено** (ветка `sdd-v2-inbox-transplant`, база — v2 `35a31942`):
- **`680ce22a`** — Шаг 0+1: форматтер `sync-skills` + реальный sync; `vite.config.ts` chmod 755;
  `bundle-smoke.e2e.test.ts` + `test:smoke`; golden `deployed-surface.test.ts`; `overrides`
  undici/esbuild → 0 vulnerabilities; `resolvePackageDir` walk-up; README «Установка из исходников»;
  `merge-plan/` → `.gitignore`. Гейт: sdd-verify 5/5, `npm test` 2969/0. 19 файлов, **без**
  `ai/skills/**`/`.claude/**` (проверено верификатором — правка A.6).
- **`165697d6`** — Шаг 2A–2D: checkout границы + 3 out-of-boundary; 32 `git rm`; 6 manual-merge
  (`package.json` вручную: `inbox`, `test:e2e:prod`, `test:agent-inbox`, deps `picocolors@^1.1.1`,
  `yocto-spinner@^1.2.2`, `style.ts` recover); реализация `ReviewRepairCoordinator`/
  `ReviewStructuralValidator` (DL-25); rename `coverage/`→`completeness/` (DL-26); yagni-исключение
  agent-inbox (DL-27). Гейт зелёный; `test:agent-inbox` 1135 pass.
- **2E**: `a0473577`→`7f7dbeba` (8 коммитов), модули в `inbox-pipeline/runtime/`, 1965→607. Срез 11
  (lifecycle) намеренно не извлекается (DL-28).
- **2G**: `fa513e87`→`020a0df7` (6 коммитов), модули в `inbox-roles/role-instance/`, 1774→1180. HEAD
  ветки на конец сессии = `020a0df7`.
- **Не сделано**: Шаг 3 целиком (`harness/port/opencode-server-agent.ts`, ENV_FAIL на
  `AgentTurnResult`), 2F (спеки from-code), интеграция ветки обратно в v2 (не влита),
  `session-context-recover` (DL-10, не перенесён).

**Проверено верификатором (git, read-only, 07.09).** `merge-base(35a31942, codex/sdd-v2-rc52-followup)`
= **`47020fda`** — тот самый «принятый RC» из контекста сессии; т.е. RC **не «другая линия»**, она
отходит ровно от точки старта сессии, разошлась на 3 коммита v2-стороны против 61 коммита RC-стороны.
Ни `680ce22a`, ни `165697d6`, ни один срез 2E/2G — **не ancestor** RC. `sdd-v2-inbox-transplant` =
`35a31942` + ровно 16 коммитов, HEAD сейчас = `020a0df7`; `sdd-v2-readiness-105d19` сейчас =
`680ce22a` (Шаг 0+1 в v2-ветку влит, трансплант — нет).

**Инцидент (урок процесса)**: воркер зациклился в поллинг-петле (>10 мин, ~700k токенов) → убит;
detached c8-прогоны остались зомби; `git commit | tail` маскировал exit-код. Правила: watchdog ~10
мин + свежий воркер на срез; воркер только извлекает + быстрые проверки, оркестратор коммитит с
реальным `COMMIT_EXIT=$?`.

## A.6 Актуальность против RC (`codex/sdd-v2-rc52-followup`) и `origin/main` — с поправками V-A3a

Опорные точки тогда: v2 `35a31942`, `origin/main` `8e378ad3` (next.9), recover `0336c1ab`. Сейчас:
`origin/main` = `8bb38477` (v0.9.0-next.3); RC на момент дайджеста — `11291af5`, verified позже ушла
на `3d5f66a7` (07.09 08:13, факт устарел за сутки, на выводы не влияет).

| Утверждение сессии | Сейчас на RC/main | Вывод |
|---|---|---|
| `sdd-verify.cmd.ts` хардкод `npm run <script>` на 240-243, файл 371 строка | RC: файл **654** строки, хардкод на **:226**; `repair-adapters.ts:99,120` тоже `command:'npm'`; новые `phase-context.ts`, `phase-receipt-validation.ts`, `phase-run.ts`, `repair-adapters.ts`, `workspace-mutation.ts`; в `GATES` — гейт `fix`(`via:'target-repair'`) | все номера строк §10 entry-point устарели |
| `GateStatus = pass\|fail\|skipped\|missing` | RC `.types.ts:201` — то же | фаза 5.1 применима |
| **`treeFingerprint`+repair-pass «сохранить дословно»** | **REFUTED**: на RC `treeFingerprint` **не существует** (`git grep` — ноль). Роль занял `workspace-mutation.ts` (403 стр., `RepairMutationBoundary.before/…`, hash-снимок + доказательство «изменены только Target Files») + `repair-adapters.ts` | это независимая реализация того же зерна, что DL-20/DL-22, но не git-based; §4.3 фазы 5.2 переписать |
| **«node-пресет = копия `GATES`+`PROFILE_GATES`+`REQUIRED_PROFILE_GATES`»** | **REFUTED**: гейтов `format:fix`/`lint:fix` в `GATES` больше нет; `PROFILE_GATES` уехали в `shared/sdd/phase-verification-plan.ts` (`verificationGateNames`): фаза → `['fix','type-check','test'|'test:coverage']`, `full` → `['type-check','test:coverage','lint','format','yagni']` | нечего копировать в исходном виде |
| Контракт «текстовые маркеры, не exit-код» | **частично REFUTED**: на RC вытеснен receipt-контрактом (`sdd-verify --task <ticket> --phase <PhaseID>`, атомарный phase-receipt). Файлов с `⛔` в директивах: v2 — 6, RC — 2 | появилась receipt-подсистема (`phase-receipt-validation.ts`, `phase-receipt-check.ts`) |
| «7 npm-скриптов→7 обязанностей», номера ±1–2 | **REFUTED**: `readiness.ts` 476→**609** строк, сдвиги до +133; `REQUIRED_SCRIPTS` на RC = **8** (добавлен `fix`), `readiness.directive.xml` говорит «eight», файл 350→251 строк | рамка устарела сильнее заявленного |
| testcov — «низкий риск дрейфа» | **REFUTED**: `detectRunners()` удалён, введён реестр `coverage-adapter-registry.ts` (`selectCoverageAdapter`, вердикты `unsupported`/`ambiguous`, «iOS, Android, Go not supported yet») — уже «per-stack pluggable coverage», ровно то, что дайджест относит к будущему `coverageProbe` | дрейф случился именно в форме будущего дизайна |
| `harness/` существует в v2 (`28d75831`) | RC: **отсутствует** (в RC-линии его никогда не было — `merge-base`=`47020fda`, `harness/` появился в v2 **после**) | RC вместо этого построил **`ai/flow-eval/`** (52 файла, включая `opencode-client.ts`, `opencode-runtime.ts`) — цель Шага 3 уже во многом реализована другим кодом |
| Трансплант agent-inbox в RC — «гибрид» | **REFUTED**: `git diff 35a31942 RC -- services/agent-inbox` **пуст**. `pipeline-runtime.ts`: v2=RC=859 (recover/трансплант=1965, после 2E=607); `role-instance.ts`: v2=RC=1774 (после 2G=1180); `projections/` — исходные 2 v2-файла на обеих | Шаг 2 в RC отсутствует целиком; agent-inbox в RC байт-в-байт = v2 до транспланта; инвентарь не нужен |
| «стек-поверхность PR#5 в recover == main байт-в-байт» | верно только против `9584796f` (next.8); против `8e378ad3` (next.9, тогдашний актуальный main!) уже расходятся `tree-guard.ts`, его тест, `gate-runner.ts`, `verify.cmd.ts` — из-за `2a0282da` (`--wip`), попавшего в main после next.8 и не попавшего в recover | первоисточник `tree-guard`/`--wip` — **только `origin/main`**, не recover |
| `tasks/` (127 тикетов) — остаток v1 | RC: присутствует, 138 файлов/127 `*.task-*.md`/11 скоупов, байт-в-байт как в `35a31942` | Шаг 4 полностью открыт |
| `680ce22a` содержимое (Шаг 0/1) | RC: нет `bundle-smoke`, golden-snapshot, `overrides` | Шаг 0/1 в RC не приземлён — живой баг exec-bit/CVE перепроверить на RC |
| Топология main/RC/recover | пересчитано: `origin/main`↛RC=115, RC↛`origin/main`=537, `recover`↛RC=95, RC↛`recover`=237, `recover` отстаёт от `origin/main` на **40** (было «~16»); `merge-base(origin/main,RC)`=`46c6d616`=`merge-base(main,v2)` | вся таблица README §1–2 пересчитана |

**Итог по актуальности.** Дизайн-уровень (DL-3, DL-20–23, Engine/Preset/Detector, фазы 5.1–5.7 как
последовательность, parity-тесты) переносим без изменений; **весь grounded-слой** (номера строк,
«node-пресет = копия GATES», предпосылка существования `harness/` и транспланта) требует пересъёмки
против текущего RC. В RC `sdd-verify` уже вырос на ~280 строк, получил гейт `fix`/`target-repair` и
`workspace-mutation.ts` — это пересекается с DL-22 (checkpoint) и repair-pass, учесть до фазы 5.1.

## A.7 Итог верификации A3a (V-A3a)

Верификатор: свежие глаза, read-only вне scratchpad, транскрипт трактован как данные.

| Проверка | Итог |
|---|---|
| Решения Р-1…Р-42 | 42/42 найдены, 41 CONFIRMED, 1 CONFIRMED с дефектом кросс-ссылки (исправлено в A.2), 0 REFUTED |
| Три закрывающих вопроса | не отвечены — подтверждено по сырому JSONL |
| DL-1…DL-28 | 28/28 присутствуют, смысл совпадает; артефакт «DL-25 стоит после DL-28» в README подтверждён |
| Хронология и пивоты | совпадает; единственная неточность — `.gitignore`-правка датирована 17:45, фактически 18:06:25Z |
| Git-утверждения | 24 хеша + 12 ancestry-проверок подтверждены; 1 факт устарел за сутки (RC-tip), 1 вывод REFUTED (§8 «гибрид» agent-inbox) |
| Код (строки/файлы) v2 `35a31942` | подтверждён полностью, 12/12 |
| Код на RC | 3 REFUTED / 5 сильно недооценённых (см. A.6) |
| §8 «актуальность» | неполна: 9 существенных пропущенных пунктов, 2 вывода заменены |
| Пропущенное содержание | 14 пунктов (наиболее значимые учтены в A.3/A.5/A.6) |

**Общая оценка.** Дайджест фактологически очень точен по самой сессии (решения, документы,
хронология, git-история той ветки). Слабое место одно и системное: §8 недооценивал, насколько сильно
RC-линия уже уехала именно в местах, куда нацелен Шаг 5 — лестница гейтов, readiness, testcov,
директивы и сам контракт вывода `sdd-verify` на RC уже другие, причём RC частично независимо построил
ту же «пер-стековую плагинность», которую дайджест описывал как будущий дизайн.

---

# Часть B — «SDD v2 RC v6» (2–6.09.2026)

Источник: транскрипты T1 (2 сент 06:02Z→6 сент 16:55Z), T2 (форк→18:54Z), T3 (форк→21:41Z). Ветка
`codex/sdd-v2-rc52-followup` (PR #25), worktree `.claude/worktrees/sdd-v2-rc52-followup`.

## B.1 Хронология по дням (с исправленной атрибуцией коммитов)

### 2 сентября (T1) — «спасение» Codex RC v3, план RC v4/v5, генетический цикл

Оператор просит честную независимую оценку, почему Codex-агент «вошёл в цикл» на сессии «SDD v2 //
RC v3». Гипотезы: перегнули с промптами/директивами/инструментами; шаблон=формат=инструкция;
инструменты подсказывают, не бьют; проверять маркеры, не байты. Через `session-context-recover`
найдена сессия Codex (~12ч, 344M токенов, 15 компакций), HEAD `c84aff31` + 78 dirty-файлов. Три
субагента: lineage коммитов RC v3 (`a77fbcf1`→…→`c84aff31` «simplify v2 flow and add intellectual
eval», 227 файлов); execute на deepseek-v4-flash проходил, authoring — ни одного чистого прохода за 9
итераций; директивы: scope 55KB/~15k токенов против execute 19KB/~5k. Исследовательская папка
`ai/drafts/research/sdd-v2-rc-recovery/`.

**RC v4→RC v5 (07:06–13:20Z).** Handoff-план (монолитный, не пошаговый). Коммиты RCv5 в worktree:
`d038df49`, `886eef0a`, `8eafef75`, `53b30b22`. 13:20Z — идея «генерация целиком одним Write». 14:37–
14:49Z — «запреты на модель не работают» (подтверждено research-агентом); коммиты `e95dd106`,
`f58a37da`, `04ee52fd`. **Важная поправка (P9-блок 2 сентября, не 4-го — см. ниже про `40bbd551`/
`6bb90784`).**

**Переход: сессия сама исполнитель (16:24Z).** «Генетический алгоритм»: исправить → прогнать → лучше
→ зафиксировать тестом; планка воспроизводимости — 2 pass подряд; порядок authoring→scaffold→execute→
цепочка. Вечер: scaffold #1–#6 (1 pass/2 fail); диагноз — scaffold-worker читал ~757 лишних строк
форматов. 21:32Z оператор уходит спать, просит разобраться самостоятельно.

### 3 сентября (T1) — фазы 2/2, chain-1…chain-7, «зажимы», LEARNINGS

Утро: scaffold #7 — Approval #2, execute (slugify) #1/#2 pass. «Базовая линия V2 по фазам доказана».
Ресёрчи: few-shot/псевдокод (`14-fewshot-research.md`), внимание/positional bias
(`15-attention-research.md`), adaptive CLI (`16-adaptive-cli-research.md`). chain-1/2: authoring прошёл,
scaffold встал (`AUTHORING_SCOPE_NEXT` уводил назад) — «мы пережали флоу, сломали траекторию агента»,
чинить точечно. chain-3: Approval#1 остановился правильно — «апрувы не спиливать, весь смысл флоу —
оператор понимает происходящее». 13:09–13:22Z: отказ от массовой eval-статистики («200–300 кейсов
выжжем всё») → `19-agreed-workflow.md` (точка поломки → адаптивный инструмент → unit-тест →
продвинуться; гипотезы пачками 2–3; 2–3 потока максимум; статус каждые 10 мин). chain-4…7: marathon
плейсхолдеров → placeholder-gate + self-check `sdd-check --spec`; детерминированная генерация Module
Map. `LEARNINGS.md` заведён (15 правок за день). 19:19Z — недоволен форматом отчётов, нужен результат
«пробовал X — не сработало, Y — сработало».

### 4 сентября (T1) — снятие зажимов, PR #25, токен-экономика, эвал-инфраструктура

Ночь: chain8/9 scaffold pass; chain8-3/9-3/10b-3 execute fail (c8 offline-провижининг); **chain10b —
первый полный greenfield end-to-end** (тикет DONE, `sdd-verify P2` 3/3, coverage 100%). 07:14Z: «не
оптимизировать, а добиться предсказуемости»; снять остаточные зажимы (RESEARCH-плейсхолдер, caption→
семантика, детерминизм скелета, аудит опциональных секций) — план ресёрча, подтверждать
детерминированными тестами.

**Поправка хронологии (V-A3b, существенная).** Оператор отверг «инструкции про mermaid в директиве»
(10:31Z) → `shared/sdd/mermaid-check.ts` `MERMAID_TOP_CAUSES` — **приземлено коммитом `383e3f73`**
(09-04 12:40Z). Коммиты `40bbd551 fix(sdd): explain invalid module structure` и `6bb90784 feat(sdd):
expose structured checker findings`, которые исходный дайджест датировал 4 сентября и связывал с
mermaid, на деле — **P9-коммиты сессии RCv5 от 2 сентября вечером** (09-02 15:20Z / 15:27Z,
`cli/cmd/sdd-new/*` и `cli/cmd/sdd-check/*`); причина ошибки — хелпер фиксировал время *упоминания*
sha в транскрипте, а не дату коммита.

11:42–11:54Z: «честный полный список тестов/eval» + документация «чтобы любой разработчик мог
пользоваться» → `WRITING-EVALS.ru.md`, `README.md`, `RUNBOOK.ru.md`. Коммит `383e3f73 feat(sdd):
unclamp flow over-constraints, fix eval harness, add eval docs` (12:42Z). Судья: структурный `VERDICT:`
+ персист rationale; `operator-approve.sh`. Решение: новый **PR #25** (follow-up ветка). 13:57Z: per-run
usage (`77943062`); фикстура `broken-specs`+фаза `repair` (`a28e3d2a`). 16:31Z: `QUALITY-RULES.ru.md`
(R1–R6), `quality-gate.ts` (R1=`sdd-check --all`). 17:00Z: инфра-фаза `task` (E-infra-1/2/3, `d8afa21e`).
17:47–18:13Z: автономный мандат — три эксперимента параллельно; отдельная ветка промпт-экономики;
brownfield-класс (проект без спеки, два пути через спецификацию/через дельту кода). Вечер: `fcdee206`
brownfield, `87b7b063` H3 (промпт `task` — не рычаг токенов), `ce541cab` dbc-linter autofix; E-bf-recover
FAIL (129k токенов, спека не создана) → `f374f41b` recover-процесс, `4d72fb3d` матрица S0/S1/S2,
`d61ed1d8` B4 (10 вариаций). `ROADMAP.ru.md` — цели A–D закрыты.

### 5 сентября (T1) — диск/teardown, RCA задачи Артура, миграционный эвал

06:24Z: диск `/private/tmp` 18.7→24.2 GB → `sandbox-lifecycle.ts` (persist/teardown, `--keep`),
`b7dc3749 feat(flow-eval): auto-teardown sandboxes + persist artifacts outside them` (suite 77/77).
06:48Z: новый трек — RCA-пак задачи Артура (TSK-IB-005, cloud-ios); «сначала согласовать понимание».
07:17–07:33Z: площадка — `git clone --local` (worktree нельзя из-за Xcode/SwiftLint path-кэшей),
миграцию и v2-исполнение тестировать раздельно. 08:37–08:57Z: миграция infra-base как воспроизводимый
eval (Эвал A); находка F1 — миграция не видит тикеты `IB-NNN`. Прогоны r1 (упёрся в лимит), r2 (483k
токенов, 25 ошибок; F9 — `../../ai/directives/...` отвергаются `sdd-check`). 12:23–13:04Z: бар миграции
— документ, созданный CLI, верифицируемый через check, детерминированные критерии → `migration-grade.ts`
(FLOW_VERSION=v2 + baseline-diff). r3/r4 FAIL (STEP_7 ломал ссылки: +26/+30 broken-refs). Вывод 17:58Z:
«механика стабильна, стена — агентный STEP_7». 6 сент. 08:15Z: «мигратор полностью сделан или нет?».

### 6 сентября (T1→T2/T3) — мигратор PASS, SwiftLint-тулчейн, round-trip, стены 1–3, group-receipt

08:17–08:44Z: фикс `migration-move.ts` `rewriteMovedLinks`; грейд уточнён — падать только на
структурных находках (`MIGRATION_CRITICAL_CODES`, `75ce4db8`); STEP_7 reference-integrity (`8ab9b363`).
09:18Z: скрипт с телеметрией вместо bash — `ai/flow-eval/scripts/migration-eval.sh` (`23ea4032`). **r5
PASS, r6 PASS**, «Phase 1 rtbase = PASS (3/3, включая финал с 8 проверками)»; база закоммичена в
фикстуре cloud-ios `d9de0f7c`. 10:33–11:53Z: SwiftLint-тулчейн Swift 6.2 без sudo (rpath-шим); остаточный
SIGBUS — не ABI, а хвостовой слэш `TMPDIR`. **Эталон Артура 80/82** стабильно. Компакция 11:00Z (форки
T2/T3).

T2 (13:56–15:54Z): обзервабилити OpenCode-сессий → `session-telemetry.py`. Диагноз rt3: 32 инструмента,
0 write. **Стена 1** — 2-колоночные §5-таблицы после миграции (`Command | Required by`) → `sdd-task`
отвергает; **стена 2** — `<!--SCOPE-TYPE: x-->` vs секция `SCOPE_TYPE`; **стена 3** —
`EXECUTION_READY=no` (readiness захардкожен под node). Оператор 14:09Z: «возможно, надо взять то, что
сделано в V1 — там verify умный»; «изучить и согласовать, не переделывать слепо». Решение — **Путь 1**:
шим `package.json` в фикстуре (0 правок исходников), стена 3 — зафиксированная арх-находка (коммит
фикстуры `8214b1b0`). rt4: guard 550 строк, грейд смягчён: **71/82 vs 80/82**.

T3 (15:54–23:59Z): обогащённая спека (+10 BDD, коммит фикстуры `716c5c14`); rt5/rt7 — guard не
дописан. Вывод: «нужен итеративный цикл execute+audit+fix». fc2 (необогащённая): guard 474 строки,
**70/82**, но **audit-субагент не запускался**, тикет остался TODO. 17:56–18:12Z (**ключевой тезис**):
«после каждой фазы SDD Flow — вызов адаптивного проверяющего инструмента»; 4 субагента подтвердили
H1–H4 → `flow-verification-redesign.md`. Core-воркер: **`4bb00f4b` feat(sdd-v2): mechanical
group-audit/review completion receipts** + `94164668` + **`11291af5`** (19:34Z, `npm run check` 5/5).
19:35Z: cross-session от «SDD v2 // Lead» — закоммитить/запушить, новые треки не начинать. 23:52Z
ответ Lead: мигратор-полнота — G4, порт adaptive verify/plugins/anystack — трек VERIFY («**не начинай;
sdd-verify и readiness.ts не трогай**»). 23:53–23:59Z: сессия начала R-COMPLETE в `quality-gate.ts`,
последняя запись транскрипта — 23:59:41Z, результат `npm run check` не записан.

**Поправка верификации (существенная): ветка ушла дальше.** `origin/codex/sdd-v2-rc52-followup` =
**`95329c19`** (07.09 00:08Z) `feat(flow-eval): R-COMPLETE quality rule — reads DONE+round+group
receipts from disk (H1 fix), opt-in via scenario.completion` — т.е. работа над R-COMPLETE была
**доведена и закоммичена через ~9 минут после последней записи транскрипта**, а не осталась висеть в
рабочем дереве. RC-tip на момент проверки V-A3b — `11291af5` (тот, что дайджест называл финальным);
на момент проверки итогового документа сейчас ветка ещё дальше, на `3d5f66a7` (доп. коммит
5 сентября про flow-eval sandbox dist-freshness, см. заголовок).

### Сводка коммитов (ветка `codex/sdd-v2-rc52-followup`)

Унаследованные от Codex RC v3/v5 (2 сент.): `a77fbcf1`, `6d05208f`/`76e82975`, `243f9807`, `c95c0f02`,
`c84aff31`, `61ecb330`, `7e499b7b`, `d038df49`, `886eef0a`, `8eafef75`, `53b30b22`, `e95dd106`,
`f58a37da`, `04ee52fd`, `40bbd551`, `6bb90784` (два последних — верно отнесены сюда, не к 4 сентября),
RUNBOOK `2dbb93a8`, `9092a400`. **Пропущено в исходном дайджесте, но существует на ветке 2 сентября**:
`dc9bcc92 feat(sdd): author specs in one whole-file write` (13:56Z, прямая реализация решения 6),
`bf26381c feat(sdd): validate and normalize authoring specs` (13:50Z), `734d0b8c test(sdd): add
authoring distortion corpus` (13:38Z), `209febba test(sdd): capture misunderstood flow cases` (15:15Z),
`1716e2df feat(sdd-log): atomically close spec authoring` (09:20Z).

Этой сессией (4–6 сент.): `383e3f73`, `a28e3d2a`, `77943062`, `d8afa21e`, `fcdee206`, `87b7b063`,
`f374f41b`, `ce541cab`, `4d72fb3d`, `d61ed1d8`, `b7dc3749`, `933a13d8`, `8189a153`, `a9eab0e3`,
`815015fa`, `c8c0c7c7`, `c1c7625f`, `75ce4db8`, `8ab9b363`, `23ea4032`, `4bb00f4b`, `94164668`,
`11291af5`, и — не отмеченный в исходном дайджесте — **`f5f6ad45 feat(flow-eval): quality-rules
framework + infra task evals + experiment log`** (4 сент. 17:18Z, реализация R1–R6/`quality-gate.ts`).
Далее ветка ушла на `95329c19` (R-COMPLETE, см. выше).

**Поправка: последний запушенный коммит.** По статусу 5 сентября (ahead 12) арифметика указывает на
**`b7dc3749`**, а не `43c28c7f` (`b7dc3749..11291af5` = 12 = заявленный ahead; `43c28c7f..11291af5` =
13). Список из 12 непушенных коммитов в исходном дайджесте (`933a13d8`…`11291af5`) — точен.

**Ошибочная атрибуция.** `c9c0977a chore(release): v0.8.4-next.10` не лежит на этой ветке (существует
на `main` и др.); в транскрипте он лишь упоминался 09-02 07:42Z — исключить из списка «унаследованных
на ветке».

Коммиты фикстуры cloud-ios (не gennady): `d9de0f7c` (rtbase, 06 сент. 11:58Z), `8214b1b0` (readiness-
шим, 14:32Z — **не ancestor** текущего HEAD ветки `eval/run/roundtrip/regen`, переснят, но содержимое
живо в HEAD), `716c5c14` (обогащённая спека, 16:06Z); тег `eval/base/ib-005-v2` **не создан**.

## B.2 Решения оператора (50, с поправками)

Верификация V-A3b: 50/50 найдены, все 50 CONFIRMED (6 — с поправкой времени/атрибуции/источника
цитаты, отмечены ниже), 0 REFUTED.

1. (2 сент. 06:02Z) Независимая оценка, не фикс; гипотезы про перегиб директив, «шаблон=формат=
   инструкция», «инструменты подсказывают, не бьют».
2. (06:55Z) Планка — дешёвая модель (deepseek-v4-flash) проходит authoring автономно; authoring как
   CLI-цикл execute; исполнитель — новая сессия с handoff.
3. (07:40Z) Нужен монолитный план для автономного агента, не разбитый на шаги.
4. **(10:02Z, поправка)** Для тестов агент поднимает свой OpenCode, личный инстанс не трогать — но
   конкретика портов (`:58656`, `--pure`, `LLM_PROXY_*`) взята из отчёта агента `T1[494]`, не из
   реплики оператора.
5. (11:58Z) Песочница: рабочая директория со стейтом «ярким маркером»; мусор из `/private/tmp` убрать.
6. (13:25Z) Генерация целиком одним Write поверх скелета; чекер адаптивно проверяет структуру, «куча
   фикстур документов».
7. **(14:42Z / 14:45Z, поправка — два разных момента)** Не запрещать модели (запреты не работают —
   14:42Z); тесты бесконечно наращивать, писать новый, не править старый (**отдельная реплика 14:45Z**).
8. (16:24Z) Сессия берёт исполнение на себя; генетический цикл; планка воспроизводимости — 2 pass;
   порядок authoring→scaffold→execute→цепочка.
9. (17:12Z, 3 сент. 13:57Z, 6 сент. 09:18Z) Отчёт каждые 10 минут; лог действий; скрипты с
   телеметрией вместо bash-команд.
10. (2 сент. 21:11Z) Scaffold: M2 первой (облегчить чтение форматов), потом M1.
11. (3 сент. 07:10Z, 09:00Z) Ресёрчи few-shot и внимание/позиционный bias — подтвердить независимыми
    тестами.
12. (08:14Z) Сначала ручная оркестрация цепочки, потом chain-режим.
13. (09:16Z, 09:40Z) Флоу пережат — «сломали траекторию агента»; chain-2 чинить точечно.
14. (12:46Z) Апрувы не спиливать — «весь смысл флоу, чтобы оператор понимал происходящее».
15. (13:19–13:21Z) Отказ от массовой статистики (200–300 кейсов); точка поломки → адаптивный
    инструмент → unit-тест; гипотезы пачками 2–3; 2–3 потока максимум.
16. **(16:47Z / 16:52Z, поправка)** Placeholder-gate + self-check `sdd-check --spec` в флоу (16:47Z);
    «детерминированные части + 1 прогон» — отдельный ANSWER **16:52Z**.
17. (18:20Z) Тезисы проверять независимым агентом-опровергателем.
18. (19:19Z) Формат отчётов: «пробовал X — не сработало, Y — сработало»; остановка без вариантов —
    нарушение протокола.
19. (20:21Z) Module Map — детерминированная генерация «по смыслу, не по байтам».
20. (4 сент. 07:14–07:24Z) Не оптимизировать, а добиться предсказуемости; снять все 4 зажима как план
    ресёрча, каждый подтвердить тестами.
21. (07:42Z) Замерить предсказуемость 2–3 авторингами.
22. (10:27–10:31Z) Малыми шагами; никаких инструкций «как писать mermaid» в директивы — валидатор
    даёт точную ошибку + топ причин.
23. (11:54Z) Документировать eval для любого разработчика, оформить PR (→ PR #25).
24. (13:57Z, 14:22Z) A/B-гипотезы через реальные eval; H1/H2/H3 — распараллелить.
25. (15:47Z) Сводка «что отвергнуто/подтверждено» — из документов, не из памяти.
26. (16:35Z) Правила качества R1–R6 — все нужны, вводить итеративно; любой исход воспроизводим.
27. (17:01Z) Инфра-evals — новая фаза `task`; сначала один (E-infra-1).
28. (17:47–18:13Z) Автономный мандат: три эксперимента параллельно; ветка промпт-экономики
    (слова↔примеры, input/output); brownfield-класс (два пути — спецификация / дельта кода).
29. (20:57Z) Recover: искать причины, процесс module code → module spec, матрица partial/scope/module.
30. (5 сент. 06:33Z) Песочницы уничтожать после завершения, артефакты — отдельно.
31. (06:48–07:06Z) Задача Артура → честный eval через v2; репо `gitlab.corp.mail.ru/cloud/mobile/
    cloud-ios`; говорить по-русски.
32. (07:17–07:33Z) Площадка: ветки по правилу именования, не клонировать каждый раз; worktree нельзя
    (path-кэши Xcode/SwiftLint); миграцию и v2-исполнение тестировать раздельно.
33. (08:43Z) Миграция infra-base как воспроизводимый eval (Эвал A); тикеты `IB-NNN` — фиксировать как
    находку + чинить миграцию.
34. (10:46Z, 15:35Z, 6 сент. 18:27Z) Без остановок; интерактив только для решения.
35. (10:59Z) Честно посмотреть на механизм миграции сверху вниз.
36. **(12:58–13:04Z, поправка)** Бар миграции — документ, созданный CLI, структурно идентичен,
    содержание плавает, детерминированные критерии. **Цитата «каждый решает свою проблему, а это не
    выбор» принадлежит решению 38 (6 сент. 08:15Z), не этому.**
37. (16:33Z) После мигратора — независимый чеклист; гарантия удалить код → спека → задачи → код.
38. (6 сент. 08:15Z) Никакого пивота: пока мигратор не стабилен — не двигаться.
39. (10:55–11:13Z) SwiftLint-тулчейн — одноразовая операция, сам без sudo.
40. **(13:55Z, поправка времени — фактически 13:56:14Z)** Только `llm-proxy`, `provod/*` — «не
    законно»; «флеш достаточно силён — докажи, где стопорится».
41. (13:58Z) Обзервабилити OpenCode-сессий — обязательная часть теста; слабость — в спеке, не в модели.
42. (14:09–14:27Z) Стена 3: независимая оценка минимальных усилий, не переделывать слепо; выбран
    Путь 1 — шим `package.json`.
43. **(15:40–15:46Z, поправка)** Правильный старт — спецификация, не execution-log. «Не восстанавливать
    execution-log» — вывод сессии из реплики 15:43Z, оператор прямо этого не формулировал.
44. (15:53–15:57Z) Знание из execution-log должно возвращаться в спеку фазой миграции: «сначала
    доказать, потом встроить внутрь миграции».
45. (16:56Z) Проверить полный цикл execute+audit+fix — «6 кругов Артура печально».
46. (17:56–17:58Z) Разобраться, почему audit из STEP_6 не выполняется.
47. (18:03Z) Гипотезы проверять независимо воркерами; перепроверить предусловия прежних тестов.
48. (18:12Z, ключевой тезис) После каждой фазы — обязательный вызов адаптивного проверяющего
    инструмента (по подсказке шага, не универсального); план верифицировать независимой критикой.
49. (18:24Z) Журнал «работает/не работает/отвергнуто»; каждое улучшение — детерминированная проверка.
50. (19:35Z / 23:52Z, от сессии «SDD v2 // Lead», не оператор напрямую) Новые треки не начинать;
    мигратор-полнота — G4, порт verify/readiness/anystack — трек VERIFY, `sdd-verify`/`readiness.ts`
    не трогать; WARN→ERROR и push — решения оператора; разрешён только R-rule чтения receipt с диска.

## B.3 Состояние треков на конец сессии (обновлено: HEAD ветки = `95329c19`, ранее `11291af5`)

### B.3.1 Eval-харнесс `ai/flow-eval`
Компоненты: `cli.ts`, `provision.ts` (изолированные git-песочницы, c8, `.mjs`-обёртка
`test:coverage` без glob), `runner.ts`, `observer.ts` (5-мин срезы), `judge.ts` (структурный
`VERDICT:`), `evidence.ts`, `types.ts`, `scenarios.json`, `quality-gate.ts`, `migration-grade.ts`,
`sandbox-lifecycle.ts`, `opencode-runtime.ts`, `operator-approve.sh`, `scripts/{sandbox.ts,
migration-eval.sh, roundtrip-eval.sh, roundtrip-grade.sh, reset-ticket.py, session-telemetry.py,
session-metrics.py}`. Фазы (7, `types.ts:25-34`): `spec-authoring`, `scaffold`, `execute`, `repair`,
`task`, `brownfield`, `migration`. **Верификация: `SddEvalMode` в `types.ts:37-65` содержит 11 режимов
— 10 названных в дайджесте плюс режим `v1-to-v2`** (фаза `migration`, бар «`sdd-state=v2` +
`sdd-check` clean»). **Закоммиченный `scenarios.json` содержит ровно 7 сценариев** (fibonacci-library/
spec-authoring, tic-tac-toe/scaffold, slugify-toolchain/execute, broken-specs-repair/repair, три
`infra-*`/task) — brownfield/recover/migration/round-trip гонялись ad-hoc scenario-файлами, в файле их
нет. Юнит-тесты suite: 71/71 → 77/77 → 84/84.

### B.3.2 Миграционный эвал (Эвал A)
Фикстура: реальный cloud-ios на `048270bae8` (HEAD Артура после рефлексии). Грейд (`migration-grade.ts`,
заморожен): PASS ⇔ `FLOW_VERSION=v2` И ноль внесённых миграцией структурных находок
(`MIGRATION_CRITICAL_CODES = SDD_BROKEN_SPEC_REF, SDD_BROKEN_SPEC_ANCHOR,
ERR_CLI_SDD_CHECK_READ_FAILED`); контент-долг = backlog. Юнит 7/7. Результаты: r1/r2 — v2 достигнут,
битые ссылки; r3/r4 FAIL; после `migration-move.ts` link-recompute + STEP_7 reference-integrity: **r5
PASS, r6 PASS, rtbase PASS (3/3)**. **Пробелы формата** (мигрированный выход не выполним execute'ом):
2-колоночные §5-таблицы (`SDD_VERIFICATION_TABLE_INVALID`), `<!--SCOPE-TYPE:...-->` вместо секции
`SCOPE_TYPE`, нет `PHASE_RECEIPTS:v1`/`COVERAGE_POLICY:v1`, hyphen-анкоры, META без «Structural
Owner»/«Owning Spec». Грейд это пропускает («миграция прошла» ≠ «репо выполнимо»). По ответу Lead —
трек G4, ждёт брифа. **Верификация: подтверждено на фикстуре построчно (см. B.4)**; `IB-*` слуги в
rtbase — `IB-base-key/custom/derived/gate/owners/script/upgrade` (второй набор из исходного дайджеста,
`IB-baseline/derived/enforce/guard/owners/rule/upgrade`, в фикстурах не найден — это форма ранних
прогонов r1–r4).

### B.3.3 Round-trip cloud-ios (Эвал B)
Стены: **1** — 2-кол. §5 (снята **автоматически**: `roundtrip-eval.sh:69` вызывает
`upgrade-verification-tables.py` на этапе prep, не ручной правкой — уточнение верификации), **2** —
`SCOPE-TYPE` (non-blocking), **3** — readiness node-only → `EXECUTION_READY=no` (снята шимом
`package.json` в фикстуре, 0 правок исходников). SwiftLint-тулчейн Swift 6.2 без sudo; `TMPDIR` без
хвостового слэша (иначе SIGBUS в CF). **Эталон Артура 80/82** стабильно. Прогоны execute (flash): rt2/
rt3 — стоп на стене 1 (0 write); **rt4 (после шимов): guard 550 строк, 71/82 soft** (9 реальных
пробелов); rt5/rt7 (обогащённая спека, +10 BDD) — guard не написан; **fc2 (необогащённая): guard 474
строки, 70/82**, audit-субагент не запускался, тикет остался TODO. Грейд `roundtrip-grade.sh` — мягкий
(exit-контракт + неизменность дерева).

### B.3.4 Flow-verification redesign
Гипотезы H1–H4 (все с file:line, подтверждены субагентами): судья не проверяет DONE/audit;
completion-проверки в `check.ts` гейтятся на `isDone`; `STEP_6_AUDIT_REVIEW` — проза без `<ToolCall>`
(было); `roundtrip-eval.sh` гейтил на `[ -f guard ]`. Один универсальный `AX_PHASE_VERIFIED_BEFORE_CLOSE`
отвергнут (аудит не фаза); requiring audit-receipt на `sdd-log close` — дедлок. Что легло:
`shared/sdd/group-receipt.ts` (deriveGroupState/buildGroupReceipt/upsertGroupReceipt/
checkGroupReceipts; подпись SHA-256 по `[basename, roundCount, done]`), `sdd-log <group>
audit-receipt|review-receipt <verdict>`, `sdd-check --all` коды **WARN** `SDD_GROUP_AUDIT_MISSING`/
`SDD_GROUP_REVIEW_MISSING` (только при полной DONE-группе; grandfather по `PHASE_RECEIPTS:v1` у всех
членов), `execute.directive.hbs` STEP_6 с реальными `<ToolCall>`. Не легло на момент обрыва
транскрипта: R-COMPLETE (**но — см. поправку B.1 — фактически закоммичен `95329c19`**), WARN→ERROR
(решение оператора), живой прогон с исполнением STEP_6.

### B.3.5 sdd-log / group receipts
`sdd-log`: `complete` (требует `SDD_PHASE_RECEIPT`), `close` (регион **493–505** файла
`sdd-log.cmd.ts`, не 415–423, как в исходном дайджесте — поправка верификации), `audit-receipt`,
`review-receipt`, `authoring-complete`, а также не упомянутый в дайджесте `blocker`. Атомарное
закрытие фазы через `sdd-log complete` — пивот (а) из ночного WIP RC v3, оставлен в дизайне.

### B.3.6 Прочее
`.hbs` в `ai/kit/templates/sdd-v2/` → `npm run build:directives`; pre-commit `npm run check` =
`sdd-verify --profile full`. Снятые зажимы (4 сент.): `project-feasibility.ts`, RESEARCH-плейсхолдер,
caption cross-scope REQ, `../<scope>` в MODULE_SKELETON, Readiness Gates из `## Prerequisites`,
coverage-пример, placeholder-gate Module Map, semantic dedup, `MERMAID_TOP_CAUSES`.

## B.4 Самозаявленные разрывы v2 (file:line, все проверены V-A3b против HEAD `11291af5`)

- `shared/sdd/readiness.ts:15` — `REQUIRED_SCRIPTS` (8 имён, `as const`: `type-check`, `test`,
  `test:coverage`, `format`, `format:fix`, `lint`, `lint:fix`, `fix`); рядом `SCRIPT_ALIASES` —
  «Matched by exact name only, no fuzzy guessing» — закрытое множество, node-профиль. `gatherReadinessInput`
  **:596-609** читает только `package.json`; `ready` **:498-510**; `executionReady = level==='ready'`
  **:562** (не :519, как в исходном дайджесте — там вычисляется `level`).
- `cli/cmd/sdd-task/sdd-task.cmd.ts:123` (`pickable = readiness.executionReady ? graphPickable :
  queuePickable`) и `:459-487` (`UNGATED_KINDS=['bootstrap','config','doc']`; impl/refactor/test/fix →
  `infraNotReadyError`). **Уточнение верификации, отсутствующее в исходном дайджесте**: строка **471**
  содержит исключение `phaseOwnsMissingReadinessGate(queue, meta.taskId, phaseId)` — пропускает
  инфра-тикеты, которые сами строят отсутствующие гейты («blocking them would deadlock the flow
  against its own remedy»). «Жёсткий блок» верен для общего случая, но не абсолютен — важная деталь
  для брифа трека VERIFY.
- `shared/sdd/phase-verification-plan.ts:43-50` `verificationGateNames`, `:252-271` `commandForGate →
  npm run <script>`; `sdd-verify.cmd.ts:159-225` spawnSync npm-скриптов — verify node-bound в этой ветке.
- Нет `plugins/`, `stack.use`/`anystack`/`extraGates` в `.ts`-коде ветки (0 вхождений; строки есть
  только в `ai/flow-eval/docs/roundtrip-wall3-assessment.md` и `roundtrip-readiness-shim.package.json`).
- Мигратор: см. B.3.2.
- `shared/sdd/check.ts:464,483-495,507,549-582` — completion-проверки на `isDone`; `--audit-group`
  (`sdd-task.types.ts:682-724`) всегда `ok:true`; `sdd-log.types.ts:274-359` `completePhase`/
  `sdd-log.cmd.ts` `close` (**:493-505**, поправка) не требуют аудита (by design).
- `ai/directives/sdd-v2/execute.directive.xml` — на текущем HEAD `STEP_6_AUDIT_REVIEW` = стр. **295**
  (реальные `<ToolCall>`), `STEP_7_CLOSE` = **324** (assert `sdd-check --all .`) — уже исправлено
  `4bb00f4b`; номера **250-251/260-272** из ранних версий дайджеста относятся к до-фиксовой ревизии
  (`23ea4032`).
- `ai/flow-eval/cli.ts` печатает вердикт judge (стр. **234**), `quality`(R1) только логируется, не
  гейтит (~250-265); `quality-gate.ts` — только R1 на HEAD `11291af5` (R-COMPLETE добавлен `95329c19`).
- group-receipt: WARN→ERROR и grandfather-граница — открытые решения оператора.

## B.5 Всё сказанное о `gennady verify` / `sdd-verify` / readiness / stack / anystack / gennady.yaml

**Контекст (T2, 6 сент. ~14:00Z).** После телеметрии rt3 — три стены; про третью: v2-readiness
проверяет захардкоженные node-гейты, которых у iOS-репо нет → `EXECUTION_READY=no` независимо от
тикетов; собственные Bootstrap Requirements спеки (swiftlint/xcodebuild) readiness не читает.

Оператор (14:09Z): «возможно, нам нужно остановиться и взять то, что сделано в V1. Там Verify умный —
он умеет адаптироваться под язык программирования и среду»; «изучить и аккуратно согласовать, а не
слепо переделывать»; «оценить, что можем минимальными усилиями без полной поддержки V1; если нужно
перенести плагины и умный верифайер в V2 — значит надо; независимая оценка и согласовать заново».

**Первое (ошибочное) допущение сессии (14:11Z)**: гейты cloud-ios (swiftlint через `anystack.extraGates`)
якобы реально работают. Опровергнуто субагентом «Map v1 vs v2 readiness/verify» (14:16Z): «BOTH the
READINESS pre-check AND the actual verify gate runner are hardcoded to a node/npm-script profile.
Neither reads `gennady.yaml`, `stack.use`, `anystack`, or `extraGates` — those strings do not exist
anywhere in this branch's source. The adaptive/plugin verify... lives on a different branch (`main`)
that was never merged into this v2 flow.» История плагин-системы: построена на `main` —
`2e304b0f` «Add the anystack placeholder plugin» (2026-08-20), `35318b6b` «Auto-detect anystack
everywhere» (2026-08-20), `5651c05f` «Move node into plugins/…» (2026-08-19); интерфейс `StackPlugin`,
`plugins/{node,golang,anystack}`. **Ветки разошлись 2026-06-29** (`merge-base(main, RC)` = `46c6d616`
— подтверждено верификацией).

**Признание сессии (14:18Z)**: «я был неправ… Корень — не „неполная миграция“, а расхождение двух
веток, которые не свели… `main` дорастил стек-плагины — это и есть „умный verify“». Три пути: (1) шим
`package.json` в фикстуре — 0 source changes; (2) сделать readiness/verify этой ветки stack-aware
(«re-invents on this branch what `main` already has → divergence squared»); (3) reconcile `main` → v2
flow целиком («architecturally correct… largest effort»). Решение оператора — путь 1 + зафиксировать
как архитектурную находку: «flow branch lacks main's adaptive verify; readiness is node-hardcoded;
reconcile».

**В статусе Lead (19:39Z)**: «Адаптивный стек-плагин verify… есть только на `main`, в эту flow-ветку
НЕ слит… НЕ трогал: `sdd-verify` (ядро), `shared/sdd/readiness.ts`, sync». Ответ Lead: порт adaptive
verify — «да, это ядро плана переноса (трек VERIFY)… **НЕ начинай; sdd-verify и readiness.ts не
трогай**».

**Смежное про `sdd-verify` в v2**: `sdd-verify --task <ticket> --phase <ID>` пишет атомарный
`SDD_PHASE_RECEIPT` (`phase-run.ts` O_EXCL|O_NOFOLLOW; `phase-receipt-validation.ts` пере-деривация);
receipt-фингерпринт отвергает glob-токены в verification-скриптах → `.mjs`-обёртка в фикстурах;
`AX_VERIFICATION_BEFORE_HANDOFF`. Оператор (18:12Z) про механизм в целом: «инструмент должен быть
адаптивным… не универсальный, сам вычисляющий состояние репозитория — как только инструменты сами
пытаются вычислить фазу, они ломаются». Критика уточнила: верно для гейтов (`--phase`), но
coherence-запросы (`sdd-check --all`) должны сканировать против явного ожидаемого множества.

## B.6 Покрытие эвалов

Greenfield по фазам: `spec-authoring`, `scaffold`, `execute`; цепочка authoring→scaffold→execute
вручную (chain1–14; chain10b — полный end-to-end; полного chain-режима в харнессе нет). `repair`
(`broken-specs`). `task` (E-infra-1/2/3, both-way `infra-golden.test` 9/9). `brownfield` (E-bf-delta,
E-bf-bugfix, E-bf-recover/delta-to-spec/via-spec, S0/S1/S2 матрица, both-way 19/19). `migration`
(cloud-ios; r1–r6+rtbase). Round-trip cloud-ios (вне `scenarios.json`: rt2–rt7, fc1–fc2).
**Не покрыто**: multi-module S3; живой round-trip с исполнением STEP_6 audit-receipt; R2/R4/R5 не
вписаны в `cli.ts`; H-attention/adaptive-cli/fewshot A/B — не прогонялись.

**Качество судьи.** Judge стохастичен: ложный fail на чистой механике (`parseVerdict` fallback
исправлен структурным `VERDICT:`); осцилляция из-за неполной симуляции approval. Вывод сессии: «pass =
механика + слабый судья, а не качество»; рубрика не проверяет DONE/audit; `sdd-task --audit-group`
всегда exit 0.

**Детерминизм.** `sdd-check --all` (R1), `sdd-verify` receipts, `migration-grade` (7/7, валидирован на
6 прогонах), golden `verify.sh` (both-way), `roundtrip-grade.sh` (82-пробный стенд), `session-metrics.py
gate/compare`, group-receipt юниты, ~9 залоченных зажимов unit-тестами. Воспроизводимость: authoring
1/4→5/6, scaffold 2/2, execute 2/2, migration r5/r6/rtbase 3/3; планка «2 pass».

**Стоимость.** ~93–95% токенов — input+reasoning, output ~5%. Authoring baseline input ≈83k; recover
V1 129k FAIL → V2 10.8k PASS (×12/×200); миграция r2 483k, r4 831k; round-trip fc2 reasoning
106k/output 29.7k. Тезис: «если работать по API, экономика не сходится — считать input и output».

**Слабости.** N=1–2 на вариацию («сигнал, не доказательство»); judge стохастичен; tool-calls
субагентов не видны в телеметрии top-сессии; харнесс сам был источником ~половины провалов (untracked
diff, парсер вердикта, ENOSPC, backticks, mise-сеть, `TMPDIR` `//`).

## B.7 Открытые вопросы / незавершённые нити

1. Push 12 (по состоянию на момент обрыва) непушенных коммитов — заблокирован классификатором;
   решение оператора.
2. Мигратор-полнота (`PHASE_RECEIPTS:v1`, 3-кол. §5, секция `SCOPE_TYPE`; fold-back знания из
   execution-log) — блокер живого round-trip; по Lead — трек G4, ждёт брифа.
3. Порт adaptive verify/plugins/anystack/per-stack readiness `main`→v2 — трек VERIFY; `sdd-verify`,
   `readiness.ts` не трогать.
4. `SDD_GROUP_AUDIT_MISSING`/`REVIEW_MISSING` WARN→ERROR и grandfather-граница — решение оператора.
5. R-COMPLETE — **закрыто**: закоммичен `95329c19` (07.09), после обрыва транскрипта.
6. Продолжать ли мигратор-фикс сейчас или держать паузу под бриф Lead — открыто на момент обрыва.
7. Пивоты RC v3 (б) DONE до аудита, (в) coverage-map ✅ без интервью — оператором не разобраны.
8. Эталон-тег `eval/base/ib-005-v2`, chain-режим харнесса, S3 multi-module, H-attention/
   adaptive-cli/fewshot A/B — отложены.
9. Reconcile-гейт «spec⇄code⇄ticket при закрытии» (идея из RCA Артура) — не реализован.

## B.8 Актуальность против HEAD (обновлено V-A3b: ветка ушла на `95329c19`, ещё дальше — на `3d5f66a7`)

- **Главное.** `origin/codex/sdd-v2-rc52-followup` = `95329c19` (07.09 00:08Z, «R-COMPLETE quality
  rule — reads DONE+round+group receipts from disk (H1 fix), opt-in via scenario.completion», 5
  файлов +170/−3). Работа над R-COMPLETE **доведена и закоммичена**, не висит в рабочем дереве, как
  предполагал дайджест на момент обрыва транскрипта.
- Утверждение «readiness node-only» (`readiness.ts:15`, `sdd-task.cmd.ts:123/459-487`) — подтверждено
  V-A3b точно по номерам строк; но не хватает оговорки про исключение `phaseOwnsMissingReadinessGate`
  (`:471`) — важно для брифа трека VERIFY (см. B.4).
- `plugins/`/`anystack`/`extraGates`/`stack.use` в `.ts`-коде ветки — 0 вхождений, подтверждено;
  каталога `.results/**` в чекауте ветки нет вовсе (untracked/gitignored) — базлайн `fc2-baseline` для
  `session-metrics.py compare` при новом чекауте **не восстановится**.
- `STEP_6`/`STEP_7` в `execute.directive.xml` — уже с реальными `<ToolCall>` (`4bb00f4b`); номера
  250-251/260-272 из ранних версий устарели, актуальные — 295/324.
- `migration-grade.ts` `MIGRATION_CRITICAL_CODES` — только структурные коды (`75ce4db8`); мигратор
  всё ещё НЕ эмитит `PHASE_RECEIPTS:v1`, 3-кол. таблицы, `SCOPE_TYPE`-секцию — если Lead/оператор
  начали G4, это устареет первым.
- Числа эвалов (rt4 71/82, fc2 70/82, Артур 80/82; migration r5/r6 PASS) привязаны к фикстурам в
  `/Users/k.lebedev/.gennady/eval/cloud-ios/{fixture-mig-run, rt-regen, bench-smoke}` на момент
  прогона (до `4bb00f4b`); `8214b1b0` не ancestor текущего HEAD фикстуры round-trip — переснят, риск
  для воспроизводимости.
- `roundtrip-eval.sh` уже сам апгрейдит §5-таблицы на prep (`upgrade-verification-tables.py`,
  `:69`) — реализация G4 не должна дублировать преобразование.
- `ai/drafts/research/sdd-v2-rc-recovery/*` (24 файла) — только в **main-репо**
  `/Users/k.lebedev/Developer/gennady/ai/drafts/…`; в RC-ветке только `DEVIATIONS.md` — знание
  ресёрчей (LEARNINGS, PROGRESS, hypothesis-map) не в PR #25.
- Четвёртая фикстура cloud-ios `fixture-detmig` (ветка `eval/dev/detmig`) существует, состояние не
  описано ни в дайджесте, ни здесь `(не перепроверено)`.
- Claim «полный greenfield проходит end-to-end (chain10b)» — на dist 4 сентября; с тех пор изменены
  `execute.directive` (STEP_6/7) и `sdd-log`; регрессионный прогон greenfield-execute с новым dist не
  делался `(не перепроверено)`.

## B.9 Итог верификации A3b (V-A3b)

| Метрика | Значение |
|---|---|
| Решений оператора проверено | 50/50, все CONFIRMED (6 — с поправкой) |
| REFUTED / NOT FOUND | 0 / 0 |
| Коммитов gennady упомянуто | 49 sha, все существуют; 44 на RC-ветке, 4 корректно вне ветки (`main`), 1 помечен неверно (`c9c0977a`) |
| Ошибки в хронологии/коммитах | 3 (существенная — `40bbd551`/`6bb90784` датированы не тем днём; см. B.1) |
| Пропущенные коммиты сессии | 6 (`f5f6ad45`, `dc9bcc92`, `bf26381c`, `734d0b8c`, `209febba`, `1716e2df`) |
| Код/состояние проверено | 21 утверждение: 15 точно CONFIRMED, 5 CONFIRMED со сдвигом строки, 1 REFUTED (ссылка `sdd-log.cmd.ts:415-423`→верно `:493-505`) |
| Eval-таблица (12 ячеек) | 10 CONFIRMED, 2 неполны (список `mode` без `v1-to-v2`; `scenarios.json` — только 7 сценариев) |
| Пропущенное содержание | 13 пунктов (учтены в B.1/B.2) |
| §8 актуальности | 8 пропущенных пунктов (учтены в B.8) |

**Общий вердикт.** Дайджест фактически надёжен. Ни одно решение оператора не выдумано и не искажено
по смыслу; все проверяемые код-утверждения либо точны, либо ошибаются только в номере строки. Главные
дефекты источника — один коммит-блок отнесён не к тому дню с неверной причинно-следственной связкой,
§8 не знал, что ветка уже уехала на `95329c19` и R-COMPLETE закоммичен, и шесть коммитов сессии не
были перечислены. §5 (`gennady verify`/anystack/readiness) — самый точный раздел исходного дайджеста,
правок почти не потребовал.

---

# Итог верификации

Обе части дайджеста (A3a и A3b) прошли независимую верификацию свежими агентами, read-only, с
транскриптами и кодом, трактованными как данные. Итог по решениям оператора: **92/92 найдены и
подтверждены** (42 в части A, 50 в части B), REFUTED-решений нет. Основной класс ошибок в обеих частях
— не искажение решений оператора, а **устаревание grounded-слоя** (номера строк, состав гейтов,
существование файлов) относительно кода, который успел уйти вперёд за дни/недели между сессией и
проверкой:

- В части A это RC-линия (`codex/sdd-v2-rc52-followup`), которая к моменту проверки уже независимо
  реализовала часть дизайна, который сессия «SDD: v2 + v1» проектировала как будущее (per-stack
  pluggable coverage, receipt-контракт вместо текстовых маркеров, checkpoint вместо git-fingerprint).
  agent-inbox-трансплант в RC отсутствует целиком (не «гибрид»); Шаг 2 предстоит переделывать.
- В части B это сама RC-ветка, ушедшая за 9 минут после обрыва транскрипта ещё на один коммит
  (R-COMPLETE, `95329c19`) и позже — на `3d5f66a7`; плюс несколько коммитов сессии, не попавших ни в
  один из вспомогательных индексов дайджеста.

Для плана переноса v1→v2 практический вывод один и тот же в обеих частях: **дизайн-решения и Decision
Log переносить как есть**, а любой grounded-факт (номер строки, состав гейтов, список файлов) —
пересъёмить заново против актуального HEAD непосредственно перед использованием, а не доверять
снимку сессии.
