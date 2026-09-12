# Сообщение «Codex сессии #14» — первоисточники по п.1, 4, 7 (получено 2026-09-08 через оператора)

> Сохранено дословно как данные. Эксперименты S1/S2/S3 и sim-корпус в git не коммитились (эфемерные подагенты + scratchpad); durable — только коммиты п.1 и dashboard-URL.

## П.1 — коммиты (durable, origin/main)
- next.4 release: `d37d591031d51bad9e80418268e3b4db80c6fbd5` (`v0.9.0-next.4`)
- iter 3 (single-source по ссылке): `8bb384770ceb89c547a58d33ac7e1461da166bf0`
- iter 2 (baseline + Python/Go правила): `5a237cd56cc6edeea126e04f22d65d616df1d42e` → release `c7051379670bb21b9aff769be4c28937aeb6b5f6` (next.3)
- iter 1 (`knowledge.xml` project-owned): `f74c8c1dd07cc2024b909f547e7a5979ee341216` → release `0c2307fc9e96469fa6de8515e643dfbb06667e99` (next.2)
- release-инфра: `009ff59a` (publish-next: npm publish до git), `bbee8efc` (sync e2e: `<sdd-path>` вместо `npx gennady`), `b2fbb234` (сброс базы версии)

## П.4 — эксперимент S1/S2/S3 (не в git)
Корпус — 2 дерева артефактов (Go `env.Require`, Python `chunked`), произведённых sim-агентами.
- E1 census: избыточных фактов Go 33%, Python 67%; худшая цепь — строка ошибки в 7–8 местах (spec Golden DX + requirement-шаблон + code + ticket BDD ×2 + tests ×2), единого источника нет. Оправданные проекции отделены (BDD-контракт vs верифицирующий тест; диаграмма vs код; типы).
- E2 (явная реконсиляция «приведи дерево в консистентность»): все 8 копий поправлены → 0 дрейфа.
- E2b (узкая правка «доделай таск»): 2 устаревшие копии в тикете → тикет противоречит spec и коду. Причина дрейфа — обычная работа не запускает tree-wide sync.
- E3 (греп-детектор «литерал тикета обязан быть в spec»): false-positive на всех деревьях (spec = шаблон `env: <NAME>`, тикет = инстанс `MISSING_VAR`) → отвергнут.
- E4 (стратег): S1 каркас + S2 executable-as-truth для тестируемого; S3 → advisory; S4 отверг. Риск S1 — висячие ссылки (проверять структурно).
- E5 (DRY-дерево, single-source по ссылке): та же узкая правка → 0 дрейфа (2 → 0). Свежий scaffolder по обновлённому `AX_SSOT_TRACEABILITY` не вставил литерал: 7 BDD-исходов ссылаются на `§Error Format`, инстансы в `Given` остались литералами.
→ Реализовано в iter 3 (`8bb38477`): обобщён `AX_SSOT_TRACEABILITY` + BDD-правило + advisory `dangling-spec-ref` в audit.

## П.7 — методология (не в git)
Haiku-агенты честно проходят Flow без направления (6 прогонов: TS/Python/Go × 2 волны) + детерминированные инъекции для причинных тестов. Повторившиеся независимые находки: Node-центризм ломает не-Node (Python hard-fail реестра правил); церемония на мелочи; «оператор-как-человек»; русский-only. После iter 1–2: Go «aligned with baseline and language rules», Python — каскад не пуст.

Dashboard: https://claude.ai/code/artifact/02725475-c134-4ca8-9d5d-ce27b3df345a

Предложение #14: оформить durable-выжимку экспериментов в файл вне замороженного main (цель — `ai/drafts/research/sdd-v1-to-v2-transfer/` на migration-ветке).
