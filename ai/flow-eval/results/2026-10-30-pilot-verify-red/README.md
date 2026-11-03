# Pilot Verify — frozen RED, P1/P2

Source baseline GitLab main: `f18829b030eb0616d5d27f111b5565e899615dac`.
`sourceDirty: true` означает добавление измерителя/плана, не изменение выбранного продукта:
recorder проверил отсутствие product delta относительно указанного commit до запуска.

| Наблюдение                                    | Факт                                                                                   |
| --------------------------------------------- | -------------------------------------------------------------------------------------- |
| ordinary route full Verify                    | exit0, реальный `PASS node:route-proof exit=0`                                         |
| тот же tracked файл с `[...slug].tsx`         | exit4 до выполнения gates                                                              |
| initial tree check                            | zero errors/warnings                                                                   |
| Verify → complete обеих фаз → close           | exit0; P1/P2 current                                                                   |
| настоящий sync                                | exit0, индекс изменён; оба proof stale; source/config/spec/ticket неизменны            |
| отдельно audit-receipt после нового Verify    | exit0, оба proof stale                                                                 |
| отдельно review-receipt после нового Verify   | exit0, оба proof stale                                                                 |
| final check без workaround                    | exit1, ровно две ошибки `SDD_PHASE_ATTEMPT_STALE`                                      |
| final check после workaround Verify обеих фаз | exit0, zero errors                                                                     |
| negative controls                             | изменение product/config/spec/rules/index decision stale-ит proof; test P2 — только P2 |
| cleanup/model                                 | оба fixture roots удалены; modelCalls=0                                                |

`record.json` — фактический CLI stdout/stderr/exit, timeline текущести, hashes исходников,
сравнение файлов до/после sync и негативы. Ничего из этого не объявляется post-fix GREEN,
живым eval, независимым модельным аудитом, installed-package proof или замером скорости.
Receipt verdicts заданы host как вход механического эксперимента.

`runtime-source.json` — exact исполнявшиеся новые файлы измерителя, сверенные с
sourceHashes из record. Их можно восстановить по исходным путям в отдельном checkout
указанного baseline, подключив существующие dev-зависимости без копирования. После записи
живой recorder дополнен отказом на untracked product additions; в helper убраны две
JSDoc-аннотации для совместимости с контрактным линтером. Исторические bytes/hash не менялись.

Два лишних типа warning сохранены: DONE placeholder warning в существующем template input
и unreceipted-DONE после stale. Ни один не является причиной exit1, коды ошибок не скрыты.
В протоколе есть явные дополнительные Verify для причинного разделения sync/audit/review:
это baseline workaround, а не рекомендуемый поток.

Первичная квалификация tests была 0/2 из-за двух неверных host expectations (скрытый child
stdout и легитимное downstream exclusion). Они исправлены до этой записи; продукт не
менялся. Повтор 2/2. В дальнейшем tests включают дополнительную проверку integrity записи.
Не перезаписывать record и не пересчитывать его оценки после изменения продукта.

GREEN/evals ещё не начаты. Полный план: [PILOT-VERIFY-PLAN.md](../../docs/PILOT-VERIFY-PLAN.md).
