ОТЧЁТ 61 §1 — ISS-11: Handoff `decisions`/`open` несут тег провенанса (грамматика; обвязка — вне зоны)

СТАТУС: ЧАСТИЧНО DONE — грамматика в контракте закрыта, обвязка (парсер + warn) заблокирована зоной брифа

Рабочее дерево: `rc-w3`. Ветка `lead/promises-not-wider` от `lead/review-critic-bounds` (PR #45).

КОММИТ (локальный, НИЧЕГО не запушено), после T-B6-07 (`9c257d2d`):
- `19304ac4` fix(ISS-11): Handoff decisions/open entries carry a provenance tag

---

## 1. Файлы

| Путь | Тип | Смысловое изменение | Чем доказано |
|---|---|---|---|
| `ai/kit/contract/process/handoff-format.xml` | правка | `HANDOFF_FORMAT` объявляет грамматику: `decisions` — `key=value(measured\|reported\|assumed)`, untagged ⇒ `assumed`; `open` — `id(tag; extent): text`, untagged ⇒ нет extent. Пример-строка в блоке ```` ``` ```` обновлена. | `check:directives-fresh`; ручное чтение (см. §3). |
| `ai/directives/sdd-v2/execute.directive.xml` (Contract `HANDOFF_FORMAT`, ~строка 114) | правка (сгенерирован) | Прямое следствие правки контракта — `execute.directive.hbs` включает этот partial, но сам `.hbs`-файл не редактировался. | `check:directives-fresh` подтверждает свежесть. |
| `ai/directives/sdd-v2/phase-execution-protocol/steps/STEP_4_HANDOFF.xml` | правка (сгенерирован) | Тот же ripple — `phase-execution-protocol.directive.hbs` тоже включает этот partial, файл-.hbs не редактировался. | `check:directives-fresh`. |
| `cli/cmd/sdd-log/sdd-log.types.ts:273-278` | правка | Комментарий у `COMPLETE_HANDOFF_PAYLOAD_RE` (строка 252) документирует новую грамматику и явно называет, что сам regex не менялся (уже принимает тег/extent как свободный текст внутри скобок) и что разбор/warn — предмет `sdd-log.cmd.ts`/`STEP_2_SEMANTIC`, вне зоны этого брифа. | `type-check`, `yagni` зелёные (см. §4 про откат первой попытки). |

`git show --stat 19304ac4` — 4 файла (+49/−12). Совпадает.

---

## 2. Архитектура было / стало

### Было — Handoff-запись не различает измеренное/сообщённое/предположенное

```mermaid
sequenceDiagram
  participant Orch as Orchestrator (execute.directive STEP_3)
  participant PhaseN as Phase N worker
  participant Handoff as **Handoff →** line (sdd-log.types.ts:252 COMPLETE_HANDOFF_PAYLOAD_RE)
  participant PhaseN1 as Phase N+1 worker
  Orch->>PhaseN: dispatch + orchestrator's own added premises (execute.directive.xml STEP_3)
  PhaseN->>Handoff: decisions: [k=v]; open: [id: text] — без тега
  Handoff->>PhaseN1: verbatim (sdd-task --phase)
  Note over PhaseN1: "k=v" читается как факт,\nхотя мог быть просто предположением
```

### Стало — грамматика объявляет тег, untagged ⇒ assumed по конвенции (ISS-11)

```mermaid
sequenceDiagram
  participant Orch as Orchestrator (execute.directive STEP_3, не тронут)
  participant PhaseN as Phase N worker
  participant Contract as ai/kit/contract/process/handoff-format.xml (HANDOFF_FORMAT)
  participant Handoff as **Handoff →** line
  participant PhaseN1 as Phase N+1 worker
  Contract-->>PhaseN: грамматика: decisions[k=v(tag)], open[id(tag; extent): text]
  PhaseN->>Handoff: decisions: [k=v(measured)]; open: [id(reported; depth-only): text]
  Handoff->>PhaseN1: verbatim, тег виден
  Note over PhaseN1: untagged ⇒ assumed по конвенции контракта;\nразбор/warn-обвязка — ЕЩЁ НЕ РЕАЛИЗОВАНА\n(sdd-log.cmd.ts, STEP_2_SEMANTIC — вне зоны)
```

---

## 3. Доказательства

**1. Контракт объявляет грамматику (ручная проверка).**
```
$ grep -n "measured|reported|assumed" ai/kit/contract/process/handoff-format.xml
11:        `key=value(measured|reported|assumed)`: `measured` — this phase directly observed it (ran a
17:        `measured|reported|assumed` vocabulary, `extent` is one short phrase naming what the item
```
ВЫПОЛНЕНО (грамматика объявлена).

**2. Директивы свежие после ripple в execute/phase-execution-protocol (сгенерированные файлы, не .hbs-источники).**
```
$ npm run check:directives-fresh
✓ ai/directives/** matches a fresh rebuild.
```
exit 0. ВЫПОЛНЕНО.

**3. `sdd-log complete` — warn (не reject) на нетегированные записи.**
НЕ ВЫПОЛНЕНО. Реализация живёт в `cli/cmd/sdd-log/sdd-log.cmd.ts`, явно исключённом из зоны брифа («Не трогать … `sdd-log.cmd.ts`»). Первая попытка (чистые функции `parseDecisionEntry`/`parseOpenEntry` в `sdd-log.types.ts` без вызова из `.cmd.ts`) прошла тесты, но упала на `yagni`:
```
$ node cli/gennady.ts yagni <rc>
error: ERR_CLI_YAGNI_UNDERUSED: `parseDecisionEntry` (function) has 0 usage(s) in production code (< 2)
error: ERR_CLI_YAGNI_UNDERUSED: `parseOpenEntry` (function) has 0 usage(s) in production code (< 2)
error: ERR_CLI_YAGNI_UNDERUSED: `ParsedDecisionEntry` (type) has 1 usage(s) in production code (< 2)
error: ERR_CLI_YAGNI_UNDERUSED: `ParsedOpenEntry` (type) has 1 usage(s) in production code (< 2)
yagni: 4 finding(s) across 1 changed file(s)
```
Единственный легальный путь снять находку — либо второй вызов в производственном коде (запрещённый файл), либо Usage Waiver в Execution Log тикета (`tasks/**`, тоже запрещён брифом). Функции убраны; оставлена только документация грамматики (см. §1). exit 4 на первой попытке коммита из-за этого гейта; после отката — exit 0.

**4. `audit/steps/STEP_2_SEMANTIC.xml` — правило «untagged ⇒ assumed».**
НЕ ВЫПОЛНЕНО. Файл принадлежит `audit.directive.hbs`, явно исключённому из зоны брифа.

**5. `execute.directive.xml` STEP_3 — калибровка только по глубине; пометка премисс оркестратора.**
НЕ ВЫПОЛНЕНО. Явно исключено брифом («Не трогать `execute.directive.hbs`/`phase-*`»); единственное касание этого файла в данной задаче — механический ripple от правки общего контракта (см. §1), не ручная правка STEP_3.

**6. Тест: `cli/cmd/sdd-log/__tests__` — payload с тегами принимается; без тегов — warn в выводе.**
ЧАСТИЧНО. Regex уже принимает тегированный payload как обычный текст (не менялся, см. §1) — проверено вручную:
```
$ node -e "console.log(/^artifacts:\s*\[(.+)\];\s*decisions:\s*\[(.*)\];\s*open:\s*\[(.*)\];\s*deviations:\s*\[(.*)\]$/.test('artifacts: [a]; decisions: [k=v(measured)]; open: [id(reported; depth-only): text]; deviations: []'))"
true
```
«Warn в выводе» — НЕ ВЫПОЛНЕНО (требует `sdd-log.cmd.ts`, вне зоны).

**7. Коммит через pre-commit целиком.**
```
[sdd-verify] ✅ ALL PASS (5/5): type-check 3.7s, test:coverage 39.4s, lint 9.9s, format 2.0s, yagni 0.6s
✓ ai/directives/** matches a fresh rebuild.
✓ axiom/contract/halt-activation audit clean
✅ Pre-commit passed
[lead/promises-not-wider 19304ac4] fix(ISS-11): Handoff decisions/open entries carry a provenance tag
```
exit 0 (на итоговой, скорректированной по объёму версии). ВЫПОЛНЕНО.

---

## 4. Отклонения, открытые вопросы

**Ключевое отклонение — задача частично невыполнима в заданной зоне.** ISS-11 по формулировке в `20-ISSUES-VERDICTS.md` §#22 требует: (а) грамматику в контракте — СДЕЛАНО; (б) `sdd-log complete` warn на untagged — живёт в `sdd-log.cmd.ts`, явно в списке «не трогать»; (в) `audit/steps/STEP_2_SEMANTIC.xml` правило — живёт в `audit.directive.hbs`, явно в списке «не трогать»; (г) калибровка `execute.directive.xml` STEP_3 + пометка премисс оркестратора — явно в списке «не трогать». Инвариант «правь только строки провенанса Handoff» в `cli/cmd/sdd-log/sdd-log.types.ts` был проверен буквально: первая попытка добавить парные чистые функции-парсеры уперлась в гейт `yagni` (< 2 использований в production-коде), а единственные легальные способы снять эту находку (второй вызов в запрещённом `sdd-log.cmd.ts`, либо Usage Waiver в Execution Log запрещённого `tasks/**`) сами запрещены брифом. По правилу «если бриф невыполним как написан — остановись и доложи»: остановился на этом уровне, задокументировал грамматику (единственная часть, полностью достижимая в заданной зоне), убрал недостижимую часть, чтобы не оставлять мёртвый код. Полное закрытие ISS-11 требует брифа с доступом к `sdd-log.cmd.ts` и/или `audit.directive.hbs`/`execute.directive.hbs` — рекомендую отдельную пачку или явное расширение зоны в повторном брифе.

**Отклонение (побочный ripple в execute/phase-execution-protocol).** Правка общего контракта `HANDOFF_FORMAT` механически регенерирует `ai/directives/sdd-v2/execute.directive.xml` и `.../phase-execution-protocol/steps/STEP_4_HANDOFF.xml` — оба входят в зону «не трогать execute.directive.hbs/phase-* (PR #38)». Диффы (см. полный текст коммита) содержат ИСКЛЮЧИТЕЛЬНО текст контракта `HANDOFF_FORMAT`, ничего больше — ни один `.hbs`-файл из запрещённого списка не редактировался вручную. Это неизбежное следствие того, что `HANDOFF_FORMAT` — общий partial, подключаемый именно этими двумя директивами (`grep -rln '"contract/process/handoff-format"' ai/kit/templates` → `execute.directive.hbs`, `phase-execution-protocol.directive.hbs`). Риск: при мерже PR #38 возможен конфликт пересборки — рекомендую Lead перепроверить `check:directives-fresh` после ребейза на PR #38.

**Правка по вердикту верификатора (V-BATCH-21 N7).** Строка доски для ISS-11 — **ЧАСТИЧНО** (1 из 5 предметов §#22 поставлен: только грамматика контракта; см. §4 выше — пункты (б)/(в)/(г) плюс тест из §3.6 вне зоны). Follow-up **ISS-11b** — зона `cli/cmd/sdd-log/sdd-log.cmd.ts` (warn на untagged decisions/open) + `ai/kit/templates/sdd-v2/audit.directive.hbs` (`audit/steps/STEP_2_SEMANTIC.xml`, правило «untagged ⇒ assumed») + `ai/kit/templates/sdd-v2/execute.directive.hbs` STEP_3 (калибровка по глубине, пометка премисс оркестратора — центральный пример issue #22, `20-ISSUES-VERDICTS.md:382`) — координировать с B2-14 и с PR #48 (те же файлы). Мелкое: subject локального коммита `19304ac4` — «Handoff decisions/open entries carry a provenance tag» — сильнее самого контракта (грамматика объявляет тег как `MAY carry`, не обязательный). Коммит не тронут (локальный, неопубликованный, но переписывание истории — не в зоне этой правки); **Lead: при формулировке заголовка/описания PR на GitHub использовать «…MAY carry a provenance tag»**, а не безусловное «carry».

**Открытые вопросы Lead:**
1. Нужен ли отдельный follow-up-бриф (ISS-11b) на `sdd-log.cmd.ts` + `audit.directive.hbs`/`execute.directive.hbs` для полного закрытия ISS-11 (warn-обвязка + пометка премисс), или это остаётся на усмотрение батча, который и так трогает эти файлы (упомянутая координация с B2-14 и PR #48 — тот же скелет Handoff)?
2. Подтвердить, что ripple в `execute.directive.xml`/`STEP_4_HANDOFF.xml` не создаёт проблем с PR #38 при последующем ребейзе.
3. При написании PR title/description на GitHub — использовать «MAY carry a provenance tag» (см. правку выше), не переносить безусловную формулировку локального commit subject.

**Команда пуша (для Lead):** см. `R-BATCH-21-promises-not-wider.md`.
