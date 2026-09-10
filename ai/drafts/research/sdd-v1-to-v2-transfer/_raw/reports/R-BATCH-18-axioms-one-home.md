# R-BATCH-18 — «Аксиомы живут в одном доме и ни одна не висит в воздухе»

Ветка `lead/axioms-one-home`, база — `lead/reopen-by-cause` (PR #48, коммит `2f726c3a`). 5 задач, 5 коммитов, последовательно. `T-B6-02` — **отложена** до слияния PR #41 (её файл `module.directive.hbs` принадлежит той ветке); остаётся на доске.

## Черновик описания PR (простым языком)

Каждая аксиома либо реально собрана в директиву, либо честно помечена черновиком — третьего состояния («забыли») больше не существует незаметно. Самая цитируемая ранее не собранная аксиома (правило «раунд закрывается только после обязательного аудита») теперь подключена. Три аксиомы аудита, потерявшие часть текста при переносе из v1 (как считать вердикт, куда маршрутизировать находку про сломанное правило), восстановлены дословно. Область проверки «упомянуто — но не определено» расширена за пределы одной папки директив. И одна остановка («вопрос без карточки состояния») наконец объявлена там, где она реально нужна, а не спрятана в списке исключений аудитора — раньше комментарий в коде утверждал, что она объявлена, а на самом деле нет.

## 1. Таблица «файл → смысл» (по коммитам)

| Коммит | Задача | Файлы (кратко) | Смысл |
|---|---|---|---|
| `edeb71c3` | T-B6-24 | `lint-axioms.ts`, `build-directives.ts`, тест | Проверка «упомянуто, не определено» теперь видит статичные (не-темплейтные) деревья директив (`infra/`, `agent-inbox/` и т.д.), не только `sdd-v2/**` |
| `ae42e356` | T-B6-25 | `audit.directive.hbs`, `lint-axioms.ts` | Самая цитируемая несобранная аксиома (правило group-audit «раунд закрывается только после аудита») подключена |
| `40935c63` | T-B6-11 | `ax-severity-tagging.xml`, `ax-finding-routing.xml`, `ax-findings-as-proposals.xml`, тест | Как считать вердикт аудита (таблица + confidence-правило) и куда маршрутизировать находку про сломанный rule-файл — восстановлено дословно из v1 |
| `15b10585` | GAP-3 | `router.directive.hbs`, `root.directive.hbs`, `audit-halt-activation.mjs`, тест | Остановка «вопрос раньше карточки состояния» объявлена по-настоящему в двух директивах вместо ложной записи в списке исключений |
| `7db7e1de` | T-B6-19 | `lint-axioms.ts`, `build-directives.ts`, 83 файла `ai/kit/axiom/**`, тест | Каждая из 181 SDD-релевантной аксиомы теперь либо подключена (98), либо явно помечена черновиком (83) — гейт роняет билд, если появится третье, немаркированное, состояние |

## 2. Mermaid — было / стало (весь контур пачки)

```mermaid
flowchart TD
  subgraph before["БЫЛО"]
    B1["build-directives.ts<br/>rendered[] = только sdd-v2/**"]
    B2["ax-audit-hook.xml (текст есть,<br/>НЕ подключён — 5 висячих ссылок)"]
    B3["ax-severity-tagging.xml<br/>13-строчный снимок (D4.4-D4.7 потеряны)"]
    B4["router.directive.hbs<br/>&lt;HaltConditions&gt; без H_ASK_WITHOUT_CARD"]
    B5["audit-halt-activation.mjs<br/>allowlist утверждает «halt объявлен в router»<br/>— ЛОЖЬ"]
    B6["83 аксиомы: не подключены,<br/>не помечены — неотличимы от забытых"]
    style B1 fill:#f8d0d0
    style B2 fill:#f8d0d0
    style B3 fill:#f8d0d0
    style B4 fill:#f8d0d0
    style B5 fill:#f8d0d0
    style B6 fill:#f8d0d0
  end
```

```mermaid
flowchart TD
  subgraph after["СТАЛО"]
    A1["build-directives.ts<br/>rendered[] + collectStaticDirectiveFiles(ai/directives/**)"]
    A2["ax-audit-hook.xml — {{> }} в audit.directive.hbs<br/>0 висячих ссылок"]
    A3["ax-severity-tagging.xml — v1 дословно:<br/>LOW-правило, таблица вердикта, кап MINOR"]
    A4["router.directive.hbs + root.directive.hbs<br/>оба несут собственную строку H_ASK_WITHOUT_CARD"]
    A5["audit-halt-activation.mjs<br/>allowlist больше НЕ содержит H_ASK_WITHOUT_CARD —<br/>не нужен, декларация реальна"]
    A6["83 аксиомы: status=&quot;draft&quot;;<br/>гейт lintUncollectedAxiomFiles = 0 нарушений"]
    style A1 fill:#cfe8cf
    style A2 fill:#cfe8cf
    style A3 fill:#cfe8cf
    style A4 fill:#cfe8cf
    style A5 fill:#cfe8cf
    style A6 fill:#cfe8cf
  end
```

## 3. Доказательства — числа до/после (воспроизводимые команды)

| Метрика | До пачки | После пачки | Команда |
|---|---|---|---|
| SDD-relevant аксиомы: подключено | 97 | 98 | обходной скрипт по `ai/kit/axiom/{process,spec,audit,scaffold,boundary,critic,truth,interview}` × `{{> "axiom/…"}}` в `ai/kit/templates/sdd-v2/**/*.hbs` (см. R-T-B6-19 §3) |
| SDD-relevant аксиомы: помечено `draft` | 0 | 83 | тот же скрипт |
| SDD-relevant аксиомы: ни то ни другое | 84 | **0** | тот же скрипт; гейт `lintUncollectedAxiomFiles` в `build-directives.ts` |
| Undefined axiom refs (T-B6-08 гейт, расширенная область) | 1 новая находка при расширении (`AX_CONTRACT_BUDGET`, вне зоны, allowlisted) | 0 | `node build-directives.ts --check` |
| `H_ASK_WITHOUT_CARD` allowlist-записей (маскировка) | 2 (`root`/`scope` → router, оба ложные/мёртвые) | 0 | `grep -c "H_ASK_WITHOUT_CARD" ai/kit/audit-halt-activation.mjs` |
| Dangling axiom warnings (обратное направление, не эта пачка) | 35 | 35 (не менялось) | `node build-directives.ts --check` |

| # | Команда | Exit | Статус |
|---|---|---|---|
| 1 | `npm run build:directives` (запись, после каждой задачи) | 0 | ВЫПОЛНЕНО |
| 2 | `npm run audit:sdd-templates` (check:directives-fresh + audit:axioms + audit:contracts + audit:halts + check:directive-budgets) | 0 | ВЫПОЛНЕНО |
| 3 | `npm test` (весь пакет) | 0 — `# tests 3732 / # pass 3724 / # fail 0 / # skipped 8` | ВЫПОЛНЕНО |
| 4 | `npm run check` (sdd-verify --profile full) | 0 — `ALL PASS (5/5)`: type-check 15.3s, test:coverage 73.4s, lint 11.9s, format 3.5s, yagni 1.0s | ВЫПОЛНЕНО |
| 5 | `npm run gate:sdd-check-baseline` | 0 — `OK — no error outside the baseline (227c03a8, tag rc-baseline-1)` | ВЫПОЛНЕНО |

## 4. Стопы, встреченные и снятые

- **`npm run check` дважды падал в pre-commit hook** (test:coverage — `bootstrap-path`/`clean-repo-composition`/`sdd-verify-repair-adapters`/`sdd-verify`/`testcov`/`lint.cmd`/`testcov.cmd`; во втором случае — `cancelled 1`). Ни разу код этой пачки не относился к упавшим файлам (все — CLI/tool-behavior тесты, вне зоны правок этого брифа). Ручной повторный прогон `npm run check` немедленно после падения — `ALL PASS (5/5)` оба раза. Класс совпадает с задокументированным L-26 (host-конкуренция, тип Б — таймауты под нагрузкой, не регресс). Синхронный повтор (правило брифа «до 3 раз») применён и сработал с первого повтора оба раза — коммит не блокировался дольше положенного.
- Иных стопов из закрытого списка (§ «Условия безусловной остановки», 70-ORCHESTRATION-PROTOCOL.md) не встречено: ни красного гейта после исправления, ни конфликта с невлитыми PR (T-B6-02 явно отложена заранее, не по факту конфликта), ни требующего оператора открытого решения.

## 5. T-B6-02 — отложена

`T-B6-02` (правила закрытого мира → модульный авторинг, `module.directive.hbs`) не входит в эту пачку: её единственный файл принадлежит открытому PR #41. Остаётся на доске в статусе, заданном Lead до старта («ОТЛОЖЕНА до слияния PR #41; остаток пачки 18»); брифом не переоткрывалась и не переформулировалась.

## 6. Отклонения и открытые вопросы (сводно; детали — в R-T-B6-24/25/11/GAP-3/T-B6-19)

1. Пример «3 ссылки `AX_BLOCKER_ESCALATION`» из плана устарел (аксиома уже подключена независимо) — расширение области T-B6-24 доказано другой, реально ещё висящей ссылкой (`AX_CONTRACT_BUDGET`, чужое дерево директив, вне зоны переноса).
2. `ax-audit-hook.xml` не переписан дословным v1-текстом — его контент уже был написан под v2-семантику group-audit и совпадает с Mission директивы; решение — подключить как есть, не перезаписывать.
3. `ax-drift-taxonomy.xml`'s `EXECUTION_LOG_INCOMPLETE` несёт меньше деталей, чем v1 (токены `sdd check` [LOG]) — вне D4.4-D4.7, принадлежит треку CHECK-LOG/B2-*, не тронуто.
4. `H_ASK_WITHOUT_CARD` объявлен в ДВУХ директивах (router и root), не в одной — обе реально могут поднять этот halt на своём entry-вопросе; альтернатива («объявить только в router, оставить root ссылкой») не позволяла безопасно снять allowlist-запись root'а.
5. `ax-default-accept.xml` (уже несущий дореформенный v1-текст, известный по L-25/пачке 20) помечен `status="draft"` этой задачей как часть общего множества 83 — не противоречит будущей работе пачки 20 по каноническому тексту и активации в `review-lifecycle`.

## Команды пуша для Lead

```
git -C <lead-worktree-путь-к-lead/axioms-one-home> log --oneline lead/reopen-by-cause..lead/axioms-one-home
git -C <lead-worktree-путь-к-lead/axioms-one-home> push origin lead/axioms-one-home
gh pr create --base codex/sdd-v2-rc52-followup --head lead/axioms-one-home \
  --title "Пачка 18: аксиомы живут в одном доме и ни одна не висит в воздухе" \
  --body-file <путь к этому отчёту или его краткая версия>
```

Пять коммитов от `2f726c3a` (голова `lead/reopen-by-cause` / PR #48) до `7db7e1de`:
`edeb71c3` (T-B6-24) → `ae42e356` (T-B6-25) → `40935c63` (T-B6-11) → `15b10585` (GAP-3) → `7db7e1de` (T-B6-19).
