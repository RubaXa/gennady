# 60 — Приёмка «v1 больше не нужен»

> Статус: ЧЕРНОВИК на основе решений оператора (1.1, 3.4, D-3, D-4, D-6, D-12, D-16, D-28, D-29). Уточняется по мере исполнения треков.

## 1. Что доказываем

RC (v2) становится единственным SDD: всё полезное из main перенесено или мотивированно отклонено, v1 удалён из дерева, потребители могут мигрировать. Версия релиза — `2.0.0-draft.<N>` (D-12); всё ниже 2 — v1.

## 2. Критерии приёмки (все обязательны)

| № | Критерий | Доказательство | Источник решения |
|---|---|---|---|
| A1 | **Самомиграция gennady**: собственные `tasks/` (127 v1-тикетов, 10 скоупов) переведены `sdd-migrate` в v2-раскладку; `tasks/` удалён; `sdd-state` → `FLOW_VERSION=v2`; `sdd-check --all .` без ошибок класса `MIGRATION_CRITICAL_CODES` | детерминированный грейд `migration-grade.ts` + `sdd-check --all` в CI | D-3, 3.4 |
| A2 | **Миграция реального проекта cloud-ios** (`fixture-mig-run`): PASS грейда; мигрированные тикеты исполнимы (`sdd-task` принимает: 3-колоночные §5, секция `SCOPE_TYPE`, маркер `PHASE_RECEIPTS:v1`) | E-06/E-07 трека 50; предпосылка (а) G4 | D-29, статус RC |
| A3 | **Полный цикл на не-Node стеке**: authoring → scaffold → execute на golang-фикстуре и swift-фикстуре (cloud-ios round-trip) проходит механически: тикет `[x] DONE`, `sdd-verify` receipt записан без `package.json`-шима, групповая квитанция аудита есть, R-COMPLETE зелёный | flow-eval G1 (E-* трека 50), `roundtrip-eval.sh` без `roundtrip-readiness-shim.package.json` | 2.2, D-14, D-15, D-16 |
| A4 | **Все 17 вердиктов по issues akkrat** (док 20) реализованы или мотивированно отклонены; #9.4 и #24 закрыты минимальным набором SO-1/2/2b/7/11 (блокеры релиза) | тесты-замки из док 20/32; e2e-фикстуры G2 «дерево до → sync → снимок после» на копиях messenger и cloud-ios без потерь проектных файлов | D-6, D-22 |
| A5 | **v1 удалён из дерева RC**: нет `ai/directives/sdd/`, v1-скиллов, `ai/skills/sdd-execute/scripts/`, `verify.sh`; `sync`/`sync-skills` деплоят только v2; docs (`README`, `ai/skills/README.md`, guides) описывают только v2 | grep-гейт анти-v1 в `npm run check`; deployed-surface golden | 1.1, 3.4, D-27 |
| A6 | **Универсальный verify**: node-пресет даёт байт-в-байт те же команды и receipts (D-17); стеки anystack → golang → python → swift; `gennady verify --plan --json` read-only; долгие гейты требуют `when` (D-18); `[gate] `-строки в receipt (D-19) | parity-тесты трека 30 (golden резолва + поведенческий + receipt), `services/stack` тесты перенесены и зелены | D-13..D-19 |
| A7 | **Журнал**: `— re-run:` только до close, `## Blocker Trail`, `correction` в словаре, post-close детекция, Reopens по причинности, групповая квитанция учитывается в pickable | тесты `shared/sdd/execution-log`, `sdd-log`, `sdd-check`; golden `DA-lazy-asm` | D-20, D-21, L-1..L-3 |
| A8 | **Правила**: baseline + go-rules перенесены; реестр project-owned (временно, до слоёв); проверка контракта правила — один модуль, два входа | kit-аудит + `sdd-check --rules`; фикстура cloud-ios: Swift-тикет не получает `typescript-rules` | D-24 (открыт), D-25, L-5..L-8 |
| A9 | **Релиз**: `exports` как в main (+`./stack`), `.npmignore`, publish-before-git, smoke/publish-contents тесты, CI workflow вокруг test-topology, `npm audit` без high, версия `2.0.0-draft.N` | `npm pack --dry-run` без тестов/фикстур; CI зелёный | D-9, D-11, D-12, REL-1..14 |
| A10 | **Eval**: PASS = детерминированные гейты; `budget-exhausted` отдельный исход; минимальные сценарии G1–G4 существуют и воспроизводимы (2 pass) | flow-eval suite + `.results` | D-28, 4.5 |

## 3. Что НЕ входит в приёмку (зафиксировано)

- agent-inbox из `sdd-v2-inbox-transplant` (D-2); messenger как обязательный снапшот G4 (D-29); python-rules до первого проекта (D-25); полная хэш-модель владения SO-3 (D-22, после релиза); WARN→ERROR групповых квитанций до A1/A2 (D-4).

## 4. Открытые пункты приёмки

- Параллель задач в одном дереве (D-26) — критерий появится после eval-исследования.
- Поведение первого v2-sync над v1-деревом потребителя (D-23) — критерий формулируется при постановке SO-12.
- Слой правил (D-24) — критерий A8 уточняется после объяснения и решения оператора.
