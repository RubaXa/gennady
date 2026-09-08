# ai/flow-eval

Код eval-харнесса (`cli.ts`, `runner.ts`, `provision.ts`, `observer.ts`, `judge.ts`,
`quality-gate.ts` и др.). Артефакты прогонов — в `.results/`.

**Документация — в [`docs/`](./docs/README.md).** Начни с [`docs/README.md`](./docs/README.md)
(оглавление) и [`docs/00-INTRO.md`](./docs/00-INTRO.md) (что такое eval и как он работает). Про то,
что вердикт judge — диагностика и не влияет на код выхода батча (D-28/L-14, E-21), см.
[`docs/02-ARCHITECTURE.md`](./docs/02-ARCHITECTURE.md#4-что-детерминировано-а-что--judge).
