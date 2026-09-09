# Постоянные результаты прогонов (GAP-E-6, D-62)

Каждый `npm run sdd-flow-eval` пишет сюда ОДНУ директорию на сценарий:

```
ai/flow-eval/results/<YYYY-MM-DD>-<scenario-id>[-N]/
  summary.json   # всегда: verdict, status, outcome, модель воркера/судьи, бюджет, метрики сессии, sha
  judge.md       # когда судья писал вердикт
```

`-N` (начиная с `-2`) — если в этот день этот сценарий уже прогонялся; первый прогон дня суффикса не
получает. Ничего здесь не gitignore'ится: это сырые данные, а не временный кэш — в отличие от
`ai/flow-eval/.results/` (с точкой), который остаётся временным местом для артефактов ВСЕГО батча
внутри одного прогона и не предназначен жить в репозитории.

Сводная таблица по этим данным — [`../docs/journal/RESULTS.md`](../docs/journal/RESULTS.md),
генерируется скриптом `ai/flow-eval/scripts/results-table.ts` (`npm run results:table`); свежесть
проверяется `npm run results:table:check`. Запись-заготовка на каждый прогон — в
[`../docs/journal/EXPERIMENTS-LOG.md`](../docs/journal/EXPERIMENTS-LOG.md) (дописывается автоматически).

Формат и схема `summary.json` — `SddEvalDurableSummary` в `ai/flow-eval/results-archive.ts`.
